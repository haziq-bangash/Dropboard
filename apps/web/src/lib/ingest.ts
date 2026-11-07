import { mapDuckDbType, q, type TableProfile } from "@dropboard/engine";
import { DuckDBDataProtocol } from "@duckdb/duckdb-wasm";
import { getDb, runQuery } from "./duckdb";

export const MAX_FILE_BYTES = 200 * 1024 * 1024;

const csvCell = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function xlsxToCsv(file: File): Promise<string> {
  const { default: readXlsx } = await import("read-excel-file/browser");
  const result: unknown = await readXlsx(file);
  // v9 returns every sheet as { sheet, data }[]; use the first non-empty one.
  const sheets = Array.isArray(result) && result.length && !Array.isArray(result[0])
    ? (result as { sheet: string; data: unknown[][] }[])
    : [{ sheet: "Sheet1", data: result as unknown[][] }];
  const first = sheets.find((s) => s.data.length > 0);
  if (!first) throw new Error("The spreadsheet is empty.");
  return first.data.map((row) => row.map(csvCell).join(",")).join("\n");
}

export interface Loaded {
  title: string;
  profile: TableProfile;
}

/** Load a file into the in-browser DuckDB table `data` and profile it. Rows never leave the browser. */
export async function loadFile(file: File): Promise<Loaded> {
  if (file.size > MAX_FILE_BYTES) throw new Error("File is larger than 200 MB.");
  const db = await getDb();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const title = file.name.replace(/\.[^.]+$/, "");

  let source: string;
  if (ext === "xlsx") {
    await db.registerFileText("upload.csv", await xlsxToCsv(file));
    source = "read_csv_auto('upload.csv', header=true, sample_size=50000)";
  } else if (ext === "csv" || ext === "tsv" || ext === "txt") {
    await db.registerFileHandle("upload.csv", file, DuckDBDataProtocol.BROWSER_FILEREADER, true);
    source = "read_csv_auto('upload.csv', header=true, sample_size=50000)";
  } else if (ext === "json" || ext === "ndjson" || ext === "jsonl") {
    await db.registerFileHandle("upload.json", file, DuckDBDataProtocol.BROWSER_FILEREADER, true);
    source = "read_json_auto('upload.json')";
  } else {
    throw new Error("Unsupported file type. Use .xlsx, .csv, .json or .ndjson.");
  }

  const conn = await db.connect();
  try {
    await conn.query(`CREATE OR REPLACE TABLE data AS SELECT * FROM ${source}`);
  } finally {
    await conn.close();
  }
  return { title, profile: await profileTable() };
}

async function profileTable(): Promise<TableProfile> {
  const cols = await runQuery("SELECT column_name, column_type FROM (DESCRIBE data)");
  const [{ n }] = (await runQuery("SELECT count(*) AS n FROM data")) as { n: number }[];
  if (!cols.length) throw new Error("No columns found in the file.");

  const stats = cols
    .map((c, i) => `count(*) - count(${q(String(c.column_name))}) AS nulls_${i}, approx_count_distinct(${q(String(c.column_name))}) AS dist_${i}`)
    .join(", ");
  const [row] = await runQuery(`SELECT ${stats} FROM data`);

  return {
    rowCount: n,
    columns: cols.map((c, i) => ({
      name: String(c.column_name),
      type: mapDuckDbType(String(c.column_type)),
      nullCount: Number(row[`nulls_${i}`]),
      distinct: Number(row[`dist_${i}`]),
    })),
  };
}
