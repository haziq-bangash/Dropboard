import {
  findInsights,
  gatherInsightInput,
  type Finding,
  type TableProfile,
} from "@dropboard/engine";
import { useQuery } from "@tanstack/react-query";
import { runQuery } from "./duckdb";

/**
 * What stands out in the loaded data: a few SQL queries in the browser gather small summaries, and the findings engine
 * checks them. Nothing is sent anywhere. Keyed by which rows are loaded, so a different file gets fresh findings and the
 * same one is not worked out again when someone switches tabs.
 */
export function useInsights(profile: TableProfile, dataKey: string) {
  return useQuery<{ findings: Finding[]; ms: number }>({
    queryKey: ["insights", dataKey],
    queryFn: async () => {
      const t0 = performance.now();
      const input = await gatherInsightInput(profile, runQuery);
      return {
        findings: findInsights(input),
        ms: Math.round(performance.now() - t0),
      };
    },
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
