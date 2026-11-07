import { expect, test, type Page } from "@playwright/test";

const ART = ["topo-orange.svg", "topo-lines-dark.svg", "topo-lines-light.svg", "footer-hills.svg"];

test("the generated art is served as SVG", async ({ request }) => {
  for (const name of ART) {
    const res = await request.get(`/art/${name}`);
    expect(res.status(), name).toBe(200);
    expect(res.headers()["content-type"], name).toContain("image/svg+xml");
    expect((await res.text()).startsWith("<svg"), name).toBe(true);
  }
});

test("the footer has the hills and the grain", async ({ page }) => {
  await page.goto("/");
  const footer = page.locator("footer");
  await expect(footer.locator('img[src="/art/footer-hills.svg"]')).toBeVisible();
  // two grain layers: a light one behind the text and a heavier one over the hills, never over the words
  await expect(footer.locator(".grain-layer")).toHaveCount(2);
  const textGrain = await footer.locator(".grain-layer").first().evaluate((el) => getComputedStyle(el).zIndex);
  expect(Number(textGrain)).toBeLessThan(0);
  await expect(footer.getByRole("link", { name: "Create account" })).toBeVisible();
});

test("the sign-in card shows the terrain art on desktop and only the form on mobile", async ({ page }) => {
  const art = page.getByText("Your rows never leave your browser", { exact: true });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
  await expect(art).toBeVisible();

  await page.setViewportSize({ width: 390, height: 800 });
  await expect(art).toBeHidden();
  await expect(page.getByRole("main").getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});

test("the sign-in heading switches between sign in and sign up", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
  await page.getByRole("button", { name: "No account? Sign up" }).click();
  await expect(page.getByRole("heading", { name: /Create your account/ })).toBeVisible();
});

test("the closing call to action and the Pilot band are textured", async ({ page }) => {
  await page.goto("/");
  const pilot = page.locator("#pilot");
  await expect(pilot.getByRole("heading", { name: /Meet Pilot/ })).toBeVisible();
  await expect(pilot.locator(".grain-layer")).toHaveCount(1);
  const cta = page.getByRole("heading", { name: "Ready to begin?" }).locator("xpath=ancestor::section[1]");
  await expect(cta.locator(".grain-layer")).toHaveCount(1);
});

test("the visible text never says AI: the assistant is called Pilot", async ({ page }) => {
  for (const path of ["/", "/login"]) {
    await page.goto(path);
    const text = await page.locator("body").innerText();
    expect(text, path).not.toMatch(/\bAI\b/);
    expect(text, path).toContain("Pilot");
  }
});

async function collectConsole(page: Page, paths: string[]) {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${String(e)}`));
  for (const path of paths) {
    await page.goto(path);
    await page.waitForTimeout(1500);
  }
  return problems;
}

test("the landing and sign-in pages log no console errors or warnings", async ({ page }) => {
  expect(await collectConsole(page, ["/", "/login"])).toEqual([]);
});

test("each feature card has its own illustration and lifts on hover", async ({ page }) => {
  await page.goto("/");
  const grid = page.locator("#features");
  await expect(grid.getByTestId("tool-art")).toHaveCount(6);
  for (const title of ["Instant dashboards", "Meet Pilot", "Ask your data", "Share links", "Private by design", "Fast on big files"]) {
    await expect(grid.getByText(title, { exact: true })).toBeVisible();
  }
  const card = grid.locator('[data-slot="card"]').first();
  const before = await card.evaluate((el) => el.getBoundingClientRect().top);
  await card.hover();
  await expect.poll(async () => card.evaluate((el) => el.getBoundingClientRect().top)).toBeLessThan(before);
});
