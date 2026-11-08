"use client";

import { chartSummary, countryCode } from "@dropboard/engine";
import type { ChartSpec, DashboardSpec } from "@dropboard/spec";
import * as echarts from "echarts";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ChevronLeft, ChevronRight, Download, Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table as UiTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { imageName } from "@/lib/image-name";
import type { RowSource, Rows } from "@/lib/results";

// Brand chart palette (see --chart-* in globals.css): midnight green, orange, dark amber, gunmetal, teal tint, sand
const COLORS = [
  "#075056",
  "#FF5B04",
  "#B8860B",
  "#233038",
  "#3E8E94",
  "#F4D47C",
];
const MUTED = "#6F7F86";

const fmt = (v: unknown) =>
  typeof v === "number"
    ? v.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : String(v ?? "");

type Geo = { features: { properties: { name: string; label: string }; geometry: { coordinates: unknown } }[] };

/** Country shapes from Natural Earth (public domain), fetched once, only when a region map is on the page. */
async function loadWorld(): Promise<Geo> {
  const res = await fetch("/geo/world.json");
  if (!res.ok) throw new Error("Could not load the map shapes.");
  const world = await res.json();
  echarts.registerMap("world", world);
  return world;
}

/** The box around some countries, so a map of one region fills the chart. Skipped when it would wrap the whole globe. */
function boundsOf(geo: Geo, codes: Set<string>): [[number, number], [number, number]] | undefined {
  let minX = 180, maxX = -180, minY = 90, maxY = -90;
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === "number") {
      const [x, y] = c as number[];
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    } else if (Array.isArray(c)) c.forEach(walk);
  };
  for (const f of geo.features) if (codes.has(f.properties.name)) walk(f.geometry.coordinates);
  if (maxX < minX || maxX - minX > 300) return undefined;
  return [[minX - 2, maxY + 2], [maxX + 2, minY - 2]];
}

