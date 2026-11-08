import { expect, test, type Page } from "@playwright/test";
import { signUp } from "./helpers";

/** A small fixed random source, so every run uploads the same file. */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

/** Orders by customers who join in different months; those who join in the second half come back much less. */
function ordersByCustomers(): string {
  const r = seeded(7);
  const rows = ["order_id,order_date,customer_id,amount"];
  let order = 1;
  for (let c = 1; c <= 1200; c++) {
    const join = Math.floor(r() * 12);
    const p = join < 6 ? 0.5 : 0.18;
    let active = true;
    for (let m = join; m < 12; m++) {
      if (m > join) active = r() < p * 0.92 ** (m - join - 1);
      if (!active) continue;
      const days = new Date(Date.UTC(2023, m + 1, 0)).getUTCDate();
      const date = new Date(Date.UTC(2023, m, 1 + Math.floor(r() * days))).toISOString().slice(0, 10);
      rows.push(`${order++},${date},C${String(c).padStart(5, "0")},${(20 + r() * 80).toFixed(2)}`);
    }
  }
  return rows.join("\n") + "\n";
}

/** Reviews with a free-text comment; a quarter mention the delivery. */
function reviews(): string {
  const r = seeded(11);
  const topics = ["the battery lasts all day", "the screen is bright and sharp", "the strap feels cheap", "setup took five minutes", "support answered quickly", "the case scratches easily"];
  const rows = ["review_id,product,rating,comment"];
  for (let i = 1; i <= 600; i++) {
    const body = r() < 0.25 ? "delivery was late and the box arrived damaged" : topics[Math.floor(r() * topics.length)];
    rows.push(`${i},${["Watch", "Speaker", "Phone"][i % 3]},${1 + Math.floor(r() * 5)},"I think ${body}. Order ref ${1000 + Math.floor(r() * 9000)}"`);
  }
  return rows.join("\n") + "\n";
}

async function upload(page: Page, name: string, csv: string) {
  await page.goto("/app/new");
  await page.setInputFiles('input[type="file"]', { name, mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page).toHaveURL(/\/app\/p\//, { timeout: 30_000 });
  await expect(page.getByTestId("kpi-value").first()).not.toHaveText("", { timeout: 30_000 });
}

test("orders by customers show who comes back: a cohort chart, the share that returned, and newer cohorts staying less", async ({ page }) => {
  test.setTimeout(90_000);
  await signUp(page);
  await upload(page, "orders.csv", ordersByCustomers());

  const card = page.getByTestId("chart-card").filter({ hasText: "active again, by first month" });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.locator("canvas").first()).toBeVisible();

  await page.getByRole("tab", { name: "Insights" }).click();
  const findings = page.getByTestId("finding");
  await expect(findings.filter({ hasText: /were active again in a later month/ })).toBeVisible({ timeout: 30_000 });
  const trend = findings.filter({ hasText: "stay less" });
  await expect(trend).toBeVisible();
  await expect(trend).toContainText("Staying power");
});

test("a column of comments gets a chart of its common words and a finding that says what it is", async ({ page }) => {
  test.setTimeout(90_000);
  await signUp(page);
  await upload(page, "reviews.csv", reviews());

  const card = page.getByTestId("chart-card").filter({ hasText: "Most common words in comment" });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.locator("canvas").first()).toBeVisible();

  await page.getByRole("tab", { name: "Insights" }).click();
  const finding = page.getByTestId("finding").filter({ hasText: "comment is free text" });
  await expect(finding).toBeVisible({ timeout: 30_000 });
  await expect(finding).toContainText("delivery");
  await expect(finding).toContainText("Free text");
});
