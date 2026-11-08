import { expect, test, type Page } from "@playwright/test";
import { signUp } from "./helpers";

async function openSample(page: Page, title: string) {
  await page.goto("/app/new");
  await page.getByTestId("starter").filter({ hasText: title }).click();
  await expect(page).toHaveURL(/\/app\/p\//, { timeout: 30_000 });
  await expect(page.getByTestId("kpi-value").first()).not.toHaveText("", { timeout: 30_000 });
}

const openStory = async (page: Page) => {
  await page.getByRole("tab", { name: "Story" }).click();
  await expect(page.getByTestId("story")).toBeVisible();
};

test("the Story tab leads with the strongest finding, in words and a big figure", async ({ page }) => {
  await signUp(page);
  await openSample(page, "Support tickets");
  await openStory(page);

  await expect(page.getByTestId("story-headline")).toHaveText("resolution_hours and satisfaction move in opposite directions", { timeout: 30_000 });
  await expect(page.getByTestId("story")).toContainText("501 rows and 7 columns, read in your browser");
  const figures = page.getByTestId("story-figure");
  await expect(figures.first()).toContainText("r = -0.79");
  await expect(figures.first()).toContainText("correlation");
  await expect(page.getByTestId("story")).toContainText("Look next: A relationship is not a cause.");
});

test("it tells more than one thing when there is more to tell, and says each suggestion only once", async ({ page }) => {
  await signUp(page);
  await openSample(page, "Marketing performance");
  await openStory(page);
  await expect(page.getByTestId("story-headline")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("story-figure")).toHaveCount(3);
  await expect(page.getByTestId("story-chapter").first()).toBeVisible();
  const text = await page.getByTestId("story").innerText();
  expect(text).not.toMatch(/undefined|NaN/);
  // the three findings are all relationships, so the same advice would repeat: it appears exactly once
  const advice = text.match(/Look next: [^\n]+/g) ?? [];
  expect(advice).toHaveLength(1);
  expect(new Set(advice).size).toBe(advice.length);
});

test("different kinds of finding each get their own suggestion", async ({ page }) => {
  await signUp(page);
  await openSample(page, "Household spending");
  await openStory(page);
  await expect(page.getByTestId("story-headline")).toBeVisible({ timeout: 30_000 });
  const text = await page.getByTestId("story").innerText();
  const advice = text.match(/Look next: [^\n]+/g) ?? [];
  expect(advice.length).toBeGreaterThanOrEqual(1);
  expect(new Set(advice).size).toBe(advice.length); // never the same advice twice
});

test("it says plainly that it describes patterns and does not explain them", async ({ page }) => {
  await signUp(page);
  await openSample(page, "Household spending");
  await openStory(page);
  await expect(page.getByTestId("story-headline")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("story")).toContainText("It describes patterns in this data; it does not explain them.");
  await expect(page.getByTestId("story")).toContainText("accounts for most of amount");
});

test("data with nothing in it gets 'no story to tell yet', not an invented one", async ({ page }) => {
  await signUp(page);
  let seed = 7;
  const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const csv = "a,b,c\n" + Array.from({ length: 300 }, () => `${(next() * 100).toFixed(1)},${(next() * 100).toFixed(1)},${(next() * 100).toFixed(1)}`).join("\n") + "\n";
  await page.goto("/app/new");
  await page.setInputFiles('input[type="file"]', { name: "noise.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page).toHaveURL(/\/app\/p\//, { timeout: 30_000 });
  await openStory(page);
  await expect(page.getByTestId("no-story")).toContainText("There is no story to tell yet", { timeout: 30_000 });
  await expect(page.getByTestId("story-headline")).toHaveCount(0);
});

test("the story reads the same on every visit and sends nothing anywhere", async ({ page }) => {
  await signUp(page);
  await openSample(page, "Support tickets");
  const requests: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET") requests.push(r.url());
  });
  await openStory(page);
  await expect(page.getByTestId("story-headline")).toBeVisible({ timeout: 30_000 });
  const first = await page.getByTestId("story").innerText();

  await page.reload();
  await expect(page.getByTestId("kpi-value").first()).not.toHaveText("", { timeout: 30_000 });
  await openStory(page);
  await expect(page.getByTestId("story-headline")).toBeVisible({ timeout: 30_000 });
  expect(await page.getByTestId("story").innerText()).toBe(first);
  expect(requests).toEqual([]);
});

test("the tab order is Dashboard, Insights, Story, and no capitals are forced on the story", async ({ page }) => {
  await signUp(page);
  await openSample(page, "Support tickets");
  await expect(page.getByRole("tab")).toHaveText(["Dashboard", "Insights", "Story"]);
  await openStory(page);
  const eyebrow = page.getByText("Data story", { exact: true });
  await expect(eyebrow).toBeVisible({ timeout: 30_000 });
  expect(await eyebrow.evaluate((el) => getComputedStyle(el).textTransform)).toBe("none");
});
