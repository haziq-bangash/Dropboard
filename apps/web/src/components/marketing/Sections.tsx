import {
  ArrowRight,
  Bot,
  FileSpreadsheet,
  Gift,
  Link2,
  LineChart,
  Share2,
  ShieldCheck,
  Table2,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Grain } from "@/components/art/Grain";
import { ASSISTANT } from "@/lib/brand";
import { MockChat, MockDashboard, MockShare } from "./Mocks";
import { AskArt, DashboardArt, FastArt, PilotArt, PrivateArt, ShareArt } from "./ToolArt";
import { PromptCarousel } from "./PromptCarousel";

const wrap = "mx-auto w-full max-w-6xl px-5";

function SectionHeading({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center">
      <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {children && <p className="mt-3 text-balance text-muted-foreground">{children}</p>}
    </div>
  );
}

const TOOLS = [
  { art: <DashboardArt />, title: "Instant dashboards", text: "KPIs and charts picked for your columns." },
  { art: <PilotArt />, title: `Meet ${ASSISTANT}`, text: "Describe the dashboard you want." },
  { art: <AskArt />, title: "Ask your data", text: "Questions in plain English." },
  { art: <ShareArt />, title: "Share links", text: "Password-protected and read-only." },
  { art: <PrivateArt />, title: "Private by design", text: "Your rows stay in your browser." },
  { art: <FastArt />, title: "Fast on big files", text: "Over a million rows in seconds." },
];

export function ToolGrid() {
  return (
    <section id="features" className={`${wrap} pt-24`}>
      <SectionHeading title="Everything you need to understand a spreadsheet">
        From a raw export to a shareable dashboard in one place.
      </SectionHeading>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map(({ art, title, text }) => (
          <Card key={title} className="group gap-0 py-0 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
            <div className="p-2">{art}</div>
            <CardHeader className="px-4 pb-4 pt-3">
              <CardTitle className="text-base">{title}</CardTitle>
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
        flip
        badge="New"
        icon={Bot}
        title={`Ask ${ASSISTANT} anything about your data`}
        text={`Describe the dashboard you want or ask a question. ${ASSISTANT} writes the query, and your browser runs it.`}
        points={[
          ["Design with a sentence", "“Focus on revenue by region” rebuilds the dashboard around it."],
          ["Answers you can check", "Every answer shows the SQL behind it, so nothing is a black box."],
          ["Your rows stay private", `${ASSISTANT} is powered by a language model that sees only column names, types and counts. Never your data.`],
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

export function AiPrompts() {
  return (
    <section id="pilot" className="relative isolate mt-10 overflow-hidden bg-foreground py-24 text-background">
      {/* soft glows, faint contour lines and grain */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "radial-gradient(55% 70% at 12% 8%, rgba(7,80,86,0.95), transparent 70%), radial-gradient(45% 60% at 92% 98%, rgba(255,91,4,0.38), transparent 70%)",
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-cover bg-center opacity-[0.11]"
        style={{ backgroundImage: "url(/art/topo-lines-light.svg)" }}
      />
      <Grain className="-z-10 opacity-40" />

      <div className={`${wrap} text-center`}>
        <Badge variant="secondary" className="mb-4">
          New
        </Badge>
        <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Meet <em className="font-serif font-medium italic text-secondary">{ASSISTANT}</em>. Ask anything about your spreadsheet.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-balance opacity-70">
          Start from a question instead of a blank dashboard. Here is the kind of thing you can ask.
        </p>
        <Button size="lg" variant="secondary" className="mt-6 rounded-full" render={<Link href="/#upload" />} nativeButton={false}>
          Try it on your file <ArrowRight />
        </Button>
      </div>
      <PromptCarousel />
    </section>
  );
}

const PERKS = [
  { icon: ShieldCheck, title: "Private by design", text: "Files are processed in your browser. Your rows are never uploaded." },
  { icon: Zap, title: "Fast", text: "Dashboards appear in seconds, even for files with over a million rows." },
  { icon: FileSpreadsheet, title: "Any spreadsheet", text: "Excel, CSV, JSON and NDJSON exports from any tool you use." },
  { icon: Table2, title: "Built for stores and ops", text: "Made for ecommerce and operations exports. Shopify, Stripe and GA4 templates are coming soon." },
  { icon: Share2, title: "Safe sharing", text: "Read-only links with optional passwords, never indexed by search engines." },
  { icon: Gift, title: "Free to start", text: `Build a dashboard without an account. Sign in only to publish and use ${ASSISTANT}.` },
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
      <div className="relative isolate overflow-hidden rounded-3xl px-6 py-20 sm:py-28">
        {/* grain-gradient panel with a white dot grid */}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10"
          style={{
            backgroundColor: "#F4D47C",
            backgroundImage:
              "radial-gradient(60% 90% at 18% 35%, #FF5B04 0%, transparent 62%), radial-gradient(50% 80% at 85% 15%, #FFB05A 0%, transparent 60%), radial-gradient(60% 90% at 72% 100%, #3E8E94 0%, transparent 66%)",
          }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_85%)]"
          style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.9) 2.6px, transparent 3.2px)", backgroundSize: "30px 30px" }}
        />
        <Grain className="-z-10" />

        <div className="mx-auto max-w-lg rounded-2xl bg-background/90 p-8 text-center shadow-xl backdrop-blur sm:p-10">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Ready to begin?</h2>
          <p className="mx-auto mt-3 max-w-md text-balance text-muted-foreground">
            Drop your first spreadsheet and see your dashboard in seconds. No signup needed.
          </p>
          <Button size="lg" className="mt-6 rounded-full px-6" render={<Link href="/#upload" />} nativeButton={false}>
            Drop a file <ArrowRight />
          </Button>
        </div>
      </div>
    </section>
  );
}
