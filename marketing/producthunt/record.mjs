// Records the demo video: one continuous, real run through the app, with a visible cursor and short captions.
//   node marketing/producthunt/export-demo.ts first (see that file), then:  node marketing/producthunt/record.mjs
// Frames come straight from the browser at high quality (Playwright's own video recorder is too soft to read text in), are timed
// from the browser's timestamps, and ffmpeg turns them into out/demo.mp4 (1920x1080, 30 fps, no sound).
import { chromium } from "@playwright/test";
import { execFileSync, execSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE ?? "http://localhost:4310";
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, "out");
const FRAMES = path.join(OUT, "frames");
// the project takes the file's name as its title, so the file is named the way the title should read
const FILE = path.join(OUT, "demo", "Support tickets.csv");
copyFileSync(path.join(OUT, "demo", "support-tickets.csv"), FILE);
const logo = readFileSync(path.join(ROOT, "..", "..", "apps", "web", "public", "brand", "logo-mark.svg"), "utf8");
rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** When each scene starts, in wall-clock seconds, so short clips can be cut from the same take. */
const scenes = {};
const scene = (name) => (scenes[name] = Date.now() / 1000);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25, baseURL: BASE });

// the cursor, the captions and the title cards live in the page, so they are in every frame and survive page changes
await context.addInitScript(
  ({ logo }) => {
    const install = () => {
      if (document.getElementById("demo-layer")) return;
      const layer = document.createElement("div");
      layer.id = "demo-layer";
      layer.innerHTML = `
        <style>
          #demo-cursor{position:fixed;left:-50px;top:-50px;width:30px;height:30px;z-index:2147483000;pointer-events:none;transition:left .7s cubic-bezier(.4,0,.2,1),top .7s cubic-bezier(.4,0,.2,1);filter:drop-shadow(0 3px 5px rgba(0,0,0,.35))}
          #demo-ripple{position:fixed;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;border:3px solid #FF5B04;z-index:2147482999;pointer-events:none;opacity:0}
          #demo-ripple.go{animation:demo-ripple .6s ease-out}
          @keyframes demo-ripple{from{opacity:.9;transform:scale(.4)}to{opacity:0;transform:scale(3.2)}}
          #demo-cap{position:fixed;left:50%;bottom:44px;transform:translateX(-50%) translateY(14px);z-index:2147483001;opacity:0;transition:opacity .45s,transform .45s;pointer-events:none;
            background:rgba(35,48,56,.94);color:#FDF6E3;padding:16px 30px;border-radius:999px;font:500 28px/1.2 var(--font-geist-sans),Geist,system-ui,sans-serif;white-space:nowrap;box-shadow:0 18px 40px -12px rgba(0,0,0,.45)}
          #demo-cap.on{opacity:1;transform:translateX(-50%) translateY(0)}
          #demo-card{position:fixed;inset:0;z-index:2147483002;background:#FDF6E3;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;opacity:0;pointer-events:none;transition:opacity .6s;color:#233038;text-align:center}
          #demo-card.on{opacity:1}
          #demo-card .mark svg{width:96px;height:96px;border-radius:22px}
          #demo-card h1{font-family:"Instrument Serif",Georgia,serif;font-weight:400;font-size:92px;line-height:1;letter-spacing:-1px;margin:0;max-width:1100px}
          #demo-card h1 em{font-style:italic}
          #demo-card p{font:400 28px/1.4 var(--font-geist-sans),Geist,system-ui,sans-serif;color:#425058;margin:0}
        </style>
        <svg id="demo-cursor" viewBox="0 0 24 24"><path d="M4 2l15 9-6.5 1.6L16 20l-3 1.3-3.5-7.2L4 18z" fill="#fff" stroke="#233038" stroke-width="1.4" stroke-linejoin="round"/></svg>
        <div id="demo-ripple"></div><div id="demo-cap"></div><div id="demo-card"></div>`;
      document.documentElement.appendChild(layer);
    };
    window.__demo = {
      cursor(x, y) { install(); const c = document.getElementById("demo-cursor"); c.style.left = x - 4 + "px"; c.style.top = y - 2 + "px"; },
      ripple(x, y) { install(); const r = document.getElementById("demo-ripple"); r.style.left = x + "px"; r.style.top = y + "px"; r.classList.remove("go"); void r.offsetWidth; r.classList.add("go"); },
      caption(t) { install(); const c = document.getElementById("demo-cap"); if (t) { c.textContent = t; c.classList.add("on"); } else c.classList.remove("on"); },
      card(html) { install(); const c = document.getElementById("demo-card"); if (html) { c.innerHTML = html; c.classList.add("on"); } else c.classList.remove("on"); },
      logo,
    };
    document.addEventListener("DOMContentLoaded", install);
  },
  { logo },
);

const page = await context.newPage();

// ---- an account for the demo, made before any frame is taken ----
await page.goto("/login");
await page.getByRole("button", { name: "No account? Sign up" }).click();
await page.getByLabel("Email").fill(`demo${Date.now() % 100000}@example.com`);
await page.getByLabel("Password").fill("correct-horse-battery");
await page.getByRole("button", { name: "Sign up", exact: true }).click();
await page.waitForURL(/\/app$/);
const email = await page.evaluate(() => fetch("/api/auth/get-session").then((r) => r.json()).then((j) => j.user.email));
const sql = (q) => execSync("docker exec -i dropboard-postgres-1 psql -U dropboard -d dropboard", { input: q, stdio: ["pipe", "ignore", "inherit"] });
sql(`DELETE FROM "user" WHERE email IN ('maya@example.com');`);
sql(`UPDATE "user" SET name = 'Maya', email = 'maya@example.com' WHERE email = '${email}';`);
// dismiss the welcome guide so it does not crowd the first screen
await page.goto("/app");
await page.getByRole("button", { name: "Dismiss the guide" }).click().catch(() => {});
await page.goto("/app/new");
await page.waitForTimeout(1500);

