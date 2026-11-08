import { expect, test, type Page } from "@playwright/test";
import { ordersWithErrors, signUp } from "./helpers";

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

test("the story reads the same on every visit and sends nothing anywhere", async ({ page, browserName }) => {
  // Playwright's WebKit has no private storage (OPFS), as in a private window: the app then asks for the file again, which is its fallback
  test.skip(browserName === "webkit", "a saved copy needs the browser's private storage");
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
  // the headline and the small tags saying what the story is made of are in sentence case, never forced into capitals
  const headline = page.getByTestId("story-headline");
  await expect(headline).toBeVisible({ timeout: 30_000 });
  expect(await headline.evaluate((el) => getComputedStyle(el).textTransform)).toBe("none");
  const tag = page.getByRole("list", { name: "What this story is made of" }).getByRole("listitem").first();
  await expect(tag).toBeVisible();
  expect(await tag.evaluate((el) => getComputedStyle(el).textTransform)).toBe("none");
});

test("Pilot can write the story from numbers only, and the real names are put back in the browser", async ({ page }) => {
  await signUp(page);
  await openSample(page, "Household spending");
  await openStory(page);
  await expect(page.getByTestId("story-headline")).toBeVisible({ timeout: 30_000 });

  // the category that dominates, as the plain story names it
  const plain = await page.getByTestId("story").innerText();
  const label = plain.match(/\n([^\n]+?) accounts for most of amount/)?.[1];
  expect(label).toBeTruthy();

  let sent = "";
  await page.route("**/api/ai/narrate", (route) => {
    sent = route.request().postData() ?? "";
    const { findings } = JSON.parse(sent) as { findings: { id: string; columns: string[]; tokens: string[] }[] };
    const items = findings.map((f) => ({
      id: f.id,
      headline: f.tokens.includes("{label}") ? "{label} carries the spending" : `About ${f.columns.join(" and ")}`,
      sentence: f.tokens.includes("{label}") ? "{label} is where most of it goes." : "This is worth a closer look.",
      next: "Check whether that is expected.",
    }));
    return route.fulfill({ json: { items, remaining: 7 } });
  });

  await page.getByRole("button", { name: "Write this with Pilot" }).click();
  await expect(page.getByText("7 requests left today")).toBeVisible();
  await expect(page.getByTestId("story")).toContainText(`${label} carries the spending`);
  await expect(page.getByTestId("story")).toContainText(`${label} is where most of it goes.`);
  await expect(page.getByTestId("story")).toContainText("The wording was written by Pilot");

  // privacy: numbers and placeholders went out, the category name and the dates did not
  expect(sent).toContain("{label}");
  expect(sent).not.toContain(label!);
  expect(sent).not.toMatch(/20\d\d/);
});

test("when Pilot's story cannot be written, the plain story stays and the person is told", async ({ page }) => {
  await signUp(page);
  await openSample(page, "Household spending");
  await openStory(page);
  await expect(page.getByTestId("story-headline")).toBeVisible({ timeout: 30_000 });
  const before = await page.getByTestId("story-headline").innerText();
  await page.route("**/api/ai/narrate", (route) => route.fulfill({ status: 502, json: { error: "The assistant could not produce a usable result. Try rephrasing." } }));
  await page.getByRole("button", { name: "Write this with Pilot" }).click();
  await expect(page.locator('[data-slot="alert"]')).toBeVisible();
  await expect(page.getByTestId("story-headline")).toHaveText(before);
});

test("rows that were keyed in wrongly are listed with why, and nothing from those rows goes to Pilot", async ({ page }) => {
  await signUp(page);
  await page.goto("/app/new");
  await page.setInputFiles('input[type="file"]', { name: "orders.csv", mimeType: "text/csv", buffer: Buffer.from(ordersWithErrors()) });
  await expect(page).toHaveURL(/\/app\/p\//, { timeout: 30_000 });
  await expect(page.getByTestId("kpi-value").first()).not.toHaveText("", { timeout: 30_000 });

  await page.getByRole("tab", { name: "Insights" }).click();
  const finding = page.getByTestId("finding").filter({ hasText: /rows \(.*\) stand out from the rest/ });
  await expect(finding).toBeVisible({ timeout: 30_000 });
  await expect(finding).toContainText("unusually high");
  const table = finding.getByTestId("finding-details");
  await expect(table).toContainText("Why");
  await expect(table.getByRole("region")).toBeVisible();
  // the wrong rows are in the list, with their real values, on this screen
  await expect(table).toContainText("900");

  // the story is written from numbers and placeholders: no value from any row is in what goes out
  await page.getByRole("tab", { name: "Story" }).click();
  await expect(page.getByTestId("story-headline")).toBeVisible({ timeout: 30_000 });
  let sent = "";
  await page.route("**/api/ai/narrate", (route) => {
    sent = route.request().postData() ?? "";
    const { findings } = JSON.parse(sent) as { findings: { id: string }[] };
    return route.fulfill({ json: { items: findings.map((f) => ({ id: f.id, headline: "A finding", sentence: "Worth a look.", next: "Check it." })), remaining: 5 } });
  });
  await page.getByRole("button", { name: "Write this with Pilot" }).click();
  await expect(page.getByText(/requests? left today/)).toBeVisible();
  expect(sent).toContain("unusualrows");
  expect(sent).not.toContain("900");
  expect(sent).not.toContain("details");
});
