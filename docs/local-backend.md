# Banking — local backend and evidence

## Cash-flow chart aggregate — implemented locally

GET /api/cash-flow accepts from, to, currency and optional accountId. It returns at most 3,661 daily totals with income, spending, net, cumulative net and booked transaction count, plus account-history coverage and undated exclusion count. It shares the existing booked/current/confirmed-transfer-exclusion rules and uses a serializable read snapshot. No current-page sampling, bank calls or balance-history reconstruction. Unknown account scope returns 404; an empty workspace returns no points. A backend test reconciles daily sums against account insights, verifies blank days, negative movement, currency/status/transfer exclusions, bounds and workspace isolation. The backend suite now passes 54 tests.


## Named budget plans — implemented locally

`GET /api/budget-plans` returns the workspace's plans, entries, monthly/annual summaries and legacy record count. `POST /api/budget-plans` creates or atomically replaces a plan using stable plan/entry IDs, request ID and current rowversion for edits. `GET /api/budget-plans/active` supplies planned metrics. `POST /api/budget-plans/{id}/activation` requires target version and expected current active ID; a unique SQL index permits at most one active plan. `DELETE /api/budget-plans/{id}?version=...` requires prior deactivation. `GET /api/budget-plans/suggestions?currency=DKK&months=3` is a bounded, read-only preview.

Monthly summary partitions entries into Income, Expense without Savings, and Expense with Savings. Available = income − ordinary expenses − savings. Four-decimal entered amounts are stored with 1/3/6/12-month recurrence; aggregation precedes display rounding. Negative available amounts are preserved. UI labels this planning data, not actual bank spending or achieved savings. Parent concurrency protects entire merge/edit requests; duplicate immediate retries return the saved plan, while reuse with different content fails. Encrypted backups include plans/entries/active selection; older archives remain accepted. Five new scenario tests bring the backend suite to 53 passing tests. See [budget behavior and limits](budget-redesign.md).

## Review inbox — implemented 7 September 2026

`GET /api/review` accepts accountId, kind (All/Category/Transfer), sort (newest/oldest) and offset; returns counts plus eight queue items. `GET /api/review/history` returns ten journal summaries per page. `POST /api/review/actions` applies Categorize, ConfirmTransfer, Skip or Dismiss. `POST /api/review/actions/{id}/undo` requires the current action version. Existing authentication and workspace isolation apply to every route.

Only current booked entries are considered. Suggestions require equal opposite amounts, the same currency and booking date, different accounts, and exactly one debit/credit in that group. Ambiguous groups are not suggested. Pairing happens before account filtering; confirmed pairs are excluded from income/spending. Dismissal exposes uncategorised legs and survives category edits; Skip snoozes for 24 hours. Categorisation supports atomic batches up to 50 and an optional single-item future contains-rule. All changes are app metadata; no bank fields or payments are changed.

Actions and guarded Undo use serializable transactions. Stale selections and later edits produce explicit conflicts. The queue fails visibly beyond 50,000 source entries or active dispositions. ReviewActions is included in encrypted backups; older backups without this table remain accepted. Restored rowversions may invalidate historical Undo or category snoozes; do not assume these survive restoration unchanged. The latest backend suite passes 48/48, including queue ambiguity, workspace isolation, stale actions, atomic categorisation, rule undo, transfer totals, snooze and backup history.

Status on 2026-09-07: local backend and the first live Danske Bank import work. Three accounts, 2,905 transactions, and six balance snapshots are stored locally. The product demo backend is implemented with wholly fictional data. The local frontend is now implemented and tested; see local-frontend.md. MCP and Azure remain later phases.

Current handoff: Dan completed the official application MitID flow. The callback reached Banking, where a shared alternative account hash incorrectly triggered `AMBIGUOUS_ACCOUNT_IDENTITY`. Signed session/detail reads confirmed three distinct primary identities and one alternative shared by all three. Reconciliation now excludes shared alternatives and still rejects conflicting primary identities. The existing authorized session was recovered without another MitID flow. All 30 transaction pages completed: account counts 2,448 / 394 / 63; earliest booked dates 2024-09-09 / 2024-09-09 / 2024-09-10. Each DKK account has ITBD and ITAV snapshots. Consent expires 2027-03-06 12:29:27 UTC. This proves local initial import, not independent agreement with the bank UI or every future bank failure mode. See [onboarding evidence](enable-banking-onboarding.md).

