export type CellKind = "date" | "timestamp" | "decimal" | null;

/** Classify an Arrow column type (as printed by Arrow, e.g. "Date32<DAY>", "Timestamp<MICROSECOND>", "Decimal[38e+0]"). */
export function cellKind(arrowType: string): CellKind {
  if (arrowType.startsWith("Date")) return "date";
  if (arrowType.startsWith("Timestamp")) return "timestamp";
  if (arrowType.startsWith("Decimal")) return "decimal";
  return null;
}

/**
 * Turn a value from DuckDB-WASM into something a person (and a chart) can use:
 * dates become ISO strings instead of epoch milliseconds, DECIMAL and HUGEINT (what sum() returns) become numbers.
 */
export function normalizeCell(kind: CellKind, v: unknown): unknown {
  if (v === null || v === undefined) return null;
  switch (kind) {
    case "date":
      return typeof v === "number" || typeof v === "bigint" ? new Date(Number(v)).toISOString().slice(0, 10) : v;
    case "timestamp":
      return typeof v === "number" || typeof v === "bigint" ? new Date(Number(v)).toISOString() : v;
    case "decimal": {
      const n = Number(String(v));
      return Number.isFinite(n) ? n : v;
    }
    default:
      return typeof v === "bigint" ? Number(v) : v;
  }
}
