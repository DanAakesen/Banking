# Investments read model and design preparation

27 September 2026. Implemented in source and tested with isolated fixtures; **not deployed**. Both frontends still use the existing deployed API. No normal local business backend/database was started. No trades were created or changed by this work.

## Read contract

`GET /api/investments/saxo/portfolio?environment=SIM` is the new read-only page contract. It uses the existing workspace authorization, rejects LIVE, then reads the portfolio and broker activity sequentially. It does not require trading to be enabled and never submits an order.

- `schemaVersion: 1`, `environment: SIM`, `simulation: true`, `observedAt`, `status: Ok | Partial | Unavailable`.
- `portfolio`: existing balance/account/positions snapshot, or null on provider failure; `portfolioError` explains failure. Snapshot and activity retain separate observation timestamps; this is not an atomic broker snapshot.
- `orders`: working orders, separate from owned positions; null on failure, empty only after a successful empty read. `ordersError`, `ordersObservedAt`, `ordersHasMore` preserve status/coverage.
- `activity`, `activityError`, `activityHasMore`: bounded broker audit events, seven days and 100 records. An audit event is not necessarily a fill. No private review tickets or session receipts are returned by the combined contract.
- `performance.status: Unavailable`: no verified performance history is available. Price movements, research candles and historical SIM sample reports must not be substituted for account returns.
- Portfolio positions remain bounded to 100 with `hasMore` and provider count. Do not render allocation as complete when truncated or values/currencies/reliability are missing. No hidden pagination promises.
- Provider 5xx/transport failures preserve independently successful sections. Workspace authorization/input errors and client cancellation propagate. No stale or synthetic fallback.

## Additive fields on existing portfolio response

Position fields now retain position/net-position IDs, account ID (never provider account/client keys), instrument currency and explicit base currency, source order ID, status, opening execution time, value date, open price including/excluding costs, market values in instrument/base currency, original base value, price timestamp/type, open/current FX rates, trade P&L and currency P&L.

`baseCurrency` is the currency of the client-level balance/position request, **not automatically the individual account currency**. Per-account balances retain their own currencies. Existing `profitLossInBaseCurrency` remains broker trade P&L, not a total-return percentage or proof of realized profit.

The adapter requests the documented `Costs` field group. `openCosts`, `openCostsInBaseCurrency` and `estimatedCloseCostsInBaseCurrency` are allowlisted numeric cost fields. Estimated closing costs are not booked charges. Missing fields remain null; no implied zero, FX conversion, total-cost sum or return is invented. Value date is a provider value date, not by itself proof settlement completed. Closed-position realized results, bookings/dividends/taxes and historical return series remain outside this increment.

Working orders add currency, account ID, order type, duration/expiry, placement time and partial filled quantity. Existing `price` remains the order price (for our Limit orders: the limit); it is never relabelled as execution price. Exact chart mappings added: GMAB:xcse → GMAB.CO, VWS:xcse → VWS.CO, SIE:xetr → SIE.DE. Other venues are not inferred.

## Provider references

Field semantics checked against Saxo's official [position base](https://www.developer.saxo/openapi/referencedocs/port/v1/positions/get__port__me/schema-positionstatic), [position view](https://www.developer.saxo/openapi/referencedocs/port/v1/positions/get__port__me/schema-positiondynamic), [position costs](https://www.developer.saxo/openapi/referencedocs/port/v1/positions/get__port__me/schema-positioncost) and [open orders](https://www.developer.saxo/openapi/referencedocs/port/v1/orders/get__port__me/schema-orderresponse) on 27 September. Documentation and fixture validation do not establish that every optional field will be populated by this account after fills.

## Design brief

Three concepts use the last verified account snapshot at 19:56: cash/total 999,973.83 EUR, invested 0 EUR, four working orders, no positions. Limits are Genmab 1 × 2,280 DKK; Vestas 5 × 199 DKK; Microsoft 1 × 517 USD; Siemens 2 × 279 EUR. These are pending buys, not positions. No mixed-currency order total, invented return or sparkline.

1. Portfolio overview: account cards, allocation, pending orders, activity. Designed to remain useful as holdings grow.
2. Order board: instrument cards with categorical lifecycle indicators, compact portfolio companion. Strong waiting-state clarity.
3. Portfolio workspace: holdings/orders/activity tabs, compact rows and a selected-order inspector. Strong detail and scale.

Generated with the built-in image tool, inspected and corrected for branding, order timestamps and selection styling. Saved concepts: [overview](design-targets/investments-01-overview.png), [order board](design-targets/investments-02-order-board.png), [workspace](design-targets/investments-03-workspace.png). [Exact generation and correction prompts](design-targets/investments-concepts-prompts.md). Navigation in the raster explorations is schematic; retain the application's complete existing navigation during implementation. Concept 3 was subsequently approved, with Holdings as the default view and Orders / Activity as separate tabs.

Desktop concept images are explorations, not implemented screens. Tablet: two-column cards and a detail drawer; mobile: compact summary carousel, single-column order/holding cards, details on tap. Pending lifecycle indicators are categorical, never elapsed-time or fill-probability percentages. Keep existing Banking navigation, no extra subtitles or colored edge accents; SIM remains visible.

## Release and acceptance boundary

Validation: 44 focused tests passed, including position currency/cost mapping, missing quotes, negative provider P&L, partial fills, private receipt exclusion, provider failures, cancellation, exact listing mappings, existing order safeguards, and HTTP tests for Demo SIM access plus LIVE/invalid-environment rejection. Run: `dotnet test tests/Banking.Tests/Banking.Tests.csproj --arch x64 --filter 'FullyQualifiedName~SaxoPortfolioTests|FullyQualifiedName~SaxoOrderTests|FullyQualifiedName~MarketTests|FullyQualifiedName~PublicAccessTests.Saxo_order_routes|FullyQualifiedName~PublicAccessTests.Demo_allows_saxo' --artifacts-path artifacts/investments-data-check`. HTTP fixtures used isolated test databases; no production writes.

Concept 3 frontend implementation is now authorized and recorded in the dated UI QA report. A separately authorized backend deployment is required before either frontend can call the new endpoint. After release verify Azure and localhost:5444 against the same SIM account, including disconnected/error states and partial responses. Reconcile populated positions against actual broker fills before showing cost basis, allocation or returns as verified. Existing four GTC orders must not be duplicated.
