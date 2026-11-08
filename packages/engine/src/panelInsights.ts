import { clamp01, fmt, observedChange, pct } from "./format";
import type { InsightInput, RawFinding } from "./insights";
import { tTwoSided } from "./stats/special";
import { mannKendall, median, scaledMad } from "./stats/tests";

/**
 * Findings for a table of entities over periods (companies by year, stores by week): who leads, who is rising or falling, the
 * biggest single-period move, who changed rank most, and who stands apart from their peers. Everything works on each entity's
 * own series, so a total that changes only because entities joined or left can never be mistaken for growth.
 */
type Panel = NonNullable<InsightInput["panel"]>[number];

const MIN_POINTS = 6;

/** The last index of a series that has a value for an entity, or -1. */
const lastAt = (y: (number | null)[]) => {
  for (let i = y.length - 1; i >= 0; i--) if (y[i] !== null) return i;
  return -1;
};

export interface PanelCandidate {
  finding: RawFinding;
  passesFloor: boolean;
}

/**
 * One test per entity and measure: does its own series trend? These join the other tests in the one false-discovery
 * correction, so having many entities does not make a chance rise more likely to be reported.
 */
export function panelTrendCandidates(panels: Panel[]): PanelCandidate[] {
  const out: PanelCandidate[] = [];
  for (const p of panels) {
    for (const e of p.entities) {
      const xs: number[] = [];
      const ys: number[] = [];
      e.y.forEach((v, i) => {
        if (v !== null) {
          xs.push(p.periods[i].x);
          ys.push(v);
        }
      });
      if (ys.length < MIN_POINTS) continue;
      const m = mannKendall(xs, ys);
      if (!m) continue;
      const first = e.y.findIndex((v) => v !== null);
      const last = lastAt(e.y);
      // what the figures did between the first and last period, shown in the sentence; the fitted line decides whether it is real
      const seen = observedChange(ys);
      const shown = seen !== null && Math.sign(seen) === Math.sign(m.slope) ? seen : m.relativeChange;
      out.push({
        finding: {
          kind: "entitytrend",
          columns: [p.entity, p.measure],
          sentence: `${e.label}'s ${p.measure} ${m.slope > 0 ? "rose" : "fell"} about ${pct(shown)} between ${p.periods[first].label} and ${p.periods[last].label}.`,
          p: m.p,
          strength: clamp01(Math.abs(shown)) * clamp01(0.5 + -Math.log10(Math.max(m.p, 1e-300)) / 20),
          evidence: { label: e.label, relativeChange: Number(shown.toFixed(3)), noiseUnits: Number(m.noiseUnits.toFixed(1)), points: ys.length, at: p.periods[last].label },
        },
        passesFloor: Math.abs(m.relativeChange) >= 0.3 && Math.abs(m.noiseUnits) >= 2,
      });
    }
  }
  return out;
}

/** One group is far above or below the rest (a product, a store), and a few groups hold most of a total. */
export function groupFindings(input: Pick<InsightInput, "groups" | "pareto">): RawFinding[] {
  const found: RawFinding[] = [];
  for (const g of input.groups ?? []) {
    const s = standoutAmong(g.values.map((x) => ({ label: x.label, v: x.value })));
    if (!s) continue;
    found.push({
      kind: "standout",
      columns: [g.column, g.measure],
      sentence: `${s.far.label} has the ${s.z > 0 ? "highest" : "lowest"} total ${g.measure} among ${g.values.length} values of ${g.column}: ${fmt(s.far.v)} against a typical ${fmt(s.med)}.`,
      p: s.p,
      strength: clamp01(Math.abs(s.z) / 10) * 0.7,
      evidence: { label: s.far.label, value: Number(fmt(s.far.v)), typical: Number(fmt(s.med)), spreadsAway: Number(Math.abs(s.z).toFixed(1)) },
    });
  }
  for (const c of input.pareto ?? []) {
    // an even spread gives the top fifth a fifth of the total; more than 55% is a real concentration
    if (c.groups < 20 || c.top20 < 0.55) continue;
    const top = Math.ceil(c.groups * 0.2);
    found.push({
      kind: "pareto",
      columns: [c.column, c.measure],
      sentence: `The top 20% of ${c.column} (${fmt(top)} of ${fmt(c.groups)}) account for ${pct(c.top20)} of ${c.measure}.`,
      p: null,
      strength: clamp01((c.top20 - 0.2) / 0.8) * 0.7,
      evidence: { share20: Number(c.top20.toFixed(3)), share10: Number(c.top10.toFixed(3)), groups: c.groups, topGroups: top, biggestShare: Number(c.biggest.toFixed(3)) },
    });
  }
  return found;
}

