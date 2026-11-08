import { fmt, pct } from "./format";
import type { RawFinding } from "./insights";
import { q, type TableProfile } from "./profile";
import { normalTwoSided } from "./stats/special";
import type { RunSql } from "./summarize";
import { timeColumn, timeExpression } from "./understand";

/**
 * Who comes back. When a table is a list of things people did (orders, visits, sign-ins) and one column says who did each,
 * the first month a person appears puts them in a cohort, and the share of each cohort that is active again one, two, three
 * months later is the retention. It answers a question totals cannot: is growth coming from new people or from people staying,
 * and are newer groups staying as well as older ones. Only counts of people are used, never what they bought.
 */

/** Names that say a column holds the people (or accounts) behind the rows. */
const PERSON_NAME = /(^|[^a-z])(customers?|clients?|users?|members?|buyers?|shoppers?|subscribers?|accounts?|patients?|students?|donors?|guests?|visitors?|player)([^a-z]|$)/i;

/** Fewest people for a cohort analysis to say anything, and fewest per cohort to count that cohort. */
const MIN_PEOPLE = 50;
const MIN_COHORT = 20;
/** How many months after the first one are followed. */
const MAX_AGE = 12;

export type CohortProfile = NonNullable<TableProfile["customers"]>;

/** The column of people, when the table looks like one row per thing a person did: a name that points at people, repeated across rows. */
export function findCustomers(profile: TableProfile): CohortProfile | undefined {
  const time = timeColumn(profile);
  if (!time || time.kind === "year" || profile.rowCount < MIN_PEOPLE * 2) return undefined;
  const rows = profile.rowCount;
  const candidates = profile.columns.filter(
    (c) =>
      (c.type === "string" || (c.type === "number" && c.integer === true)) &&
      PERSON_NAME.test(c.name) &&
      c.distinct >= MIN_PEOPLE &&
      rows / c.distinct >= 1.5 &&
      (c.textLength ?? 0) <= 40 &&
      c.name !== profile.panel?.entity &&
      c.nullCount <= rows * 0.3,
  );
  const best = candidates.sort((a, b) => b.distinct - a.distinct)[0];
  return best ? { column: best.name, time: time.column.name } : undefined;
}

export interface CohortInput {
  column: string;
  unit: "month";
  /** How many different people appear, and how many were active in a later month than their first. */
  people: number;
  /** Of the people whose first month is at least three months before the last full one: how many, and how many came back. */
  matured: { people: number; returned: number };
  /** Cohorts in time order. active[k] is how many of the cohort were active k months after their first month (null when that month is not over yet). */
  cohorts: { x: number; label: string; size: number; active: (number | null)[] }[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthLabel = (ms: number) => {
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

/** The cohorts, from one grouped query. The last calendar month is left out when the data stops partway through it. */
export async function gatherCohorts(profile: TableProfile, run: RunSql): Promise<CohortInput | undefined> {
  const found = profile.customers;
  const time = timeColumn(profile);
  if (!found || !time || time.column.name !== found.time || time.kind === "year") return undefined;
  const d = timeExpression(time.column, time.kind);
  const who = q(found.column);
  const [range] = await run(`SELECT CAST(epoch_ms(CAST(max(${d}) AS TIMESTAMP)) AS DOUBLE) AS hi, CAST(epoch_ms(CAST(min(${d}) AS TIMESTAMP)) AS DOUBLE) AS lo FROM data WHERE ${d} IS NOT NULL`);
  const hi = Number(range?.hi);
  const lo = Number(range?.lo);
  if (!Number.isFinite(hi) || !Number.isFinite(lo) || (hi - lo) / 86_400_000 < 120) return undefined;
  // a month the data stops in the middle of would look like everyone left
  const last = new Date(hi);
  const monthEnd = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 0)).getUTCDate();
  const partial = last.getUTCDate() < monthEnd - 1;
  const startOfLast = `DATE '${new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), 1)).toISOString().slice(0, 10)}'`;
  const cutoff = partial ? `AND CAST(${d} AS DATE) < ${startOfLast}` : "";

  const rows = await run(
    `WITH f AS (SELECT ${who} AS who, date_trunc('month', CAST(${d} AS DATE)) AS m FROM data WHERE ${who} IS NOT NULL AND ${d} IS NOT NULL ${cutoff} GROUP BY 1, 2), ` +
      `first AS (SELECT who, min(m) AS c FROM f GROUP BY 1) ` +
      `SELECT CAST(epoch_ms(CAST(first.c AS TIMESTAMP)) AS DOUBLE) AS cohort, CAST(date_diff('month', first.c, f.m) AS DOUBLE) AS k, CAST(count(*) AS DOUBLE) AS n ` +
      `FROM f JOIN first USING (who) GROUP BY 1, 2 ORDER BY 1, 2`,
  );
  const [lastRow] = await run(
    `WITH f AS (SELECT date_trunc('month', CAST(${d} AS DATE)) AS m FROM data WHERE ${d} IS NOT NULL ${cutoff} GROUP BY 1) SELECT CAST(epoch_ms(CAST(max(m) AS TIMESTAMP)) AS DOUBLE) AS last FROM f`,
  );
  const lastMonth = Number(lastRow?.last);
  if (!Number.isFinite(lastMonth) || !rows.length) return undefined;

  const byCohort = new Map<number, Map<number, number>>();
  for (const r of rows) {
    const c = Number(r.cohort);
    if (!byCohort.has(c)) byCohort.set(c, new Map());
    byCohort.get(c)!.set(Number(r.k), Number(r.n));
  }
  const monthsBetween = (a: number, b: number) => {
    const x = new Date(a);
    const y = new Date(b);
    return (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + (y.getUTCMonth() - x.getUTCMonth());
  };
  const cohorts: CohortInput["cohorts"] = [];
  let people = 0;
  const matured = { people: 0, returned: 0 };
  for (const [x, ages] of [...byCohort].sort((a, b) => a[0] - b[0])) {
    const size = ages.get(0) ?? 0;
    const observed = monthsBetween(x, lastMonth);
    cohorts.push({ x, label: monthLabel(x), size, active: Array.from({ length: MAX_AGE + 1 }, (_, k) => (k <= observed ? (k === 0 ? size : ages.get(k) ?? 0) : null)) });
    people += size;
  }
  // those who had at least three months to come back, and the ones who did at some point
  const returnedRows = await run(
    `WITH f AS (SELECT ${who} AS who, date_trunc('month', CAST(${d} AS DATE)) AS m FROM data WHERE ${who} IS NOT NULL AND ${d} IS NOT NULL ${cutoff} GROUP BY 1, 2), ` +
      `p AS (SELECT who, min(m) AS c, count(*) AS months FROM f GROUP BY 1) ` +
      `SELECT CAST(count(*) AS DOUBLE) AS n, CAST(count(*) FILTER (WHERE months >= 2) AS DOUBLE) AS back FROM p WHERE date_diff('month', c, DATE '${new Date(lastMonth).toISOString().slice(0, 10)}') >= 3`,
  );
  matured.people = Number(returnedRows[0]?.n) || 0;
  matured.returned = Number(returnedRows[0]?.back) || 0;
  if (people < MIN_PEOPLE) return undefined;
  return { column: found.column, unit: "month", people, matured, cohorts };
}

/** One cohort's share active k months on. */
const share = (c: CohortInput["cohorts"][number], k: number) => (c.active[k] === null || !c.size ? null : (c.active[k] as number) / c.size);

/** Is month-1 retention different for newer cohorts than for older ones? Two groups of cohorts, pooled, and a two-proportion test. */
export function cohortTrend(input: CohortInput) {
  const usable = input.cohorts.filter((c) => c.size >= MIN_COHORT && c.active[1] !== null);
  if (usable.length < 4) return null;
  const half = Math.floor(usable.length / 2);
  const early = usable.slice(0, half);
  const late = usable.slice(usable.length - half);
  const pool = (cs: typeof usable) => ({ n: cs.reduce((s, c) => s + c.size, 0), k: cs.reduce((s, c) => s + (c.active[1] as number), 0) });
  const a = pool(early);
  const b = pool(late);
  if (a.n < 100 || b.n < 100) return null;
  const p1 = a.k / a.n;
  const p2 = b.k / b.n;
  const pooled = (a.k + b.k) / (a.n + b.n);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / a.n + 1 / b.n));
  if (!(se > 0)) return null;
  const z = (p2 - p1) / se;
  return { early: p1, late: p2, p: normalTwoSided(z), z, earlyLabel: `${early[0].label} to ${early[early.length - 1].label}`, lateLabel: `${late[0].label} to ${late[late.length - 1].label}`, earlyPeople: a.n, latePeople: b.n };
}

