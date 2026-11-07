import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const CSV = path.join(__dirname, "fixtures", "sales.csv");

export async function signUp(page: Page) {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
  await page.goto("/login");
  await page.getByRole("button", { name: "No account? Sign up" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await expect(page.getByText(email)).toBeVisible();
  return email;
}

async function publish(page: Page, password?: string) {
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', CSV);
  await expect(page.getByTestId("kpi-value").first()).toHaveText("500", { timeout: 30_000 });
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Search engine indexing")).toBeVisible();
  if (password) {
    await dialog.getByRole("switch", { name: "Password protection" }).click();
    await dialog.getByLabel("Link password").fill(password);
  }
  await dialog.getByRole("button", { name: "Create link" }).click();
  const link = dialog.getByTestId("share-link");
  await expect(link).toBeVisible({ timeout: 30_000 });
  return await link.inputValue();
}

test("sign in, publish a snapshot, and a stranger can view it without rows", async ({ page, browser }) => {
  await signUp(page);
  const url = await publish(page);
  expect(url).toMatch(/\/s\/[\w-]+$/);

  // A logged-out visitor in a fresh context
  const stranger = await browser.newContext();
  const view = await stranger.newPage();
  const res = await view.goto(url);
  expect(res?.status()).toBe(200);
  await expect(view.getByRole("heading", { name: "sales", exact: true })).toBeVisible();
  await expect(view.getByTestId("kpi-value").first()).toHaveText("500");
  await expect(view.getByTestId("chart-card").locator("canvas").first()).toBeVisible();
  // Raw-row preview must not be shared
  await expect(view.getByText("Data preview")).toHaveCount(0);
  await expect(view.locator("table")).toHaveCount(0);
  // Not indexable
  await expect(view.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await stranger.close();
});

test("password-protected link asks for the password", async ({ page, browser }) => {
  await signUp(page);
  const url = await publish(page, "open-sesame");

  const stranger = await browser.newContext();
  const view = await stranger.newPage();
  await view.goto(url);
  await expect(view.getByText("Password protected")).toBeVisible();
  await expect(view.getByTestId("kpi")).toHaveCount(0);

  await view.getByLabel("Password").fill("wrong-password");
  await view.getByRole("button", { name: "View dashboard" }).click();
  await expect(view.locator('[data-slot="alert"]')).toContainText("Wrong password.");

  await view.getByLabel("Password").fill("open-sesame");
  await view.getByRole("button", { name: "View dashboard" }).click();
  await expect(view.getByTestId("kpi-value").first()).toHaveText("500");
  await stranger.close();
});

test("unknown share link is a 404", async ({ page }) => {
  const res = await page.goto("/s/does-not-exist");
  expect(res?.status()).toBe(404);
});

test("publish requires sign-in", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', CSV);
  await expect(page.getByTestId("kpi-value").first()).toHaveText("500", { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toHaveCount(0);
  await expect(page.getByText("to publish a shareable link")).toBeVisible();
});
