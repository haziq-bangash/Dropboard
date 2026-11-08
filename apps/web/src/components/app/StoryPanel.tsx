"use client";

import type { TableProfile } from "@dropboard/engine";
import { applyNarration } from "@dropboard/engine";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { narrateStory } from "@/lib/ai";
import { ASSISTANT } from "@/lib/brand";
import { authClient } from "@/lib/auth-client";
import { Card, CardContent } from "@/components/ui/card";
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
        <Card data-testid="no-story">
          <CardContent>
            <p className="font-medium">There is no story to tell yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Nothing in this data was both clear and large enough to build a
              story on. The dashboard still shows the totals and breakdowns.
            </p>
          </CardContent>
        </Card>
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

  return (
    <article
      className="mx-auto flex max-w-3xl flex-col gap-10"
      data-testid="story"
    >
      <header>
        <Badge variant="outline" className="h-7 rounded-full px-3 text-sm font-normal text-brand-text-strong">
          Data <em className="ml-1 font-serif text-[1.14em] italic">story</em>
        </Badge>
        <h2
          className="mt-4 text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl"
          data-testid="story-headline"
        >
          {lead.headline}
        </h2>
        <p className="mt-3 text-muted-foreground">
          {profile.rowCount.toLocaleString()} rows and {profile.columns.length}{" "}
          columns, read in your browser.
        </p>
      </header>

      <section aria-label={`Write this story with ${ASSISTANT}`} className="flex flex-col gap-2 rounded-2xl border border-brand/30 bg-secondary/20 p-4 text-sm">
        {session ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" disabled={narrate.isPending} onClick={() => narrate.mutate(plain)}>
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
        className={`grid gap-4 ${figures.length === 1 ? "" : figures.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}
      >
        {figures.map((f) => (
          <Card
            key={`${f.kind}-${f.columns.join("-")}`}
            size="sm"
            data-testid="story-figure"
            className="bg-secondary/30"
          >
            <CardContent>
              <p className="text-3xl font-semibold tracking-tight text-primary">
                {f.figure.value}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {f.figure.label}
              </p>
              <p className="mt-3 text-sm">{f.headline}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section aria-label="The lead finding" className="flex flex-col gap-2">
        <p className="text-lg">{lead.sentence}</p>
        {leadAdvice && (
          <p className="text-sm italic text-muted-foreground">
            Look next: {leadAdvice}
          </p>
        )}
      </section>

      {chapters.map((f, i) => (
        <section
          key={`${f.kind}-${f.columns.join("-")}`}
          className="flex flex-col gap-2 border-t pt-6"
          data-testid="story-chapter"
        >
          <h3 className="text-xl font-semibold tracking-tight">{f.headline}</h3>
          <p>{f.sentence}</p>
          {chapterAdvice[i] && (
            <p className="text-sm italic text-muted-foreground">
              Look next: {chapterAdvice[i]}
            </p>
          )}
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
