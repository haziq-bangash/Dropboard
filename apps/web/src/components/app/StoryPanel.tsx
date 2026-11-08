"use client";

import type { TableProfile } from "@dropboard/engine";
import { applyNarration } from "@dropboard/engine";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { narrateStory } from "@/lib/ai";
import { ASSISTANT } from "@/lib/brand";
import { authClient } from "@/lib/auth-client";
import { Card, CardContent } from "@/components/ui/card";
import { MintThread, StoryCollage } from "@/components/art/StoryArt";
import { EmptyTile } from "@/components/marketing/bento";
import { KIND } from "@/components/app/InsightsPanel";
import { Skeleton } from "@/components/ui/skeleton";
import { useInsights } from "@/lib/insights";

/**
 * The findings, told as a short page: the strongest one as the headline, the next few as big figures, then each with a
 * suggestion for where to look. It is written by fixed rules from the same findings as the Insights tab, so it says the
 * same thing every time, needs no model and sends nothing anywhere.
 */
export function StoryPanel({
  profile,
  dataKey,
}: {
  profile: TableProfile;
  dataKey: string;
}) {
  const insights = useInsights(profile, dataKey);
  const { data: session } = authClient.useSession();
  const narrate = useMutation({ mutationFn: narrateStory });

  if (insights.isPending) {
    return (
      <div
        className="mx-auto flex max-w-3xl flex-col gap-4"
        data-testid="story"
      >
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }
  if (insights.error) {
    return (
      <Alert variant="destructive" className="mx-auto max-w-3xl">
        <AlertDescription>
          Could not read this data. Try loading the file again.
        </AlertDescription>
      </Alert>
    );
  }

  const plain = insights.data.findings;
  const findings = narrate.data ? applyNarration(plain, narrate.data.items, (n) => n.toLocaleString(undefined, { maximumSignificantDigits: 4 })) : plain;
  if (plain.length === 0) {
    return (
      <div className="mx-auto max-w-3xl" data-testid="story">
        <EmptyTile tone="yellow" title="There is no story to tell yet" data-testid="no-story">
          Nothing in this data was both clear and large enough to build a story on. The dashboard still shows the totals and breakdowns.
        </EmptyTile>
      </div>
    );
  }

  const [lead, ...rest] = findings;
  const figures = findings.slice(0, 3);
  const chapters = rest.slice(0, 4);
  // Say each suggestion once: three relationships in a row would otherwise repeat the same advice three times
  const said = new Set<string>();
  const advice = (f: { next: string }) =>
    said.has(f.next) ? null : (said.add(f.next), f.next);
  const leadAdvice = advice(lead);
  const chapterAdvice = chapters.map(advice);

  // the headline, with its last third in the italic serif, as an editorial title is set
  const words = lead.headline.split(" ");
  const italicFrom = Math.max(1, words.length - Math.max(1, Math.ceil(words.length / 3)));
  // what the story is made of, as small outlined tags
  const kinds = [...new Set([lead, ...rest.slice(0, 4)].map((f) => (f.kind === "trend" && Number(f.evidence.relativeChange) < 0 ? "Trend" : KIND[f.kind].label)))];
  // each key figure sits on its own shape
  const shapes = ["bg-secondary", "rounded-t-[6rem] bg-[#CFE8E1]", "rounded-3xl bg-[#FFD59A]"];

  return (
    <article className="relative isolate mx-auto flex max-w-5xl flex-col gap-16" data-testid="story">
      <MintThread className="-z-10 left-1 top-[34rem] bottom-24 hidden w-10 lg:block" />

      <header className="relative grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div className="relative">
          <span aria-hidden="true" className="absolute -left-4 top-10 -z-10 hidden h-44 w-24 bg-secondary sm:block" />
          <h2
            className="font-serif text-5xl leading-[1.02] font-normal tracking-tight text-balance sm:text-7xl"
            data-testid="story-headline"
          >
            {words.slice(0, italicFrom).join(" ")} <em className="italic">{words.slice(italicFrom).join(" ")}</em>
          </h2>
          <p className="mt-6 max-w-xs text-sm text-muted-foreground">
            {profile.rowCount.toLocaleString()} rows and {profile.columns.length}{" "}
            columns, read in your browser.
          </p>
          <ul aria-label="What this story is made of" className="mt-5 flex flex-wrap gap-2">
            {kinds.map((label) => (
              <li key={label} className="rounded-full border border-foreground/70 px-3 py-1 text-sm">
                {label}
              </li>
            ))}
          </ul>
        </div>
        <StoryCollage />
      </header>

      <section aria-label={`Write this story with ${ASSISTANT}`} className="flex flex-col gap-2 rounded-3xl border-2 border-dashed border-brand/50 bg-card p-5 text-sm">
        {session ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" className="rounded-full" disabled={narrate.isPending} onClick={() => narrate.mutate(plain)}>
              {narrate.isPending ? "Writing…" : narrate.data ? `Write it again with ${ASSISTANT}` : `Write this with ${ASSISTANT}`}
            </Button>
            {narrate.data && (
              <span className="text-muted-foreground">
                {narrate.data.remaining} request{narrate.data.remaining === 1 ? "" : "s"} left today.
              </span>
            )}
          </div>
        ) : (
          <p>
            <Link href="/login" className="underline underline-offset-4">Sign in</Link> to have {ASSISTANT} write this story in its own words.
          </p>
        )}
        <p className="text-muted-foreground">
          {ASSISTANT} gets only the numbers behind each finding and your column names. Category names, dates and individual values are swapped for
          placeholders before anything is sent, and put back here in your browser. It never sees rows.
        </p>
        {narrate.error && (
          <Alert variant="destructive">
            <AlertDescription>{narrate.error instanceof Error ? narrate.error.message : "Something went wrong."}</AlertDescription>
          </Alert>
        )}
      </section>

      <section
        aria-label="Key figures"
        className={`grid gap-6 ${figures.length === 1 ? "" : figures.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}
      >
        {figures.map((f, i) => (
          <div
            key={`${f.kind}-${f.columns.join("-")}`}
            data-testid="story-figure"
            className={`flex min-h-56 flex-col justify-end p-6 ${shapes[i % shapes.length]}`}
          >
            <p className="font-serif text-6xl leading-none tracking-normal text-foreground">{f.figure.value}</p>
            <p className="mt-2 text-sm text-foreground/75">{f.figure.label}</p>
            <p className="mt-4 text-sm font-medium">{f.headline}</p>
          </div>
        ))}
      </section>

      <section aria-label="The lead finding" className="relative flex max-w-3xl flex-col gap-3 lg:ml-16">
        <p className="font-serif text-3xl leading-snug tracking-normal text-balance sm:text-4xl">{lead.sentence}</p>
        {leadAdvice && (
          <p className="text-sm italic text-muted-foreground">
            Look next: {leadAdvice}
          </p>
        )}
      </section>

      {chapters.map((f, i) => (
        <section
          key={`${f.kind}-${f.columns.join("-")}`}
          className={`relative grid gap-4 border-t border-foreground/20 pt-8 md:grid-cols-[7rem_1fr] lg:max-w-4xl ${i % 2 ? "lg:ml-auto" : "lg:ml-16"}`}
          data-testid="story-chapter"
        >
          <p aria-hidden="true" className="font-serif text-6xl leading-none text-brand-text">
            {String(i + 2).padStart(2, "0")}
          </p>
          <div className="flex flex-col gap-2">
            <h3 className="font-serif text-3xl leading-tight font-normal tracking-normal">{f.headline}</h3>
            <p className="max-w-2xl">{f.sentence}</p>
            {chapterAdvice[i] && (
              <p className="text-sm italic text-muted-foreground">
                Look next: {chapterAdvice[i]}
              </p>
            )}
          </div>
        </section>
      ))}

      <footer className="border-t pt-4 text-sm text-muted-foreground">
        {narrate.data
          ? `The wording was written by ${ASSISTANT} from the numbers in the findings, and every number in it was checked against them. The figures above come straight from the data.`
          : "Written by fixed rules from the findings on the Insights tab, so it reads the same every time."}{" "}
        It describes patterns in this data; it does not explain them.
      </footer>
    </article>
  );
}
