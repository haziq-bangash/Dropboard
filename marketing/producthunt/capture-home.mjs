// Captures the live homepage (default https://dropboard.de): the first screen, each section, the whole page, and a phone version.
//   node marketing/producthunt/capture-home.mjs
// Output: out/home/*.png at 2x (3x on the phone).
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const URL = process.env.URL ?? "https://dropboard.de/";
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "out", "home");
mkdirSync(OUT, { recursive: true });
const out = (n) => path.join(OUT, `${n}.png`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The header sticks to the top of the window, so it would sit on top of every section picture. */
const headerOff = (page, off) => page.evaluate((off) => { document.querySelector("header").style.visibility = off ? "hidden" : ""; }, off);

/** Scroll down the whole page slowly, so everything that fades in as it appears has appeared. */
async function reveal(page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 500) {
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await sleep(250);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(1200);
}

const browser = await chromium.launch();

// ---- desktop ----
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await desktop.newPage();
await page.goto(URL, { waitUntil: "networkidle" });
await sleep(4500); // the hero animates in
await page.screenshot({ path: out("hero") });
await reveal(page);

const sections = [
  ["features", page.locator("#features")],
  ["how-it-works", page.locator("#how")],
  ["pilot", page.locator("#pilot")],
  ["privacy", page.locator("#privacy")],
  ["get-started", page.locator("section").last()],
];
await headerOff(page, true);
for (const [name, locator] of sections) {
  await locator.scrollIntoViewIfNeeded();
  await sleep(1800);
  await locator.screenshot({ path: out(name) });
  console.log(name);
}
await headerOff(page, false);
await page.evaluate(() => window.scrollTo(0, 0));
await sleep(800);
await page.screenshot({ path: out("full-page"), fullPage: true });
console.log("full page");

// ---- phone ----
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const mobile = await phone.newPage();
await mobile.goto(URL, { waitUntil: "networkidle" });
await sleep(4500);
await mobile.screenshot({ path: out("phone-hero") });
await reveal(mobile);
await headerOff(mobile, true);
for (const [name, id] of [["phone-features", "#features"], ["phone-pilot", "#pilot"]]) {
  const el = mobile.locator(id);
  await el.scrollIntoViewIfNeeded();
  await sleep(1500);
  await el.screenshot({ path: out(name) });
}
console.log("phone");
await browser.close();
