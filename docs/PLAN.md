# Dropboard plan

Spreadsheet/CSV/JSON in, shareable dashboard out. Browser does the heavy work; Cloud Run stays small and scales to zero.

## Decisions
- **Model:** freemium with a flat subscription. Meter AI generations, published dashboards, hosted storage.
- **Stack:** Next.js (web) with Tailwind and shadcn/ui, Hono (API), Zod spec package, DuckDB-WASM, ECharts, Better Auth, Postgres (Neon free tier in production, Docker locally) with Prisma, Stripe, Pilot on the Vercel AI SDK (Gemini on Vertex AI by default). The web app proxies `/api/*` to the API so session cookies stay first-party.
- **Data hosting:** free publishes a snapshot (spec + precomputed chart results, no raw rows). Paid can host full Parquet in GCS via signed URLs.
- **Audience:** business/ops Excel users first, then ecommerce stores. Templates: Shopify, Stripe, generic sales/finance.
- **GCP:** separate staging and prod projects on one billing account. Credits expire, so nothing always-on. Budget alerts on both.

## Free tier (decided)
- 3 saved projects, 3 published links (each carries a small "Made with Dropboard" badge), 10 Pilot requests a day.
- Paid removes the badge and raises or lifts each limit, adds hosted data, scheduled refresh, exports and teams. Exact prices are decided in phase 8.
- Limits live in one entitlements module (plan to limits), so tests, the UI and Stripe all read the same table.

## Phases
Each phase ships as small PRs and ends with a GitHub release.

0. **Foundations (done, v0.1.0):** monorepo, API, spec, Dockerfile, CI, deploy to staging.
1. **Instant dashboard, browser-only (done, v0.1.0):** parse csv/xlsx/json/ndjson in a worker, DuckDB-WASM profile, deterministic chart suggester, renderer, landing page. Exit: 50 MB CSV to dashboard in under 5s, no server call.
2. **Persist and share (done, v0.2.0):** Better Auth, Postgres, save/load specs, snapshot publishing, optional password, SSR public viewer.
   - **Accounts (done, v0.3.5):** Google sign-in, email confirmation, password reset, provider-agnostic mailer (Resend, or console log in development). With no mail provider, confirmation is not required.
3. **Pilot (done, v0.3.4):** generate and refine dashboards from schema and stats only, ask questions in plain language (model writes SQL, browser runs it), cache, daily quota, usage log. Provider-agnostic on the Vercel AI SDK, Gemini on Vertex AI by default (see "Phase 3 as built").

### Phase 4: Workspace (v0.4.0)
The signed-in home, so Dropboard is a place to come back to and not a single screen.
- **App shell:** sidebar (Home, Templates, Account), top bar with project actions, empty states, keyboard shortcuts. Signed-out visitors still get the instant try-it flow.
- **Projects:** list, create, rename, duplicate, delete; each project holds its dashboard spec, Pilot history and publish state. Free tier cap of 3 enforced through the entitlements module.
- **Local data cache:** parsed data kept in the browser's private storage (OPFS) so reopening a project does not ask for the file again. A clear "on this device" indicator, and a one-click way to re-attach or replace the file. Rows still never go to the server.
- **Starter projects:** built-in sample datasets (cashflow, ecommerce orders, marketing, support tickets) that open as real projects.
- **First-run guide:** a short skippable walkthrough, plain wording, no fake urgency or social proof.
- **Account settings:** change email and password, connected sign-in methods, export my data, delete my account and everything under it.
- **Privacy basics:** cookie and analytics consent that only appears if we add analytics; privacy-friendly analytics with no file contents, column names or prompts.
- **Exit:** sign in, create three projects, close the browser, come back and continue without re-uploading.

