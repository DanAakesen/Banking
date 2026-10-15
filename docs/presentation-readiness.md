# Presentation readiness — 22 October 2026

Updated 12 October 2026. Dan presents **Banking in Demo on 22 October**. Banking Main coordinates; the fresh Banking cloud task implements this batch. The published Banking environment, `/workspace/Banking`, the `DanAakesen/Banking` remote and clean baseline `f7dc607c0e3e85c5265624ade61c3c512cdd01ba` were verified before editing. GitHub remains authoritative.

## Priorities and release boundary

1. Protect Demo/Dan isolation, explain actual data and provider states, and keep the core Demo journey reliable.
2. Close confirmed advisor read gaps; reuse the Pension upload/review/save workflow; fix observed layout and loading issues.
3. Complete a controlled deployment only after separate authorization, then repeat the presentation journey on Azure and Dan's own device.

**This batch is not deployed.** Azure `/api/runtime-info` still reports `2026.09.29-saxo-session-keepalive`, API contract v1, shared Demo. A passing cloud preview uses new frontend files against that existing Azure backend; it does not prove the new advisor or parser runs in production. No production financial records, provider settings, orders, credentials or resources were changed. Only Demo browser sessions and read-only app/provider requests were used for live acceptance.

**PFA automatic/API integration is parked and unavailable.** Dan will investigate downloading a statement. No actual PFA file or format has been supplied. Existing support is **PensionsInfo JSON**, plus manual entry of dated balances and optional annual pre-tax pension/retirement age. PFA PDF, image OCR and arbitrary CSV parsing are not implemented or claimed. Do not add a paid OCR dependency or invented figures.

## Core journey checklist

“Preview verified” below means the current cloud frontend with Azure read-only Demo data. “Fixture verified” means deterministic isolated tests, not owner/provider acceptance. All Dan acceptance remains separate from Demo.

| Journey | Demo evidence on 12 October | Dan / remaining acceptance | Deployment status |
|---|---|---|---|
| 360 | Preview renders; first-entry and return timings measured; currencies, missing assets and separate SIM snapshot covered by calculations/tests | Owner balances, selected periods and real wealth comparison pending | Existing page deployed; loading improvements pending deployment |
| Accounts | Preview directory, ledger and booked-history section render; reference screenshots captured | Owner read-only account/period reconciliation pending | Existing page deployed; unchanged financial behavior |
| Review / categories | Preview queue and category/rule page render, with no save | Explicit classification/review confirmation on presentation device pending | Existing workflow deployed; no new write behavior |
| Budgets | Preview saved plan page renders; actuals/forecast reads and independent month routing fixture verified | Owner plan, mappings, coverage and forecast acceptance pending | Existing page deployed; earlier 360 budget loading pending deployment |
| Goals | Preview gallery renders; registered text/voice detailed journey read verified | Owner goal progress/forecast freshness pending | Existing page deployed; dedicated `goal_journey` tool pending deployment |
| Markets / Investments | SIM account/aggregate read succeeds; four holdings and empty working orders visible. Empty real watchlist observed. Current provider snapshot is recorded separately below | Populated real watchlist, owner LIVE brokerage, actual zero/unknown/failure combinations and device acceptance pending | Existing pages deployed; 1 October independent delay UI and this advisor coverage pending deployment |
| Pension | Preview empty saved-statement state verified. Import review/update, locale input, file errors, conflict/retry and reload persistence fixture verified | Real PFA sample and its supported-format assessment pending; owner save acceptance pending | Existing JSON/manual flow deployed; UI/parser refinements pending deployment |
| Chat / voice | Registered schemas → actual text/voice host → adapter routing verified with a fake provider transport; authorization and confirmation regressions pass | Real-model wording/financial grounding, chat steps on Dan's device and physical microphone acceptance pending | Existing service deployed; additional read resources pending deployment |

- [x] Cloud/Git/runtime baseline, read-only screenshots, measured bottleneck and implementation.
- [x] Isolated reads, upload failure states, UI matrix and appropriate build/test checks.
- [ ] Authorized deployment and postdeploy asset/runtime verification.
- [ ] Demo rehearsal on the presentation device, including refresh, navigation, chat, and provider expiry/retry.
- [ ] Separate owner sign-in, private Dan acceptance and microphone accuracy.
- [ ] Actual pension statement format/sample and reviewed values. This does not block showing the honest manual-entry workflow.

## AI data-access audit

The model sees `voiceTools` in `prototypes/advisor/voice.mjs`. `createVoiceClient.route` registers and validates these tools. Text `/api/advisor` and voice `/api/voice/delegate` both dispatch through `bankingTool` in `server.mjs`; `read_app_data` enforces one to four queries per round, three rounds/eight distinct queries, then calls `readAppData` in `app-tools.mjs`. `bankingRequest` in `banking-context.mjs` forwards the authenticated session/mode to existing Banking APIs, never an arbitrary model-provided URL.

