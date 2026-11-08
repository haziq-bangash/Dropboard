import { crc32, deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { XlsxError, xlsxToCsv } from "../src/lib/xlsx-stream";

/** A minimal zip, written by hand so the tests cover what the reader sees: stored or deflated entries, and the data-descriptor variant. */
function zip(files: Record<string, string>, opts: { store?: boolean; descriptor?: boolean } = {}): Blob {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text, "utf8");
    const data = opts.store ? raw : deflateRawSync(raw);
    const nameBuf = Buffer.from(name);
    const flags = opts.descriptor ? 8 : 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(opts.store ? 0 : 8, 8);
    // with a data descriptor the local header carries zeros and the true sizes come after the data
    local.writeUInt32LE(opts.descriptor ? 0 : crc32(raw), 14);
    local.writeUInt32LE(opts.descriptor ? 0 : data.length, 18);
    local.writeUInt32LE(opts.descriptor ? 0 : raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    parts.push(local, nameBuf, data);
    let written = 30 + nameBuf.length + data.length;
    if (opts.descriptor) {
      const d = Buffer.alloc(16);
      d.writeUInt32LE(0x08074b50, 0);
      d.writeUInt32LE(crc32(raw), 4);
      d.writeUInt32LE(data.length, 8);
      d.writeUInt32LE(raw.length, 12);
      parts.push(d);
      written += 16;
    }
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(flags, 8);
    c.writeUInt16LE(opts.store ? 0 : 8, 10);
    c.writeUInt32LE(crc32(raw), 16);
    c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(raw.length, 24);
    c.writeUInt16LE(nameBuf.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, nameBuf);
    offset += written;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Blob([...parts, dir, end]);
}

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

function workbook(sheets: string[], extra = "") {
  return {
    "xl/workbook.xml": `<workbook ${NS}>${extra}<sheets>${sheets.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships>${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="x" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`,
  };
}

const STYLES = `<styleSheet ${NS}><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd\\ hh:mm"/></numFmts><cellXfs count="4"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/><xf numFmtId="2"/></cellXfs></styleSheet>`;

const sheet = (rows: string, dimension = "") => `<worksheet ${NS}>${dimension}<sheetData>${rows}</sheetData><rowBreaks count="1"><brk id="3"/></rowBreaks></worksheet>`;

describe("xlsxToCsv", () => {
  const shared = `<sst ${NS}><si><t>Name</t></si><si><t>Joined</t></si><si><t>Score</t></si><si><t>Active</t></si><si><t>Ann, "A" Lee</t></si><si><r><t>Bo</t></r><r><t xml:space="preserve"> &amp; Co</t></r></si><si><t>line1&#10;line2</t></si></sst>`;
  const rows =
    `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>` +
    `<row r="2"><c r="A2" t="s"><v>4</v></c><c r="B2" s="1"><v>44927</v></c><c r="C2" s="3"><v>12.5</v></c><c r="D2" t="b"><v>1</v></c></row>` +
    // a gap: no B3 or C3, and an inline string and a formula string
    `<row r="3"><c r="A3" t="inlineStr"><is><t>Cy &lt;3</t></is></c><c r="D3" t="b"><v>0</v></c></row>` +
    `<row r="4"><c r="A4" t="s"><v>5</v></c><c r="B4" s="2"><v>44927.5625</v></c><c r="C4"><v>7</v></c></row>` +
    `<row r="5"><c r="A5" t="s"><v>6</v></c><c r="B5" t="str"><v>text date</v></c></row>` +
    // an empty row and a self-closing one are skipped
    `<row r="6"><c r="A6"/></row><row r="7" spans="1:4"/>`;

  const files = (overrides: Record<string, string> = {}) => ({ ...workbook(["Data"]), "xl/styles.xml": STYLES, "xl/sharedStrings.xml": shared, "xl/worksheets/sheet1.xml": sheet(rows, '<dimension ref="A1:D7"/>'), ...overrides });

  it("turns strings, numbers, booleans, dates and gaps into CSV, quoting what needs it", async () => {
    const result = await xlsxToCsv(zip(files()));
    const text = await result.csv.text();
    expect(text).toBe(
      [
        "Name,Joined,Score,Active",
        '"Ann, ""A"" Lee",2023-01-01,12.5,true',
        "Cy <3,,,false",
        "Bo & Co,2023-01-01 13:30:00,7,",
        '"line1\nline2",text date,,',
        "",
      ].join("\n"),
    );
    expect(result.rows).toBe(5);
    expect(result.columns).toBe(4);
  });

  it("reads stored entries, and the variant where sizes come after the data", async () => {
    const a = await (await xlsxToCsv(zip(files(), { store: true }))).csv.text();
    const b = await (await xlsxToCsv(zip(files(), { descriptor: true }))).csv.text();
    const c = await (await xlsxToCsv(zip(files()))).csv.text();
    expect(a).toBe(c);
    expect(b).toBe(c);
  });

  it("counts dates from 1904 when the workbook says so", async () => {
    const wb = workbook(["Data"], '<workbookPr date1904="1"/>');
    const only = sheet(`<row r="1"><c r="A1" t="inlineStr"><is><t>d</t></is></c></row><row r="2"><c r="A2" s="1"><v>43465</v></c></row>`);
    const text = await (await xlsxToCsv(zip({ ...wb, "xl/styles.xml": STYLES, "xl/worksheets/sheet1.xml": only }))).csv.text();
    expect(text).toBe("d\n2023-01-01\n");
  });

  it("skips an empty first sheet and works without styles or shared strings", async () => {
    const wb = workbook(["Empty", "Real"]);
    const real = sheet(`<row r="1"><c r="A1" t="inlineStr"><is><t>x</t></is></c><c r="B1" t="inlineStr"><is><t>y</t></is></c></row><row r="2"><c r="A2"><v>1</v></c><c r="B2"><v>2</v></c></row>`);
    const result = await xlsxToCsv(zip({ ...wb, "xl/worksheets/sheet1.xml": sheet(""), "xl/worksheets/sheet2.xml": real }));
    expect(await result.csv.text()).toBe("x,y\n1,2\n");
  });

  it("makes every row as wide as the sheet, whatever cells a row leaves out, and ignores anything after the data", async () => {
    const r = sheet(`<row r="1"><c r="A1" t="inlineStr"><is><t>a</t></is></c><c r="C1" t="inlineStr"><is><t>c</t></is></c></row><row r="2"><c r="B2"><v>5</v></c></row><row r="3"><c r="A3"><v>1</v></c><c r="C3"><v>3</v></c><c r="E3"><v>9</v></c></row>`, '<dimension ref="A1:C3"/>');
    const result = await xlsxToCsv(zip({ ...workbook(["S"]), "xl/worksheets/sheet1.xml": r }));
    expect(await result.csv.text()).toBe("a,,c\n,5,\n1,,3\n");
  });

  it("refuses what is not a spreadsheet, and an empty one, with a clear error", async () => {
    await expect(xlsxToCsv(new Blob(["just some text, not a zip file at all"]))).rejects.toBeInstanceOf(XlsxError);
    await expect(xlsxToCsv(zip({ ...workbook(["S"]), "xl/worksheets/sheet1.xml": sheet("") }))).rejects.toThrow(/empty/);
  });

  it("turns away a sheet that would unpack to more than the limit, before reading it", async () => {
    const r = sheet(`<row r="1"><c r="A1"><v>1</v></c></row>`);
    await expect(xlsxToCsv(zip({ ...workbook(["S"]), "xl/worksheets/sheet1.xml": r }), undefined, { maxSheetBytes: 50 })).rejects.toThrow(/more than can be read in a browser/);
  });

  it("handles a big sheet in pieces, reporting progress", async () => {
    const n = 200_000;
    let body = `<row r="1"><c r="A1" t="inlineStr"><is><t>id</t></is></c><c r="B1" t="inlineStr"><is><t>v</t></is></c></row>`;
    for (let i = 2; i <= n + 1; i++) body += `<row r="${i}"><c r="A${i}"><v>${i - 1}</v></c><c r="B${i}"><v>${(i * 7) % 1000}</v></c></row>`;
    const seen: number[] = [];
    const result = await xlsxToCsv(zip({ ...workbook(["Big"]), "xl/worksheets/sheet1.xml": sheet(body) }), (f) => seen.push(f));
    expect(result.rows).toBe(n + 1);
    const lines = (await result.csv.text()).split("\n");
    expect(lines[0]).toBe("id,v");
    expect(lines[n]).toBe(`${n},${((n + 1) * 7) % 1000}`);
    expect(seen.at(-1)).toBe(1);
    expect(seen.every((f, i) => i === 0 || f >= seen[i - 1])).toBe(true);
  }, 60_000);
});