## Planning extension — 7 September 2026

Implemented after the original 36-test milestone:

- Goal create/list/update/delete and progress endpoints, including name, description, target/currency, optional deadline/baseline, notes and up to ten labeled HTTP(S) links. Same-workspace account validation, rowversion conflicts, one-account/all-account booked balances, explicit missing/stale/mixed-currency states, and encrypted backup/restore support. No goals are seeded.
- Read-only monthly budget previews: `GET /api/budget-suggestions?month=YYYY-MM-01&currency=DKK&months=3`. Uses 1–12 completed history months, gross categorized booked debits, confirmed-transfer exclusion, credits shown separately, and visible history/uncategorized coverage. Incomplete history suppresses suggested limits. Zero-activity months count in the average; irregular expenses are included, not annualized. Preview never writes a budget. User saves/edits through existing budget endpoints. Dedicated persisted suggestion/revision provenance remains future work.
- Equal-length preceding-period trends: `GET /api/trends?from=...&to=...&currency=DKK`. Missing history suppresses deltas; nonpositive comparison baselines do not produce percentage changes.
- `GET /api/upcoming-estimates?from=...&days=30&currency=DKK`: next occurrence only, requiring at least three stable monthly debits with the same account/description (date tolerance three days, amount tolerance ten percent). No promise of complete bill coverage; annual/variable bills are not detected. All results are estimates, never bank-scheduled instructions.
- `GET /api/advisor/status`: explicitly not connected, no chat/provider/model/outbound call. Actual AI is deferred by the owner. `/api/mode` adds Dan/Demo presentation labels without changing server workspace enforcement.
- New Demo initialization no longer seeds budgets. The historical eight product-demo budgets are preserved. No product goal or budget was created or deleted during implementation; creation tests run in disposable databases.

Goal planning convention: latest ITBD/CLBD snapshot per account, never ITAV added to booked. Over 24 hours old is stale. Currency conversion is not implemented. Completion remains distinct from pace. An explicit starting balance/start date/deadline enables a linear pace; up to seven days of planned contributions below pace is AtRisk, a larger gap or missed deadline is BehindPlan. These defaults are reviewable, not financial advice. Preferences, product screens, mobile interactions, and disconnected advisor overlay still require frontend implementation and browser verification.

Validation of the planning extension: `./scripts/Test-Backend.ps1` passed **42/42 tests** on 7 September 2026. Goal backup/restore was tested in a separate disposable restore database. After restarting the local HTTPS backend and applying the additive migration, read-only API checks found **Live: 0 goals / 0 budgets; Demo: 0 goals / 8 historical budgets**. Both workspaces return advisor `not_connected` with external AI sharing disabled. No owner goal/budget was created or deleted. These are backend checks, not browser/UI acceptance.

## Start and use

- Prerequisites: Windows, .NET 10 SDK, x64 .NET 10 runtime, and SQL Server LocalDB. These dependencies were already installed on Dan's machine. A dedicated local `Banking` instance was created; no cloud resource was created.
- Start: `./scripts/Start-Backend.ps1`. LocalDB starts, the API applies local migrations, then listens on `http://127.0.0.1:5080`.
- For the registered live callback, use `./scripts/Start-Backend.ps1 -Https`; it adds `https://localhost:5443` with the ASP.NET development certificate. HTTPS is selected automatically when live local configuration exists. Verify trust with `dotnet dev-certs https --check --trust`; do not bypass browser certificate warnings.
- Product demo smoke check: `./scripts/Demo-Backend.ps1`. The prepared demo has three accounts and 628 fictional transactions as of 2026-09-07, with eight categories/rules/budgets. `-Engineering` selects the older two-account/nine-entry fixture instead; do not add it to the product workspace during presentation.
- Authenticated client: `./scripts/Invoke-Banking.ps1 -Path /api/accounts`. The client decrypts the local token internally and never prints it. Do not record sensitive API output in shell transcripts after live access is approved.
- Tests: `./scripts/Test-Backend.ps1`. Build alone: `dotnet build src/Banking.Api --arch x64`.
- Stop the host before rebuilding or running maintenance on Windows. No browser/product frontend is launched.

The SDK is pinned in global.json with feature-band roll-forward. Package lock files record dependencies. The scripts select x64 because ARM64 SqlClient cannot load the installed x64 LocalDB runtime. A plain ARM64 `dotnet test` is not the verified test command.

## API surface

