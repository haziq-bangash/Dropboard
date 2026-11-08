import type { InsightInput, SeriesInput } from "./insights";
import { aggregate, isCategory, isMeasure, label } from "./suggest";
import { q, type TableProfile } from "./profile";

/** Run one query against the table `data` and return its rows. The browser and the tests each supply their own. */
export type RunSql = (sql: string) => Promise<Record<string, unknown>[]>;

const MAX_SERIES = 4;
const MAX_NUMERIC = 8;
const MAX_CATEGORIES = 4;
const SAMPLE_ROWS = 5000;
const MIN_POINTS = 8;
const MAX_POINTS = 400;

type Unit = "day" | "week" | "month";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function labelFor(ms: number, unit: Unit): string {
  const d = new Date(ms);
  const month = `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  if (unit === "month") return month;
  const day = `${d.getUTCDate()} ${month}`;
  return unit === "week" ? `the week of ${day}` : day;
}

/**
 * Collect the small summaries the findings engine works on, with a handful of SQL queries over the loaded table:
 * a few measures over time, a sample of values for relationships and outliers, and category counts. Nothing here reads
 * the table into memory, and nothing leaves the browser.
 */
export async function gatherInsightInput(profile: TableProfile, run: RunSql): Promise<InsightInput> {
  const { rowCount, columns } = profile;
  const measures = columns.filter((c) => isMeasure(c, rowCount));
  const categories = columns.filter((c) => isCategory(c, rowCount));
  const input: InsightInput = {
    rowCount,
    missing: columns.map((c) => ({ column: c.name, nullCount: c.nullCount })),
  };

  // ---- measures over time ----
  const date = [...columns.filter((c) => c.type === "date")].sort((a, b) => b.distinct - a.distinct)[0];
  if (date && measures.length) {
    const d = q(date.name);
    const [range] = await run(`SELECT CAST(epoch_ms(CAST(min(${d}) AS TIMESTAMP)) AS DOUBLE) AS lo, CAST(epoch_ms(CAST(max(${d}) AS TIMESTAMP)) AS DOUBLE) AS hi FROM data WHERE ${d} IS NOT NULL`);
    const lo = Number(range?.lo);
    const hi = Number(range?.hi);
    const days = (hi - lo) / 86_400_000;
    if (Number.isFinite(days) && days >= MIN_POINTS) {
      // the finest step that still leaves a readable number of points
      const unit: Unit = days / 30 >= 24 ? "month" : days >= 120 ? "week" : "day";
      const step = unit === "month" ? 30 : unit === "week" ? 7 : 1;
      if (days / step <= MAX_POINTS) {
        const series: SeriesInput[] = [];
        for (const m of measures.slice(0, MAX_SERIES)) {
          const agg = aggregate(m);
          const rows = await run(
            `SELECT CAST(epoch_ms(CAST(date_trunc('${unit}', ${d}) AS TIMESTAMP)) AS DOUBLE) AS x, CAST(${agg}(${q(m.name)}) AS DOUBLE) AS y FROM data WHERE ${d} IS NOT NULL AND ${q(m.name)} IS NOT NULL GROUP BY 1 ORDER BY 1`,
          );
          let points = rows.map((r) => ({ x: Number(r.x), y: Number(r.y) })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
          // The first and last period are usually only partly covered, which would look like a rise or a drop. Dropping
          // them matters for sums; an average over a few days is still an average.
          if (agg === "sum" && unit !== "day" && points.length > MIN_POINTS + 2) {
            const startsMidPeriod = lo > points[0].x;
            const endsMidPeriod = hi < points[points.length - 1].x + (unit === "month" ? 28 : 6) * 86_400_000;
            points = points.slice(startsMidPeriod ? 1 : 0, endsMidPeriod ? points.length - 1 : undefined);
          }
          if (points.length >= MIN_POINTS) {
            series.push({ column: label(m), x: points.map((p) => p.x), y: points.map((p) => p.y), labels: points.map((p) => labelFor(p.x, unit)) });
          }
        }
        if (series.length) input.series = series;
      }
    }
  }

  // ---- values, row by row, for relationships and outliers ----
  const numeric = measures.slice(0, MAX_NUMERIC);
  if (numeric.length) {
    const cols = numeric.map((c, i) => `CAST(${q(c.name)} AS DOUBLE) AS c${i}`).join(", ");
    const sample = rowCount > SAMPLE_ROWS ? ` USING SAMPLE reservoir(${SAMPLE_ROWS} ROWS) REPEATABLE (42)` : "";
    const rows = await run(`SELECT ${cols} FROM data${sample}`);
    input.numeric = numeric.map((c, i) => ({
      column: c.name,
      values: rows.map((r) => {
        const v = r[`c${i}`];
        return v === null || v === undefined ? null : Number(v);
      }),
    }));
  }

  // ---- how many rows each category value has ----
  const cats = [];
  for (const c of categories.slice(0, MAX_CATEGORIES)) {
    const rows = await run(`SELECT CAST(${q(c.name)} AS VARCHAR) AS label, CAST(count(*) AS DOUBLE) AS count FROM data WHERE ${q(c.name)} IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 40`);
    cats.push({ column: c.name, counts: rows.map((r) => ({ label: String(r.label), count: Number(r.count) })) });
  }
  if (cats.length) input.categories = cats;

  // ---- where a total comes from: the first measure that adds up (money, units), split by each category ----
  const additive = measures.find((m) => aggregate(m) === "sum");
  if (additive) {
    const contributions = [];
    for (const c of categories.slice(0, MAX_CATEGORIES)) {
      const rows = await run(
        `SELECT CAST(${q(c.name)} AS VARCHAR) AS label, CAST(sum(${q(additive.name)}) AS DOUBLE) AS value FROM data WHERE ${q(c.name)} IS NOT NULL AND ${q(additive.name)} IS NOT NULL GROUP BY 1`,
      );
      contributions.push({ column: c.name, measure: additive.name, parts: rows.map((r) => ({ label: String(r.label), value: Number(r.value) })) });
    }
    if (contributions.length) input.contributions = contributions;
  }

  return input;
}
