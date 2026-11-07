import { expect, test } from "@playwright/test";

const track = '[class*="animate-flow-right"]';

test("the hero flow moves", async ({ page }) => {
  await page.goto("/");
  const first = page.locator(track).first();
  await expect(first).toBeAttached();
  const t1 = await first.evaluate((el) => getComputedStyle(el).transform);
  await page.waitForTimeout(1000);
  const t2 = await first.evaluate((el) => getComputedStyle(el).transform);
  expect(t2).not.toBe(t1);
});

test("the hero flow turns placeholders into insight cards across the beam", async ({ page }) => {
  await page.goto("/");
  // each row is drawn twice: one clipped to the left half (placeholders), one to the right half (finished cards)
  const rows = page.locator('[class*="clip-path"]');
  await expect(rows).toHaveCount(6);
  // finished cards carry real labels; placeholders carry none
  await expect(page.locator('[class*="clip-path:inset(0_0_0_50%)"]').first()).toContainText(/\w/);
  await expect(page.locator('[class*="clip-path:inset(0_50%_0_0)"]').first()).not.toContainText(/\w/);
});

test("the prompt carousel cycles through the example questions", async ({ page }) => {
  await page.goto("/");
  const carousel = page.getByTestId("prompt-carousel");
  await carousel.scrollIntoViewIfNeeded();
  const start = await carousel.getAttribute("data-index");
  await expect.poll(async () => carousel.getAttribute("data-index"), { timeout: 10_000 }).not.toBe(start);
  // all prompts are available to screen readers exactly once
  await expect(carousel.locator("ul.sr-only li")).toHaveCount(6);
});

test("animations stop when the visitor prefers reduced motion", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");

  const first = page.locator(track).first();
  await expect(first).toBeAttached();
  await expect(first).toHaveCSS("animation-name", "none");

  const carousel = page.getByTestId("prompt-carousel");
  await carousel.scrollIntoViewIfNeeded();
  await page.waitForTimeout(3500);
  await expect(carousel).toHaveAttribute("data-index", "0");
  await context.close();
});