Financial `/api` routes and `/openapi/v1.json` require the local bearer token or protected browser session with its client header. Bank callbacks and the one-time HTTPS browser-session exchange have their own validation boundaries; the static shell contains no bank data. `/health` reports process health only; the misleading constant `liveBankVerified: false` was removed. Connection/account/job endpoints provide actual consent/import/freshness evidence. There are no payment or bank-write endpoints.

| Capability | Contract |
|---|---|
| Active workspace | `GET /api/mode`; `X-Banking-Mode: Demo` or `Live` selects each request. Response carries the same header; absent selection defaults to Demo |
| Bank discovery and connection | `GET /api/banks`, `POST /api/connections/authorize`, `GET /api/connections`, `POST /api/connections/{id}/disconnect` |
| Authorization callback | `/api/auth/callback` for Demo, `/api/auth/callback/live` for Live; workspace comes from the fixed route, never the currently selected UI mode |
| Local completion recovery | `GET /api/authorizations/recoverable`, `POST /api/authorizations/{id}/retry`; authenticated, workspace-bound, uses an encrypted saved session and never replays the callback code |
| Import | `POST /api/connections/{id}/sync`, `GET /api/jobs`, `POST /api/jobs/{id}/retry` with version and optional restart |
| Stored bank data | `GET /api/accounts`, `/api/accounts/{id}/balances`, `/api/transactions` |
| Categories | `GET/POST /api/categories`, `PUT/DELETE /api/categories/{id}`, `PUT /api/transactions/{id}/category` |
| Rules | `GET/POST /api/rules`, `PUT/DELETE /api/rules/{id}`, `POST /api/rules/apply` |
| Budgets | `GET/POST /api/budgets`, `PUT/DELETE /api/budgets/{id}`, `GET /api/budgets/{id}/status` |
| Analysis | `GET /api/summary?from=YYYY-MM-DD&to=YYYY-MM-DD&currency=DKK` |
| Internal transfer classification | `GET/POST /api/transfer-matches`, `DELETE /api/transfer-matches/{id}`; these edit local classification links and never initiate a transfer |

Transactions accept accountId, from/to, currency, categoryId, search, status, offset, and limit. Default page size is 50; maximum 200. No arbitrary SQL or URL execution is available. Update requests for categories on transactions, rules, and budgets require the base64 SQL rowversion returned by reads; stale versions return 409 and missing versions return 428.

Money is decimal, income positive and expenditure negative. Summaries require one currency and include only current BOOK entries with a booking date inside the inclusive period. Pending/undated entries are not silently counted as booked; undated booked entries are reported separately. Budget spending is gross booked debit spending: refunds are positive income, not deducted from the expense measure. Confirmed internal-transfer matches are excluded from income/spending/budgets. Unmatched candidate transfers remain included until classified. Invalidated matches are removed when bank corrections break their amount/currency/status relationship.

For the synthetic DKK fixture over the last 30 days, before transfer classification: income 26,000; spending 9,475.50; net 16,524.50. After matching the internal transfer: income 25,000; spending 8,475.50; same net. The 150 historical expense is outside that period. The booked current-account balance is 15,374.50; savings 1,000. No pre-import balance history is invented.

## Live and Demo isolation

The default workspace is Demo using `Banking_Demo` and the fictional product provider. `Banking_Local`, the old engineering database, is retained untouched. Live is configured separately in `Banking_Live_Dan` and resolves only Enable Banking. Demo resolves only fictional providers. Session/cursor/backup cryptographic purposes differ by workspace. Database names and destinations are checked before migration; shared Live/Demo databases, production environments, and public listeners are rejected.

Each request and worker scope binds its workspace once. Switching another request cannot change an existing database/provider scope. Callbacks look up their single-use state in their original workspace, and jobs run in the workspace that owns them. The worker can process each configured workspace independently of the UI. The technical client accepts `-Mode Demo` or `-Mode Live`; this is backend preparation for the eventual one-action UI switch.

Tests use a synthetic second workspace only in Testing; they cannot enable real bank calls. The final backend demo is now generated entirely from fictional constants after observing the real data structure. It has three DKK accounts, paginated history, ITBD/ITAV balances, a shared alternative hash, repeated reference-less entries, an undated reservation, category rules, and budgets. Run `./scripts/Initialize-Demo.ps1` with the host stopped to initialize an empty demo database; it rejects Live and existing data. No reset/delete endpoint exists. The future mode-switch UI, cache/stale-response behavior, and any reset interaction require joint frontend design.

