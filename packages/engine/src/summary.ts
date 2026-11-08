import type { ChartSpec } from "@dropboard/spec";

/**
 * A plain sentence or two describing what a chart shows, for people who cannot see it (a screen reader reads it in place
 * of the picture). It is built from the same rows the chart draws, so it cannot disagree with it.
 */
type Row = Record<string, unknown>;

const KIND: Record<ChartSpec["type"], string> = {
  bar: "Bar chart",
  line: "Line chart",
  area: "Area chart",
  pie: "Pie chart",
  scatter: "Scatter plot",
  map: "Map",
  kpi: "Headline number",
  table: "Table",
};

/** A number said the way it is read aloud: 1.2 million, 34.5 thousand, 0.52. */
export function said(n: number): string {
  const a = Math.abs(n);
  const trim = (v: number) => String(Number(v.toPrecision(3)));
  if (a >= 1e9) return `${trim(n / 1e9)} billion`;
  if (a >= 1e6) return `${trim(n / 1e6)} million`;
  if (a >= 1e4) return `${trim(n / 1e3)} thousand`;
  if (a >= 100) return String(Math.round(n));
  return trim(n);
}

/** What to call an x value: dates without a time, text as it is, numbers said aloud. */
function name(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return said(v);
  const text = String(v ?? "");
  return /^\d{4}-\d\d-\d\d/.test(text) ? text.slice(0, 10) : text;
}

const list = (items: string[]) => (items.length <= 2 ? items.join(" and ") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

export function chartSummary(spec: Pick<ChartSpec, "type" | "title" | "x" | "y">, rows: Row[]): string {
  const head = `${KIND[spec.type]}: ${spec.title}.`;
  if (spec.type === "table") return `${head} ${rows.length} row${rows.length === 1 ? "" : "s"} shown.`;

  if (spec.type === "kpi") {
    const v = rows[0] && Number(rows[0].value);
    return v === undefined || !Number.isFinite(v) ? `${head} No value.` : `${head} ${said(v)}.`;
  }

  const xKey = spec.x ?? "x";
  const yKey = spec.y?.[0] ?? "y";
  const points = rows.map((r) => ({ x: r[xKey], y: Number(r[yKey]) })).filter((p) => Number.isFinite(p.y));
  if (!points.length) return `${head} No data.`;

  switch (spec.type) {
    case "bar": {
      const top = [...points].sort((a, b) => b.y - a.y);
      const shown = top.slice(0, 5).map((p) => `${name(p.x)} ${said(p.y)}`);
      const more = top.length - shown.length;
      return `${head} ${top.length} bar${top.length === 1 ? "" : "s"}, highest first: ${list(shown)}${more > 0 ? `, and ${more} more` : ""}.`;
    }

    case "pie": {
      const total = points.reduce((s, p) => s + Math.max(0, p.y), 0);
      const top = [...points].sort((a, b) => b.y - a.y);
      const shown = top.slice(0, 4).map((p) => `${name(p.x)} ${total > 0 ? Math.round((Math.max(0, p.y) / total) * 100) : 0}%`);
      const more = top.length - shown.length;
      return `${head} ${top.length} slice${top.length === 1 ? "" : "s"}, largest first: ${list(shown)}${more > 0 ? `, and ${more} more` : ""}.`;
    }

    case "line":
    case "area": {
      const first = points[0];
      const last = points[points.length - 1];
      const low = points.reduce((m, p) => (p.y < m.y ? p : m));
      const high = points.reduce((m, p) => (p.y > m.y ? p : m));
      const direction = last.y > first.y ? "ends higher" : last.y < first.y ? "ends lower" : "ends where it started";
      return `${head} ${points.length} points from ${name(first.x)} to ${name(last.x)}. It starts at ${said(first.y)} and ${direction}, at ${said(last.y)}. Lowest ${said(low.y)} on ${name(low.x)}, highest ${said(high.y)} on ${name(high.x)}.`;
    }

    case "map": {
      // the rows are bins: n says how many table rows fall in each
      const bins = rows.map((r) => ({ lon: Number(r[xKey]), lat: Number(r[yKey]), n: Number(r.n) })).filter((b) => Number.isFinite(b.lon) && Number.isFinite(b.lat));
      if (!bins.length) return `${head} No places to show.`;
      const counted = bins.filter((b) => Number.isFinite(b.n));
      const total = counted.reduce((s, b) => s + b.n, 0);
      const busiest = counted.length ? counted.reduce((m, b) => (b.n > m.n ? b : m)) : null;
      const lats = bins.map((b) => b.lat);
      const lons = bins.map((b) => b.lon);
      const range = `Latitude runs from ${said(Math.min(...lats))} to ${said(Math.max(...lats))} and longitude from ${said(Math.min(...lons))} to ${said(Math.max(...lons))}.`;
      const where = busiest ? ` Busiest area, near ${said(busiest.lat)} latitude and ${said(busiest.lon)} longitude, holds ${said(busiest.n)} of ${said(total)} rows.` : "";
      return `${head} ${bins.length} area${bins.length === 1 ? "" : "s"} with rows. ${range}${where}`;
    }

    case "scatter": {
      const xs = points.map((p) => Number(p.x)).filter(Number.isFinite);
      const ys = points.map((p) => p.y);
      if (!xs.length) return `${head} ${points.length} points.`;
      return `${head} ${points.length} points. Across them x runs from ${said(Math.min(...xs))} to ${said(Math.max(...xs))} and y from ${said(Math.min(...ys))} to ${said(Math.max(...ys))}.`;
    }
  }
}
