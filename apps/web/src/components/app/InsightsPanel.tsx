"use client";

import type { Finding, FindingKind, TableProfile } from "@dropboard/engine";
import {
  CircleAlert,
  CalendarClock,
  CircleDashed,
  Copy,
  Activity,
  Crown,
  Flag,
  GitCompareArrows,
  ArrowUpDown,
  ScanSearch,
  Zap,
  PieChart,
  Repeat,
  Layers,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table } from "@/components/Dashboard";
import { Grain } from "@/components/art/Grain";
import { bentoTile, EmptyTile, Stat, TONES } from "@/components/marketing/bento";
import { useInsights } from "@/lib/insights";

export const KIND: Record<FindingKind, { label: string; icon: LucideIcon }> = {
  trend: { label: "Trend", icon: TrendingUp },
  change: { label: "Step change", icon: Flag },
  outlier: { label: "Outlier", icon: CircleAlert },
  correlation: { label: "Relationship", icon: GitCompareArrows },
  dominance: { label: "Dominant category", icon: PieChart },
  concentration: { label: "Share of a total", icon: PieChart },
  missing: { label: "Missing values", icon: CircleDashed },
  seasonal: { label: "Repeating pattern", icon: Repeat },
  latest: { label: "Latest period", icon: CalendarClock },
  duplicates: { label: "Repeated rows", icon: Copy },
  leader: { label: "Who leads", icon: Crown },
  standout: { label: "Stands out", icon: CircleAlert },
  entitytrend: { label: "Trend", icon: TrendingUp },
  jump: { label: "Biggest move", icon: Zap },
  rankshift: { label: "Changed rank", icon: ArrowUpDown },
  unusualrows: { label: "Unusual rows", icon: ScanSearch },
  contextual: { label: "Out of pattern", icon: Activity },
  quality: { label: "Data quality", icon: ShieldAlert },
  pareto: { label: "Concentration", icon: Layers },
  retention: { label: "Who comes back", icon: Repeat },
  cohorttrend: { label: "Staying power", icon: Repeat },
};

/** The numbers behind a finding, in plain words, so a claim can be traced. */
function evidenceLines(f: Finding): string[] {
  const e = f.evidence;
  const lines: string[] = [];
  if (f.p !== null)
    lines.push(
      f.p < 0.001
        ? "Very unlikely to be chance (p below 0.001)"
        : `Unlikely to be chance (p = ${f.p.toPrecision(2)})`,
    );
  else
    lines.push(
      "Reported because the effect is large and clear, not from a chance test",
    );
  if (f.kind === "trend")
    lines.push(
      `Based on ${e.points} points; the fitted line moves ${e.noiseUnits} times the usual ups and downs`,
    );
  if (f.kind === "change")
    lines.push(
      `The level moved ${e.shiftInNoiseUnits} times the usual ups and downs, around ${e.at}`,
    );
  if (f.kind === "entitytrend")
    lines.push(`Based on ${e.points} periods of its own figures; the fitted line moves ${e.noiseUnits} times the usual ups and downs`);
  if (f.kind === "leader")
    lines.push(`${(Number(e.share) * 100).toFixed(0)}% held by one against ${((Number(e.share) / Number(e.timesEven)) * 100).toFixed(0)}% each in an even split, across ${e.groups}`);
  if (f.kind === "standout")
    lines.push(`${e.spreadsAway} times the usual spread away from the typical value`);
  if (f.kind === "jump")
    lines.push(`${e.spreadsAway} times the usual spread away from how entities normally move from one period to the next`);
  if (f.kind === "rankshift")
    lines.push(`Ranked #${e.from} at the start and #${e.to} at the end, out of ${e.groups}`);
  if (f.kind === "pareto")
    lines.push(`The top 20% hold ${(Number(e.share20) * 100).toFixed(0)}% of the total, the top 10% hold ${(Number(e.share10) * 100).toFixed(0)}%, across ${e.groups} values; an even spread would give the top 20% a fifth`);
  if (f.kind === "retention")
    lines.push(`${e.returned} of ${e.people} people with at least three months since their first were active in a later month; a count of people, not a test`);
  if (f.kind === "cohorttrend")
    lines.push(`Compared ${e.earlierPeople} people in older groups with ${e.laterPeople} in newer ones, and checked so that only about 5% of what is listed could be chance`);
  if (f.kind === "quality")
    lines.push("A check on the values in the file, not a statistical test, so there is no chance of it being a fluke");
  if (f.kind === "unusualrows")
    lines.push(`Found by comparing each row with the rest across ${e.measures} measures, and checked so that only about 5% of what is listed could be chance. The most unusual is ${e.strongestZ} times the usual spread away`);
  if (f.kind === "contextual")
    lines.push(`${e.spreadsAway} times the usual spread away from what the points around it, and the season, would give`);
  if (f.kind === "seasonal")
    lines.push(
      `The pattern explains ${(Number(e.strength) * 100).toFixed(0)}% of what is left once the trend is taken out, over at least two full cycles`,
    );
  if (f.kind === "latest")
    lines.push(
      `Moved ${e.z} times a usual period-to-period change, from ${e.previous} to ${e.latest}`,
    );
  if (f.kind === "duplicates")
    lines.push(`${e.duplicateRows} rows repeat an earlier row exactly`);
  if (f.kind === "correlation")
    lines.push(`Correlation ${e.r} across ${e.rows} rows`);
  if (f.kind === "outlier")
    lines.push(
      `${e.count} value(s), ${Number(e.share) * 100 < 0.1 ? "under 0.1" : (Number(e.share) * 100).toFixed(1)}% of the rows`,
    );
  if (f.kind === "dominance" || f.kind === "concentration") {
    // "times even" is the share divided by what an even split would give, so an even split is share / times
    lines.push(
      `${(Number(e.share) * 100).toFixed(0)}% held by one value, against ${((Number(e.share) / Number(e.timesEven)) * 100).toFixed(0)}% each in an even split`,
    );
  }
  return lines;
}