/** Floors for what is worth saying: a change in month-1 retention of at least five points and a fifth of itself. */
export const COHORT_FLOORS = { points: 0.05, relative: 0.2, repeatShare: 0.1 } as const;

/** The plain facts about who comes back, and (as a candidate for the shared correction) whether newer cohorts do better or worse. */
export function cohortFindings(input: CohortInput | undefined): { facts: RawFinding[]; trend: { finding: RawFinding; passesFloor: boolean } | null } {
  if (!input) return { facts: [], trend: null };
  const facts: RawFinding[] = [];
  const m = input.matured;
  if (m.people >= MIN_PEOPLE) {
    const back = m.returned / m.people;
    const first = input.cohorts.filter((c) => c.size >= MIN_COHORT && c.active[1] !== null);
    const month1 = first.length ? first.reduce((s, c) => s + (c.active[1] as number), 0) / first.reduce((s, c) => s + c.size, 0) : null;
    facts.push({
      kind: "retention",
      columns: [input.column],
      sentence: `${pct(back)} of ${input.column} values (${fmt(m.returned)} of ${fmt(m.people)}) were active again in a later month after the first one${month1 !== null ? `, and ${pct(month1)} came back the very next month` : ""}.`,
      p: null,
      // how many come back matters most when it is low or high: an even half says little
      strength: 0.45 + Math.abs(back - 0.5) * 0.5,
      evidence: { share: Number(back.toFixed(3)), people: m.people, returned: m.returned, ...(month1 !== null ? { nextMonth: Number(month1.toFixed(3)) } : {}), cohorts: input.cohorts.length },
    });
  }
  const t = cohortTrend(input);
  let trend: { finding: RawFinding; passesFloor: boolean } | null = null;
  if (t) {
    const diff = t.late - t.early;
    trend = {
      finding: {
        kind: "cohorttrend",
        columns: [input.column],
        sentence: `${pct(t.late)} of newer ${input.column} values (${t.lateLabel}) came back the next month, against ${pct(t.early)} of older ones (${t.earlyLabel}): ${diff > 0 ? "they stay better" : "they stay less"}.`,
        p: t.p,
        strength: Math.min(1, Math.abs(diff) * 3) * 0.75,
        evidence: { earlier: Number(t.early.toFixed(3)), later: Number(t.late.toFixed(3)), change: Number(diff.toFixed(3)), earlierPeople: t.earlyPeople, laterPeople: t.latePeople, at: t.lateLabel },
      },
      passesFloor: Math.abs(diff) >= COHORT_FLOORS.points && (t.early > 0 ? Math.abs(diff) / t.early >= COHORT_FLOORS.relative : true),
    };
  }
  return { facts, trend };
}
