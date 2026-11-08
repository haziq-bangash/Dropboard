/**
 * Pasted data, turned into a file the normal reader accepts. Cells copied from Excel or Google Sheets arrive as tab-separated text;
 * a table copied from a web page arrives as HTML as well, and the HTML keeps the cell boundaries that plain text loses. Nothing here
 * leaves the browser: it only builds a file in memory.
 */

export const MAX_PASTE_BYTES = 10 * 1024 * 1024;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

const decode = (s: string) =>
  s
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();

/** The cells of the first table in some HTML, or null when there is none worth reading. Reads text only: scripts and styles are dropped. */
export function tableFromHtml(html: string): string[][] | null {
  const cleaned = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "");
  const table = cleaned.match(/<table\b[\s\S]*?<\/table>/i)?.[0];
  if (!table) return null;
  const rows: string[][] = [];
  for (const row of table.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)) {
    const cells = [...row[0].matchAll(/<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi)].flatMap((c) => {
      const text = decode(c[3].replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, ""));
      // a cell that spans several columns is repeated, so the columns stay lined up
      const span = Math.min(Number(c[2].match(/colspan\s*=\s*["']?(\d+)/i)?.[1] ?? 1) || 1, 50);
      return Array<string>(span).fill(text);
    });
    if (cells.length) rows.push(cells);
  }
  // a pasted web table is only worth taking if it has a header and at least one row, and more than one column somewhere
  if (rows.length < 2 || Math.max(...rows.map((r) => r.length)) < 2) return null;
  return rows;
}

/** One value in a CSV file: quoted when it needs to be. */
const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Rows as CSV text, padded so every row has as many cells as the widest. */
export function csvOf(rows: string[][]): string {
  const width = Math.max(...rows.map((r) => r.length));
  return rows.map((r) => Array.from({ length: width }, (_, i) => cell(r[i] ?? "")).join(",")).join("\n") + "\n";
}

export class PasteError extends Error {}

/** How many of the first lines have the delimiter, and the same number of times: a sign that it is really a table. */
function consistent(text: string, delimiter: string): boolean {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  if (lines.length < 2) return false;
  const counts = lines.map((l) => l.split(delimiter).length - 1);
  return counts[0] > 0 && counts.filter((n) => n === counts[0]).length >= Math.ceil(lines.length * 0.8);
}

/**
 * The file for something pasted. `html` is the clipboard's HTML flavour, when it has one. Throws a PasteError saying what to do
 * when there is not a table in it.
 */
export function pastedFile(text: string, html?: string | null): File {
  if (new Blob([text, html ?? ""]).size > MAX_PASTE_BYTES) throw new PasteError("That is too much to paste (the limit is 10 MB). Save it as a file and drop the file in instead.");
  // copied from a web page: the HTML knows where the cells are
  if (html) {
    const rows = tableFromHtml(html);
    if (rows) return new File([csvOf(rows)], "Pasted table.csv", { type: "text/csv" });
  }
  const body = text.replace(/^﻿/, "");
  if (!body.trim()) throw new PasteError("Nothing to read yet. Copy some cells from a spreadsheet, or a table from a web page, and paste them here.");
  // copied from Excel or Google Sheets: tab-separated
  if (consistent(body, "\t")) return new File([body], "Pasted data.tsv", { type: "text/tab-separated-values" });
  if (consistent(body, ",")) return new File([body], "Pasted data.csv", { type: "text/csv" });
  if (consistent(body, ";")) return new File([body], "Pasted data.csv", { type: "text/csv" });
  throw new PasteError("That does not look like a table. Copy the cells, headers included, from a spreadsheet, and paste them again.");
}
