import { seriesAnomalies } from "./anomaly/series";
import { clamp01, fmt, observedChange, pct, pctFine } from "./format";
import { qualityFindings, type QualityInput } from "./quality";
import { panelChecks, panelTrendCandidates, strongestTrends } from "./panelInsights";
import { latestChange, seasonality } from "./stats/season";
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

export type FindingKind = "trend" | "change" | "outlier" | "correlation" | "dominance" | "concentration" | "missing" | "seasonal" | "latest" | "duplicates" | "leader" | "standout" | "entitytrend" | "jump" | "rankshift" | "unusualrows" | "contextual" | "quality";

/** The rows or points behind a finding, for a person to look at. They stay in the browser: nothing here is ever sent to a model. */
export interface FindingDetails {
  caption: string;
  columns: string[];
  rows: (string | number | null)[][];
}

export interface Finding {
  /** Rows to show under the finding, when it is about particular rows. */
  details?: FindingDetails;
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
  /** A short title for a story page, without the detail of the sentence. */
  headline: string;
  /** The one number worth showing big, and what it is. */
  figure: { value: string; label: string };
  /** A suggestion for what to look at next. It points somewhere to look; it does not claim a cause. */
  next: string;
}

/** A finding before its headline, figure and suggestion are worked out from its evidence. */
export type RawFinding = Omit<Finding, "headline" | "figure" | "next"> ;

export interface SeriesInput {
  column: string;
  /** Position along the axis (a time in ms, or just 0, 1, 2...). */
  x: number[];
  y: number[];
  /** What to call each x in a sentence, same length as x. */
  labels?: string[];
  /** The step between points, when x is a time. Lets the engine look for a yearly or weekly pattern and for the latest move. */
  unit?: "day" | "week" | "month" | "year";
}

export interface InsightInput {
  rowCount: number;
  /** A measure summed or averaged over time. */
  series?: SeriesInput[];
  /** Values of measure columns, row by row (a sample is fine), for relationships and outliers. */
  numeric?: { column: string; values: (number | null)[] }[];
  /** Category columns with how many rows each value has. */
  categories?: { column: string; counts: { label: string; count: number }[] }[];
  /** How a measure that adds up (money, units) splits across the values of a category column. */
  contributions?: { column: string; measure: string; parts: { label: string; value: number }[] }[];
  /** Columns and how many rows are empty. */
  missing?: { column: string; nullCount: number }[];
  /** One row per entity per period: each entity's own values for a measure, period by period (null where it has none). */
  panel?: {
    entity: string;
    measure: string;
    kind: "flow" | "level" | "rate";
    periods: { x: number; label: string }[];
    /** The step between periods, so a yearly or weekly pattern can be taken into account. */
    unit?: "day" | "week" | "month" | "year";
    entities: { label: string; y: (number | null)[] }[];
  }[];
  /** Rows that are unusual across several measures, found on the rows themselves (see anomaly/ecod). */
  unusual?: {
    scored: number;
    flagged: number;
    measures: string[];
    /** Every measure the rows were looked at on, including ones left out of the joint test for moving with another. */
    considered: string[];
    top: { id: number; source: "joint" | "isolated"; score: number; reasons: { measure: string; side: "high" | "low"; z: number }[]; row: Record<string, unknown> }[];
  };
  /** Checks on the values themselves: spellings, placeholders, numbers as text, impossible dates, empty periods, repeated keys. */
  quality?: QualityInput;
  /** How many rows are exact copies of an earlier row. */
  duplicates?: { rows: number };
}

export interface InsightOptions {
  /** Share of findings allowed to be false, on average. Default 5%. */
  q?: number;
  /** Largest number of findings to return. Default 8. */
  limit?: number;
  /** Most findings of one kind in the result, so a list is not six correlations in a row. Default 3. */
  perKind?: number;
}

