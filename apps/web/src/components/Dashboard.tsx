"use client";

import type { ChartSpec, DashboardSpec } from "@dropboard/spec";
import * as echarts from "echarts";
import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table as UiTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RowSource, Rows } from "@/lib/results";

// Brand chart palette (see --chart-* in globals.css): midnight green, orange, dark amber, gunmetal, teal tint, sand
const COLORS = ["#075056", "#FF5B04", "#B8860B", "#233038", "#3E8E94", "#F4D47C"];
const MUTED = "#6F7F86";

const fmt = (v: unknown) =>
  typeof v === "number" ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(v ?? "");

function toOption(spec: ChartSpec, rows: Rows): echarts.EChartsCoreOption {
  const x = spec.x ?? "x";
  const y = spec.y?.[0] ?? "y";
  const axis = {
    axisLine: { lineStyle: { color: MUTED } },
    axisLabel: { color: MUTED },
    splitLine: { lineStyle: { color: "rgba(211,219,221,0.8)" } },
  };
  const base = {
    color: COLORS,
    tooltip: { trigger: spec.type === "pie" ? "item" : "axis" },
    grid: { left: 48, right: 16, top: 16, bottom: 32 },
  };
  switch (spec.type) {
    case "bar":
      return {
        ...base,
        xAxis: { ...axis, type: "category", data: rows.map((r) => fmt(r[x])) },
        yAxis: { ...axis, type: "value" },
        series: [{ type: "bar", data: rows.map((r) => r[y]), itemStyle: { borderRadius: [4, 4, 0, 0] } }],
      };
    case "line":
    case "area":
      return {
        ...base,
        xAxis: { ...axis, type: "time" },
        yAxis: { ...axis, type: "value" },
        series: [
          {
            type: "line",
            smooth: true,
            showSymbol: false,
            areaStyle: spec.type === "area" ? { opacity: 0.15 } : undefined,
            data: rows.map((r) => [r[x], r[y]]),
          },
        ],
      };
    case "scatter":
      return {
        ...base,
        xAxis: { ...axis, type: "value" },
        yAxis: { ...axis, type: "value" },
        series: [{ type: "scatter", symbolSize: 6, data: rows.map((r) => [r[x], r[y]]) }],
      };
    case "pie":
      return {
        ...base,
        series: [{ type: "pie", radius: ["45%", "70%"], data: rows.map((r) => ({ name: fmt(r[x]), value: r[y] })) }],
      };
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
  return <div ref={ref} className="h-64 w-full" />;
}

export function Table({ rows }: { rows: Rows }) {
  const cols = rows[0] ? Object.keys(rows[0]) : [];
  return (
    <div className="max-h-80 overflow-auto rounded-md border">
      <UiTable>
        <TableHeader className="sticky top-0 bg-background">
          <TableRow>
            {cols.map((c) => (
              <TableHead key={c}>{c}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i}>
              {cols.map((c) => (
                <TableCell key={c} className="whitespace-nowrap">
                  {fmt(r[c])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </UiTable>
    </div>
  );
}

function ChartCard({ spec, source }: { spec: ChartSpec; source: RowSource }) {
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
      <Card size="sm" data-testid="kpi">
        <CardHeader>
          <p className="text-sm text-muted-foreground">{spec.title}</p>
          <div className="text-3xl font-semibold tracking-tight" data-testid="kpi-value">
            {error ? "–" : rows ? fmt(rows[0]?.value) : <Skeleton className="h-9 w-24" />}
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className={spec.type === "table" ? "md:col-span-2" : undefined} data-testid="chart-card">
      <CardHeader>
        <CardTitle>{spec.title}</CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : !rows ? (
          <Skeleton className="h-64 w-full" />
        ) : spec.type === "table" ? (
          <Table rows={rows} />
        ) : (
          <Chart spec={spec} rows={rows} />
        )}
      </CardContent>
    </Card>
  );
}

export function Dashboard({ spec, source }: { spec: DashboardSpec; source: RowSource }) {
  const kpis = spec.charts.filter((c) => c.type === "kpi");
  const rest = spec.charts.filter((c) => c.type !== "kpi");
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-2xl font-semibold tracking-tight">{spec.title}</h2>
      {kpis.length > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {kpis.map((c) => (
            <ChartCard key={c.id} spec={c} source={source} />
          ))}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {rest.map((c) => (
          <ChartCard key={c.id} spec={c} source={source} />
        ))}
      </div>
    </section>
  );
}
