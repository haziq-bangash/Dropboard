import { CITY_NAME_HINT, detectCityColumn, detectCoordinates, detectPlaceColumn, MAX_CITIES, mapDuckDbType, q, type Range, type TableProfile } from "@dropboard/engine";
import { DuckDBDataProtocol } from "@duckdb/duckdb-wasm";
import { getDb, runQuery } from "./duckdb";
import { loadCities } from "./cities";

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

export async function profileTable(): Promise<TableProfile> {
  const cols = await runQuery("SELECT column_name, column_type FROM (DESCRIBE data)");
  const [{ n }] = (await runQuery("SELECT count(*) AS n FROM data")) as { n: number }[];
  if (!cols.length) throw new Error("No columns found in the file.");

  const stats = cols
    .map((c, i) => `count(*) - count(${q(String(c.column_name))}) AS nulls_${i}, approx_count_distinct(${q(String(c.column_name))}) AS dist_${i}`)
    .join(", ");
  const [row] = await runQuery(`SELECT ${stats} FROM data`);

  const columns = cols.map((c, i) => ({
    name: String(c.column_name),
    type: mapDuckDbType(String(c.column_type)),
    nullCount: Number(row[`nulls_${i}`]),
    distinct: Number(row[`dist_${i}`]),
  }));

  // only number columns with a latitude or longitude style name need their range read
  const named = columns.filter((c) => c.type === "number" && /^(lat|latitude|lon|lng|long|longitude)$/i.test(c.name.trim().replace(/[ -]+/g, "_")));
  let coordinates: TableProfile["coordinates"];
  if (named.length >= 2) {
    const spans = named.map((c, i) => `min(${q(c.name)}) AS lo_${i}, max(${q(c.name)}) AS hi_${i}`).join(", ");
    const [r] = await runQuery(`SELECT ${spans} FROM data`);
    const ranges: Record<string, Range> = {};
    named.forEach((c, i) => (ranges[c.name] = { min: Number(r[`lo_${i}`]), max: Number(r[`hi_${i}`]) }));
    const found = detectCoordinates(ranges);
    if (found) coordinates = { lat: found.lat, lon: found.lon };
  }

  // a text column with a modest number of distinct values might be countries: look at the distinct values only
  let countries: string | undefined;
  let states: string | undefined;
  for (const c of columns.filter((c) => c.type === "string" && c.distinct >= 2 && c.distinct <= 300).slice(0, 12)) {
    const values = (await runQuery(`SELECT DISTINCT ${q(c.name)} AS v FROM data WHERE ${q(c.name)} IS NOT NULL LIMIT 300`)).map((v) => v.v);
    const found = detectPlaceColumn(c.name, values, c.distinct);
    if (found?.kind === "country" && !countries) countries = c.name;
    if (found?.kind === "us-state" && !states) states = c.name;
    if (countries && states) break;
  }

  // a column named like a place, with more values than a country list allows, might be cities: the list is fetched only then
  let cities: string | undefined;
  const maybeCities = columns.filter((c) => c.type === "string" && c.distinct >= 2 && c.distinct <= MAX_CITIES && c.name !== countries && c.name !== states && CITY_NAME_HINT.test(c.name)).slice(0, 4);
  if (maybeCities.length) {
    try {
      const index = await loadCities();
      for (const c of maybeCities) {
        const values = (await runQuery(`SELECT DISTINCT ${q(c.name)} AS v FROM data WHERE ${q(c.name)} IS NOT NULL LIMIT ${MAX_CITIES}`)).map((v) => v.v);
        if (detectCityColumn(c.name, values, c.distinct, index)) {
          cities = c.name;
          break;
        }
      }
    } catch {
      // without the list there is no city map, and everything else still works
    }
  }

  return { rowCount: n, columns, ...(coordinates ? { coordinates } : {}), ...(countries ? { countries } : {}), ...(states ? { states } : {}), ...(cities ? { cities } : {}) };
}
