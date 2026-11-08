"use client";

import { FileSpreadsheet, MessageSquare, Share2, X } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import { ASSISTANT } from "@/lib/brand";
import { dismissGuide, useGuideVisible } from "@/lib/guide";

const STEPS = [
  {
    icon: FileSpreadsheet,
    title: "Drop a file",
    text: "Choose a spreadsheet, or start from a sample. A first dashboard is built in your browser.",
  },
  {
    icon: MessageSquare,
    title: `Ask ${ASSISTANT}`,
    text: `Say what you want to see, or ask a question about your data. ${ASSISTANT} sees column names and counts, never your rows.`,
  },
  {
    icon: Share2,
    title: "Share a link",
    text: "Publish a read-only snapshot with the charts only. Your rows stay on your device.",
  },
];

/** A short, dismissible start for new accounts. Shown on the projects page until it is dismissed. */
export function GettingStarted() {
  const { data: session } = authClient.useSession();
  const userId = session?.user.id ?? "";
  const visible = useGuideVisible(userId);
  if (!userId || !visible) return null;

  return (
    <Card
      className="relative mt-8 border-brand/30 bg-secondary/20"
      data-testid="getting-started"
    >
      <CardContent>
        <Button
          variant="ghost"
          size="icon-sm"
          className="absolute right-3 top-3"
          aria-label="Dismiss the guide"
          onClick={() => dismissGuide(userId)}
        >
          <X />
        </Button>
        <h2 className="text-lg font-semibold tracking-tight">
          Welcome to{" "}
          <em className="font-serif text-[1.14em] italic text-brand-text-strong">
            Dropboard
          </em>
        </h2>
        <ol className="mt-4 grid gap-5 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-background text-brand-text ring-1 ring-border">
                <s.icon className="size-4" />
              </span>
              <span>
                <span className="block text-sm font-medium">
                  {i + 1}. {s.title}
                </span>
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  {s.text}
                </span>
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button render={<Link href="/app/new" />} nativeButton={false}>
            Start a project
          </Button>
          <Button variant="ghost" onClick={() => dismissGuide(userId)}>
            Got it
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