## Persistence and import behavior

- EF Core migrations create the schema on SQL Server LocalDB. Jobs are durable SQL rows, not an in-memory queue. Per-connection SQL application locks prevent parallel imports/reconnection/disconnection from changing the same session concurrently.
- Full imports omit date constraints and request the longest available history. Empty pages with a continuation key continue. Each page and its protected cursor commit together to staging; a persisted terminal-page flag prevents re-fetch after a balance failure.
- Transactions and snapshots become visible atomically once the full staged import and balance retrieval succeed. Until then, APIs expose progress and previously completed data. A failure preserves staging and history for inspection/retry.
- Normal sync overlaps 30 days and starts no more often than every six hours per account, measured from actual attempts. Configuration `Sync:Intervals:{provider}:{country}:{bank}` can lengthen that interval (6–720 hours). This is a default, not proof of actual bank quota compliance. Rate limits set a shared connection cooldown and respect Retry-After; live transient retries wait at least six hours. Five failed attempts require explicit attention. The scheduler does not silently replace failed jobs; the version-checked retry API resumes a checkpoint or explicitly starts a new import, respecting cooldowns.
- Imports stop for review at 10,000 pages/100,000 staged entries per job; they never silently claim a truncated fetch is complete. Same-cursor responses fail visibly.
- Stable entry references are scoped to accounts. Missing references use a content fingerprint plus occurrence number so two identical purchases are retained. Duplicate nonempty references fail for review. If a previously booked reference-less entry disappears inside a fetched period, the import reports RECONCILIATION_REQUIRED and preserves the previous published data/staging instead of silently counting a possible replacement twice. The actual bank data is still needed to validate identity quality and resolve genuinely ambiguous cases.
- Pending entries that disappear are retained as inactive. Stable-reference pending-to-booked changes retain the local transaction ID and manual category. Existing booked history is retained even when outside a later fetch window. Manual categories override rules on every import and reclassification.
- Same-provider reconnection uses both the primary identity hash and verified alternative aliases, cancels waiting jobs from the old session, and triggers full history import. Ambiguous account identity fails visibly. Expiry/disconnection never erases history, categories, or budgets. A cancelled authorization consumes the state without creating a connection. If remote session closure fails, local sync is stopped and REMOTE_DISCONNECT_PENDING remains visible for retry.

## Backup and local recovery

With the API stopped, use `./scripts/Backup-Local.ps1 -Action backup -File <absolute-new-file>` and restore with `-Action restore -File <archive> -RestoreDatabase Banking_Restore_<unique-name>`. The script does not overwrite an existing archive or populated database. Default mode is Demo. Later approved live recovery uses `-Mode Live` and a separate `Banking_Restore_Live_` destination.

The archive includes accounts, history, snapshots, categories, rules, budgets, transfer matches, classification changes, jobs, and staged import pages. It excludes authorization attempts, so a restored callback cannot replay an old flow. Restored running jobs become queued. Test reconciliation verifies transaction count, budget spending, and period totals after recovery.

The default archive depends on the Windows user/Data Protection key ring under `%LOCALAPPDATA%\Banking\keys`. Token ciphertext is `%LOCALAPPDATA%\Banking\api-token.dpapi`. These files are outside the repository.

For portable recovery, add `-Portable` to the backup/restore script. Enter a strong passphrase privately in the interactive terminal, with confirmation when exporting; never pass it in command arguments or environment variables. AES-256-GCM authenticates the archive; PBKDF2-SHA256 uses 600,000 iterations and a random salt. Tests restore successfully with an unrelated key ring. Financial history and user edits survive, while sessions/account access/checkpoints are stripped or cancelled and reconnection is required. Live/Demo mode is authenticated inside the archive and cannot be changed during restore. Keep the passphrase separately: losing it prevents recovery. Older local archives remain supported after the account-alias migration.

Application directory ACLs are verified. A SQL test confirms both the attached data file and transaction log are inside the protected directory. Dan supplied an administrator result confirming full disk encryption with protection on. That run also reported missing key/unverified ACLs, while the backend process independently verified both at the configured path; the context discrepancy remains unexplained. See `Test-LocalReadiness.ps1`.

## Verification

The automated suite covers:

