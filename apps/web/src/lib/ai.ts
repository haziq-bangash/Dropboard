import { bindQuery, guardSql, mapDuckDbType, scrubDbError, type TableProfile } from "@dropboard/engine";
import type { AiTable, DashboardSpec } from "@dropboard/spec";
import { ASSISTANT } from "./brand";
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
        ? `Sign in to use ${ASSISTANT}.`
        : res.status === 429
          ? `You have used today's ${ASSISTANT} requests. Try again tomorrow.`
          : res.status === 503
            ? `${ASSISTANT} is not available yet.`
            : res.status === 422
              ? `${ASSISTANT} can't help with that request.`
              : res.status === 502
                ? `${ASSISTANT} couldn't produce a usable result. Try rephrasing.`
                : (data.error ?? `Request failed (${res.status})`);
    throw new AiError(message, res.status);
  }
  return data as T;
}

/**
 * Check every designed chart against the real table before showing it. A chart whose SQL does not run is dropped. One that
 * runs but names its output columns differently from what the renderer reads (a headline number called `total_revenue`
 * instead of `value`) is repaired by renaming, instead of being shown blank.
 */
export async function keepRunnable(spec: DashboardSpec): Promise<{ spec: DashboardSpec; removed: number; repaired: number }> {
  const checked = await Promise.all(
    spec.charts.map(async (chart) => {
      const guarded = guardSql(chart.query);
      if (!guarded.ok) return null;
      try {
        // what the query really returns, without running it over the data
        const described = await runQuery(`DESCRIBE SELECT * FROM (${chart.query}) LIMIT 0`);
        const columns = described.map((r) => ({ name: String(r.column_name), type: mapDuckDbType(String(r.column_type)) }));
        const bound = bindQuery(chart.type, chart.query, columns);
        if (bound === null) return null;
        if (bound === chart.query) return { chart, repaired: false };
        if (!guardSql(bound).ok) return null;
        await runQuery(`SELECT * FROM (${bound}) LIMIT 0`);
        return { chart: { ...chart, query: bound }, repaired: true };
      } catch {
        return null;
      }
    }),
  );
  const kept = checked.filter((c): c is NonNullable<typeof c> => c !== null);
  if (kept.length === 0) throw new AiError(`${ASSISTANT} suggested charts that do not fit your columns. Try rephrasing.`, 502);
  return {
    spec: { ...spec, charts: kept.map((c) => c.chart) },
    removed: spec.charts.length - kept.length,
    repaired: kept.filter((c) => c.repaired).length,
  };
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
  if (!guarded.ok) throw new AiError(`${ASSISTANT} returned an unsafe query and it was not run.`, 502);
  try {
    const rows = await runQuery(guarded.sql);
    return { sql: res.sql, explanation: res.explanation, rows: rows.slice(0, 100), remaining: res.remaining, repaired: false };
  } catch (first) {
    // One retry: the database error goes back to the model with every quoted value removed. Rows are never sent.
    const failed = new AiError(`${ASSISTANT}'s query did not work on your data. Try rephrasing.`, 502);
    if (res.remaining <= 0) throw failed;
    let fixed: { sql: string; explanation: string; remaining: number };
    try {
      fixed = await post<typeof fixed>("/api/ai/repair", {
        table,
        question,
        sql: res.sql,
        error: scrubDbError(first instanceof Error ? first.message : String(first), table.columns.map((c) => c.name)) || "The query failed.",
      });
    } catch {
      throw failed;
    }
    const again = guardSql(fixed.sql);
    if (!again.ok) throw failed;
    try {
      const rows = await runQuery(again.sql);
      return { sql: fixed.sql, explanation: fixed.explanation, rows: rows.slice(0, 100), remaining: fixed.remaining, repaired: true };
    } catch {
      throw failed;
    }
  }
}
