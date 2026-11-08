import { fmt, pct } from "./format";
import type { RawFinding } from "./insights";
import { q, type ColumnProfile, type TableProfile } from "./profile";
import type { RunSql } from "./summarize";

/**
 * Free text: comments, reviews, descriptions, notes. A column like this cannot be added up or grouped, so it used to be left
 * out. What can be said about it without reading it for meaning is how long the answers are, how much of it is the same words
 * over and over, and which words come up in many rows. That is counted here, in the browser, from a sample of the rows. The
 * words themselves are content from the rows, so they stay on the page: Pilot is only ever told how many rows contain the
 * most common one, never the word.
 */

/** A text column counts as free text when its values average at least this many characters, and are mostly different. */
const MIN_LENGTH = 30;
const MIN_DISTINCT = 20;
/** Rows read for the counts. */
const SAMPLE_ROWS = 20_000;
/** At most this many text columns are described. */
const MAX_COLUMNS = 2;
/** A word in more than this share of rows is a function word of the language, not what the text is about. */
const MAX_TERM_SHARE = 0.4;
/** A word must be in at least this share of rows to be named, and there must be enough rows for a share to mean something. */
const MIN_TERM_SHARE = 0.05;
const MIN_ROWS = 100;

const STOPWORDS = new Set(
  (
    "about above after again against all also although always among and any are because been before being below between both but can cannot could did does doing down during each either else even ever every few for from further had has have having her here hers herself him himself his how however into its itself just like many may might more most much must myself neither nor not now off once only other our ours ourselves out over own per quite rather same shall she should since some such than that the their theirs them themselves then there these they this those though through thus too under until upon very was were what when where whether which while who whom whose why will with within without would yet you your yours yourself yourselves very really thing things get got getting one two"
  ).split(" "),
);

/** The text columns worth describing: long values that are mostly different, and not an identifier. */
export function freeTextColumns(profile: TableProfile): ColumnProfile[] {
  return profile.columns
    .filter((c) => c.type === "string" && (c.textLength ?? 0) >= MIN_LENGTH && c.distinct >= MIN_DISTINCT && c.distinct >= profile.rowCount * 0.3 && c.nullCount < profile.rowCount * 0.9 && !c.period)
    .sort((a, b) => (b.textLength ?? 0) - (a.textLength ?? 0) || b.distinct - a.distinct)
    .slice(0, MAX_COLUMNS);
}

export interface TextInput {
  column: string;
  /** Rows with text, and rows that were read for the counts. */
  filled: number;
  read: number;
  /** Characters per value: the middle one and the one 90% are shorter than. */
  median: number;
  p90: number;
  /** Share of values that are the very same text as another row. */
  repeated: number;
  /** The share of values that are the single most repeated text. */
  mostRepeated: number;
  /** Words that are in many rows, with the share of rows each is in. */
  terms: { term: string; share: number }[];
  /** The writing system most letters are in, as a plain name, or "Latin". */
  script: string;
}

const SCRIPTS: [string, RegExp][] = [
  ["Arabic", /\p{Script=Arabic}/gu],
  ["Cyrillic", /\p{Script=Cyrillic}/gu],
  ["Chinese, Japanese or Korean", /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu],
  ["Devanagari", /\p{Script=Devanagari}/gu],
  ["Hebrew", /\p{Script=Hebrew}/gu],
  ["Greek", /\p{Script=Greek}/gu],
  ["Thai", /\p{Script=Thai}/gu],
  ["Latin", /\p{Script=Latin}/gu],
];

/** Which writing system holds most of the letters in these values. */
export function dominantScript(values: string[]): string {
  const counts = SCRIPTS.map(([name, re]) => {
    let n = 0;
    for (const v of values) n += v.match(re)?.length ?? 0;
    return { name, n };
  });
  return counts.sort((a, b) => b.n - a.n)[0].n > 0 ? counts[0].name : "Latin";
}

const quantile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

