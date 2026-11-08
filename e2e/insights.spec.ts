import { expect, test, type Page } from "@playwright/test";
import { companiesByYear, messyExport, ordersWithBigCustomers, signUp } from "./helpers";

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

test("a file with three years of monthly sales shows its yearly pattern, and repeated rows are called out", async ({ page }) => {
  await signUp(page);
  // sales that peak every December and dip every July, one row a day, with every 20th row copied
  let seed = 3;
  const noise = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296 - 0.5) * 30;
  const lines = ["date,sales"];
  for (let d = 0; d < 1095; d++) {
    const date = new Date(Date.UTC(2022, 0, 1 + d));
    const month = date.getUTCMonth();
    const sales = Math.round(300 + (month === 11 ? 220 : 0) + (month === 6 ? -140 : 0) + noise());
    const line = `${date.toISOString().slice(0, 10)},${sales}`;
    lines.push(line);
    if (d % 20 === 0) lines.push(line);
  }
  await page.goto("/app/new");
  await page.setInputFiles('input[type="file"]', { name: "seasonal.csv", mimeType: "text/csv", buffer: Buffer.from(lines.join("\n") + "\n") });
  await expect(page).toHaveURL(/\/app\/p\//, { timeout: 30_000 });
  await expect(page.getByTestId("kpi-value").first()).not.toHaveText("", { timeout: 30_000 });
  await page.getByRole("tab", { name: "Insights" }).click();
  const findings = page.getByTestId("finding");
  await expect(findings.filter({ hasText: "yearly pattern" })).toContainText("highest in December, lowest in July", { timeout: 30_000 });
  await expect(findings.filter({ hasText: "exact copies" })).toContainText("5%");
});

test("a table of companies by year gets findings about the companies themselves, not about totals", async ({ page }) => {
  await signUp(page);
  await page.goto("/app/new");
  await page.setInputFiles('input[type="file"]', { name: "financials.csv", mimeType: "text/csv", buffer: Buffer.from(companiesByYear()) });
  await expect(page).toHaveURL(/\/app\/p\//, { timeout: 30_000 });
  await expect(page.getByTestId("kpi-value").first()).not.toHaveText("", { timeout: 30_000 });
  await openInsights(page);
  const findings = page.getByTestId("finding");
  await expect(findings.filter({ hasText: "has the largest Revenue in 2023" })).toBeVisible({ timeout: 30_000 });
  await expect(findings.filter({ hasText: /Flint's Revenue fell about \d+% between 2014 and 2023/ })).toBeVisible();
  // never a claim about a year being a measure, or about a pooled average of a rate
  await expect(page.getByTestId("insights")).not.toContainText(/Year (rose|fell)|Average ROE (rose|fell)/);
  await page.getByRole("tab", { name: "Story" }).click();
  await expect(page.getByTestId("story-headline")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("story")).not.toContainText(/NaN|undefined/);
});

test("problems in the file are listed in one Data quality card, with what to fix", async ({ page }) => {
  await signUp(page);
  await page.goto("/app/new");
  await page.setInputFiles('input[type="file"]', { name: "export.csv", mimeType: "text/csv", buffer: Buffer.from(messyExport()) });
  await expect(page).toHaveURL(/\/app\/p\//, { timeout: 30_000 });
  await expect(page.getByTestId("kpi-value").first()).not.toHaveText("", { timeout: 30_000 });
  await openInsights(page);
  const card = page.getByTestId("finding").filter({ hasText: /things? in the data change/ });
  await expect(card).toBeVisible({ timeout: 30_000 });
  const table = card.getByTestId("finding-details");
  await expect(table).toContainText("are the same value written two ways");
  await expect(table).toContainText("stands for missing");
  await expect(table).toContainText("Stored as text");
  await expect(card).toContainText("Data quality");
});

test("a few customers holding most of the money, and one product far above the rest, are reported", async ({ page }) => {
  await signUp(page);
  await page.goto("/app/new");
  await page.setInputFiles('input[type="file"]', { name: "orders.csv", mimeType: "text/csv", buffer: Buffer.from(ordersWithBigCustomers()) });
  await expect(page).toHaveURL(/\/app\/p\//, { timeout: 30_000 });
  await expect(page.getByTestId("kpi-value").first()).not.toHaveText("", { timeout: 30_000 });
  await openInsights(page);
  const findings = page.getByTestId("finding");
  await expect(findings.filter({ hasText: /The top 20% of customer_id \(\d+ of \d+\) account for \d+% of amount/ })).toBeVisible({ timeout: 30_000 });
  await expect(findings.filter({ hasText: "Product 7 has the highest total amount" })).toBeVisible();
});
