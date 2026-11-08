import { fmt, pct, pctFine } from "./format";
import type { RawFinding } from "./insights";
import type { TableProfile } from "./profile";
import type { RunSql } from "./summarize";

/**
 * Checks on the data itself, before anything is read into it: values that differ only by case or spacing and so are counted apart,
 * placeholders that stand for "missing" ("N/A", "-"), numbers stored as text, dates that cannot be right, periods with no rows at
 * all, and rows that repeat an entity and a period already seen. Each one changes what a total or a chart means, and each is
 * something a person can fix in minutes once told. These are plain facts about the values, not statistical tests, so each has a
 * floor on how much of the data it touches, and the ones that can be innocent (a forecast date, a sparse table) say so in how
 * they are decided.
 */

export interface QualityInput {
  caseVariants: { column: string; a: string; b: string; na: number; nb: number }[];
  placeholders: { column: string; value: string; count: number; of: number }[];
  numbersAsText: { column: string; share: number }[];
  dates: { column: string; future: number; futureMax: string; ancient: number; ancientMin: string; of: number }[];
  gaps?: { column: string; missing: number; expected: number; unit: string; first: string; last: string };
  repeatedKeys?: { entity: string; time: string; extra: number };
}

const PLACEHOLDER = /^(n\/a|na|n\.a\.|null|none|nan|nil|-|--|---|\?|\?\?|unknown|missing|not available|\(blank\)|blank|#n\/a|undefined|tbd|0000-00-00)$/i;
/** Names where a number kept as text is normal: codes and identifiers, whose leading zeros and length matter. */
const CODE_NAME = /(^|[^a-z])(id|code|zip|postal|postcode|phone|tel|sku|ref|reference|number|no|num|account|iban|isbn|barcode)([^a-z]|$)/i;
/** Names where a date in the future is normal. */
const FUTURE_NAME = /(due|expir|end|deadline|renew|forecast|plan|target|schedul|delivery|next|valid|until|maturity|launch|release)/i;

/** The same words, for the database to look for in every text column. */
const PLACEHOLDER_VALUES = ["n/a", "na", "n.a.", "null", "none", "nan", "nil", "-", "--", "---", "?", "??", "unknown", "missing", "not available", "(blank)", "blank", "#n/a", "undefined", "tbd"];

const normal = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");

/** Poisson chance that a period with this many rows on average is empty: what a sparse table looks like by itself. */
const emptyByChance = (rows: number, periods: number) => Math.exp(-rows / periods) * periods;

export async function gatherQuality(profile: TableProfile, run: RunSql, series?: { column: string; x: number[]; unit: string; labels?: string[] }): Promise<QualityInput | undefined> {
  const { rowCount, columns } = profile;
  const out: QualityInput = { caseVariants: [], placeholders: [], numbersAsText: [], dates: [] };
  const q = (n: string) => `"${n.replace(/"/g, '""')}"`;

  // text columns with a modest number of values: the values and how often each occurs
  const small = columns.filter((c) => c.type === "string" && c.distinct >= 2 && c.distinct <= 500).sort((a, b) => a.distinct - b.distinct).slice(0, 10);
  for (const c of small) {
    const rows = await run(`SELECT CAST(${q(c.name)} AS VARCHAR) AS v, CAST(count(*) AS DOUBLE) AS n FROM data WHERE ${q(c.name)} IS NOT NULL GROUP BY 1 LIMIT 600`);
    const values = rows.map((r) => ({ v: String(r.v), n: Number(r.n) }));
    const present = values.reduce((s, x) => s + x.n, 0);

    // the same value written two ways: the biggest such pair in the column
    const groups = new Map<string, { v: string; n: number }[]>();
    for (const x of values) {
      const key = normal(x.v);
      if (!key || PLACEHOLDER.test(key)) continue;
      groups.set(key, [...(groups.get(key) ?? []), x]);
    }
    let worst: { a: string; b: string; na: number; nb: number } | null = null;
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      const sorted = [...g].sort((x, y) => y.n - x.n);
      const total = sorted.reduce((s, x) => s + x.n, 0);
      if (!worst || total > worst.na + worst.nb) worst = { a: sorted[0].v, b: sorted[1].v, na: sorted[0].n, nb: sorted[1].n };
    }
    if (worst) out.caseVariants.push({ column: c.name, ...worst });

  }

  // values that stand for "missing", in any text column, however many different values it has
  const listed = PLACEHOLDER_VALUES.map((v) => `'${v}'`).join(", ");
  for (const c of columns.filter((c) => c.type === "string").slice(0, 16)) {
    const rows = await run(`SELECT CAST(${q(c.name)} AS VARCHAR) AS v, CAST(count(*) AS DOUBLE) AS n FROM data WHERE lower(trim(${q(c.name)})) IN (${listed}) GROUP BY 1 ORDER BY 2 DESC LIMIT 3`);
    const present = rowCount - c.nullCount;
    for (const r of rows) {
      const n = Number(r.n);
      if (n >= 2 && n / Math.max(1, present) >= 0.005) out.placeholders.push({ column: c.name, value: String(r.v), count: n, of: present });
    }
  }

  // numbers kept as text: most values parse as a number, and the column is not a code where text is right
  for (const c of columns.filter((c) => c.type === "string" && c.distinct > 20 && !CODE_NAME.test(c.name)).slice(0, 8)) {
    const [r] = await run(
      `SELECT CAST(count(*) FILTER (WHERE TRY_CAST(v AS DOUBLE) IS NOT NULL AND v NOT LIKE '0_%') AS DOUBLE) AS num, CAST(count(v) AS DOUBLE) AS n FROM (SELECT ${q(c.name)} AS v FROM data LIMIT 20000)`,
    );
    const n = Number(r?.n);
    const share = n > 0 ? Number(r?.num) / n : 0;
    if (n >= 30 && share >= 0.9) out.numbersAsText.push({ column: c.name, share });
  }

  // dates that cannot be right
  for (const c of columns.filter((c) => c.type === "date").slice(0, 4)) {
    const [r] = await run(
      `SELECT CAST(count(*) FILTER (WHERE CAST(${q(c.name)} AS DATE) > current_date + 1) AS DOUBLE) AS f, CAST(max(${q(c.name)}) AS VARCHAR) AS mx, ` +
        `CAST(count(*) FILTER (WHERE CAST(${q(c.name)} AS DATE) < DATE '1900-01-01') AS DOUBLE) AS a, CAST(min(${q(c.name)}) AS VARCHAR) AS mn, CAST(count(${q(c.name)}) AS DOUBLE) AS n FROM data`,
    );
    const of = Number(r?.n);
    const future = Number(r?.f);
    const ancient = Number(r?.a);
    // a column of due dates or forecasts is meant to reach into the future, and so is one where most of the dates do
    const futureOk = !FUTURE_NAME.test(c.name) && future > 0 && future / Math.max(1, of) <= 0.1;
    if (futureOk || ancient > 0) out.dates.push({ column: c.name, future: futureOk ? future : 0, futureMax: String(r?.mx ?? "").slice(0, 10), ancient, ancientMin: String(r?.mn ?? "").slice(0, 10), of });
  }

  // periods with no rows at all, in a table that has rows in nearly every period
  if (series && series.x.length >= 8) {
    const first = series.x[0];
    const last = series.x[series.x.length - 1];
    const span = series.unit === "month" ? (new Date(last).getUTCFullYear() - new Date(first).getUTCFullYear()) * 12 + new Date(last).getUTCMonth() - new Date(first).getUTCMonth() + 1 : series.unit === "year" ? new Date(last).getUTCFullYear() - new Date(first).getUTCFullYear() + 1 : series.unit === "week" ? Math.round((last - first) / (7 * 86_400_000)) + 1 : Math.round((last - first) / 86_400_000) + 1;
    const missing = span - series.x.length;
    if (missing >= 1 && missing / span <= 0.25 && emptyByChance(rowCount, span) < 0.5) {
      out.gaps = { column: series.column, missing, expected: span, unit: series.unit, first: series.labels?.[0] ?? "", last: series.labels?.[series.labels.length - 1] ?? "" };
    }
  }

  if (profile.panel?.repeated && profile.panel.repeated > 0 && profile.panel.repeated / Math.max(1, rowCount) >= 0.005) {
    out.repeatedKeys = { entity: profile.panel.entity, time: profile.panel.time, extra: profile.panel.repeated };
  }

  const any = out.caseVariants.length || out.placeholders.length || out.numbersAsText.length || out.dates.length || out.gaps || out.repeatedKeys;
  return any ? out : undefined;
}

