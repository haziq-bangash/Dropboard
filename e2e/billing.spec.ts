import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { grantPlan, signUp, withDatabase } from "./helpers";

// Stripe is not configured when the tests run, so paid plans cannot be bought: that is the state a visitor sees until billing is switched
// on. Paid features are tested by putting an account on a paid plan directly, which is what Stripe's message does after a checkout.

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

async function supportProject(page: Page) {
  await page.goto("/app/new");
  await page.getByTestId("starter").filter({ hasText: "Support tickets" }).click();
  await expect(page).toHaveURL(/\/app\/p\//, { timeout: 30_000 });
  await expect(page.getByTestId("kpi-value").first()).not.toHaveText("", { timeout: 30_000 });
  await expect(page.getByTestId("chart-card").first().locator("canvas").first()).toBeVisible({ timeout: 30_000 });
}

async function publish(page: Page, expiry?: string) {
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const dialog = page.getByRole("dialog");
  if (expiry) await dialog.getByLabel("Link expires").selectOption(expiry);
  await dialog.getByRole("button", { name: "Create link" }).click();
  const link = dialog.getByTestId("share-link");
  await expect(link).toBeVisible({ timeout: 30_000 });
  const url = await link.inputValue();
  await dialog.getByRole("button", { name: "Done" }).click();
  return url;
}

async function asStranger(browser: Browser, url: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(url);
  return { page, close: () => context.close() };
}

test("the pricing page shows the three plans, and says paid plans are not switched on", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Start free.");
  const plans = page.getByTestId("plans");
  for (const [id, name, cost] of [["free", "Free", "€0"], ["pro", "Pro", "€9"], ["team", "Team", "€29"]] as const) {
    const card = plans.getByTestId(`plan-${id}`);
    await expect(card.getByRole("heading", { name })).toBeVisible();
    await expect(card).toContainText(cost);
  }
  // billing is off: nothing that cannot be bought is offered
  await expect(plans.getByTestId("choose-pro")).toBeDisabled();
  await expect(plans.getByTestId("choose-pro")).toHaveText("Coming soon");
  await expect(plans.getByTestId("choose-team")).toHaveText("Coming soon");
  // a link styled as a button
  await expect(plans.locator("a", { hasText: "Start free" })).toHaveAttribute("href", "/#upload");
  await expect(page.getByTestId("pricing-note")).toContainText("not switched on yet");
  // sentence case throughout
  const heading = plans.getByTestId("plan-pro").getByRole("heading", { name: "Pro" });
  expect(await heading.evaluate((el) => getComputedStyle(el).textTransform)).toBe("none");
});

test("the header and footer lead to the pricing page", async ({ page, isMobile }) => {
  await page.goto("/");
  if (!isMobile) await expect(page.getByRole("banner").getByRole("link", { name: "Pricing" })).toHaveAttribute("href", "/pricing");
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Pricing" })).toHaveAttribute("href", "/pricing");
});

test("a signed-in person on the free plan sees it as theirs, and nothing to manage", async ({ page }) => {
  await signUp(page);
  await page.goto("/app/account");
  const billing = page.getByTestId("billing");
  await expect(billing).toBeVisible();
  await expect(page.getByTestId("billing-status")).toContainText("not switched on yet");
  await expect(billing.getByTestId("plan-free")).toHaveAttribute("data-current", "true");
  await expect(billing.getByTestId("plan-free")).toContainText("Your plan");
  await expect(billing.getByTestId("choose-pro")).toBeDisabled();
  await expect(page.getByTestId("manage-billing")).toHaveCount(0);
  await expect(page.getByTestId("plan-usage")).toContainText("3");
});

