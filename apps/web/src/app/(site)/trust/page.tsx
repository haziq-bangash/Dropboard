import {
  Accessibility,
  ArrowRight,
  Check,
  Code2,
  EyeOff,
  Globe,
  KeyRound,
  Laptop,
  Link2,
  Lock,
  MessageSquareLock,
  ShieldCheck,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Grain } from "@/components/art/Grain";
import { bentoBase, Chip, ItalicLast, Stat, TONES } from "@/components/marketing/bento";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { ASSISTANT, CONTACT_EMAIL, LEGAL_UPDATED } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Trust center | Dropboard",
  description: "How Dropboard handles your data: what stays in your browser, what we keep, who else is involved, and what we have not got yet.",
};

/** How firmly each claim stands. "Not yet" is shown on purpose: a trust page that only lists wins is not one. */
type Status = "In place" | "By design" | "Tested" | "Not yet";

const STATUS: Record<Status, string> = {
  "In place": "bg-[#CFE8E1] text-foreground",
  "By design": "bg-secondary text-secondary-foreground",
  Tested: "bg-[#FFD59A] text-foreground",
  "Not yet": "bg-[#D3DBDD] text-foreground",
};

const BADGES: { icon: LucideIcon; status: Status; title: string; text: string }[] = [
  { icon: Laptop, status: "In place", title: "Rows stay on your device", text: "Files are read in your browser and never uploaded." },
  { icon: Lock, status: "In place", title: "Encrypted in transit", text: "Every connection uses HTTPS." },
  { icon: Globe, status: "In place", title: "Hosted in the EU", text: "The site and service run in Frankfurt, Germany." },
  { icon: KeyRound, status: "In place", title: "Passwords are hashed", text: "Never stored, never emailed." },
  { icon: MessageSquareLock, status: "In place", title: `${ASSISTANT} sees no rows`, text: "Column names and counts only." },
  { icon: Link2, status: "In place", title: "Safe sharing", text: "Passwords, revoking, and small groups hidden." },
  { icon: EyeOff, status: "In place", title: "No tracking", text: "No ads, no analytics, only a sign-in cookie." },
  { icon: Trash2, status: "In place", title: "Delete it all", text: "Remove your account and its data yourself." },
  { icon: ShieldCheck, status: "By design", title: "GDPR", text: "Minimal data, access and deletion on request." },
  { icon: Accessibility, status: "Tested", title: "WCAG 2.1 AA checks", text: "Automated accessibility tests on every change." },
  { icon: Code2, status: "In place", title: "Source available", text: "The code is public under a noncommercial licence." },
  { icon: ShieldCheck, status: "Not yet", title: "SOC 2 and ISO 27001", text: "Not certified. We do not claim them." },
];

const PROCESSORS: { name: string; logo: string; job: string; sees: string }[] = [
  { name: "Google Cloud", logo: "googlecloud", job: "Hosts the site and the service, in Frankfurt", sees: "Everything the service handles, as the host" },
  { name: "A managed PostgreSQL database", logo: "postgresql", job: "Stores accounts and saved dashboards", sees: "Account details, dashboards and published snapshots, never rows" },
  { name: "OpenAI", logo: "openai", job: `Runs ${ASSISTANT}`, sees: "Column names, counts and what you type, never rows" },
  { name: "Resend", logo: "resend", job: "Sends confirmation and password-reset emails", sees: "Your email address and the message" },
  { name: "Google sign-in", logo: "google", job: "Optional sign-in", sees: "That you signed in; it tells us your name and email" },
];

