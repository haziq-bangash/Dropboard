"use client";

import type { DashboardSpec } from "@dropboard/spec";
import { publishableSpec } from "@dropboard/engine";
import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { collectResults } from "@/lib/results";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = ((await res.json().catch(() => null)) as { error?: string } | null)?.error;
    throw new Error(msg ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function PublishButton({ spec }: { spec: DashboardSpec }) {
  const { data: session } = authClient.useSession();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!session) {
    return (
      <p className="muted">
        <Link href="/login" target="_blank">
          Sign in
        </Link>{" "}
        to publish a shareable link. Your dashboard stays here while you sign in.
      </p>
    );
  }

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      const pub = publishableSpec(spec);
      const results = await collectResults(pub);
      const { id } = await post<{ id: string }>("/api/dashboards", pub);
      const { slug } = await post<{ slug: string }>(`/api/dashboards/${id}/share`, {
        results,
        password: password || undefined,
      });
      setLink(`${location.origin}/s/${slug}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not publish.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="publish">
      <input
        type="password"
        placeholder="Optional link password (4+ chars)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button onClick={publish} disabled={busy || (password.length > 0 && password.length < 4)}>
        {busy ? "Publishing…" : "Publish link"}
      </button>
      <span className="muted">Shares charts and summaries only, never your rows.</span>
      {link && (
        <p>
          Published:{" "}
          <a href={link} target="_blank">
            {link}
          </a>
        </p>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
