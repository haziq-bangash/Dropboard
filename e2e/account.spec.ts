import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import { signUp } from "./helpers";

const PASSWORD = "correct-horse-battery";

async function openAccount(page: Page) {
  await page.getByRole("link", { name: "Account", exact: true }).first().click();
  await expect(page).toHaveURL(/\/app\/account$/);
  await expect(page.getByRole("heading", { name: /Your account/ })).toBeVisible();
}

async function signInAgain(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.locator("form").getByRole("button", { name: "Sign in" }).click();
}

test("the account page shows the plan and what is used", async ({ page }) => {
  await signUp(page);
  await openAccount(page);
  const usage = page.getByTestId("plan-usage");
  await expect(usage).toContainText("Projects");
  await expect(page.getByRole("progressbar", { name: "Projects used" })).toHaveAttribute("aria-valuenow", "0");
  await expect(page.getByRole("progressbar", { name: "Projects used" })).toHaveAttribute("aria-valuemax", "3");
  await expect(page.getByRole("progressbar", { name: "Published links used" })).toHaveAttribute("aria-valuemax", "3");
  await expect(page.getByRole("progressbar", { name: "Pilot requests today used" })).toHaveAttribute("aria-valuemax", "10");
  await expect(page.locator("[data-slot=badge]", { hasText: /^Free$/ })).toBeVisible();
});

test("the name can be changed and stays changed", async ({ page }) => {
  await signUp(page);
  await openAccount(page);
  await page.getByLabel("Name", { exact: true }).fill("Priya Shah");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Priya Shah");
});

test("without email sending, an email change is not offered", async ({ page }) => {
  const email = await signUp(page);
  await openAccount(page);
  await expect(page.getByTestId("current-email")).toHaveText(email);
  await expect(page.getByText("Changing the email needs email sending")).toBeVisible();
  await expect(page.getByLabel("New email")).toHaveCount(0);
});

test("a password change needs the right current password, then only the new one signs in", async ({ page }) => {
  const email = await signUp(page);
  await openAccount(page);

  await page.getByLabel("Current password").fill("not-my-password");
  await page.getByLabel("New password", { exact: true }).fill("a-brand-new-password");
  await page.getByLabel("Confirm new password").fill("a-brand-new-password");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.locator('[data-slot="alert"]').filter({ hasText: /password/i })).toBeVisible();

  await page.getByLabel("Current password").fill(PASSWORD);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Password changed.")).toBeVisible();

  await page.getByLabel("Current password").fill("a-brand-new-password");
  await page.getByLabel("New password", { exact: true }).fill("something-else-entirely");
  await page.getByLabel("Confirm new password").fill("does-not-match-at-all");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("The two new passwords do not match.")).toBeVisible();

  await page.getByRole("button", { name: new RegExp(email) }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/");
  await signInAgain(page, email, PASSWORD);
  await expect(page.locator('[data-slot="alert"]')).toBeVisible();
  await signInAgain(page, email, "a-brand-new-password");
  await expect(page).toHaveURL(/\/app$/);
});

test("the data download holds the account and projects, without rows or secrets", async ({ page }) => {
  const email = await signUp(page);
  await page.goto("/app/new");
  await page.getByTestId("starter").first().click();
  await expect(page).toHaveURL(/\/app\/p\//, { timeout: 30_000 });
  await page.getByRole("link", { name: "Account", exact: true }).first().click();

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download my data" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^dropboard-export-\d{4}-\d\d-\d\d\.json$/);
  const text = fs.readFileSync((await download.path())!, "utf8");
  const data = JSON.parse(text);
  expect(data.account.email).toBe(email);
  expect(data.projects).toHaveLength(1);
  expect(data.projects[0].title).toBe("Online store orders");
  expect(data.note).toContain("never stored");
  expect(text).not.toMatch(/passwordHash|"password"|scrypt|accessToken/i);
});

test("removing saved copies from this device makes a project ask for its file again", async ({ page }) => {
  await signUp(page);
  await page.goto("/app/new");
  await page.getByTestId("starter").first().click();
  await expect(page).toHaveURL(/\/app\/p\//, { timeout: 30_000 });
  await expect(page.getByTestId("device-data")).toContainText("Kept on this device only");
  await page.getByRole("link", { name: "Account", exact: true }).first().click();
  await page.getByRole("button", { name: "Remove saved copies from this device" }).click();
  await expect(page.getByText("Removed from this device.")).toBeVisible();

  await page.goto("/app");
  await page.getByTestId("project-card").first().click();
  await expect(page.getByText("Attach your file to open this dashboard")).toBeVisible();
});

test("signing out of other devices ends their sessions", async ({ page, browser }) => {
  const email = await signUp(page);
  const other = await (await browser.newContext()).newPage();
  await signInAgain(other, email, PASSWORD);
  await expect(other).toHaveURL(/\/app$/);

  await openAccount(page);
  await expect(page.getByTestId("sessions").locator("li")).toHaveCount(2);
  await expect(page.getByTestId("sessions")).toContainText("This device");
  await page.getByRole("button", { name: "Sign out of other devices" }).click();
  await expect(page.getByTestId("sessions").locator("li")).toHaveCount(1);

  // the other device is signed out the next time it asks
  await other.reload();
  await expect(other.getByText("Your session has ended")).toBeVisible();
  await other.context().close();
});

test("deleting the account needs the password, removes everything, and the sign-in stops working", async ({ page }) => {
  const email = await signUp(page);
  await page.goto("/app/new");
  await page.getByTestId("starter").first().click();
  await expect(page).toHaveURL(/\/app\/p\//, { timeout: 30_000 });
  await page.getByRole("link", { name: "Account", exact: true }).first().click();

  await page.getByRole("button", { name: "Delete my account" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Password").fill("not-my-password");
  await dialog.getByRole("button", { name: "Delete everything" }).click();
  await expect(dialog.locator('[data-slot="alert"]')).toBeVisible();
  await expect(page).toHaveURL(/\/app\/account$/);

  await dialog.getByLabel("Password").fill(PASSWORD);
  await dialog.getByRole("button", { name: "Delete everything" }).click();
  await expect(page).toHaveURL("/", { timeout: 30_000 });

  await signInAgain(page, email, PASSWORD);
  await expect(page.locator('[data-slot="alert"]')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("the account menu leads to the account page", async ({ page }) => {
  const email = await signUp(page);
  await page.getByRole("button", { name: new RegExp(email) }).click();
  await page.getByRole("menuitem", { name: "Account" }).click();
  await expect(page).toHaveURL(/\/app\/account$/);
  await expect(page.getByRole("heading", { name: /Your account/ })).toBeVisible();
});
