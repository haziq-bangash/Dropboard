import { incompleteBeta, normalTwoSided } from "./special";
import { mean, median, scaledMad } from "./tests";

export interface Seasonal {
  /** Share of the detrended series' variation that the repeating pattern explains, 0 to 1. */
  strength: number;
  /** p-value of a one-way analysis of variance across the positions in the cycle. */
  p: number;
  /** Position in the cycle (0 to period - 1) with the highest and the lowest average. */
  peak: number;
  low: number;
  /** Highest minus lowest position average, as a fraction of the typical level. */
  amplitude: number;
}

/**
 * Is there a pattern that repeats every `period` steps (twelve months, seven days)? The trend is taken out with a centred
 * moving average over one whole cycle, as classical decomposition does, and what is left is compared across the positions
 * in the cycle with an analysis of variance. `phases` gives each point's position in the cycle (the month, the weekday),
 * so the cycle is lined up with the calendar and not with where the series happens to start.
 * Needs at least two whole cycles, and every position seen at least twice.
 */
export function seasonality(y: number[], phases: number[], period: number): Seasonal | null {
  const n = y.length;
  if (period < 3 || n < period * 2 || phases.length !== n) return null;

  const half = Math.floor(period / 2);
  const detrended: number[] = [];
  const position: number[] = [];
  const levels: number[] = [];
  for (let t = half; t < n - half; t++) {
    let sum = 0;
    let weight = 0;
    for (let k = -half; k <= half; k++) {
      // an even period has no middle point, so its two end points count for half
      const w = period % 2 === 0 && Math.abs(k) === half ? 0.5 : 1;
      sum += y[t + k] * w;
      weight += w;
    }
    const trend = sum / weight;
    detrended.push(y[t] - trend);
    position.push(phases[t]);
    levels.push(trend);
  }
  if (detrended.length < period * 1.5) return null;

  const sums = new Array<number>(period).fill(0);
  const counts = new Array<number>(period).fill(0);
  detrended.forEach((v, i) => {
    sums[position[i]] += v;
    counts[position[i]]++;
  });
  if (counts.some((c) => c < 2)) return null;
  const means = sums.map((s, k) => s / counts[k]);

  const grand = mean(detrended);
  let between = 0;
  means.forEach((m, k) => (between += counts[k] * (m - grand) ** 2));
  let within = 0;
  detrended.forEach((v, i) => (within += (v - means[position[i]]) ** 2));
  const df1 = period - 1;
  const df2 = detrended.length - period;
  if (df2 < 1 || within <= 0 || between + within <= 0) return null;

  const f = between / df1 / (within / df2);
  const p = incompleteBeta(df2 / (df2 + df1 * f), df2 / 2, df1 / 2);
  const level = Math.abs(mean(levels));
  if (!(level > 0)) return null;
  const peak = means.indexOf(Math.max(...means));
  const low = means.indexOf(Math.min(...means));
  return { strength: Math.max(0, 1 - within / (between + within)), p, peak, low, amplitude: (means[peak] - means[low]) / level };
}

export interface Latest {
  previous: number;
  latest: number;
  /** The change from the previous period, as a fraction of the previous value. */
  relativeChange: number;
  /** How far the latest change is from the usual period-to-period change, in units of its robust spread. */
  z: number;
  p: number;
}

/**
 * Did the latest period move unusually compared with how this series usually moves from one period to the next?
 * The usual size of a move is the median of all earlier moves and its spread is their median absolute deviation, so one
 * odd period earlier on does not hide a new one. Series that grow steadily are not flagged for growing.
 */
export function latestChange(y: number[]): Latest | null {
  const n = y.length;
  if (n < 12) return null;
  const earlier: number[] = [];
  for (let i = 1; i < n - 1; i++) earlier.push(y[i] - y[i - 1]);
  const spread = scaledMad(earlier);
  if (!(spread > 0)) return null;
  const previous = y[n - 2];
  const latest = y[n - 1];
  if (!(previous !== 0)) return null;
  const z = (latest - previous - median(earlier)) / spread;
  return { previous, latest, relativeChange: (latest - previous) / Math.abs(previous), z, p: normalTwoSided(z) };
}
