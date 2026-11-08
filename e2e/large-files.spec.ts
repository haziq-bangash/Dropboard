import { expect, test, type Page } from "@playwright/test";
import { createWriteStream, mkdtempSync, rmSync } from "node:fs";
import { once } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import { makeXlsx } from "./xlsx-file";

// Big files must never kill the tab: a spreadsheet is read as a stream, and a file too big to hold becomes a sample or a clear message.

test("a spreadsheet with tens of thousands of rows is read as a stream and becomes a dashboard", async ({ page }) => {
  const rows: (string | number | Date)[][] = [["Date", "Region", "Amount"]];
  const regions = ["North", "South", "East", "West"];
  for (let i = 0; i < 60_000; i++) rows.push([new Date(Date.UTC(2023, 0, 1 + (i % 360))), regions[i % 4], (i * 37) % 1000]);
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', { name: "sales.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: makeXlsx(rows) });
  await expect(page.getByTestId("kpi-value").first()).toHaveText("60,000", { timeout: 60_000 });
  // dates arrive as dates, so there is a chart over time
  await expect(page.getByRole("img", { name: /^Line chart: .* over time/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("sample-notice")).toHaveCount(0);
});

test("a file that is not a real spreadsheet gets a clear message, not a crash", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', { name: "broken.xlsx", mimeType: "application/octet-stream", buffer: Buffer.from("this is not a spreadsheet") });
  await expect(page.locator('[data-slot="alert"]')).toContainText(/xlsx|spreadsheet|CSV/i, { timeout: 30_000 });
});

test.describe("a file too big for the memory the database may use", () => {
  test.describe.configure({ mode: "serial" });
  let dir: string;
  let file: string;
  const ROWS = 1_100_000;

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    dir = mkdtempSync(path.join(tmpdir(), "dropboard-big-"));
    file = path.join(dir, "rows.csv");
    const out = createWriteStream(file);
    out.write("id,name,email,amount,day\n");
    let seed = 5;
    const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    const word = (n: number) => Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(rnd() * 26))).join("");
    for (let r = 1; r <= ROWS; r++) {
      if (!out.write(`${r},${word(12)} ${word(9)},${word(10)}@${word(7)}.com,${(rnd() * 999).toFixed(2)},2023-${String(1 + (r % 12)).padStart(2, "0")}-${String(1 + (r % 28)).padStart(2, "0")}\n`)) await once(out, "drain");
    }
    out.end();
    await once(out, "finish");
  });
  test.afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const limit = (page: Page, value: string) => page.addInitScript((v) => localStorage.setItem("dropboard-memory-limit", v), value);

  test("falls back to a random sample and says so, with how many rows the file has", async ({ page }) => {
    test.setTimeout(180_000);
    await limit(page, "70MB");
    await page.goto("/");
    await page.setInputFiles('input[type="file"]', file);
    const notice = page.getByTestId("sample-notice");
    await expect(notice).toBeVisible({ timeout: 150_000 });
    await expect(notice).toContainText("1,100,000 rows");
    await expect(notice).toContainText(/random sample of [\d,]+ rows/);
    // the dashboard is built from the sample, and its row count says so
    await expect(page.getByTestId("kpi").first()).toContainText("Rows in the sample");
    await expect(page.getByTestId("kpi-value").first()).not.toHaveText("", { timeout: 60_000 });
    const shown = Number((await page.getByTestId("kpi-value").first().innerText()).replace(/,/g, ""));
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(ROWS);
  });

  test("when not even a sample fits, it says what to do instead of dying", async ({ page }) => {
    test.setTimeout(180_000);
    await limit(page, "20MB");
    await page.goto("/");
    await page.setInputFiles('input[type="file"]', file);
    await expect(page.locator('[data-slot="alert"]')).toContainText("too big for your browser", { timeout: 150_000 });
    // the page is still alive: with room again, the next file loads in the same page
    await page.evaluate(() => localStorage.removeItem("dropboard-memory-limit"));
    await page.setInputFiles('input[type="file"]', path.join(__dirname, "fixtures", "sales.csv"));
    await expect(page.getByTestId("kpi-value").first()).toHaveText("500", { timeout: 60_000 });
  });
});
