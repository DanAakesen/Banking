# Demo market-data investigation — 28 September 2026

Read-only investigation after Dan confirmed his funded LIVE account was visible. No orders, configuration changes or deployment performed.

## Verified production observations

- Authenticated Demo instrument search for Microsoft returns HTTP 200 and three listings. The earlier expired market-session diagnosis no longer describes this check.
- One-month chart requests for MSFT, GMAB.CO, SIE.DE and VWS.CO each return HTTP 502. The inspected MSFT error body is `SAXO_MARKET_DATA_NO_ACCESS`.
- Azure Markets visibly displays the shared LIVE-feed source and an access/subscription message. This is not merely a chart rendering failure.
- All four SIM holdings return `priceType: None` and `reliability: ApproximatedPrice`. Price and market-value fields exist, but are not reliable current valuations. Suppressing them as verified prices is correct.

## Confirmed app-side limitations

1. `SaxoMarketDataProvider.Chart` requests history before quotes. History failure exits before the independent info-price call, preventing available quotes from surviving unavailable history.
2. `Get` collapses all HTTP 403 responses and provider error codes containing Access into one code, discarding the specific provider explanation. The UI's instruction to check subscriptions is more specific than the evidence supports. A per-service authentication/permission cooldown can propagate that failure across symbols.
3. Investment current-price/value/P&L fields use SIM portfolio valuations. Shared LIVE snapshots serve charts and daily change, but do not supply these current-price fields. Markets position rows have the same broker-valuation dependency. This incompletely implements the intended shared LIVE research feed.

## Recommended correction

- Independently retrieve quotes and history and preserve valid partial results. Keep authentication failures and entitlement failures explicit; never replace unavailable prices with historical closes.
- Preserve a bounded, sanitized provider diagnostic code and operation so denied history, denied quotes, malformed requests and subscriptions are distinguishable. Do not expose raw responses or credentials.
- Display verified shared LIVE quotes for exact-matched instruments separately from SIM execution/acquisition facts. Any calculated valuation or P&L must be labelled as an estimate, use matching currency and verified FX when necessary, and must not overwrite broker account totals.
- Verify provider denial details before recommending a paid subscription. The reviewed official chart request contract supports the existing field groups/horizons; this alone does not establish entitlement.

Official chart contract: https://www.developer.saxo/openapi/referencedocs/chart/v3/charts/get__chart

Root cause of the specific provider access denial remains unresolved because the deployed projection discards its detail. No claim that purchasing subscriptions will fix it is warranted yet.

## Follow-up implementation — 28 September 2026 (local, not deployed)

All three app-side limitations above are fixed in source; see "Partial availability, diagnostics and SIM holdings" in [saxo-market-data.md](saxo-market-data.md).
- Quotes and history are now requested and returned independently.
- Failures keep the operation and a sanitized Saxo `providerCode`.
- A 403 cooldown applies only to the denied instrument.
- SIM holdings show exact-listing LIVE research quotes with labelled estimates in the instrument currency. Broker totals stay unchanged and no FX is applied.

Saxo documents that LIVE `NoAccess` for non-FX instruments usually means OpenAPI market data is not enabled on the account (a SaxoTraderGO profile setting that requires accepting terms). For some instruments it can mean a missing price subscription. The deployed build cannot show which, so the root cause stays **unresolved** until the change is deployed and the actual `providerCode` is observed.
