import { describe, expect, it } from "vitest";
import { suggestDashboard, type ColumnProfile, type TableProfile } from "../src";

const num = (name: string, distinct = 400): ColumnProfile => ({ name, type: "number", nullCount: 0, distinct, min: 1, max: 900, integer: false });
const cat = (name: string, distinct: number): ColumnProfile => ({ name, type: "string", nullCount: 0, distinct, textLength: 8 });

/** A file with far more candidate charts than there is room for. */
const rich = (extra: Partial<TableProfile> = {}): TableProfile => ({
  rowCount: 5000,
  columns: [
    { name: "order_date", type: "date", nullCount: 0, distinct: 360 },
    cat("customer_id", 900),
    cat("region", 4),
    cat("channel", 3),
    cat("segment", 5),
    cat("status", 2),
    num("revenue"),
    num("quantity", 40),
    num("margin", 300),
  ],
  ...extra,
});

describe("which charts a rich file keeps", () => {
  it("keeps ten and the data preview, whatever the file offers", () => {
    const spec = suggestDashboard("x", rich({ customers: { column: "customer_id", time: "order_date" } }));
    expect(spec.charts.length).toBeLessThanOrEqual(11);
    expect(spec.charts.at(-1)?.type).toBe("table");
  });

  it("keeps who comes back, which tells something no other chart does, over a fourth bar or a second pie", () => {
    const spec = suggestDashboard("x", rich({ customers: { column: "customer_id", time: "order_date" } }));
    expect(spec.charts.some((c) => c.type === "heatmap" && /active again/.test(c.title))).toBe(true);
    expect(spec.charts.filter((c) => c.type === "pie").length).toBeLessThanOrEqual(1);
  });

  it("drops the share of a column that a bar already shows, when there is no room for both", () => {
    const spec = suggestDashboard("x", rich());
    const bars = spec.charts.filter((c) => c.type === "bar").map((c) => c.title);
    const pie = spec.charts.find((c) => c.type === "pie");
    // either there is no pie, or it is of a column no bar is about
    if (pie) expect(bars.some((b) => pie.title.endsWith(b.split(" by ")[1] ?? "§"))).toBe(false);
  });

  it("shows the charts in the order they were thought of, with the numbers first", () => {
    const types = suggestDashboard("x", rich()).charts.map((c) => c.type);
    expect(types[0]).toBe("kpi");
    expect(types.indexOf("line")).toBeGreaterThan(types.lastIndexOf("kpi"));
  });
});
