import { understandColumns, chartSummary, detectZipColumn, guardSql, suggestDashboard, usRegionCode, zipRegionsChart, zipState, ZIP_PREFIXES, type ColumnProfile } from "@dropboard/engine";
import { describe, expect, it } from "vitest";
import { createSql } from "../eval/duckdb";

describe("ZIP codes", () => {
  it("know the state of well-known codes, and of the same code written in different ways", () => {
    const known: [string, string][] = [
      ["10001", "NY"],
      ["90210", "CA"],
      ["60601", "IL"],
      ["02134", "MA"],
      ["33101", "FL"],
      ["98101", "WA"],
      ["77001", "TX"],
      ["20001", "DC"],
      ["99501", "AK"],
      ["96801", "HI"],
      ["80202", "CO"],
      ["30301", "GA"],
      ["59601", "MT"],
      ["19103", "PA"],
    ];
    for (const [zip, state] of known) expect(zipState(zip), zip).toBe(state);
    // ZIP+4, a number that lost its leading zero, spaces, and a bare prefix
    expect(zipState("90210-1234")).toBe("CA");
    expect(zipState(2134)).toBe("MA");
    expect(zipState(" 10001 ")).toBe("NY");
    expect(zipState("100")).toBe("NY");
    expect(ZIP_PREFIXES).toBeGreaterThan(850);
  });

  it("do not make a state out of something else", () => {
    for (const bad of ["", "abc", "1234567", "12-34", "00000", null, undefined, {}, "9a210"]) expect(zipState(bad as unknown), String(bad)).toBeNull();
  });

  it("are one code with state names, so one map column can hold either", () => {
    expect(usRegionCode("Texas")).toBe("TX");
    expect(usRegionCode("78701")).toBe("TX");
    expect(usRegionCode("hello")).toBeNull();
  });

  it("are found only in a column named like one, and only when nearly every value is a real ZIP", () => {
    const zips = ["10001", "90210", "60601", "02134", "33101", "98101", "77001"];
    expect(detectZipColumn("zip", zips)).toBe(true);
    expect(detectZipColumn("Postal Code", zips)).toBe(true);
    expect(detectZipColumn("customer_zipcode", zips)).toBe(true);
    expect(detectZipColumn("zip", [10001, 90210, 2134, 33101])).toBe(true);
    // named like a ZIP, but not ZIP codes
    expect(detectZipColumn("zip", ["London", "Paris", "Berlin"])).toBe(false);
    // ZIP-shaped, but not named like one: product codes look the same
    expect(detectZipColumn("product_code", zips)).toBe(false);
    expect(detectZipColumn("zip", ["10001", "banana", "kiwi", "plum", "pear"])).toBe(false);
  });

  const col = (name: string, over: Partial<ColumnProfile> = {}): ColumnProfile => ({ name, type: "number", nullCount: 0, distinct: 100, min: 1, max: 99999, integer: true, ...over });

  it("become a map of states: grouped by the first three digits, with leading zeros put back", async () => {
    const sql = await createSql();
    // ZIPs held as whole numbers lose the zero of 02134, and one is ZIP+4 text in another table
    const rows = ["zip,sales"].concat(["10001,5", "10002,7", "2134,3", "90210,11", "90211,2", "60601,4", "2108,1"].map((r) => r));
    sql.load(rows.join("\n") + "\n");
    const chart = zipRegionsChart("zip", { name: "sales", type: "number", nullCount: 0, distinct: 7, min: 1, max: 11, integer: true });
    expect(chart.map).toBe("us");
    expect(guardSql(chart.query).ok).toBe(true);
    const result = sql.run(chart.query);
    const byPrefix = Object.fromEntries(result.rows.map((r) => [String(r[0]), Number(r[1])]));
    expect(byPrefix).toEqual({ "100": 12, "021": 4, "902": 13, "606": 4 });
    // and the words describing the chart name the states, adding prefixes in the same state together
    const text = chartSummary({ ...chart, id: "z", layout: { x: 0, y: 0, w: 1, h: 1 } }, result.rows.map((r) => Object.fromEntries(result.columns.map((c, i) => [c, r[i]]))));
    expect(text).toMatch(/4 places shaded/);
    expect(text).not.toMatch(/NaN|undefined/);

    const text2 = ["zip,sales", "02134-1234,3", "90210-0001,5", "10001-9999,2", "10002,4"];
    sql.load(text2.join("\n") + "\n");
    const plus4 = sql.run(zipRegionsChart("zip").query);
    expect(Object.fromEntries(plus4.rows.map((r) => [String(r[0]), Number(r[1])]))).toEqual({ "021": 1, "902": 1, "100": 2 });
  });

  it("are suggested as a map of states when a profile has a ZIP column and no column of states", () => {
    const base = { rowCount: 500, columns: [col("zip", { distinct: 300 }), col("sales", { integer: false, distinct: 400 }), { name: "day", type: "date" as const, nullCount: 0, distinct: 120 }] };
    const charts = suggestDashboard("x", { ...base, zips: "zip" }).charts;
    const map = charts.find((c) => c.type === "regions");
    expect(map?.map).toBe("us");
    expect(map?.query).toContain("substr(lpad(");
    // a column of states wins over ZIP codes
    const both = suggestDashboard("x", { ...base, zips: "zip", states: "state" }).charts.filter((c) => c.type === "regions");
    expect(both).toHaveLength(1);
    expect(both[0].query).not.toContain("substr(lpad(");
  });

  it("are a label and never an amount, even when stored as whole numbers", () => {
    const roles = understandColumns({ rowCount: 500, columns: [col("customer_zip", { distinct: 300, min: 1001, max: 99950 }), col("sales", { integer: false, distinct: 400 })] });
    expect(roles.find((r) => r.name === "customer_zip")?.role).toBe("id");
    expect(roles.find((r) => r.name === "sales")?.role).toBe("flow");
  });
});
