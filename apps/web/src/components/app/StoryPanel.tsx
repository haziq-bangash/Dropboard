"use client";

import type { TableProfile } from "@dropboard/engine";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

  const findings = insights.data.findings;
  if (findings.length === 0) {
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
        <p className="text-sm font-medium text-brand-text">Data story</p>
        <h2
          className="mt-2 font-serif text-4xl leading-tight tracking-normal text-balance sm:text-5xl"
          data-testid="story-headline"
        >
          {lead.headline}
        </h2>
        <p className="mt-3 text-muted-foreground">
          {profile.rowCount.toLocaleString()} rows and {profile.columns.length}{" "}
          columns, read in your browser.
        </p>
      </header>

      <section
        aria-label="Key figures"
        className={`grid gap-4 ${figures.length === 1 ? "" : figures.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}
      >
        {figures.map((f) => (
          <Card
            key={`${f.kind}-${f.columns.join("-")}`}
            size="sm"
            data-testid="story-figure"
          >
            <CardContent>
              <p className="text-3xl font-semibold tracking-tight">
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
        Written by fixed rules from the findings on the Insights tab, so it
        reads the same every time. It describes patterns in this data; it does
        not explain them.
      </footer>
    </article>
  );
}
