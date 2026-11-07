"use client";

import type { DashboardSpec, ShareResults } from "@dropboard/spec";
import { useMemo } from "react";
import { snapshotSource } from "@/lib/results";
import { Dashboard } from "./Dashboard";

export function SnapshotView({ spec, results }: { spec: DashboardSpec; results: ShareResults }) {
  const source = useMemo(() => snapshotSource(results), [results]);
  return <Dashboard spec={spec} source={source} dataKey="snapshot" />;
}
