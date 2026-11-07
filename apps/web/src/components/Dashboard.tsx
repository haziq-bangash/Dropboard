"use client";

import type { ChartSpec, DashboardSpec } from "@dropboard/spec";
import * as echarts from "echarts";
import { useEffect, useRef, useState } from "react";
import type { RowSource, Rows } from "@/lib/results";

const COLORS = ["#2563eb", "#16a34a", "#d97706", "#9333ea", "#dc2626", "#0891b2"];

const fmt = (v: unknown) =>
  typeof v === "number" ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(v ?? "");

function toOption(spec: ChartSpec, rows: Rows): echarts.EChartsCoreOption {
  const x = spec.x ?? "x";
  const y = spec.y?.[0] ?? "y";
  const base = { color: COLORS, tooltip: { trigger: spec.type === "pie" ? "item" : "axis" }, grid: { left: 48, right: 16, top: 16, bottom: 32 } };
  switch (spec.type) {
    case "line":
    case "area":
    case "bar":
      return {
        ...base,
        xAxis: { type: spec.type === "bar" ? "category" : "time", data: undefined },
        yAxis: { type: "value" },
        series: [
          {
            type: spec.type === "bar" ? "bar" : "line",
            areaStyle: spec.type === "area" ? {} : undefined,
            data: rows.map((r) => [r[x] instanceof Date ? (r[x] as Date).getTime() : r[x], r[y]]),
          },
        ],
        ...(spec.type === "bar" ? { xAxis: { type: "category", data: rows.map((r) => fmt(r[x])) }, series: [{ type: "bar", data: rows.map((r) => r[y]) }] } : {}),
      };
    case "scatter":
      return { ...base, xAxis: { type: "value" }, yAxis: { type: "value" }, series: [{ type: "scatter", symbolSize: 6, data: rows.map((r) => [r[x], r[y]]) }] };
    case "pie":
      return { ...base, series: [{ type: "pie", radius: ["40%", "70%"], data: rows.map((r) => ({ name: fmt(r[x]), value: r[y] })) }] };
    default:
      return base;
  }
}

function Chart({ spec, rows }: { spec: ChartSpec; rows: Rows }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chart.setOption(toOption(spec, rows));
    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.dispose();
    };
  }, [spec, rows]);
  return <div ref={ref} style={{ height: 260 }} />;
}

function Table({ rows }: { rows: Rows }) {
  const cols = rows[0] ? Object.keys(rows[0]) : [];
  return (
    <div style={{ overflow: "auto", maxHeight: 320 }}>
      <table>
        <thead>
          <tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{cols.map((c) => <td key={c}>{fmt(r[c])}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Card({ spec, source }: { spec: ChartSpec; source: RowSource }) {
  const [rows, setRows] = useState<Rows | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    source(spec)
      .then((r) => !cancelled && setRows(r))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [spec, source]);

  if (spec.type === "kpi") {
    return (
      <div className="card kpi">
        <div className="label">{spec.title}</div>
        <div className="value">{error ? "–" : rows ? fmt(rows[0]?.value) : "…"}</div>
      </div>
    );
  }
  return (
    <div className={`card ${spec.type === "table" ? "wide" : ""}`}>
      <h3>{spec.title}</h3>
      {error ? <p className="error">{error}</p> : !rows ? <p>Loading…</p> : spec.type === "table" ? <Table rows={rows} /> : <Chart spec={spec} rows={rows} />}
    </div>
  );
}

export function Dashboard({ spec, source }: { spec: DashboardSpec; source: RowSource }) {
  const kpis = spec.charts.filter((c) => c.type === "kpi");
  const rest = spec.charts.filter((c) => c.type !== "kpi");
  return (
    <section>
      <h2>{spec.title}</h2>
      <div className="grid kpis">{kpis.map((c) => <Card key={c.id} spec={c} source={source} />)}</div>
      <div className="grid">{rest.map((c) => <Card key={c.id} spec={c} source={source} />)}</div>
    </section>
  );
}
