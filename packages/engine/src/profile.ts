import type { ColumnType } from "@dropboard/spec";

export type ColType = ColumnType;

export interface ColumnProfile {
  name: string;
  type: ColType;
  nullCount: number;
  distinct: number;
  /** For a number column: the smallest and largest value, and whether every value is a whole number. */
  min?: number;
  max?: number;
  integer?: boolean;
  /** For a text column with many values: the average length, from a sample. Long text is notes, not a category. */
  textLength?: number;
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
  /** Set when the table is one row per entity per period (a company by year): which columns, found by testing that they identify a row. */
  panel?: { entity: string; time: string };
  /** Set when the file was too big to hold, so the table is a random sample: how many rows it holds, and how many the file has. */
  sample?: { rows: number; of: number };
  /** A column of cities, when there is one (needs a column name that points at places, and the city list) */
  cities?: string;
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
