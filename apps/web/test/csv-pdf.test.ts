import { describe, expect, it } from "vitest";
import { rowsToCsv } from "../src/lib/csv";
import { pdfFromJpeg } from "../src/lib/pdf";

describe("a chart's rows as CSV", () => {
  it("writes a header and a row per line, and quotes what needs it", () => {
    const csv = rowsToCsv([{ region: "North, East", note: 'say "hi"', n: 1.5 }, { region: "West", note: "line\nbreak", n: -2 }]);
    expect(csv).toBe('﻿region,note,n\r\n"North, East","say ""hi""",1.5\r\nWest,"line\nbreak",-2\r\n');
  });
  it("writes empty cells for nothing, and dates as dates", () => {
    expect(rowsToCsv([{ a: null, b: undefined, c: new Date("2024-03-05T10:00:00Z"), d: Number.NaN }])).toBe("﻿a,b,c,d\r\n,,2024-03-05,\r\n");
  });
  it("turns text that a spreadsheet would run as a formula into plain text", () => {
    const csv = rowsToCsv([{ x: '=HYPERLINK("http://evil.test")' }, { x: "+1+1" }, { x: "@SUM(A1)" }, { x: "-cmd" }, { x: "\tx" }]);
    const lines = csv.split("\r\n").slice(1, 6);
    // a cell with a quote or a line break is wrapped in quotes, so look past that
    for (const line of lines) expect(line.replace(/^"/, "").startsWith("'"), line).toBe(true);
  });
  it("leaves numbers alone, whether they are numbers or text that is a number", () => {
    expect(rowsToCsv([{ a: -12.5, b: "-12.5", c: "+3", d: "ordinary" }])).toBe("﻿a,b,c,d\r\n-12.5,-12.5,+3,ordinary\r\n");
  });
  it("gives just the byte-order mark for no rows", () => {
    expect(rowsToCsv([])).toBe("﻿");
  });
});

describe("a picture as a one-page PDF", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 0xff, 0xd9]);
  const pdf = pdfFromJpeg(jpeg, 2160, 4800, "Support (tickets)");
  const text = new TextDecoder("latin1").decode(pdf);

  it("is a PDF, with the picture inside as it was", () => {
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain("/Filter /DCTDecode");
    expect(text).toContain("/Width 2160 /Height 4800");
    const at = text.indexOf("stream\n", text.indexOf("/DCTDecode")) + "stream\n".length;
    expect([...pdf.subarray(at, at + jpeg.length)]).toEqual([...jpeg]);
  });
  it("has one page as wide as A4 and as tall as the picture needs", () => {
    expect(text).toContain("/MediaBox [0 0 595 1322]");
    expect(text).toContain("/Count 1");
  });
  it("keeps its table of positions right, so a reader can find every object", () => {
    const start = Number(text.match(/startxref\n(\d+)/)![1]);
    expect(text.slice(start, start + 4)).toBe("xref");
    const entries = [...text.slice(start).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
    expect(entries).toHaveLength(6);
    entries.forEach((offset, i) => expect(text.slice(offset, offset + 8)).toBe(`${i + 1} 0 obj\n`));
  });
  it("cleans the title, so it cannot break the file", () => {
    expect(text).toContain("/Title (Support  tickets )");
    expect(pdfFromJpeg(jpeg, 10, 10, "a)(\\b").length).toBeGreaterThan(100);
  });
  it("cuts a very tall picture down to the largest page, without stretching it", () => {
    const tall = new TextDecoder("latin1").decode(pdfFromJpeg(jpeg, 100, 100_000));
    expect(tall).toContain("/MediaBox [0 0 595 14400]");
    const draw = tall.match(/q ([\d.]+) 0 0 14400 /)!;
    expect(Number(draw[1])).toBeLessThan(595);
  });
});
