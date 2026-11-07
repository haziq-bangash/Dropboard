import { guardSql, type TableProfile } from "@dropboard/engine";
import type { AiTable, DashboardSpec } from "@dropboard/spec";
import { runQuery } from "./duckdb";
import type { Rows } from "./results";

export class AiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Schema and stats only. Row values are never sent. */
export function toAiTable(profile: TableProfile): AiTable {
  return {
    rowCount: profile.rowCount,
    columns: profile.columns.map((c) => ({ name: c.name, type: c.type, nullCount: c.nullCount, distinct: c.distinct })),
  };
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    const message =
      res.status === 401
        ? "Sign in to use AI."
        : res.status === 429
          ? "You have used today's AI requests. Try again tomorrow."
          : res.status === 503
            ? "AI is not available yet."
            : (data.error ?? `Request failed (${res.status})`);
    throw new AiError(message, res.status);
  }
  return data as T;
}

/** Drop charts that do not bind to the real table (wrong column names etc.) before showing them. */
export async function keepRunnable(spec: DashboardSpec): Promise<{ spec: DashboardSpec; removed: number }> {
  const checks = await Promise.all(
    spec.charts.map(async (chart) => {
      const guarded = guardSql(chart.query);
      if (!guarded.ok) return false;
      try {
        await runQuery(`SELECT * FROM (${chart.query}) LIMIT 0`);
        return true;
      } catch {
        return false;
      }
    }),
  );
  const charts = spec.charts.filter((_, i) => checks[i]);
  if (charts.length === 0) throw new AiError("The AI suggested charts that do not fit your columns. Try rephrasing.", 502);
  return { spec: { ...spec, charts }, removed: spec.charts.length - charts.length };
}

export async function generateDashboard(table: AiTable, instruction: string, current?: DashboardSpec) {
  const res = await post<{ spec: DashboardSpec; cached: boolean; remaining: number }>("/api/ai/generate", {
    table,
    instruction: instruction.trim() || undefined,
    current,
  });
  const checked = await keepRunnable(res.spec);
  return { ...checked, cached: res.cached, remaining: res.remaining };
}

export async function askQuestion(table: AiTable, question: string) {
  const res = await post<{ sql: string; explanation: string; remaining: number }>("/api/ai/ask", { table, question });
  const guarded = guardSql(res.sql);
  if (!guarded.ok) throw new AiError("The AI returned an unsafe query and it was not run.", 502);
  let rows: Rows;
  try {
    rows = await runQuery(guarded.sql);
  } catch {
    throw new AiError("The AI's query did not work on your data. Try rephrasing.", 502);
  }
  return { sql: res.sql, explanation: res.explanation, rows: rows.slice(0, 100), remaining: res.remaining };
}