### Phase 5: Insights and visual breadth (v0.5.0, closed)
Findings are computed in the browser from the data, so they are free to run and need no model call. Pilot only writes words.
- **Findings engine (`packages/engine`):** trends and turning points, outliers, strong correlations, missing-value hotspots, skewed or dominant categories, duplicates, seasonality, period-over-period change. Each finding has a plain sentence, a strength score, the evidence (query and numbers) and a chart that shows it. Unit-tested against the fixtures library.
- **Analysis tab:** summary tiles (rows, columns, completeness, numeric share), ranked findings, distributions and over-time charts, each finding opens its chart.
- **Story tab:** an animated "reading your data" progress, then a narrative page: headline, key numbers, the three or four findings that matter, and a closing recommendation. Pilot writes the text from the findings and stats only (same privacy rule as today); a plain deterministic version works with Pilot off.
- **Recommendations:** suggested next actions per finding, written by Pilot, counted against the daily Pilot limit.
- **Present mode:** full-screen, slide-style walk through the story.
- **Infographic and share cards:** one-page image or carousel from the story, exported as PNG (generated in the browser).
- **Exit:** a messy 5,000-row file produces a ranked findings list and a readable story in under 10 seconds, and every number in it can be traced to a query.
- **Algorithms (from research, Nov 2026).** Spend the effort on free browser-side findings and on guards around Pilot, not on model routing: Pilot already costs about $0.001 per dashboard.
  - **Evaluation first, before the engine.** Three harnesses decide whether an algorithm ships: (1) a null test that shuffles every column of the fixtures and expects near-zero findings at 5% FDR; (2) datasets with planted insights, scored for precision and recall; (3) a set of questions scored on execution accuracy for Pilot's SQL.
  - **Candidate scoring.** Score each candidate by impact (cheap) and significance (expensive). Compute impact for all candidates, prune, then test significance only on the best few (QuickInsights).
  - **Statistical validity.** Findings are generated as one batch, so apply a Benjamini-Hochberg correction across all candidates, and require an effect-size floor as well, because with thousands of rows almost everything is "significant". Use alpha-investing only if findings become interactive. Studies of visual analysis report 60 to 75 percent false insights without such control.
  - **Trends and change points.** In the TCPDBench benchmark no method beat the "no change points" baseline with default settings, so be conservative: PELT with a conservative penalty, a minimum segment length and an effect-size floor, and say nothing when unsure.
  - **Outliers and seasonality.** Robust methods (median absolute deviation or IQR for outliers, STL for seasonality). These are standard but not verified by the research, so the harness above decides.
  - **Pilot SQL.** Keep the SQL guard, add a template layer for recurring question shapes (grammar-constrained decoding in the literature, reported up to 36% higher execution accuracy), and allow one repair retry that feeds the database error back. Escalate to a stronger model only when a verifier (guard or execution failure) fails, never on a learned router.
  - **Chart choice.** Keep the deterministic suggester. Rank charts with Draco-style constraint weights fitted offline from Pilot's pairwise judgments, then ship the ranker. Offer two or three alternatives, since one question often has several valid charts.
  - **Line charts.** Bucket by minimum and maximum in SQL (MinMax) to cap points near twice the chart width. It is the most stable under panning. M4 is not preferred.
  - **Profiling.** Rules plus DuckDB's sniffer for types. DuckDB's approximate aggregates (approx_count_distinct, approx_quantile, approx_top_k) for large files, with error measured on our fixtures because the docs give no bounds. Ask Pilot about ambiguous columns by name only.
  - **Cost.** Keep the exact cache. No semantic cache, because a wrong cached answer to a data question is costly. Do not rely on provider prompt caching: our prompts are likely under the minimum size and the discount has been reported unreliable, so budget uncached prices.
  - **Scope.** Keep Pilot narrow with a human in the loop: the best models score about 30 percent on open-ended data-science agent benchmarks.
  - **Exit additions:** zero findings above the 5% FDR on shuffled data, planted insights recovered with precision and recall reported, and Pilot execution accuracy reported on the question set.
- **Visual breadth: maps, clusters and more chart types (Nov 2026).** A spreadsheet with places in it should open as a map, not a bar chart. This ships in the insights phase, after the findings engine, and each step is its own release.
  - **New chart types.** Added to the spec and renderer in this order: choropleth map (regions shaded by a measure), point and cluster map, heatmap (two categories, or weekday by hour), histogram, treemap, box plot, calendar heatmap, then funnel, Sankey and flow map. All render with ECharts, which can draw maps from registered GeoJSON, scatter and flow lines on a map, and heatmaps.
  - **Finding places in the data.** The profiler recognises latitude and longitude columns (by name and value range, as a pair), country names and ISO codes, US states and abbreviations, and later cities (a small bundled list) and postal codes. Each match has a confidence, and the column menu lets a person correct it.
  - **Boundaries without a map service.** Region shapes come from Natural Earth (public domain), simplified with mapshaper, stored as TopoJSON in the web app, and loaded only when a place column is detected. Countries first, then US states, then EU regions. Maps have no street basemap by default, so there are no tile requests: zero tile cost, nothing about what someone is looking at leaves the browser, and it works offline. A street basemap is an optional later add-on from our own PMTiles file on Cloud Storage, because OpenStreetMap's public tile servers do not allow heavy commercial use.
  - **Location clusters.** Computed in plain SQL on the in-browser table: grid and hexagon binning at a size that follows the zoom, with counts and averages per bin. Hotspots are reported as findings: a bin is only called a hotspot if it holds clearly more than an even spread would, tested across all bins with the same Benjamini-Hochberg correction as other findings. DBSCAN or k-means, if wanted, run on the bins and never on raw rows. DuckDB's spatial extension is not used: it is a separate runtime download and has had version-specific breakage in the browser.
  - **Privacy rule for maps.** Exact coordinates are sensitive. A published map contains only bins that hold at least a minimum number of rows (default 5), never individual points. The published snapshot already caps rows per chart; maps get this extra floor on top.
  - **Scale.** Up to about 100,000 points are drawn directly with ECharts' large-scatter mode. Beyond that, or past the cluster threshold, the map shows bins (at most about 2,000 per chart), so it stays fast on a 50 MB file.
  - **Choosing a chart.** The suggester and ranker gain geography-aware rules: a place column plus a measure gives a choropleth, a latitude and longitude pair gives a cluster map, two categories plus a measure give a heatmap, a date plus a weekday or hour gives a calendar view. Pilot can pick among these through the same chart schema and the SQL guard.
  - **Samples.** Add a sample with locations (deliveries or store visits with coordinates and regions) so the maps show up in the starters.
  - **Exit:** a file with latitude and longitude opens with a cluster map; a file with country or state names opens with a choropleth; a published map holds no individual coordinates; a 50 MB file with coordinates still draws in under 5 seconds.
