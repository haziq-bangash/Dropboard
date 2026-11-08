// Builds the Product Hunt gallery images and thumbnail from the real screenshots in out/raw.
//   node marketing/producthunt/compose.mjs
// Output: out/gallery/NN-name.png (1270x760, the size Product Hunt recommends), out/gallery-2x/ (same, twice the pixels),
// and out/thumbnail-480.png. The type is the app's own: Instrument Serif and Geist, loaded from Google Fonts.
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, "out");
const SLIDES = path.join(OUT, "slides");
for (const d of ["slides", "gallery", "gallery-2x"]) mkdirSync(path.join(OUT, d), { recursive: true });
const art = (name) => `file:///${path.join(ROOT, "..", "..", "apps", "web", "public", "art", name).replace(/\\/g, "/")}`;
const logoSvg = readFileSync(path.join(ROOT, "..", "..", "apps", "web", "public", "brand", "logo-mark.svg"), "utf8");

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1270px;height:760px;overflow:hidden}
body{background:#FDF6E3;color:#233038;font-family:'Geist',system-ui,sans-serif;position:relative}
h1{font-family:'Instrument Serif',Georgia,serif;font-weight:400;font-size:78px;line-height:.98;letter-spacing:-.5px}
h1 em{font-style:italic}
.sub{font-size:24px;line-height:1.4;color:#425058;margin-top:20px}
.abs{position:absolute}
.center{position:absolute;left:0;right:0;text-align:center}
.block{position:absolute;background:#F4D47C}
.frame{position:absolute;border-radius:22px;overflow:hidden;background:#fff;border:1px solid rgba(35,48,56,.14);box-shadow:0 40px 80px -30px rgba(7,80,86,.45),0 8px 24px -8px rgba(35,48,56,.18)}
.frame img{display:block;width:100%;height:100%}
.chip{position:absolute;display:inline-block;padding:9px 18px;border-radius:999px;font-size:20px;font-weight:500;background:#fff;box-shadow:0 6px 16px -6px rgba(35,48,56,.3)}
.brand{position:absolute;left:70px;bottom:40px;display:flex;align-items:center;gap:12px;font-weight:600;font-size:22px}
.brand svg{width:38px;height:38px;border-radius:9px}
.url{position:absolute;right:70px;bottom:46px;font-size:20px;color:#5C6B73}
.tile{position:absolute;border-radius:36px;overflow:hidden;padding:36px}
.big{font-family:'Instrument Serif',serif;line-height:.9}
.big em{font-style:italic}
`;

const brand = `<div class="brand">${logoSvg.replace("<svg ", "<svg ")}<span>Dropboard</span></div>`;
const url = `<div class="url">dropboard.de</div>`;
const raw = (n) => `../raw/${n}.png`;

/**
 * A crop of a 2880x1800 screenshot, drawn at a given width. `c` is the share to cut from each side, and the height follows from the
 * crop, so the picture is never stretched.
 */
const crop = (name, left, top, width, c = {}) => {
  const { l = 0, t = 0, r = 0, b = 0 } = c;
  const height = Math.round((width * (1 - t - b) * 1800) / ((1 - l - r) * 2880));
  return `<div class="frame" style="left:${left}px;top:${top}px;width:${width}px;height:${height}px"><img src="${raw(name)}" style="object-fit:fill;object-view-box:inset(${t * 100}% ${r * 100}% ${b * 100}% ${l * 100}%)"></div>`;
};
/** A whole picture at a given width, height from its own shape. */
const whole = (name, left, top, width, w, h, extra = "") => `<div class="frame" style="left:${left}px;top:${top}px;width:${width}px;height:${Math.round((width * h) / w)}px;${extra}"><img src="${raw(name)}"></div>`;

// the sidebar takes the left fifth of every app screenshot; a crop without it shows only the page itself
const NOSIDE = 0.2;

const slides = {
  "01-hero": `
    <div class="block" style="left:52px;top:150px;width:96px;height:190px"></div>
    <div class="abs" style="left:70px;top:112px;width:540px"><h1 style="font-size:84px">Turn any spreadsheet into a <em>dashboard.</em></h1>
      <p class="sub">Drop a CSV, Excel or JSON file. Charts, insights and a story appear in seconds.</p></div>
    <span class="chip" style="left:72px;top:556px;transform:rotate(-3deg)">.csv</span>
    <span class="chip" style="left:166px;top:568px;transform:rotate(2deg)">.xlsx</span>
    <span class="chip" style="left:268px;top:554px;transform:rotate(-2deg)">.json</span>
    ${crop("store-charts", 650, 84, 740, { l: NOSIDE, t: 0.04 })}
    ${brand}`,

  "02-dashboard": `
    <div class="center" style="top:50px"><h1>Drop a file. <em>Get a dashboard.</em></h1>
      <p class="sub" style="margin-top:12px">Headline numbers and the right charts, chosen for your columns.</p></div>
    ${crop("store-charts", 170, 262, 930, { l: NOSIDE, t: 0.02 })}`,

  "03-pilot": `
    <div class="center" style="top:50px"><h1>Ask your data in <em>plain English.</em></h1>
      <p class="sub" style="margin-top:12px">Pilot sees your column names and counts. Never your rows.</p></div>
    ${crop("pilot-page", 130, 262, 1010, { l: NOSIDE + 0.005, t: 0.27, b: 0.25, r: 0.02 })}
    <span class="chip" style="left:770px;top:566px;transform:rotate(-2deg);background:#F4D47C">Answers are computed in your browser</span>`,

  "04-insights": `
    <div class="center" style="top:50px"><h1>Insights, <em>found for you.</em></h1>
      <p class="sub" style="margin-top:12px">Trends, relationships, outliers and data problems, each checked against chance.</p></div>
    ${crop("support-insights", 135, 262, 1000, { l: NOSIDE, t: 0.26, b: 0.14, r: 0.02 })}`,

  "05-story": `
    <div class="block" style="left:52px;top:130px;width:96px;height:200px"></div>
    <div class="abs" style="left:70px;top:96px;width:450px"><h1>A story, <em>not just charts.</em></h1>
      <p class="sub">The strongest finding becomes a one-page story. Save it as an image.</p></div>
    ${crop("support-story", 530, 110, 800, { l: NOSIDE, t: 0.25, b: 0.02, r: 0.02 })}
    ${brand}`,

  "06-privacy": `
    <div class="center" style="top:50px"><h1>Your rows <em>never leave</em> your browser.</h1></div>
    <div class="tile" style="left:70px;top:210px;width:420px;height:420px;background:#075056;color:#FDF6E3">
      <div style="position:absolute;inset:0;background:url('${art("topo-lines-light.svg")}') center/cover;opacity:.22"></div>
      <div style="position:relative;height:100%;display:flex;flex-direction:column;justify-content:flex-end">
        <div class="big" style="font-size:190px">0</div><div style="font-size:26px;font-weight:500;margin-top:8px">rows uploaded to our servers</div>
        <div style="font-size:18px;opacity:.9;margin-top:6px">Files are read on your own device.</div></div></div>
    <div class="tile" style="left:510px;top:210px;width:420px;height:420px;background:#F4D47C">
      <div style="height:100%;display:flex;flex-direction:column;justify-content:flex-end">
        <span class="chip" style="position:static;align-self:flex-start;margin-bottom:auto;background:#fff;transform:rotate(-2deg)">Pilot</span>
        <div class="big" style="font-size:64px">Names and counts, <em>never rows</em></div>
        <div style="font-size:18px;margin-top:14px">The assistant is told column names, types and counts. Nothing from inside a cell.</div></div></div>
    <div class="tile" style="left:950px;top:210px;width:250px;height:420px;background:linear-gradient(135deg,#FFD59A,#FF9A45)">
      <div style="height:100%;display:flex;flex-direction:column;justify-content:flex-end">
        <div class="big" style="font-size:50px">Frankfurt, <em>Germany</em></div>
        <div style="font-size:18px;margin-top:12px">Hosted in the EU, behind HTTPS.</div></div></div>
    ${brand}${url}`,

  "07-share": `
    <div class="block" style="left:52px;top:130px;width:96px;height:200px"></div>
    <div class="abs" style="left:70px;top:96px;width:440px"><h1>Share a link, <em>not your data.</em></h1>
      <p class="sub">Read-only snapshots with an optional password. Revoke any time.</p></div>
    ${crop("shared-view", 560, 90, 690, { b: 0.12 })}
    ${whole("publish-dialog", 400, 400, 380, 768, 536)}
    ${brand}`,

  "08-more": `
    <div class="block" style="left:52px;top:130px;width:96px;height:200px"></div>
    <div class="abs" style="left:70px;top:96px;width:420px"><h1>Maps, heatmaps, calendars <em>and more.</em></h1>
      <p class="sub">It picks the chart that suits your data.</p></div>
    ${[
      ["card-delivery-average-delivery-minutes-by-country", 520, 96, -1.2],
      ["card-store-revenue-by-region-and-category", 890, 120, 1],
      ["card-store-rows-per-day-by-order-date", 520, 340, 1],
      ["card-store-how-revenue-varies-by-region", 890, 364, -1],
    ]
      .map(([n, x, y, r]) => whole(n, x, y, 350, 1096, 672, `transform:rotate(${r}deg)`))
      .join("")}
    ${brand}`,
};

const browser = await chromium.launch();
for (const [scale, folder] of [[1, "gallery"], [2, "gallery-2x"]]) {
  const context = await browser.newContext({ viewport: { width: 1270, height: 760 }, deviceScaleFactor: scale });
  const page = await context.newPage();
  for (const [name, body] of Object.entries(slides)) {
    const file = path.join(SLIDES, `${name}.html`);
    writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${body}</body></html>`);
    await page.goto(`file:///${file.replace(/\\/g, "/")}`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(OUT, folder, `${name}.png`) });
  }
  await context.close();
}

// the thumbnail: the mark on cream, square
const thumb = await browser.newContext({ viewport: { width: 480, height: 480 }, deviceScaleFactor: 1 });
const tp = await thumb.newPage();
const tf = path.join(SLIDES, "thumbnail.html");
writeFileSync(tf, `<!doctype html><html><body style="margin:0;width:480px;height:480px;background:#FDF6E3;display:grid;place-items:center;position:relative;overflow:hidden"><div style="position:absolute;left:0;top:0;width:150px;height:150px;background:#F4D47C"></div><div style="position:absolute;right:-40px;bottom:-40px;width:200px;height:200px;border-radius:100px;background:linear-gradient(135deg,#FFD59A,#FF9A45)"></div>${logoSvg.replace("<svg ", '<svg width="300" height="300" style="position:relative;filter:drop-shadow(0 20px 30px rgba(7,80,86,.35))" ')}</body></html>`);
await tp.goto(`file:///${tf.replace(/\\/g, "/")}`);
await tp.screenshot({ path: path.join(OUT, "thumbnail-480.png") });
await browser.close();
console.log("done:", Object.keys(slides).length, "images + thumbnail");
