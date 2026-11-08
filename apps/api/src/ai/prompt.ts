import type { AiTable, GenerateInput } from "@dropboard/spec";

/** Bump when SYSTEM changes, so cached dashboards from older prompts are not reused. */
export const PROMPT_VERSION = 5;

export const SYSTEM = `You design dashboards for tabular data. You will be given only the SCHEMA of a table (column names, types, null counts and approximate distinct counts). You never see any row values, so never guess or quote values.

The data lives in a DuckDB table named "data". Every chart is one read-only SQL query against it.

Rules for queries:
- A single SELECT (or WITH ... SELECT). No semicolons, no comments, no other statements.
- Use only columns from the schema. Always double-quote column names, for example "order date".
- Never reference any table except "data". Never use file or network functions.
- Chart output shapes:
  - kpi: exactly one row with one column aliased value.
  - bar, pie: columns aliased x (category) and y (number). Order by y descending and LIMIT 20.
  - line, area: columns aliased x (a date or ordered value) and y (number), ordered by x. For dates use date_trunc('month', "col") or another grain that suits the span.
  - scatter: columns aliased x and y, both numbers, with LIMIT 1000.
- Seven more chart types are not written as SQL. For these, set query to an empty string and list column names in columns, using exact names from the schema:
  - histogram: columns = [a number column]. Shows how its values are spread out.
  - heatmap: columns = [text column, text column] and optionally a number column third. Both text columns need few distinct values (25 at most). Shows each pair shaded by the number, or by row count.
  - boxplot: columns = [text column, number column]. The text column needs few distinct values (25 at most). Shows how the number varies within each group.
  - statemap: columns = [a text column of US states, names or two-letter codes] and optionally a number column second. Only when a column clearly holds US states. Shades a map of the United States.
  - calendar: columns = [a date column]. Shows how many rows fall on each day over the latest year. Only when the dates cover many different days.
  - map: columns = [latitude, longitude], both number columns. Only when the schema has a latitude and a longitude.
  - regions: columns = [a text column of countries] and optionally a number column second. Only when a column clearly holds country names or codes. Shades a world map.
  For every other type, set columns to an empty list.
- Use sum, avg, count, min, max as the data suggests. Do not sum columns that look like identifiers, ratios or percentages (use avg for those).

Rules for the dashboard:
- Return a short, specific title and between 4 and 8 charts. Start with 1 to 3 kpi charts.
- Prefer charts that answer real business questions over decoration. Do not repeat the same chart.
- Chart titles are short and plain, written for a business reader.
- If an instruction is given, follow it. If a current dashboard is given, edit it: keep what still fits, change what the instruction asks for, and return the full updated dashboard.`;

export const ASK_SYSTEM = `You answer questions about tabular data by writing one SQL query. You will be given only the SCHEMA of a table (column names, types, null counts and approximate distinct counts). You never see row values.

The data lives in a DuckDB table named "data".
- Write a single read-only SELECT (or WITH ... SELECT). No semicolons, no comments, no other statements.
- Use only columns from the schema and always double-quote column names.
- Never reference any table except "data". Never use file or network functions.
- Return a result that directly answers the question, with readable column aliases and at most 100 rows.
- explanation is one or two plain sentences describing what the query computes. If the schema cannot answer the question, return a query that gets as close as possible and say what is missing in the explanation.`;

export const REPAIR_SYSTEM = `${ASK_SYSTEM}

Your previous query for this question failed when it ran. You are given the query and the database error, with any quoted data values removed. Return a corrected query that answers the same question. Fix the cause named in the error, for example a wrong column name or a type that needs a cast, and change nothing else.`;

/** Describe the table with schema and stats only. Row values are never included. */
export function describeTable(table: AiTable): string {
  const lines = table.columns.map((c) => {
    const parts: string[] = [c.type];
    if (c.nullCount !== undefined) parts.push(`${c.nullCount} nulls`);
    if (c.distinct !== undefined) parts.push(`~${c.distinct} distinct`);
    return `- "${c.name.replace(/"/g, '""')}" (${parts.join(", ")})`;
  });
  return `Table "data" has ${table.rowCount} rows and these columns:\n${lines.join("\n")}`;
}

export function generateMessage(input: GenerateInput): string {
  const parts = [describeTable(input.table)];
  if (input.current) {
    const charts = input.current.charts.map((c) => ({ type: c.type, title: c.title, query: c.query }));
    parts.push(`Current dashboard "${input.current.title}":\n${JSON.stringify(charts, null, 2)}`);
  }
  parts.push(input.instruction ? `Instruction: ${input.instruction}` : "Instruction: none, design a strong general-purpose dashboard.");
  return parts.join("\n\n");
}

export function repairMessage(table: AiTable, question: string, sql: string, error: string): string {
  return `${askMessage(table, question)}

Failed query:
${sql}

Database error: ${error}`;
}

export function askMessage(table: AiTable, question: string): string {
  return `${describeTable(table)}\n\nQuestion: ${question}`;
}
