import type { ColumnType } from "@dropboard/spec";

export type ColType = ColumnType;

export interface ColumnProfile {
  name: string;
  type: ColType;
  nullCount: number;
  distinct: number;
}

export interface TableProfile {
  rowCount: number;
  columns: ColumnProfile[];
  /** A latitude and longitude pair found in the columns, when there is one */
  coordinates?: { lat: string; lon: string };
  /** A column of countries, when there is one. Other kinds of place are recognised but not drawn yet. */
  countries?: string;
  /** A column of US states (names or abbreviations), when there is one */
  states?: string;
}

/** Map a DuckDB type name (e.g. "BIGINT", "DECIMAL(18,3)", "TIMESTAMP WITH TIME ZONE") to our simple types. */
export function mapDuckDbType(duckType: string): ColType {
  const t = duckType.toUpperCase();
  if (t === "BOOLEAN") return "boolean";
  if (t === "DATE" || t.startsWith("TIMESTAMP")) return "date";
  if (/^(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|UHUGEINT|FLOAT|DOUBLE|REAL|DECIMAL)/.test(t)) {
    return "number";
  }
  return "string";
}

/** Quote an identifier for DuckDB SQL. */
export const q = (name: string) => `"${name.replace(/"/g, '""')}"`;
