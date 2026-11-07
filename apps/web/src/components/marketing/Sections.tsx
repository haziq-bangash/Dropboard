import {
  ArrowRight,
  FileSpreadsheet,
  Gauge,
  Link2,
  LineChart,
  MessageSquare,
  Share2,
  ShieldCheck,
  Sparkles,
  Table2,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MockChat, MockDashboard, MockShare } from "./Mocks";

const wrap = "mx-auto w-full max-w-6xl px-5";

function SectionHeading({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center">
      <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {children && <p className="mt-3 text-balance text-muted-foreground">{children}</p>}
    </div>
  );
}

// Looping row of example dashboards under the drop zone
const EXAMPLES = [
  ["Revenue by region", [60, 85, 45, 70]],
  ["Orders over time", [30, 45, 40, 62, 58, 80]],
  ["Top products", [90, 72, 55, 40, 28]],
  ["Refund rate", [20, 28, 18, 24, 15, 12]],
  ["Customers by country", [75, 60, 52, 33]],
  ["Ad spend vs. sales", [35, 50, 48, 66, 74]],
] as const;

export function ExampleMarquee() {
  const row = [...EXAMPLES, ...EXAMPLES];
  return (
    <div className="relative mt-14 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
      <div className="flex w-max animate-marquee gap-4">
        {row.map(([title, bars], i) => (
          <Card key={i} size="sm" className="w-56 shrink-0">
            <CardHeader>
              <CardDescription>Example</CardDescription>
              <CardTitle className="text-sm">{title}</CardTitle>
              <div className="mt-2 flex h-14 items-end gap-1.5">
                {bars.map((h, j) => (
                  <div key={j} className="flex-1 rounded-t bg-primary/70" style={{ height: `${h}%` }} />
                ))}
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}

const TOOLS = [
  { icon: Zap, title: "Instant dashboards", text: "KPIs and charts picked for your columns." },
  { icon: Sparkles, title: "AI design", text: "Describe the dashboard you want." },
  { icon: MessageSquare, title: "Ask your data", text: "Questions in plain English." },
  { icon: Share2, title: "Share links", text: "Password-protected and read-only." },
  { icon: ShieldCheck, title: "Private by design", text: "Your rows stay in your browser." },
  { icon: Gauge, title: "Fast on big files", text: "Over a million rows in seconds." },
] as const;

export function ToolGrid() {
  return (
    <section id="features" className={`${wrap} pt-24`}>
      <SectionHeading title="Everything you need to understand a spreadsheet">
        From a raw export to a shareable dashboard in one place.
      </SectionHeading>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {TOOLS.map(({ icon: Icon, title, text }) => (
          <Card key={title} size="sm">
            <CardHeader>
              <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                <Icon className="size-4" />
              </div>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{text}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </section>
  );
}

interface RowProps {
  id?: string;
  icon: React.ElementType;
  title: string;
  text: string;
  points: [string, string][];
  cta?: { label: string; href: string };
  visual: React.ReactNode;
  flip?: boolean;
  badge?: string;
}

function FeatureRow({ id, icon: Icon, title, text, points, cta, visual, flip, badge }: RowProps) {
  return (
    <div id={id} className={`${wrap} grid items-center gap-10 py-14 md:grid-cols-2 md:gap-16`}>
      <div className={flip ? "md:order-2" : undefined}>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
            <Icon className="size-5" />
          </div>
          {badge && <Badge>{badge}</Badge>}
        </div>
        <h3 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{title}</h3>
        <p className="mt-3 text-muted-foreground">{text}</p>
        {cta && (
          <Button variant="outline" className="mt-5 rounded-full" render={<Link href={cta.href} />} nativeButton={false}>
            {cta.label} <ArrowRight />
          </Button>
        )}
        <dl className="mt-8 grid gap-5">
          {points.map(([head, body]) => (
            <div key={head}>
              <dt className="font-medium">{head}</dt>
              <dd className="text-sm text-muted-foreground">{body}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className={flip ? "md:order-1" : undefined}>{visual}</div>
    </div>
  );
}

export function FeatureRows() {
  return (
    <section id="how" className="pt-12">
      <FeatureRow
        icon={LineChart}
        title="Instant dashboards, built in your browser"
        text="Drop a file and Dropboard reads it, profiles every column and builds a dashboard that fits your data. No setup, no formulas."
        cta={{ label: "Try it now", href: "/#upload" }}
        points={[
          ["Charts chosen for your columns", "Totals, trends over time, breakdowns and a data preview, ready in seconds."],
          ["Handles big files", "In our tests a 44 MB CSV with 1.4 million rows showed its first numbers in about 3 seconds."],
          ["Excel, CSV and JSON", "Open .xlsx, .csv, .json and .ndjson exports from any tool."],
        ]}
        visual={<MockDashboard />}
      />
      <FeatureRow
        id="ai"
        flip
        badge="New"
        icon={Sparkles}
        title="Ask your data in plain English"
        text="Describe the dashboard you want or ask a question. The AI writes the query, and your browser runs it."
        points={[
          ["Design with a sentence", "“Focus on revenue by region” rebuilds the dashboard around it."],
          ["Answers you can check", "Every answer shows the SQL behind it, so nothing is a black box."],
          ["Your rows stay private", "The AI sees only column names, types and counts. Never your data."],
        ]}
        visual={<MockChat />}
      />
      <FeatureRow
        icon={Link2}
        title="Share a link, not your spreadsheet"
        text="Publish a read-only snapshot with one click. Viewers see your charts and summaries, and the original file stays with you."
        points={[
          ["Password protection", "Lock a link with a password, and revoke it any time."],
          ["Never indexed", "Shared dashboards are hidden from search engines."],
          ["No raw rows", "The data preview table is removed before anything is published."],
        ]}
        visual={<MockShare />}
      />
    </section>
  );
}

const PROMPTS = [
  "Which region had the highest revenue last quarter?",
  "Show monthly orders and the average order value",
  "Top 10 products by revenue",
  "How many customers ordered more than once?",
  "Which day of the week sells the most?",
  "Compare ad spend with sales by channel",
];

export function AiPrompts() {
  const chips = [...PROMPTS, ...PROMPTS];
  return (
    <section className="mt-10 bg-foreground py-20 text-background">
      <div className={`${wrap} text-center`}>
        <Badge variant="secondary" className="mb-4">New</Badge>
        <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Design with AI. Ask anything about your spreadsheet.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-balance opacity-70">
          Start from a question instead of a blank dashboard. Here is the kind of thing you can ask.
        </p>
        <Button size="lg" variant="secondary" className="mt-6 rounded-full" render={<Link href="/#upload" />} nativeButton={false}>
          Try it on your file <ArrowRight />
        </Button>
      </div>
      <div className="relative mt-12 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
        <div className="flex w-max animate-marquee gap-3">
          {chips.map((p, i) => (
            <span key={i} className="rounded-full border border-background/25 px-4 py-2 text-sm whitespace-nowrap">
              {p}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

const PERKS = [
  { icon: ShieldCheck, title: "Private by design", text: "Files are processed in your browser. Your rows are never uploaded." },
  { icon: Zap, title: "Fast", text: "Dashboards appear in seconds, even for files with over a million rows." },
  { icon: FileSpreadsheet, title: "Any spreadsheet", text: "Excel, CSV, JSON and NDJSON exports from any tool you use." },
  { icon: Table2, title: "Built for stores and ops", text: "Made for ecommerce and operations exports. Shopify, Stripe and GA4 templates are coming soon." },
  { icon: Share2, title: "Safe sharing", text: "Read-only links with optional passwords, never indexed by search engines." },
  { icon: Sparkles, title: "Free to start", text: "Build a dashboard without an account. Sign in only to publish and use AI." },
] as const;

export function Perks() {
  return (
    <section id="privacy" className={`${wrap} py-24`}>
      <SectionHeading title="Why Dropboard">Built so you can go from file to answer without handing over your data.</SectionHeading>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PERKS.map(({ icon: Icon, title, text }) => (
          <Card key={title}>
            <CardHeader>
              <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                <Icon className="size-5" />
              </div>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{text}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </section>
  );
}

export function ClosingCta() {
  return (
    <section className={`${wrap} pb-24`}>
      <div className="rounded-3xl border bg-secondary/40 px-6 py-16 text-center">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Ready to begin?</h2>
        <p className="mx-auto mt-3 max-w-md text-balance text-muted-foreground">
          Drop your first spreadsheet and see your dashboard in seconds. No signup needed.
        </p>
        <Button size="lg" className="mt-6 rounded-full px-6" render={<Link href="/#upload" />} nativeButton={false}>
          Drop a file <ArrowRight />
        </Button>
      </div>
    </section>
  );
}
