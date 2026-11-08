import { q, type ColType } from "./profile";

export interface ResultColumn {
  name: string;
  type: ColType;
}

type ChartKind = "kpi" | "bar" | "line" | "area" | "pie" | "scatter" | "map" | "table";

/**
 * The renderer reads a headline number from a column called `value`, and every other chart from columns called `x`
 * and `y`. A model that writes a perfectly good query but names its columns something else (`total_revenue`) would
 * otherwise get a blank chart. Given the columns the query really returns, rewrite the names so it draws:
 *   - a headline number uses the first numeric column;
 *   - other charts use the first column as x and the first other numeric column as y.
 * Returns the query unchanged when it already fits, the rewritten query when it can be made to, and null when it cannot
 * (no numeric column to plot).
 */
export function bindQuery(type: ChartKind, query: string, columns: ResultColumn[]): string | null {
  if (type === "table") return query;
  const names = columns.map((c) => c.name.toLowerCase());
  const inner = query.trim().replace(/;+\s*$/, "");

  if (type === "kpi") {
    if (names.includes("value")) return query;
    const number = columns.find((c) => c.type === "number");
    return number ? `SELECT ${q(number.name)} AS value FROM (${inner}) LIMIT 1` : null;
  }

  if (names.includes("x") && names.includes("y")) return query;
  const x = columns[0];
  const y = columns.slice(1).find((c) => c.type === "number");
  if (!x || !y) return null;
  return `SELECT ${q(x.name)} AS x, ${q(y.name)} AS y FROM (${inner})`;
}
