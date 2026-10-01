# Local Saxo SIM orders — 17 September 2026

User request: place orders from a selected stock chart, test a small Mærsk order locally, and remove synthetic investment holdings.

## Implemented

- Buy, Sell and Orders alongside the selected chart instrument, on Workspace and Explore.
- Confirm the Saxo stock listing explicitly; account, whole-share quantity and limit price. First increment uses DayOrder and Stock only (no CFDs, shorts, options, market orders or AI execution).
- Saxo instrument reference, accounts, optional bid/ask and precheck. Missing quote access is explicit; Yahoo chart values are not presented as executable quotes or automatically copied into the limit input.
- Review provider total cost/cash requirement, then explicit Place SIM order. Cash and existing holdings/reserved sell orders checked server-side; review expires after two minutes and costs are rechecked before submission.
- Protected persistent tickets bind workspace and app registration. Intent is recorded before the write; repeated confirmation returns the stored result. Timeouts remain Unknown, never automatically retried. Explicit broker errors remain Rejected with validation details.
- Open broker orders, seven-day broker activity (bounded to 100 records) and local submission receipts. Accepted/Working is not a fill. Holdings only come from Saxo.
- Backend refuses LIVE and production order endpoints. No deployment or production login attempted in this task.

## Real SIM evidence

Chrome workflow: select Mærsk B from search/watchlist → Buy → confirm MAERSKb:xcse (UIC 6041) → enter one share and a 22,720 DKK limit → Review → Place SIM order.

Saxo accepted order **5040329758** at **16:36:16 UTC**. Broker open orders independently returned Working, quantity 1, limit 22,720 DKK; audit history returned Placed/Confirmed. Holdings were empty afterward: no fill is claimed. The 29 DKK commission produced an estimated total of 22,749 DKK; reviewed cash requirement was 3,046.95 EUR. The account does not provide Mærsk bid/ask data; the UI shows unavailable quote access. This was a simulated transaction, with no real-money order.

Provider testing found and fixed two request-contract issues: ManualOrder must also be present in precheck; ClearForceOpen is FX/CFD-only and must be absent for Stock. Failed attempts are retained as diagnostic receipts. Before further attempts, broker orders, positions and activity were checked empty. Exactly one accepted order was found.

Removed two local Investment statements whose provider was Synthetic portfolio and names were Example global equity fund / Example bond fund. Verified zero local investment statements afterward. No pension, loan, watchlist, real account or Saxo position was deleted. Investment examples are no longer seeded; already-existing production Demo records are unchanged.

## Validation

- Build and JavaScript syntax passed.
- 18 focused backend checks passed: order validation, insufficient cash/holdings, explicit rejection, timeout suppression, repeated submit across service recreation, protected persistence, scope/expiry, OAuth and existing public access/market behavior.
- Desktop Chrome review, actual submission and broker status verified. At 390px, the modal remains inside the viewport, open-order details are readable, and submission/audit history is collapsed to keep the main result clear.
- No complete LIVE trading workflow, cancellation, automatic order monitoring, or execution-after-market-open test is claimed. Limit order can remain pending or expire.

Provider contracts: [precheck](https://www.developer.saxo/openapi/referencedocs/trade/v2/orders/post__trade__precheck), [order placement](https://www.developer.saxo/openapi/referencedocs/trade/v2/orders/post__trade), [audit semantics](https://www.developer.saxo/openapi/learn/audit-orderactivities).

## Completed Chrome SIM round trip — 17 September, 16:56–16:57 UTC

Dan explicitly requested a buy, Holdings verification, selection of the holding, and sale, and allowed another Danish company. Used **Genmab ADR (GMAB:xnas, UIC 14344120, USD)**, selected through Banking search and explicitly confirmed in Saxo's listing picker. This is Genmab's US listing, not its Copenhagen listing.

- Buy one share with a USD 35 day limit from the chart: **5040329833**, Saxo `FinalFill / Confirmed`, filled quantity 1 at **16:56:32.894 UTC** (fill timestamp, not execution price).
- Banking Holdings immediately showed **Genmab A/S - ADR, 1 share** after the submission refresh. Clicked that actual holding; its GMAB chart opened.
- Sell that one share through the chart with a USD 34 day limit: **5040330237**, Saxo `FinalFill / Confirmed`, filled quantity 1 at **16:57:29.102 UTC**.
- Banking Holdings returned to **No holdings yet**, and a separate provider-backed preview returned `positions: []`. Both buy and sell were placed through Chrome UI; no fake fill/position was inserted.
- The earlier Mærsk buy remained Working at Saxo. Cancelled only exact test order **5040329758**, verifying its instrument, quantity, side and Banking reference before the SIM API cancellation. Cancellation cleanup used the API; a product cancellation UI has not been added.

The first Genmab review expired before submission. Backend correctly sent no broker order, but the UI incorrectly called this an interrupted response. Corrected known pre-submission review-expiry/cost-change/registration-change handling: explicit "Nothing was submitted", enabled Edit, and a **Refresh review** action that requires another explicit confirmation. Unknown network outcomes retain status checking and are never automatically retried.

No LIVE trades or deployment. Production acceptance remains Not run.

Final verification: Saxo reports zero open orders, two FinalFill/Confirmed records, and Mærsk Cancelled/Confirmed at 16:58:11.790 UTC. Six focused order tests passed again. Chrome regression: waited beyond the review expiry, confirmed it was blocked with the new explicit message, and used Refresh review to obtain a fresh review without submitting another trade.