function toOption(spec: ChartSpec, rows: Rows, geo?: Geo): echarts.EChartsCoreOption {
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
    grid: { left: 48, right: 16, top: 16, bottom: (spec.type === "bar" || spec.type === "boxplot") && rows.length > 6 ? 64 : 32 },
  };
  switch (spec.type) {
    case "bar":
      return {
        ...base,
        xAxis: {
          ...axis,
          type: "category",
          data: rows.map((r) => fmt(r[x])),
          axisLabel: {
            ...axis.axisLabel,
            interval: 0,
            width: 84,
            overflow: "truncate",
            // many bars: tilt the names so every one is shown instead of some being dropped
            rotate: rows.length > 6 ? 35 : 0,
          },
        },
        yAxis: { ...axis, type: "value" },
        series: [
          {
            type: "bar",
            data: rows.map((r) => r[y]),
            itemStyle: { borderRadius: [4, 4, 0, 0] },
          },
        ],
      };
    case "line":
    case "area":
      return {
        ...base,
        // on a narrow screen the month names would run together: let the chart drop the ones that do not fit
        xAxis: { ...axis, type: "time", axisLabel: { ...axis.axisLabel, hideOverlap: true } },
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
        series: [
          {
            type: "scatter",
            symbolSize: 6,
            data: rows.map((r) => [r[x], r[y]]),
          },
        ],
      };
    case "map": {
      // No street map behind the points: longitude across, latitude up, one circle per bin sized by its row count.
      // That keeps it free of tile requests, and nothing about where the data is leaves the browser.
      const most = Math.max(1, ...rows.map((r) => Number(r.n) || 0));
      return {
        ...base,
        tooltip: {
          trigger: "item",
          formatter: (p: { value: number[] }) => `${fmt(p.value[2])} rows near ${fmt(p.value[1])}, ${fmt(p.value[0])}`,
        },
        xAxis: { ...axis, type: "value", scale: true, name: "Longitude", nameLocation: "middle", nameGap: 24 },
        yAxis: { ...axis, type: "value", scale: true, name: "Latitude" },
        series: [
          {
            type: "scatter",
            large: rows.length > 2000,
            symbolSize: (v: number[]) => 6 + 22 * Math.sqrt((Number(v[2]) || 0) / most),
            itemStyle: { opacity: 0.6 },
            data: rows.map((r) => [r[x], r[y], r.n]),
          },
        ],
      };
    }
    case "histogram":
      // touching bars, one per range of values, labelled by where the range starts
      return {
        ...base,
        xAxis: { ...axis, type: "category", data: rows.map((r) => fmt(r[x])), axisLabel: { ...axis.axisLabel, hideOverlap: true } },
        yAxis: { ...axis, type: "value" },
        tooltip: { trigger: "axis", formatter: (p: { dataIndex: number }[]) => {
          const r = rows[p[0].dataIndex];
          return `${fmt(r[x])} to ${fmt(Number(r[x]) + Number(r.w))}: ${fmt(r[y])} rows`;
        } },
        series: [{ type: "bar", barCategoryGap: "6%", data: rows.map((r) => r[y]), itemStyle: { borderRadius: [2, 2, 0, 0] } }],
      };
    case "calendar": {
      // a year of days laid out like a wall calendar: a column per week, a row per weekday
      const days = rows.filter((r) => Number.isFinite(Number(r.y))).map((r) => [String(r.x), Number(r.y)] as [string, number]);
      const dates = days.map((d) => d[0]).sort();
      const most = Math.max(1, ...days.map((d) => d[1]));
      return {
        color: COLORS,
        tooltip: { formatter: (p: { value: [string, number] }) => `${p.value[0]}: ${fmt(p.value[1])} rows` },
        visualMap: { min: 0, max: most, orient: "horizontal", left: "center", bottom: 0, itemWidth: 12, itemHeight: 120, calculable: false, textStyle: { color: MUTED }, inRange: { color: ["#E3ECED", "#3E8E94", "#075056"] } },
        calendar: {
          top: 28,
          left: 36,
          right: 8,
          bottom: 40,
          cellSize: ["auto", "auto"],
          range: dates.length ? [dates[0], dates[dates.length - 1]] : undefined,
          itemStyle: { borderWidth: 1.5, borderColor: "#FFFFFF", color: "#F1F3F4" },
          splitLine: { show: false },
          yearLabel: { show: false },
          dayLabel: { firstDay: 1, color: MUTED, nameMap: "en" },
          monthLabel: { color: MUTED },
        },
        series: [{ type: "heatmap", coordinateSystem: "calendar", data: days }],
      };
    }
    case "boxplot": {
      const usable = rows.filter((r) => Number.isFinite(Number(r.y)));
      return {
        ...base,
        tooltip: {
          trigger: "item",
          formatter: (p: { dataIndex: number }) => {
            const r = usable[p.dataIndex];
            return `${fmt(r.x)}<br/>Median ${fmt(r.y)}<br/>Middle half ${fmt(r.q1)} to ${fmt(r.q3)}<br/>Range ${fmt(r.low)} to ${fmt(r.high)}<br/>${fmt(r.n)} rows`;
          },
        },
        xAxis: { ...axis, type: "category", data: usable.map((r) => fmt(r.x)), axisLabel: { ...axis.axisLabel, interval: 0, rotate: usable.length > 6 ? 35 : 0 } },
        yAxis: { ...axis, type: "value", scale: true },
        series: [
          {
            type: "boxplot",
            data: usable.map((r) => [r.low, r.q1, r.y, r.q3, r.high]),
            itemStyle: { color: "#E3ECED", borderColor: "#075056", borderWidth: 1.5 },
            emphasis: { itemStyle: { borderColor: "#FF5B04" } },
          },
        ],
      };
    }
    case "heatmap": {
      const total = (key: string) => {
        const t = new Map<string, number>();
        for (const r of rows) t.set(fmt(r[key]), (t.get(fmt(r[key])) ?? 0) + (Number(r.value) || 0));
        return [...t].sort((a, b) => b[1] - a[1]).map(([k]) => k);
      };
      const xs = total("x");
      const ys = total("y");
      const values = rows.map((r) => Number(r.value)).filter(Number.isFinite);
      return {
        color: COLORS,
        tooltip: { position: "top", formatter: (p: { value: [number, number, number] }) => `${xs[p.value[0]]} and ${ys[p.value[1]]}: ${fmt(p.value[2])}` },
        grid: { left: 88, right: 16, top: 16, bottom: xs.length > 6 ? 84 : 56 },
        xAxis: { ...axis, type: "category", data: xs, splitArea: { show: true }, axisLabel: { ...axis.axisLabel, interval: 0, rotate: xs.length > 6 ? 35 : 0 } },
        yAxis: { ...axis, type: "category", data: ys, splitArea: { show: true } },
        visualMap: { min: Math.min(0, ...values), max: Math.max(1, ...values), orient: "horizontal", left: "center", bottom: 0, itemWidth: 12, itemHeight: 120, calculable: false, textStyle: { color: MUTED }, inRange: { color: ["#E3ECED", "#3E8E94", "#075056"] } },
        series: [{ type: "heatmap", data: rows.filter((r) => Number.isFinite(Number(r.value))).map((r) => [xs.indexOf(fmt(r.x)), ys.indexOf(fmt(r.y)), Number(r.value)]), itemStyle: { borderColor: "#FFFFFF", borderWidth: 1 } }],
      };
    }
    case "regions": {
      // Rows name countries however the file spells them; turn each into a country code and add up repeats.
      const totals = new Map<string, number>();
      for (const r of rows) {
        const code = countryCode(r[x]);
        const v = Number(r[y]);
        if (code && Number.isFinite(v)) totals.set(code, (totals.get(code) ?? 0) + v);
      }
      const values = [...totals.values()];
      const labels = new Map((geo?.features ?? []).map((f) => [f.properties.name, f.properties.label]));
      return {
        color: COLORS,
        tooltip: { trigger: "item", formatter: (p: { name: string; value: unknown }) => `${labels.get(p.name) ?? p.name}: ${p.value == null || Number.isNaN(p.value) ? "no data" : fmt(p.value)}` },
        visualMap: {
          min: Math.min(0, ...values),
          max: Math.max(1, ...values),
          orient: "horizontal",
          left: 8,
          bottom: 4,
          itemWidth: 12,
          itemHeight: 90,
          text: [fmt(Math.max(1, ...values)), "0"],
          textStyle: { color: MUTED },
          inRange: { color: ["#E3ECED", "#3E8E94", "#075056"] },
        },
        series: [
          {
            type: "map",
            map: "world",
            roam: false,
            boundingCoords: geo ? boundsOf(geo, new Set(totals.keys())) : undefined,
            itemStyle: { areaColor: "#F1F3F4", borderColor: "#FFFFFF", borderWidth: 0.6 },
            emphasis: { label: { show: false }, itemStyle: { areaColor: "#FF5B04" } },
            data: [...totals].map(([name, value]) => ({ name, value })),
          },
        ],
      };
    }
    case "pie":
      return {
        ...base,
        series: [
          {
            type: "pie",
            radius: ["45%", "70%"],
            data: rows.map((r) => ({ name: fmt(r[x]), value: r[y] })),
          },
        ],
      };
    default:
      return base;
  }
}

