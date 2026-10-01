# Local frontend — implementation and acceptance

Latest: [panoramic Overview implementation and verification](panoramic-overview.md), approved 8 September 2026. Three time-dependent backgrounds/greetings, all five themes, 57 backend tests and 41 workflow/visual checks passed.

## Latest checkpoint — overnight quality and visual upgrade

54 backend tests and 39 browser checks pass. The cash-flow/chart components, spending highlights, category selection, budget waterfall and goal rings are implemented and inspected on desktop and mobile. All 17 routes were checked at five widths; five themes and both languages were checked on six primary workflows. Late body-parsing isolation and in-flight form editing were fixed. Screenshots and detailed acceptance limits are in the [morning report](overnight-quality-ui.md).

To repeat the full browser pass, set BANKING_VISUAL_PASS=1 and BANKING_QUALITY_PASS=1 before running scripts/Test-Frontend.ps1. The ordinary command keeps the 30 core workflows; the two flags add the chart and quality checks. All mutation tests use disposable databases.


## Earlier checkpoint — named budgets implemented, 7 September 2026

Dan said "Build it" after confirming the revised concept and Income/Expense/Savings semantics. The manual-first editor now supports named plans, recurring entries, monthly income/other-expense/planned-savings/available totals, annual equivalents, a searchable plan picker, explicit activation/deactivation and deletion after deactivation. A separate Overview section reads the active plan without replacing bank actuals. Transaction suggestions offer new or merge, explicit Add/Update/Skip choices and an unsaved editor before Save. Existing entries are preserved unless an update is chosen. Historical category limits remain accessible read-only.

Verification: **53 backend tests and 30 real Chrome workflow checks pass**, with no browser script errors. New checks cover all four recurrence periods, totals, persistence, multiple plans, activation, merge/new transaction previews, no preview writes, mobile overflow, Danish labels, unsaved navigation and stale-version draft preservation. Form controls are locked during saves to prevent edits being lost to the completed request. Tests used only disposable GUID-named databases.

Inspected browser captures with synthetic test records: [desktop editor](ui-review/2026-09-07/budget-plans-desktop.png), [empty manual editor](ui-review/2026-09-07/budget-empty-desktop.png), [390px editor](ui-review/2026-09-07/budget-plans-mobile.png). Full check record: [verification.json](ui-review/2026-09-07/verification.json). These are running UI captures, not mockups or product records.

The normal HTTPS app was restarted and reopened successfully in Chrome. Read-only API checks confirm **Dan and Demo: zero named plans, zero active plans and zero goals**. The eight historical Demo category limits remain; none were converted or removed. Dan now creates his first plan through the UI and chooses Make active when ready. Comparison, projections and entry-to-actual-spending mapping remain later features. No cloud or actual AI changes were made.


## Built-in browser access — historical issue, 7 September 2026

Update, 8 September: Dan confirmed the Codex browser opened and authenticated with a launch link. The original certificate failure below is historical; no certificate bypass was introduced.

The normal HTTPS app responds successfully in Windows and Chrome. The served localhost certificate matches the certificate in CurrentUser/Root, and an SslStream handshake validates without a bypass. Fresh Codex built-in tabs still fail with ERR_CERT_AUTHORITY_INVALID. No application authentication, HTTPS enforcement, certificate validation or network exposure was changed. Restarting Codex is the next diagnostic step, not a verified fix; leave that to Dan because it interrupts remote access. The [Budgets screenshot](ui-review/2026-09-07/budgets-desktop.png) was captured from the existing authenticated Chrome session in Demo, without changing any budgets.

## Earlier checkpoint — Review implemented, 7 September 2026

Dan approved the Review concept and asked to build it. Review now replaces Activity in navigation. Its queue shows only missing categories and conservative internal-transfer suggestions, with account/type filters and sorting. Select a row to act; category checkboxes enable batch categorisation. Single categorisation can create a future rule. Transfer pairs support confirmation or dismissal. Skip hides the item for 24 hours. Recent changes and paged history support Undo, which refuses to overwrite newer edits. Accounts remains the full ledger. Clearing the queue is not bank reconciliation.

Verification: **48 backend tests and 23 real Chrome workflow checks pass**, with no browser script errors. Added checks cover batch/single categorisation, optional rules, undo, persistent snooze, transfer confirmation/dismissal, mobile detail focus and history reload. Mutations used only disposable databases. The completed desktop render was inspected after waiting for the async refresh to finish: [Review desktop](ui-review/2026-09-07/review-desktop.png). Mobile interaction/overflow was checked at 390px; no claim of remote phone access is made. Dan's product goals and budgets were not changed. Next visual review: Budgets.

