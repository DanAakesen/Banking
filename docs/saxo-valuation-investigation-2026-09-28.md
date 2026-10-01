# Saxo SIM valuation investigation — 28 September 2026

## Finding
The current missing holding valuations originate in the provider response, not a dropped field in Banking. Fresh read-only Azure checks at 11:34–11:36 Copenhagen returned portfolio status Ok and both owned instruments. Banking requests PositionBase, PositionView, DisplayAndFormat and Costs. SaxoReadClient maps CurrentPrice, MarketValue, MarketValueInBaseCurrency, CurrentPriceType, CurrentPriceLastTraded and CalculationReliability directly; the frontend intentionally rejects unreliable values.

| Holding | Quantity | Provider current price | Price type | Market value | Calculation reliability | Bid/ask access |
| --- | ---: | ---: | --- | ---: | --- | --- |
| Siemens SIE:xetr | 2 | 0 | None | 0 | ApproximatedPrice | NoAccess / NoAccess |
| Vestas VWS:xcse | 5 | 0 | None | 0 | ApproximatedPrice | NoAccess / NoAccess |

Both position responses include 15-minute delay metadata but no price timestamp. That metadata does not establish a usable delayed quote. The separate read-only ticket lookup returns SAXO_MARKET_DATA_NO_ACCESS for both instruments, with no bid/ask. No review/precheck/submit endpoint was invoked.

Saxo returns nonzero position P&L but marks it ApproximatedPrice, officially defined as calculated from a synthetic non-market price. It must not be presented as verified market performance. Account totals remain available with account-level reliability Ok: booked cash 999,973.83 EUR + invested 686.67 EUR - pending settlement 704.89 EUR = total 999,955.61 EUR at this observation. This does not override position-level reliability or validate actual market returns. Confirmed quantities, opening prices and reported commissions remain usable acquisition facts.

Evidence: artifacts/saxo-valuation-audit-20260928.json. Credentials, account keys and client identifiers are omitted.

## Official documentation and uncertainty
- [Position fields](https://www.developer.saxo/openapi/referencedocs/port/v1/positions/get__port__me/schema-positiondynamic) confirm the mapped field names.
- [CalculationReliability](https://www.developer.saxo/openapi/referencedocs/port/v1/positions/get__port__me/schema-calculationreliability) defines ApproximatedPrice as synthetic non-market pricing.
- [Linking LIVE to SIM](https://openapi.help.saxo/hc/en-us/articles/4416934146449-How-do-I-connect-a-Live-account-to-a-SIM-Demo-account), updated 7 September 2026, says a funded LIVE account linked to SIM provides delayed data for available products; unlinked default SIM accounts are restricted to Saxo instruments such as FX.
- [Enabling market data](https://openapi.help.saxo/hc/en-us/articles/4418427366289-How-do-I-enable-market-data), updated 24 August 2026, says enabling OpenAPI data on LIVE does not provide SIM market data.
- [Delayed quotes](https://openapi.help.saxo/hc/en-us/articles/4416934340625-Why-are-quotes-still-delayed-after-I-subscribe-to-market-data) says SIM non-FX prices can only be delayed, even with a linked LIVE subscription.

The documentation conflicts on general SIM availability. The concrete current account result is denied quotes. Linking is a possible documented eligibility route, not a guaranteed remedy. Do not enable LIVE, link accounts, accept terms, purchase subscriptions or upgrade TradeLevel without separate authorization. Dan's confirmed choice is to continue SIM-only.

## Practical next option, proposed only
The existing Markets research provider successfully returned exact mapped listings through the same deployed API:
- SIE.DE / XETRA / EUR: 277.25, quote time 11:20:43 Copenhagen, retrieved 11:35:52.
- VWS.CO / Copenhagen / DKK: 198.35, quote time 11:35:39, retrieved 11:35:53.
Source Yahoo Finance; both responses report stale=false and may be delayed. Evidence: artifacts/saxo-valuation-research-prices-20260928.json. Only public symbols were sent to the existing research provider, not quantities or account identifiers.

A separately labelled indicative valuation could use these research prices while Saxo remains authoritative for quantities, trades, cash and fees. Require exact listing/currency match, visible source and timestamp, freshness handling and explicit FX provenance before EUR totals. Do not substitute research prices into executable broker quotes or overwrite broker valuations. Do not infer realized returns, dividends or historical account performance from price charts. This alternative is not implemented or approved by this investigation.

No application code, deployment, orders, provider settings or personal wealth data changed. Snapshot-history work is a separate next step and must retain source, environment, observation time and quality flags; unavailable values cannot be backfilled as actual history.