/** Of all the entity trends that held up, keep the strongest rise and the strongest fall for each measure: the rest are the same story. */
export function strongestTrends(found: RawFinding[]): RawFinding[] {
  const best = new Map<string, RawFinding>();
  for (const f of found.filter((x) => x.kind === "entitytrend")) {
    const key = `${f.columns[1]}|${Number(f.evidence.relativeChange) > 0 ? "up" : "down"}`;
    if (!best.has(key) || f.strength > best.get(key)!.strength) best.set(key, f);
  }
  return [...found.filter((x) => x.kind !== "entitytrend"), ...best.values()];
}

/**
 * Is one of these far from the rest? It must be well outside in robust terms, and also clearly outside when tested against the
 * others with Student's t (as for a new observation), with the p-value multiplied by how many were looked at: with a handful of
 * values the robust spread alone is unstable and flags too readily.
 */
export function standoutAmong(items: { label: string; v: number }[]): { far: { label: string; v: number }; z: number; med: number; p: number } | null {
  if (items.length < 6) return null;
  const med = median(items.map((e) => e.v));
  const spread = scaledMad(items.map((e) => e.v));
  if (!(spread > 0)) return null;
  const far = items.reduce((a, b) => (Math.abs(b.v - med) > Math.abs(a.v - med) ? b : a));
  const z = (far.v - med) / spread;
  const others = items.filter((e) => e !== far).map((e) => e.v);
  const m = others.length;
  const mean = others.reduce((s, v) => s + v, 0) / m;
  const sd = Math.sqrt(others.reduce((s, v) => s + (v - mean) ** 2, 0) / (m - 1));
  const p = sd > 0 ? Math.min(1, tTwoSided((far.v - mean) / (sd * Math.sqrt(1 + 1 / m)), m - 1) * items.length) : 1;
  return Math.abs(z) >= 3.5 && p <= 0.01 ? { far, z, med, p } : null;
}

