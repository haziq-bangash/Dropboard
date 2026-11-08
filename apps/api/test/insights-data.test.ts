import { findInsights, gatherInsightInput, STARTERS, type Finding, type TableProfile } from "@dropboard/engine";
import { describe, expect, it } from "vitest";
import { createSql, type Sql } from "../eval/duckdb";

/** The whole path, on real data: load a sample into DuckDB, gather the summaries with SQL, find the findings. */
async function analyse(sql: Sql, id: string) {
  const starter = STARTERS.find((s) => s.id === id)!;
  sql.load(starter.csv());
  const profile: TableProfile = sql.profile();
  const run = async (query: string) => {
    const r = sql.run(query);
    return r.rows.map((row) => Object.fromEntries(r.columns.map((c, i) => [c, row[i]])));
  };
  const input = await gatherInsightInput(profile, run);
  return { profile, input, found: findInsights(input) };
}

describe("findings on the sample datasets", () => {
  it("gathers the summaries the engine needs, and finds what is really in the data", async () => {
    const sql = await createSql();

    const store = await analyse(sql, "ecommerce-orders");
    expect(store.input.series?.length).toBeGreaterThanOrEqual(1);
    expect(store.input.numeric?.map((n) => n.column)).toEqual(expect.arrayContaining(["revenue", "quantity"]));
    expect(store.input.categories?.map((c) => c.column)).toEqual(expect.arrayContaining(["region", "category", "channel"]));
    // revenue is quantity times price, so the two move together
    expect(store.found.some((f) => f.kind === "correlation" && f.columns.includes("revenue") && f.columns.includes("quantity"))).toBe(true);

    const spending = await analyse(sql, "household-spending");
    // rent is the big share of what is spent
    const rent = spending.found.find((f) => f.kind === "concentration" && f.columns[0] === "category");
    expect(rent?.sentence).toMatch(/^Rent accounts for 5\d% of amount/);

    const marketing = await analyse(sql, "marketing-performance");
    expect(marketing.found.some((f) => f.kind === "correlation" && f.columns.includes("revenue") && f.columns.includes("conversions"))).toBe(true);

    const tickets = await analyse(sql, "support-tickets");
    // longer to resolve, less happy: the relationship built into the sample
    const link = tickets.found.find((f) => f.kind === "correlation" && f.columns.includes("resolution_hours") && f.columns.includes("satisfaction"));
    expect(link?.sentence).toMatch(/move in opposite directions strongly/);
    expect(Number(link?.evidence.r)).toBeLessThan(-0.6);
  }, 60_000);

  it("keeps every list short, varied, plain and free of broken numbers", async () => {
    const sql = await createSql();
    for (const s of STARTERS) {
      const { found } = await analyse(sql, s.id);
      expect(found.length, s.id).toBeGreaterThan(0);
      expect(found.length, s.id).toBeLessThanOrEqual(8);
      const kinds = new Map<Finding["kind"], number>();
      for (const f of found) {
        kinds.set(f.kind, (kinds.get(f.kind) ?? 0) + 1);
        expect(f.sentence, s.id).not.toMatch(/undefined|NaN|Infinity|null/);
        expect(f.sentence.endsWith("."), `${s.id}: ${f.sentence}`).toBe(true);
        expect(f.strength).toBeGreaterThan(0);
        expect(f.strength).toBeLessThanOrEqual(1);
      }
      for (const n of kinds.values()) expect(n, s.id).toBeLessThanOrEqual(3);
    }
  }, 60_000);

  it("does not call rent payments or a skewed price column outliers", async () => {
    const sql = await createSql();
    for (const id of ["household-spending", "ecommerce-orders"]) {
      expect((await analyse(sql, id)).found.filter((f) => f.kind === "outlier"), id).toEqual([]);
    }
  }, 60_000);

  it("is fast: gathering and analysing a sample takes well under a second", async () => {
    const sql = await createSql();
    const t0 = Date.now();
    await analyse(sql, "ecommerce-orders");
    expect(Date.now() - t0).toBeLessThan(1500);
  }, 60_000);
});

