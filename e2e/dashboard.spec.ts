import { expect, test } from "@playwright/test";
import path from "node:path";

test("landing page shows the marketing sections and the drop zone", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Turn any spreadsheet into a dashboard");
  await expect(page.getByText("Processed in your browser. Your rows are never uploaded.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Everything you need to understand a spreadsheet" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ask your data in plain English" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ready to begin?" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();
});

test("csv upload builds a dashboard in the browser", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (r) => requests.push(`${r.method()} ${r.url()}`));

  await page.goto("/");
  await page.setInputFiles('input[type="file"]', path.join(__dirname, "fixtures", "sales.csv"));

  await expect(page.getByRole("heading", { name: "sales", exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Rows", { exact: true })).toBeVisible();
  await expect(page.getByTestId("kpi-value").first()).toHaveText("500");
  await expect(page.getByTestId("chart-card").locator("canvas").first()).toBeVisible();
  await expect(page.locator('[data-slot="alert"]')).toHaveCount(0);
  // Marketing content is replaced by the dashboard
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(0);

  // Privacy: the file contents must never be sent anywhere
  expect(requests.filter((r) => r.startsWith("POST"))).toEqual([]);
});

test("rejects unsupported files", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', { name: "x.pdf", mimeType: "application/pdf", buffer: Buffer.from("x") });
  await expect(page.locator('[data-slot="alert"]')).toContainText("Unsupported file type");
});

test("ndjson upload works", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', path.join(__dirname, "fixtures", "items.ndjson"));
  await expect(page.getByRole("heading", { name: "items", exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("kpi-value").first()).toHaveText("3");
});

test("dates and sums are shown as people expect", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', path.join(__dirname, "fixtures", "sales.csv"));
  await expect(page.getByTestId("kpi-value").first()).toHaveText("500", { timeout: 30_000 });
  // sum() of an integer column arrives as a DECIMAL and should be formatted like any other number
  await expect(page.getByText("2,495", { exact: true })).toBeVisible();
  // the date column is shown as a date, not epoch milliseconds
  await expect(page.getByRole("cell", { name: /^2025-\d\d-\d\d$/ }).first()).toBeVisible();
});