/** Checks that pass on a clear, large effect alone, as the outlier and step checks do. */
export function panelChecks(panels: Panel[], trending: Set<string> = new Set()): RawFinding[] {
  const found: RawFinding[] = [];
  for (const p of panels) {
    const last = p.periods.length - 1;
    const now = p.entities.map((e) => ({ label: e.label, v: e.y[last] })).filter((e): e is { label: string; v: number } => e.v !== null);

    // who is biggest in the latest period, and how much of the total they hold
    if (p.kind === "flow" && now.length >= 3) {
      const total = now.reduce((s, e) => s + Math.max(0, e.v), 0);
      const top = now.reduce((a, b) => (b.v > a.v ? b : a));
      const share = total > 0 ? top.v / total : 0;
      const times = share * now.length;
      if (share >= 0.3 && times >= 2) {
        found.push({
          kind: "leader",
          columns: [p.entity, p.measure],
          sentence: `${top.label} has the largest ${p.measure} in ${p.periods[last].label}: ${pct(share)} of the total across ${now.length} values of ${p.entity}, about ${fmt(times)} times an even share.`,
          p: null,
          strength: share * 0.65,
          evidence: { label: top.label, share: Number(share.toFixed(3)), timesEven: Number(times.toFixed(2)), groups: now.length, at: p.periods[last].label },
        });
      }
    }

    // who is far from their peers in the latest period, for levels and rates, where a share of a total means nothing
    if (p.kind !== "flow" && now.length >= 6) {
      const s = standoutAmong(now);
      if (s) {
        found.push({
          kind: "standout",
          columns: [p.entity, p.measure],
          sentence: `${s.far.label} has the ${s.z > 0 ? "highest" : "lowest"} ${p.measure} in ${p.periods[last].label}, ${fmt(s.far.v)} against a typical ${fmt(s.med)}.`,
          p: s.p,
          strength: clamp01(Math.abs(s.z) / 10) * 0.7,
          evidence: { label: s.far.label, value: Number(fmt(s.far.v)), typical: Number(fmt(s.med)), spreadsAway: Number(Math.abs(s.z).toFixed(1)), at: p.periods[last].label },
        });
      }
    }

    // the biggest move from one period to the next, against how every entity usually moves
    if (p.kind !== "rate") {
      const moves: { label: string; at: number; r: number }[] = [];
      for (const e of p.entities) {
        for (let i = 1; i < e.y.length; i++) {
          const a = e.y[i - 1];
          const b = e.y[i];
          if (a !== null && b !== null && a > 0 && b > 0) moves.push({ label: e.label, at: i, r: Math.log(b / a) });
        }
      }
      if (moves.length >= 20) {
        const med = median(moves.map((m) => m.r));
        const spread = scaledMad(moves.map((m) => m.r));
        if (spread > 0) {
          const big = moves.reduce((a, b) => (Math.abs(b.r - med) > Math.abs(a.r - med) ? b : a));
          const z = (big.r - med) / spread;
          const change = Math.exp(big.r) - 1;
          if (Math.abs(z) >= 5 && Math.abs(change) >= 0.5) {
            found.push({
              kind: "jump",
              columns: [p.entity, p.measure],
              sentence: `${big.label}'s ${p.measure} ${change > 0 ? "jumped" : "fell"} ${pct(change)} in ${p.periods[big.at].label}, the biggest one-period move among ${p.entities.length} values of ${p.entity}.`,
              p: null,
              strength: clamp01(Math.abs(change) / 3) * 0.7,
              evidence: { label: big.label, change: Number(change.toFixed(3)), spreadsAway: Number(Math.abs(z).toFixed(1)), at: p.periods[big.at].label },
            });
          }
        }
      }
    }

    // who climbed or slid the most places between the first and the latest period
    if (p.kind !== "rate") {
      const both = p.entities.map((e) => ({ label: e.label, a: e.y[0], b: e.y[last] })).filter((e): e is { label: string; a: number; b: number } => e.a !== null && e.b !== null);
      if (both.length >= 6) {
        const rank = (key: "a" | "b") => new Map([...both].sort((x, y) => y[key] - x[key]).map((e, i) => [e.label, i + 1]));
        const from = rank("a");
        const to = rank("b");
        // ranks shuffle by themselves when figures are noisy, so a move up or down only counts when the entity's own series has a
        // trend that held up in the correction (see strongestTrends), and not merely because its first and last figures differ
        const moved = both
          .map((e) => ({ label: e.label, from: from.get(e.label)!, to: to.get(e.label)!, places: from.get(e.label)! - to.get(e.label)! }))
          .filter((m) => trending.has(`${p.measure}|${m.label}`));
        if (!moved.length) continue;
        const climber = moved.reduce((a, b) => (b.places > a.places ? b : a));
        const slider = moved.reduce((a, b) => (b.places < a.places ? b : a));
        const floor = Math.max(3, Math.ceil(both.length * 0.3));
        for (const m of climber === slider ? [climber] : [climber, slider]) {
          if (Math.abs(m.places) >= floor) {
            found.push({
              kind: "rankshift",
              columns: [p.entity, p.measure],
              sentence: `${m.label} ${m.places > 0 ? "climbed" : "slid"} from #${m.from} to #${m.to} in ${p.measure} between ${p.periods[0].label} and ${p.periods[last].label}, among ${both.length} values of ${p.entity}.`,
              p: null,
              strength: clamp01(Math.abs(m.places) / both.length) * 0.6,
              evidence: { label: m.label, from: m.from, to: m.to, places: Math.abs(m.places), groups: both.length, at: p.periods[last].label },
            });
          }
        }
      }
    }
  }
  return found;
}
