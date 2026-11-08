import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Grain } from "@/components/art/Grain";
import { ASSISTANT } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { MockChat, MockDashboard, MockShare } from "./Mocks";
import { AskArt, DashboardArt, FastArt, PilotArt, PrivateArt, ShareArt } from "./ToolArt";
import { bentoBase, Chip, Stat } from "./bento";
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

type Tone = "sand" | "green" | "orange";

const TONES: Record<Tone, { panel: string; layer: React.ReactNode }> = {
  sand: {
    panel: "bg-secondary",
    layer: (
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 opacity-30 [background-image:radial-gradient(circle,#233038_1px,transparent_1.4px)] [background-size:16px_16px]"
      />
    ),
  },
  green: {
    panel: "bg-primary",
    layer: <div aria-hidden="true" className="absolute inset-0 -z-10 bg-cover bg-center opacity-25" style={{ backgroundImage: "url(/art/topo-lines-light.svg)" }} />,
  },
  orange: {
    panel: "bg-gradient-to-br from-[#FFB05A] to-[#FF5B04]",
    layer: <div aria-hidden="true" className="absolute inset-0 -z-10 bg-cover bg-center opacity-20" style={{ backgroundImage: "url(/art/topo-lines-dark.svg)" }} />,
  },
};

/** A colored, grain-textured panel with the mockup floating on it and a tilted chip. */
function ArtPanel({
  tone,
  tilt,
  chip,
  chipClass,
  children,
}: {
  tone: Tone;
  tilt: string;
  chip: string;
  chipClass: string;
  children: React.ReactNode;
}) {
  const t = TONES[tone];
  return (
    <div
      data-testid="feature-art"
      className={cn("relative isolate flex min-h-[420px] items-center justify-center overflow-hidden rounded-3xl p-8 sm:p-12", t.panel)}
    >
      {t.layer}
      <Grain className="-z-10 opacity-40" />
      <div className={cn("relative w-full max-w-md transition-transform duration-500 hover:rotate-0", tilt)}>{children}</div>
      <span className={cn("absolute rounded-full bg-background px-4 py-2 text-sm font-medium shadow-lg", chipClass)}>{chip}</span>
    </div>
  );
}

function Em({ children }: { children: React.ReactNode }) {
  return <em className="font-serif text-[1.14em] italic text-brand-text">{children}</em>;
}

interface RowProps {
  id?: string;
  index: string;
  title: React.ReactNode;
  text: string;
  points: [string, string][];
  cta?: { label: string; href: string };
  visual: React.ReactNode;
  tone: Tone;
  tilt: string;
  chip: string;
  chipClass: string;
  flip?: boolean;
  badge?: string;
}

function FeatureRow({ id, index, title, text, points, cta, visual, tone, tilt, chip, chipClass, flip, badge }: RowProps) {
  return (
    <div id={id} className={`${wrap} grid items-center gap-10 py-16 md:grid-cols-2 md:gap-16`}>
      <div className={flip ? "md:order-2" : undefined}>
        <div className="mb-5 flex items-center gap-3">
          <span className="font-serif text-6xl leading-none text-brand-text">{index}</span>
          {badge && <Badge>{badge}</Badge>}
        </div>
        <h3 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h3>
        <p className="mt-4 text-lg text-muted-foreground">{text}</p>
        {cta && (
          <Button className="mt-6 rounded-full px-5" render={<Link href={cta.href} />} nativeButton={false}>
            {cta.label} <ArrowRight />
          </Button>
        )}
        <ul className="mt-8 grid gap-5">
          {points.map(([head, body]) => (
            <li key={head} className="flex gap-3">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                <Check className="size-3.5" />
              </span>
              <div>
                <p className="font-medium">{head}</p>
                <p className="text-sm text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className={flip ? "md:order-1" : undefined}>
        <ArtPanel tone={tone} tilt={tilt} chip={chip} chipClass={chipClass}>
          {visual}
        </ArtPanel>
      </div>
    </div>
  );
}

export function FeatureRows() {
  return (
    <section id="how" className="pt-12">
      <FeatureRow
        index="01"
        title={
          <>
            Instant dashboards, built in your <Em>browser</Em>
          </>
        }
        text="Drop a file and Dropboard reads it, profiles every column and builds a dashboard that fits your data. No setup, no formulas."
        cta={{ label: "Try it now", href: "/#upload" }}
        points={[
          ["Charts chosen for your columns", "Totals, trends over time, breakdowns and a data preview, ready in seconds."],
          ["Handles big files", "In our tests a 44 MB CSV with 1.4 million rows showed its first numbers in about 3 seconds."],
          ["Excel, CSV and JSON", "Open .xlsx, .csv, .json and .ndjson exports from any tool."],
        ]}
        tone="sand"
        tilt="-rotate-1"
        chip="1.4M rows in about 3 seconds"
        chipClass="bottom-6 right-6 rotate-3"
        visual={<MockDashboard />}
      />
      <FeatureRow
        flip
        index="02"
        badge="New"
        title={
          <>
            Ask <Em>{ASSISTANT}</Em> anything about your data
          </>
        }
        text={`Describe the dashboard you want or ask a question. ${ASSISTANT} writes the query, and your browser runs it.`}
        points={[
          ["Design with a sentence", "“Focus on revenue by region” rebuilds the dashboard around it."],
          ["Answers you can check", "Every answer shows the SQL behind it, so nothing is a black box."],
          ["Your rows stay private", `${ASSISTANT} is powered by a language model that sees only column names, types and counts. Never your data.`],
        ]}
        tone="green"
        tilt="rotate-1"
        chip="The SQL is always shown"
        chipClass="left-6 top-6 -rotate-3"
        visual={<MockChat />}
      />
      <FeatureRow
        index="03"
        title={
          <>
            Share a <Em>link</Em>, not your spreadsheet
          </>
        }
        text="Publish a read-only snapshot with one click. Viewers see your charts and summaries, and the original file stays with you."
        points={[
          ["Password protection", "Lock a link with a password, and revoke it any time."],
          ["Never indexed", "Shared dashboards are hidden from search engines."],
          ["No raw rows", "The data preview table is removed before anything is published."],
        ]}
        tone="orange"
        tilt="-rotate-1"
        chip="Revoke any time"
        chipClass="bottom-6 left-6 -rotate-2"
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
          Meet <em className="font-serif text-[1.14em] italic text-secondary">{ASSISTANT}</em>. Ask anything about your spreadsheet.
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

export function Perks() {
  return (
    <section id="privacy" className={`${wrap} py-24`}>
      <SectionHeading title="Why Dropboard">Built so you can go from file to answer without handing over your data.</SectionHeading>

      <div className="grid gap-4 sm:grid-cols-2 lg:auto-rows-[220px] lg:grid-cols-4">
        {/* Private by design */}
        <div className={`${bentoBase} bg-primary text-primary-foreground sm:col-span-2 lg:row-span-2`} data-testid="perk">
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-cover bg-center opacity-20" style={{ backgroundImage: "url(/art/topo-lines-light.svg)" }} />
          <Grain className="-z-10 opacity-40" />
          <p className="text-sm font-medium tracking-wide opacity-75">Private by design</p>
          <Stat>
            <span className="block text-[8.5rem] sm:text-[11rem]">0</span>
          </Stat>
          <p className="-mt-2 text-2xl font-semibold tracking-tight">rows uploaded</p>
          <p className="mt-2 max-w-sm text-sm opacity-80">Files are processed in your browser. Your rows are never uploaded.</p>
        </div>

        {/* Fast */}
        <div className={`${bentoBase} bg-secondary text-secondary-foreground`} data-testid="perk">
          <Grain className="-z-10 opacity-40" />
          <p className="text-sm font-medium tracking-wide opacity-75">Fast</p>
          <Stat>
            <span className="block text-7xl">~3s</span>
          </Stat>
          <p className="mt-2 text-sm">1.4M rows in our tests. Dashboards appear in seconds.</p>
        </div>

        {/* Any spreadsheet */}
        <div className={`${bentoBase} bg-[#D3DBDD] text-foreground`} data-testid="perk">
          <Grain className="-z-10 opacity-40" />
          <div className="absolute right-4 top-4 flex max-w-[75%] flex-wrap justify-end gap-2">
            <Chip tilt="-rotate-6" className="bg-card">.xlsx</Chip>
            <Chip tilt="rotate-3" className="bg-primary text-primary-foreground">.csv</Chip>
            <Chip tilt="rotate-6" className="bg-card">.json</Chip>
            <Chip tilt="-rotate-3" className="bg-card">.ndjson</Chip>
          </div>
          <p className="text-lg font-semibold">Any spreadsheet</p>
          <p className="mt-1 text-sm text-foreground/75">Exports from any tool you use.</p>
        </div>

        {/* Built for stores and ops */}
        <div className={`${bentoBase} bg-gradient-to-br from-[#FFD59A] to-[#FF9A45] text-foreground sm:col-span-2`} data-testid="perk">
          <Grain className="-z-10 opacity-45" />
          <div className="absolute right-5 top-5 flex gap-2">
            {["Shopify", "Stripe", "GA4"].map((t, i) => (
              <Chip key={t} tilt={["-rotate-3", "rotate-2", "-rotate-1"][i]} className="border border-dashed border-foreground/60 bg-background/70">
                {t} <span className="text-xs font-medium opacity-70">soon</span>
              </Chip>
            ))}
          </div>
          <p className="text-lg font-semibold">Built for stores and ops</p>
          <p className="mt-1 max-w-md text-sm text-foreground/80">
            Made for ecommerce and operations exports. Shopify, Stripe and GA4 templates are coming soon.
          </p>
        </div>

        {/* Safe sharing */}
        <div className={`${bentoBase} bg-foreground text-background sm:col-span-2`} data-testid="perk">
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-cover bg-center opacity-[0.16]" style={{ backgroundImage: "url(/art/topo-lines-light.svg)" }} />
          <Grain className="-z-10 opacity-40" />
          <div className="absolute right-5 top-5 flex flex-wrap justify-end gap-2">
            <Chip tilt="-rotate-3" className="bg-secondary text-secondary-foreground">Password</Chip>
            <Chip tilt="rotate-2" className="bg-background text-foreground">Read-only</Chip>
            <Chip tilt="-rotate-2" className="bg-brand text-[#1b262c]">Revocable</Chip>
          </div>
          <Stat>
            <span className="block text-5xl sm:text-6xl">
              Never <em className="text-secondary italic">indexed</em>
            </span>
          </Stat>
          <p className="mt-3 text-lg font-semibold">Safe sharing</p>
          <p className="mt-1 max-w-md text-sm opacity-75">Read-only links with optional passwords, hidden from search engines.</p>
        </div>

        {/* Free to start */}
        <div className={`${bentoBase} border-2 border-dashed border-brand bg-card text-foreground sm:col-span-2`} data-testid="perk">
          <p className="text-sm font-medium tracking-wide text-brand-text-strong">Free to start</p>
          <Stat>
            <span className="block text-7xl sm:text-8xl">
              <em className="text-brand-text italic">Free</em>
            </span>
          </Stat>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            {`Build a dashboard without an account. Sign in only to publish and use ${ASSISTANT}.`}
          </p>
        </div>
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
