import { describe, expect, it } from "vitest";
import { guardSql, tidySql } from "../src/sqlGuard";

describe("tidySql", () => {
  it("turns escaped line breaks into spaces when the query has no real ones", () => {
    expect(tidySql("SELECT a\\nFROM data\\nGROUP BY 1")).toBe("SELECT a FROM data GROUP BY 1");
    // each escape becomes one space, and the two spaces already there stay: four in all
    expect(tidySql("SELECT a\\r\\n  FROM data")).toBe("SELECT a    FROM data");
    expect(tidySql("SELECT a\\tFROM data")).toBe("SELECT a FROM data");
  });

  it("leaves a query alone when it already has real line breaks", () => {
    const q = "SELECT a\nFROM data\nWHERE note = 'line\\nbreak'";
    expect(tidySql(q)).toBe(q);
  });

  it("leaves an ordinary one-line query alone", () => {
    expect(tidySql("SELECT 1")).toBe("SELECT 1");
    expect(tidySql("")).toBe("");
  });
});

describe("guardSql with escaped line breaks", () => {
  it("accepts a double-escaped but otherwise safe query", () => {
    const g = guardSql("SELECT a, count(*)\\nFROM data\\nGROUP BY 1");
    expect(g).toEqual({ ok: true, sql: "SELECT * FROM (SELECT a, count(*) FROM data GROUP BY 1) LIMIT 10000" });
  });

  it("still rejects anything unsafe hidden behind the escapes", () => {
    expect(guardSql("SELECT 1\\n;\\nDROP TABLE data").ok).toBe(false);
    expect(guardSql("DELETE\\nFROM data").ok).toBe(false);
    expect(guardSql("SELECT 1\\n-- comment\\nFROM data").ok).toBe(false);
    expect(guardSql("COPY\\ndata TO 'x'").ok).toBe(false);
  });
});
