import { normalTwoSided } from "../stats/special";
import { median, scaledMad } from "../stats/tests";

/**
 * Points in a series that are unusual for their time: far from what the trend and the season around them would give. The trend is
 * a running median, so a slow drift or a change of level does not make everything after it look odd; the season, when there is
 * one, is the median of what is left at each position in the cycle; and what remains is judged against its own robust spread
 * (median absolute deviation), the approach of the seasonal-hybrid ESD test used for long-term series, which stays reliable when
 * a good share of points are anomalies. A point has to be far out in robust terms, clear of chance after allowing for how many
 * points were looked at, and a meaningful distance from where it should be.
 */
export interface SeriesAnomaly {
  index: number;
  actual: number;
  expected: number;
  /** (actual - expected) / expected, or null when expected is not positive. */
  relative: number | null;
  /** Residual in units of the series' robust spread. */
  z: number;
}

export interface SeriesOptions {
  /** Position in the cycle (month of the year, day of the week) of each point, and how long the cycle is. */
  season?: { phases: number[]; period: number };
  /** Robust z a point must reach. Default 5. */
  minZ?: number;
  /** Least distance from expected, as a fraction of expected. Default 15%. */
  minRelative?: number;
  /** Chance of a false alarm among all the points looked at. Default 1%. */
  alpha?: number;
}

/** The median of a window of the same width around every point; near the ends the window slides inward instead of shrinking. */
function runningMedian(y: number[], window: number): number[] {
  const half = Math.floor(window / 2);
  return y.map((_, i) => {
    const start = Math.min(Math.max(0, i - half), y.length - window);
    return median(y.slice(start, start + window));
  });
}

/** The Theil-Sen slope: the median of the slopes between every pair of points, which a few wild points cannot move. */
function robustSlope(y: number[]): number {
  const slopes: number[] = [];
  for (let i = 0; i < y.length; i++) for (let j = i + 1; j < y.length; j++) slopes.push((y[j] - y[i]) / (j - i));
  return median(slopes);
}

/** Residuals from the trend and season for one window width, and the spread they are judged against. */
function residualsFor(y: number[], window: number, slope: number, season: SeriesOptions["season"]): { residual: number[]; trend: number[]; seasonal: number[]; spread: number } {
  const n = y.length;
  const flat = y.map((v, i) => v - slope * i);
  const level = runningMedian(flat, window);
  const trend = level.map((v, i) => v + slope * i);
  const detrended = y.map((v, i) => v - trend[i]);

  let seasonal = new Array<number>(n).fill(0);
  if (season && season.period >= 3 && n >= season.period * 2) {
    const byPhase = Array.from({ length: season.period }, () => [] as number[]);
    detrended.forEach((v, i) => byPhase[season.phases[i]].push(v));
    if (byPhase.every((ph) => ph.length >= 3)) {
      // each point's season is the median of the OTHER points at its position in the cycle: a point must not help set the
      // pattern it is judged against, or a point at a position seen only a few times would never look odd
      seasonal = detrended.map((v, i) => {
        const others = byPhase[season.phases[i]].slice();
        others.splice(others.indexOf(v), 1);
        return median(others);
      });
    }
  }
  const residual = detrended.map((v, i) => v - seasonal[i]);
  // the trend is itself an estimate from a window of points, which adds a little noise to every residual
  return { residual, trend, seasonal, spread: scaledMad(residual) * Math.sqrt(1 + Math.PI / (2 * window)) };
}

export function seriesAnomalies(y: number[], options: SeriesOptions = {}): SeriesAnomaly[] {
  const n = y.length;
  // fewer points than this give a spread and a trend too uncertain to call anything out of pattern
  if (n < 24) return [];
  const minZ = options.minZ ?? 5;
  const minRelative = options.minRelative ?? 0.15;
  const alpha = options.alpha ?? 0.01;

  // A climbing or falling line is taken out first, so the running median does not lag behind it at the ends. Then two trends are
  // fitted, a wide one and a narrow one, and a point has to stand out from BOTH. A slow wave fools the wide trend (it flattens the
  // peaks) but not the narrow one, noise rarely fools both, and a real spike fools neither: the same idea as combining detectors.
  const slope = robustSlope(y.length > 400 ? y.slice(-400) : y);
  const wide = residualsFor(y, Math.min(25, Math.max(5, Math.round(n / 6))) | 1, slope, options.season);
  const narrow = residualsFor(y, Math.min(15, Math.max(5, Math.round(n / 20))) | 1, slope, options.season);
  if (!(wide.spread > 0) || !(narrow.spread > 0)) return [];

  const found: SeriesAnomaly[] = [];
  y.forEach((value, i) => {
    const zWide = wide.residual[i] / wide.spread;
    const zNarrow = narrow.residual[i] / narrow.spread;
    // the same side, and far enough on both
    if (Math.sign(zWide) !== Math.sign(zNarrow)) return;
    const z = Math.sign(zWide) * Math.min(Math.abs(zWide), Math.abs(zNarrow));
    if (Math.abs(z) < minZ) return;
    // the chance of a point this far out, among all n points
    if (normalTwoSided(z) * n > alpha) return;
    const expected = narrow.trend[i] + narrow.seasonal[i];
    const relative = expected > 0 ? (value - expected) / expected : null;
    if (relative !== null && Math.abs(relative) < minRelative) return;
    found.push({ index: i, actual: value, expected, relative, z });
  });
  return found.sort((x, y2) => Math.abs(y2.z) - Math.abs(x.z));
}
