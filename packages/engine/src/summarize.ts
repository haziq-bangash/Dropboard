import { ecod } from "./anomaly/ecod";
import { gatherCohorts } from "./cohort";
import { gatherText } from "./text";
import { gatherQuality } from "./quality";
import type { InsightInput, SeriesInput } from "./insights";
import { aggregate, isCategory, isMeasure, label } from "./suggest";
import { q, type TableProfile } from "./profile";
import { timeColumn, timeExpression, valueKind } from "./understand";

/** Run one query against the table `data` and return its rows. The browser and the tests each supply their own. */
export type RunSql = (sql: string) => Promise<Record<string, unknown>[]>;

const MAX_SERIES = 4;
const MAX_NUMERIC = 8;
const MAX_CATEGORIES = 4;
const SAMPLE_ROWS = 5000;
const MIN_POINTS = 8;
const MIN_YEAR_POINTS = 6;
const MAX_POINTS = 400;
const MAX_ENTITIES = 40;
/** A text column with more values than this is not grouped for concentration: it is closer to an identifier of single rows. */
const MAX_PARETO_GROUPS = 200_000;
/** Groups tested for one far from the rest: above this many values the total of each is too small a thing to compare. */
const MAX_GROUPS = 500;
/** A measure needs this many different values for rows to be unusual on it: a rating of one to five has no tails to speak of. */
const MIN_UNUSUAL_DISTINCT = 20;
const MAX_UNUSUAL_MEASURES = 8;
const MAX_UNUSUAL_ROWS = 50_000;
const MAX_UNUSUAL_SHOWN = 8;
/** At most this many unusual rows are left out of the group totals: more would make the query too long to be useful. */
const MAX_EXCLUDED_ROWS = 300;
const MAX_PANEL_MEASURES = 3;
const MAX_DUPLICATE_ROWS = 2_000_000;

