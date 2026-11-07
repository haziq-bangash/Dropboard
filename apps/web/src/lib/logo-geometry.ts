// Geometry of the Dropboard mark: a "D" sliced into spreadsheet rows.
// The D has a flat stem and flat top and bottom edges, then a half-circle bowl. Thin gaps cut it into rows,
// like the rows of a sheet turning into a chart. One row is the accent, like the highlighted bar in a chart.
// Used by the React logo, and by scripts/generate-logo.mjs for the favicon files, so they always agree.

export interface Row {
  /** Left edge (the flat stem). */
  x: number;
  y: number;
  h: number;
  /** Where the half-circle bowl starts (x of the circle's center). */
  cx: number;
  /** Radius of the bowl, half the height of the D. */
  radius: number;
  accent: boolean;
}

export interface MarkOptions {
  count: number;
  gap: number;
  left: number;
  top: number;
  /** Total height of the D. Its bowl is a half circle of radius height / 2. */
  height: number;
  /** Length of the flat part before the bowl starts. */
  straight: number;
  accentIndex: number;
}

/** The full mark: five rows. */
export const FULL: MarkOptions = { count: 5, gap: 3, left: 20, top: 18, height: 64, straight: 28, accentIndex: 3 };

/** A bolder three-row version that stays legible at 16px and 32px. */
export const SMALL: MarkOptions = { count: 3, gap: 5, left: 21, top: 20, height: 60, straight: 26, accentIndex: 1 };

export function computeRows(o: MarkOptions = FULL): Row[] {
  const radius = o.height / 2;
  const h = (o.height - o.gap * (o.count - 1)) / o.count;
  return Array.from({ length: o.count }, (_, i) => ({
    x: o.left,
    y: o.top + i * (h + o.gap),
    h,
    cx: o.left + o.straight,
    radius,
    accent: i === o.accentIndex,
  }));
}

/** SVG path for one row: a slice of the D, flat on the left and following the bowl on the right. */
export function rowPath(row: Row, o: MarkOptions): string {
  const f = (n: number) => Math.round(n * 100) / 100;
  const cy = o.top + o.height / 2;
  const edge = (y: number) => row.cx + Math.sqrt(Math.max(row.radius * row.radius - (y - cy) ** 2, 0));
  const y0 = row.y;
  const y1 = row.y + row.h;
  return `M${f(row.x)} ${f(y0)}H${f(edge(y0))}A${f(row.radius)} ${f(row.radius)} 0 0 1 ${f(edge(y1))} ${f(y1)}H${f(row.x)}Z`;
}
