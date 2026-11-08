const FORBIDDEN =
  /\b(insert|update|delete|drop|alter|create|attach|detach|copy|export|import|install|load|pragma|call|set|truncate|read_csv|read_parquet|read_json|glob|http|httpfs)\b/i;

export type GuardResult = { ok: true; sql: string } | { ok: false; reason: string };

/**
 * Some models escape their answer twice, so a query comes back with the two characters backslash and n where a line
 * break belongs, which does not parse. When a query has no real line break but does contain those escapes, they are
 * turned into spaces. A query that already has real line breaks is left exactly as it is.
 */
export function tidySql(input: string): string {
  if (input.includes("\n") || !/\\[nrt]/.test(input)) return input;
  return input.replace(/\\[nrt]/g, " ");
}

/** Allow a single read-only SELECT/WITH statement. AI-generated and user SQL must pass through this before running. */
export function guardSql(input: string, maxLimit = 10_000): GuardResult {
  // tidied first, so every check below sees the query that would actually run
  const sql = tidySql(input).trim().replace(/;+\s*$/, "");
  if (!sql) return { ok: false, reason: "empty query" };
  if (sql.includes(";")) return { ok: false, reason: "multiple statements" };
  if (/--|\/\*/.test(sql)) return { ok: false, reason: "comments not allowed" };
  if (!/^(select|with)\b/i.test(sql)) return { ok: false, reason: "only SELECT is allowed" };
  if (FORBIDDEN.test(sql)) return { ok: false, reason: "forbidden keyword" };
  return { ok: true, sql: `SELECT * FROM (${sql}) LIMIT ${maxLimit}` };
}