/** What counts as big enough to matter, per kind. */
export const FLOORS = {
  trendChange: 0.15, // the fitted line moves at least 15% of where it starts
  trendNoise: 2, // and at least 2 noise units
  correlation: 0.3, // |r|
  dominanceShare: 0.4, // one category holds at least 40% of rows
  dominanceTimes: 2, // and at least twice an even split
  outlierShare: 0.01, // more than 1% of rows far out is a skewed or structured column (rent among groceries), not outliers
  concentrationShare: 0.4, // one category holds at least 40% of a total
  concentrationTimes: 2, // and at least twice an even share
  missingShare: 0.2,
  seasonStrength: 0.5, // the repeating pattern explains at least half of what is left after the trend
  seasonAmplitude: 0.15, // and its high and low points are at least 15% of the typical level apart
  latestChange: 0.1, // the latest period moved at least 10% from the one before
  latestZ: 3, // and at least 3 robust spreads more than a usual move
  duplicateShare: 0.02, // at least 2% of rows are copies
  changeShift: 4, // noise units
  changeRelative: 0.1, // and the level moves at least 10%
} as const;

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** Fold how unlikely the result is by chance into the ranking, without letting it overrule how big the effect is. */
const confidence = (p: number | null) => (p === null ? 0.7 : clamp01(0.5 + -Math.log10(Math.max(p, 1e-300)) / 20));

const cell = (v: unknown): string | number | null => (v === null || v === undefined ? null : typeof v === "number" ? Number(fmt(v)) === v ? v : Number(v.toFixed(2)) : v instanceof Date ? v.toISOString().slice(0, 10) : String(v));

function contextualFinding(measure: string, entity: string | null, when: string, a: { actual: number; expected: number; relative: number | null; z: number }, seasonal: boolean): RawFinding {
  const subject = entity ? `${entity}'s ${measure}` : measure;
  const how =
    a.relative === null
      ? a.actual > a.expected ? "far above" : "far below"
      : a.relative >= 3
        ? `about ${a.relative >= 9 ? Math.round(1 + a.relative) : fmt(1 + a.relative)} times`
        : `${pct(a.relative)} ${a.relative > 0 ? "above" : "below"}`;
  return {
    kind: "contextual",
    columns: [measure],
    sentence: `${subject} in ${when} was ${how} what its trend${seasonal ? " and season" : ""} predict${seasonal ? "" : "s"} (${fmt(a.actual)} against about ${fmt(a.expected)}).`,
    p: null,
    strength: clamp01(Math.abs(a.z) / 20) * 0.65,
    evidence: { ...(entity ? { label: entity } : {}), at: when, change: a.relative === null ? 0 : Number(a.relative.toFixed(3)), actual: Number(fmt(a.actual)), expected: Number(fmt(a.expected)), spreadsAway: Number(Math.abs(a.z).toFixed(1)) },
  };
}

