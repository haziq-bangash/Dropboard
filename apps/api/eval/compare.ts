import type { Cell, Result } from "./duckdb";

export interface Verdict {
  ok: boolean;
  reason: string;
}

const isNumber = (s: string) => s.trim() !== "" && Number.isFinite(Number(s));

/** Two cells are the same answer: numbers within half a percent, dates ignoring a midnight time, text ignoring case. */
export function sameCell(a: Cell, b: Cell): boolean {
  if (a === null || b === null) return a === b;
  const x = a.trim();
  const y = b.trim();
  if (isNumber(x) && isNumber(y)) {
    const n = Number(x);
    const m = Number(y);
    return Math.abs(n - m) <= Math.max(0.01, 0.005 * Math.max(Math.abs(n), Math.abs(m)));
  }
  const day = (s: string) => s.replace(/[ T]00:00:00(\.0+)?(Z|\+00(:00)?)?$/, "");
  return day(x).toLowerCase() === day(y).toLowerCase();
}

/**
 * Does the model's result give the same answer as the gold result?
 *  - the same number of rows;
 *  - every gold row is found, in some row of the answer, cell for cell. Extra columns, a different column order and a
 *    different row order are all fine: they are presentation, not a different answer.
 * `scales` lets a ratio be right as a fraction or as a percentage.
 */
export function compare(gold: Result, got: Result, scales: number[] = [1]): Verdict {
  if (gold.rows.length !== got.rows.length) {
    return { ok: false, reason: `expected ${gold.rows.length} row(s), got ${got.rows.length}` };
  }
  for (const scale of scales) {
    const scaled = gold.rows.map((row) => row.map((c) => (scale !== 1 && c !== null && isNumber(c) ? String(Number(c) * scale) : c)));
    if (everyRowFound(scaled, got.rows)) return { ok: true, reason: scale === 1 ? "match" : `match (as ×${scale})` };
  }
  const first = got.rows[0]?.join(" | ") ?? "(no rows)";
  return { ok: false, reason: `different values; first row: ${first.slice(0, 120)}` };
}

function everyRowFound(goldRows: Cell[][], gotRows: Cell[][]): boolean {
  const used = new Set<number>();
  for (const g of goldRows) {
    const at = gotRows.findIndex((r, i) => !used.has(i) && containsAll(r, g));
    if (at < 0) return false;
    used.add(at);
  }
  return true;
}

/** Every gold cell is matched by a different cell of the row. */
function containsAll(row: Cell[], gold: Cell[]): boolean {
  const taken = new Set<number>();
  return gold.every((g) => {
    const at = row.findIndex((c, i) => !taken.has(i) && sameCell(g, c));
    if (at < 0) return false;
    taken.add(at);
    return true;
  });
}

/** Try each acceptable gold answer; the model is right if it matches any of them. */
export function compareAny(golds: Result[], got: Result, scales?: number[]): Verdict {
  let last: Verdict = { ok: false, reason: "no gold answer" };
  for (const g of golds) {
    last = compare(g, got, scales);
    if (last.ok) return last;
  }
  return last;
}
