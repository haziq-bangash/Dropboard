import { benjaminiHochberg, changePoint, dominance, mannKendall, mean, median, outliers, pearson, type Trend } from "./stats/tests";

/**
 * Turn a table's summary numbers into a short list of findings a person can trust.
 *
 * Everything here works on small summaries (a measure over time, a sample of values, category counts), never on the
 * table itself, so it is cheap and the same code runs in the browser and in tests. Three guards keep it honest:
 *   1. Every test that is run counts, and a single Benjamini-Hochberg correction decides which can be called real.
 *   2. A result must also be big enough to matter: with thousands of rows almost anything is "significant".
 *   3. Findings come back ranked, with a plain sentence and the numbers behind it.
 */

export type FindingKind = "trend" | "change" | "outlier" | "correlation" | "dominance" | "missing";

export interface Finding {
  kind: FindingKind;
  /** The columns it is about. */
  columns: string[];
  /** One plain sentence. */
  sentence: string;
  /** Probability of seeing something this strong by chance, where a test was run. */
  p: number | null;
  /** 0 to 1, for ordering. Not a probability. */
  strength: number;
  /** The numbers behind the sentence, so every claim can be traced. */
  evidence: Record<string, number | string>;
}

export interface SeriesInput {
  column: string;
  /** Position along the axis (a time in ms, or just 0, 1, 2...). */
  x: number[];
  y: number[];
  /** What to call each x in a sentence, same length as x. */
  labels?: string[];
}

export interface InsightInput {
  rowCount: number;
  /** A measure summed or averaged over time. */
  series?: SeriesInput[];
  /** Values of measure columns, row by row (a sample is fine), for relationships and outliers. */
  numeric?: { column: string; values: (number | null)[] }[];
  /** Category columns with how many rows each value has. */
  categories?: { column: string; counts: { label: string; count: number }[] }[];
  /** Columns and how many rows are empty. */
  missing?: { column: string; nullCount: number }[];
}

export interface InsightOptions {
  /** Share of findings allowed to be false, on average. Default 5%. */
  q?: number;
  /** Largest number of findings to return. Default 8. */
  limit?: number;
}

/** What counts as big enough to matter, per kind. */
export const FLOORS = {
  trendChange: 0.15, // the fitted line moves at least 15% of where it starts
  trendNoise: 2, // and at least 2 noise units
  correlation: 0.3, // |r|
  dominanceShare: 0.4, // one category holds at least 40% of rows
  dominanceTimes: 2, // and at least twice an even split
  outlierShare: 0.05, // more than this is a skewed column, not outliers
  missingShare: 0.2,
  changeShift: 4, // noise units
  changeRelative: 0.1, // and the level moves at least 10%
} as const;

