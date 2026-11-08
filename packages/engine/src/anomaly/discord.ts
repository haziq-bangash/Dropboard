import { median, scaledMad } from "../stats/tests";

/**
 * A stretch of a series whose SHAPE is unlike every other stretch: a year where the usual summer peak never came, a week that went
 * flat, a cycle that ran backwards. Its values can all lie inside the usual range, so a test on single points sees nothing. This is
 * the "discord" of the matrix profile: every window of the series is compared (after taking out its own level and scale) with the
 * window most like it elsewhere, and the window whose best match is worst is the discord. It has to be clearly worse than the
 * typical window's best match (robust z), its best match has to be a poor correlation, and one of the two has to move by more than
 * the series' own noise, so wobble in a flat series is not called a shape.
 */
export interface Discord {
  /** First point of the window, and how many points it spans. */
  index: number;
  length: number;
  /** How well the closest other window matches it, as a correlation: 1 is the same shape. */
  similarity: number;
  /** How far its distance to its closest match is from the usual, in robust spreads. */
  z: number;
}

export interface DiscordOptions {
  /** Window length: a cycle (12 months, 7 days). Defaults to a twelfth of the series, between 6 and 24 points. */
  length?: number;
  /** Robust z the distance must reach. Default 7. */
  minZ?: number;
  /** Greatest correlation the best match may have. Default 0.6. */
  maxSimilarity?: number;
}

const MIN_WINDOWS = 24;
const MAX_POINTS = 600;

/** The Theil-Sen slope, so a climb does not make every window look alike. */
function slopeOf(y: number[]): number {
  const slopes: number[] = [];
  for (let i = 0; i < y.length; i++) for (let j = i + 1; j < y.length; j++) slopes.push((y[j] - y[i]) / (j - i));
  return median(slopes);
}

export function shapeDiscord(series: number[], options: DiscordOptions = {}): Discord | null {
  const y = series.length > MAX_POINTS ? series.slice(-MAX_POINTS) : series;
  const n = y.length;
  const m = options.length ?? Math.min(24, Math.max(6, Math.round(n / 12)));
  const windows = n - m + 1;
  // at least three windows' worth that cannot overlap, and enough windows for a typical distance to mean something
  if (n < m * 3 || windows < MIN_WINDOWS || y.some((v) => !Number.isFinite(v))) return null;

  const slope = slopeOf(y);
  const flat = y.map((v, i) => v - slope * i);
  // the noise level from third differences: a smooth wave or climb is almost gone from them, while white noise of spread s has a
  // third difference of spread s times the square root of 20 (first differences would count the wave itself as noise)
  const third = flat.slice(3).map((v, i) => v - 3 * flat[i + 2] + 3 * flat[i + 1] - flat[i]);
  const noise = scaledMad(third) / Math.sqrt(20);
  if (!(noise > 0)) return null;

  // every window with its level and scale taken out; a window flatter than the noise is not blown up into a shape
  const norm: Float64Array[] = [];
  const spread: number[] = [];
  for (let i = 0; i < windows; i++) {
    let mean = 0;
    for (let k = 0; k < m; k++) mean += flat[i + k];
    mean /= m;
    let ss = 0;
    for (let k = 0; k < m; k++) ss += (flat[i + k] - mean) ** 2;
    const sd = Math.sqrt(ss / m);
    spread.push(sd);
    const scale = Math.max(sd, noise);
    const w = new Float64Array(m);
    for (let k = 0; k < m; k++) w[k] = (flat[i + k] - mean) / scale;
    norm.push(w);
  }

  // each window's distance to its closest window that does not overlap it
  const best = new Array<number>(windows).fill(Infinity);
  const mate = new Array<number>(windows).fill(-1);
  for (let i = 0; i < windows; i++) {
    for (let j = i + m; j < windows; j++) {
      let d = 0;
      const a = norm[i];
      const b = norm[j];
      for (let k = 0; k < m; k++) {
        const t = a[k] - b[k];
        d += t * t;
      }
      if (d < best[i]) {
        best[i] = d;
        mate[i] = j;
      }
      if (d < best[j]) {
        best[j] = d;
        mate[j] = i;
      }
    }
  }
  const distance = best.map(Math.sqrt);
  let at = 0;
  for (let i = 1; i < windows; i++) if (distance[i] > distance[at]) at = i;
  if (mate[at] < 0) return null;

  // judged against the windows away from it, whose own matches are not spoiled by overlapping the odd one
  const rest = distance.filter((_, i) => Math.abs(i - at) >= m);
  if (rest.length < MIN_WINDOWS / 2) return null;
  const typical = median(rest);
  const sd = scaledMad(rest);
  if (!(sd > 0)) return null;
  const z = (distance[at] - typical) / sd;

  // a correlation from the distance between two windows of unit variance: d^2 = 2m(1 - r)
  const similarity = 1 - (distance[at] * distance[at]) / (2 * m);
  // one of the pair has to move by more than noise, or the "shape" is only wobble
  const moves = Math.max(spread[at], spread[mate[at]]) >= 2 * noise;
  if (z < (options.minZ ?? 7) || similarity > (options.maxSimilarity ?? 0.6) || !moves) return null;
  return { index: at + (series.length - n), length: m, similarity, z };
}
