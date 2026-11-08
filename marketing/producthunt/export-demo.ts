// Writes the sample datasets as CSV files, to drop into the app while recording. Run from apps/api:
//   cd apps/api && pnpm exec tsx ../../marketing/producthunt/export-demo.ts
import { STARTERS } from "@dropboard/engine";
import { mkdirSync, writeFileSync } from "node:fs";

mkdirSync("../../marketing/producthunt/out/demo", { recursive: true });
for (const s of STARTERS) writeFileSync(`../../marketing/producthunt/out/demo/${s.id === "support-tickets" ? "support-tickets" : s.id}.csv`, s.csv());
console.log("wrote", STARTERS.map((s) => s.id).join(", "));
