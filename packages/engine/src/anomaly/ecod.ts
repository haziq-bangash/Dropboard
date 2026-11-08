import { upperIncompleteGamma } from "../stats/special";
import { benjaminiHochberg, median, scaledMad } from "../stats/tests";

/**
 * Rows that are unusual across several measures, found with ECOD (Li et al., IEEE TKDE 2022): each measure's distribution is
 * estimated with its empirical cumulative distribution, and a row is scored by how far into the tails its values sit.
 * ECOD has no parameters to tune, runs in one pass over sorted columns, and says which measures made a row unusual, which
 * matters here: every anomaly shown to a person comes with its reason.
 *
 * Unlike usual practice, which keeps "the top few percent", this decides how many rows are anomalous with a test. If the
 * measures were independent and continuous, each tail probability would be uniform, so the sum of their negative logs
 * follows a gamma distribution and every row gets a p-value. The p-values go through the same Benjamini-Hochberg correction
 * as every other finding, and a row must also be far out on at least one measure in plain terms (robust z of 4), because with
 * a hundred thousand rows a tiny departure can be "significant".
 */

export interface UnusualRow {
  /** Position of the row in the matrix that was scored. */
  index: number;
  score: number;
  /** The chance of seeing a row this unusual among this many, when it was found by the joint test; null for an isolated extreme. */
  p: number | null;
  /** "joint": unusual across several measures together. "isolated": a value that stands far apart from all the rest on one measure. */
  source: "joint" | "isolated";
  /** The measures that made it unusual, most unusual first. */
  reasons: { measure: number; side: "high" | "low"; tail: number; z: number }[];
}

export interface EcodOptions {
  /** Share of rows allowed to be false alarms among those reported, as for every other finding. Default 5%. */
  q?: number;
  /** How far out a row must be in plain terms: its robust z over its three most unusual measures, combined. Default 5. */
  minZ?: number;
  /** Measures related by rank at least this closely (absolute Spearman correlation) count once. Default 0.5. */
  maxCorrelation?: number;
}

const skewness = (v: number[]) => {
  const n = v.length;
  const m = v.reduce((s, x) => s + x, 0) / n;
  let m2 = 0;
  let m3 = 0;
  for (const x of v) {
    m2 += (x - m) ** 2;
    m3 += (x - m) ** 3;
  }
  m2 /= n;
  m3 /= n;
  return m2 > 0 ? m3 / m2 ** 1.5 : 0;
};

const correlation = (a: number[], b: number[]) => {
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    sab += (a[i] - ma) * (b[i] - mb);
    saa += (a[i] - ma) ** 2;
    sbb += (b[i] - mb) ** 2;
  }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
};

/**
 * Values on one side of a measure that stand clear of the rest: the largest gap among the outermost values, if it is many robust
 * spreads wide and the values beyond it are far from the middle. A cluster is found whole, so twenty copies of the same wild
 * value are all caught, which a test that looks at the single most extreme value (and so is masked by the copies) misses.
 * Skewed, all-positive measures are looked at on a log scale, where their long tail is not a string of gaps.
 */
function isolatedExtremes(values: number[], gapSpreads: number, minZ: number): { index: number; side: "high" | "low"; z: number }[] {
  const n = values.length;
  const positive = values.every((v) => v > 0);
  const onLog = positive && skewness(values) > 1;
  const view = onLog ? values.map((v) => Math.log(v)) : values;
  // On a log scale a spread is wide (a product of two things has a wide log), so the bar is set by ratios people can see instead:
  // the cluster must start at least three times above everything else, and be well clear of the middle.
  if (onLog) {
    gapSpreads = 2;
    minZ = 3.5;
  }
  const minGap = onLog ? Math.log(3) : 0;
  const centre = median(view);
  const spread = scaledMad(view);
  if (!(spread > 0)) return [];
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => view[a] - view[b]);
  const reach = Math.max(1, Math.floor(n * 0.05));
  const found: { index: number; side: "high" | "low"; z: number }[] = [];
  for (const side of ["high", "low"] as const) {
    const at = (k: number) => order[side === "high" ? n - 1 - k : k];
    let widest = 0;
    let cut = -1;
    for (let k = 0; k < reach; k++) {
      const gap = Math.abs(view[at(k)] - view[at(k + 1)]) / spread;
      if (gap > widest) {
        widest = gap;
        cut = k;
      }
    }
    if (cut < 0 || widest < gapSpreads || widest * spread < minGap) continue;
    for (let k = 0; k <= cut; k++) {
      const z = (view[at(k)] - centre) / spread;
      if (Math.abs(z) >= minZ) found.push({ index: at(k), side, z });
    }
  }
  return found;
}

