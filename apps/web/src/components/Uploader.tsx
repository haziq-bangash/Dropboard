"use client";

import type { DashboardSpec } from "@dropboard/spec";
import { suggestDashboard } from "@dropboard/engine";
import { useCallback, useState } from "react";
import { loadFile } from "@/lib/ingest";
import { liveSource } from "@/lib/results";
import { Dashboard } from "./Dashboard";
import { PublishButton } from "./PublishButton";

type State =
  | { status: "idle" }
  | { status: "loading"; name: string }
  | { status: "error"; message: string }
  | { status: "ready"; spec: DashboardSpec; ms: number };

export function Uploader() {
  const [state, setState] = useState<State>({ status: "idle" });
  const [over, setOver] = useState(false);

  const handle = useCallback(async (file: File) => {
    setState({ status: "loading", name: file.name });
    const t0 = performance.now();
    try {
      const { title, profile } = await loadFile(file);
      setState({ status: "ready", spec: suggestDashboard(title, profile), ms: Math.round(performance.now() - t0) });
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "Could not read that file." });
    }
  }, []);

  return (
    <div>
      <label
        className={`drop ${over ? "over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files[0];
          if (f) void handle(f);
        }}
      >
        <input type="file" hidden accept=".xlsx,.csv,.tsv,.json,.ndjson,.jsonl" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handle(f); }} />
        <strong>{state.status === "loading" ? `Analyzing ${state.name}…` : "Drop a file here or click to browse"}</strong>
        <span>.xlsx · .csv · .json · .ndjson — processed in your browser, your rows are never uploaded</span>
      </label>
      {state.status === "error" && <p className="error">{state.message}</p>}
      {state.status === "ready" && (
        <>
          <p className="muted">Built in {state.ms} ms, entirely in your browser.</p>
          <PublishButton spec={state.spec} />
          <Dashboard spec={state.spec} source={liveSource} />
        </>
      )}
    </div>
  );
}
