import { chiSquareSurvival, normalTwoSided, tTwoSided } from "./special";

export const median = (values: number[]): number => {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / (values.length || 1);

/** Sample variance. */
export const variance = (values: number[]) => {
  const m = mean(values);
  return values.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, values.length - 1);
};

/** Median absolute deviation, scaled so it equals the standard deviation for normal data. */
export const scaledMad = (values: number[]): number => {
  const m = median(values);
  return 1.4826 * median(values.map((v) => Math.abs(v - m)));
};

/** Benjamini-Hochberg: which of these p-values can be called discoveries while keeping the false discovery rate at q. */
export function benjaminiHochberg(pValues: number[], q = 0.05): boolean[] {
  const n = pValues.length;
  const order = pValues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  let cutoff = -1;
  order.forEach(({ p }, rank) => {
    if (p <= ((rank + 1) / n) * q) cutoff = rank;
  });
  const keep = new Array<boolean>(n).fill(false);
  for (let r = 0; r <= cutoff; r++) keep[order[r].i] = true;
  return keep;
}

// ---- trend ----

export interface Trend {
  /** Kendall's S: concordant minus discordant pairs. */
  s: number;
  /** Two-sided p-value (Mann-Kendall, adjusted for ties and for serial correlation). */
  p: number;
  /** Theil-Sen slope, in y units per x unit. */
  slope: number;
  /** The Theil-Sen line's change from the first x to the last, as a fraction of where it starts. */
  relativeChange: number;
  /** The same change in units of the series' robust noise level. */
  noiseUnits: number;
}

const MAX_TREND_POINTS = 600;

/**
 * Mann-Kendall trend test with the Theil-Sen slope. It makes no assumption about the shape of the data.
 * Series that move slowly (neighbours resemble each other) look trending by chance, so the variance is inflated by the
 * lag-1 serial correlation of the detrended series, which keeps random walks from being called trends too readily.
 */
export function mannKendall(x: number[], y: number[]): Trend | null {
  if (x.length !== y.length || y.length < 8) return null;
  // keep the pair loops affordable on long series
  const stride = Math.ceil(y.length / MAX_TREND_POINTS);
  const xs = x.filter((_, i) => i % stride === 0);
  const ys = y.filter((_, i) => i % stride === 0);
  const n = ys.length;

  let s = 0;
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      s += Math.sign(ys[j] - ys[i]);
      if (xs[j] !== xs[i]) slopes.push((ys[j] - ys[i]) / (xs[j] - xs[i]));
    }
  }

  // ties in y
  const counts = new Map<number, number>();
  for (const v of ys) counts.set(v, (counts.get(v) ?? 0) + 1);
  let tieTerm = 0;
  for (const t of counts.values()) if (t > 1) tieTerm += t * (t - 1) * (2 * t + 5);
  let variance = (n * (n - 1) * (2 * n + 5) - tieTerm) / 18;

  const slope = median(slopes);
  const intercept = median(ys.map((v, i) => v - slope * xs[i]));

  // serial correlation of what is left after removing the trend
  const resid = ys.map((v, i) => v - (intercept + slope * xs[i]));
  const rm = mean(resid);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    den += (resid[i] - rm) ** 2;
    if (i > 0) num += (resid[i] - rm) * (resid[i - 1] - rm);
  }
  const rho = den > 0 ? Math.max(0, num / den) : 0;
  variance *= Math.min(10, (1 + rho) / (1 - Math.min(rho, 0.9)));

  const z = s === 0 ? 0 : (s - Math.sign(s)) / Math.sqrt(variance);
  const p = normalTwoSided(z);

  const span = xs[n - 1] - xs[0];
  const start = intercept + slope * xs[0];
  const noise = scaledMad(resid);
  return {
    s,
    p,
    slope,
    relativeChange: start !== 0 ? (slope * span) / Math.abs(start) : 0,
    noiseUnits: noise > 0 ? (slope * span) / noise : slope * span === 0 ? 0 : Infinity,
  };
}

// ---- correlation ----

export interface Correlation {
  r: number;
  n: number;
  p: number;
}

/** Pearson correlation of two columns (rows with a missing value in either are skipped) and its two-sided p-value. */
export function pearson(a: (number | null)[], b: (number | null)[]): Correlation | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const u = a[i];
    const v = b[i];
    if (u !== null && v !== null && Number.isFinite(u) && Number.isFinite(v)) {
      xs.push(u);
      ys.push(v);
    }
  }
  const n = xs.length;
  if (n < 10) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  const r = sxy / Math.sqrt(sxx * syy);
  const t = (r * Math.sqrt(n - 2)) / Math.sqrt(Math.max(1e-12, 1 - r * r));
  return { r, n, p: tTwoSided(t, n - 2) };
}

// ---- dominance of a category ----

export interface Dominance {
  label: string;
  /** Share of all rows held by the biggest category. */
  share: number;
  /** How many times bigger that share is than an even split. */
  times: number;
  p: number;
}

/** Is one category far bigger than an even split of the rows would give? Chi-square goodness of fit against even. */
export function dominance(counts: { label: string; count: number }[]): Dominance | null {
  const k = counts.length;
  const total = counts.reduce((s, c) => s + c.count, 0);
  if (k < 2 || total < 20) return null;
  const expected = total / k;
  const chi = counts.reduce((s, c) => s + (c.count - expected) ** 2 / expected, 0);
  const top = counts.reduce((best, c) => (c.count > best.count ? c : best));
  return { label: top.label, share: top.count / total, times: top.count / expected, p: chiSquareSurvival(chi, k - 1) };
}

