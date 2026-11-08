import type { ChartSpec } from "@dropboard/spec";
import { countryCode, usStateCode } from "./places";

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
  regions: "Region map",
  histogram: "Histogram",
  heatmap: "Heatmap",
  boxplot: "Box plot",
  calendar: "Calendar",
  treemap: "Treemap",
  funnel: "Funnel",
  sankey: "Flow diagram",
  cities: "City map",
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

/**
 * A sentence for a screen reader that says what a chart shows. `known` says whether a value is a place the picture can
 * draw; a city map needs it, since the city list lives outside the engine, and without it every value counts as drawn.
 */
export function chartSummary(spec: Pick<ChartSpec, "type" | "title" | "x" | "y" | "map">, rows: Row[], known?: (value: unknown) => boolean): string {
  const head = `${KIND[spec.type]}: ${spec.title}.`;
  if (spec.type === "table") return `${head} ${rows.length} row${rows.length === 1 ? "" : "s"} shown.`;

  if (spec.type === "kpi") {
    const v = rows[0] && Number(rows[0].value);
    return v === undefined || !Number.isFinite(v) ? `${head} No value.` : `${head} ${said(v)}.`;
  }

  if (spec.type === "heatmap") {
    const cells = rows.map((r) => ({ x: r.x, y: r.y, v: Number(r.value) })).filter((c) => Number.isFinite(c.v));
    if (!cells.length) return `${head} No data.`;
    const high = cells.reduce((m, c) => (c.v > m.v ? c : m));
    const low = cells.reduce((m, c) => (c.v < m.v ? c : m));
    return `${head} ${cells.length} combinations. Highest: ${name(high.x)} and ${name(high.y)}, ${said(high.v)}. Lowest: ${name(low.x)} and ${name(low.y)}, ${said(low.v)}.`;
  }

  if (spec.type === "calendar") {
    const days = rows.map((r) => ({ day: name(r.x), n: Number(r.y) })).filter((d) => Number.isFinite(d.n));
    if (!days.length) return `${head} No data.`;
    const total = days.reduce((s, d) => s + d.n, 0);
    const busiest = days.reduce((m, d) => (d.n > m.n ? d : m));
    const quietest = days.reduce((m, d) => (d.n < m.n ? d : m));
    const span = `${days.length} day${days.length === 1 ? "" : "s"} with rows, from ${days[0].day} to ${days[days.length - 1].day}`;
    if (days.length === 1) return `${head} ${span}, ${said(total)} rows.`;
    return `${head} ${span}, ${said(total)} rows in all. Busiest day ${busiest.day} with ${said(busiest.n)}, quietest day ${quietest.day} with ${said(quietest.n)}.`;
  }

  if (spec.type === "boxplot") {
    const groups = rows.map((r) => ({ x: r.x, med: Number(r.y), q1: Number(r.q1), q3: Number(r.q3) })).filter((g) => Number.isFinite(g.med));
    if (!groups.length) return `${head} No data.`;
    const top = groups.reduce((m, g) => (g.med > m.med ? g : m));
    const bottom = groups.reduce((m, g) => (g.med < m.med ? g : m));
    const middle = (g: typeof top) => (Number.isFinite(g.q1) && Number.isFinite(g.q3) ? `, middle half from ${said(g.q1)} to ${said(g.q3)}` : "");
    const count = `${groups.length} group${groups.length === 1 ? "" : "s"}`;
    if (groups.length === 1) return `${head} ${count}. ${name(top.x)} has a median of ${said(top.med)}${middle(top)}.`;
    return `${head} ${count}. Highest median: ${name(top.x)}, ${said(top.med)}${middle(top)}. Lowest median: ${name(bottom.x)}, ${said(bottom.med)}${middle(bottom)}.`;
  }

  if (spec.type === "histogram") {
    const bins = rows.map((r) => ({ from: Number(r.x), width: Number(r.w), n: Number(r.y) })).filter((b) => Number.isFinite(b.from) && Number.isFinite(b.n));
    const total = bins.reduce((s, b) => s + b.n, 0);
    if (!bins.length || total === 0) return `${head} No data.`;
    const top = bins.reduce((m, b) => (b.n > m.n ? b : m));
    const end = (b: { from: number; width: number }) => (Number.isFinite(b.width) ? b.from + b.width : b.from);
    return `${head} ${bins.length} bins from ${said(bins[0].from)} to ${said(end(bins[bins.length - 1]))}. The most rows, ${said(top.n)} of ${said(total)}, fall between ${said(top.from)} and ${said(end(top))}.`;
  }

  if (spec.type === "cities") {
    const all = rows.map((r) => ({ x: name(r[spec.x ?? "x"]), v: Number(r[spec.y?.[0] ?? "y"]), raw: r[spec.x ?? "x"] })).filter((c) => Number.isFinite(c.v));
    const drawn = known ? all.filter((c) => known(c.raw)) : all;
    const left = all.length - drawn.length;
    if (!all.length) return `${head} No data.`;
    if (!drawn.length) return `${head} No value is a city in the list, so nothing is drawn.`;
    const top = [...drawn].sort((a, b) => b.v - a.v);
    const shown = top.slice(0, 5).map((c) => `${c.x} ${said(c.v)}`);
    const more = top.length - shown.length;
    const unmatched = left > 0 ? ` ${left} other value${left === 1 ? " is" : "s are"} not a known city and ${left === 1 ? "is" : "are"} not shown.` : "";
    return `${head} ${top.length} cit${top.length === 1 ? "y" : "ies"} drawn, biggest first: ${list(shown)}${more > 0 ? `, and ${more} more` : ""}.${unmatched}`;
  }

  if (spec.type === "treemap") {
    const tiles = rows.map((r) => ({ x: name(r.x), child: r.child === undefined ? null : name(r.child), v: Number(r.y) })).filter((t) => Number.isFinite(t.v) && t.v > 0);
    if (!tiles.length) return `${head} No data.`;
    const all = tiles.reduce((s, t) => s + t.v, 0);
    const parents = new Map<string, number>();
    for (const t of tiles) parents.set(t.x, (parents.get(t.x) ?? 0) + t.v);
    const top = [...parents].sort((a, b) => b[1] - a[1]);
    const shown = top.slice(0, 4).map(([k, v]) => `${k} ${Math.round((v / all) * 100)}%`);
    const more = top.length - shown.length;
    const parts = tiles[0].child === null ? "" : ` Split into ${tiles.length} parts; the largest is ${tiles.reduce((m, t) => (t.v > m.v ? t : m)).child} under ${tiles.reduce((m, t) => (t.v > m.v ? t : m)).x}.`;
    return `${head} ${top.length} group${top.length === 1 ? "" : "s"}, largest first: ${list(shown)}${more > 0 ? `, and ${more} more` : ""}.${parts}`;
  }

  if (spec.type === "funnel") {
    const stages = rows.map((r) => ({ x: name(r.x), v: Number(r.y) })).filter((s) => Number.isFinite(s.v) && s.v > 0).sort((a, b) => b.v - a.v);
    if (!stages.length) return `${head} No data.`;
    const first = stages[0];
    if (stages.length === 1) return `${head} One stage, ${first.x}, ${said(first.v)}.`;
    const rest = stages.slice(1, 5).map((s) => `${s.x} ${said(s.v)} (${Math.round((s.v / first.v) * 100)}% of the first)`);
    const more = stages.length - 1 - rest.length;
    return `${head} ${stages.length} stages, widest first. ${first.x} ${said(first.v)}, then ${list(rest)}${more > 0 ? `, and ${more} more` : ""}.`;
  }

  if (spec.type === "sankey") {
    const flows = rows.map((r) => ({ from: name(r.x), to: name(r.target), v: Number(r.y) })).filter((f) => Number.isFinite(f.v) && f.v > 0);
    if (!flows.length) return `${head} No data.`;
    const sources = new Set(flows.map((f) => f.from)).size;
    const targets = new Set(flows.map((f) => f.to)).size;
    const top = [...flows].sort((a, b) => b.v - a.v).slice(0, 3).map((f) => `${f.from} to ${f.to} ${said(f.v)}`);
    return `${head} ${flows.length} flow${flows.length === 1 ? "" : "s"} from ${sources} start${sources === 1 ? "" : "s"} to ${targets} end${targets === 1 ? "" : "s"}. Largest: ${list(top)}.`;
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

    case "regions": {
      // only values that match a country or state are shaded, so only those are counted as shaded
      const us = spec.map === "us";
      const matches = us ? usStateCode : countryCode;
      const top = points.filter((p) => matches(p.x) !== null).sort((a, b) => b.y - a.y);
      const left = points.length - top.length;
      const unmatched = left > 0 ? ` ${left} other value${left === 1 ? " does" : "s do"} not match a ${us ? "state" : "country"} and ${left === 1 ? "is" : "are"} not shown.` : "";
      if (top.length === 0) return `${head} No value matches a ${us ? "state" : "country"}, so nothing is shaded.`;
      const shown = top.slice(0, 5).map((p) => `${name(p.x)} ${said(p.y)}`);
      const more = top.length - shown.length;
      return `${head} ${top.length} place${top.length === 1 ? "" : "s"} shaded, highest first: ${list(shown)}${more > 0 ? `, and ${more} more` : ""}.${unmatched}`;
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
