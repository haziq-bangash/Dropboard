import { expect, test } from "@playwright/test";

test("the favicon is served as SVG and as a three-size ICO", async ({ request }) => {
  const svg = await request.get("/icon.svg");
  expect(svg.status()).toBe(200);
  expect(svg.headers()["content-type"]).toContain("image/svg+xml");
  expect(await svg.text()).toContain("#FF5B04"); // the orange accent row

  const ico = await request.get("/favicon.ico");
  expect(ico.status()).toBe(200);
  const bytes = await ico.body();
  expect([...bytes.subarray(0, 4)]).toEqual([0, 0, 1, 0]); // ICO header, type 1
  expect(bytes.readUInt16LE(4)).toBe(3); // 16, 32 and 48 px
  const widths = [0, 1, 2].map((i) => bytes.readUInt8(6 + i * 16));
  expect(widths).toEqual([16, 32, 48]);
});

test("the touch icon is a 180 x 180 PNG", async ({ request }) => {
  const res = await request.get("/apple-icon.png");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/png");
  const png = await res.body();
  expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  expect(png.readUInt32BE(16)).toBe(180);
  expect(png.readUInt32BE(20)).toBe(180);
});

test("pages link the icons", async ({ page }) => {
  for (const path of ["/", "/login"]) {
    await page.goto(path);
    await expect(page.locator('link[rel~="icon"]').first()).toHaveCount(1);
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  }
});

test("the header shows the sliced D mark next to the wordmark", async ({ page }) => {
  await page.goto("/");
  const home = page.getByRole("link", { name: "Dropboard home" }).first();
  await expect(home).toContainText("Dropboard");
  const rows = home.locator("svg path");
  await expect(rows).toHaveCount(5);
  const fills = await rows.evaluateAll((els) => els.map((el) => el.getAttribute("fill")));
  expect(fills.filter((f) => f === "#FF5B04")).toHaveLength(1);
});