`LocalAdvisorProxy` derives identity from the valid browser cookie and rejects Demo requests for Live before forwarding; client screen metadata supplies selections only. Backend workspace filters and `SaxoAccess.RequireMarketAccess` remain authoritative. The shared LIVE research guard applies only to market search/chart, never LIVE balances, holdings, orders, private activity, credentials or OAuth.

| Page data | Registered read and backend source | Coverage / semantics |
|---|---|---|
| Accounts / actuals / balances | `read_banking_data` → `/api/advisor-context`; `accounts`; new `account_insights` → `/api/account-insights` | Both booked and available observations remain distinct. Explicit periods/currencies override selections; no FX. Main 360 figures use the main period, not an independently selected cash-flow period. |
| 360 allocation | New `overview_wealth` → authenticated `/api/advisor-context`, using shared `wealth360Model` | Available cash plus dated non-cash statements; savings already included. Missing asset classes stay null/partial. No debt deduction or SIM; booked net wealth is a different measure. No recreated chart formula. |
| Budgets, entries, actuals, forecasts | `read_banking_data` includes saved plans/all entries/progress; new `budget_progress`; existing `budget_forecast` → plan progress + cash flow | Forecast reuses `budgetForecast`; full monthly allowances versus period actuals, currency, missing mappings and coverage preserved. Independent selected budget month supported. No invented recurring payments. |
| Transactions / categories / rules | Existing `read_transactions` (100 booked rows); new `transactions` → `/api/transactions`; `transaction_detail`, `categories`, `rules`, `read_review`, `review_history` | The new route exposes other page-visible statuses, including pending, with bounded offset/limit (max 200). Returned page and total remain distinct; no inferred complete-history totals. |
| Bank history | `balance_history` → `/api/accounts/{id}/balance-history` | Existing booked observations, dates and gaps retained. Never generated historical balances. |
| Goals / journeys | `read_goals`/advisor context already include progress and recent journeys; `goals`; new `goal_journey` → `/api/goals/{id}/journey` | Dedicated direct read now available in both schemas/hosts. API owns its recent three-month window, freshness, reconciliation, forecast and first 30 transactions with total count. Older transactions require pagination reads. |
| Pension / loans / wealth | `read_banking_data` includes saved statements and loans; `wealth`, `loans`, `wealth_history` | Saved normalized statements only, with dates, currency, source notes and optional annual projection. Original JSON/PDF, CPR and contacts are not AI sources. Pension income is not capital; loan scenarios are not debt. Demo history remains explicitly synthetic; owner history unavailable when absent. |
| Investments | New `saxo_portfolio` → GET `/api/investments/saxo/portfolio`; `saxo_status`; existing `saxo_orders` | Previously `saxo` reached only POST `/preview`. Raw opening fees were already in positions; the missing aggregate adds independent portfolio/order/activity errors and timestamps, seven-day activity, truncation flags and shared `investmentSummary` cash/settlement reconciliation. Unknown fees/valuation/P&L remain unknown. No claim of verified performance history. |
| Markets / watchlist | `market_search`, `market_chart`, `watchlist` | Shared Saxo LIVE research allowed for Demo. Source, quote/history statuses, independent delay and retrieval timestamps preserved; null delay unknown, zero no reported delay. Watchlists are research interests, not holdings. |
| SIM preparation / financial edits | Existing staged proposals, ticket/precheck and explicit SIM confirmation | Unchanged. Research cannot save, submit an order or gain authorization from screen state. Acknowledgement is not a fill; LIVE execution remains disabled. |

`read-coverage.test.mjs` exercises the actual registered model tool list through both HTTP host routes and the real adapter, with deterministic provider/API transports. It covers 15 resources in each channel, SIM versus owner routing, Demo LIVE denials, forged screen identity, partial portfolio/fees, zero/null chart delays and independent times, pagination, and invalid inputs. Existing suites cover confirmations, unknown writes, cross-session proposals, conversation/memory isolation and the authenticated proxy boundary. These are not live OpenAI or physical microphone tests.

Intentionally unavailable: payments/bank transfers, LIVE order execution, automatic PFA access, historical Saxo performance not supplied by its verified API, unsupported order types, tax/insurance projections absent from saved statements, unlimited transaction/history exports, and private data from another workspace. Provider sign-in/entitlement failures are reported as unavailable; no alternative or fabricated feed is used.

## Pension implementation and validation

The existing `wealth-ui.js` file input → `/api/pension/statement-preview` → review form → normal versioned `/api/wealth` save remains the single workflow. The page now uses the same scenic composition, glass controls and panel headings as Accounts, with recorded value, product count and oldest statement date. The single-action header group no longer reserves an empty second grid column. On narrow screens product content precedes the secondary wealth summary.