/** Save the chart inside `card` as a PNG, drawn at twice the size on a white page so it reads well when shared. */
function saveImage(card: HTMLElement | null, title: string) {
  const dom = card?.querySelector<HTMLElement>('[role="img"]');
  const chart = dom ? echarts.getInstanceByDom(dom) : undefined;
  if (!chart) return;
  const link = document.createElement("a");
  link.href = chart.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: "#FFFFFF" });
  link.download = imageName(title);
  link.click();
}

function Chart({ spec, rows, geo, tall }: { spec: ChartSpec; rows: Rows; geo?: Geo; tall?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  // ECharts owns a canvas outside React: create it, resize it with the window, and dispose it. Nothing else fits here.
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chart.setOption(toOption(spec, rows, geo));
    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.dispose();
    };
  }, [spec, rows, geo]);
  // the picture is a canvas, which a screen reader cannot read: give it a sentence built from the same rows
  return <div ref={ref} className={tall ? "h-[min(62vh,640px)] w-full" : "h-64 w-full"} role="img" aria-label={chartSummary(spec, rows)} />;
}

export function Table({ rows, label = "Table, scrolls both ways" }: { rows: Rows; label?: string }) {
  const cols = rows[0] ? Object.keys(rows[0]) : [];
  return (
    // a scrolling box has to be reachable with the keyboard, and needs a name so a screen reader says what it is
    <div className="max-h-80 overflow-auto rounded-md border focus-visible:outline-2 focus-visible:outline-ring" tabIndex={0} role="region" aria-label={label}>
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

function ChartCard({
  spec,
  source,
  dataKey,
  tall,
}: {
  spec: ChartSpec;
  source: RowSource;
  dataKey: string;
  /** Draw the chart large, for present mode */
  tall?: boolean;
}) {
  // Keyed by which rows are loaded, so the same SQL on a different file is never answered from the old rows
  const query = useQuery({
    queryKey: ["chart-rows", dataKey, spec.id, spec.query],
    queryFn: () => source(spec),
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const cardRef = useRef<HTMLDivElement>(null);
  // a region map also needs the country shapes, loaded once and shared by every such chart
  const world = useQuery({ queryKey: ["geo", "world"], queryFn: loadWorld, enabled: spec.type === "regions", staleTime: Infinity, retry: false, refetchOnWindowFocus: false });
  const rows: Rows | null = query.data ?? null;
  const error = (query.error ?? world.error)
    ? query.error instanceof Error || world.error instanceof Error
      ? ((query.error ?? world.error) as Error).message
      : "Could not load this chart."
    : null;

  if (spec.type === "kpi") {
    return (
      <Card size="sm" data-testid="kpi">
        <CardHeader>
          <p className="text-sm text-muted-foreground">{spec.title}</p>
          <div
            className="text-3xl font-semibold tracking-tight"
            data-testid="kpi-value"
          >
            {error ? (
              "–"
            ) : rows ? (
              fmt(rows[0]?.value)
            ) : (
              <Skeleton className="h-9 w-24" />
            )}
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card
      className={spec.type === "table" ? "md:col-span-2" : undefined}
      data-testid="chart-card"
      ref={cardRef}
    >
      <CardHeader>
        <CardTitle>{spec.title}</CardTitle>
        {spec.type !== "table" && rows && !error && (
          <CardAction>
            <Button variant="ghost" size="icon-sm" aria-label={`Save ${spec.title} as an image`} onClick={() => saveImage(cardRef.current, spec.title)}>
              <Download />
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : !rows || (spec.type === "regions" && !world.data) ? (
          <Skeleton className="h-64 w-full" />
        ) : spec.type === "table" ? (
          <Table rows={rows} label={`${spec.title}, table that scrolls`} />
        ) : (
          <Chart spec={spec} rows={rows} geo={world.data} tall={tall} />
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Walk through a dashboard one slide at a time, full screen: the headline numbers first, then each chart large.
 * Left and right arrows move, Escape leaves. Charts come from the same cached queries as the dashboard behind it.
 */
function Present({ spec, source, dataKey }: { spec: DashboardSpec; source: RowSource; dataKey: string }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const kpis = spec.charts.filter((c) => c.type === "kpi");
  // the table of rows is for working with the data, not for showing it to a room
  const charts = spec.charts.filter((c) => c.type !== "kpi" && c.type !== "table");
  const slides: (ChartSpec | "numbers")[] = [...(kpis.length ? (["numbers"] as const) : []), ...charts];
  if (slides.length === 0) return null;

  // the arrow buttons stay focusable at the ends (aria-disabled, not disabled): a disabled button would drop keyboard focus out of the dialog and the arrow keys would stop working
  const go = (to: number) => setIndex(Math.min(slides.length - 1, Math.max(0, to)));
  const slide = slides[Math.min(index, slides.length - 1)];

  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setIndex(0);
          setOpen(true);
        }}
      >
        <Presentation /> Present
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton
          data-testid="present"
          className="top-0 left-0 h-dvh w-screen max-w-none translate-x-0 translate-y-0 grid-rows-[auto_1fr_auto] rounded-none p-4 sm:max-w-none sm:p-8"
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "PageDown") go(index + 1);
            else if (e.key === "ArrowLeft" || e.key === "PageUp") go(index - 1);
            else if (e.key === "Home") go(0);
            else if (e.key === "End") go(slides.length - 1);
            else return;
            e.preventDefault();
          }}
        >
          <DialogTitle className="text-xl font-semibold tracking-tight">{spec.title}</DialogTitle>
          <DialogDescription className="sr-only">Use the left and right arrow keys to move between charts, and Escape to leave.</DialogDescription>
          <div className="min-h-0 overflow-auto" data-testid="present-slide">
            {slide === "numbers" ? (
              <div className="grid h-full grid-cols-2 content-center gap-4 lg:grid-cols-4">
                {kpis.map((c) => (
                  <ChartCard key={c.id} spec={c} source={source} dataKey={dataKey} />
                ))}
              </div>
            ) : (
              <ChartCard key={slide.id} spec={slide} source={source} dataKey={dataKey} tall />
            )}
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="hidden text-sm text-muted-foreground sm:block">Arrow keys to move, Escape to leave</p>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="icon" aria-label="Previous chart" aria-disabled={index === 0} className="aria-disabled:pointer-events-none aria-disabled:opacity-50" onClick={() => go(index - 1)}>
                <ChevronLeft />
              </Button>
              <span className="min-w-16 text-center text-sm tabular-nums" aria-live="polite" data-testid="present-count">
                {Math.min(index, slides.length - 1) + 1} of {slides.length}
              </span>
              <Button variant="outline" size="icon" aria-label="Next chart" aria-disabled={index >= slides.length - 1} className="aria-disabled:pointer-events-none aria-disabled:opacity-50" onClick={() => go(index + 1)}>
                <ChevronRight />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function Dashboard({
  spec,
  source,
  dataKey,
  showTitle = true,
}: {
  spec: DashboardSpec;
  source: RowSource;
  /** Identifies the rows behind the source (a load id, or "snapshot"). Cached chart results are reused only for the same key. */
  dataKey: string;
  showTitle?: boolean;
}) {
  const kpis = spec.charts.filter((c) => c.type === "kpi");
  const rest = spec.charts.filter((c) => c.type !== "kpi");
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {showTitle ? <h2 className="text-2xl font-semibold tracking-tight">{spec.title}</h2> : <span />}
        <Present spec={spec} source={source} dataKey={dataKey} />
      </div>
      {kpis.length > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {kpis.map((c) => (
            <ChartCard key={c.id} spec={c} source={source} dataKey={dataKey} />
          ))}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {rest.map((c) => (
          <ChartCard key={c.id} spec={c} source={source} dataKey={dataKey} />
        ))}
      </div>
    </section>
  );
}