test("on the free plan, exports and link expiry explain themselves instead of working, and a published link shows the badge", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await signUp(page);
  await supportProject(page);

  // a chart's data as CSV
  await page.getByTestId("save-csv").first().click();
  let dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Saving a chart's data as CSV is part of Pro");
  await expect(dialog.getByTestId("see-plans")).toHaveAttribute("href", "/pricing");
  await dialog.getByRole("button", { name: "Not now" }).click();
  await expect(dialog).toHaveCount(0);

  // the story as a PDF
  await page.getByRole("tab", { name: "Story" }).click();
  await page.getByTestId("story-pdf").click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Saving the story as a PDF is part of Pro");
  await dialog.getByRole("button", { name: "Not now" }).click();
  // the picture is still free
  await expect(page.getByTestId("story-save")).toBeEnabled();

  // link expiry
  await page.getByRole("tab", { name: "Dashboard" }).click();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Link expires")).toBeDisabled();
  await expect(dialog.getByTestId("expiry-locked")).toContainText("part of Pro");
  await dialog.getByRole("button", { name: "Cancel" }).click();

  // the badge, on a link that anyone can open
  const url = await publish(page);
  const stranger = await asStranger(browser, url);
  await expect(stranger.page.getByTestId("made-with")).toBeVisible({ timeout: 30_000 });
  await expect(stranger.page.getByTestId("made-with")).toHaveAttribute("href", "/");
  await stranger.close();
  // and no view counts for the owner on this plan
  await page.reload();
  await expect(page.getByTestId("published-link")).toBeVisible();
  await expect(page.getByTestId("link-views")).toHaveCount(0);
});

test("on a paid plan, exports work, and a link can expire, shows its views, and has no badge", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const email = await signUp(page);
  await grantPlan(email, "pro");
  await supportProject(page);

  // the account says so
  await page.goto("/app/account");
  await expect(page.getByTestId("plan-pro")).toHaveAttribute("data-current", "true");
  await expect(page.getByTestId("billing-status")).toContainText("You are on Pro");
  await expect(page.getByTestId("plan-usage")).toContainText("50");
  await page.goBack();
  await expect(page.getByTestId("kpi-value").first()).not.toHaveText("", { timeout: 30_000 });
  await expect(page.getByTestId("chart-card").first().locator("canvas").first()).toBeVisible({ timeout: 30_000 });

  // a chart's data as a CSV file
  const [csv] = await Promise.all([page.waitForEvent("download"), page.getByTestId("save-csv").first().click()]);
  expect(csv.suggestedFilename()).toMatch(/\.csv$/);
  const csvText = readFileSync((await csv.path())!, "utf8");
  expect(csvText.startsWith("﻿")).toBe(true);
  expect(csvText.split("\r\n").length).toBeGreaterThan(2);
  expect(csvText.split("\r\n")[0]).toContain(",");

  // the story as a PDF
  await page.getByRole("tab", { name: "Story" }).click();
  const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByTestId("story-pdf").click()]);
  expect(pdf.suggestedFilename()).toMatch(/^story-.*\.pdf$/);
  const bytes = readFileSync((await pdf.path())!);
  expect(bytes.subarray(0, 8).toString("latin1")).toBe("%PDF-1.4");
  const text = bytes.toString("latin1");
  expect(text).toContain("/Filter /DCTDecode");
  expect(text).toContain("/Width 2160");
  expect(text.trimEnd().endsWith("%%EOF")).toBe(true);

  // a link with an expiry
  await page.getByRole("tab", { name: "Dashboard" }).click();
  const url = await publish(page, "7");
  const stranger = await asStranger(browser, url);
  await expect(stranger.page.getByTestId("chart-card").first()).toBeVisible({ timeout: 30_000 });
  await expect(stranger.page.getByTestId("made-with")).toHaveCount(0);
  await stranger.close();

  // the owner sees how often it was opened, and when it expires
  await page.reload();
  const views = page.getByTestId("link-views");
  await expect(views).toBeVisible({ timeout: 30_000 });
  await expect(views).toContainText("1 view");
  await expect(views).toContainText("expires");

  // once the date has passed, the link says so
  const slug = new URL(url).pathname.split("/").pop()!;
  await withDatabase((q) => q(`UPDATE share SET "expiresAt" = now() - interval '1 minute' WHERE slug = $1`, [slug]));
  const late = await asStranger(browser, url);
  await expect(late.page.getByTestId("link-expired")).toContainText("This link has expired", { timeout: 30_000 });
  await late.close();
});

for (const path of ["/pricing"]) {
  test(`${path} passes the automated accessibility checks`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByTestId("plans")).toBeVisible();
    await page.waitForTimeout(500);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 120)}`)).toEqual([]);
  });
}

test("the account page, with its plans, passes the accessibility checks", async ({ page }) => {
  await signUp(page);
  await page.goto("/app/account");
  await expect(page.getByTestId("billing")).toBeVisible();
  await page.waitForTimeout(500);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 120)}`)).toEqual([]);
});