Latest verification: `dotnet test Banking.sln --arch x64` — **36 passed, 0 failed, 0 skipped**. Coverage includes shared alternative account hashes, rejection of primary conflicts, encrypted authorization checkpoints, idempotent completion retry, scoped recovery with clock tolerance, signed authorized-session reads, and product demo import/reconciliation/editing/reconnection/isolation. `dotnet ef migrations has-pending-model-changes --project src/Banking.Api` reports no pending schema changes after rebuilding the design-time output.

During the HTTPS update, one test run aborted with a native `AccessViolationException` while EF Core materialized a query in `FinanceService.Reclassify`; the unchanged rerun passed all 24 tests. The cause is unresolved; do not describe that first run as passing or infer a fix. Monitor for recurrence on the x64 runtime on this ARM64 machine. Certificate preparation was also run twice with the same fingerprint/expiry, verifying reuse. The later metadata-only maintenance path was exercised against the registered provider and exits before database migration or background workers.

- Full paginated import including an empty initial page, identical reference-less entries, repeated sync, and retained old history.
- Manual category precedence, rule application, optimistic concurrency, budget arithmetic, internal-transfer exclusion, and separate currencies/two synthetic banks.
- Expiry/reconnection, persisted rate-limit retry and terminal-page recovery through a fresh host, and stable-reference reservation booking.
- Encrypted archive restore into a fresh database, aggregate reconciliation, and rejection of a nonempty restore target.
- Anonymous access, hostile Host/Origin, input bounds, missing payment/write routes, authenticated OpenAPI, and production startup rejection.
- Offline RSA JWT verification, AIS request bodies/paths, continuation encoding, signed exact amounts, missing dates, expiry/revocation, Retry-After, and sanitized provider errors.
- Parallel Live/Demo reads, isolated edits/jobs/callbacks, immutable request scope, and separate cryptographic purposes, using synthetic data in both test workspaces.
- Portable recovery with a new key ring, tamper detection, alternate bank identity, cancelled/unlinked authorization, reconnect with old waiting jobs, explicit retry/restart, remote disconnection, large categorization batches, and protected SQL file placement.

A real local Kestrel process was started, synthetic import completed (2 accounts/9 transactions), the process was stopped/restarted, and the same persisted data was read again. Observed application logs contained only safe event names, job IDs, page/item counts, and sanitized error codes. No real bank data was used, so this is not a complete audit of future external proxy/production logging.

## Next phase and remaining acceptance limits

1. The approved local frontend and Dan/Demo switch are implemented and browser-tested. Next, Dan performs product-workspace goal/budget creation acceptance and visual review; see local-frontend.md.
2. Before full local MVP acceptance, compare displayed balances/history with the bank UI and observe a normal six-hour live refresh. The initial import used every returned continuation page; it does not prove historical completeness beyond what this API returned. No quota-bypassing refresh was forced.
3. Expiry/revocation, corrections, unusable cursors, backup restoration, and portable recovery have synthetic automated coverage. Actual expiry/revocation and a future real-bank renewal are not yet observed. The authorized-session recovery did work against the existing live session, and a same-user encrypted backup of the real first import exists in protected local storage.
4. Product demo backend and isolation are verified. The UI clears cached views and rejects late responses when switching. Demo reset UX remains undecided. Initialization refuses existing data; no delete/reset endpoint was added.
5. Only after complete local MVP acceptance: present the concrete Azure/release proposal for separate explicit approval. Azure resources and deployment remain last. MCP and cross-provider identity migration remain later extensions.

Latest running-host verification: live 3 accounts / 2,905 transactions retained after restart; demo 3 accounts / 628 transactions / 8 categories / 8 budgets; no recoverable live authorization remains. The protected temporary session recovery file was removed after successful completion. Ordinary application output contains event names, page/item counts, job IDs, and safe error codes, not balances or transaction descriptions.

Real-data backup verification: `live-initial-import-20260907-145648.bankup` is encrypted in `%LOCALAPPDATA%\Banking`. Restoring it into the separate protected `Banking_Restore_Live_8c4ac9c035584f58911922dc484fdfae` database produced 3 accounts / 2,905 transactions / 6 snapshots. No worker was started for that copy; it is retained as isolated recovery evidence and is not a configured runtime workspace. Explicit maintenance command-line destinations now override local configuration. Portable passphrase recovery remains verified with synthetic data only.

Current adapter source: [Enable Banking API reference](https://enablebanking.com/docs/api/reference/), checked 2026-09-07. Distinguish documented behavior from the narrower live evidence above.
