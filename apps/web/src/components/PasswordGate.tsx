"use client";

import type { DashboardSpec, ShareResults } from "@dropboard/spec";
import { useState } from "react";
import { SnapshotView } from "./SnapshotView";

export function PasswordGate({ slug }: { slug: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<{ spec: DashboardSpec; results: ShareResults } | null>(null);

  if (data) return <SnapshotView spec={data.spec} results={data.results} />;

  return (
    <form
      className="gate"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await fetch(`/api/shares/${encodeURIComponent(slug)}`, {
          headers: { "x-share-password": password },
        });
        setBusy(false);
        if (res.ok) setData(await res.json());
        else setError(res.status === 404 ? "This link is no longer available." : "Wrong password.");
      }}
    >
      <h2>This dashboard is password protected</h2>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        autoFocus
        required
      />
      <button disabled={busy}>{busy ? "Checking…" : "View dashboard"}</button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
