import { describe, expect, it } from "vitest";
import { countryCode, detectCoordinates, detectPlaceColumn, usStateCode } from "../src/places";

describe("countryCode and usStateCode", () => {
  it("reads names, codes and common spellings, ignoring case and spacing", () => {
    expect(countryCode("Germany")).toBe("DE");
    expect(countryCode("  germany ")).toBe("DE");
    expect(countryCode("DEU")).toBe("DE");
    expect(countryCode("UK")).toBe("GB");
    expect(countryCode("United States of America")).toBe("US");
    expect(countryCode("Atlantis")).toBeNull();
    expect(countryCode(42)).toBeNull();
    expect(usStateCode("texas")).toBe("TX");
    expect(usStateCode("NY")).toBe("NY");
    expect(usStateCode("District of Columbia")).toBe("DC");
    expect(usStateCode("Bavaria")).toBeNull();
  });
});

describe("detectPlaceColumn", () => {
  it("finds a country column, with the share that matched", () => {
    const m = detectPlaceColumn("country", ["France", "Spain", "Italy", "Peru", "Narnia"], 5);
    expect(m).toEqual({ column: "country", kind: "country", confidence: 0.8 });
  });
  it("finds a column of US states by name or abbreviation", () => {
    expect(detectPlaceColumn("state", ["Texas", "Ohio", "CA", "NY"], 4)?.kind).toBe("us-state");
  });
  it("tells state codes from country codes by which they match", () => {
    expect(detectPlaceColumn("st", ["CA", "NY", "TX", "WA"], 4)?.kind).toBe("us-state");
    expect(detectPlaceColumn("c", ["DE", "FR", "ES", "IT"], 4)?.kind).toBe("country");
  });
  it("ignores free text, mostly unmatched columns, and columns with one value or too many", () => {
    expect(detectPlaceColumn("notes", ["hello", "world", "France"], 3)).toBeNull();
    expect(detectPlaceColumn("c", ["France", "France"], 1)).toBeNull();
    expect(detectPlaceColumn("c", ["France", "Spain"], 5000)).toBeNull();
    expect(detectPlaceColumn("c", [null, "", undefined], 3)).toBeNull();
  });
});

describe("detectCoordinates", () => {
  it("pairs latitude and longitude by name when the ranges fit", () => {
    expect(detectCoordinates({ id: { min: 1, max: 900 }, lat: { min: 40.1, max: 41.2 }, lng: { min: -74.2, max: -73.7 } })).toEqual({ lat: "lat", lon: "lng", confidence: 0.95 });
    expect(detectCoordinates({ Latitude: { min: -33, max: 51 }, Longitude: { min: -120, max: 151 } })?.lon).toBe("Longitude");
  });
  it("rejects a name whose values do not fit, and an unfilled pair", () => {
    expect(detectCoordinates({ lat: { min: 0, max: 5000 }, lon: { min: 0, max: 10 } })).toBeNull();
    expect(detectCoordinates({ lat: { min: 0, max: 0 }, lon: { min: 0, max: 0 } })).toBeNull();
  });
  it("never guesses from ranges alone", () => {
    expect(detectCoordinates({ a: { min: 1, max: 9 }, b: { min: 2, max: 8 } })).toBeNull();
  });
  it("needs both halves", () => {
    expect(detectCoordinates({ lat: { min: 10, max: 20 } })).toBeNull();
  });
});