The approved local interface is built and running. Dan's latest corrections are implemented: one period dropdown, Custom-only date inputs, and no top Demo/account control. Account selection remains in desktop navigation, mobile More, and Settings navigation. Actual AI is disconnected; nothing has been deployed.

## Start and open

1. Run `./scripts/Start-Backend.ps1 -Https` from the repository root.
2. Open `https://localhost:5443` and choose Try Demo or Sign in as Dan. For Dan’s one-time password setup, use `./scripts/Open-Banking.ps1`, then Settings → Profile → Set your local password.
3. After authentication, the app is available at `https://localhost:5443`. A new browser/profile or expired session returns to the welcome page; use Demo or the owner password. This is loopback-only; the phone cannot directly reach that address on the PC. Review screenshots remotely until a separate access arrangement is approved.

The app uses native JavaScript modules, HTML and CSS served by ASP.NET Core. No frontend package installation/build service or external asset host is needed. Browser assets are in `src/Banking.Api/wwwroot`. The API token is never embedded in assets or localStorage; the browser session is HttpOnly/Secure/SameSite=Strict. Settings saves only theme and language in localStorage.

## Delivered workflows

- Overview: account balances by currency/type, latest sync time, selected/comparison periods, income/spending/net changes, estimated upcoming payments, goal status and recent activity. Absolute changes replace percentages when a percentage baseline is unavailable. Calculation details explain confirmed-transfer exclusion; unidentified credits are not assumed to be refunds.
- Accounts and activity: balances/coverage/import status, transaction search, date/account/category/status filters, paging and manual category changes. Categories/rules can be managed; internal transfers can be matched explicitly using recent booked entries.
- Budgets: manual-first named plans with Income/Expense, a Savings marker, 1/3/6/12-month frequencies, four monthly totals, searchable plan selection and explicit activation. Transaction previews support reviewed merge/new drafts with separate Save. Historical category limits remain accessible read-only. Suggestions never overwrite existing decisions automatically.
- Goals: create/edit/list/detail/delete, one/all-account balance measurement, description, target/currency, notes, links and optional pace plan. Empty/invalid forms cannot submit. Unsaved drafts require a discard decision before navigation/workspace changes.
- Connections: import/job status, bank selection, sync scheduling, reconnect/disconnect. Bank approval is a separate explicit browser step. No live reauthorization, disconnection or manual sync was triggered during UI verification.
- Settings: dedicated navigation and Back to Overview, five themes (Light, Graphite, Slate, Sand, Forest), English/Danish, local owner information and sign-out.
- Advisor: an honest Not connected overlay, no fake chat or model call. Investment/pension destinations are marked unavailable future connections.

## Verified on 7 September 2026

- `./scripts/Test-Backend.ps1`: **43/43 tests pass**. The script explicitly supplies the installed x64 runtime root on ARM Windows when required. The first final run aborted on host discovery; after that script fix, the full suite passed. No runtime installation was needed.
- `./scripts/Test-Frontend.ps1`: **14 Chrome workflow checks pass**, with no JavaScript errors. The harness uses two fresh GUID-named disposable SQL databases, a test-only local host and a fresh Chrome context. No product data is seeded or edited. The completed run cleaned up its databases.
- Checked desktop at 1440px, mobile at 390px and 360px, single dropdown/Custom behavior, no top account selector, Settings back/navigation, five theme selections and normal/muted/accent text contrast, language/theme persistence, account/activity views and classification, connection/bank selection, goal and budget create/edit/reload, draft protection, advisor placeholder, workspace isolation and rejection of a deliberately delayed old-workspace response.
- Chrome trusted the normal local certificate. A test interception initially failed because its separate HTTP client did not use the browser trust store; the delayed-response fixture was changed to use the known synthetic test API response. Browser certificate validation was never disabled. No model, cloud resource or tunnel was used.
- After starting the normal host, read-only checks confirmed **Live: 0 goals / 0 budgets; Demo: 0 goals / 8 historical budgets**, with advisor Not connected in both. No new product goals/budgets were created and none were deleted. The local HTTPS root returned 200 with CSP and the expected application script. The launch script opened Chrome.

The browser harness requires Node.js and Playwright. It uses the installed bundled runtime path by default, or `BANKING_PLAYWRIGHT_PATH` to supply another installed Playwright package. It does not install browsers or packages automatically. Close an existing normal host before rebuilding on Windows; do not stop it merely to rerun the browser harness, which uses its own ports and databases.

## Actual screenshots and machine-readable results

These are running UI screenshots using fictional Demo data, not generated image mockups. The desktop Overview and Accounts captures were refreshed during owner review using read-only access to the local Demo workspace. A test goal/budget was created only in disposable databases; the screenshots do not represent Dan's product records.

