import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("the header has a Product menu and a Trust center link", async ({ page, isMobile }) => {
  test.skip(isMobile, "a phone has one menu instead");
  await page.goto("/");
  const nav = page.getByRole("banner");
  await expect(nav.getByRole("link", { name: "Trust center" })).toHaveAttribute("href", "/trust");
  await nav.getByRole("button", { name: "Product" }).click();
  for (const item of ["Features", "How it works", "Pilot", "Privacy by design"]) await expect(page.getByRole("menuitem", { name: item })).toBeVisible();
  await page.getByRole("menuitem", { name: "How it works" }).click();
  await expect(page).toHaveURL(/#how$/);
});

test("on a phone one menu holds every page", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("banner").getByRole("button", { name: "Menu", exact: true }).click();
  for (const item of ["Features", "How it works", "Pilot", "Privacy by design", "Trust center", "Privacy policy", "Terms of use"]) await expect(page.getByRole("menuitem", { name: item })).toBeVisible();
  await page.getByRole("menuitem", { name: "Trust center" }).click();
  await expect(page).toHaveURL(/\/trust$/);
  await context.close();
});

test("a signed-in person sees an avatar with their name and email, not their email in the bar", async ({ page }) => {
  const email = await signUp(page);
  await page.goto("/");
  const bar = page.getByRole("banner");
  await expect(bar.getByRole("button", { name: "Account menu" })).toBeVisible();
  // the email is not written in the bar itself, only inside the menu
  await expect(bar.getByText(email)).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "Open app" })).toBeVisible();
  await bar.getByRole("button", { name: "Account menu" }).click();
  await expect(page.getByRole("menu").getByText(email)).toBeVisible();
  for (const item of ["Open app", "Account", "Sign out"]) await expect(page.getByRole("menuitem", { name: item })).toBeVisible();
  const avatar = bar.getByRole("button", { name: "Account menu" });
  expect(await avatar.evaluate((el) => getComputedStyle(el).textTransform)).toBe("none");
});

test("the avatar menu leads to the account page and signs out", async ({ page }) => {
  await signUp(page);
  await page.goto("/");
  await page.getByRole("banner").getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Account" }).click();
  await expect(page).toHaveURL(/\/app\/account$/);

  await page.goto("/");
  await page.getByRole("banner").getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("banner").getByRole("button", { name: "Sign in" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("banner").getByRole("button", { name: "Account menu" })).toHaveCount(0);
});

test("the header and its open menus pass the accessibility checks", async ({ page, isMobile }) => {
  test.skip(isMobile, "checked at desktop width");
  await signUp(page);
  await page.goto("/");
  await page.getByRole("banner").getByRole("button", { name: "Account menu" }).click();
  await page.waitForTimeout(500);
  // the header and the menu opened from it; the page below has its own entrance animations, which axe would catch halfway
  const results = await new AxeBuilder({ page }).include("header").include("[role=menu]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 120)}`)).toEqual([]);
});
