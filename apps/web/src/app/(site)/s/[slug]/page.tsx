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
  | { kind: "ok"; spec: DashboardSpec; results: ShareResults }
  | { kind: "password" }
  | { kind: "busy" }
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
    if (res.status === 401 || res.status === 403) return { kind: "password" };
    if (!res.ok) return { kind: "missing" };
    const body = (await res.json()) as {
      spec: DashboardSpec;
      results: ShareResults;
    };
    return { kind: "ok", spec: body.spec, results: body.results };
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
        <SnapshotView spec={r.spec} results={r.results} />
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
