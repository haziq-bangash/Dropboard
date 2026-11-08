/**
 * Make a database error safe to show a model. Errors can quote a value from the data ("Could not convert string
 * 'abc' to INT32"), so every quoted piece is blanked unless it is a column name the model already knows.
 * Only the first few lines are kept, since the rest is usually a copy of the query.
 */
export function scrubDbError(message: string, columnNames: string[] = []): string {
  const known = new Set(columnNames);
  const kept = message
    .split("\n")
    .filter((line) => !/^\s*LINE \d+:/.test(line) && !/^\s*\^+\s*$/.test(line))
    .slice(0, 6)
    .join(" ");
  return kept
    .replace(/'[^']*'/g, "'?'")
    .replace(/"([^"]*)"/g, (_m, inner: string) => (known.has(inner) ? `"${inner}"` : '"?"'))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}
