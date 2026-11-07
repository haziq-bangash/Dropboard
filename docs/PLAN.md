# Dropboard plan

Spreadsheet/CSV/JSON in, shareable dashboard out. Browser does the heavy work; Cloud Run stays small and scales to zero.

## Decisions
- **Model:** freemium with a flat subscription. Meter AI generations, published dashboards, hosted storage.
- **Stack:** Next.js (web), Hono (API), Zod spec package, DuckDB-WASM, ECharts or Vega-Lite, Better Auth, Postgres (Neon) with Drizzle, GCS, Stripe, Anthropic API.
- **Data hosting:** free publishes a snapshot (spec + precomputed chart results, no raw rows). Paid can host full Parquet in GCS via signed URLs.
- **Audience:** business/ops Excel users first, then ecommerce stores. Templates: Shopify, Stripe, generic sales/finance.
- **GCP:** separate staging and prod projects on one billing account. Credits expire, so nothing always-on. Budget alerts on both.

## Phases
0. **Foundations:** monorepo, API, spec, Dockerfile (done). CI, deploy to staging, budget alerts. Exit: push to main deploys /health to staging.
1. **Instant dashboard (browser-only):** parse csv/xlsx/json/ndjson in a worker, DuckDB-WASM profile, deterministic chart suggester, renderer, landing page. Exit: 50 MB CSV to dashboard in under 5s, no server call.
2. **Persist and share:** Better Auth, Postgres, save/load specs, snapshot publishing, optional password, SSR public viewer. Exit: a stranger opens a shared link.
3. **AI layer:** /api/generate from schema and stats only, cache by schema hash, quotas, chat edits via spec patches, NL Q&A (model writes SQL, browser runs it). Exit: cost per dashboard under target.
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
