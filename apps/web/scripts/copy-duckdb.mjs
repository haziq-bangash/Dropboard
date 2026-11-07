// Self-host DuckDB-WASM so data processing never depends on a third-party CDN.
import { cpSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const dist = join(process.cwd(), "node_modules", "@duckdb", "duckdb-wasm", "dist");
const out = join(process.cwd(), "public", "duckdb");
mkdirSync(out, { recursive: true });
for (const f of ["duckdb-mvp.wasm", "duckdb-eh.wasm", "duckdb-browser-mvp.worker.js", "duckdb-browser-eh.worker.js"]) {
  cpSync(join(dist, f), join(out, f));
}
console.log("copied duckdb-wasm assets to public/duckdb");
