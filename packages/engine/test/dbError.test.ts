import { describe, expect, it } from "vitest";
import { scrubDbError } from "../src/dbError";

describe("scrubDbError", () => {
  it("blanks quoted values but keeps known column names", () => {
    const out = scrubDbError(`Conversion Error: Could not convert string "Jane Doe" to 'INT32' in column "age"`, ["age"]);
    expect(out).toBe(`Conversion Error: Could not convert string "?" to '?' in column "age"`);
    expect(out).not.toContain("Jane");
  });
  it("blanks a quoted value that only looks like a column name when it is not one", () => {
    expect(scrubDbError(`Could not convert string "secret" to INT`, ["age"])).not.toContain("secret");
  });
  it("drops the echoed query lines and caps the length", () => {
    const msg = `Binder Error: Referenced column "x" not found\nLINE 1: SELECT x FROM data\n        ^\n` + "a".repeat(1000);
    const out = scrubDbError(msg, []);
    expect(out).not.toContain("LINE 1");
    expect(out.length).toBeLessThanOrEqual(400);
  });
});
