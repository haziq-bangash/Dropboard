import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const CSV = path.join(__dirname, "fixtures", "sales.csv");

async function signUp(page: Page) {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
  await page.goto("/login");
  await page.getByRole("button", { name: "No account? Sign up" }).click();
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder(/Password/).fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page.getByText(email)).toBeVisible();
  return email;
}

async function publish(page: Page, password?: string) {
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', CSV);
  await expect(page.locator(".kpi .value").first()).toHaveText("500", { timeout: 30_000 });
  if (password) await page.getByPlaceholder(/Optional link password/).fill(password);
  await page.getByRole("button", { name: "Publish link" }).click();
  const link = page.locator(".publish a");
  await expect(link).toBeVisible({ timeout: 30_000 });
  return (await link.textContent())!;
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
  await expect(view.locator(".kpi .value").first()).toHaveText("500");
  await expect(view.locator(".card canvas").first()).toBeVisible();
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
  await expect(view.getByText("password protected")).toBeVisible();
  await expect(view.locator(".kpi")).toHaveCount(0);

  await view.getByPlaceholder("Password").fill("wrong-password");
  await view.getByRole("button", { name: "View dashboard" }).click();
  await expect(view.getByText("Wrong password.")).toBeVisible();

  await view.getByPlaceholder("Password").fill("open-sesame");
  await view.getByRole("button", { name: "View dashboard" }).click();
  await expect(view.locator(".kpi .value").first()).toHaveText("500");
  await stranger.close();
});

test("unknown share link is a 404", async ({ page }) => {
  const res = await page.goto("/s/does-not-exist");
  expect(res?.status()).toBe(404);
});

test("publish requires sign-in", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', CSV);
  await expect(page.locator(".kpi .value").first()).toHaveText("500", { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Publish link" })).toHaveCount(0);
  await expect(page.getByText("to publish a shareable link")).toBeVisible();
});
