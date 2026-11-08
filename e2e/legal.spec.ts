import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Entrance effects would be measured halfway through by axe; people who ask for reduced motion get the final state at once.
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("the privacy page says what stays in the browser and where to ask about your data", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1, name: "Privacy" })).toBeVisible();
  await expect(page.getByText(/Last updated \d+ \w+ \d{4}/)).toBeVisible();
  await expect(page.getByText("never uploaded to our servers", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "privacy@dropboard.de" }).first()).toHaveAttribute("href", "mailto:privacy@dropboard.de");
  // the assistant is named by its product name, and what it is sent is listed
  await expect(page.getByRole("heading", { name: "What Pilot is sent" })).toBeVisible();
  await expect(page.getByText("It is never sent your rows")).toBeVisible();
});

test("the terms page has the rules, the licence of the code and a way to ask for a commercial one", async ({ page }) => {
  await page.goto("/terms");
  await expect(page.getByRole("heading", { level: 1, name: "Terms of use" })).toBeVisible();
  await expect(page.getByText("PolyForm Noncommercial License 1.0.0")).toBeVisible();
  await expect(page.getByText("without a separate licence", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "privacy page" })).toHaveAttribute("href", "/privacy");
});

test("the footer leads to the legal pages and the trust center, and the title text is never forced into capitals", async ({ page }) => {
  await page.goto("/");
  const legal = page.getByRole("navigation", { name: "Legal" });
  await expect(legal.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
  await expect(legal.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
  await expect(legal.getByRole("link", { name: "Trust center" })).toHaveAttribute("href", "/trust");
  await expect(legal.getByRole("link", { name: "Licence" })).toHaveAttribute("href", /github\.com\/.*\/LICENSE$/);
  await legal.getByRole("link", { name: "Trust center" }).click();
  await expect(page).toHaveURL(/\/trust$/);
  const title = page.getByRole("heading", { level: 1 });
  await expect(title).toContainText("Your data stays");
  expect(await title.evaluate((el) => getComputedStyle(el).textTransform)).toBe("none");
});

test("the trust center states what is in place, and says plainly what is not", async ({ page }) => {
  await page.goto("/trust");
  await expect(page.getByText("rows uploaded to our servers")).toBeVisible();
  const badges = page.getByRole("list", { name: "What we do and what we do not" }).getByRole("listitem");
  await expect(badges).toHaveCount(12);
  // honest: the certifications we do not hold are listed as not yet, never as achieved
  const soc = badges.filter({ hasText: "SOC 2 and ISO 27001" });
  await expect(soc).toContainText("Not yet");
  await expect(soc).toContainText("Not certified");
  expect(await badges.filter({ hasText: "In place" }).count()).toBeGreaterThanOrEqual(8);
  // every status label is in sentence case
  const label = badges.first().locator("span").last();
  expect(await label.evaluate((el) => getComputedStyle(el).textTransform)).toBe("none");
  // who else handles data
  await expect(page.getByRole("heading", { name: "OpenAI" })).toBeVisible();
  await expect(page.getByRole("link", { name: "privacy@dropboard.de" }).first()).toBeVisible();
});

test("signing up shows that it means agreeing to the terms and the privacy policy", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "No account? Sign up" }).click();
  const agree = page.getByTestId("agree");
  await expect(agree).toBeVisible();
  await expect(agree.getByRole("link", { name: "terms of use" })).toHaveAttribute("href", "/terms");
  await expect(agree.getByRole("link", { name: "privacy policy" })).toHaveAttribute("href", "/privacy");
  // signing in does not show it
  await page.getByRole("button", { name: "Have an account? Sign in" }).click();
  await expect(page.getByTestId("agree")).toHaveCount(0);
});

for (const path of ["/privacy", "/terms", "/trust"]) {
  test(`${path} passes the automated accessibility checks`, async ({ page }) => {
    await page.goto(path);
    await page.waitForTimeout(500);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 120)}`)).toEqual([]);
  });
}
