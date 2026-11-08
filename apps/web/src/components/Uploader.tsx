"use client";

import { suggestDashboard, type TableProfile } from "@dropboard/engine";
import type { DashboardSpec } from "@dropboard/spec";
import { FileSpreadsheet, Loader2, ShieldCheck, Upload } from "lucide-react";
import { useCallback, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SampleNotice } from "@/components/SampleNotice";
import { loadFile } from "@/lib/ingest";
import { newLoadId } from "@/lib/loaded-data";
import { liveSource } from "@/lib/results";
import { AiPanel } from "./AiPanel";
import { Dashboard } from "./Dashboard";
import { PageShell } from "./PageShell";
import { PublishButton } from "./PublishButton";

type State =
  | { status: "idle" }
  | { status: "loading"; name: string; stage?: string }
  | { status: "error"; message: string }
  | { status: "ready"; spec: DashboardSpec; profile: TableProfile; ms: number; loadId: string };

/**
 * The drop zone and the dashboard builder. `hero` and `below` are marketing content (server-rendered
 * by the page); they are shown around the drop zone and hidden once a dashboard is built.
 */
export function Uploader({ hero, below }: { hero: React.ReactNode; below: React.ReactNode }) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [over, setOver] = useState(false);

  const handle = useCallback(async (file: File) => {
    setState({ status: "loading", name: file.name });
    const t0 = performance.now();
    try {
      const { title, profile } = await loadFile(file, (stage) => setState({ status: "loading", name: file.name, stage }));
      setState({ status: "ready", spec: suggestDashboard(title, profile), profile, ms: Math.round(performance.now() - t0), loadId: newLoadId() });
      window.scrollTo({ top: 0 });
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "Could not read that file." });
    }
  }, []);

  const dropZone = (
    <div id="upload" className="mx-auto w-full max-w-3xl px-5">
      <label
        className={cn(
          "group flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed bg-muted/30 px-6 py-14 text-center transition-colors hover:border-brand hover:bg-muted/50",
          over && "border-brand bg-muted/60",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files[0];
          if (f) void handle(f);
        }}
      >
        <input
          type="file"
          hidden
          accept=".xlsx,.csv,.tsv,.json,.ndjson,.jsonl"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handle(f);
          }}
        />
        <div className="flex size-12 items-center justify-center rounded-full bg-background shadow-sm ring-1 ring-border">
          {state.status === "loading" ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
        </div>
        <p className="text-lg font-medium">
          {state.status === "loading" ? `Analyzing ${state.name}…${state.stage ? ` ${state.stage}` : ""}` : "Drop a spreadsheet here, or click to browse"}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {[".xlsx", ".csv", ".json", ".ndjson"].map((t) => (
            <Badge key={t} variant="secondary" className="gap-1">
              <FileSpreadsheet className="size-3" />
              {t}
            </Badge>
          ))}
        </div>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <ShieldCheck className="size-4" />
          Processed in your browser. Your rows are never uploaded.
        </p>
      </label>
      {state.status === "error" && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
    </div>
  );

  if (state.status !== "ready") {
    return (
      <>
        {hero}
        {dropZone}
        {below}
      </>
    );
  }

  return (
    <PageShell className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" data-testid="build-time">
          Built in {state.ms} ms, entirely in your browser.
        </p>
        <PublishButton spec={state.spec} />
      </div>
      <AiPanel profile={state.profile} spec={state.spec} onSpec={(spec) => setState({ ...state, spec })} />
      <>
        {state.profile.sample && <SampleNotice sample={state.profile.sample} />}
        <Dashboard spec={state.spec} source={liveSource} dataKey={state.loadId} />
      </>
    </PageShell>
  );
}
