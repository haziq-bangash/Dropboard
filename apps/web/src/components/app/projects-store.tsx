"use client";

import { useQueryClient } from "@tanstack/react-query";
import { keys, useProjectList } from "@/lib/queries";

/** The signed-in user's projects and plan limits, from the shared query cache. */
export function useProjects() {
  const query = useProjectList();
  const client = useQueryClient();
  return {
    items: query.data?.items ?? null,
    limits: query.data?.limits ?? null,
    error: query.error
      ? query.error instanceof Error
        ? query.error.message
        : "Could not load your projects."
      : null,
    refresh: () => client.invalidateQueries({ queryKey: keys.projects }),
  };
}
