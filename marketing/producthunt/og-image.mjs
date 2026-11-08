// The image shown when a link to the site is shared (1200 x 630): the hero slide on the share-card canvas. Run compose.mjs first.
//   node marketing/producthunt/og-image.mjs
import { chromium } from "@playwright/test";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, "out");
const APP = path.join(ROOT, "..", "..", "apps", "web", "src", "app");

let html = readFileSync(path.join(OUT, "slides", "01-hero.html"), "utf8");
// a smaller canvas, without the file-type chips, which would sit on top of the logo
html = html.replace("</style>", "html,body{width:1200px!important;height:630px!important}.chip{display:none!important}h1{font-size:76px!important}.abs{top:84px!important}.sub{font-size:22px!important}</style>");
const file = path.join(OUT, "slides", "og-image.html");
writeFileSync(file, html);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(file).href);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(900);
const png = path.join(OUT, "og-image-1200x630.png");
await page.screenshot({ path: png });
await browser.close();
// the same picture is the link preview on X and the others
copyFileSync(png, path.join(APP, "opengraph-image.png"));
copyFileSync(png, path.join(APP, "twitter-image.png"));
console.log("ok");