/** Left and right tail probabilities of every value in a column, from its empirical distribution, with ties handled by counting. */
function tails(values: number[]): { left: Float64Array; right: Float64Array } {
  const n = values.length;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => values[a] - values[b]);
  const left = new Float64Array(n);
  const right = new Float64Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && values[order[j + 1]] === values[order[i]]) j++;
    // everything from i to j is tied: (# at or below) / n on the left, (# at or above) / n on the right
    for (let k = i; k <= j; k++) {
      left[order[k]] = (j + 1) / n;
      right[order[k]] = (n - i) / n;
    }
    i = j + 1;
  }
  return { left, right };
}

/**
 * Score the rows of a matrix given as columns (one array per measure, all the same length, no missing values) and return the
 * rows that are unusual, most unusual first. Measures that carry no information (one value) are ignored.
 */
export function ecod(columns: number[][], options: EcodOptions = {}): { unusual: UnusualRow[]; measures: number[]; rows: number } {
  const n = columns[0]?.length ?? 0;
  const q = options.q ?? 0.05;
  const minZ = options.minZ ?? 5;
  const maxCorrelation = options.maxCorrelation ?? 0.5;
  if (n < 30) return { unusual: [], measures: [], rows: n };

  // The joint test assumes the measures are independent, and big things are big on several measures at once (a large company has
  // large revenue, income and cash flow). So only measures that are not strongly related by rank (Spearman) are scored together;
  // a measure left out is still checked on its own for values that stand alone.
  const all = columns.map((col) => (new Set(col).size < 3 ? null : tails(col)));
  const kept: number[] = [];
  columns.forEach((_, j) => {
    const t = all[j];
    if (!t) return;
    if (kept.some((k) => Math.abs(correlation(Array.from(all[k]!.left), Array.from(t.left))) >= maxCorrelation)) return;
    kept.push(j);
  });
  const d = kept.length;
  if (d === 0) return { unusual: [], measures: [], rows: n };

  const left = new Array<Float64Array>(d);
  const right = new Array<Float64Array>(d);
  const skewSign = new Array<number>(d);
  const centre = new Array<number>(d);
  const spread = new Array<number>(d);
  kept.forEach((j, a) => {
    const t = all[j]!;
    left[a] = t.left;
    right[a] = t.right;
    skewSign[a] = skewness(columns[j]) < 0 ? -1 : 1;
    centre[a] = median(columns[j]);
    spread[a] = scaledMad(columns[j]) || 0;
  });

  const scores = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sumLeft = 0;
    let sumRight = 0;
    let sumAuto = 0;
    for (let a = 0; a < d; a++) {
      const l = -Math.log(left[a][i]);
      const r = -Math.log(right[a][i]);
      sumLeft += l;
      sumRight += r;
      sumAuto += skewSign[a] < 0 ? l : r;
    }
    scores[i] = Math.max(sumLeft, sumRight, sumAuto);
  }

  // Each of the three sums is gamma distributed if the measures are independent; the largest of three is held to account with a factor of three.
  const p = Array.from(scores, (s) => Math.min(1, 3 * upperIncompleteGamma(d, s)));
  const keep = benjaminiHochberg(p, q);

  const unusual: UnusualRow[] = [];
  for (let i = 0; i < n; i++) {
    if (!keep[i]) continue;
    const reasons = kept
      .map((j, a) => {
        const z = spread[a] > 0 ? (columns[j][i] - centre[a]) / spread[a] : 0;
        const l = -Math.log(left[a][i]);
        const r = -Math.log(right[a][i]);
        return { measure: j, side: (l > r ? "low" : "high") as "low" | "high", tail: Math.max(l, r), z };
      })
      .sort((x, y) => y.tail - x.tail);
    // far out in plain terms (the distance, over its three most unusual measures taken together), not just improbable on paper
    const distance = Math.sqrt(reasons.slice(0, 3).reduce((s, r) => s + r.z * r.z, 0));
    if (distance < minZ) continue;
    unusual.push({ index: i, score: scores[i], p: p[i], source: "joint", reasons: reasons.slice(0, 3) });
  }

  // a value that stands alone on one measure: the joint test cannot see past one row in n, so this looks for gaps instead
  const taken = new Set(unusual.map((u) => u.index));
  for (let j = 0; j < columns.length; j++) {
    if (!all[j]) continue;
    for (const hit of isolatedExtremes(columns[j], 3.5, 6)) {
      if (taken.has(hit.index)) continue;
      taken.add(hit.index);
      unusual.push({ index: hit.index, score: Math.abs(hit.z), p: null, source: "isolated", reasons: [{ measure: j, side: hit.side, tail: Math.log(n), z: hit.z }] });
    }
  }
  unusual.sort((a, b) => b.score - a.score);
  return { unusual, measures: kept, rows: n };
}