// ---- outliers ----

export interface Outliers {
  /** Values this far (in robust standard deviations) from the median or further. */
  count: number;
  share: number;
  extreme: number;
  /** The most extreme value and how many robust standard deviations away it is. */
  worst: { value: number; score: number };
}

/** Points more than `threshold` robust standard deviations from the median. Robust, so one huge value cannot hide itself. */
export function outliers(values: number[], threshold = 6): Outliers | null {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < 30) return null;
  const m = median(clean);
  const spread = scaledMad(clean);
  if (!(spread > 0)) return null;
  let count = 0;
  let worst = { value: NaN, score: 0 };
  for (const v of clean) {
    const score = Math.abs(v - m) / spread;
    if (score >= threshold) {
      count++;
      if (score > worst.score) worst = { value: v, score };
    }
  }
  return count ? { count, share: count / clean.length, extreme: worst.score, worst } : null;
}

// ---- change point ----

export interface ChangePoint {
  /** Index of the first point of the new level. */
  index: number;
  before: number;
  after: number;
  /** The jump in units of the series' noise level. */
  shift: number;
  relativeChange: number;
}

/**
 * The biggest level shift in a series, if there is clear evidence of one. PELT finds the best split into constant
 * levels, with a penalty that grows with the log of the length (as in BIC) so noise is not cut into pieces. With default
 * settings detectors often invent changes in plain noise, so this only reports a jump of several noise units that
 * persists for a minimum stretch on each side, with the series flat on both sides rather than drifting.
 */
export function changePoint(y: number[], opts: { minSegment?: number; minShift?: number; maxWithinSpread?: number } = {}): ChangePoint | null {
  const n = y.length;
  const minSegment = opts.minSegment ?? Math.max(6, Math.floor(n / 15));
  const minShift = opts.minShift ?? 3;
  const maxWithinSpread = opts.maxWithinSpread ?? 1.8;
  if (n < minSegment * 2 + 2) return null;

  // noise level from point-to-point differences, which a level shift hardly affects
  const diffs = y.slice(1).map((v, i) => v - y[i]);
  const sigma = scaledMad(diffs) / Math.SQRT2;
  if (!(sigma > 0)) return null;
  const penalty = 2 * sigma * sigma * Math.log(n) * 2;

  const splits = pelt(y, penalty, minSegment);
  if (!splits.length) return null;

  const bounds = [0, ...splits, n];
  // the biggest jump is the candidate; only then ask whether the series really is flat on both sides of it
  let found: (ChangePoint & { from: number; to: number }) | null = null;
  for (let i = 1; i < bounds.length - 1; i++) {
    const before = mean(y.slice(bounds[i - 1], bounds[i]));
    const after = mean(y.slice(bounds[i], bounds[i + 1]));
    const shift = Math.abs(after - before) / sigma;
    if (shift >= minShift && (!found || shift > found.shift)) {
      found = { index: bounds[i], before, after, shift, relativeChange: before !== 0 ? (after - before) / Math.abs(before) : 0, from: bounds[i - 1], to: bounds[i + 1] };
    }
  }
  if (!found) return null;

  // A real step leaves the series flat on both sides, with only noise around each level. A drifting series (a random
  // walk) is cut into "levels" by any detector, but it wanders inside them. Measured on simulated series, the spread
  // inside the two neighbouring levels is about 1.1 times the noise for real steps and about 2.5 times for drift.
  const spread = (from: number, to: number) => variance(y.slice(from, to)) / (sigma * sigma);
  if (spread(found.from, found.index) > maxWithinSpread || spread(found.index, found.to) > maxWithinSpread) return null;
  const { from: _from, to: _to, ...change } = found;
  return change;
}

/**
 * The best split of a series into stretches of constant level (least squares), found with PELT: the cost of cutting at
 * each point is compared only with starting points that could still be the best, which keeps it close to linear.
 * Returns the index where each new stretch begins.
 */
export function pelt(y: number[], penalty: number, minSegment: number): number[] {
  const n = y.length;
  const s1 = new Float64Array(n + 1);
  const s2 = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    s1[i + 1] = s1[i] + y[i];
    s2[i + 1] = s2[i] + y[i] * y[i];
  }
  const cost = (from: number, to: number) => {
    const len = to - from;
    const sum = s1[to] - s1[from];
    return s2[to] - s2[from] - (sum * sum) / len;
  };

  // a point is only a usable start if some valid split ends there: until then its cost is unknown, not zero
  const best = new Float64Array(n + 1).fill(Infinity);
  const last = new Int32Array(n + 1);
  const reachable = new Uint8Array(n + 1);
  best[0] = -penalty;
  reachable[0] = 1;
  let candidates = [0];
  for (let t = minSegment; t <= n; t++) {
    let bestCost = Infinity;
    let from = 0;
    for (const start of candidates) {
      if (t - start < minSegment) continue;
      const c = best[start] + cost(start, t) + penalty;
      if (c < bestCost) {
        bestCost = c;
        from = start;
      }
    }
    if (bestCost === Infinity) continue;
    best[t] = bestCost;
    last[t] = from;
    reachable[t] = 1;
    // drop starting points that can never win again, then let the point that just became far enough back join
    candidates = candidates.filter((start) => best[start] + cost(start, t) <= bestCost || t - start < minSegment);
    candidates.push(t - minSegment + 1);
  }

  const splits: number[] = [];
  for (let t = n; t > 0 && reachable[t]; t = last[t]) {
    if (last[t] > 0) splits.push(last[t]);
    else break;
  }
  return splits.sort((x, y2) => x - y2);
}
