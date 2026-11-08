/**
 * Months, quarters and weekdays written as text: "2023-04", "Jan 2023", "2023-Q2", or just "March" and "Monday". A database reads them
 * as plain words, so a chart of them sorts by size instead of by the calendar, and a column of "2023-04" is never a time axis. This
 * recognises them from a handful of distinct values, turns the ones that carry a year into real dates, and orders the ones that do not.
 * No backslashes are used in the patterns on purpose: character classes are easier to read and to get right.
 */

export type PeriodKind = "month-name" | "weekday-name" | "quarter-name" | "year-month" | "month-year" | "quarter-year";

const MONTH = "(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)";
const WEEKDAY = "(mon(day)?|tue(s(day)?)?|wed(nesday)?|thu(r(s(day)?)?)?|fri(day)?|sat(urday)?|sun(day)?)";

const PATTERNS: [PeriodKind, RegExp][] = [
  ["month-name", new RegExp(`^${MONTH}[.]?$`, "i")],
  ["weekday-name", new RegExp(`^${WEEKDAY}[.]?$`, "i")],
  ["quarter-name", /^q[1-4]$/i],
  ["year-month", /^[0-9]{4}[-/](0?[1-9]|1[0-2])$/],
  ["month-year", new RegExp(`^${MONTH}[.]?[ ,'/-]+([0-9]{4}|[0-9]{2})$`, "i")],
  ["quarter-year", /^([0-9]{4}[ _-]*q[1-4]|q[1-4][ ,'_-]*[0-9]{4})$/i],
];

/** Which kind of period these values are, when at least nine in ten of them are one: or null. */
export function detectPeriodKind(values: unknown[]): PeriodKind | null {
  const present = values.filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim());
  if (present.length < 2) return null;
  for (const [kind, pattern] of PATTERNS) {
    if (present.filter((v) => pattern.test(v)).length / present.length >= 0.9) return kind;
  }
  return null;
}

/** Kinds that carry a year, so each value is one particular period and the column can be a time axis. */
export const isDatedPeriod = (kind: PeriodKind) => kind === "year-month" || kind === "month-year" || kind === "quarter-year";

/** SQL that turns a dated period into the date it starts on, or NULL when a value cannot be read. `col` is the quoted column. */
export function periodDateSql(kind: PeriodKind, col: string): string | null {
  const text = `trim(CAST(${col} AS VARCHAR))`;
  switch (kind) {
    case "year-month":
      return `try_strptime(replace(${text}, '/', '-') || '-01', '%Y-%m-%d')`;
    case "month-year":
      return `coalesce(try_strptime('01 ' || replace(${text}, '.', ''), '%d %b %Y'), try_strptime('01 ' || replace(${text}, '.', ''), '%d %B %Y'), try_strptime('01-' || ${text}, '%d-%b-%y'), try_strptime('01-' || replace(${text}, ' ', '-'), '%d-%b-%y'))`;
    case "quarter-year":
      return `make_date(CAST(regexp_extract(${text}, '([0-9]{4})', 1) AS INTEGER), (CAST(regexp_extract(lower(${text}), 'q([1-4])', 1) AS INTEGER) - 1) * 3 + 1, 1)`;
    default:
      return null;
  }
}

/** SQL for the position of a value in its cycle (March is 3, Wednesday is 3, Q3 is 3), so a chart can follow the calendar. */
export function periodOrderSql(kind: PeriodKind, col: string): string | null {
  const text = `lower(trim(CAST(${col} AS VARCHAR)))`;
  switch (kind) {
    case "month-name":
      return `array_position(['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'], left(${text}, 3))`;
    case "weekday-name":
      return `array_position(['mon','tue','wed','thu','fri','sat','sun'], left(${text}, 3))`;
    case "quarter-name":
      return `CAST(regexp_extract(${text}, '([1-4])', 1) AS INTEGER)`;
    default:
      return null;
  }
}
