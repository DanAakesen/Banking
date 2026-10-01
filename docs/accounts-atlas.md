# Accounts explorer — local implementation

Dan approved the second displayed Accounts concept on 8 September 2026. Its exact source is [the saved target](design-targets/accounts-atlas.png).

- Panoramic summary reuses the Overview's generated morning, afternoon and evening scenery. It shows current cash allocation and selected-period income, spending, net retained and retention percentage.
- Searchable account directory selects one account or all accounts. Selection resets ledger pagination and adopts a selected account's currency. Accounts and categories retain the shared colour mapping. Bank account names remain unchanged.
- The transaction workspace has search, category filtering, editable categories, details, Rules & categories and seven-row pagination. A compact spending strip shows the leading four categories plus the remaining categories combined.
- The comparison callout uses scoped booked aggregates from the preceding equal-length period. It appears only with sufficient history and a positive spending increase; it links to Review. No AI advice is generated.
- At 1200px and wider the directory is beside the ledger. At narrower desktop/tablet widths it precedes the ledger. Phone accounts scroll horizontally inside the directory. Insights stay above transaction rows. A readable ledger can scroll horizontally at intermediate widths; phones use transaction cards.

## Financial and access boundaries

Income/spending/net retained use `/api/account-insights` and exclude confirmed internal transfers. They do not change when searching, filtering categories or paging the ledger. Account/date/currency filters do scope them. Available balances are current snapshots, not balances at the selected period end. The allocation chart is suppressed when balances are missing, negative, zero-total or disagree with the aggregate; actual negative totals remain visible. Stale balances, incomplete history and excluded undated entries are identified.

The implementation is native JavaScript and CSS in `accounts-ui.js`, `accounts.css` and the existing `app.js`. Two exact public static paths were added to the local access middleware so the imports load before sign-in; no API authorization was broadened. CSP, local-only hosting and Demo/Live separation are unchanged. No database migration, account change, seed, Azure resource or deployment was performed.

## Validation

The full disposable-database browser suite passed 36 checks with zero script errors. Accounts-specific checks cover API totals, pagination independence, account selection, ten-account search, missing individual balances, thirteen viewport widths from 360px to 1920px, exact category dropdown widths, all five themes and both languages. Additional response fixtures verify zero spending, missing balances and negative balance chart suppression. These fixtures never modify product data.

Real public Demo screenshots were inspected against the selected image at 1448 × 1086, including a ledger detail capture, tablet, mobile and Light. See [design QA](../design-qa.md). Backend build succeeded with zero warnings/errors; this task changes no financial backend calculation.

The app is running at `https://localhost:5443/#/accounts`. The required host restart expires existing browser sessions; select Demo or sign in normally if prompted. User visual acceptance remains the next checkpoint.


Follow-up, 8 September: decorative Accounts subtitle/hero copy and dates were removed at Dan's request. Overview now incorporates its balance strip in its hero; both pages share responsive desktop hero heights. See the Hero consolidation entry in DESIGN.md. Earlier screenshots remain historical evidence.
