import { describe, expect, it } from "vitest";
import { cohortChart, cohortFindings, cohortTrend, describeText, findCustomers, findInsights, guardSql, toNarrateFindings, wordsChartQuery, type CohortInput, type TableProfile } from "../src";

const rows = (n: number, make: (i: number) => string) => Array.from({ length: n }, (_, i) => make(i));

describe("free text", () => {
  it("needs enough rows to say anything", () => {
    expect(describeText("c", rows(50, (i) => `some comment number ${i}`))).toBeNull();
  });

  it("names the words that are in many rows, and not the words every sentence has", () => {
    const d = describeText("c", rows(400, (i) => `the parking was ${i % 4 === 0 ? "terrible" : "fine"} and the staff were nice today`))!;
    const names = d.terms.map((t) => t.term);
    expect(names).toContain("terrible");
    // in every row, so it is the language of the column and not what separates one row from another
    expect(names).not.toContain("today");
    expect(names).not.toContain("parking");
    expect(d.terms.find((t) => t.term === "terrible")!.share).toBeCloseTo(0.25, 2);
  });

  it("reads the writing system, and does not count words in a language written without spaces", () => {
    const arabic = describeText("c", rows(200, (i) => `هذا تعليق رقم ${i} عن الخدمة والتوصيل`))!;
    expect(arabic.script).toBe("Arabic");
    const chinese = describeText("c", rows(200, (i) => `这个产品很好用而且送货很快${i}`))!;
    expect(chinese.script).toBe("Chinese, Japanese or Korean");
    expect(chinese.terms).toEqual([]);
  });

  it("counts values that repeat word for word", () => {
    const d = describeText("c", rows(300, (i) => (i % 3 === 0 ? "No comment at all about this" : `A different thing to say, number ${i}`)))!;
    expect(d.repeated).toBeCloseTo(0.333, 2);
    expect(d.mostRepeated).toBeCloseTo(0.333, 2);
  });

  it("keeps the words out of what Pilot is sent", () => {
    const d = describeText("c", rows(400, (i) => `${i % 4 === 0 ? "delivery" : "packaging"} was ${i % 2 === 0 ? "late" : "quick"} for this purchase`))!;
    const findings = findInsights({ rowCount: 400, text: [d] });
    const f = findings.find((x) => x.kind === "text")!;
    expect(f.sentence).toContain("delivery");
    const sent = toNarrateFindings([f])[0];
    expect(JSON.stringify(sent)).not.toMatch(/delivery|packaging|late|quick|purchase/);
    expect(sent.tokens).toContain("{label}");
  });

  it("builds a words chart the guard accepts, with every word in at least five values", () => {
    const sql = wordsChartQuery("Customer comment", 1000);
    expect(guardSql(sql).ok).toBe(true);
    expect(sql).toContain("HAVING count(*) >= 5");
  });
});

const profile = (over: Partial<TableProfile> = {}): TableProfile => ({
  rowCount: 4000,
  columns: [
    { name: "order_date", type: "date", nullCount: 0, distinct: 300 },
    { name: "customer_id", type: "string", nullCount: 0, distinct: 900, textLength: 6 },
    { name: "amount", type: "number", nullCount: 0, distinct: 500, min: 1, max: 99, integer: false },
  ],
  ...over,
});

describe("who comes back", () => {
  it("finds the column of people only when its name says so and it repeats", () => {
    expect(findCustomers(profile())).toEqual({ column: "customer_id", time: "order_date" });
    expect(findCustomers(profile({ columns: profile().columns.map((c) => (c.name === "customer_id" ? { ...c, name: "code" } : c)) }))).toBeUndefined();
    // every person once: nothing to come back to
    expect(findCustomers(profile({ columns: profile().columns.map((c) => (c.name === "customer_id" ? { ...c, distinct: 3900 } : c)) }))).toBeUndefined();
    // a table of entities by period has no cohorts
    expect(findCustomers(profile({ panel: { entity: "customer_id", time: "order_date" } }))).toBeUndefined();
  });

  it("draws the cohort chart with a query the guard accepts", () => {
    expect(guardSql(cohortChart("customer_id", '"order_date"').query).ok).toBe(true);
  });

  const cohort = (i: number, size: number, next: number): CohortInput["cohorts"][number] => ({ x: Date.UTC(2023, i, 1), label: `m${i}`, size, active: [size, Math.round(size * next), ...Array(11).fill(null)] });
  const input = (shares: number[]): CohortInput => ({ column: "customer_id", unit: "month", people: shares.length * 100, matured: { people: 400, returned: 300 }, cohorts: shares.map((s, i) => cohort(i, 100, s)) });

  it("says nothing about a change when there are too few cohorts or the shares are alike", () => {
    expect(cohortTrend(input([0.3, 0.3, 0.3]))).toBeNull();
    const steady = cohortFindings(input([0.31, 0.29, 0.3, 0.32, 0.28, 0.3, 0.31, 0.3]));
    expect(steady.trend?.passesFloor ?? false).toBe(false);
  });

  it("notices newer cohorts that stay less, with a p-value", () => {
    const t = cohortFindings(input([0.5, 0.48, 0.52, 0.5, 0.2, 0.18, 0.22, 0.2])).trend!;
    expect(t.passesFloor).toBe(true);
    expect(t.finding.p!).toBeLessThan(0.001);
    expect(t.finding.sentence).toContain("stay less");
  });

  it("reports how many came back, from people who had time to", () => {
    const f = cohortFindings(input([0.3, 0.3, 0.3, 0.3])).facts[0];
    expect(f.evidence.share).toBe(0.75);
    expect(f.kind).toBe("retention");
  });
});
