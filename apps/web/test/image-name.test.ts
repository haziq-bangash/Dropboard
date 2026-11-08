import { describe, expect, it } from "vitest";
import { imageName } from "../src/lib/image-name";

describe("imageName", () => {
  it("makes a plain file name from a chart title", () => {
    expect(imageName("Revenue by region")).toBe("revenue-by-region.png");
    expect(imageName("  Average delivery_minutes over time!  ")).toBe("average-delivery-minutes-over-time.png");
  });
  it("is never empty and never too long", () => {
    expect(imageName("???")).toBe("chart.png");
    expect(imageName("")).toBe("chart.png");
    expect(imageName("a".repeat(200)).length).toBeLessThanOrEqual(64);
  });
});