- **Progress (Nov 2026).** Shipped: the coordinate map, a country-shaded region map and a US state map (shapes from Natural Earth 110m, public domain, served from `apps/web/public/geo/`), histogram, heatmap, box plot, calendar, a text description for every chart, save as image, present mode, and Pilot choosing every one of these by naming columns. The Pilot SQL repair retry and a findings narrative were approved on 8 Nov 2026 (aggregates only, never rows).
- **Phase 5 closed at v0.5.0 (8 Nov 2026).** The visual breadth and Pilot-by-columns work is the release. Carried forward, not built: the findings engine and Analysis and Story tabs, the infographic export, cities and postal codes, treemap, funnel, Sankey and flow map, the correction menu for detected place columns, the Pilot SQL repair retry and template layer, the chart ranker, and the narrative.
- **Measured: large file (8 Nov 2026).** A generated CSV of 50.3 MB and 1,000,000 rows with latitude and longitude, dropped into the try-it page in headless Chromium on a developer desktop, showed its first charts and the map in 3.7 to 4.2 seconds at first. Timing each step showed 1.4 to 1.5 seconds to read the file, about 0.1 second to profile it, and about 1.4 seconds of chart queries, of which one (the histogram) took 0.87 second against about 0.04 for a typical chart. Rewriting that query to count in one pass brought it to 0.08 second, and the whole first draw to 2.8 to 3.0 seconds (three runs). Reading the file is now most of the time. An idea not yet tried: DuckDB-WASM's multi-threaded build parses faster but needs cross-origin isolation headers, which can break sign-in popups and third-party embeds, so it needs its own testing. Not measured: other machines, phones, or files larger than 50 MB.

### Phase 6: Sources (v0.6.0)
- **Paste and drag:** paste copied cells or a table from a page.
- **Google Sheets:** shared or published sheets by link, plus a signed-in picker later.
- **URL or API:** JSON or CSV endpoints. This needs a server fetch because of browser CORS, so it ships with an SSRF guard: public addresses only, https, size and time limits, no redirects to private ranges, and a per-user rate limit.
- **Open data:** a searchable catalogue of public datasets (World Bank, OWID, Eurostat, government portals) that import straight into a project.
- **Multiple tables per project:** joins and relationships through DuckDB, with Pilot given the schemas only.
- **Refresh:** re-read a file, re-fetch a URL, or replace data while keeping the dashboard.
- **Exit:** start a project from a published Google Sheet link in under 30 seconds.

### Phase 7: Builder (v0.7.0)
- **Manual editing:** drag and resize widgets on a grid, add, duplicate and remove widgets, undo and redo, keyboard accessible.
- **Widget settings:** pick columns, aggregation, sort, limit, colors, number and date formats; edit the SQL for power users (still behind the SQL guard).
- **Filters:** dashboard-level filters and click-to-filter across charts, kept in the share link.
- **Themes:** a few brand-matched palettes, light and dark, plus custom accent color for paid plans.
- **Auto-dashboard button:** regenerate the layout deterministically without Pilot.
- **Preview and publish:** preview exactly what viewers see, then publish as a snapshot (the free badge applies).
- **Exit:** build a four-chart dashboard by hand, with filters, in under two minutes.

### Phase 8: Monetization (v0.8.0)
- **Entitlements module:** plan to limits (projects, published links, Pilot requests, hosted storage, exports, teams), enforced in the API and mirrored in the UI.
- **Stripe:** checkout, customer portal, webhooks (signature-checked, idempotent), tax handled by Stripe. Plans: free, one paid individual plan, one team plan. Prices decided just before launch.
- **Badge:** "Made with Dropboard" on free published links; paid removes it.
- **Metering:** Pilot usage per user from the `ai_generation` log, shown on an account usage page.
- **Hosted data:** paid projects can keep full data in GCS as Parquet behind signed URLs, so large files and scheduled refresh work. Neon/GCS credentials stay in Secret Manager.
- **Exports:** PDF and PPTX of a dashboard or story, PNG of a chart, CSV of any table.
- **Share-link controls:** expiry dates, password, revoke, and a per-link view count.
- **Exit:** test-mode subscription upgrades limits instantly, downgrade and cancel behave correctly, webhooks replay safely.

