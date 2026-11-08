import {
  buildProfile,
  chartSummary,
  findInsights,
  gatherInsightInput,
  guardSql,
  suggestDashboard,
  tidyColumnNames,
  timeColumn,
  understandColumns,
  type RunSql,
} from "@dropboard/engine";
import { describe, expect, it, vi } from "vitest";
import { createSql } from "../eval/duckdb";
import { DATASETS } from "./corpus/datasets";

/** The same steps the browser takes, against DuckDB in Node: tidy the names, profile the table, suggest a dashboard, run every chart, find what stands out. */
async function analyse(csv: string) {
  const sql = await createSql();
  sql.load(csv);
  const run: RunSql = async (query) => {
    if (/^\s*ALTER\b/i.test(query)) {
      sql.exec(query);
      return [];
    }
    const r = sql.run(query);
    return r.rows.map((row) => Object.fromEntries(r.columns.map((c, i) => [c, row[i]])));
  };
  await tidyColumnNames(run);
  const profile = await buildProfile(run);
  const spec = suggestDashboard("Dashboard", profile);
  const charts = [];
  for (const chart of spec.charts) {
    const guarded = guardSql(chart.query);
    const rows = guarded.ok ? await run(guarded.sql) : [];
    charts.push({ chart, rows, guarded: guarded.ok });
  }
  const findings = findInsights(await gatherInsightInput(profile, run));
  return { profile, spec, charts, findings, roles: new Map(understandColumns(profile).map((u) => [u.name, u])) };
}

// Each table starts a database and runs every check, which is quick here and slow on a busy build machine, so the time allowed is generous.
vi.setConfig({ testTimeout: 120_000 });

describe.each(DATASETS)("corpus: $title ($rows rows)", (dataset) => {
  // analysed when its first test runs, not for all tables at once while the file is being read
  let started: Promise<Awaited<ReturnType<typeof analyse>>> | null = null;
  const result: PromiseLike<Awaited<ReturnType<typeof analyse>>> = {
    then: (ok, bad) => (started ??= analyse(dataset.csv)).then(ok, bad),
  };

  it("understands what its columns are", async () => {
    const { roles } = await result;
    for (const [name, role] of Object.entries(dataset.roles)) {
      expect(roles.get(name), `column ${name} should exist`).toBeDefined();
      expect(roles.get(name)!.role, `${name}: ${roles.get(name)?.reason}`).toBe(role);
    }
  });

  it("finds its time axis, and whether it is one row per entity per period", async () => {
    const { profile } = await result;
    expect(timeColumn(profile)?.column.name).toBe(dataset.time);
    expect(profile.panel).toEqual(dataset.panel);
  });

  it("builds a dashboard where every chart runs, nothing is added up that should not be, and the data is shown", async () => {
    const { charts, roles, spec } = await result;
    expect(spec.charts.at(-1)!.type).toBe("table");
    expect(new Set(spec.charts.map((c) => c.id)).size).toBe(spec.charts.length);
    expect(new Set(spec.charts.map((c) => c.title)).size).toBe(spec.charts.length);
    for (const { chart, rows, guarded } of charts) {
      expect(guarded, `${chart.title} passes the query guard`).toBe(true);
      expect(rows.length, `${chart.title} returns rows`).toBeGreaterThan(0);
      // never a total of something that is not an amount
      const total = /^Total ([^,]+)/.exec(chart.title);
      if (total) expect(roles.get(total[1])?.role, `"${chart.title}" adds up something that is not an amount`).toBe("flow");
      // never a chart of a year, an identifier or a flag as if it were a measure
      for (const [name, u] of roles) {
        if (["time", "id", "flag", "text", "constant"].includes(u.role)) {
          expect(chart.title.startsWith(`${name} by `) || chart.title.startsWith(`${name} vs `) || chart.title === `Total ${name}`, `${chart.title} treats ${name} (${u.role}) as an amount`).toBe(false);
        }
      }
    }
    for (const type of dataset.charts ?? []) expect(spec.charts.map((c) => c.type), `a ${type} chart`).toContain(type);
    if (dataset.panel) {
      // a table of entities over periods shows each entity's own line, and ranks them in the latest full period
      const lines = charts.filter((c) => c.chart.group);
      expect(lines.length, "a line for each entity").toBeGreaterThan(0);
      for (const l of lines) expect(new Set(l.rows.map((r) => r.g)).size, `${l.chart.title} has several lines`).toBeGreaterThan(1);
      expect(spec.charts.some((c) => c.type === "bar" && /latest full (year|month)$/.test(c.title)), "a ranking of the entities").toBe(true);
    }
    if (dataset.rows >= 50 && roles.size >= 3) expect(spec.charts.length).toBeGreaterThanOrEqual(4);
  });

  it("describes every chart in words, with no broken numbers", async () => {
    const { charts } = await result;
    for (const { chart, rows } of charts) {
      const text = chartSummary(chart, rows);
      expect(text, chart.title).not.toMatch(/NaN|undefined|Infinity|\[object/);
    }
  });

  it("finds the concentration and standouts planted in it, and none in an ordinary table", async () => {
    const { findings } = await result;
    if (!dataset.insights) {
      // tables of entities over periods have their own standouts; every other ordinary table has no concentration to report
      if (dataset.panel) return;
      expect(findings.filter((f) => f.kind === "pareto" || f.kind === "standout").map((f) => f.sentence), "nothing to report where nothing was planted").toEqual([]);
      return;
    }
    for (const want of dataset.insights) {
      expect(findings.some((f) => f.kind === want.kind && f.sentence.includes(want.mentions)), `a ${want.kind} finding mentioning "${want.mentions}"`).toBe(true);
    }
  });

  it("finds the data problems planted in it, and none in a clean table", async () => {
    const { findings } = await result;
    const issues = findings.filter((f) => f.kind === "quality").flatMap((f) => String(f.evidence.codes).split(","));
    if (!dataset.quality) {
      expect(findings.filter((f) => f.kind === "quality").map((f) => f.sentence), "no data problem where none was planted").toEqual([]);
      return;
    }
    for (const issue of dataset.quality) expect(issues, `a ${issue} finding`).toContain(issue);
  });

  it("finds the anomalies planted in it, and none in a table that has none", async () => {
    const { findings } = await result;
    const anomalous = findings.filter((f) => f.kind === "unusualrows" || f.kind === "contextual");
    if (!dataset.anomalies) {
      expect(anomalous.map((f) => f.sentence), "no anomaly where none was planted").toEqual([]);
      return;
    }
    for (const want of dataset.anomalies) {
      expect(findings.some((f) => f.kind === want.kind && f.sentence.includes(want.mentions)), `a ${want.kind} finding mentioning "${want.mentions}"`).toBe(true);
    }
  });

  it("finds things to say without ever saying something broken", async () => {
    const { findings } = await result;
    for (const f of findings) {
      expect(f.sentence, f.kind).not.toMatch(/NaN|undefined|Infinity|\[object/);
      expect(f.headline).not.toMatch(/NaN|undefined|Infinity/);
    }
  });
});
