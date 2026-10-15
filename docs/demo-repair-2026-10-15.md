# Demo repair and Codex annotations — 15 October 2026

Banking Main released ownership after the previous worker stopped. Work continued in the published Banking cloud workspace, `/workspace/Banking`, from `main` `b186e1935c927a89295bc12a661e470c5cf683a2` and reviewed WIP branch `codex/demo-repair-20261015` (`83ca3dd`). The merged presentation-readiness batch was retained. No deployment was requested or performed.

Dan authorized repairing only the persistent synthetic Demo through normal deployed APIs. No Dan financial data, SQL, resets, provider consent, orders, subscriptions or credentials were used. PFA API integration remains parked; the presentation target remains 22 October.

## Classification and transfer repair

The audit found one active `product-demo` connection, five fictional DKK accounts, 1,878 distinct current transaction IDs, 141 manual classifications and empty Review history. September/October imports use Danish descriptions while the saved rules still used English. Seven unmatched internal transfer pairs remained: five in October (30,800 DKK), two in September (4,300 DKK). Balances already reconciled to the ledger, including the 175 DKK pending reservation; changing amounts was unnecessary.

`repair-demo.py` now uses a fresh in-memory Demo session, the fixed Azure origin, explicit read/write paths, disabled redirects, Demo response headers and product-demo/account/row guards. Its dry-run records exact row versions, original Review history and protected-data digests. Apply requires an unchanged reviewed plan and stops on conflicts without blind retry. Existing English rules, disabled-rule decisions, manual classifications, budget/category/savings links and goals are preserved. Danish aliases have lower priority than every existing rule. There is no global reclassification, sync or reset.

Applied plan `b0ac4f70ced2f29dd8e7bb523cb39eccf821c791f3cb2e7ca5cf8f15e6eb0403`:

- Added 40 Danish rule aliases and classified 68 previously uncategorized booked rows through versioned normal category endpoints.
- Confirmed five pairs through Review signatures. Matched two exact bill-account pairs through the normal manual-transfer API after checking account roles, date, exact template descriptions, amounts, unchanged rows and empty Review history.
- The two bill pairs had incorrect synthetic counterparty metadata pointing to savings, which conservatively excluded them from Review. Existing metadata was preserved. The fictional provider generator is corrected in source for future imports, pending deployment.
- Kept the two newest 32 DKK coffee transactions as intentional Review examples. Two September transactions had already been manually cleared: Tankstation and Børnetøj og sko, 850 DKK each. Those manual decisions remain uncategorized.

| Calendar period | Before income → after | Before expenses → after | Uncategorized expenses before → after | Nonempty spending categories after |
|---|---:|---:|---:|---:|
| September 2026 | 57,525 → 53,225 DKK | 44,176 → 39,876 DKK | 42,842 → 1,700 DKK | 13 |
| October through 15 October | 83,800 → 53,000 DKK | 58,697 → 27,897 DKK | 58,053 → 64 DKK | 11 |

Net cash movement is unchanged: removing equal internal credits/debits corrects both income and expense totals. All existing transaction IDs, amounts, dates, statuses, descriptions, balances, accounts, categories, budgets, goals, original rules and manual classifications passed preservation checks. A second complete dry-run/apply invocation made **zero financial changes**, with plan `f90f4d683b183aeaf441c12f25c6f4204f871b546756f2bf9c7528e66c9b2c96`.

`verify-demo-repair.py` independently reconciles the ledger with deployed Summary, Accounts and cash-flow aggregates across **40 periods**: all 34 calendar months, five rolling windows, and complete history. It checks category totals, net savings and available-to-spend; all five accounts and their pending reservations; all four saved-budget/month combinations for September/October; and all three goal journeys. This is Demo evidence, not private Dan acceptance.

## Narrow annotation CSP compatibility

The deployed CSP still allows only the exact 18 September annotation stylesheet. Coordinator-supplied installed `OpenAI.Codex` package `26.1007.9446.0`, `browser-page-preload.js`, contains a changed overlay and two cursor sheets. Reproduced source CSS has these exact lengths and SHA-256 hashes:

