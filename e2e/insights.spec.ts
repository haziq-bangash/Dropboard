import { expect, test, type Page } from "@playwright/test";
import { signUp } from "./helpers";

async function openSample(page: Page, title: string) {
  await page.goto("/app/new");
  await page.getByTestId("starter").filter({ hasText: title }).click();
  await expect(page).toHaveURL(/\/app\/p\//, { timeout: 30_000 });
  await expect(page.getByTestId("kpi-value").first()).not.toHaveText("", { timeout: 30_000 });
}

const openInsights = async (page: Page) => {
  await page.getByRole("tab", { name: "Insights" }).click();
  await expect(page.getByTestId("insights")).toBeVisible();
};

test("a project has a Dashboard tab and an Insights tab, and starts on the dashboard", async ({ page }) => {
  await signUp(page);
  await openSample(page, "Household spending");
  await expect(page.getByRole("tab", { name: "Dashboard" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Insights" })).toHaveAttribute("aria-selected", "false");
  await expect(page.getByTestId("insights")).toHaveCount(0);
});

test("the Insights tab shows what the household sample really contains: rent is most of the spending", async ({ page }) => {
  await signUp(page);
  await openSample(page, "Household spending");
  await openInsights(page);

  const findings = page.getByTestId("finding");
  await expect(findings.first()).toBeVisible({ timeout: 30_000 });
  await expect(findings.filter({ hasText: /Rent accounts for 5\d% of amount/ })).toHaveCount(1);
  // a short list, each with a kind label and a sentence
  expect(await findings.count()).toBeLessThanOrEqual(8);
  await expect(findings.first().getByText("Share of a total")).toBeVisible();
});

test("the summary tiles describe the data", async ({ page }) => {
  await signUp(page);
  await openSample(page, "Support tickets");
  await openInsights(page);
  const tiles = page.getByTestId("insights");
  await expect(tiles).toContainText("Rows");
  await expect(tiles).toContainText("501");
  await expect(tiles).toContainText("Completeness");
  await expect(tiles).toContainText("100%");
  await expect(tiles).toContainText("Columns");
  await expect(tiles).toContainText("7");
});

test("the support sample shows its built-in relationship: slower resolution, less satisfaction", async ({ page }) => {
  await signUp(page);
  await openSample(page, "Support tickets");
  await openInsights(page);
  const link = page.getByTestId("finding").filter({ hasText: "resolution_hours and satisfaction move in opposite directions" });
  await expect(link).toBeVisible({ timeout: 30_000 });
  await expect(link.getByText("Relationship")).toBeVisible();
});

test("every finding can show how it is known, in plain words", async ({ page }) => {
  await signUp(page);
  await openSample(page, "Support tickets");
  await openInsights(page);
  const first = page.getByTestId("finding").first();
  await expect(first).toBeVisible({ timeout: 30_000 });
  await first.getByText("How we know").click();
  await expect(first).toContainText(/Very unlikely to be chance|Unlikely to be chance|large and clear/);
  await expect(first).toContainText(/Correlation -?\d/);
});

test("data with nothing in it gets an honest 'nothing stands out', not an invented finding", async ({ page }) => {
  await signUp(page);
  // 300 rows of unrelated numbers from a fixed generator, so the same rows every run
  let seed = 7;
  const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const csv = "a,b,c\n" + Array.from({ length: 300 }, () => `${(next() * 100).toFixed(1)},${(next() * 100).toFixed(1)},${(next() * 100).toFixed(1)}`).join("\n") + "\n";
  await page.goto("/app/new");
  await page.setInputFiles('input[type="file"]', { name: "noise.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page).toHaveURL(/\/app\/p\//, { timeout: 30_000 });
  await openInsights(page);
  await expect(page.getByTestId("no-findings")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("no-findings")).toContainText("Nothing stands out");
  await expect(page.getByTestId("finding")).toHaveCount(0);
});

test("switching back and forth keeps both tabs working, and the findings survive a reload from the saved copy", async ({ page }) => {
  await signUp(page);
  await openSample(page, "Support tickets");
  await openInsights(page);
  await expect(page.getByTestId("finding").first()).toBeVisible({ timeout: 30_000 });

  await page.getByRole("tab", { name: "Dashboard" }).click();
  await expect(page.getByTestId("kpi-value").first()).not.toHaveText("");
  await page.getByRole("tab", { name: "Insights" }).click();
  await expect(page.getByTestId("finding").first()).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("kpi-value").first()).not.toHaveText("", { timeout: 30_000 });
  await openInsights(page);
  await expect(page.getByTestId("finding").first()).toBeVisible({ timeout: 30_000 });
});

test("the findings never leave the browser: opening the tab makes no request that carries data", async ({ page }) => {
  await signUp(page);
  await openSample(page, "Household spending");
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET") posts.push(r.url());
  });
  await openInsights(page);
  await expect(page.getByTestId("finding").first()).toBeVisible({ timeout: 30_000 });
  expect(posts.filter((u) => /\/api\/ai\//.test(u))).toEqual([]);
  expect(posts).toEqual([]);
});
