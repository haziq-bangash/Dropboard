"use client";

import type { DashboardSpec, ShareResults } from "@dropboard/spec";
import { useMemo } from "react";
import { MadeWithBadge } from "@/components/marketing/MadeWithBadge";
import { snapshotSource } from "@/lib/results";
import { Dashboard } from "./Dashboard";

export function SnapshotView({ spec, results, badge = false }: { spec: DashboardSpec; results: ShareResults; /** Show "Made with Dropboard": the owner is on the free plan. */ badge?: boolean }) {
  const source = useMemo(() => snapshotSource(results), [results]);
  return (
    <>
      <Dashboard spec={spec} source={source} dataKey="snapshot" />
      {badge && <MadeWithBadge />}
    </>
  );
}