| Stylesheet | Characters | Hash |
|---|---:|---|
| Overlay | 5,382 | `sha256-WO55anZ1V8A0G22bY2t72RV4dI79SLI4VnYLgsEeWUc=` |
| Selection cursor | 193 | `sha256-OUoShR0c3lqWNHEaHdorwfYnp/0EJHI/7QhTEUtan9w=` |
| Native text cursor | 125 | `sha256-6ddE/BE/E7OfXOyznfBSKxo7Dfm3OMuxy0O5a2y6TqI=` |

Backend and frontend-host main CSP add only these three exact `style-src` hashes, retaining the old hash. Script, frame, form, connection and authentication directives are unchanged; no `unsafe-inline` or `unsafe-eval` is added. The advisor and artifact policies are unchanged. External preload CSS is an ignored test fixture, not bundled application source.

Cloud Chromium checks old-policy rejection and new-policy active styles at 1440, 1024 and 390 px, with both cursor variants (**12 scenarios**). They verify the full-viewport modal interaction layer captures clicks at opposite corners, the cursor/selection behavior, and normal app control interaction after closing it. Unrelated style elements, style attributes, scripts and inline event handlers remain blocked. Middleware tests separately confirm Demo cannot read Live accounts. Transport tests exercise the actual frontend-host CSP response; a source parity test compares both main policies.

This is source-derived Chromium evidence. It is **not** direct acceptance in the actual Codex embedded-browser DOM. Azure must receive an authorized release before the new annotation hashes take effect, followed by a real Codex annotation check.

## Validation and reruns

- Release solution build: zero warnings/errors.
- Node UI/advisor suites: 206 passed.
- Isolated annotation/security and provider metadata tests: 3 passed.
- Frontend-host tests: 19 passed.
- Python repair protocol tests: 13 passed, including wrong workspace/provider, path/redirect restrictions, budget envelope, disabled-rule preservation, manual/dismissed decisions, ambiguous pairs, tampered plans, conflicts, protected data and repeat no-op behavior.
- Annotation Chromium fixture: 12 scenarios passed.
- Deployed Demo responsive browser acceptance: 24 screenshots at 1440/1024/390 px, Graphite/Light/Sand, English and Danish mobile. October/September/custom and one-year periods, independently selected budget months, 360 category tiles, Accounts, Budgets, Goals and Review pass. The displayed category amounts reconcile with budget progress, including the combined Other tile; six focused category screenshots are retained. Zero financial writes, document overflow, page errors or CSP violations; Demo-to-Live account requests return 403 in every context. Desktop, tablet and mobile screenshots were visually inspected. Receipt: `artifacts/demo-repair/browser/results.json`.

```bash
python3 -m unittest discover -s tests/scripts -v
python3 scripts/repair-demo.py --plan artifacts/demo-repair/plan.json
# Review the exact plan before the explicitly authorized apply:
python3 scripts/repair-demo.py --plan artifacts/demo-repair/plan.json --apply
python3 scripts/verify-demo-repair.py --output artifacts/demo-repair/verified.json
node --test --test-concurrency=1 tests/ui/*.test.mjs prototypes/advisor/*.test.mjs
ANNOTATION_FIXTURE=artifacts/codex-annotation/styles.json node tests/ui/codex-annotation.browser.cjs
BANKING_DEMO_LIVE=1 node tests/ui/demo-repair.browser.cjs
```

The annotation browser command requires the independently obtained exact preload CSS fixture and validates its hashes before use. Ignored `artifacts/demo-repair/` contains synthetic snapshots, reviewed plans, application/no-op receipts, reconciliation output and screenshots. No session cookies or credentials are saved. SQL LocalDB integration fixtures remain unavailable on Linux; passing isolated tests and read-only Demo reconciliation do not represent those fixtures as run.

The production runtime remains `2026.09.29-saxo-session-keepalive`; code changes in this batch, like the previous merged presentation-readiness batch, require separate deployment authorization. Shared Demo financial repairs are already effective through the existing deployed API.
