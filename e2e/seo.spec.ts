import { expect, test } from "@playwright/test";

test("a shared link shows a title, a description and a picture, on the real address", async ({ page, request }) => {
  await page.goto("/");
  const meta = async (selector: string) => page.locator(selector).first().getAttribute("content");
  expect(await meta('meta[property="og:title"]')).toBe("Dropboard: turn any spreadsheet into a dashboard");
  expect(await meta('meta[property="og:description"]')).toContain("Drop an Excel, CSV or JSON file");
  expect(await meta('meta[property="og:site_name"]')).toBe("Dropboard");
  expect(await meta('meta[property="og:type"]')).toBe("website");
  expect(await meta('meta[name="twitter:card"]')).toBe("summary_large_image");
  // the picture's address is absolute and on the public site, so X, LinkedIn and Slack can fetch it
  const image = await meta('meta[property="og:image"]');
  expect(image).toMatch(/^https:\/\/dropboard\.de\/opengraph-image/);
  expect(await meta('meta[property="og:image:width"]')).toBe("1200");
  expect(await meta('meta[property="og:image:height"]')).toBe("630");
  expect(await meta('meta[property="og:image:alt"]')).toContain("Dropboard");
  expect(await meta('meta[name="twitter:image"]')).toMatch(/^https:\/\/dropboard\.de\/twitter-image/);

  // and the picture itself is served here, as a real 1200 by 630 PNG
  const local = new URL(image!).pathname + new URL(image!).search;
  const response = await request.get(local);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/png");
  const bytes = await response.body();
  expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  expect(bytes.readUInt32BE(16)).toBe(1200);
  expect(bytes.readUInt32BE(20)).toBe(630);
});

test("search engines are told what to read and what to leave alone", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("User-Agent: *");
  for (const path of ["/app", "/api/", "/s/"]) expect(robots).toContain(`Disallow: ${path}`);
  expect(robots).toContain("Sitemap: https://dropboard.de/sitemap.xml");

  const sitemap = await (await request.get("/sitemap.xml")).text();
  for (const path of ["https://dropboard.de</loc>", "https://dropboard.de/trust", "https://dropboard.de/privacy", "https://dropboard.de/terms"]) expect(sitemap).toContain(path);
  // the sign-in page and published links are not listed
  expect(sitemap).not.toContain("/login");
  expect(sitemap).not.toContain("/s/");
});
