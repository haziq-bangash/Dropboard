import type { DashboardSpec, ShareResults } from "@dropboard/spec";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { PageShell } from "@/components/PageShell";
import { clientAddressHeaders } from "@/lib/forward";
import { PasswordGate } from "@/components/PasswordGate";
import { SnapshotView } from "@/components/SnapshotView";

export const dynamic = "force-dynamic";

type Result =
  | { kind: "ok"; spec: DashboardSpec; results: ShareResults; badge: boolean }
  | { kind: "password" }
  | { kind: "busy" }
  | { kind: "expired" }
  | { kind: "missing" };

// Deduplicated between generateMetadata and the page within one request
const load = cache(async (slug: string): Promise<Result> => {
  const base = process.env.API_URL ?? "http://localhost:8080";
  try {
    const res = await fetch(`${base}/api/shares/${encodeURIComponent(slug)}`, {
      cache: "no-store",
      // pass the visitor on, so the API limits visitors and not this server
      headers: clientAddressHeaders(await headers()),
    });
    if (res.status === 429) return { kind: "busy" };
    if (res.status === 410) return { kind: "expired" };
    if (res.status === 401 || res.status === 403) return { kind: "password" };
    if (!res.ok) return { kind: "missing" };
    const body = (await res.json()) as {
      spec: DashboardSpec;
      results: ShareResults;
      badge?: boolean;
    };
    // an older server sends no badge flag: show it, as the free plan does
    return { kind: "ok", spec: body.spec, results: body.results, badge: body.badge ?? true };
  } catch {
    return { kind: "missing" };
  }
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const r = await load(slug);
  return {
    title:
      r.kind === "ok"
        ? `${r.spec.title} | Dropboard`
        : "Shared dashboard | Dropboard",
    // Shared links are private by default: never index them.
    robots: { index: false, follow: false },
  };
}

export default async function SharedDashboard({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const r = await load(slug);
  if (r.kind === "missing") notFound();
  return (
    <PageShell>
      {r.kind === "ok" ? (
        <SnapshotView spec={r.spec} results={r.results} badge={r.badge} />
      ) : r.kind === "expired" ? (
        <div className="mx-auto mt-16 max-w-md text-center" data-testid="link-expired">
          <h1 className="font-serif text-4xl font-normal tracking-normal">
            This link has <em className="italic">expired</em>
          </h1>
          <p className="mt-3 text-muted-foreground">The person who shared it set it to stop working on a date, and that date has passed. Ask them for a new link.</p>
        </div>
      ) : r.kind === "busy" ? (
        <p className="mx-auto mt-16 max-w-sm text-center text-muted-foreground">
          This link is getting a lot of visits right now. Please try again in a
          minute.
        </p>
      ) : (
        <PasswordGate slug={slug} />
      )}
      <p className="mt-8 text-center text-sm text-muted-foreground">
        Published with Dropboard. This is a snapshot; the original data is not
        included.
      </p>
    </PageShell>
  );
}
