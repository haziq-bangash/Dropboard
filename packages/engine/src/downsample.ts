/**
 * Fewer points for a long line, without losing its peaks and dips. The points are cut into equal runs and each run keeps
 * only its lowest and highest point (MinMax), in their original order, plus the very first and last point. A line drawn
 * from these looks the same as one drawn from all of them, but costs a few thousand points instead of millions, and it
 * does not shift as the chart is resized or panned the way picking every nth point does.
 */
export function minMaxDownsample<T>(points: T[], value: (point: T) => number, maxPoints = 2000): T[] {
  if (points.length <= maxPoints || maxPoints < 4) return points;
  const buckets = Math.floor((maxPoints - 2) / 2);
  const size = (points.length - 2) / buckets;
  const keep: number[] = [0];
  for (let b = 0; b < buckets; b++) {
    const from = 1 + Math.floor(b * size);
    const to = Math.min(points.length - 1, 1 + Math.floor((b + 1) * size));
    let lo = from;
    let hi = from;
    for (let i = from; i < to; i++) {
      const v = value(points[i]);
      if (!Number.isFinite(v)) continue;
      if (!Number.isFinite(value(points[lo])) || v < value(points[lo])) lo = i;
      if (!Number.isFinite(value(points[hi])) || v > value(points[hi])) hi = i;
    }
    if (from < to) keep.push(...(lo === hi ? [lo] : lo < hi ? [lo, hi] : [hi, lo]));
  }
  keep.push(points.length - 1);
  return keep.map((i) => points[i]);
}
