/**
 * A chart's rows as a CSV file, for opening in a spreadsheet. A text cell that starts with =, +, - or @ would be run as a formula by Excel
 * and Google Sheets (a way to smuggle in a command through data), so such a cell gets a leading apostrophe, which makes it plain text.
 * Numbers, including negative ones, are written as numbers and left alone.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text: string;
  if (value instanceof Date) text = Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  else if (typeof value === "bigint") text = value.toString();
  else if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  else if (typeof value === "object") text = JSON.stringify(value);
  else text = String(value);
  // a text cell that is really a number ("-12.5") stays as it is; anything else that could be read as a formula is made plain text
  if (typeof value === "string" && FORMULA_START.test(text) && Number.isNaN(Number(text))) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Rows (objects with the same keys) as CSV text, with the keys of the first row as the header and a byte-order mark so Excel reads accents right. */
export function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "﻿";
  const columns = Object.keys(rows[0]);
  const head = columns.map((c) => cell(c)).join(",");
  const body = rows.map((r) => columns.map((c) => cell(r[c])).join(","));
  return `﻿${[head, ...body].join("\r\n")}\r\n`;
}
