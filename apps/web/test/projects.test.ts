import { describe, expect, it } from "vitest";
import { errorMessage } from "../src/lib/projects";

describe("errorMessage", () => {
  it("uses the server's sentence when there is one", () => {
    expect(errorMessage({ error: "Project limit reached" }, 403)).toBe("Project limit reached");
  });
  it("never turns an error object into text", () => {
    const m = errorMessage({ error: { formErrors: [], fieldErrors: { spec: ["bad"] } } }, 400);
    expect(m).not.toContain("object");
    expect(m).toMatch(/did not accept/);
  });
  it("falls back to the status when there is no body", () => {
    expect(errorMessage(null, 500)).toBe("Request failed (500)");
  });
});
