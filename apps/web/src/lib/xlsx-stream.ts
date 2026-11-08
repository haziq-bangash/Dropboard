/**
 * Read an .xlsx file into CSV without holding the workbook in memory.
 *
 * A spreadsheet is a zip of XML files. Libraries that read it whole turn every cell into a JavaScript object, which for a
 * million rows takes gigabytes and can crash the tab. This reads the zip's directory, then streams each file it needs
 * through the browser's own decompressor and turns rows into CSV as they go past, keeping only the shared strings
 * (usually small) and the output, which is written out in pieces the browser can keep off the JavaScript heap.
 */

export class XlsxError extends Error {}

interface Entry {
  name: string;
  method: number;
  compressed: number;
  size: number;
  offset: number;
}

const u16 = (v: DataView, at: number) => v.getUint16(at, true);
const u32 = (v: DataView, at: number) => v.getUint32(at, true);

async function bytes(blob: Blob): Promise<DataView> {
  return new DataView(await blob.arrayBuffer());
}

/** The files in the zip, from its central directory (which is at the end, and always has the true sizes). */
async function listEntries(file: Blob): Promise<Map<string, Entry>> {
  const tailSize = Math.min(file.size, 65_557);
  const tail = await bytes(file.slice(file.size - tailSize));
  let end = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (u32(tail, i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new XlsxError("This does not look like an .xlsx file.");
  const count = u16(tail, end + 10);
  const dirSize = u32(tail, end + 12);
  const dirOffset = u32(tail, end + 16);
  if (count === 0xffff || dirSize === 0xffffffff || dirOffset === 0xffffffff) throw new XlsxError("This spreadsheet uses a zip format that is not supported.");

  const dir = await bytes(file.slice(dirOffset, dirOffset + dirSize));
  const names = new TextDecoder();
  const entries = new Map<string, Entry>();
  let at = 0;
  for (let i = 0; i < count && at + 46 <= dir.byteLength; i++) {
    if (u32(dir, at) !== 0x02014b50) throw new XlsxError("The spreadsheet's file list is damaged.");
    const nameLength = u16(dir, at + 28);
    const name = names.decode(new Uint8Array(dir.buffer, dir.byteOffset + at + 46, nameLength));
    entries.set(name, { name, method: u16(dir, at + 10), compressed: u32(dir, at + 20), size: u32(dir, at + 24), offset: u32(dir, at + 42) });
    at += 46 + nameLength + u16(dir, at + 30) + u16(dir, at + 32);
  }
  return entries;
}

/** The decompressed text of one file in the zip, a piece at a time. */
async function* textOf(file: Blob, entry: Entry, onBytes?: (n: number) => void): AsyncGenerator<string> {
  const head = await bytes(file.slice(entry.offset, entry.offset + 30));
  if (u32(head, 0) !== 0x04034b50) throw new XlsxError("The spreadsheet's file list is damaged.");
  const start = entry.offset + 30 + u16(head, 26) + u16(head, 28);
  let stream: ReadableStream<Uint8Array> = file.slice(start, start + entry.compressed).stream();
  if (entry.method === 8) stream = stream.pipeThrough(new DecompressionStream("deflate-raw") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  else if (entry.method !== 0) throw new XlsxError("This spreadsheet is compressed in a way that is not supported.");
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onBytes?.(value.byteLength);
    yield decoder.decode(value, { stream: true });
  }
  const rest = decoder.decode();
  if (rest) yield rest;
}

async function whole(file: Blob, entry: Entry | undefined): Promise<string> {
  if (!entry) return "";
  let out = "";
  for await (const piece of textOf(file, entry)) out += piece;
  return out;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
/** Text out of XML: the five named entities, numeric ones, and the _x000D_ escapes spreadsheets use for control characters. */
function unescapeXml(s: string): string {
  if (!s.includes("&") && !s.includes("_x")) return s;
  return s
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/_x([0-9a-f]{4})_/gi, (_m, h: string) => String.fromCharCode(parseInt(h, 16)));
}

const attr = (tag: string, name: string): string | undefined => {
  const m = new RegExp(`(?:^|[\\s<])${name}="([^"]*)"`).exec(tag);
  return m ? unescapeXml(m[1]) : undefined;
};

/** The text of every <si> in sharedStrings.xml, in order. */
async function readSharedStrings(file: Blob, entry: Entry | undefined): Promise<string[]> {
  const out: string[] = [];
  if (!entry) return out;
  let buffer = "";
  const flush = (final: boolean) => {
    for (;;) {
      const start = buffer.indexOf("<si");
      if (start < 0) {
        if (final) buffer = "";
        else buffer = buffer.slice(Math.max(0, buffer.length - 3));
        return;
      }
      // an empty <si/> is an empty string
      const open = buffer.indexOf(">", start);
      if (open < 0) {
        buffer = buffer.slice(start);
        return;
      }
      if (buffer[open - 1] === "/") {
        out.push("");
        buffer = buffer.slice(open + 1);
        continue;
      }
      const close = buffer.indexOf("</si>", open);
      if (close < 0) {
        buffer = buffer.slice(start);
        return;
      }
      const item = buffer.slice(open + 1, close).replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
      let text = "";
      for (const m of item.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) text += m[1];
      out.push(unescapeXml(text));
      buffer = buffer.slice(close + 5);
    }
  };
  for await (const piece of textOf(file, entry)) {
    buffer += piece;
    flush(false);
  }
  flush(true);
  return out;
}

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

/** For each cell style, does it show a date or a time? Only these numbers are turned into dates. */
function dateStyles(styles: string): boolean[] {
  const custom = new Map<number, string>();
  for (const m of styles.matchAll(/<numFmt\b[^>]*>/g)) {
    const id = Number(attr(m[0], "numFmtId"));
    const code = attr(m[0], "formatCode");
    if (Number.isFinite(id) && code !== undefined) custom.set(id, code);
  }
  const looksLikeDate = (code: string) => /[dmyhs]/i.test(code.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "").replace(/\\./g, ""));
  const block = /<cellXfs\b[\s\S]*?<\/cellXfs>/.exec(styles)?.[0] ?? "";
  const out: boolean[] = [];
  for (const m of block.matchAll(/<xf\b[^>]*>/g)) {
    const id = Number(attr(m[0], "numFmtId") ?? 0);
    out.push(BUILTIN_DATE_FORMATS.has(id) || (custom.has(id) && looksLikeDate(custom.get(id)!)));
  }
  return out;
}

/** A spreadsheet date number (days since 1899-12-30, or 1904-01-01) as text a database reads as a date. */
function dateText(serial: number, system1904: boolean): string {
  const ms = Math.round((serial - (system1904 ? 24107 : 25569)) * 86_400_000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return String(serial);
  const iso = d.toISOString();
  return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso.slice(0, 19).replace("T", " ");
}

const csvCell = (s: string) => (/[",\n\r]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

function columnIndex(ref: string): number {
  let n = 0;
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

/** The sheets in workbook order, each with the path of its XML file, plus whether dates count from 1904. */
async function listSheets(file: Blob, entries: Map<string, Entry>): Promise<{ sheets: { name: string; path: string }[]; system1904: boolean }> {
  const workbook = await whole(file, entries.get("xl/workbook.xml"));
  const rels = await whole(file, entries.get("xl/_rels/workbook.xml.rels"));
  const targets = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], "Id");
    const target = attr(m[0], "Target");
    if (id && target) targets.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`);
  }
  const sheets: { name: string; path: string }[] = [];
  for (const m of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const id = attr(m[0], "r:id");
    const path = id ? targets.get(id) : undefined;
    if (path && entries.has(path)) sheets.push({ name: attr(m[0], "name") ?? "Sheet", path });
  }
  if (!sheets.length) {
    // some writers leave the workbook map out: fall back to the sheet files themselves, in name order
    for (const name of [...entries.keys()].filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) sheets.push({ name, path: name });
  }
  return { sheets, system1904: /<workbookPr\b[^>]*date1904="(1|true)"/.test(workbook) };
}

const FLUSH_CHARS = 4_000_000;
/** The most a sheet may unpack to. A million rows of five columns is about 250 MB of XML, so this is several million rows. */
const MAX_SHEET_BYTES = 1_500_000_000;

export interface XlsxResult {
  csv: Blob;
  rows: number;
  columns: number;
}

/**
 * Turn the first sheet that has data into CSV. `onProgress` gets a fraction from 0 to 1 as the sheet is read. The CSV comes back as a Blob
 * that the browser can store outside the JavaScript heap, so even a very large sheet does not need that much memory.
 */
export async function xlsxToCsv(file: Blob, onProgress?: (fraction: number) => void, options: { maxSheetBytes?: number } = {}): Promise<XlsxResult> {
  const entries = await listEntries(file);
  const { sheets, system1904 } = await listSheets(file, entries);
  if (!sheets.length) throw new XlsxError("The spreadsheet has no sheets.");
  const shared = await readSharedStrings(file, entries.get("xl/sharedStrings.xml"));
  const isDate = dateStyles(await whole(file, entries.get("xl/styles.xml")));

  for (const sheet of sheets) {
    const entry = entries.get(sheet.path)!;
    // a sheet this big would take many minutes to read and more room than a browser has: say so before starting
    if (entry.size > (options.maxSheetBytes ?? MAX_SHEET_BYTES)) {
      throw new XlsxError(`This spreadsheet's sheet holds about ${Math.round(entry.size / 1e6).toLocaleString()} MB of data once unpacked, which is more than can be read in a browser.`);
    }
    const out: Blob[] = [];
    let pending = "";
    let rows = 0;
    let width = 0;
    let read = 0;
    let lastYield = Date.now();
    const total = Math.max(1, entry.size);

    const emit = (line: string) => {
      pending += line + "\n";
      if (pending.length >= FLUSH_CHARS) {
        out.push(new Blob([pending]));
        pending = "";
      }
    };

    const row = (xml: string) => {
      const cells: string[] = [];
      for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const tag = m[1];
        const body = m[2] ?? "";
        const ref = attr(tag, "r");
        const at = ref ? columnIndex(ref) : cells.length;
        const type = attr(tag, "t");
        const style = Number(attr(tag, "s") ?? 0);
        let text = "";
        if (type === "inlineStr") {
          for (const t of body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) text += unescapeXml(t[1]);
        } else {
          const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
          if (v !== undefined) {
            if (type === "s") text = shared[Number(v)] ?? "";
            else if (type === "str" || type === "d") text = unescapeXml(v);
            else if (type === "b") text = v === "1" ? "true" : "false";
            else if (type === "e") text = "";
            else {
              const n = Number(v);
              text = isDate[style] && Number.isFinite(n) ? dateText(n, system1904) : v;
            }
          }
        }
        while (cells.length < at) cells.push("");
        cells[at] = text;
      }
      if (!cells.some((c) => c !== "")) return;
      if (width === 0) width = Math.max(cells.length, dimensionWidth);
      if (cells.length > width) cells.length = width;
      while (cells.length < width) cells.push("");
      emit(cells.map(csvCell).join(","));
      rows++;
    };

    let dimensionWidth = 0;
    let buffer = "";
    let inData = false;
    let finished = false;
    for await (const piece of textOf(file, entry, (n) => {
      read += n;
    })) {
      buffer += piece;
      if (!inData) {
        const start = buffer.indexOf("<sheetData");
        const dim = /<dimension\b[^>]*ref="[A-Z]+\d+:([A-Z]+)\d+"/.exec(buffer);
        if (dim) dimensionWidth = columnIndex(dim[1]) + 1;
        if (start < 0) {
          buffer = buffer.slice(Math.max(0, buffer.length - 1000));
          continue;
        }
        const open = buffer.indexOf(">", start);
        if (open < 0) continue;
        buffer = buffer.slice(open + 1);
        inData = true;
      }
      for (;;) {
        const start = buffer.indexOf("<row");
        // after the data come things like <rowBreaks>, which are not rows
        const endOfData = buffer.indexOf("</sheetData>");
        if (endOfData >= 0 && (start < 0 || start > endOfData)) {
          finished = true;
          break;
        }
        if (start < 0) {
          buffer = buffer.slice(Math.max(0, buffer.length - 4));
          break;
        }
        const open = buffer.indexOf(">", start);
        if (open < 0) {
          buffer = buffer.slice(start);
          break;
        }
        if (buffer[open - 1] === "/") {
          buffer = buffer.slice(open + 1);
          continue;
        }
        const close = buffer.indexOf("</row>", open);
        if (close < 0) {
          buffer = buffer.slice(start);
          break;
        }
        row(buffer.slice(open + 1, close));
        buffer = buffer.slice(close + 6);
      }
      if (finished) break;
      // give the page a turn now and then, so it stays responsive and can show progress
      if (Date.now() - lastYield > 60) {
        onProgress?.(Math.min(0.99, read / total));
        await new Promise((r) => setTimeout(r));
        lastYield = Date.now();
      }
    }
    if (rows > 0) {
      if (pending) out.push(new Blob([pending]));
      onProgress?.(1);
      return { csv: new Blob(out, { type: "text/csv" }), rows, columns: width };
    }
  }
  throw new XlsxError("The spreadsheet is empty.");
}
