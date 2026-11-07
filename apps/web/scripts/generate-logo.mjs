// Generates the logo files from src/lib/logo-geometry.ts:
//   public/brand/logo-mark.svg         full mark, midnight green tile
//   public/brand/logo-mark-light.svg   for dark backgrounds, cream tile
//   src/app/icon.svg                   favicon (bolder three-row version)
//   src/app/apple-icon.png             180px touch icon
//   src/app/favicon.ico                16, 32 and 48px
// Run with: pnpm --filter @dropboard/web logo   (needs Node 24 for type stripping, and Playwright's Chromium)
// The output is committed, so builds do not need this script.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeRows, FULL, rowPath, SMALL } from "../src/lib/logo-geometry.ts";

const ROOT = process.cwd();
const BRAND = join(ROOT, "public", "brand");
const APP = join(ROOT, "src", "app");
mkdirSync(BRAND, { recursive: true });

const C = { green: "#075056", cream: "#FDF6E3", orange: "#FF5B04" };

function markSvg({ options, tile, bars, accent, radius }) {
  const paths = computeRows(options)
    .map((row) => `<path d="${rowPath(row, options)}" fill="${row.accent ? accent : bars}"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="${radius}" fill="${tile}"/>${paths}</svg>`;
}

const svgs = {
  [join(BRAND, "logo-mark.svg")]: markSvg({ options: FULL, tile: C.green, bars: C.cream, accent: C.orange, radius: 22 }),
  [join(BRAND, "logo-mark-light.svg")]: markSvg({ options: FULL, tile: C.cream, bars: C.green, accent: C.orange, radius: 22 }),
  [join(APP, "icon.svg")]: markSvg({ options: SMALL, tile: C.green, bars: C.cream, accent: C.orange, radius: 22 }),
};
for (const [file, svg] of Object.entries(svgs)) writeFileSync(file, svg);

// ---- rasters ----------------------------------------------------------------------------------------------------
const browser = await chromium.launch();
const page = await browser.newPage();

async function png(svg, size) {
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0;background:transparent"><img src="${src}" width="${size}" height="${size}" style="display:block"></body>`);
  return page.screenshot({ type: "png", omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

// Apple applies its own rounded mask, so the touch icon is a full-bleed square
const appleSvg = markSvg({ options: FULL, tile: C.green, bars: C.cream, accent: C.orange, radius: 0 });
writeFileSync(join(APP, "apple-icon.png"), await png(appleSvg, 180));

// favicon.ico: PNG images inside an ICO container (supported by every current browser)
const sizes = [16, 32, 48];
const images = [];
for (const size of sizes) images.push(await png(svgs[join(APP, "icon.svg")], size));
const header = Buffer.alloc(6);
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const entries = images.map((data, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(sizes[i], 0);
  e.writeUInt8(sizes[i], 1);
  e.writeUInt16LE(1, 4); // planes
  e.writeUInt16LE(32, 6); // bits per pixel
  e.writeUInt32LE(data.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += data.length;
  return e;
});
writeFileSync(join(APP, "favicon.ico"), Buffer.concat([header, ...entries, ...images]));

await browser.close();
console.log("logo files written");