The file chooser states JSON/60 KB support. Malformed JSON, unsupported file type, empty/unsupported balances, oversized files and read failures have actionable states. Only allowlisted scalar scheme facts and masked references leave the browser for preview. Metadata, contacts, CPR fields, insurance values and original file/name are neither saved nor passed to chat. The backend independently enforces size/provider/scheme limits, valid currency, amount precision and date bounds. Preview and save use the same Copenhagen calendar day as the form, including the UTC midnight boundary. Locale strings in JSON are rejected/skipped rather than guessed; the manual form supports Danish and English amount separators and native date input.

An exact single masked-reference product/provider/currency match opens the existing product with its concurrency version; the review form also allows choosing an existing product explicitly. It shows the prior date/value before saving. No auto-save occurs. Stored optional projections are visible and must be checked against the new statement; forecasts are not parsed from JSON. Stale selection/navigation responses cannot replace the current preview. Version conflicts preserve the user's form and require review, without an automatic write retry.

Browser persistence evidence uses an isolated file-backed HTTP fixture: save existing product, reload, verify one updated record and unchanged projection; stale version fails without a duplicate. This verifies the UI protocol and reload workflow. The existing SQL Server LocalDB `WealthTests` integration cases cannot run on this Linux environment and were **not** represented as passing database persistence tests. Backend schema, unique product index, workspace filters and row-version path remain unchanged and were reviewed. No production save was used to fill this acceptance gap.

## Performance evidence

Target: first 360 readiness and Accounts/Pension/360 navigation. Chromium at 1440×1000, three separate fresh Demo browser contexts before and after, same routes and app preferences, ordinary sequential navigation. No provider load/burst tests. Times below include data and final page-loading transition; first entry also includes landing assets/session entry. Cold Azure latency makes a small live sample noisy.

| Live cloud-preview → Azure Demo, milliseconds | Before samples | After samples | Median before → after |
|---|---|---|---|
| First 360 | 16484, 6625, 6578 | 9002, 5770, 4568 | 6625 → 5770 |
| Switch to Accounts | 1794, 1611, 1765 | 2043, 1983, 1394 | 1765 → 1983 |
| Switch to Pension | 1311, 1298, 1262 | 1257, 1249, 1255 | 1298 → 1255 |
| Return to 360 | 3300, 3126, 3433 | 3236, 2898, 2882 | 3300 → 2898 |

Trace-confirmed bottlenecks: identical account-insights read twice during each 360 navigation; active budget → progress → cash flow started only after the other overview reads. The fix shares only the identical promise inside that navigation and starts the existing budget read chain alongside independent overview reads. No cross-navigation/workspace cache or source TTL was introduced; existing sequence/mode guards still reject stale results. Empty-budget handling also avoids re-reading the active plan.

Controlled replay: same captured **Demo-only** read payloads, all requests fulfilled in-process, 150 ms per API response, reduced motion and identical routes; three fresh contexts per version. This isolates frontend orchestration from provider/Azure timing.

| Controlled replay median, milliseconds | Before | After |
|---|---:|---:|
| First 360 | 1387 | 1032 |
| Return to 360 | 1152 | 836 |
| Accounts | 696 | 694 |
| Pension | 503 | 504 |

360 API reads fell from 25 to 24 per navigation (including session/mode and the independent SIM snapshot). First 360 improved 25.6%, return 27.4% in this controlled sample. The live medians improved 12.9%/12.2%, but are observations, not a promised service latency. Accounts' live increase despite stable replay demonstrates the network variability.

Data/render split from the live traces: median first-entry last required financial response was 5265 → 4309 ms after page navigation; the remaining visible-page tail was 1360 → 1461 ms. On return, financial requests spanned 2724 → 2308 ms, with 576 → 590 ms of remaining navigation/render/loading transition. These tails include deliberate loading animation and browser scheduling, not pure CPU render time. Static transfer was about 1.63 MB in both versions, including the preserved scenic assets; no measured evidence justified asset/bundle or Markets rewrites.

## Evidence and checks

Ignored runtime evidence is under `artifacts/presentation-readiness/`; it is not source or a deployment artifact. `before-timings.json` / `after-timings.json` record per-request and resource timings, `before-replay.json` / `after-replay.json` record fixed-latency replay. `measure.cjs`, `capture.cjs`, `replay.cjs` record the measurement procedure; `demo-read-fixture.json` is the captured Demo-only input and is intentionally excluded from Git. Baseline frontend files are retained there solely for before/after replay.

Screenshots: `before-pension-1440.png`, `before-accounts-1440.png`, `after-pension-1440.png`, `live-{review,categories,budgets,goals,pension,markets,investments}-1440-light.png`; `pension/` contains review/save/error/empty/conflict screenshots at 1440, 1024 and 390 px across Graphite/Light/Sand and Danish mobile. Accounts references were captured with the same viewports/themes. `artifacts/saxo-response-delay/` contains the existing delay-suite screenshots.