/** The counts for one column of values. Pure, so a test can feed it text directly. */
export function describeText(column: string, values: string[], rowsSeen = values.length): TextInput | null {
  const filled = values.map((v) => v.trim()).filter((v) => v.length > 0);
  if (filled.length < MIN_ROWS) return null;
  const lengths = filled.map((v) => [...v].length).sort((a, b) => a - b);
  const counts = new Map<string, number>();
  for (const v of filled) counts.set(v.toLowerCase(), (counts.get(v.toLowerCase()) ?? 0) + 1);
  let repeatedRows = 0;
  let most = 0;
  for (const n of counts.values()) {
    if (n > 1) repeatedRows += n;
    if (n > most) most = n;
  }
  const script = dominantScript(filled.slice(0, 2000));
  // Chinese, Japanese, Thai and the like are not written with spaces between words, so counting words would count whole sentences
  const spaced = script !== "Chinese, Japanese or Korean" && script !== "Thai";
  const docs = new Map<string, number>();
  if (spaced) {
    for (const v of filled) {
      const words = (v.toLowerCase().match(/\p{L}[\p{L}'’]*/gu) ?? []).map((w) => w.replace(/['’]s$/, "")).filter((w) => w.length >= 3 && !STOPWORDS.has(w));
      const seen = new Set<string>(words);
      for (const t of seen) docs.set(t, (docs.get(t) ?? 0) + 1);
    }
  }
  const candidates = [...docs]
    .map(([term, n]) => ({ term, share: n / filled.length }))
    .filter((t) => t.share >= MIN_TERM_SHARE && t.share <= MAX_TERM_SHARE)
    .sort((a, b) => b.share - a.share || a.term.localeCompare(b.term));
  const terms = candidates.slice(0, 6).map((t) => ({ term: t.term, share: Number(t.share.toFixed(3)) }));
  return {
    column,
    filled: filled.length,
    read: rowsSeen,
    median: lengths[lengths.length >> 1],
    p90: quantile(lengths, 0.9),
    repeated: Number((repeatedRows / filled.length).toFixed(3)),
    mostRepeated: Number((most / filled.length).toFixed(3)),
    terms,
    script,
  };
}

/** Read a sample of each free-text column and describe it. */
export async function gatherText(profile: TableProfile, run: RunSql): Promise<TextInput[]> {
  const out: TextInput[] = [];
  for (const c of freeTextColumns(profile)) {
    const col = q(c.name);
    const sample = profile.rowCount > SAMPLE_ROWS ? ` USING SAMPLE ${SAMPLE_ROWS} ROWS (reservoir, 42)` : "";
    const rows = await run(`SELECT v FROM (SELECT CAST(${col} AS VARCHAR) AS v FROM data${sample}) WHERE v IS NOT NULL`);
    const d = describeText(c.name, rows.map((r) => String(r.v ?? "")));
    if (d) out.push(d);
  }
  return out;
}

/** The plain facts about each text column, as findings. At most one, for the column with the most to say. */
export function textFindings(input: TextInput[] | undefined): RawFinding[] {
  const found: RawFinding[] = [];
  for (const t of input ?? []) {
    const top = t.terms[0];
    const parts = [`${t.column} is free text, usually about ${fmt(t.median)} characters long (nine in ten are under ${fmt(t.p90)})`];
    if (top) parts.push(`${t.terms.length > 1 ? "the words that come up most are" : "the word that comes up most is"} ${t.terms.slice(0, 5).map((x) => `"${x.term}" (in ${pct(x.share)} of rows)`).join(", ")}`);
    if (t.repeated >= 0.1) parts.push(`${pct(t.repeated)} of the values are the same text as another row`);
    if (t.script !== "Latin") parts.push(`it is mostly in ${t.script} script, so word counts are limited`);
    found.push({
      kind: "text",
      columns: [t.column],
      sentence: `${parts.join("; ")}.`,
      p: null,
      // a column with a clear theme or a lot of copy-pasted answers says more than one with nothing in common
      strength: 0.4 + Math.min(0.2, (top?.share ?? 0) * 0.8) + Math.min(0.1, t.repeated * 0.5),
      evidence: { median: t.median, p90: t.p90, filled: t.filled, topShare: top?.share ?? 0, repeated: t.repeated, ...(top ? { label: top.term } : {}) },
    });
  }
  return found.sort((a, b) => b.strength - a.strength).slice(0, 1);
}

/** The words as a chart, counted by the database: the most common words of four letters or more, each in at least five values. */
export function wordsChartQuery(column: string, rows: number): string {
  const col = q(column);
  const stop = [...STOPWORDS].filter((w) => w.length >= 4).map((w) => `'${w}'`).join(", ");
  const from = rows > 200_000 ? `(SELECT ${col} FROM data WHERE ${col} IS NOT NULL LIMIT 200000)` : `(SELECT ${col} FROM data WHERE ${col} IS NOT NULL)`;
  return (
    `SELECT word AS x, count(*) AS y FROM (SELECT unnest(regexp_split_to_array(lower(CAST(${col} AS VARCHAR)), '[^\\p{L}]+')) AS word FROM ${from}) ` +
    `WHERE length(word) >= 4 AND word NOT IN (${stop}) GROUP BY 1 HAVING count(*) >= 5 ORDER BY 2 DESC, 1 LIMIT 12`
  );
}
