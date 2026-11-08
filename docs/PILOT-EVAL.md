# Pilot provider evaluation

How well each model answers plain-language questions about a spreadsheet and designs a dashboard, measured the way the product uses them. The harness is in `apps/api/eval/` and can be re-run any time:

```
set -a; . ./.env.staging.local; set +a
pnpm --filter @dropboard/api exec tsx eval/run.ts --models openai:gpt-5.4-mini,xai:grok-4.20-0309-non-reasoning --trials 2
pnpm --filter @dropboard/api exec tsx eval/run.ts --rescore eval/results/<run>.json   # score a saved run again, no model calls
```

## How it works

- **Questions.** 42 questions over the four sample datasets, 12 of them harder (shares of a total, medians, ratios, date filters, gaps between statistics). Each has gold SQL, with several forms where a question can be answered more than one way (a month as a date, a number or a name).
- **What the model sees.** Only column names, types and counts, exactly like the real service. Never a row.
- **Scoring.** The model's SQL goes through the same guard as the server, runs in DuckDB (the engine the browser uses), and is compared with the gold answer. Extra columns, column order and row order do not count against it. A "which is highest?" answered with every group, the right one first, is counted separately as *usable*.
- **Dashboards.** Each model designs a dashboard per dataset. Every chart is run, and counts as working only if it returns rows with the columns the renderer binds to.

## Results (run 8 Nov 2026, 2 trials per question)

| Model | Exactly right | Usable (right answer first) | Median time | Tokens in / out per question |
|---|---|---|---|---|
| openai/gpt-5.4-mini | 98% | 98% | 3.2 s | 352 / 124 |
| openai/gpt-5.4-nano | 96% | 98% | 1.8 s | 352 / 102 |
| xai/grok-4.3 | 93% | 95% | 4.4 s | 571 / 368 |
| xai/grok-4.20-0309-non-reasoning | 92% | 93% | 1.3 s | 563 / 60 |
| anthropic/claude-haiku-5-5 | not measured | | | |
| anthropic/claude-sonnet-5-5 | not measured | | | |
| google/gemini-3.5-flash-lite (Vertex) | not measured | | | |

| Model | Charts that work | Fully working dashboards | Median time |
|---|---|---|---|
| openai/gpt-5.4-mini | 100% | 8/8 | 5.7 s |
| xai/grok-4.20-0309-non-reasoning | 100% | 8/8 | 3.8 s |
| xai/grok-4.3 | 100% | 8/8 | 9.8 s |
| openai/gpt-5.4-nano | 84% | 5/8 | 4.0 s |

## What this does and does not show

- **Not measured: Anthropic and Google.** Every Anthropic call was refused with "credit balance too low" on the key used, and Vertex needs Google Cloud credentials this run did not use. Both need a re-run before any default is chosen. The numbers above say nothing about them.
- **No prices.** Only token counts are recorded, because current prices for these model names were not confirmed. Cost per question follows from tokens times the vendor's price once that is checked on their pricing page.
- **Small sample.** 84 answers per model on made-up data with simple tables. A gap of a few points between neighbours (98 against 96, 93 against 92) is within noise. The gaps worth acting on are the large ones: `gpt-5.4-nano` wrote 16% of its dashboard charts so the renderer could not bind them, and `grok-4.20-0309-non-reasoning` missed more of the harder questions.
- **Speed is real but not the whole story.** The reasoning-style models took 3 to 10 seconds for a dashboard, the non-reasoning one under 4. The `gpt-5.4-mini` setting uses low reasoning effort; more would be slower.

## What the failures taught us

- **Chart columns.** The weakest model named its headline column `total_revenue` where the renderer expects `value`, so the chart could not draw. That is fixable in the product without a better model: when a query's columns do not match, use the first one or two columns. (Done in a follow-up.)
- **Forgotten FROM.** Two answers from one model were SQL missing `FROM data`. A single retry that feeds the database error back to the model, as the plan already proposes, should recover these.
- **"Which is highest?" returning every group.** Several models list all groups, best first. That reads fine on screen, which is why it is scored as usable.
- **A real ambiguity.** "Which category has the most tickets?" was missed by every OpenAI answer on one of four runs because the sample has a near tie. Ties make some questions genuinely ambiguous.

## Reading it for a default

For answer quality alone, `gpt-5.4-mini` led, with every dashboard chart working. `grok-4.20-0309-non-reasoning` is the fastest and held up on dashboards but dropped more answers. Until Anthropic and Gemini are measured with the same questions, there is nothing here to justify changing the current default, and no setting has been changed.