/** A summary figure as one of the homepage's tiles: the number set large in the serif face. */
function Tile({ label, value, hint, tone, layout = "", big = false }: { label: string; value: string; hint?: string; tone: keyof typeof TONES; layout?: string; big?: boolean }) {
  return (
    <div className={`${bentoTile} ${TONES[tone]} ${layout} p-5`} data-testid="tile">
      {tone === "teal" && <div aria-hidden="true" className="absolute inset-0 -z-10 bg-cover bg-center opacity-20" style={{ backgroundImage: "url(/art/topo-lines-light.svg)" }} />}
      <Grain className="-z-10 opacity-40" />
      <p className="text-sm font-medium tracking-wide opacity-75">{label}</p>
      <Stat>
        <span className={`mt-1 block ${big ? "text-7xl sm:text-8xl" : "text-5xl"}`}>{value}</span>
      </Stat>
      {hint && <p className="mt-2 text-sm opacity-80">{hint}</p>}
    </div>
  );
}

export function InsightsPanel({
  profile,
  dataKey,
}: {
  profile: TableProfile;
  dataKey: string;
}) {
  const insights = useInsights(profile, dataKey);
  const cells = profile.rowCount * profile.columns.length;
  const empty = profile.columns.reduce((s, c) => s + c.nullCount, 0);
  const numeric = profile.columns.filter((c) => c.type === "number").length;

  return (
    <div className="flex flex-col gap-6" data-testid="insights">
      <div className="grid grid-cols-2 gap-4 lg:auto-rows-[150px] lg:grid-cols-4">
        <Tile tone="teal" layout="col-span-2 min-h-[220px] lg:row-span-2" big label="Rows" value={profile.rowCount.toLocaleString()} hint="read in your browser" />
        <Tile tone="yellow" layout="min-h-[150px]" label="Columns" value={String(profile.columns.length)} hint={`${numeric} numeric`} />
        <Tile
          tone="grey"
          layout="min-h-[150px]"
          label="Completeness"
          value={cells ? `${Math.round((1 - empty / cells) * 1000) / 10}%` : "n/a"}
          hint="cells with a value"
        />
        <Tile
          tone="orange"
          layout="col-span-2 min-h-[150px]"
          label="Findings"
          value={insights.data ? String(insights.data.findings.length) : "…"}
          hint={insights.data ? `found in ${insights.data.ms} ms` : "looking"}
        />
      </div>

      <section aria-labelledby="findings-heading">
        <h2
          id="findings-heading"
          className="text-lg font-semibold tracking-tight"
        >
          What stands out
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Worked out in your browser from summaries of your data. Each finding
          is checked against chance and has to be big enough to matter, so a
          quiet list is a fair answer.
        </p>

        {insights.isPending ? (
          <div className="mt-4 grid gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : insights.error ? (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>
              Could not look through this data. Try loading the file again.
            </AlertDescription>
          </Alert>
        ) : insights.data.findings.length === 0 ? (
          <EmptyTile className="mt-4" tone="grey" title="Nothing stands out" data-testid="no-findings">
            No trend, relationship, step, outlier or lopsided category in this data was both clear and large enough to report. That is a result too: the
            numbers look steady and unrelated.
          </EmptyTile>
        ) : (
          <ol className="mt-4 grid gap-3">
            {insights.data.findings.map((f) => {
              const { label, icon: Icon } =
                f.kind === "trend" && Number(f.evidence.relativeChange) < 0
                  ? { label: "Trend", icon: TrendingDown }
                  : KIND[f.kind];
              return (
                <li
                  key={`${f.kind}-${f.columns.join("-")}`}
                  data-testid="finding"
                >
                  <Card>
                    <CardContent className="flex gap-4">
                      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary/60 text-brand-text">
                        <Icon className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <Badge variant="secondary" className="mb-1.5">
                          {label}
                        </Badge>
                        <p className="text-base">{f.sentence}</p>
                        <details className="mt-2 text-sm text-muted-foreground">
                          <summary className="cursor-pointer select-none underline-offset-4 hover:underline">
                            How we know
                          </summary>
                          <ul className="mt-1.5 list-disc pl-5">
                            {evidenceLines(f).map((line) => (
                              <li key={line}>{line}</li>
                            ))}
                          </ul>
                        </details>
                        {f.details && (
                          <div className="mt-3 flex flex-col gap-1.5" data-testid="finding-details">
                            <p className="text-xs text-muted-foreground">{f.details.caption}</p>
                            <Table
                              label="The rows behind this finding, table that scrolls"
                              rows={f.details.rows.map((row) => Object.fromEntries(f.details!.columns.map((c, i) => [c, row[i]])))}
                            />
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
