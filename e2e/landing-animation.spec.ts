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

test("the hero flow turns placeholders into insight cards as they cross the beam", async ({ page }) => {
  await page.goto("/");
  // each row draws the same track twice: placeholders and finished cards, cross-faded around the center
  await expect(page.locator('[data-layer="placeholder"]')).toHaveCount(3);
  await expect(page.locator('[data-layer="insight"]')).toHaveCount(3);
  // finished cards carry real labels; placeholders carry none
  await expect(page.locator('[data-layer="insight"]').first()).toContainText(/\w/);
  await expect(page.locator('[data-layer="placeholder"]').first()).not.toContainText(/\w/);
});

test("the hero flow loops without a jump", async ({ page }) => {
  await page.goto("/");
  // The track holds the card sequence twice and is shifted by half its width. That is only seamless if half of the
  // track is exactly one copy: 6 cards x (288px card + 16px gap) = 1824px, so the track is 3648px wide.
  const widths = await page.locator("[data-track]").evaluateAll((els) => els.map((el) => (el as HTMLElement).offsetWidth));
  expect(widths).toHaveLength(6);
  for (const w of widths) expect(w).toBe(12 * (288 + 16));
  // and the placeholder and finished layers of a row move in lockstep
  const sameMotion = await page.evaluate(() => {
    const tracks = Array.from(document.querySelectorAll("[data-track]")) as HTMLElement[];
    return [0, 1, 2].every((row) => {
      const a = getComputedStyle(tracks[row * 2]);
      const b = getComputedStyle(tracks[row * 2 + 1]);
      return a.animationDuration === b.animationDuration && a.animationDelay === b.animationDelay;
    });
  });
  expect(sameMotion).toBe(true);
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
