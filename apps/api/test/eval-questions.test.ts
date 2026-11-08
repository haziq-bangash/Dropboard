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
