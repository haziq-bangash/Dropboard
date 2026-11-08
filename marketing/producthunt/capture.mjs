// Takes real screenshots of the running app (default http://localhost:4310) for the Product Hunt images.
// Needs the web app and the API running, with Pilot enabled for the answer shot. Output: out/raw/*.png at 2x.
//   node marketing/producthunt/capture.mjs
import { chromium } from "@playwright/test";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE ?? "http://localhost:4310";
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "out", "raw");
mkdirSync(OUT, { recursive: true });
const shot = (name) => path.join(OUT, `${name}.png`);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, baseURL: BASE });
const page = await context.newPage();

// the home page, as a visitor sees it
await page.goto("/");
await page.waitForTimeout(3500);
await page.screenshot({ path: shot("home") });
console.log("home");

// a demo account
await page.goto("/login");
await page.getByRole("button", { name: "No account? Sign up" }).click();
await page.getByLabel("Email").fill(`demo${Date.now() % 100000}@example.com`);
await page.getByLabel("Password").fill("correct-horse-battery");
await page.getByRole("button", { name: "Sign up", exact: true }).click();
await page.waitForURL(/\/app$/);

// A tidy name for the pictures. This only touches the local demo database.
const email = await page.evaluate(() => fetch("/api/auth/get-session").then((r) => r.json()).then((j) => j.user.email));
const sql = (query) => execSync(`docker exec -i dropboard-postgres-1 psql -U dropboard -d dropboard`, { input: query, stdio: ["pipe", "ignore", "inherit"] });
sql(`DELETE FROM "user" WHERE email IN ('alex@example.com', 'maya@example.com');`);
sql(`UPDATE "user" SET name = 'Maya', email = 'maya@example.com' WHERE email = '${email}';`);

async function openSample(title) {
  await page.goto("/app/new");
  await page.getByTestId("starter").filter({ hasText: title }).click();
  await page.waitForURL(/\/app\/p\//, { timeout: 60_000 });
  await page.getByTestId("kpi-value").first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(3000);
}
const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
async function cards(dataset) {
  const all = page.getByTestId("chart-card");
  const n = await all.count();
  for (let i = 0; i < n; i++) {
    const card = all.nth(i);
    const title = (await card.locator("h3, [data-slot=card-title]").first().innerText().catch(() => "")).trim();
    if (!title || /data preview/i.test(title)) continue;
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await card.screenshot({ path: shot(`card-${dataset}-${slug(title)}`) }).catch(() => {});
  }
}
const tab = async (name) => {
  await page.getByRole("tab", { name }).click();
  await page.waitForTimeout(2500);
};

// 1. the store: dashboard, insights, story, and Pilot
await openSample("Online store orders");
await page.screenshot({ path: shot("store-dashboard") });
await page.evaluate(() => window.scrollTo(0, 560));
await page.waitForTimeout(1200);
await page.screenshot({ path: shot("store-charts") });
await cards("store");
await page.evaluate(() => window.scrollTo(0, 0));
console.log("store dashboard");

await tab("Insights");
await page.screenshot({ path: shot("store-insights") });
console.log("store insights");
await tab("Story");
await page.screenshot({ path: shot("store-story") });
console.log("store story");

await tab("Dashboard");
const ask = page.getByLabel("Question about your data");
await ask.scrollIntoViewIfNeeded();
await ask.fill("Which region brings in the most revenue, and how much?");
await page.getByRole("button", { name: "Ask", exact: true }).click();
await page.getByText(/Thinking/).waitFor({ state: "hidden", timeout: 90_000 }).catch(() => {});
await page.waitForTimeout(3000);
const pilot = page.getByLabel("Question about your data").locator("xpath=ancestor::*[contains(@class,'card') or @data-slot='card'][1]");
await (await pilot.count() ? pilot.first() : page.locator("main")).screenshot({ path: shot("pilot-answer") }).catch(async () => page.screenshot({ path: shot("pilot-answer") }));
await page.screenshot({ path: shot("pilot-page") });
console.log("pilot");

// 2. deliveries: the map
await openSample("Delivery drops");
await page.screenshot({ path: shot("delivery-dashboard") });
const map = page.getByTestId("chart-card").filter({ has: page.getByRole("img", { name: /map/i }) }).first();
if (await map.count()) await map.screenshot({ path: shot("delivery-map") });
await cards("delivery");
console.log("delivery");

// 3. support tickets: the relationship it found
await openSample("Support tickets");
await tab("Insights");
await page.screenshot({ path: shot("support-insights") });
await tab("Story");
await page.screenshot({ path: shot("support-story") });
await page.evaluate(() => window.scrollTo(0, 700));
await page.waitForTimeout(800);
await page.screenshot({ path: shot("support-story-2") });
console.log("support");

// 4. publishing a snapshot and opening it as a stranger would
await page.evaluate(() => window.scrollTo(0, 0));
await tab("Dashboard");
await page.getByRole("button", { name: "Publish", exact: true }).click();
const dialog = page.getByRole("dialog");
await dialog.getByRole("button", { name: "Create link" }).click();
const link = dialog.getByTestId("share-link");
await link.waitFor({ timeout: 30_000 });
await page.waitForTimeout(800);
const url = await link.inputValue();
await link.evaluate((el, v) => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  set.call(el, v);
}, url.replace(/^https?:\/\/[^/]+/, "https://dropboard.de"));
await dialog.screenshot({ path: shot("publish-dialog") });
const stranger = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const view = await stranger.newPage();
await view.goto(url.replace(/^https?:\/\/[^/]+/, BASE));
await view.waitForTimeout(3500);
await view.screenshot({ path: shot("shared-view") });
console.log("shared");

// 5. the projects list
await page.goto("/app");
await page.waitForTimeout(1500);
await page.screenshot({ path: shot("projects") });
console.log("projects");

await browser.close();
