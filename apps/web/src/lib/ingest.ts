import { buildProfile, CITY_NAME_HINT, detectCityColumn, detectCoordinates, detectPlaceColumn, detectZipColumn, findFlowColumns, MAX_CITIES, q, tidyColumnNames, ZIP_NAME, type Range, type TableProfile } from "@dropboard/engine";
import { DuckDBDataProtocol } from "@duckdb/duckdb-wasm";
import { getDb, resetDb, runQuery } from "./duckdb";
import { loadCities } from "./cities";
import { XlsxError, xlsxToCsv as xlsxToCsvStream } from "./xlsx-stream";

export const MAX_FILE_BYTES = 200 * 1024 * 1024;

const csvCell = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The old, whole-workbook reader. It needs several times the file's size in memory, so it is only a fallback for small files. */
async function xlsxToCsvWhole(file: File): Promise<string> {
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

const FALLBACK_MAX_BYTES = 20 * 1024 * 1024;

/** Turn a spreadsheet into a CSV the database can read, streaming it so a very large sheet does not need much memory. */
async function xlsxToCsvFile(file: File, onStage?: (message: string) => void): Promise<File> {
  try {
    const { csv } = await xlsxToCsvStream(file, (f) => onStage?.(`Reading the spreadsheet, ${Math.round(f * 100)}%`));
    return new File([csv], "upload.csv", { type: "text/csv" });
  } catch (e) {
    // an unusual file the streaming reader does not understand: a small one is still safe to read the old way
    if (e instanceof XlsxError && file.size <= FALLBACK_MAX_BYTES) return new File([await xlsxToCsvWhole(file)], "upload.csv", { type: "text/csv" });
    if (e instanceof XlsxError) throw new Error(`${e.message} Try saving it as a CSV from your spreadsheet program.`);
    throw e;
  }
}

/** A browser that runs out of room says so in many ways. Say what happened and what to do about it. */
function friendlyLoadError(e: unknown): Error {
  const message = e instanceof Error ? e.message : String(e);
  if (/out of memory|memory|allocation|bad_alloc|RangeError|unreachable|abort/i.test(message)) {
    return new Error("This file is too big for your browser to hold. Try a smaller part of it, or remove columns you do not need and upload it again.");
  }
  return e instanceof Error ? e : new Error(message);
}

export interface Loaded {
  title: string;
  profile: TableProfile;
}

/** What the database raised when it ran out of room. It words this several ways, and the worker can also just stop. */
const isMemoryError = (e: unknown) => /out of memory|failed to allocate|memory limit|bad_alloc|memory access out of bounds|Aborted\(|unreachable|RangeError/i.test(e instanceof Error ? e.message : String(e));

/**
 * About how many rows a text file has, counted as the file streams past: the line breaks, less the header. It holds nothing,
 * so it works when the database has no room left. A quoted line break inside a cell makes it a little high.
 */
async function countLines(file: Blob): Promise<number> {
  let lines = 0;
  let last = 10;
  const reader = file.stream().getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (let i = 0; i < value.length; i++) if (value[i] === 10) lines++;
    last = value[value.length - 1];
  }
  // a last line with no line break after it still counts
  return Math.max(0, lines + (last === 10 ? 0 : 1) - 1);
}

/** How many rows to keep, in turn, when a file is too big to hold: a random sample, taken as the file streams past. */
const SAMPLE_SIZES = [1_000_000, 250_000, 50_000];

/** Load a file into the in-browser DuckDB table `data` and profile it. Rows never leave the browser. */
export async function loadFile(file: File, onStage?: (message: string) => void): Promise<Loaded> {
  if (file.size > MAX_FILE_BYTES) throw new Error("File is larger than 200 MB.");
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const title = file.name.replace(/\.[^.]+$/, "");
  const kind = ext === "xlsx" ? "xlsx" : ext === "csv" || ext === "tsv" || ext === "txt" ? "csv" : ext === "json" || ext === "ndjson" || ext === "jsonl" ? "json" : null;
  if (!kind) throw new Error("Unsupported file type. Use .xlsx, .csv, .json or .ndjson.");

  // a spreadsheet is turned into CSV once, then the database reads that
  const readable = kind === "xlsx" ? await xlsxToCsvFile(file, onStage) : file;
  const name = kind === "json" ? "upload.json" : "upload.csv";
  const source = kind === "json" ? "read_json_auto('upload.json')" : "read_csv_auto('upload.csv', header=true, sample_size=50000)";
  const create = (sample?: number) => `CREATE OR REPLACE TABLE data AS SELECT * FROM ${source}${sample ? ` USING SAMPLE reservoir(${sample} ROWS) REPEATABLE (42)` : ""}`;

  const run = async (sql: string) => {
    const db = await getDb();
    await db.registerFileHandle(name, readable, DuckDBDataProtocol.BROWSER_FILEREADER, true);
    const conn = await db.connect();
    try {
      await conn.query(sql);
    } finally {
      await conn.close();
    }
  };

  onStage?.("Loading the rows");
  let sample: { rows: number; of: number } | undefined;
  try {
    await run(create());
  } catch (e) {
    if (!isMemoryError(e)) throw friendlyLoadError(e);
    // Out of room. Start over with a fresh database and keep a random sample, smaller each time until it fits.
    let loaded = 0;
    for (const size of SAMPLE_SIZES) {
      onStage?.(`The file is too big to hold in full, so reading a sample of ${size.toLocaleString()} rows`);
      await resetDb();
      try {
        await run(create(size));
        loaded = size;
        break;
      } catch (again) {
        if (!isMemoryError(again)) throw friendlyLoadError(again);
      }
    }
    if (!loaded) {
      await resetDb();
      throw friendlyLoadError(e);
    }
    const [kept] = (await runQuery("SELECT count(*) AS n FROM data")) as { n: number }[];
    // counting the file's lines holds nothing, so it works where the load did not fit
    let of = 0;
    try {
      of = kind === "json" ? 0 : await countLines(readable);
    } catch {
      // without the full count the notice just says a sample
    }
    // a sample as big as the file is the whole file, whatever it took to get it in: say nothing then
    const complete = Number(kept.n) < loaded || (of > 0 && of <= Number(kept.n));
    if (!complete) sample = { rows: Number(kept.n), of };
  }
  onStage?.("Understanding the columns");
  await tidyColumnNames(runQuery);
  const profile = await profileTable();
  return { title, profile: sample ? { ...profile, sample } : profile };
}

export async function profileTable(): Promise<TableProfile> {
  // columns, ranges, counts and whether the table is one row per entity per period: shared with the tests
  const base = await buildProfile(runQuery);
  const { columns } = base;

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

  // a column of ZIP codes, named like one: text or whole numbers, with any number of values
  let zips: string | undefined;
  if (!states) {
    for (const c of columns.filter((c) => ZIP_NAME.test(c.name) && (c.type === "string" || (c.type === "number" && c.integer === true)) && c.distinct >= 2).slice(0, 3)) {
      const values = (await runQuery(`SELECT DISTINCT ${q(c.name)} AS v FROM data WHERE ${q(c.name)} IS NOT NULL LIMIT 300`)).map((v) => v.v);
      if (detectZipColumn(c.name, values)) {
        zips = c.name;
        break;
      }
    }
  }

  // a column named like a place, with more values than a country list allows, might be cities: the list is fetched only then
  let cities: string | undefined;
  let flows: { from: string; to: string } | undefined;
  const maybeCities = columns.filter((c) => c.type === "string" && c.distinct >= 2 && c.distinct <= MAX_CITIES && c.name !== countries && c.name !== states && CITY_NAME_HINT.test(c.name)).slice(0, 4);
  if (maybeCities.length) {
    try {
      const index = await loadCities();
      const found: string[] = [];
      for (const c of maybeCities) {
        const values = (await runQuery(`SELECT DISTINCT ${q(c.name)} AS v FROM data WHERE ${q(c.name)} IS NOT NULL LIMIT ${MAX_CITIES}`)).map((v) => v.v);
        if (detectCityColumn(c.name, values, c.distinct, index)) found.push(c.name);
      }
      cities = found[0];
      // an origin and a destination, both cities: the routes between them
      flows = findFlowColumns(found);
    } catch {
      // without the list there is no city map, and everything else still works
    }
  }

  return { ...base, ...(coordinates ? { coordinates } : {}), ...(countries ? { countries } : {}), ...(states ? { states } : {}), ...(zips ? { zips } : {}), ...(cities ? { cities } : {}), ...(flows ? { flows } : {}) };
}
