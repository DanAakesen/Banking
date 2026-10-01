# Investments workspace QA — 27 September 2026

## Scope and status

Implemented the approved concept 3 locally. The Investments screen now reads Saxo SIM through the existing deployed production API; Pension's manual statement flow is unchanged. No local business backend/database, deployment, LIVE linkage or new order was used.

Changed UI files: `src/Banking.Api/wwwroot/wealth-ui.js`, `wealth.css`, `app.js`, `markets-ui.js`. The existing static modules are reused, so the frontend host needs no new asset registration or restart.

## Verified

- `node --test tests/ui/*.test.mjs`: 21 passing tests, including six new Investments cases. The cases cover cash/invested reconciliation, pending-order exclusion, unknown versus zero, unreliable and mixed-currency data, incomplete holdings, unbooked differences, lifecycle states and exact research mappings.
- JavaScript syntax checks passed for the three changed modules.
- Actual browser on frontend-only `https://localhost:5444/#/investments` reads the shared deployed SIM account: account value and cash 999,973.83 EUR, invested 0 EUR, zero positions and four working orders. The actual data remained in this state during testing.
- Orders show the correct approved quantities/prices/currencies for Siemens, Microsoft, Vestas and Genmab, with the original broker confirmation time. Selection updates the inspector; Holdings remains the default after navigation.
- Mobile row selection opens a detail view with Back; keyboard arrow navigation changes tabs. Explicit refresh and periodic refresh update timestamps and retain selection.
- Research link opens `#/markets/MSFT` and the Microsoft price chart; the watchlist remains empty. Research does not save a watchlist item or submit an order.
- Responsive inspection at effective browser CSS widths 320, 391, 768, 1138 and desktop: document scroll width did not exceed viewport width. Mobile summary uses intentional horizontal card scrolling. Long instrument names were exercised with an isolated test fixture. Visual screenshots inspected desktop, tablet-width reflow and mobile; screenshot capture at the 768px check failed, while DOM/layout and keyboard checks succeeded there.
- Network failure was simulated in the test tab by blocking only the two read requests. Previously read data remained visible with a failure message and source timestamp. Blocking was removed and real account data recovered.
- Browser-only intercepted read fixtures exercised one holding with a negative EUR trade result, acquisition cost, delayed quote, reconciled 90/10 allocation, and a partially filled order (2 of 5). Fixtures were labelled UI TEST, never sent to the backend, then removed. The final browser uses real production reads again.

## Limits and release boundary

The prior additive backend fields / combined read endpoint are still source-only and require a separately authorized deployment. This frontend intentionally calls the already-deployed preview and orders contracts, and reads instrument metadata when an order lacks currency. It does not try another business backend or invent missing data. Unsupported detail fields remain absent/unknown until supplied.

Actual filled-position reconciliation remains pending: the four real SIM orders were still Working. Fixture validation is not proof of an actual fill, fee or broker valuation. Historical portfolio return series are not available and no artificial return chart is shown. Refresh is 30-second visible-page polling, not streaming. Activity is bounded to seven days / 100 events.

Final review: a fresh tab was returned to the real production reads, showing four Working orders at 20:50 Europe/Copenhagen. The test tab was closed and the deliverable tab retained. Desktop screenshot: `artifacts/investments-ui-qa/investments-desktop.png`. Temporary viewport overrides and network interceptions were removed.