- [Desktop Overview](ui-review/2026-09-07/overview-desktop.png)
- [Desktop Accounts](ui-review/2026-09-07/accounts-desktop.png)
- [Mobile Overview](ui-review/2026-09-07/overview-mobile.png)
- [Mobile Settings](ui-review/2026-09-07/settings-mobile.png)
- [Mobile blank goal form](ui-review/2026-09-07/goal-form-mobile.png)
- [Browser verification result](ui-review/2026-09-07/verification.json)

Overview review: Dan accepted the page with the calculation disclosure removed and Last sync moved to the top right. Both changes were verified in Chrome, including no horizontal overflow at 390px and no script errors. Dan subsequently approved the Accounts redesign with a searchable account picker; it is now implemented locally.

## Owner acceptance and remaining limits

Dan should create/edit one goal and one budget in each workspace through the UI, check the resulting progress/spending, and review the presentation on mobile. Automation deliberately left those product actions to him. Visual refinement remains expected. Those actions, real-bank figure comparison, and observed future consent/refresh behavior have not been declared complete by automated tests.

Upcoming estimates detect stable monthly patterns only. Goal pace uses the documented explicit-baseline convention, not AI advice. Multi-currency conversion, durable separate budget-suggestion revision provenance, arbitrary historical-transfer candidate search, full screen-reader audit and real ChatGPT/MCP integration remain limitations or later work. Future production identity and service behavior still require the separate Azure release phase and Dan's explicit approval. The current local app is not a production deployment.

## Accounts redesign verification

The redesigned Accounts view uses a searchable, scrollable All accounts/single-account selector, ten rows per transaction page, an explicit Account column, coloured account/category labels, manual category correction and a right-side insights rail. Text/category search affects the ledger; account/currency scope affects both ledger and insights. Insights aggregate the entire selected historical period, while upcoming estimates use the next seven days and available balances are current.

The updated backend suite passes **44/44**, covering account scope, missing available balances, latest snapshots, currency separation, undated/pending exclusions, matched transfer pairs, full-period/category reconciliation, zero-income percentage handling and workspace isolation. The browser harness passes **18 checks**, including the ten-account picker fixture, account/insight scoping, chart values compared to API results, pagination, no-match search, keyboard Escape, stable colour identity and 390px overflow. Mutation tests use disposable databases only. No product goals or budgets were created.

The approved concept is a design reference. Current screenshots use actual local Demo data, so visible totals differ from the fictional proposal.


## Account menu and dropdown lists — 8 September 2026

Dan requested the full bottom account row as the utility-menu trigger. The row now opens Settings, Connections and Sign out only. Switching between Dan and Demo goes through Sign out and the welcome screen. Settings and Connections are removed from the primary sidebar and mobile More navigation; mobile More has the same account-row menu. The standalone Settings page retains its own section navigation. Sign out revokes the session and returns to the root welcome screen with Try Demo and Sign in as Dan.

All native selects share themed control, option, hover/focus, selection and disabled styles. Supporting Chromium browsers use CSS `appearance: base-select` and `::picker(select)` for the opened option list, retaining native select/form/keyboard semantics. Other engines retain native pickers with theme colour fallbacks; platform picker chrome may differ. The custom searchable account and budget lists use the same surface/border/radius treatment. No external component dependency was added.

Navigation verification: all 33 existing Chrome workflow checks pass after updating menu interactions. Six focused access/navigation/dropdown groups also pass with zero browser script errors. These include whole-row corner clicks, keyboard open/Escape/focus return, utility destinations, root welcome after sign-out, mobile menu scrolling, a route-level dropdown audit and opened lists in five themes. Screenshots and inventory are under artifacts/ui-review/navigation-dropdowns/. No product data was edited by these disposable-host checks.

## Empty budgets and goals — 8 September 2026

Confirmed UX correction: collection pages with no saved records show an explicit No budgets yet / No goals yet state and one prominent Create action. Visiting Budgets no longer creates or opens a draft. Create budget opens /budgets/new with manual defaults; From transactions is a secondary entry. New drafts have Back/Cancel and no redundant New budget button or empty plan picker. Cancellation returns to the empty collection without writing records. Existing plans still open the active/first plan and retain New budget. Goals uses the same visual empty-state treatment and a single creation action.

Overview distinguishes zero budgets (Create budget opens the editor directly) from existing inactive budgets (Choose budget). No goals/budgets are populated as part of this change.

Empty-state verification: 34 Chrome workflow groups passed with zero script errors. Tests cover zero budgets/goals in both Demo and Dan, explicit creation, cancellation, reload, transaction entry, Overview shortcut, and 390px rendering. Existing budget save/edit/activation/import and goal flows still pass. All mutations used disposable test databases.
