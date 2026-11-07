import type { DashboardSpec, ShareResults } from "@dropboard/spec";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { PasswordGate } from "@/components/PasswordGate";
import { SnapshotView } from "@/components/SnapshotView";

export const dynamic = "force-dynamic";

type Result =
  | { kind: "ok"; spec: DashboardSpec; results: ShareResults }
  | { kind: "password" }
  | { kind: "missing" };

// Deduplicated between generateMetadata and the page within one request
const load = cache(async (slug: string): Promise<Result> => {
  const base = process.env.API_URL ?? "http://localhost:8080";
  try {
    const res = await fetch(`${base}/api/shares/${encodeURIComponent(slug)}`, { cache: "no-store" });
    if (res.status === 401 || res.status === 403) return { kind: "password" };
    if (!res.ok) return { kind: "missing" };
    const body = (await res.json()) as { spec: DashboardSpec; results: ShareResults };
    return { kind: "ok", spec: body.spec, results: body.results };
  } catch {
    return { kind: "missing" };
  }
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const r = await load(slug);
  return {
    title: r.kind === "ok" ? `${r.spec.title} | Dropboard` : "Shared dashboard | Dropboard",
    // Shared links are private by default: never index them.
    robots: { index: false, follow: false },
  };
}

export default async function SharedDashboard({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await load(slug);
  if (r.kind === "missing") notFound();
  return (
    <main>
      {r.kind === "ok" ? <SnapshotView spec={r.spec} results={r.results} /> : <PasswordGate slug={slug} />}
      <p className="muted">Published with Dropboard. This is a snapshot; the original data is not included.</p>
    </main>
  );
}
