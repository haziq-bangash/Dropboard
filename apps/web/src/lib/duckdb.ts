import * as duckdb from "@duckdb/duckdb-wasm";
import { cellKind, normalizeCell } from "./cells";

let dbPromise: Promise<duckdb.AsyncDuckDB> | null = null;
let dbWorker: Worker | null = null;

/** Hidden setting, for support and tests: a memory ceiling such as "400MB" that replaces the one worked out from the device. */
export const MEMORY_LIMIT_KEY = "dropboard-memory-limit";

/**
 * How much memory the database may use before it stops with an error. Without a ceiling a big file makes the tab run out
 * of memory and die with nothing to show; with one, the load fails cleanly and the app can fall back to a sample.
 */
export function memoryLimit(): string {
  try {
    const set = localStorage.getItem(MEMORY_LIMIT_KEY);
    if (set && /^\d+(MB|GB)$/i.test(set)) return set;
  } catch {
    // storage can be blocked: use the default
  }
  const gb = (navigator as { deviceMemory?: number }).deviceMemory;
  if (gb === undefined) return "1800MB";
  return gb >= 8 ? "2500MB" : gb >= 4 ? "1800MB" : "900MB";
}

/** Throw away the database and its worker, and start the next one fresh. Used after the database ran out of memory. */
export async function resetDb(): Promise<void> {
  const old = dbPromise;
  dbPromise = null;
  try {
    await (await old)?.terminate();
  } catch {
    // it may already be gone
  }
  dbWorker?.terminate();
  dbWorker = null;
}

/** Lazily start DuckDB-WASM in its own Web Worker, using self-hosted assets (see scripts/copy-duckdb.mjs). */
export function getDb(): Promise<duckdb.AsyncDuckDB> {
  dbPromise ??= (async () => {
    const bundle = await duckdb.selectBundle({
      mvp: { mainModule: "/duckdb/duckdb-mvp.wasm", mainWorker: "/duckdb/duckdb-browser-mvp.worker.js" },
      eh: { mainModule: "/duckdb/duckdb-eh.wasm", mainWorker: "/duckdb/duckdb-browser-eh.worker.js" },
    });
    const worker = new Worker(bundle.mainWorker!);
    dbWorker = worker;
    const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    const conn = await db.connect();
    try {
      await conn.query(`SET memory_limit='${memoryLimit()}'`);
    } finally {
      await conn.close();
    }
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