### Phase 9: Growth (v0.9.0 onward)
- **Templates and SEO pages:** Shopify, Stripe, GA4, generic sales and finance, each with a landing page, sample file and a dashboard that opens on it; social share images once a final domain exists.
- **Connectors with scheduled refresh:** Shopify, Stripe, GA4, Google Sheets (signed in), via Cloud Scheduler and Cloud Run jobs; tokens encrypted at rest.
- **Alerts:** "tell me when this number crosses a value", by email, with a weekly digest option.
- **Embeds:** iframe embed of a published dashboard with an allowed-origins setting.
- **Public gallery:** opt-in showcase of published dashboards.
- **API and MCP server:** create projects and read findings programmatically; same entitlements.
- **Teams:** workspaces, roles, shared projects, audit log.
- **Production:** separate prod GCP project, custom domain, manual promote with traffic-split rollback, budget alerts on both projects.

### Cross-cutting, scheduled into the phases above
- **Security:** rate limit on the public share endpoint (phase 4), per-user limits on every write route, SSRF guard (phase 6), webhook verification (phase 8), secret rotation checklist, dependency audit in CI.
- **Accessibility:** an automated axe scan (WCAG 2.0 and 2.1, A and AA) runs in the browser tests on the landing page, sign-in and reset, the workspace, the account page, a project's dashboard, insights and story tabs, menus and dialogs, and a published dashboard; it found and fixed real contrast problems, and a failure lists each element and how to fix it. Still to do: keyboard-path tests, and text summaries for charts. Automated scans catch roughly the mechanical problems, so using the product with a keyboard and a screen reader stays on the list.
- **Performance budgets:** time-to-dashboard stays under 5 s for 50 MB; bundle and image size budgets stay enforced in CI.
- **Observability:** structured logs, error reporting, and a cost view (Pilot tokens, Cloud Run, storage) before phase 8 launches.
- **Design rules:** Dropboard palette and tone; sentence case; no sparkle icons; the assistant is "Pilot"; no fake testimonials, ratings, badges or countdowns.

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
- **Provider-agnostic.** Pilot is built on the Vercel AI SDK. `AiService` (generate, ask) is the only thing routes know; `ai/ai-sdk.ts` implements it for any AI SDK model, and `ai/providers/index.ts` is the only file that knows about vendors. Choose with `AI_PROVIDER` (`google`, `anthropic`, `openai`, `xai`, `none`) and `AI_MODEL`; adding a vendor is a few lines in that file. Cache keys and the usage log carry `provider/model`.
- **Default: Gemini on Vertex AI**, model `gemini-3.5-flash-lite`, authenticated as the Cloud Run service account (Application Default Credentials), so there is no API key to leak. Anthropic remains available. Without a configured provider the routes return 503.
- **Room to grow:** the AI SDK also provides tool calling, multi-step agent loops and tool-approval hooks for human-in-the-loop flows. It is not a graph or durable-workflow engine; if we need LangGraph-style orchestration it sits on top of the same `AiService` seam.
- Measured live on Vertex with `gemini-3.5-flash-lite`: a dashboard takes about 1.7 s and about 1,050 tokens (724 in, 332 out), a question about 0.7 s, a refinement about 1.3 s. At the list price third-party trackers show ($0.30 per million input, $2.50 per million output; confirm in Billing) that is about $0.001 per dashboard, roughly ten times under the target.

## Workflow
- Work on a branch, open a PR, wait for CI, merge, then sync main.
- Before pushing: typecheck, unit and API tests, e2e tests, and build and run both Docker images.
- Each phase ends with a GitHub release.

### Pipeline
- **CI runs on pull requests only.** Merging does not re-run the same checks. A docs-only change skips browsers and builds; checks, browser tests and image builds run in parallel, with the Playwright browser and Next compiler caches kept between runs. A final `ci` job gives one result for the whole pipeline.
- **Deploys ship what was verified.** Each image is tagged with a hash of exactly what it is built from. The deploy builds it only if that tag is not in Artifact Registry yet, and redeploys a service only if it is not already running that image with the same settings. An unchanged backend is neither rebuilt nor redeployed, a failed deploy heals on the next run, and a rollback reuses an old image. Run the workflow manually with "force" to redeploy anyway.
- **Docker builds reuse layers.** Dependencies install from the manifests alone, so a code change does not reinstall them, and Next keeps its compiler cache between builds.
- Docs-only changes do not deploy.
