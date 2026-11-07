import { expect, test } from "@playwright/test";
import path from "node:path";

test("csv upload builds a dashboard in the browser", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (r) => requests.push(`${r.method()} ${r.url()}`));

  await page.goto("/");
  await page.setInputFiles('input[type="file"]', path.join(__dirname, "fixtures", "sales.csv"));

  await expect(page.getByRole("heading", { name: "sales", exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Rows", { exact: true })).toBeVisible();
  await expect(page.locator(".kpi .value").first()).toHaveText("500");
  await expect(page.locator(".card canvas").first()).toBeVisible();
  await expect(page.locator(".error")).toHaveCount(0);

  // Privacy: the file contents must never be sent anywhere
  expect(requests.filter((r) => r.startsWith("POST"))).toEqual([]);
});

test("rejects unsupported files", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', { name: "x.pdf", mimeType: "application/pdf", buffer: Buffer.from("x") });
  await expect(page.locator(".error")).toContainText("Unsupported file type");
});

test("ndjson upload works", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', path.join(__dirname, "fixtures", "items.ndjson"));
  await expect(page.getByRole("heading", { name: "items", exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".kpi .value").first()).toHaveText("3");
});
