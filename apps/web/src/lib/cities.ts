import { createCityIndex, type CityIndex, type CityRow } from "@dropboard/engine";

let loaded: Promise<CityIndex> | null = null;

/** The city list (Natural Earth, public domain), fetched once and only when a table might have cities. */
export function loadCities(): Promise<CityIndex> {
  loaded ??= fetch("/geo/cities.json").then(async (res) => {
    if (!res.ok) throw new Error("Could not load the city list.");
    return createCityIndex((await res.json()) as CityRow[]);
  });
  // a failed fetch is not remembered, so the next try can succeed
  loaded.catch(() => (loaded = null));
  return loaded;
}
