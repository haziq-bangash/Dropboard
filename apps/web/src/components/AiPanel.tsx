"use client";

import type { TableProfile } from "@dropboard/engine";
import type { DashboardSpec } from "@dropboard/spec";
import { Bot, LayoutDashboard, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { askQuestion, generateDashboard, toAiTable } from "@/lib/ai";
import { ASSISTANT } from "@/lib/brand";
import { authClient } from "@/lib/auth-client";
import type { Rows } from "@/lib/results";
import { Table } from "./Dashboard";

type Answer = { explanation: string; sql: string; rows: Rows };

export function AiPanel({
  profile,
  spec,
  onSpec,
}: {
  profile: TableProfile;
  spec: DashboardSpec;
  onSpec: (spec: DashboardSpec) => void;
}) {
  const { data: session } = authClient.useSession();
  const [instruction, setInstruction] = useState("");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState<"generate" | "ask" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  async function run<T>(kind: "generate" | "ask", fn: () => Promise<T>, done: (r: T) => void) {
    setBusy(kind);
    setError(null);
    setNote(null);
    try {
      done(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="border-brand/30 bg-secondary/20 ring-brand/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
          <span aria-hidden="true" className="grid size-9 place-items-center rounded-full bg-background text-brand-text ring-1 ring-border">
            <Bot className="size-4" />
          </span>
          <em className="font-serif text-[1.14em] italic text-brand-text-strong">{ASSISTANT}</em>
          <Badge variant="secondary">New</Badge>
        </CardTitle>
        <CardDescription>
          Design or refine this dashboard, or ask a question in plain English. {ASSISTANT} is powered by a language model that sees only your column names, types and counts, never
          your rows. If a query fails, it also gets the database's error message with any quoted values removed. Answers are computed in your browser.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!session ? (
          <p className="text-sm text-muted-foreground">
            <Link href="/login" target="_blank" className="font-medium text-foreground underline underline-offset-4">
              Sign in
            </Link>{" "}
            to use {ASSISTANT}.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="What should it focus on? e.g. revenue by region"
                aria-label="Dashboard instruction"
                maxLength={500}
              />
              <Button
                disabled={busy !== null}
                onClick={() =>
                  run(
                    "generate",
                    () => generateDashboard(toAiTable(profile), instruction, spec),
                    (r) => {
                      onSpec(r.spec);
                      setRemaining(r.remaining);
                      setNote(
                        `Dashboard updated${r.cached ? " (reused a saved result, free)" : ""}.` +
                          (r.removed
                            ? ` ${r.removed} suggested chart${r.removed > 1 ? "s" : ""} did not fit your data and ${r.removed > 1 ? "were" : "was"} skipped.`
                            : ""),
                      );
                    },
                  )
                }
              >
                <LayoutDashboard />
                {busy === "generate" ? "Designing…" : `Design with ${ASSISTANT}`}
              </Button>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask a question, e.g. which region grew fastest?"
                aria-label="Question about your data"
                maxLength={500}
              />
              <Button
                variant="outline"
                disabled={busy !== null || question.trim().length < 3}
                onClick={() =>
                  run(
                    "ask",
                    () => askQuestion(toAiTable(profile), question),
                    (r) => {
                      setAnswer({ explanation: r.explanation, sql: r.sql, rows: r.rows });
                      setRemaining(r.remaining);
                      if (r.repaired) setNote(`${ASSISTANT}'s first query failed, so it tried once more.`);
                    },
                  )
                }
              >
                <MessageSquare />
                {busy === "ask" ? "Thinking…" : "Ask"}
              </Button>
            </div>

            {remaining !== null && (
              <p className="text-sm text-muted-foreground">
                {remaining} request{remaining === 1 ? "" : "s"} left today.
              </p>
            )}
            {note && <p className="text-sm text-muted-foreground">{note}</p>}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {answer && (
              <div className="flex flex-col gap-3 rounded-lg border p-4" data-testid="ai-answer">
                <p className="font-medium">{answer.explanation}</p>
                {answer.rows.length ? <Table rows={answer.rows} label="Answer, table that scrolls" /> : <p className="text-sm text-muted-foreground">The query returned no rows.</p>}
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground">Show SQL</summary>
                  <pre className="mt-2 overflow-auto rounded-md bg-muted p-3 text-xs">{answer.sql}</pre>
                </details>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
