import type { AiTable, GenerateInput, NarrateInput } from "@dropboard/spec";

/** Bump when SYSTEM changes, so cached dashboards from older prompts are not reused. */
export const PROMPT_VERSION = 7;

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
- Eleven more chart types are not written as SQL. For these, set query to an empty string and list column names in columns, using exact names from the schema:
  - histogram: columns = [a number column]. Shows how its values are spread out.
  - heatmap: columns = [text column, text column] and optionally a number column third. Both text columns need few distinct values (25 at most). Shows each pair shaded by the number, or by row count.
  - boxplot: columns = [text column, number column]. The text column needs few distinct values (25 at most). Shows how the number varies within each group.
  - statemap: columns = [a text column of US states, names or two-letter codes] and optionally a number column second. Only when a column clearly holds US states. Shades a map of the United States.
  - calendar: columns = [a date column]. Shows how many rows fall on each day over the latest year. Only when the dates cover many different days.
  - map: columns = [latitude, longitude], both number columns. Only when the schema has a latitude and a longitude.
  - regions: columns = [a text column of countries] and optionally a number column second. Only when a column clearly holds country names or codes. Shades a world map.
  - cities: columns = [a text column of city names] and optionally a number column second. Only when a column clearly holds city names. Draws a bubble on a world map for each known city.
  - treemap: columns = [a text column] and optionally a second text column to split each tile (both with 40 distinct values at most), and optionally a number column last. Shows how a total divides up.
  - funnel: columns = [a text column of stages with 12 distinct values at most] and optionally a number column. Shows stages from the largest to the smallest.
  - sankey: columns = [a text column, a text column] and optionally a number column third. Both text columns need few distinct values (25 at most). Shows how things move from the values of the first column to the values of the second.
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

export const NARRATE_SYSTEM = `You write the text of a short data story from a list of findings. Each finding has an id, a kind, the columns it is about, and facts: the numbers behind it. You never see any row, and the findings do not contain category names, dates or individual values. Where the finding needs one, write the placeholder you are given in tokens, exactly as written with its braces, and it will be replaced afterwards. Never write a name, date or value yourself, and never use a placeholder that is not in the finding's tokens.

For each finding return its id, a headline (short, no more than 12 words), a sentence saying what was found in plain words for a business reader, and next, one suggestion for where to look next.

Rules:
- Use only numbers given in facts. A share of 0.406 may be written 41%, and timesEven as "about 2 times an even split". Do not add, subtract or invent any other number. If you are unsure of a number, leave it out.
- Describe what the data shows. Never claim a cause, and never say why something happened. next may suggest checking causes, as a question to look into.
- Share and timesEven tell how concentrated something is, r is a correlation between -1 and 1, relativeChange is the change from start to end as a fraction, before and after are levels either side of a step, emptyRows and share describe missing cells.
- seasonal: period is 12 (months) or 7 (days), strength is how much of the variation the pattern explains, amplitude is the gap between the highest and lowest position as a fraction of the typical level. {peak} and {low} stand for the highest and lowest month or day.
- latest: change is the move in the latest period as a fraction, z is how unusual it is. {at} stands for the period.
- entitytrend: relativeChange is the rise or fall of one entity's own figures as a fraction, over its periods. {label} is the entity, {at} the last period.
- leader: share is the entity's fraction of the latest total, timesEven how many times an even share. {label} and {at} as above.
- standout: value, typical and spreadsAway compare one entity with its peers in the latest period.
- jump: change is the fraction by which one entity's figure moved in one period, spreadsAway how unusual that is.
- rankshift: from and to are rank places, places how many, groups how many entities were ranked.
- unusualrows: flagged rows out of scored, share as a fraction, strongestZ how far out the most unusual one is in robust spreads. Never say anything about what is in the rows.
- contextual: change is how far a point was from what its trend and season predict, as a fraction (0 when not meaningful), actual and expected are the two values, spreadsAway how unusual. {at} is the period; {label} the entity when there is one.
- quality: a problem in the data itself. count and share say how much of it; label stands for an example value. Describe the problem and what to fix, not what the values mean.
- duplicates: duplicateRows is how many rows are copies, share is that as a fraction of all rows.
- Plain, specific wording. No hype.`;

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

export function narrateMessage(findings: NarrateInput["findings"]): string {
  return `Findings:
${JSON.stringify(findings, null, 2)}`;
}

export function askMessage(table: AiTable, question: string): string {
  return `${describeTable(table)}\n\nQuestion: ${question}`;
}