/** The headline, big number and next step for a finding, all taken from its own evidence so they cannot disagree with it. */
function describe(f: RawFinding): Pick<Finding, "headline" | "figure" | "next"> {
  const e = f.evidence;
  const [a, b] = f.columns;
  switch (f.kind) {
    case "trend": {
      const change = Number(e.relativeChange);
      return {
        headline: `${a} ${change > 0 ? "rose" : "fell"} ${pct(change)}`,
        figure: { value: `${change > 0 ? "+" : "-"}${pct(change)}`, label: "from start to end" },
        next: "Look for what changed over the period: a price, a campaign, a season, a new group of customers.",
      };
    }
    case "change": {
      const before = Number(e.before);
      const after = Number(e.after);
      const relative = before !== 0 ? (after - before) / Math.abs(before) : 0;
      return {
        headline: `${a} ${after > before ? "stepped up" : "dropped"} around ${e.at}`,
        figure: { value: `${relative >= 0 ? "+" : "-"}${pct(relative)}`, label: `${fmt(before)} to ${fmt(after)}` },
        next: `Find out what happened around ${e.at}: a launch, a policy change, a change in how the data was recorded.`,
      };
    }
    case "correlation": {
      const r = Number(e.r);
      return {
        headline: `${a} and ${b} ${r > 0 ? "move together" : "move in opposite directions"}`,
        figure: { value: `r = ${r.toFixed(2)}`, label: "correlation" },
        next: "A relationship is not a cause. Look for what drives both, or whether one really leads the other.",
      };
    }
    case "dominance":
      return {
        headline: `${e.label} dominates ${a}`,
        figure: { value: pct(Number(e.share)), label: "of all rows" },
        next: "Ask whether depending on one value is a risk, and whether the others deserve more attention.",
      };
    case "concentration":
      return {
        headline: `${e.label} accounts for most of ${b}`,
        figure: { value: pct(Number(e.share)), label: `of ${b}` },
        next: "Ask whether depending on one value is a risk, and whether the others deserve more attention.",
      };
    case "outlier": {
      const count = Number(e.count);
      return {
        headline: `${count === 1 ? "One" : "A few"} ${a} ${count === 1 ? "value stands" : "values stand"} apart`,
        figure: { value: fmt(Number(e.worstValue)), label: "the most extreme value" },
        next: "Check whether these are mistakes (a typo, an extra zero) or real events worth a closer look.",
      };
    }
    case "quality":
      return {
        headline: `${e.issues} ${Number(e.issues) === 1 ? "problem" : "problems"} in the data`,
        figure: { value: String(e.issues), label: Number(e.issues) === 1 ? "problem to fix" : "problems to fix" },
        next: "Fix these in your file first and upload it again: each one changes what a total, a chart or an average means.",
      };
    case "unusualrows":
      return {
        headline: `${fmt(Number(e.flagged))} rows stand out`,
        figure: { value: fmt(Number(e.flagged)), label: `of ${fmt(Number(e.scored))} rows` },
        next: "Look at these rows first: a typing mistake, a one-off sale, a record that does not belong. Totals and averages include them.",
      };
    case "contextual": {
      const change = Number(e.change);
      return {
        headline: `${e.label ? `${e.label}'s ` : ""}${a} broke its pattern in ${e.at}`,
        figure: { value: change === 0 ? "off pattern" : `${change >= 0 ? "+" : "-"}${pct(change)}`, label: "against what was expected" },
        next: "Check whether something happened then (a launch, an outage, a change in how it was counted) or whether it is a mistake in the data.",
      };
    }
    case "entitytrend": {
      const change = Number(e.relativeChange);
      return {
        headline: `${e.label}'s ${b} ${change > 0 ? "rose" : "fell"} ${pct(change)}`,
        figure: { value: `${change >= 0 ? "+" : "-"}${pct(change)}`, label: `through ${e.at}` },
        next: `Look at what sets this ${a} apart from the others: its products, prices, costs or market, and whether the rest of the group moved too.`,
      };
    }
    case "leader":
      return {
        headline: `${e.label} leads on ${b}`,
        figure: { value: pct(Number(e.share)), label: `of the total in ${e.at}` },
        next: `Ask whether relying on one ${a} is a risk, and what the others would need to close the gap.`,
      };
    case "standout":
      return {
        headline: `${e.label} stands out on ${b}`,
        figure: { value: fmt(Number(e.value)), label: `against a typical ${fmt(Number(e.typical))}` },
        next: "Check whether this is a real difference or a different way of measuring or reporting, before building on it.",
      };
    case "jump": {
      const change = Number(e.change);
      return {
        headline: `${e.label}'s ${b} ${change > 0 ? "jumped" : "fell"} ${pct(change)} in ${e.at}`,
        figure: { value: `${change >= 0 ? "+" : "-"}${pct(change)}`, label: `in ${e.at}` },
        next: "Check for an acquisition, a change in how the figure is reported, or a data error before reading it as growth or decline.",
      };
    }
    case "rankshift":
      return {
        headline: `${e.label} moved from #${e.from} to #${e.to} on ${b}`,
        figure: { value: `${e.places} places`, label: `out of ${e.groups}` },
        next: "Look at who it overtook, or who overtook it, and what changed in between.",
      };
    case "seasonal": {
      const yearly = Number(e.period) === 12;
      return {
        headline: `${a} follows a ${yearly ? "yearly" : "weekly"} pattern`,
        figure: { value: pct(Number(e.amplitude)), label: `between the highest and lowest ${yearly ? "month" : "day"}` },
        next: yearly
          ? "Compare each month with the same month last year, not with the month before, and plan around the high and low months."
          : "Compare each day with the same weekday, not with the day before, and plan staffing and stock around the pattern.",
      };
    }
    case "latest": {
      const change = Number(e.change);
      return {
        headline: `${a} ${change > 0 ? "jumped" : "fell"} ${pct(change)} in the latest period`,
        figure: { value: `${change >= 0 ? "+" : "-"}${pct(change)}`, label: "since the period before" },
        next: "Check whether the latest period is complete and whether something changed just then, before reading it as a trend.",
      };
    }
    case "duplicates":
      return {
        headline: `${fmt(Number(e.duplicateRows))} rows are copies`,
        figure: { value: pct(Number(e.share)), label: "of rows repeat an earlier row" },
        next: "Check whether these are the same record entered twice or separate events that look alike, since totals and counts include every copy.",
      };
    case "missing":
      return {
        headline: `${a} has gaps`,
        figure: { value: pct(Number(e.share)), label: "of rows are empty" },
        next: "Find out why these cells are empty before trusting averages and totals built on them.",
      };
  }
}

