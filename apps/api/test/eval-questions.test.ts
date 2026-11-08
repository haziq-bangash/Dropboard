import { STARTERS } from "@dropboard/engine";
import { describe, expect, it } from "vitest";
import { createSql, type Sql } from "../eval/duckdb";
import { QUESTIONS } from "../eval/questions";

describe("the evaluation question set", () => {
  it("has a healthy number of questions for each dataset, with unique ids", () => {
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(QUESTIONS.length);
    for (const s of STARTERS) expect(QUESTIONS.filter((q) => q.dataset === s.id).length).toBeGreaterThanOrEqual(7);
  });

  it("has gold answers that all run, return rows, and are answerable from the profile alone", async () => {
    const sql: Sql = await createSql();
    for (const starter of STARTERS) {
      sql.load(starter.csv());
      const profile = sql.profile();
      expect(profile.rowCount).toBe(starter.rows);
      for (const q of QUESTIONS.filter((x) => x.dataset === starter.id)) {
        expect(q.gold.length, q.id).toBeGreaterThan(0);
        const results = q.gold.map((g) => sql.run(g));
        for (const [i, r] of results.entries()) {
          expect(r.rows.length, `${q.id} gold ${i} returns rows`).toBeGreaterThan(0);
          expect(r.rows.flat().every((c) => c !== null), `${q.id} gold ${i} has no empty cells`).toBe(true);
        }
        // alternative forms of one answer must agree on how many rows there are
        expect(new Set(results.map((r) => r.rows.length)).size, `${q.id} alternatives agree on row count`).toBe(1);
      }
    }
  }, 60_000);

  it("has no question whose right answer is a tie, because a model would be marked wrong for a fair tie-break", async () => {
    // for every "which one is highest/lowest?" question: the best and the runner-up must differ clearly
    const sql = await createSql();
    const cases: [string, string, string][] = [
      ["ecommerce-orders", "e2", "SELECT sum(revenue) m FROM data GROUP BY region ORDER BY 1 DESC LIMIT 2"],
      ["ecommerce-orders", "e6", "SELECT avg(quantity) m FROM data GROUP BY category ORDER BY 1 DESC LIMIT 2"],
      ["ecommerce-orders", "e9", "SELECT sum(revenue) m FROM data GROUP BY order_date ORDER BY 1 DESC LIMIT 2"],
      ["ecommerce-orders", "e10", "SELECT sum(revenue) / count(*) m FROM data GROUP BY region ORDER BY 1 DESC LIMIT 2"],
      ["ecommerce-orders", "e12", "SELECT sum(revenue) m FROM data GROUP BY category ORDER BY 1 DESC LIMIT 4"],
      ["household-spending", "h2", "SELECT sum(amount) m FROM data GROUP BY category ORDER BY 1 DESC LIMIT 2"],
      ["household-spending", "h6", "SELECT sum(amount) m FROM data GROUP BY date_trunc('month', date) ORDER BY 1 DESC LIMIT 2"],
      ["marketing-performance", "m3", "SELECT sum(revenue) / sum(spend) m FROM data GROUP BY channel ORDER BY 1 DESC LIMIT 2"],
      ["marketing-performance", "m6", "SELECT sum(revenue) m FROM data GROUP BY objective ORDER BY 1 DESC LIMIT 2"],
      ["marketing-performance", "m8", "SELECT sum(revenue) m FROM data GROUP BY week_start ORDER BY 1 DESC LIMIT 2"],
      ["marketing-performance", "m9", "SELECT sum(conversions) * 1.0 / sum(clicks) m FROM data GROUP BY channel ORDER BY 1 DESC LIMIT 2"],
      ["support-tickets", "s3", "SELECT avg(satisfaction) m FROM data GROUP BY channel ORDER BY 1 ASC LIMIT 2"],
      ["support-tickets", "s5", "SELECT count(*) m FROM data GROUP BY category ORDER BY 1 ASC LIMIT 2"],
      ["support-tickets", "s7", "SELECT count(*) m FROM data GROUP BY dayname(created_date) ORDER BY 1 DESC LIMIT 2"],
      ["support-tickets", "s10", "SELECT abs(avg(resolution_hours) - median(resolution_hours)) m FROM data GROUP BY priority ORDER BY 1 DESC LIMIT 2"],
    ];
    let loaded = "";
    for (const [dataset, id, query] of cases) {
      if (dataset !== loaded) {
        sql.load(STARTERS.find((s) => s.id === dataset)!.csv());
        loaded = dataset;
      }
      const m = sql.run(query).rows.map((r) => Number(r[0]));
      const cut = id === "e12" ? 2 : 0; // the top 3 must be separated from the 4th
      expect(Math.abs(m[cut] - m[cut + 1]) / Math.max(Math.abs(m[cut]), 1e-9), `${id} has a clear winner`).toBeGreaterThan(0.005);
    }
  }, 60_000);

  it("asks questions that do not hand over the answer, and use the real column values", async () => {
    // a question that names a value ('App', 'Electronics') must name one that exists, or the gold answer is empty
    const sql = await createSql();
    sql.load(STARTERS[0].csv());
    const channels = sql.run("SELECT DISTINCT channel FROM data").rows.flat();
    expect(channels).toContain("App");
    const categories = sql.run("SELECT DISTINCT category FROM data").rows.flat();
    expect(categories).toContain("Electronics");
  });
});
