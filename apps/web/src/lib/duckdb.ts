import * as duckdb from "@duckdb/duckdb-wasm";
import { cellKind, normalizeCell } from "./cells";

let dbPromise: Promise<duckdb.AsyncDuckDB> | null = null;

/** Lazily start DuckDB-WASM in its own Web Worker, using self-hosted assets (see scripts/copy-duckdb.mjs). */
export function getDb(): Promise<duckdb.AsyncDuckDB> {
  dbPromise ??= (async () => {
    const bundle = await duckdb.selectBundle({
      mvp: { mainModule: "/duckdb/duckdb-mvp.wasm", mainWorker: "/duckdb/duckdb-browser-mvp.worker.js" },
      eh: { mainModule: "/duckdb/duckdb-eh.wasm", mainWorker: "/duckdb/duckdb-browser-eh.worker.js" },
    });
    const worker = new Worker(bundle.mainWorker!);
    const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    return db;
  })();
  return dbPromise;
}

/** Run a query and return plain JS rows: dates as ISO strings, DECIMAL/BigInt as numbers. */
export async function runQuery(sql: string): Promise<Record<string, unknown>[]> {
  const db = await getDb();
  const conn = await db.connect();
  try {
    const result = await conn.query(sql);
    const kinds = new Map(result.schema.fields.map((f) => [f.name, cellKind(String(f.type))]));
    return result.toArray().map((row) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row.toJSON())) {
        out[k] = normalizeCell(kinds.get(k) ?? null, v);
      }
      return out;
    });
  } finally {
    await conn.close();
  }
}