interface Candidate extends RawFinding {
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
    // shown: what the series did from its start to its end; the fitted line only decides whether it is real
    const seen = observedChange(s.y);
    const shown = seen !== null && Math.sign(seen) === Math.sign(m.slope) ? seen : m.relativeChange;
    const c: Candidate = {
      kind: "trend",
      columns: [s.column],
      sentence: `${s.column} ${m.slope > 0 ? "rose" : "fell"} about ${pct(shown)} from start to end.`,
      p: m.p,
      strength: clamp01(Math.abs(m.relativeChange)) * confidence(m.p),
      evidence: { slopePerStep: Number(fmt(m.slope)), relativeChange: Number(shown.toFixed(3)), noiseUnits: Number(m.noiseUnits.toFixed(1)), points: s.y.length },
      tested: true,
      passesFloor: big,
    };
    candidates.push(c);
    trendFor.set(s.column, c);
    trendStats.set(s.column, m);
  }

  // ---- a repeating yearly or weekly pattern, and an unusual latest move ----
  for (const s of input.series ?? []) {
    if (!s.unit) continue;
    const period = s.unit === "month" ? 12 : s.unit === "day" ? 7 : 0;
    const phases = s.x.map((t) => (s.unit === "month" ? new Date(t).getUTCMonth() : new Date(t).getUTCDay()));
    const season = period ? seasonality(s.y, phases, period) : null;
    if (season) {
      const names = period === 12 ? MONTH_NAMES : DAY_NAMES;
      candidates.push({
        kind: "seasonal",
        columns: [s.column],
        sentence: `${s.column} follows a ${period === 12 ? "yearly" : "weekly"} pattern: highest ${period === 12 ? "in" : "on"} ${names[season.peak]}, lowest ${period === 12 ? "in" : "on"} ${names[season.low]}, about ${pct(season.amplitude)} apart.`,
        p: season.p,
        strength: clamp01(season.strength) * clamp01(season.amplitude) * confidence(season.p),
        evidence: { period, strength: Number(season.strength.toFixed(2)), amplitude: Number(season.amplitude.toFixed(3)), peak: names[season.peak], low: names[season.low] },
        tested: true,
        passesFloor: season.strength >= FLOORS.seasonStrength && Math.abs(season.amplitude) >= FLOORS.seasonAmplitude,
      });
    }
    const last = s.unit === "day" ? null : latestChange(s.y);
    if (last) {
      const where = s.labels?.[s.y.length - 1] ?? "the latest period";
      candidates.push({
        kind: "latest",
        columns: [s.column],
        sentence: `${s.column} ${last.relativeChange > 0 ? "rose" : "fell"} ${pct(last.relativeChange)} in ${where}, much more than it usually moves from one period to the next.`,
        p: last.p,
        strength: clamp01(Math.abs(last.relativeChange)) * confidence(last.p) * 0.8,
        evidence: { change: Number(last.relativeChange.toFixed(3)), z: Number(last.z.toFixed(1)), previous: Number(fmt(last.previous)), latest: Number(fmt(last.latest)), at: where },
        tested: true,
        passesFloor: Math.abs(last.relativeChange) >= FLOORS.latestChange && Math.abs(last.z) >= FLOORS.latestZ,
      });
    }
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

  // each entity's own series is one more test in the same correction
  for (const c of panelTrendCandidates(input.panel ?? [])) candidates.push({ ...c.finding, tested: true, passesFloor: c.passesFloor });

  const kept = benjaminiHochberg(
    candidates.map((c) => c.p ?? 1),
    q,
  );

  let found: RawFinding[] = [];
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

  // Where a total comes from. Counts are tested above; these are sums of money or units, which a count test cannot judge,
  // so they pass on a clear, large share alone.
  for (const c of input.contributions ?? []) {
    const total = c.parts.reduce((s, p) => s + p.value, 0);
    if (c.parts.length < 3 || !(total > 0) || c.parts.some((p) => p.value < 0)) continue;
    const top = c.parts.reduce((best, p) => (p.value > best.value ? p : best));
    const share = top.value / total;
    const times = share * c.parts.length;
    if (share < FLOORS.concentrationShare || times < FLOORS.concentrationTimes) continue;
    found.push({
      kind: "concentration",
      columns: [c.column, c.measure],
      sentence: `${top.label} accounts for ${pct(share)} of ${c.measure}, about ${fmt(times)} times an even share across ${c.column}.`,
      p: null,
      strength: share * 0.65,
      evidence: { label: top.label, share: Number(share.toFixed(3)), timesEven: Number(times.toFixed(2)), groups: c.parts.length },
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

  const copies = input.duplicates?.rows ?? 0;
  const copyShare = input.rowCount ? copies / input.rowCount : 0;
  if (copies >= 2 && copyShare >= FLOORS.duplicateShare) {
    found.push({
      kind: "duplicates",
      columns: [],
      sentence: `${fmt(copies)} rows (${pct(copyShare)}) are exact copies of another row.`,
      p: null,
      strength: copyShare * 0.6,
      evidence: { duplicateRows: copies, share: Number(copyShare.toFixed(3)) },
    });
  }

  // ---- rows that are unusual across several measures, with the rows themselves for a person to look at ----
  const u = input.unusual;
  if (u && u.flagged > 0 && u.top.length) {
    const top = u.top[0];
    const share = u.scored ? u.flagged / u.scored : 0;
    const why = (t: (typeof u.top)[number]) => t.reasons.slice(0, 2).map((r) => `${r.side === "high" ? "unusually high" : "unusually low"} ${r.measure}`).join(" and ");
    const shown = new Set<string>();
    for (const t of u.top) for (const r of t.reasons.slice(0, 2)) shown.add(r.measure);
    for (const k of Object.keys(u.top[0].row)) if (shown.size < 6) shown.add(k);
    const columns = [...shown];
    found.push({
      kind: "unusualrows",
      columns: u.measures,
      sentence: `${fmt(u.flagged)} of ${fmt(u.scored)} rows (${pctFine(share)}) stand out from the rest across ${u.measures.length} measures. The most unusual has ${why(top)}.`,
      p: null,
      strength: 0.55 + clamp01(Math.abs(top.reasons[0]?.z ?? 0) / 25) * 0.3,
      evidence: { flagged: u.flagged, scored: u.scored, share: Number(share.toFixed(4)), measures: u.measures.length, strongestZ: Number(Math.abs(top.reasons[0]?.z ?? 0).toFixed(1)) },
      details: {
        caption: "The most unusual rows, and what makes each stand out. They stay in your browser.",
        columns: ["Row", "Why", ...columns],
        rows: u.top.map((t) => [t.id + 1, why(t), ...columns.map((c) => cell(t.row[c]))]),
      },
    });
    // a lone extreme value is already described here, with the row it is in
    found = found.filter((x) => x.kind !== "outlier");
  }

  found.push(...qualityFindings(input.quality, input.rowCount));

  // ---- points that break their own trend and season ----
  const contextual: RawFinding[] = [];
  for (const s of input.series ?? []) {
    const phases = s.unit === "month" ? s.x.map((t) => new Date(t).getUTCMonth()) : s.unit === "day" ? s.x.map((t) => new Date(t).getUTCDay()) : null;
    const period = s.unit === "month" ? 12 : s.unit === "day" ? 7 : 0;
    for (const a of seriesAnomalies(s.y, phases && period ? { season: { phases, period } } : {}).slice(0, 2)) {
      contextual.push(contextualFinding(s.column, null, s.labels?.[a.index] ?? `point ${a.index + 1}`, a, !!phases));
    }
  }
  for (const p of input.panel ?? []) {
    for (const e of p.entities) {
      const idx: number[] = [];
      const ys: number[] = [];
      e.y.forEach((v, i) => {
        if (v !== null) {
          idx.push(i);
          ys.push(v);
        }
      });
      if (p.kind === "rate") continue;
      // a monthly or daily panel has its season: the same dip in every December is the pattern, not an anomaly
      const phases = p.unit === "month" ? idx.map((i) => new Date(p.periods[i].x).getUTCMonth()) : p.unit === "day" ? idx.map((i) => new Date(p.periods[i].x).getUTCDay()) : null;
      const period = p.unit === "month" ? 12 : p.unit === "day" ? 7 : 0;
      for (const a of seriesAnomalies(ys, phases && period ? { season: { phases, period } } : {}).slice(0, 1)) {
        contextual.push(contextualFinding(p.measure, e.label, p.periods[idx[a.index]].label, a, !!phases));
      }
    }
  }
  // a one-period jump among peers already tells the same story about that entity
  // and when rows are already named as unusual, a total over time that spiked because of them is the same story
  const covered = new Set((u?.flagged ? u.considered : []).flatMap((m) => [m, `Average ${m}`]));
  for (let i = contextual.length - 1; i >= 0; i--) if (!contextual[i].evidence.label && covered.has(contextual[i].columns[0])) contextual.splice(i, 1);
  const jumps = new Set(found.filter((x) => x.kind === "jump").map((x) => `${x.evidence.label}|${x.evidence.at}`));
  found.push(...contextual.filter((x) => !jumps.has(`${x.evidence.label}|${x.evidence.at}`)));

  // an entity whose own series has a trend that held up: only those can have changed rank for a real reason
  const trending = new Set(found.filter((x) => x.kind === "entitytrend").map((x) => `${x.columns[1]}|${x.evidence.label}`));
  found.push(...panelChecks(input.panel ?? [], trending));
  found = strongestTrends(found);

  // a yearly or weekly pattern already explains why the latest period is high or low, so the pattern is said instead
  const seasonal = new Set(found.filter((x) => x.kind === "seasonal").map((x) => x.columns[0]));
  found = found.filter((x) => !(x.kind === "latest" && seasonal.has(x.columns[0])));

  // strongest first, but never more than `perKind` of one kind
  const perKind = options.perKind ?? 3;
  const taken = new Map<FindingKind, number>();
  return found
    .sort((a, b) => b.strength - a.strength)
    .filter((f) => {
      const n = taken.get(f.kind) ?? 0;
      taken.set(f.kind, n + 1);
      return n < perKind;
    })
    .slice(0, limit)
    .map((f) => ({ ...f, ...describe(f) }));
}