export default function Trust() {
  return (
    <PageShell className="flex flex-col gap-20 py-12">
      <header className="relative grid items-end gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div className="relative">
          <span aria-hidden="true" className="absolute -left-4 top-8 -z-10 hidden h-28 w-24 bg-secondary sm:block" />
          <p className="font-serif text-lg italic text-muted-foreground">Trust center</p>
          <h1 className="mt-2 font-serif text-5xl leading-[1.02] font-normal tracking-normal text-balance sm:text-7xl">
            Your data stays <em className="italic">yours.</em>
          </h1>
        </div>
        <div className="flex flex-col gap-4">
          <p className="max-w-md text-lg text-balance">
            What stays in your browser, what we keep, who else is involved, and what we have not got yet, in plain words.
          </p>
          <p className="text-sm text-muted-foreground">Updated {LEGAL_UPDATED}</p>
          <div className="flex flex-wrap gap-2">
            <Button render={<Link href="/privacy" />} className="rounded-full">
              Privacy policy <ArrowRight />
            </Button>
            <Button render={<Link href="/terms" />} variant="outline" className="rounded-full">
              Terms of use
            </Button>
          </div>
        </div>
      </header>

      <section aria-label="The three promises" className="grid gap-4 lg:grid-cols-3">
        <div className={`${bentoBase} ${TONES.teal} min-h-[300px]`}>
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-cover bg-center opacity-20" style={{ backgroundImage: "url(/art/topo-lines-light.svg)" }} />
          <Grain className="-z-10 opacity-40" />
          <Stat>
            <span className="block text-8xl">0</span>
          </Stat>
          <p className="mt-3 text-xl font-medium">rows uploaded to our servers</p>
          <p className="mt-1 text-sm opacity-90">Your file is read, analysed and drawn on your own device.</p>
        </div>
        <div className={`${bentoBase} ${TONES.yellow} min-h-[300px]`}>
          <Grain className="-z-10 opacity-40" />
          <Chip tilt="-rotate-2" className="mb-auto self-start bg-white/85 text-foreground">
            {ASSISTANT}
          </Chip>
          <Stat>
            <span className="block text-5xl">
              <ItalicLast text="Names and counts, never rows" />
            </span>
          </Stat>
          <p className="mt-3 text-sm">
            The assistant is told your column names, their types and how many values are empty or different. Nothing from inside a cell.
          </p>
        </div>
        <div className={`${bentoBase} ${TONES.orange} min-h-[300px]`}>
          <Grain className="-z-10 opacity-40" />
          <Chip tilt="rotate-2" className="mb-auto self-start bg-white/85 text-foreground">
            Where it runs
          </Chip>
          <Stat>
            <span className="block text-6xl">
              <ItalicLast text="Frankfurt, Germany" />
            </span>
          </Stat>
          <p className="mt-3 text-sm">Hosted on Google Cloud in the EU, behind HTTPS.</p>
        </div>
      </section>

      <section aria-labelledby="in-detail">
        <div className="mb-8 max-w-2xl">
          <h2 id="in-detail" className="font-serif text-4xl leading-tight font-normal tracking-normal">
            What we do, and <em className="italic">what we do not</em>
          </h2>
          <p className="mt-3 text-muted-foreground">
            Each card says how firmly it stands. &ldquo;In place&rdquo; is something you can check today. &ldquo;By design&rdquo; is how we
            build. &ldquo;Not yet&rdquo; is something we do not have.
          </p>
        </div>
        <ul aria-label="What we do and what we do not" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BADGES.map((b) => (
            <li
              key={b.title}
              className="group flex flex-col gap-5 rounded-2xl border bg-card p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
            >
              <div className="flex items-start justify-between gap-2">
                <span aria-hidden="true" className="grid size-11 place-items-center rounded-xl bg-secondary/60 text-brand-text">
                  <b.icon className="size-5" />
                </span>
                <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium ${STATUS[b.status]}`}>
                  {b.status !== "Not yet" && <Check className="size-3.5" aria-hidden="true" />}
                  {b.status}
                </span>
              </div>
              <div>
                <h3 className="font-serif text-2xl leading-tight font-normal tracking-normal">{b.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{b.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="who-else" className="grid gap-8 lg:grid-cols-[1fr_1.6fr]">
        <div>
          <h2 id="who-else" className="font-serif text-4xl leading-tight font-normal tracking-normal">
            Who else <em className="italic">handles</em> your data
          </h2>
          <p className="mt-3 text-muted-foreground">
            A few services help us run Dropboard. Each one sees only what its job needs. We do not sell your data or share it for advertising.
            The <Link href="/privacy" className="underline underline-offset-4">privacy policy</Link> has the details.
          </p>
        </div>
        <ul className="flex flex-col gap-3">
          {PROCESSORS.map((p) => (
            <li key={p.name} className="grid items-center gap-4 rounded-2xl border bg-card p-5 sm:grid-cols-[1fr_1.4fr] sm:gap-6">
              <div className="flex items-center gap-4">
                <span className="grid size-14 shrink-0 place-items-center rounded-xl border bg-background">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/brand/partners/${p.logo}.svg`} alt="" width={28} height={28} className="size-7 object-contain" />
                </span>
                <div>
                  <h3 className="font-serif text-xl font-normal tracking-normal">{p.name}</h3>
                  <p className="text-sm text-muted-foreground">{p.job}</p>
                </div>
              </div>
              <p className="text-sm">
                <span className="font-medium">Sees: </span>
                {p.sees}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className={`${bentoBase} border-2 border-dashed border-brand bg-card text-foreground`} aria-labelledby="questions">
        <h2 id="questions" className="font-serif text-4xl leading-tight font-normal tracking-normal sm:text-5xl">
          Found something, or <em className="italic">have a question?</em>
        </h2>
        <p className="mt-3 max-w-xl">
          Report a security problem, ask about your data, or ask for a commercial licence of the code. Write to{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-4">
            {CONTACT_EMAIL}
          </a>
          . Please give us a reasonable time to fix a security issue before you share it.
        </p>
      </section>
    </PageShell>
  );
}
