# Dropboard plan

Spreadsheet/CSV/JSON in, shareable dashboard out. Browser does the heavy work; Cloud Run stays small and scales to zero.

## Decisions
- **Model:** freemium with a flat subscription. Meter AI generations, published dashboards, hosted storage.
- **Stack:** Next.js (web) with Tailwind and shadcn/ui, Hono (API), Zod spec package, DuckDB-WASM, ECharts, Better Auth, Postgres (Neon free tier in production, Docker locally) with Prisma, Stripe, Anthropic API. The web app proxies `/api/*` to the API so session cookies stay first-party.
- **Data hosting:** free publishes a snapshot (spec + precomputed chart results, no raw rows). Paid can host full Parquet in GCS via signed URLs.
- **Audience:** business/ops Excel users first, then ecommerce stores. Templates: Shopify, Stripe, generic sales/finance.
- **GCP:** separate staging and prod projects on one billing account. Credits expire, so nothing always-on. Budget alerts on both.

## Phases
0. **Foundations (done, v0.1.0):** monorepo, API, spec, Dockerfile (done). CI, deploy to staging, budget alerts. Exit: push to main deploys /health to staging.
1. **Instant dashboard (browser-only) (done, v0.1.0):** parse csv/xlsx/json/ndjson in a worker, DuckDB-WASM profile, deterministic chart suggester, renderer, landing page. Exit: 50 MB CSV to dashboard in under 5s, no server call.
2. **Persist and share (done, v0.2.0):** Better Auth, Postgres, save/load specs, snapshot publishing, optional password, SSR public viewer. Exit: a stranger opens a shared link.
3. **AI layer (built, v0.3.0; needs an Anthropic key to run):** /api/generate from schema and stats only, cache by schema hash, quotas, chat edits via spec patches, NL Q&A (model writes SQL, browser runs it). Exit: cost per dashboard under target.
4. **Monetization:** Stripe, entitlements, metering, hosted data, PDF/PPTX export.
5. **Growth:** source templates and SEO pages, connectors with scheduled refresh, alerts, embeds, gallery, API/MCP, teams.

## Testing
- **Unit (Vitest):** spec schema, type inference, chart suggester, SQL guard, entitlements.
- **API (Vitest + app.request):** routes, validation, auth, rate limits; real Postgres via container.
- **Data engine (browser mode):** DuckDB-WASM against a fixtures library of ugly files (encodings, Excel date serials, mixed types, huge files).
- **E2E (Playwright):** upload, dashboard, save, share, open as stranger.
- **AI:** CI replays recorded responses; nightly job runs real calls over about 30 schemas and checks validity.
- **Performance:** time-to-dashboard at 1/10/50 MB, bundle budget, Lighthouse SEO on public pages.
- **Container:** build, run, hit /health, fail above 150 MB.
- **Rules:** AI output is untrusted; every spec is Zod-validated and every query passes a SQL guard (SELECT-only, allowlisted functions, row limit, `data` table only).
- **CI gates:** typecheck, unit, API, container smoke on every PR; E2E on web changes; AI eval nightly.
- **Environments:** local, staging (auto from main), prod (manual promote, traffic-split rollback).

## Phase 3 as built
- `POST /api/ai/generate` designs or edits a dashboard (pass `current` to refine, which covers chat-style edits). `POST /api/ai/ask` returns one guarded SQL query that the browser runs.
- The model sees only column names, types, null counts and approximate distinct counts. Never row values.
- Model output is untrusted: structured output, then the server rebuilds the spec, drops charts whose SQL fails the guard, and the browser drops charts that do not bind to the real columns.
- Results are cached by prompt version, model, column names and types, and instruction. Cache hits are free; misses count against a per-user daily limit (default 10, `AI_DAILY_LIMIT`). Failed and declined calls are not charged. Every call is logged with token counts for Phase 4 billing.
- Default model is `claude-haiku-5-5` (set `ANTHROPIC_MODEL` to change). Without `ANTHROPIC_API_KEY` the routes return 503.
- Not yet measured: real cost per dashboard and output quality against the live model. Both need a key; the tests use stubbed model responses.

## Workflow
- Work on a branch, open a PR, wait for CI, merge, then sync main.
- Before pushing: typecheck, unit and API tests, e2e tests, and build and run both Docker images.
- Each phase ends with a GitHub release.