// ---- recording ----
const cdp = await context.newCDPSession(page);
const frames = [];
let n = 0;
cdp.on("Page.screencastFrame", async (f) => {
  const file = path.join(FRAMES, `f${String(n++).padStart(6, "0")}.jpg`);
  writeFileSync(file, Buffer.from(f.data, "base64"));
  frames.push({ file, ts: f.metadata.timestamp });
  await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 95, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });

const say = (t) => page.evaluate((t) => window.__demo.caption(t), t);
const card = (html) => page.evaluate((h) => window.__demo.card(h), html);
const point = (x, y) => page.evaluate(([x, y]) => window.__demo.cursor(x, y), [x, y]);
async function moveTo(locator, { click = false, dy = 0 } = {}) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2 + dy;
  await point(x, y);
  await page.mouse.move(x, y, { steps: 18 });
  await sleep(850);
  if (click) {
    await page.evaluate(([x, y]) => window.__demo.ripple(x, y), [x, y]);
    await sleep(120);
    await locator.click();
  }
}
async function glide(by, ms = 2600) {
  const steps = Math.round(ms / 40);
  for (let i = 0; i < steps; i++) {
    await page.evaluate((d) => window.scrollBy(0, d), by / steps);
    await sleep(40);
  }
}
const mark = `<div class="mark">${logo}</div>`;

// 1. the title card
scene("title");
await sleep(400);
await card(`${mark}<h1>Turn any spreadsheet into a <em>dashboard.</em></h1><p>Dropboard</p>`);
await sleep(2600);
await card("");
await sleep(700);

// 2. drop a file
scene("drop");
await say("Start with any spreadsheet");
await point(760, 420);
await sleep(1100);
await page.setInputFiles('input[type="file"]', FILE);
await page.getByTestId("kpi-value").first().waitFor({ timeout: 60_000 });
scene("dashboard");
await sleep(1000);
await say("Charts chosen for your columns, in seconds");
await sleep(1200);
await glide(700, 2800);
await sleep(600);
await glide(-700, 1200);
await sleep(400);
await say("");

// 3. insights
scene("insights");
await say("Insights, checked against chance");
await moveTo(page.getByRole("tab", { name: "Insights" }), { click: true });
await sleep(3200);
await say("");

// 4. the story
scene("story");
await say("A story you can save as an image");
await moveTo(page.getByRole("tab", { name: "Story" }), { click: true });
await sleep(2200);
await glide(520, 2200);
await sleep(1000);
await glide(-520, 900);
await say("");

// 5. ask Pilot
await moveTo(page.getByRole("tab", { name: "Dashboard" }), { click: true });
await sleep(800);
scene("ask");
await say("Ask in plain English. Pilot never sees your rows");
const ask = page.getByLabel("Question about your data");
await moveTo(ask, { click: true });
await ask.pressSequentially("Which priority has the slowest resolution time?", { delay: 38 });
await sleep(400);
await moveTo(page.getByRole("button", { name: "Ask", exact: true }), { click: true });
await page.getByText(/Thinking/).waitFor({ state: "hidden", timeout: 90_000 }).catch(() => {});
await sleep(3200);
await say("");

// 6. publish a read-only link
scene("share");
await say("Share a read-only link, never your rows");
await moveTo(page.getByRole("button", { name: "Publish", exact: true }), { click: true });
const dialog = page.getByRole("dialog");
await sleep(900);
await moveTo(dialog.getByRole("button", { name: "Create link" }), { click: true });
await dialog.getByTestId("share-link").waitFor({ timeout: 30_000 });
await page.evaluate(() => {
  const el = document.querySelector('[data-testid="share-link"]');
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  set.call(el, el.value.replace(/^https?:\/\/[^/]+/, "https://dropboard.de"));
});
await sleep(2400);
await say("");

// 7. the closing card
scene("outro");
await card(`${mark}<h1>Your data stays <em>yours.</em></h1><p>Free to try at dropboard.de</p>`);
await sleep(3200);

await cdp.send("Page.stopScreencast");
await sleep(500);
await browser.close();

// ---- frames to video ----
const last = frames.at(-1);
const list = frames.map((f, i) => `file '${f.file.replace(/\\/g, "/")}'\nduration ${(((frames[i + 1]?.ts ?? last.ts + 1) - f.ts) || 0.04).toFixed(4)}`).join("\n");
const listFile = path.join(OUT, "frames.txt");
writeFileSync(listFile, `${list}\nfile '${last.file.replace(/\\/g, "/")}'\n`);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listFile, "-vf", "fps=30,scale=1920:1080:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-crf", "17", "-preset", "slow", "-movflags", "+faststart", path.join(OUT, "demo.mp4")], { stdio: "inherit" });
writeFileSync(path.join(OUT, "scenes.json"), JSON.stringify(Object.fromEntries(Object.entries(scenes).map(([k, v]) => [k, Number((v - frames[0].ts).toFixed(2))])), null, 2));
console.log(`${frames.length} frames, ${(last.ts - frames[0].ts).toFixed(1)} s -> out/demo.mp4`);