type Unit = "day" | "week" | "month" | "year";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function labelFor(ms: number, unit: Unit): string {
  const d = new Date(ms);
  if (unit === "year") return String(d.getUTCFullYear());
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
  // a latitude or longitude is a position: totalling or averaging it means nothing
  const measures = columns.filter((c) => isMeasure(c, rowCount) && c.name !== profile.coordinates?.lat && c.name !== profile.coordinates?.lon);
  const categories = columns.filter((c) => isCategory(c, rowCount));
  const input: InsightInput = {
    rowCount,
    missing: columns.map((c) => ({ column: c.name, nullCount: c.nullCount })),
  };

  let qualitySeries: { column: string; x: number[]; unit: string; labels?: string[] } | undefined;

  // ---- rows that repeat an earlier row exactly (about half a second at a million rows, so very large files skip it) ----
  if (rowCount >= 2 && rowCount <= MAX_DUPLICATE_ROWS) {
    const [row] = await run(`SELECT CAST(count(*) - (SELECT count(*) FROM (SELECT DISTINCT * FROM data)) AS DOUBLE) AS copies FROM data`);
    const copies = Number(row?.copies);
    if (Number.isFinite(copies) && copies > 0) input.duplicates = { rows: copies };
  }

  // ---- measures over time ----
  const time = timeColumn(profile);
  if (time && measures.length) {
    // a year stored as a number becomes 1 January of that year, so it goes through the same steps as a date column
    const d = timeExpression(time.column, time.kind);
    const present = q(time.column.name);
    const [range] = await run(`SELECT CAST(epoch_ms(CAST(min(${d}) AS TIMESTAMP)) AS DOUBLE) AS lo, CAST(epoch_ms(CAST(max(${d}) AS TIMESTAMP)) AS DOUBLE) AS hi FROM data WHERE ${present} IS NOT NULL`);
    const lo = Number(range?.lo);
    const hi = Number(range?.hi);
    const days = (hi - lo) / 86_400_000;
    if (Number.isFinite(days) && days >= MIN_POINTS) {
      // the finest step that still leaves a readable number of points
      // a year column has one value per year, so it is already at its step
      const unit: Unit = time.kind === "year" ? "year" : days / 30 >= 24 ? "month" : days >= 120 ? "week" : "day";
      const step = unit === "year" ? 365 : unit === "month" ? 30 : unit === "week" ? 7 : 1;
      const minPoints = unit === "year" ? MIN_YEAR_POINTS : MIN_POINTS;
      if (days / step <= MAX_POINTS) {
        const series: SeriesInput[] = [];
        // In a table of entities over periods, a period that few entities reported (the latest year, a late joiner's first)
        // makes a total or an average look like a collapse or a surge. Only periods most entities are in are pooled.
        let complete: Set<number> | null = null;
        if (profile.panel && profile.panel.time === time.column.name) {
          const counts = await run(
            `SELECT CAST(epoch_ms(CAST(date_trunc('${unit}', ${d}) AS TIMESTAMP)) AS DOUBLE) AS x, CAST(count(DISTINCT ${q(profile.panel.entity)}) AS DOUBLE) AS n FROM data WHERE ${present} IS NOT NULL GROUP BY 1`,
          );
          const most = Math.max(...counts.map((r) => Number(r.n)));
          complete = new Set(counts.filter((r) => Number(r.n) >= most * 0.8).map((r) => Number(r.x)));
        }
        const inPanel = !!profile.panel && profile.panel.time === time.column.name;
        for (const m of measures.slice(0, MAX_SERIES)) {
          // a pooled average of a level or a rate across entities moves when entities join or leave: each entity's own series says it better
          if (inPanel && valueKind(m) !== "flow") continue;
          const agg = aggregate(m);
          const rows = await run(
            `SELECT CAST(epoch_ms(CAST(date_trunc('${unit}', ${d}) AS TIMESTAMP)) AS DOUBLE) AS x, CAST(${agg}(${q(m.name)}) AS DOUBLE) AS y FROM data WHERE ${d} IS NOT NULL AND ${q(m.name)} IS NOT NULL GROUP BY 1 ORDER BY 1`,
          );
          let points = rows.map((r) => ({ x: Number(r.x), y: Number(r.y) })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && (!complete || complete.has(p.x)));
          // The first and last period are usually only partly covered, which would look like a rise or a drop. Dropping
          // them matters for sums; an average over a few days is still an average.
          if (agg === "sum" && time.kind === "date" && unit !== "day" && points.length > MIN_POINTS + 2) {
            const startsMidPeriod = lo > points[0].x;
            const endsMidPeriod = hi < points[points.length - 1].x + (unit === "month" ? 28 : 6) * 86_400_000;
            points = points.slice(startsMidPeriod ? 1 : 0, endsMidPeriod ? points.length - 1 : undefined);
          }
          if (points.length >= minPoints) {
            series.push({ column: label(m), x: points.map((p) => p.x), y: points.map((p) => p.y), labels: points.map((p) => labelFor(p.x, unit)), unit });
          }
        }
        if (series.length) input.series = series;

        // each entity's own values, period by period, for the measures people read first: an amount, then a level, then a rate
        if (profile.panel && profile.panel.time === time.column.name) {
          const kinds = ["flow", "level", "rate"] as const;
          const picks = kinds.map((k) => measures.find((m) => valueKind(m) === k)).filter((m): m is NonNullable<typeof m> => !!m).slice(0, MAX_PANEL_MEASURES);
          const entity = q(profile.panel.entity);
          const panels: NonNullable<InsightInput["panel"]> = [];
          for (const m of picks) {
            const rows = await run(
              `WITH top AS (SELECT ${entity} AS e FROM data WHERE ${entity} IS NOT NULL GROUP BY 1 ORDER BY count(*) DESC LIMIT ${MAX_ENTITIES}) ` +
                `SELECT CAST(epoch_ms(CAST(date_trunc('${unit}', ${d}) AS TIMESTAMP)) AS DOUBLE) AS x, CAST(${entity} AS VARCHAR) AS e, CAST(${aggregate(m)}(${q(m.name)}) AS DOUBLE) AS y ` +
                `FROM data WHERE ${present} IS NOT NULL AND ${entity} IN (SELECT e FROM top) AND ${q(m.name)} IS NOT NULL GROUP BY 1, 2`,
            );
            let periods = [...new Set(rows.map((r) => Number(r.x)).filter((x) => Number.isFinite(x) && (!complete || complete.has(x))))].sort((a, b) => a - b);
            // the first and last period of a table of dates are usually only partly covered, which would read as a collapse in a sum
            if (aggregate(m) === "sum" && time.kind === "date" && unit !== "day" && periods.length > MIN_YEAR_POINTS + 2) {
              const startsMidPeriod = lo > periods[0];
              const endsMidPeriod = hi < periods[periods.length - 1] + (unit === "month" ? 28 : 6) * 86_400_000;
              periods = periods.slice(startsMidPeriod ? 1 : 0, endsMidPeriod ? periods.length - 1 : undefined);
            }
            if (periods.length < MIN_YEAR_POINTS) continue;
            const at = new Map(periods.map((x, i) => [x, i]));
            const byEntity = new Map<string, (number | null)[]>();
            for (const r of rows) {
              const i = at.get(Number(r.x));
              const y = Number(r.y);
              if (i === undefined || !Number.isFinite(y)) continue;
              if (!byEntity.has(String(r.e))) byEntity.set(String(r.e), new Array(periods.length).fill(null));
              byEntity.get(String(r.e))![i] = y;
            }
            panels.push({
              entity: profile.panel.entity,
              measure: m.name,
              kind: valueKind(m),
              periods: periods.map((x) => ({ x, label: labelFor(x, unit) })),
              unit,
              entities: [...byEntity].map(([name, y]) => ({ label: name, y })),
            });
          }
          if (panels.length) input.panel = panels;
        }
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

  let unusualIds: number[] = [];

  // ---- rows that are unusual across several measures, found on the rows themselves (a sample, for a very big table) ----
  const spread = measures.filter((m) => m.distinct >= MIN_UNUSUAL_DISTINCT && m.nullCount <= rowCount * 0.2).slice(0, MAX_UNUSUAL_MEASURES);
  if (spread.length >= 2 && rowCount >= 100) {
    const cols = spread.map((m, i) => `CAST(${q(m.name)} AS DOUBLE) AS c${i}`).join(", ");
    const present = spread.map((m) => `${q(m.name)} IS NOT NULL`).join(" AND ");
    const sample = rowCount > MAX_UNUSUAL_ROWS ? ` USING SAMPLE reservoir(${MAX_UNUSUAL_ROWS} ROWS) REPEATABLE (42)` : "";
    const rows = await run(`SELECT id, ${spread.map((_, i) => `c${i}`).join(", ")} FROM (SELECT CAST(rowid AS DOUBLE) AS id, ${cols} FROM data WHERE ${present})${sample}`);
    const columns = spread.map((_, i) => rows.map((r) => Number(r[`c${i}`])));
    const result = ecod(columns);
    // the rows named unusual are left out of the totals below, so a group that stands out only because of them is not reported twice
    unusualIds = result.unusual.slice(0, MAX_EXCLUDED_ROWS).map((u) => Number(rows[u.index].id));
    if (result.unusual.length) {
      const top = result.unusual.slice(0, MAX_UNUSUAL_SHOWN);
      const ids = top.map((u) => Number(rows[u.index].id));
      const full = await run(`SELECT CAST(rowid AS DOUBLE) AS "__id", * FROM data WHERE rowid IN (${ids.join(", ")})`);
      const byId = new Map(full.map((r) => [Number(r.__id), r]));
      input.unusual = {
        scored: rows.length,
        flagged: result.unusual.length,
        measures: result.measures.map((j) => spread[j].name),
        considered: spread.map((m) => m.name),
        top: top.map((u, k) => {
          const { __id: _drop, ...row } = byId.get(ids[k]) ?? {};
          return {
            id: ids[k],
            source: u.source,
            score: u.score,
            reasons: u.reasons.map((r) => ({ measure: spread[r.measure].name, side: r.side, z: r.z })),
            row,
          };
        }),
      };
    }
  }

  // ---- among many values of a text column (customers, products, stores): one far from the rest, and how much a few hold ----
  const flow = measures.find((m) => valueKind(m) === "flow");
  const many = columns
    .filter((c) => c.type === "string" && c.distinct >= 21 && c.distinct <= MAX_PARETO_GROUPS && rowCount / c.distinct >= 2 && (c.textLength ?? 0) <= 40 && c.name !== profile.panel?.entity)
    .slice(0, 3);
  if (flow && many.length) {
    const groups: NonNullable<InsightInput["groups"]> = [];
    const pareto: NonNullable<InsightInput["pareto"]> = [];
    const m = q(flow.name);
    const without = unusualIds.length ? ` AND rowid NOT IN (${unusualIds.join(", ")})` : "";
    for (const c of many) {
      const col = q(c.name);
      if (c.distinct <= MAX_GROUPS) {
        const rows = await run(`SELECT CAST(${col} AS VARCHAR) AS label, CAST(sum(${m}) AS DOUBLE) AS value FROM data WHERE ${col} IS NOT NULL AND ${m} IS NOT NULL${without} GROUP BY 1 LIMIT ${MAX_GROUPS}`);
        groups.push({ column: c.name, measure: flow.name, values: rows.map((r) => ({ label: String(r.label), value: Number(r.value) })).filter((v) => Number.isFinite(v.value)) });
      }
      const [r] = await run(
        `WITH s AS (SELECT sum(${m}) AS v FROM data WHERE ${col} IS NOT NULL AND ${m} IS NOT NULL${without} GROUP BY ${col}), ` +
          `r AS (SELECT v, row_number() OVER (ORDER BY v DESC) AS rk, count(*) OVER () AS n, sum(v) OVER () AS total, min(v) OVER () AS lo FROM s) ` +
          `SELECT CAST(any_value(n) AS DOUBLE) AS n, CAST(any_value(total) AS DOUBLE) AS total, CAST(any_value(lo) AS DOUBLE) AS lo, ` +
          `CAST(sum(v) FILTER (WHERE rk <= ceil(n * 0.2)) AS DOUBLE) AS top20, CAST(sum(v) FILTER (WHERE rk <= ceil(n * 0.1)) AS DOUBLE) AS top10, CAST(max(v) AS DOUBLE) AS biggest FROM r`,
      );
      const total = Number(r?.total);
      // shares of a total only mean something when no group is negative
      if (total > 0 && Number(r?.lo) >= 0) {
        pareto.push({ column: c.name, measure: flow.name, groups: Number(r.n), top10: Number(r.top10) / total, top20: Number(r.top20) / total, biggest: Number(r.biggest) / total });
      }
    }
    if (groups.some((x) => x.values.length)) input.groups = groups;
    if (pareto.length) input.pareto = pareto;
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

  // ---- which periods of the time axis have rows at all (needs no measure), for the check on empty periods ----
  if (time && time.kind !== "year") {
    const d = timeExpression(time.column, time.kind);
    const present = q(time.column.name);
    const [range] = await run(`SELECT CAST(epoch_ms(CAST(min(${d}) AS TIMESTAMP)) AS DOUBLE) AS lo, CAST(epoch_ms(CAST(max(${d}) AS TIMESTAMP)) AS DOUBLE) AS hi FROM data WHERE ${present} IS NOT NULL`);
    const days = (Number(range?.hi) - Number(range?.lo)) / 86_400_000;
    // the finest step that still leaves a readable number of periods, as for the series
    const unit: Unit = days / 30 >= 24 ? "month" : days >= 120 ? "week" : "day";
    if (Number.isFinite(days) && days >= MIN_POINTS && days / (unit === "month" ? 30 : unit === "week" ? 7 : 1) <= MAX_POINTS) {
      const xs = await run(`SELECT CAST(epoch_ms(CAST(date_trunc('${unit}', ${d}) AS TIMESTAMP)) AS DOUBLE) AS x FROM data WHERE ${present} IS NOT NULL GROUP BY 1 ORDER BY 1`);
      const x = xs.map((r) => Number(r.x)).filter(Number.isFinite);
      qualitySeries = { column: time.column.name, x, unit, labels: x.map((v) => labelFor(v, unit)) };
    }
  }

  // ---- checks on the values themselves ----
  const quality = await gatherQuality(profile, run, qualitySeries);
  if (quality) input.quality = quality;

  // ---- free text: how long, and which words come up in many rows ----
  const text = await gatherText(profile, run);
  if (text.length) input.text = text;

  // ---- who comes back: people by the month they first appear ----
  const cohorts = await gatherCohorts(profile, run);
  if (cohorts) input.cohorts = cohorts;

  return input;
}
