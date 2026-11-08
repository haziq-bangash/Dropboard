import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DashboardSpec, ProjectSource } from "@dropboard/spec";
import {
  hasProjectData,
  loadProjectData,
  removeProjectData,
  saveProjectData,
} from "./local-data";
import { getLoaded, setLoaded, type LoadedData } from "./loaded-data";
import { ApiError, projectsApi } from "./projects";

/** Every query key in one place, so invalidating one thing never means hunting for strings. */
export const keys = {
  projects: ["projects"] as const,
  project: (id: string) => ["project", id] as const,
  providers: ["providers"] as const,
  summary: ["account-summary"] as const,
  billing: ["billing"] as const,
  plans: ["plans"] as const,
  sessions: ["sessions"] as const,
  /** The rows of a project, in the browser. Not cached after the page closes: the DuckDB table is shared by all projects. */
  projectData: (userId: string, id: string) =>
    ["project-data", userId, id] as const,
  kept: (userId: string, id: string) => ["kept", userId, id] as const,
};

export function useProjectList(enabled = true) {
  return useQuery({ queryKey: keys.projects, queryFn: projectsApi.list, enabled });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: keys.project(id),
    queryFn: () => projectsApi.get(id),
  });
}

export interface Providers {
  google: boolean;
  email: boolean;
}

/** Which sign-in options the server offers. Fixed for the life of a deploy, so fetched once. */
export function useProviders() {
  return useQuery<Providers>({
    queryKey: keys.providers,
    queryFn: async () => {
      const res = await fetch("/api/providers");
      if (!res.ok) return { google: false, email: false };
      const p = (await res.json()) as Partial<Providers>;
      return { google: Boolean(p.google), email: Boolean(p.email) };
    },
    staleTime: Infinity,
    placeholderData: { google: false, email: false },
  });
}

/**
 * The rows of a project, ready in DuckDB as `data`. Resolves to the rows already loaded for this project, else the copy
 * kept on this device, else null (the person has to choose the file). The DuckDB table holds one project at a time, so
 * nothing is kept once the page closes.
 */
export function useProjectData(
  userId: string | undefined,
  projectId: string,
  fileName: string | null | undefined,
  ready: boolean,
) {
  return useQuery<LoadedData | null>({
    queryKey: keys.projectData(userId ?? "", projectId),
    enabled: Boolean(userId) && ready,
    gcTime: 0,
    staleTime: Infinity,
    queryFn: async () => {
      const current = getLoaded();
      if (current?.projectId === projectId) return current;
      const loaded = await loadProjectData(
        userId!,
        projectId,
        fileName ?? "saved file",
      );
      if (loaded) setLoaded(loaded);
      return loaded;
    },
  });
}

/** Whether a copy of the rows is kept on this device. */
export function useKept(userId: string | undefined, projectId: string) {
  return useQuery({
    queryKey: keys.kept(userId ?? "", projectId),
    enabled: Boolean(userId),
    gcTime: 0,
    queryFn: () => hasProjectData(userId!, projectId),
  });
}

/** Everything that changes projects. Each one refreshes what it touched. */
export function useProjectMutations(userId?: string) {
  const qc = useQueryClient();
  const refreshList = () => qc.invalidateQueries({ queryKey: keys.projects });
  const refreshOne = (id: string) =>
    qc.invalidateQueries({ queryKey: keys.project(id) });

  return {
    create: useMutation({
      mutationFn: (v: { spec: DashboardSpec; source?: ProjectSource }) =>
        projectsApi.create(v.spec, v.source),
      onSuccess: refreshList,
    }),
    rename: useMutation({
      mutationFn: (v: { id: string; title: string }) =>
        projectsApi.rename(v.id, v.title),
      onSuccess: (_r, v) => Promise.all([refreshOne(v.id), refreshList()]),
    }),
    saveSpec: useMutation({
      mutationFn: (v: { id: string; spec: DashboardSpec }) =>
        projectsApi.saveSpec(v.id, v.spec),
      // show the change straight away, put it back if saving fails
      onMutate: async (v) => {
        await qc.cancelQueries({ queryKey: keys.project(v.id) });
        const before = qc.getQueryData(keys.project(v.id));
        qc.setQueryData(
          keys.project(v.id),
          (p: Awaited<ReturnType<typeof projectsApi.get>> | undefined) =>
            p ? { ...p, spec: v.spec, title: v.spec.title } : p,
        );
        return { before };
      },
      onError: (_e, v, ctx) => qc.setQueryData(keys.project(v.id), ctx?.before),
      onSettled: (_r, _e, v) => Promise.all([refreshOne(v.id), refreshList()]),
    }),
    duplicate: useMutation({
      mutationFn: (id: string) => projectsApi.duplicate(id),
      onSuccess: refreshList,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        await projectsApi.remove(id);
        if (userId) await removeProjectData(userId, id);
      },
      onSuccess: refreshList,
    }),
    revokeLink: useMutation({
      mutationFn: (v: { projectId: string; slug: string }) =>
        projectsApi.revokeLink(v.slug),
      onSuccess: (_r, v) =>
        Promise.all([refreshOne(v.projectId), refreshList()]),
    }),
  };
}

/** Keep a copy of the rows on this device, and refresh the "kept" flag. */
export function useKeepOnDevice(userId: string | undefined, projectId: string) {
  const qc = useQueryClient();
  return {
    save: async () => {
      if (!userId) return false;
      const ok = await saveProjectData(userId, projectId);
      await qc.invalidateQueries({ queryKey: keys.kept(userId, projectId) });
      return ok;
    },
    remove: async () => {
      if (!userId) return;
      await removeProjectData(userId, projectId);
      setLoaded(null);
      qc.setQueryData(keys.projectData(userId, projectId), null);
      await qc.invalidateQueries({ queryKey: keys.kept(userId, projectId) });
    },
    /** Rows were read from a file: show them, and keep a copy. */
    attach: async (loaded: LoadedData) => {
      if (!userId) return;
      qc.setQueryData(keys.projectData(userId, projectId), loaded);
      await saveProjectData(userId, projectId);
      await qc.invalidateQueries({ queryKey: keys.kept(userId, projectId) });
    },
  };
}

export interface AccountSummary {
  plan: string;
  planId?: "free" | "pro" | "team";
  memberSince: string | null;
  signInMethods: string[];
  usage: {
    projects: { used: number; max: number };
    publishedLinks: { used: number; max: number };
    pilotToday: { used: number; max: number };
  };
}

/** Plan, usage and how this account signs in. */
export function useAccountSummary() {
  return useQuery({
    queryKey: keys.summary,
    queryFn: async () => {
      const res = await fetch("/api/me/summary");
      if (!res.ok)
        throw new ApiError("Could not load your account.", res.status);
      return (await res.json()) as AccountSummary;
    },
  });
}
