import { mapDuckDbType, q, type ColumnProfile, type TableProfile } from "./profile";
import type { RunSql } from "./summarize";
import { findCustomers } from "./cohort";
import { detectPeriodKind } from "./periods";
import { isYearColumn, looksLikeId, timeColumn, timeExpression } from "./understand";

/** Text columns longer than this on average are notes, not categories. Only measured for columns with many distinct values. */
const TEXT_SAMPLE = 20_000;

/** Up to this many rows, distinct values are counted exactly. */
const EXACT_DISTINCT_ROWS = 200_000;

/** Most distinct values an entity column (the thing tracked over time) can have. */
const MAX_ENTITIES = 100;

/**
 * Read the loaded table `data` into a profile: columns and their types, how many are empty or distinct, the range of every
 * number column, and whether the table is one row per entity per period. The browser and the tests share this, so a file
 * is understood the same way in both.
 */
export async function buildProfile(run: RunSql): Promise<TableProfile> {
  const described = await run("SELECT column_name, column_type FROM (DESCRIBE data)");
  const [{ n }] = (await run("SELECT count(*) AS n FROM data")) as { n: number }[];
  if (!described.length) throw new Error("No columns found in the file.");
  const rowCount = Number(n);

  const base = described.map((c) => ({ name: String(c.column_name), type: mapDuckDbType(String(c.column_type)) }));
  // exact counts for a table of ordinary size, since "every value different" must be exact to tell an identifier from a name;
  // approximate ones for a big table, where an exact count costs a lot
  const distinct = (name: string) => (rowCount <= EXACT_DISTINCT_ROWS ? `count(DISTINCT ${q(name)})` : `approx_count_distinct(${q(name)})`);
  const counts = base.map((c, i) => `count(*) - count(${q(c.name)}) AS nulls_${i}, ${distinct(c.name)} AS dist_${i}`).join(", ");
  const [row] = await run(`SELECT ${counts} FROM data`);
  const columns: ColumnProfile[] = base.map((c, i) => ({ ...c, nullCount: Number(row[`nulls_${i}`]), distinct: Number(row[`dist_${i}`]) }));

  // the range of each number column, and whether all of its values are whole numbers
  const numbers = columns.filter((c) => c.type === "number");
  if (numbers.length) {
    const spans = numbers
      .map((c, i) => `CAST(min(${q(c.name)}) AS DOUBLE) AS lo_${i}, CAST(max(${q(c.name)}) AS DOUBLE) AS hi_${i}, count(*) FILTER (WHERE ${q(c.name)} <> floor(${q(c.name)})) AS frac_${i}`)
      .join(", ");
    const [r] = await run(`SELECT ${spans} FROM data`);
    numbers.forEach((c, i) => {
      const lo = Number(r[`lo_${i}`]);
      const hi = Number(r[`hi_${i}`]);
      if (Number.isFinite(lo) && Number.isFinite(hi)) {
        c.min = lo;
        c.max = hi;
      }
      c.integer = Number(r[`frac_${i}`]) === 0;
    });
  }

  // how long the text in a text column is, from a sample, for columns with enough different values that they might be notes
  for (const c of columns.filter((c) => c.type === "string" && c.distinct > 50)) {
    const [r] = await run(`SELECT avg(length(CAST(${q(c.name)} AS VARCHAR))) AS len FROM (SELECT ${q(c.name)} FROM data LIMIT ${TEXT_SAMPLE})`);
    const len = Number(r?.len);
    if (Number.isFinite(len)) c.textLength = Math.round(len);
  }

  // text columns of months, quarters or weekdays: a handful of their values is enough to tell
  for (const c of columns.filter((c) => c.type === "string" && c.distinct >= 2 && c.distinct <= 400).slice(0, 12)) {
    const values = (await run(`SELECT DISTINCT CAST(${q(c.name)} AS VARCHAR) AS v FROM data WHERE ${q(c.name)} IS NOT NULL LIMIT 60`)).map((r) => r.v);
    const kind = detectPeriodKind(values);
    if (kind) c.period = kind;
  }

  const profile: TableProfile = { rowCount, columns };
  const panel = await findPanel(profile, run);
  const withPanel = panel ? { ...profile, panel } : profile;
  // people who come back over months: only where the rows are not already one per entity per period
  const customers = panel ? undefined : findCustomers(withPanel);
  return customers ? { ...withPanel, customers } : withPanel;
}

/**
 * Is each row one entity at one period (a company in a year, a store in a week)? Found by testing that an entity column and
 * the time column together identify nearly every row, and that each entity appears in several periods.
 */
async function findPanel(profile: TableProfile, run: RunSql): Promise<TableProfile["panel"] | undefined> {
  const time = timeColumn(profile);
  if (!time || time.column.distinct < 3 || profile.rowCount < 12) return undefined;
  const t = timeExpression(time.column, time.kind);
  const rows = profile.rowCount;
  const candidates = profile.columns
    .filter((c) => c.type === "string" && c.distinct >= 2 && c.distinct <= MAX_ENTITIES && !looksLikeId(c, rows) && rows / c.distinct >= 3 && !isYearColumn(c, rows))
    .slice(0, 6);
  let best: { name: string; distinct: number; repeated: number } | undefined;
  for (const c of candidates) {
    const [r] = await run(`SELECT count(*) AS n, count(DISTINCT (${q(c.name)}, ${t})) AS k, count(DISTINCT ${q(c.name)}) AS e, count(DISTINCT ${t}) AS p FROM data WHERE ${q(c.name)} IS NOT NULL AND ${q(time.column.name)} IS NOT NULL`);
    const n = Number(r?.n);
    const k = Number(r?.k);
    const grid = Number(r?.e) * Number(r?.p);
    // one row per entity per period, and most of the entity-by-period grid filled: a table of events that happens to rarely repeat a pair is not a panel
    if (n > 0 && k / n >= 0.9 && grid > 0 && k / grid >= 0.5 && (!best || c.distinct > best.distinct)) best = { name: c.name, distinct: c.distinct, repeated: n - k };
  }
  return best ? { entity: best.name, time: time.column.name, ...(best.repeated > 0 ? { repeated: best.repeated } : {}) } : undefined;
}

/**
 * Tidy the column names a file arrived with: a name with spaces at its ends ("Company ") would show up that way in every
 * chart title and sentence. Names that would collide after tidying are left alone.
 */
export async function tidyColumnNames(run: RunSql): Promise<void> {
  const names = (await run("SELECT column_name FROM (DESCRIBE data)")).map((c) => String(c.column_name));
  const taken = new Set(names);
  for (const name of names) {
    const tidy = name.trim().replace(/\s+/g, " ");
    if (tidy && tidy !== name && !taken.has(tidy)) {
      await run(`ALTER TABLE data RENAME COLUMN ${q(name)} TO ${q(tidy)}`);
      taken.add(tidy);
    }
  }
}
