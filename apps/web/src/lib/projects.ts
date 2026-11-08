import type { DashboardSpec, ProjectSource } from "@dropboard/spec";

export interface ProjectSummary {
  id: string;
  title: string;
  sourceName: string | null;
  /** The link the data was fetched from, when it came from one. */
  sourceUrl: string | null;
  rowCount: number | null;
  charts: number;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Limits {
  projects: { used: number; max: number };
  publishedLinks: { used: number; max: number };
}

export interface ProjectDetail {
  id: string;
  title: string;
  spec: DashboardSpec;
  sourceName: string | null;
  sourceUrl: string | null;
  rowCount: number | null;
  updatedAt: string;
  shares: { slug: string; createdAt: string; passwordProtected: boolean }[];
}

/** An API error with the server's message, and `code: "limit_reached"` when a plan cap was hit. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

/** The server sends a sentence for most errors, but an object for a rejected request body: never show that as text. */
export function errorMessage(body: { error?: unknown } | null, status: number): string {
  if (typeof body?.error === "string" && body.error) return body.error;
  return status === 400 || status === 422 ? "The server did not accept this request. Reload the page and try again." : `Request failed (${status})`;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: unknown; code?: string } | null;
    throw new ApiError(errorMessage(body, res.status), res.status, body?.code);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

const send = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

export const projectsApi = {
  list: () => call<{ items: ProjectSummary[]; limits: Limits }>("/api/projects"),
  get: (id: string) => call<ProjectDetail>(`/api/projects/${id}`),
  create: (spec: DashboardSpec, source?: ProjectSource) => call<{ id: string; title: string }>("/api/projects", send("POST", { spec, source })),
  rename: (id: string, title: string) => call<{ ok: true }>(`/api/projects/${id}`, send("PATCH", { title })),
  saveSpec: (id: string, spec: DashboardSpec) => call<{ ok: true }>(`/api/projects/${id}`, send("PATCH", { spec })),
  duplicate: (id: string) => call<{ id: string; title: string }>(`/api/projects/${id}/duplicate`, send("POST")),
  remove: (id: string) => call<void>(`/api/projects/${id}`, send("DELETE")),
  revokeLink: (slug: string) => call<void>(`/api/shares/${slug}`, send("DELETE")),
};
