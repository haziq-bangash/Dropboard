// Times how long the live site takes to show its first numbers for a big CSV (rows, size and address can be changed).
//   node marketing/producthunt/measure-big-file.mjs            (1,400,000 rows against https://dropboard.de)
//   ROWS=1000000 URL=http://localhost:4310/ node marketing/producthunt/measure-big-file.mjs
// The file is read in the browser, so this costs the server nothing. Timings depend on the machine: say which one when quoting them.
import { chromium } from "@playwright/test";
import { createWriteStream, mkdtempSync, rmSync, statSync } from "node:fs";
import { once } from "node:events";
import { tmpdir, cpus, totalmem } from "node:os";
import path from "node:path";

const ROWS = Number(process.env.ROWS ?? 1_400_000);
const URL = process.env.URL ?? "https://dropboard.de/";
const dir = mkdtempSync(path.join(tmpdir(), "dropboard-big-"));
const file = path.join(dir, "orders.csv");

const regions = ["North", "South", "East", "West", "Central"];
const out = createWriteStream(file);
out.write("order_id,order_date,region,customer,quantity,unit_price,revenue\n");
let seed = 11;
const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
for (let i = 1; i <= ROWS; i++) {
  const q = 1 + Math.floor(rnd() * 8);
  const price = (5 + rnd() * 95).toFixed(2);
  const day = new Date(Date.UTC(2023, 0, 1) + Math.floor(rnd() * 700) * 86_400_000).toISOString().slice(0, 10);
  if (!out.write(`${i},${day},${regions[i % 5]},C${String(Math.floor(rnd() * 90_000)).padStart(5, "0")},${q},${price},${(q * Number(price)).toFixed(2)}\n`)) await once(out, "drain");
}
out.end();
await once(out, "finish");
const mb = statSync(file).size / 1024 / 1024;
console.log(`file: ${ROWS.toLocaleString()} rows, ${mb.toFixed(1)} MB`);
console.log(`machine: ${cpus().length} cores (${cpus()[0].model.trim()}), ${(totalmem() / 1024 ** 3).toFixed(0)} GB`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
for (let run = 1; run <= 3; run++) {
  await page.goto(URL, { waitUntil: "networkidle" });
  const start = Date.now();
  await page.setInputFiles('input[type="file"]', file);
  await page.getByTestId("kpi-value").first().waitFor({ timeout: 180_000 });
  const first = (Date.now() - start) / 1000;
  const shown = (await page.getByTestId("kpi-value").first().innerText()).trim();
  await page.getByRole("img", { name: /chart|map/i }).first().waitFor({ timeout: 120_000 }).catch(() => {});
  const charts = (Date.now() - start) / 1000;
  const sampled = await page.getByTestId("sample-notice").count();
  console.log(`run ${run}: first numbers in ${first.toFixed(1)} s (${shown}), first chart in ${charts.toFixed(1)} s${sampled ? ", used a sample" : ""}`);
}
await browser.close();
rmSync(dir, { recursive: true, force: true });
