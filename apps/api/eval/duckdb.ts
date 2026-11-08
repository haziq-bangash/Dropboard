import { createRequire } from "node:module";
import path from "node:path";
import { mapDuckDbType, q } from "@dropboard/engine";
import type { AiTable } from "@dropboard/spec";

// DuckDB-WASM in Node (the blocking build), so scoring answers needs no native binary and runs the same SQL engine the
// browser does.
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const duckdb = require("@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs");

export type Cell = string | null;
export type Result = { columns: string[]; rows: Cell[][] };

export interface Sql {
  /** Load a CSV as the table `data`. */
  load(csv: string): void;
  /** Run a statement that changes the table (renaming a column), returning nothing. */
  exec(sql: string): void;
  /** Run a query and get every cell back as text (or null), so comparisons do not depend on how types are encoded. */
  run(sql: string): Result;
  /** Names, types and counts only: the same summary Pilot is allowed to see. */
  profile(): AiTable;
}

export async function createSql(): Promise<Sql> {
  const dist = path.dirname(require.resolve("@duckdb/duckdb-wasm/dist/duckdb-eh.wasm"));
  const bundles = {
    mvp: { mainModule: path.join(dist, "duckdb-mvp.wasm"), mainWorker: null },
    eh: { mainModule: path.join(dist, "duckdb-eh.wasm"), mainWorker: null },
  };
  const db = await duckdb.createDuckDB(bundles, new duckdb.VoidLogger(), duckdb.NODE_RUNTIME);
  await db.instantiate(() => {});
  const conn = db.connect();

  const run = (sql: string): Result => {
    // every column cast to text: dates, decimals and big integers all arrive as plain strings
    const result = conn.query(`SELECT CAST(COLUMNS(*) AS VARCHAR) FROM (${sql.replace(/;+\s*$/, "")})`);
    const columns: string[] = result.schema.fields.map((f: { name: string }) => f.name);
    const rows = result.toArray().map((row: { toJSON(): Record<string, unknown> }) => {
      const json = row.toJSON();
      return columns.map((c) => (json[c] === null || json[c] === undefined ? null : String(json[c])));
    });
    return { columns, rows };
  };

  return {
    load(csv) {
      db.registerFileText("data.csv", csv);
      conn.query("CREATE OR REPLACE TABLE data AS SELECT * FROM read_csv_auto('data.csv', header=true, sample_size=-1)");
    },
    run,
    exec(sql) {
      conn.query(sql);
    },
    profile() {
      const cols = run("SELECT column_name, column_type FROM (DESCRIBE data)").rows;
      const rowCount = Number(run("SELECT count(*) FROM data").rows[0][0]);
      const stats = cols
        .map(([name], i) => `count(*) - count(${q(name!)}) AS nulls_${i}, approx_count_distinct(${q(name!)}) AS dist_${i}`)
        .join(", ");
      const [counts] = run(`SELECT ${stats} FROM data`).rows;
      return {
        rowCount,
        columns: cols.map(([name, type], i) => ({
          name: name!,
          type: mapDuckDbType(type!),
          nullCount: Number(counts[i * 2]),
          distinct: Number(counts[i * 2 + 1]),
        })),
      };
    },
  };
}