| Check | Result |
|---|---|
| Release solution build, .NET 10.0.401 | PASS: 0 warnings, 0 errors |
| Node UI + advisor tests, serial | PASS: 205, fail 0, skip 0 |
| Pension parser + Saxo market/portfolio/readiness tests | PASS: 89, fail 0, skip 0 |
| Frontend-host transport tests | PASS: 18, fail 0, skip 0 |
| Advisor proxy authorization tests | PASS: 14, fail 0, skip 0 |
| Pension browser matrix | PASS: 10 scenarios, including locale/save/reload, invalid input, stale response, conflict and retry |
| Saxo delay browser regression | PASS: 14 scenarios, desktop/tablet/mobile, dark/light and Danish mobile |
| Meaningful changed UI | No document overflow, CSP violations or page errors in isolated matrix; no one-sided borders; visible form focus; shared Accounts anatomy checked |
| Production pension writes / private owner / microphone | NOT RUN: outside this batch's read-only production scope / owner acceptance |
| SQL LocalDB integration persistence | NOT RUN: Windows-only fixture unavailable on Linux; no production database substitute |

Commands: `dotnet build Banking.sln --no-restore -c Release`; `node --test --test-concurrency=1 tests/ui/*.test.mjs prototypes/advisor/*.test.mjs`; `dotnet test tests/Banking.Tests/Banking.Tests.csproj --no-build -c Release --filter 'FullyQualifiedName~PensionStatementTests|FullyQualifiedName~SaxoMarketDataTests|FullyQualifiedName~SaxoPortfolioTests|FullyQualifiedName~SaxoReadinessTests'`; the same test project with `--filter FullyQualifiedName~LocalAdvisorTests`; `dotnet test tools/frontend-host/tests/FrontendHost.Tests/FrontendHost.Tests.csproj --no-restore -c Release`; `node tests/ui/pension-import.browser.cjs`; `node tests/ui/saxo-response-delay.browser.cjs`.

## Dated provider snapshots, not current guarantees

- **1 October:** twelve real read-only preview → Azure Demo integration stages passed for MSFT/AAPL Markets and Siemens/MSFT Investments; feature `ee74f9a` was merged, not deployed. Preserve this historical result; do not infer perpetual sign-in/entitlements.
- **12 October:** runtime build remains `2026.09.29-saxo-session-keepalive`; real Demo SIM portfolio aggregate returned `Ok`, with four holdings, no working orders and no recent activity in the returned seven-day window. Research watchlist is empty. Markets and Investments chart requests returned HTTP 200; the Siemens Investments chart visibly rendered Saxo LIVE history and quote with independent 15-minute delay/retrieval labels. Current read-only evidence is in `live-saxo-journeys.json`, with no application page/CSP errors or overflow after chart completion. This limited recheck does not repeat all twelve historical integration stages. Served Azure `saxo-session.js` SHA-256 remains `78241ca4f1a862819bfca931a3845ad7d7345f7b0110c4d85377044be66205e9` and still lacks `saxoDelayLabel`; the labels shown here are from the cloud preview frontend, not the deployed frontend.
- Actual provider zero/unknown/delayed/failure permutations, populated saved watchlists and private LIVE holdings still require separate acceptance. Fixture coverage is not provider acceptance. No subscription, provider sign-in, trade or credential change was performed.

## Delivery

Implementation branch: `codex/presentation-readiness-20261012`, based on `f7dc607`. Feature/main SHAs and PR are recorded in the final delivery report after remote verification. No tracked GitHub Actions/Azure pipeline deploy trigger exists; deployment uses the explicit authenticated deployment script. GitHub connector metadata is available; CLI protection inspection remains Forbidden. Required server checks/protection must still be respected. No force push or bypass is allowed.

Deploy-ready scope: additional advisor reads and host allowlist, Pension input/parser/review refinements, shared single-action header fix, 360 request orchestration, and the already merged independent Saxo-delay feature. Release authorization is still required; deployment, when authorized, must use GPT-6 Luna at medium per Dan's standing preference. The release rehearsal must include Dan and the physical microphone rather than silently marking those accepted from Demo fixtures.


## 15 October follow-up

[Shared Demo repair and annotation compatibility](demo-repair-2026-10-15.md) records the applied Danish classification/internal-transfer repairs, protected manual decisions, period/account/budget/goal reconciliation and responsive browser evidence. The Demo data correction is effective through normal deployed APIs. Current Codex annotation hashes and the synthetic bill-counterparty source fix require an authorized release; no code was deployed. This does not repeat the already merged presentation-readiness batch or complete Dan/microphone/PFA acceptance.
