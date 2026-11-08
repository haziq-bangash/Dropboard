# Pilot provider evaluation

How well each model answers plain-language questions about a spreadsheet and designs a dashboard, measured the way the product uses them. The harness is in `apps/api/eval/` and can be re-run any time:

```
set -a; . ./.env.staging.local; set +a
pnpm --filter @dropboard/api exec tsx eval/run.ts --models openai:gpt-5.4-mini,xai:grok-4.20-0309-non-reasoning --trials 2
pnpm --filter @dropboard/api exec tsx eval/run.ts --rescore eval/results/<run>.json   # score a saved run again, no model calls
```

## How it works

- **Questions.** 42 questions over the four sample datasets, 12 of them harder (shares of a total, medians, ratios, date filters, gaps between statistics). Each has gold SQL, with several forms where a question can be answered more than one way (a month as a date, a number or a name). A test checks that every gold query runs, and that no "which is highest?" question has a tied answer.
- **Added since the results below.** A fifth sample (delivery drops, with coordinates) brought nine more questions, so the set is now 51. The numbers below are from the first 42 and have not been re-run with the new ones.
- **What the model sees.** Only column names, types and counts, exactly like the real service. Never a row.
- **Scoring.** The model's SQL goes through the same guard as the server, runs in DuckDB (the engine the browser uses), and is compared with the gold answer. Extra columns, column order and row order do not count against it. A "which is highest?" answered with every group, the right one first, is counted separately as *usable*.
- **Dashboards.** Each model designs a dashboard per dataset. Every chart is run, and counts as working only if it returns rows with the columns the renderer binds to.

## Results (8 Nov 2026, 2 trials per question, 84 answers per model)

| Model | Exactly right | Usable (right answer first) | Median time | Tokens in / out per question |
|---|---|---|---|---|
| openai/gpt-5.4-mini | 99% | 100% | 3.0 s | 352 / 117 |
| openai/gpt-5.4-nano | 96% | 99% | 1.8 s | 352 / 104 |
| xai/grok-4.20-0309-non-reasoning | 92% | 94% | 1.2 s | 563 / 60 |
| xai/grok-4.3 | 89% | 92% | 4.0 s | 571 / 372 |
| anthropic/claude-haiku-5-5, claude-sonnet-5-5 | not measured | | | |
| google/gemini-3.5-flash-lite (Vertex) | not measured | | | |

| Model | Charts that work | Fully working dashboards | Median time | Tokens in / out |
|---|---|---|---|---|
| openai/gpt-5.4-mini | 100% | 8/8 | 4.7 s | 603 / 498 |
| xai/grok-4.20-0309-non-reasoning | 100% | 8/8 | 3.6 s | 825 / 325 |
| xai/grok-4.3 | 100% | 8/8 | 13.5 s | 833 / 1108 |
| openai/gpt-5.4-nano | 88% | 5/8 | 4.8 s | 603 / 434 |

"Charts that work" is measured before the product's own repair of misnamed columns (see below), so for `gpt-5.4-nano` it understates what a person would now see.

## What this does and does not show

- **Not measured: Anthropic and Google.** Every Anthropic call was refused with "credit balance too low" on the key used, and Vertex needs Google Cloud credentials this run did not use. Both need a re-run before any default is chosen. The numbers above say nothing about them.
- **No prices.** Only token counts are recorded, because current prices for these model names were not confirmed. Cost per question is tokens times the vendor's price, once that is checked on their pricing page.
- **Small sample.** 84 answers per model, on made-up data with simple tables. Differences of a few points between neighbours (99 against 96, 92 against 89) are within noise. The gaps worth acting on are larger: `gpt-5.4-nano` wrote some dashboard charts the renderer could not bind, and the two Grok models more often wrote SQL that failed or answered a different reading of the question.
- **Speed.** `grok-4.20-0309-non-reasoning` is the quickest at about 1 second per answer. The reasoning-style models take 3 to 14 seconds for a dashboard. `gpt-5.4-mini` runs with low reasoning effort; more would be slower.
- **A flaw in the first run, now fixed.** The first version of the question set had a tied answer ("Which category has the most tickets?": two categories with 104). The gold answer picked one arbitrarily, and two OpenAI models, which break ties alphabetically, were marked wrong for a fair answer. That question was replaced and a test now guards against ties. The numbers above are from the re-run after the fix.

## What the failures taught us

- **Misnamed chart columns (fixed).** `gpt-5.4-nano` named a headline number `total_amount` where the renderer reads `value`, so it drew blank. The product now looks at the columns a query returns and renames them to the ones the renderer reads, and drops a chart only when nothing numeric is left to plot.
- **SQL with escaped line breaks (fixed).** One answer came back with a literal backslash-n instead of a line break, which does not parse. Such answers are now tidied before they run.
- **Missing FROM (to do).** `grok-4.3` wrote SQL with no `FROM data` in 4 of 84 answers. The plan already proposes one retry that sends the database's error back to the model; these are exactly the cases it would recover.
- **A different reading.** "What was the return on ad spend from July onwards?" was answered per month by one model on both tries, instead of as one figure. That is a fair reading of an ambiguous question, so it counts as wrong here but is not a defect to chase.
- **"Which is highest?" returning every group.** Several models list all groups, best first. That reads fine on screen, which is why it is scored as usable.

## Reading it for a default

For answer quality alone, `gpt-5.4-mini` led, with every dashboard chart working and a median of 3 seconds per answer. `grok-4.20-0309-non-reasoning` is the fastest and held up on dashboards but gave fewer right answers. Until Anthropic and Gemini are measured with the same questions, there is nothing here to justify changing the current default, and no setting has been changed.
