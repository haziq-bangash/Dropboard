/**
 * Finding a city from its name. The list comes from Natural Earth (public domain): about four thousand places of fifty
 * thousand people or more, each as [name, local name, country code, latitude, longitude], biggest first. It is loaded by the
 * browser only when a table has a column that might be cities, and no name ever leaves the browser.
 */

export type CityRow = [name: string, localName: string, country: string, lat: number, lon: number];

export interface City {
  name: string;
  country: string;
  lat: number;
  lon: number;
}

export interface CityIndex {
  /** The biggest city with this name, or null. Spelling, accents, case and a trailing ", region" are ignored. */
  find(value: unknown): City | null;
  size: number;
}

/** A name written the way the index stores it: lower case, no accents or punctuation, only what comes before a comma. */
export function normalizePlace(value: string): string {
  return value
    .split(",")[0]
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function createCityIndex(rows: CityRow[]): CityIndex {
  const byName = new Map<string, City>();
  for (const [name, local, country, lat, lon] of rows) {
    const city = { name, country, lat, lon };
    // rows are biggest first, so the first city with a name is the one people most likely mean
    for (const key of [normalizePlace(name), local ? normalizePlace(local) : ""]) if (key && !byName.has(key)) byName.set(key, city);
  }
  return {
    size: byName.size,
    find: (value) => (typeof value === "string" && value.trim() !== "" ? (byName.get(normalizePlace(value)) ?? null) : null),
  };
}

/** Column names that say the values are places. Two-word city names are common, so values alone are not enough to call a column cities. */
export const CITY_NAME_HINT = /(^|[^a-z])(city|cities|town|municipality|metro|location|place|destination|origin|ville|stadt|ciudad)([^a-z]|$)/i;

/** Most different values a column of cities can have and still be mapped. */
export const MAX_CITIES = 2000;

/** Smallest share of the values that must be known cities. */
const MIN_SHARE = 0.8;

/**
 * Is this text column made of cities? Needs a column name that points at places and at least four fifths of the values
 * to be cities in the list. The values are the column's distinct values, so a repeated city counts once.
 */
export function detectCityColumn(column: string, values: unknown[], distinct: number, index: CityIndex): { column: string; confidence: number } | null {
  if (distinct < 2 || distinct > MAX_CITIES || !CITY_NAME_HINT.test(column)) return null;
  const present = values.filter((v) => typeof v === "string" && v.trim() !== "");
  if (present.length === 0) return null;
  const share = present.filter((v) => index.find(v) !== null).length / present.length;
  return share >= MIN_SHARE ? { column, confidence: Math.round(share * 100) / 100 } : null;
}
