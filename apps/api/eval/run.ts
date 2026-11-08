/**
 * Compare Pilot providers on the same questions.
 *
 *   set -a; . ./.env.staging.local; set +a        (keys are read from the environment and never printed or saved)
 *   pnpm --filter @dropboard/api exec tsx eval/run.ts --models anthropic:claude-haiku-5-5,openai:gpt-5.4-mini --trials 2
 *
 * Add `--rescore eval/results/<run>.json` to score a saved run again with the current rules, without calling any model.
 *
 * Each model gets every question about a sample dataset (it sees only column names, types and counts, exactly like the
 * real service), and its SQL is run through the same guard the server uses, then scored against the gold answers.
 * Each model is also asked to design a dashboard per dataset, and every chart is run to see whether it works.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { guardSql, STARTERS } from "@dropboard/engine";
import type { AiTable } from "@dropboard/spec";
import { buildSpec } from "../src/ai/sanitize";
import { createAiFromEnv } from "../src/ai/providers";
import type { AiService } from "../src/ai/service";
import { compareAny } from "./compare";
import { createSql, type Result, type Sql } from "./duckdb";
import { QUESTIONS, type Question } from "./questions";

// ---- arguments ----
const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
};
const MODELS = arg("models", "anthropic:claude-haiku-5-5,openai:gpt-5.4-mini,xai:grok-4.20-0309-non-reasoning")
  .split(",")
  .map((m) => {
    const [provider, ...rest] = m.trim().split(":");
    return { provider, model: rest.join(":") };
  });
const TRIALS = Number(arg("trials", "2"));
const CONCURRENCY = Number(arg("concurrency", "4"));
const SKIP_GENERATE = process.argv.includes("--skip-generate");
const RESCORE = arg("rescore", "");

// ---- small helpers ----
async function pool<T>(items: T[], size: number, work: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) await work(items[next++]);
    }),
  );
}
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "n/a");

function service(provider: string, model: string): AiService {
  // only the provider and model are chosen here; keys come from the environment, which is never printed
  const ai = createAiFromEnv({ ...process.env, AI_PROVIDER: provider, AI_MODEL: model } as Record<string, string>);
  if (!ai) throw new Error(`${provider} is not configured (is its key in the environment?)`);
  return ai;
}

// ---- model calls ----
interface AskCall {
  model: string;
  question: Question;
  trial: number;
  sql?: string;
  error?: string;
  ms: number;
  inputTokens: number;
  outputTokens: number;
}
interface GenCall {
  model: string;
  dataset: string;
  trial: number;
  charts?: { type: string; title: string; query: string }[];
  droppedByGuard?: number;
  error?: string;
  ms: number;
  inputTokens: number;
  outputTokens: number;
}

const errorLabel = (e: unknown) => `${(e as Error).name}: ${(e as Error).message}`.replace(/\s+/g, " ").slice(0, 160);

async function main() {
  const sql: Sql = await createSql();
  const tables = new Map<string, AiTable>();
  for (const s of STARTERS) {
    sql.load(s.csv());
    tables.set(s.id, sql.profile());
  }
  // a saved run is scored again from what the models said then; no model is called
  const saved = RESCORE ? (JSON.parse(readFileSync(RESCORE, "utf8")) as { models: string[]; asks: (AskCall & { score?: unknown })[]; gens: (GenCall & { score?: unknown })[] }) : null;
  const services = saved ? new Map<string, AiService>() : new Map(MODELS.map((m) => [`${m.provider}/${m.model}`, service(m.provider, m.model)]));
  const modelNames: string[] = saved ? saved.models : [...services.keys()];
  console.log(saved ? `Rescoring ${RESCORE}` : `Models: ${modelNames.join(", ")} | ${QUESTIONS.length} questions x ${TRIALS} trials | concurrency ${CONCURRENCY}`);

  // ---- 1. ask every model every question ----
  const asks: AskCall[] = saved ? saved.asks.map(({ score: _s, ...c }) => ({ ...c, question: QUESTIONS.find((q) => q.id === c.question.id)! })) : [];
  const askJobs = saved ? [] : modelNames.flatMap((model) => QUESTIONS.flatMap((question) => Array.from({ length: TRIALS }, (_, trial) => ({ model, question, trial }))));
  let done = 0;
  await pool(askJobs, CONCURRENCY, async ({ model, question, trial }) => {
    const t0 = Date.now();
    const call: AskCall = { model, question, trial, ms: 0, inputTokens: 0, outputTokens: 0 };
    try {
      const r = await services.get(model)!.ask({ table: tables.get(question.dataset)!, question: question.ask });
      call.sql = r.output.sql;
      call.inputTokens = r.usage.inputTokens;
      call.outputTokens = r.usage.outputTokens;
    } catch (e) {
      call.error = errorLabel(e);
    }
    call.ms = Date.now() - t0;
    asks.push(call);
    if (++done % 20 === 0) console.log(`  asked ${done}/${askJobs.length}`);
  });

  // ---- 2. ask every model to design a dashboard per dataset ----
  const gens: GenCall[] = saved ? saved.gens.map(({ score: _s, ...c }) => c) : [];
  if (!SKIP_GENERATE && !saved) {
    const genJobs = modelNames.flatMap((model) => STARTERS.flatMap((s) => Array.from({ length: TRIALS }, (_, trial) => ({ model, dataset: s.id, trial }))));
    await pool(genJobs, CONCURRENCY, async ({ model, dataset, trial }) => {
      const t0 = Date.now();
      const call: GenCall = { model, dataset, trial, ms: 0, inputTokens: 0, outputTokens: 0 };
      try {
        const table = tables.get(dataset)!;
        const r = await services.get(model)!.generate({ table });
        call.inputTokens = r.usage.inputTokens;
        call.outputTokens = r.usage.outputTokens;
        call.droppedByGuard = Math.max(0, r.output.charts.length - (() => { try { return buildSpec(table, r.output).spec.charts.length; } catch { return 0; } })());
        call.charts = (() => { try { return buildSpec(table, r.output).spec.charts.map((c) => ({ type: c.type, title: c.title, query: c.query })); } catch { return []; } })();
      } catch (e) {
        call.error = errorLabel(e);
      }
      call.ms = Date.now() - t0;
      gens.push(call);
    });
  }

  // ---- 3. score, one dataset at a time (they share the table name `data`) ----
  const gold = new Map<string, Result[]>();
  const askScores = new Map<AskCall, { outcome: "correct" | "listed" | "wrong" | "guard" | "sqlerror" | "provider"; reason: string }>();
  const genScores = new Map<GenCall, { returned: number; valid: number; kinds: number; hasKpi: boolean; problems: string[] }>();
  for (const s of STARTERS) {
    sql.load(s.csv());
    for (const q of QUESTIONS.filter((x) => x.dataset === s.id)) gold.set(q.id, q.gold.map((g) => sql.run(g)));
    for (const call of asks.filter((c) => c.question.dataset === s.id)) {
      if (call.error || !call.sql) {
        askScores.set(call, { outcome: "provider", reason: call.error ?? "no answer" });
        continue;
      }
      const guarded = guardSql(call.sql);
      if (!guarded.ok) {
        askScores.set(call, { outcome: "guard", reason: guarded.reason });
        continue;
      }
      let got: Result;
      try {
        got = sql.run(guarded.sql);
      } catch (e) {
        askScores.set(call, { outcome: "sqlerror", reason: (e as Error).message.replace(/\s+/g, " ").slice(0, 140) });
        continue;
      }
      const goldResults = gold.get(call.question.id)!;
      const v = compareAny(goldResults, got, call.question.scales);
      if (v.ok) {
        askScores.set(call, { outcome: "correct", reason: v.reason });
      } else if (goldResults.every((g) => g.rows.length === 1) && got.rows.length > 1 && compareAny(goldResults, { columns: got.columns, rows: [got.rows[0]] }, call.question.scales).ok) {
        // "which one is highest?" answered with every group, the right one first: a person would accept that
        askScores.set(call, { outcome: "listed", reason: "right answer first in a longer list" });
      } else {
        askScores.set(call, { outcome: "wrong", reason: v.reason });
      }
    }
    for (const call of gens.filter((c) => c.dataset === s.id)) {
      const problems: string[] = [];
      let valid = 0;
      for (const chart of call.charts ?? []) {
        const guarded = guardSql(chart.query);
        if (!guarded.ok) {
          problems.push(`${chart.title}: ${guarded.reason}`);
          continue;
        }
        try {
          const r = sql.run(guarded.sql);
          const cols = r.columns.map((c) => c.toLowerCase());
          const binds = chart.type === "kpi" ? cols.includes("value") : cols.includes("x") && cols.includes("y");
          if (!r.rows.length) problems.push(`${chart.title}: no rows`);
          else if (!binds) problems.push(`${chart.title}: columns ${r.columns.join(",")} do not bind`);
          else valid++;
        } catch (e) {
          problems.push(`${chart.title}: ${(e as Error).message.replace(/\s+/g, " ").slice(0, 100)}`);
        }
      }
      genScores.set(call, {
        returned: call.charts?.length ?? 0,
        valid,
        kinds: new Set((call.charts ?? []).map((c) => c.type)).size,
        hasKpi: (call.charts ?? []).some((c) => c.type === "kpi"),
        problems,
      });
    }
  }

  // ---- 4. report ----
  const lines: string[] = [];
  lines.push(`# Pilot provider evaluation`, "", `${QUESTIONS.length} questions x ${saved ? Math.max(1, Math.round(asks.length / Math.max(1, modelNames.length) / QUESTIONS.length)) : TRIALS} trials per model, over four sample datasets. Run ${new Date().toISOString().slice(0, 10)}.`, "");
  lines.push("## Questions (model writes SQL, browser runs it)", "", "| Model | Exactly right | Right answer first in a longer list | Wrong answer | Rejected by guard | SQL error | Provider error | Median time | Tokens in / out per question |", "|---|---|---|---|---|---|---|---|---|");
  const summary: Record<string, unknown> = {};
  for (const model of modelNames) {
    const mine = asks.filter((c) => c.model === model);
    const count = (o: string) => mine.filter((c) => askScores.get(c)!.outcome === o).length;
    const ok = mine.filter((c) => !c.error);
    lines.push(
      `| ${model} | **${pct(count("correct"), mine.length)}** (${count("correct")}/${mine.length}) | ${count("listed")} (usable: ${pct(count("correct") + count("listed"), mine.length)}) | ${count("wrong")} | ${count("guard")} | ${count("sqlerror")} | ${count("provider")} | ${(median(ok.map((c) => c.ms)) / 1000).toFixed(1)} s | ${Math.round(mean(ok.map((c) => c.inputTokens)))} / ${Math.round(mean(ok.map((c) => c.outputTokens)))} |`,
    );
    summary[model] = { correct: count("correct"), total: mine.length };
  }
  if (!SKIP_GENERATE) {
    lines.push("", "## Dashboards (model designs, server checks every chart)", "", "| Model | Charts returned | Charts that work | Fully working dashboards | Has a headline number | Median time | Tokens in / out |", "|---|---|---|---|---|---|---|");
    for (const model of modelNames) {
      const mine = gens.filter((c) => c.model === model);
      const scored = mine.map((c) => genScores.get(c)!);
      const returned = scored.reduce((s, x) => s + x.returned, 0);
      const valid = scored.reduce((s, x) => s + x.valid, 0);
      const full = scored.filter((x) => x.returned >= 4 && x.valid === x.returned).length;
      const ok = mine.filter((c) => !c.error);
      lines.push(
        `| ${model} | ${returned} (${(returned / Math.max(1, mine.length)).toFixed(1)} per dashboard) | **${pct(valid, returned)}** | ${full}/${mine.length} | ${scored.filter((x) => x.hasKpi).length}/${mine.length} | ${(median(ok.map((c) => c.ms)) / 1000).toFixed(1)} s | ${Math.round(mean(ok.map((c) => c.inputTokens)))} / ${Math.round(mean(ok.map((c) => c.outputTokens)))} |`,
      );
    }
  }
  lines.push("", "## What went wrong (a sample per model)", "");
  for (const model of modelNames) {
    const bad = asks.filter((c) => c.model === model && askScores.get(c)!.outcome !== "correct").slice(0, 6);
    lines.push(`### ${model}`, "");
    if (!bad.length) lines.push("Nothing: every answer was right.", "");
    for (const c of bad) lines.push(`- ${c.question.id} "${c.question.ask}": ${askScores.get(c)!.outcome}, ${askScores.get(c)!.reason}`);
    for (const c of gens.filter((g) => g.model === model && genScores.get(g)!.problems.length).slice(0, 2)) lines.push(`- dashboard for ${c.dataset}: ${genScores.get(c)!.problems.slice(0, 2).join("; ")}`);
    lines.push("");
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  mkdirSync("eval/results", { recursive: true });
  writeFileSync(`eval/results/${stamp}.md`, lines.join("\n"));
  // raw answers for digging into, without any keys: only questions, SQL, scores and timings
  writeFileSync(
    `eval/results/${stamp}.json`,
    JSON.stringify({ models: [...modelNames], asks: asks.map((c) => ({ ...c, score: askScores.get(c) })), gens: gens.map((c) => ({ ...c, score: genScores.get(c) })) }, null, 2),
  );
  console.log("\n" + lines.join("\n"));
  console.log(`\nSaved eval/results/${stamp}.md and .json`);
}

main().catch((e) => {
  console.error("evaluation failed:", (e as Error).message);
  process.exit(1);
});