/**
 * What the checks found, as one finding that lists every problem: several cards would crowd out everything else, and these are
 * one job (clean the file) with one place to start.
 */
export function qualityFindings(q: QualityInput | undefined, rowCount: number): RawFinding[] {
  if (!q) return [];
  const issues: { code: string; columns: string[]; text: string; strength: number }[] = [];
  const add = (code: string, column: string | string[], text: string, strength: number) => issues.push({ code, columns: Array.isArray(column) ? column : [column], text, strength });

  for (const v of q.caseVariants) {
    add("casevariants", v.column, `"${v.a}" (${fmt(v.na)} rows) and "${v.b}" (${fmt(v.nb)} rows) are the same value written two ways, so they are counted apart in every chart and total.`, 0.62 + Math.min(0.1, (v.na + v.nb) / Math.max(1, rowCount) / 5));
  }
  for (const p of q.placeholders) {
    add("placeholder", p.column, `${fmt(p.count)} rows (${pctFine(p.count / Math.max(1, p.of))}) hold "${p.value}", which stands for missing and not a real value.`, 0.58);
  }
  for (const n of q.numbersAsText) {
    add("numberstext", n.column, `Stored as text, but ${pct(n.share)} of its values are numbers, so it is treated as a category and cannot be totalled or averaged.`, 0.66);
  }
  for (const d of q.dates) {
    if (d.future > 0) add("futuredates", d.column, `${fmt(d.future)} dates are in the future (as late as ${d.futureMax}), which is usually a typing mistake.`, 0.6);
    if (d.ancient > 0) add("ancientdates", d.column, `${fmt(d.ancient)} dates are before 1900 (as early as ${d.ancientMin}), which is usually an empty date saved as a default.`, 0.6);
  }
  if (q.gaps) {
    const g = q.gaps;
    add("gaps", g.column, `${fmt(g.missing)} of ${fmt(g.expected)} ${g.unit}s between ${g.first} and ${g.last} have no rows at all, so a chart over time hides them or draws a line straight across.`, 0.6);
  }
  if (q.repeatedKeys) {
    const r = q.repeatedKeys;
    add("repeatedkeys", [r.entity, r.time], `${fmt(r.extra)} rows repeat a ${r.entity} and ${r.time} that already appear in the table, so totals count them twice.`, 0.66);
  }
  if (!issues.length) return [];

  issues.sort((x, y) => y.strength - x.strength);
  const columns = [...new Set(issues.flatMap((i) => i.columns))];
  return [
    {
      kind: "quality",
      columns: columns.slice(0, 2),
      sentence: `${issues.length} thing${issues.length === 1 ? "" : "s"} in the data ${issues.length === 1 ? "changes" : "change"} what its totals and charts mean: ${columns.slice(0, 3).join(", ")}${columns.length > 3 ? ` and ${columns.length - 3} more` : ""}.`,
      p: null,
      strength: issues[0].strength + Math.min(0.1, issues.length * 0.02),
      evidence: { issues: issues.length, codes: issues.map((i) => i.code).join(",") },
      details: {
        caption: "What to fix in your file, most important first.",
        columns: ["Column", "Problem"],
        rows: issues.map((i) => [i.columns.join(" and "), i.text]),
      },
    },
  ];
}