const fmt = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toPrecision(3)}bn`;
  if (a >= 1e6) return `${(n / 1e6).toPrecision(3)}m`;
  if (a >= 1e4) return `${Math.round(n / 100) / 10}k`;
  if (a >= 100) return String(Math.round(n));
  return String(Number(n.toPrecision(3)));
};
const pct = (x: number) => `${Math.round(Math.abs(x) * 100)}%`;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
/** Fold how unlikely the result is by chance into the ranking, without letting it overrule how big the effect is. */
const confidence = (p: number | null) => (p === null ? 0.7 : clamp01(0.5 + -Math.log10(Math.max(p, 1e-300)) / 20));

interface Candidate extends Finding {
  /** The family of tests this belongs to, so the correction counts them. */
  tested: boolean;
  passesFloor: boolean;
}

export function findInsights(input: InsightInput, options: InsightOptions = {}): Finding[] {
  const q = options.q ?? 0.05;
  const limit = options.limit ?? 8;
  const candidates: Candidate[] = [];

  // ---- trends and level changes, one pair of checks per series ----
  const trendFor = new Map<string, Candidate>();
  const trendStats = new Map<string, Trend>();
  for (const s of input.series ?? []) {
    const m = mannKendall(s.x, s.y);
    if (!m) continue;
    const big = Math.abs(m.relativeChange) >= FLOORS.trendChange && Math.abs(m.noiseUnits) >= FLOORS.trendNoise;
    const c: Candidate = {
      kind: "trend",
      columns: [s.column],
      sentence: `${s.column} ${m.slope > 0 ? "rose" : "fell"} about ${pct(m.relativeChange)} from start to end.`,
      p: m.p,
      strength: clamp01(Math.abs(m.relativeChange)) * confidence(m.p),
      evidence: { slopePerStep: Number(fmt(m.slope)), relativeChange: Number(m.relativeChange.toFixed(3)), noiseUnits: Number(m.noiseUnits.toFixed(1)), points: s.y.length },
      tested: true,
      passesFloor: big,
    };
    candidates.push(c);
    trendFor.set(s.column, c);
    trendStats.set(s.column, m);
  }

  // ---- everything below tests one hypothesis per item; collect p-values for the single correction ----
  const numeric = input.numeric ?? [];
  for (let i = 0; i < numeric.length; i++) {
    for (let j = i + 1; j < numeric.length; j++) {
      const r = pearson(numeric[i].values, numeric[j].values);
      if (!r) continue;
      candidates.push({
        kind: "correlation",
        columns: [numeric[i].column, numeric[j].column],
        sentence: `${numeric[i].column} and ${numeric[j].column} ${r.r > 0 ? "rise and fall together" : "move in opposite directions"}${Math.abs(r.r) >= 0.7 ? " strongly" : ""} (r = ${r.r.toFixed(2)}).`,
        p: r.p,
        strength: Math.abs(r.r) * confidence(r.p),
        evidence: { r: Number(r.r.toFixed(3)), rows: r.n },
        tested: true,
        passesFloor: Math.abs(r.r) >= FLOORS.correlation,
      });
    }
  }

  for (const cat of input.categories ?? []) {
    const d = dominance(cat.counts);
    if (!d) continue;
    candidates.push({
      kind: "dominance",
      columns: [cat.column],
      sentence: `${d.label} makes up ${pct(d.share)} of ${cat.column}, about ${fmt(d.times)} times an even split.`,
      p: d.p,
      strength: d.share * confidence(d.p),
      evidence: { label: d.label, share: Number(d.share.toFixed(3)), timesEven: Number(d.times.toFixed(2)) },
      tested: true,
      passesFloor: d.share >= FLOORS.dominanceShare && d.times >= FLOORS.dominanceTimes,
    });
  }

  const kept = benjaminiHochberg(
    candidates.map((c) => c.p ?? 1),
    q,
  );

  let found: Finding[] = [];
  candidates.forEach((c, i) => {
    if (kept[i] && c.passesFloor) {
      const { tested: _t, passesFloor: _f, ...finding } = c;
      found.push(finding);
    }
  });

  // ---- checks that are not a hypothesis test: they pass on a clear, large effect alone ----
  for (const col of numeric) {
    const o = outliers(col.values.filter((v): v is number => v !== null));
    if (!o || o.share > FLOORS.outlierShare) continue;
    found.push({
      kind: "outlier",
      columns: [col.column],
      sentence: `${o.count === 1 ? "One value" : `${o.count} values`} in ${col.column} ${o.count === 1 ? "sits" : "sit"} far outside the usual range, up to ${fmt(o.extreme)} times the typical spread away (${fmt(o.worst.value)}).`,
      p: null,
      strength: clamp01(Math.log10(o.extreme) / 3) * 0.7,
      evidence: { count: o.count, share: Number(o.share.toFixed(4)), worstValue: o.worst.value, spreadsAway: Number(o.extreme.toFixed(1)) },
    });
  }

  for (const s of input.series ?? []) {
    const c = changePoint(s.y, { minShift: FLOORS.changeShift });
    if (!c || Math.abs(c.relativeChange) < FLOORS.changeRelative) continue;
    const trend = trendFor.get(s.column);
    const trendStat = trendStats.get(s.column);
    const hasTrend = trend && trendStat && kept[candidates.indexOf(trend)] && trend.passesFloor;
    if (hasTrend && trendStat) {
      // a steady slope gets cut into steps by the detector, and a real step also looks like a trend: keep whichever
      // shape fits the points better, and say it once
      const intercept = median(s.y.map((v, i) => v - trendStat.slope * s.x[i]));
      const line = s.y.reduce((sum, v, i) => sum + (v - (intercept + trendStat.slope * s.x[i])) ** 2, 0);
      const before = s.y.slice(0, c.index);
      const after = s.y.slice(c.index);
      const step = before.reduce((sum, v) => sum + (v - mean(before)) ** 2, 0) + after.reduce((sum, v) => sum + (v - mean(after)) ** 2, 0);
      if (line <= step * 1.1) continue;
      found = found.filter((f) => !(f.kind === "trend" && f.columns[0] === s.column));
    }
    const where = s.labels?.[c.index] ?? `point ${c.index + 1}`;
    found.push({
      kind: "change",
      columns: [s.column],
      sentence: `${s.column} ${c.after > c.before ? "stepped up" : "dropped"} from about ${fmt(c.before)} to ${fmt(c.after)} (${c.relativeChange >= 0 ? "+" : "-"}${pct(c.relativeChange)}) around ${where}.`,
      p: null,
      strength: clamp01(c.shift / 10) * 0.75,
      evidence: { before: Number(fmt(c.before)), after: Number(fmt(c.after)), shiftInNoiseUnits: Number(c.shift.toFixed(1)), at: where },
    });
  }

  for (const m of input.missing ?? []) {
    const share = input.rowCount ? m.nullCount / input.rowCount : 0;
    if (share < FLOORS.missingShare) continue;
    found.push({
      kind: "missing",
      columns: [m.column],
      sentence: `${pct(share)} of ${m.column} is empty.`,
      p: null,
      strength: share * 0.6,
      evidence: { emptyRows: m.nullCount, share: Number(share.toFixed(3)) },
    });
  }

  return found.sort((a, b) => b.strength - a.strength).slice(0, limit);
}
