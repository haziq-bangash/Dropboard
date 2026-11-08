import { describe, expect, it } from "vitest";
import { csvOf, MAX_PASTE_BYTES, PasteError, pastedFile, tableFromHtml } from "../src/lib/paste";

const text = (f: File) => f.text();
const attempt = (fn: () => unknown) => {
  try {
    fn();
    return null;
  } catch (e) {
    return e;
  }
};

describe("cells copied from a spreadsheet", () => {
  it("become a tab-separated file, kept exactly as copied", async () => {
    const copied = "region\trevenue\tdate\nNorth\t120.5\t2024-01-03\nSouth\t98\t2024-01-04\n";
    const file = pastedFile(copied);
    expect(file.name).toBe("Pasted data.tsv");
    expect(await text(file)).toBe(copied);
  });
  it("cope with Windows line endings, a byte-order mark and a blank last line", async () => {
    const file = pastedFile("﻿a\tb\r\n1\t2\r\n3\t4\r\n\r\n");
    expect(file.name).toBe("Pasted data.tsv");
    expect((await text(file)).startsWith("a\tb")).toBe(true);
  });
  it("keep a cell with a comma in it as one cell", async () => {
    expect(pastedFile("name\tnote\nAda\tfirst, second\nBo\tx\n").name).toBe("Pasted data.tsv");
  });
});

describe("text that is already CSV", () => {
  it("is kept as a CSV file, with commas or with semicolons", () => {
    expect(pastedFile("a,b,c\n1,2,3\n4,5,6\n").name).toBe("Pasted data.csv");
    expect(pastedFile("a;b;c\n1;2;3\n4;5;6\n").name).toBe("Pasted data.csv");
  });
});

describe("a table copied from a web page", () => {
  const html = `<html><body><table class="x"><thead><tr><th>Country</th><th>Population &amp; area</th></tr></thead>
    <tbody><tr><td>Chad</td><td>17,000,000<br>1,284,000 km&sup2;</td></tr><tr><td><a href="/x">Peru</a></td><td>&#51;3 &quot;million&quot;</td></tr></tbody></table></body></html>`;

  it("is read from the HTML, because the text alone loses where the cells are", async () => {
    const file = pastedFile("Country Population Chad 17", html);
    expect(file.name).toBe("Pasted table.csv");
    const csv = await text(file);
    expect(csv.split("\n")[0]).toBe("Country,Population & area");
    expect(csv).toContain('Chad,"17,000,000 1,284,000 km&sup2;"');
    // links are read as their text, entities are decoded, quotes are doubled
    expect(csv).toContain('Peru,"33 ""million"""');
  });
  it("reads a cell that spans columns as repeated, so the columns line up", () => {
    const rows = tableFromHtml("<table><tr><th colspan=2>Sales</th><th>Year</th></tr><tr><td>1</td><td>2</td><td>2024</td></tr></table>")!;
    expect(rows).toEqual([["Sales", "Sales", "Year"], ["1", "2", "2024"]]);
  });
  it("ignores scripts, styles and comments inside the table", () => {
    const rows = tableFromHtml("<table><style>td{color:red}</style><!-- note --><tr><th>a</th><th>b</th></tr><tr><td>1<script>alert(1)</script></td><td>2</td></tr></table>")!;
    expect(rows).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("pads a short row, so every row has the same number of cells", () => {
    expect(csvOf([["a", "b", "c"], ["1"]])).toBe("a,b,c\n1,,\n");
  });
  it("takes only a table with a header, a row and more than one column", () => {
    expect(tableFromHtml("<p>no table</p>")).toBeNull();
    expect(tableFromHtml("<table><tr><td>one</td></tr></table>")).toBeNull();
    expect(tableFromHtml("<table><tr><td>a</td></tr><tr><td>b</td></tr></table>")).toBeNull();
  });
  it("falls back to the text when the HTML has no usable table", async () => {
    const file = pastedFile("a\tb\n1\t2\n", "<div>hello</div>");
    expect(file.name).toBe("Pasted data.tsv");
  });
});

describe("what cannot be read", () => {
  it("says what to do when nothing was pasted", () => {
    const e = attempt(() => pastedFile("   \n  "));
    expect(e).toBeInstanceOf(PasteError);
    expect((e as Error).message).toMatch(/Copy some cells/);
  });
  it("says what to do when it is not a table", () => {
    for (const prose of ["just a sentence with no structure", "line one\nline two\nline three", "hello, world"]) {
      const e = attempt(() => pastedFile(prose));
      expect(e, prose).toBeInstanceOf(PasteError);
      expect((e as Error).message).toMatch(/does not look like a table/);
    }
  });
  it("refuses a table whose rows do not line up", () => {
    expect(attempt(() => pastedFile("a\tb\n1\n2\t3\t4\n5\n6\t7\t8\t9\n"))).toBeInstanceOf(PasteError);
  });
  it("refuses more than 10 MB, pointing to a file instead", () => {
    const big = "a\tb\n" + "1\t2\n".repeat(Math.ceil(MAX_PASTE_BYTES / 4) + 10);
    const e = attempt(() => pastedFile(big));
    expect(e).toBeInstanceOf(PasteError);
    expect((e as Error).message).toMatch(/drop the file/);
  });
});
