import { readFileSync } from "node:fs";
import { createCityIndex, type CityRow } from "@dropboard/engine";
import { describe, expect, it } from "vitest";

describe("the bundled list", () => {
  const list = JSON.parse(readFileSync(new URL("../../web/public/geo/cities.json", import.meta.url), "utf8")) as CityRow[];
  const real = createCityIndex(list);
  it("holds thousands of places, with valid coordinates and country codes", () => {
    expect(list.length).toBeGreaterThan(3000);
    for (const [name, , country, lat, lon] of list) {
      expect(name.length).toBeGreaterThan(0);
      expect(country).toMatch(/^([A-Z]{2})?$/);
      expect(Math.abs(lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(lon)).toBeLessThanOrEqual(180);
    }
  });
  it("finds the cities a business file is likely to hold", () => {
    for (const [name, country] of [["London", "GB"], ["New York", "US"], ["Tokyo", "JP"], ["Berlin", "DE"], ["Mumbai", "IN"], ["Lagos", "NG"], ["Toronto", "CA"], ["Sydney", "AU"]]) {
      expect(real.find(name)?.country, name).toBe(country);
    }
  });
});

