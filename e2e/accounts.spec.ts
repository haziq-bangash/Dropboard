import { expect, test } from "@playwright/test";

test("without a mail provider the sign-in page hides password reset", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("form").getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText("Forgot password?")).toHaveCount(0);
});

test("a reset link without a token explains that it has expired", async ({ page }) => {
  await page.goto("/reset-password");
  await expect(page.getByRole("heading", { name: /Link expired/ })).toBeVisible();
  await page.getByRole("link", { name: "Back to sign in" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("the reset page rejects mismatched passwords before calling the server", async ({ page }) => {
  await page.goto("/reset-password?token=anything");
  await page.getByLabel("New password").fill("a-brand-new-password");
  await page.getByLabel("Confirm password").fill("something-different");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.locator('[data-slot="alert"]')).toContainText("do not match");
});
