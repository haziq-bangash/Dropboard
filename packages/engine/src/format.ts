/** A number as short plain text: 1.2m, 34.5k, 0.52. */
export const fmt = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toPrecision(3)}bn`;
  if (a >= 1e6) return `${(n / 1e6).toPrecision(3)}m`;
  if (a >= 1e4) return `${Math.round(n / 100) / 10}k`;
  if (a >= 100) return String(Math.round(n));
  return String(Number(n.toPrecision(3)));
};

/** A fraction as a whole-number percent, without its sign. */
export const pct = (x: number) => `${Math.round(Math.abs(x) * 100)}%`;

/**
 * How much a series changed from its start to its end, as a fraction: the average of the last two values against the average of the
 * first two, so one noisy end point does not swing it. This is what the data shows between the two ends, which is what a sentence
 * saying "between 2014 and 2023" claims, and unlike a fitted line it does not overstate growth that compounds. Null when the
 * start is not positive, where a fraction means nothing.
 */
export function observedChange(values: number[]): number | null {
  if (values.length < 4) return null;
  const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
  const start = mean(values.slice(0, 2));
  const end = mean(values.slice(-2));
  return start > 0 ? end / start - 1 : null;
}

/** A fraction as a percent that keeps a decimal when it is small: 0.4%, 12%. */
export const pctFine = (x: number) => (Math.abs(x) < 0.1 ? `${(Math.abs(x) * 100).toFixed(1)}%` : pct(x));

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
