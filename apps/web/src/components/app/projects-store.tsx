"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { projectsApi, type Limits, type ProjectSummary } from "@/lib/projects";

interface Store {
  items: ProjectSummary[] | null;
  limits: Limits | null;
  error: string | null;
  refresh: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

/** One list of the signed-in user's projects, shared by the sidebar meter and the pages. */
export function ProjectsProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ProjectSummary[] | null>(null);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await projectsApi.list();
      setItems(r.items);
      setLimits(r.limits);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your projects.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(() => ({ items, limits, error, refresh }), [items, limits, error, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProjects(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error("useProjects must be used inside ProjectsProvider");
  return v;
}
