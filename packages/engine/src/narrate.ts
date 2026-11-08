import type { Finding, FindingKind } from "./insights";

/**
 * Letting a model write the Story without letting it read the data.
 *
 * A finding's numbers (shares, changes, correlations) are sent, but the pieces that are values from the rows are not:
 * the name of the top category, the date a step happened around, and an outlier's actual value. In their place the
 * model gets a placeholder such as {label} and writes with it; the browser puts the real text back. Whatever comes
 * back is checked: only the placeholders it was given may appear, and every number must be one it was given.
 */

/** Evidence entries that are values from the rows. They stay in the browser. */
const HELD_BACK = ["label", "at", "worstValue"] as const;

export interface NarrateFinding {
  id: string;
  kind: FindingKind;
  /** Column names are already shared with Pilot. */
  columns: string[];
  /** Numbers only: the evidence minus anything that is a value from the rows. */
  facts: Record<string, number>;
  /** Placeholders the text may use, each written with braces, e.g. "{label}". */
  tokens: string[];
}

export interface NarratedItem {
  id: string;
  headline: string;
  sentence: string;
  next: string;
}

export function toNarrateFindings(findings: Finding[]): NarrateFinding[] {
  return findings.map((f, i) => {
    const facts: Record<string, number> = {};
    for (const [k, v] of Object.entries(f.evidence)) {
      if ((HELD_BACK as readonly string[]).includes(k)) continue;
      if (typeof v === "number" && Number.isFinite(v)) facts[k] = v;
    }
    const tokens = HELD_BACK.filter((k) => k in f.evidence).map((k) => `{${k}}`);
    return { id: `f${i}`, kind: f.kind, columns: f.columns, facts, tokens };
  });
}

const TOKEN = /\{[A-Za-z]+\}/g;

/** Put the real label, date or value back where a placeholder stands. Returns null if a placeholder is not one it can fill. */
export function fillTokens(text: string, evidence: Finding["evidence"], show: (n: number) => string = String): string | null {
  let ok = true;
  const out = text.replace(TOKEN, (token) => {
    const key = token.slice(1, -1);
    if (!(HELD_BACK as readonly string[]).includes(key) || !(key in evidence)) {
      ok = false;
      return token;
    }
    const v = evidence[key];
    return typeof v === "number" ? show(v) : String(v);
  });
  return ok ? out : null;
}

const SCALE: Record<string, number> = { k: 1e3, m: 1e6, bn: 1e9 };

/** Every number written in the text, as a value, with a trailing k, m, bn or % understood. */
function numbersIn(text: string): { value: number; percent: boolean }[] {
  const found: { value: number; percent: boolean }[] = [];
  for (const m of text.replace(TOKEN, " ").matchAll(/(\d[\d,]*(?:\.\d+)?)\s?(bn|m|k|%)?(?![A-Za-z])/g)) {
    const base = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(base)) continue;
    const suffix = m[2];
    found.push({ value: suffix && suffix !== "%" ? base * SCALE[suffix] : base, percent: suffix === "%" });
  }
  return found;
}

/**
 * Is every number in the text one of the finding's own numbers? A share of 0.406 may be written 41% or 40.6%, a count
 * as itself, and a small whole number (up to 10) is allowed because "two of the three" is not a claim about the data.
 */
export function numbersTraceable(text: string, facts: Record<string, number>): boolean {
  const values = Object.values(facts);
  const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.6, 0.015 * Math.abs(b));
  return numbersIn(text).every(({ value, percent }) => {
    if (!percent && Number.isInteger(value) && value >= 0 && value <= 10) return true;
    return values.some((v) => (percent ? near(value, Math.abs(v) * 100) : near(value, Math.abs(v)) || near(value, Math.abs(v) * 100)));
  });
}

const clean = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Keep the parts of a model's story that follow the rules. An item is dropped whole when it names a finding that was not
 * asked about, uses a placeholder it was not given, or states a number it was not given; the page then shows the plain
 * version of that finding instead.
 */
export function checkNarration(sent: NarrateFinding[], items: NarratedItem[]): NarratedItem[] {
  const byId = new Map(sent.map((f) => [f.id, f]));
  const kept: NarratedItem[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const f = byId.get(item.id);
    if (!f || seen.has(item.id)) continue;
    const text = { headline: clean(item.headline, 120), sentence: clean(item.sentence, 400), next: clean(item.next, 300) };
    const all = `${text.headline} ${text.sentence} ${text.next}`;
    const used = all.match(TOKEN) ?? [];
    if (used.some((t) => !f.tokens.includes(t))) continue;
    if (/[{}]/.test(all.replace(TOKEN, ""))) continue;
    if (!text.headline || !text.sentence || !numbersTraceable(all, f.facts)) continue;
    seen.add(item.id);
    kept.push({ id: item.id, ...text });
  }
  return kept;
}