describe("gathering the summaries", () => {
  it("samples a big table down to 5,000 rows, the same rows every time, and still finds a relationship in it", async () => {
    const sql = await createSql();
    // 12,000 rows: more than the sample size, so the sampling query runs. b follows a, c is unrelated.
    let seed = 12345;
    const next = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
    const rows = Array.from({ length: 12_000 }, () => {
      const a = next() * 100;
      return `${a.toFixed(2)},${(a * 2 + next() * 20).toFixed(2)},${(next() * 100).toFixed(2)}`;
    });
    sql.load("a,b,c\n" + rows.join("\n") + "\n");
    const run = async (q: string) => rowsOf(sql, q);
    const first = await gatherInsightInput(sql.profile(), run);
    const again = await gatherInsightInput(sql.profile(), run);

    expect(first.numeric).toHaveLength(3);
    expect(first.numeric![0].values).toHaveLength(5000);
    expect(first.numeric![0].values).toEqual(again.numeric![0].values); // REPEATABLE: the same sample each time
    const found = findInsights(first);
    expect(found.some((f) => f.kind === "correlation" && f.columns.includes("a") && f.columns.includes("b"))).toBe(true);
    expect(found.some((f) => f.kind === "correlation" && f.columns.includes("c"))).toBe(false);
  }, 60_000);

  it("does not sample a table that is small enough to read whole", async () => {
    const sql = await createSql();
    sql.load("a,b\n" + Array.from({ length: 300 }, (_, i) => `${i},${i * 3 + (i % 5)}`).join("\n") + "\n");
    const { numeric } = await gatherInsightInput(sql.profile(), async (q) => rowsOf(sql, q));
    expect(numeric![0].values).toHaveLength(300);
  });

  it("skips the time series when there is no date, or the dates cover too short a span", async () => {
    const sql = await createSql();
    sql.load("a,b\n1,2\n3,4\n5,6\n");
    expect((await gatherInsightInput(sql.profile(), async (q) => rowsOf(sql, q))).series).toBeUndefined();

    sql.load("d,v\n2025-01-01,1\n2025-01-02,2\n2025-01-03,3\n");
    expect((await gatherInsightInput(sql.profile(), async (q) => rowsOf(sql, q))).series).toBeUndefined();
  });

  it("steps by month for a long span and by day for a short one, and labels the points", async () => {
    const sql = await createSql();
    const days = (n: number, start = Date.UTC(2023, 0, 1)) => Array.from({ length: n }, (_, i) => new Date(start + i * 86_400_000).toISOString().slice(0, 10));

    sql.load("d,v\n" + days(1100).map((d, i) => `${d},${10 + (i % 7)}`).join("\n") + "\n");
    const long = await gatherInsightInput(sql.profile(), async (q) => rowsOf(sql, q));
    expect(long.series?.[0].labels?.[0]).toMatch(/^[A-Z][a-z]{2} 20\d\d$/); // "Feb 2023": a month label (the partial first month is dropped)
    expect(long.series![0].x.length).toBeGreaterThan(30);

    sql.load("d,v\n" + days(40).map((d, i) => `${d},${10 + (i % 5)}`).join("\n") + "\n");
    const short = await gatherInsightInput(sql.profile(), async (q) => rowsOf(sql, q));
    expect(short.series?.[0].labels?.[0]).toMatch(/^\d{1,2} [A-Z][a-z]{2} 20\d\d$/); // "1 Jan 2023": a day label
    expect(short.series![0].x.length).toBe(40);
  });

  it("drops a partly covered first and last month, so a part-month does not look like a drop", async () => {
    const sql = await createSql();
    // about 100 a day (it must vary a little, or it is not a measure) from 20 Jan 2023 to 10 Mar 2025, a span of over two
    // years so the steps are months: every month adds up to roughly the same, except the part-months at both ends
    const rows: string[] = [];
    for (let t = Date.UTC(2023, 0, 20), i = 0; t <= Date.UTC(2025, 2, 10); t += 86_400_000, i++) rows.push(`${new Date(t).toISOString().slice(0, 10)},${100 + (i % 2)}`);
    sql.load("d,sales\n" + rows.join("\n") + "\n");
    const { series } = await gatherInsightInput(sql.profile(), async (q) => rowsOf(sql, q));
    const first = new Date(series![0].x[0]);
    expect([first.getUTCFullYear(), first.getUTCMonth()]).toEqual([2023, 1]); // February 2023, not the part-month of January
    const last = new Date(series![0].x.at(-1)!);
    expect([last.getUTCFullYear(), last.getUTCMonth()]).toEqual([2025, 1]); // February 2025, not the part-month of March
    // and so the series is flat, as the data is, instead of dipping at both ends
    const ys = series![0].y;
    expect(Math.max(...ys) / Math.min(...ys)).toBeLessThan(1.12);
  });
});

function rowsOf(sql: Sql, query: string) {
  const r = sql.run(query);
  return r.rows.map((row) => Object.fromEntries(r.columns.map((c, i) => [c, row[i]])));
}
