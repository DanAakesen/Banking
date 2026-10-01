# OpenTerminal: benefits, sources and access

Research date: 13 September 2026. Repository: [ErTasselli/OpenTerminal](https://github.com/ErTasselli/OpenTerminal), main commit `86adbe942c388b37f1ae5500ea9636b19f284d67` at inspection. Research only; no terminal, feed, subscription or account integration enabled.

## Recommendation

Reuse selected research UI ideas/components if useful. Do not adopt all of its data adapters as Banking's authoritative investment backend. Its dashboard is useful, but multiple adapters depend on website endpoints without a supported API contract. Keep Saxo as the source for owned investments. Investigate the official TradingView MCP separately for AI market research before choosing a terminal integration.

## Benefits

The repository supplies movable dashboard widgets, charts and indicators, watchlists, screening, heatmaps, market news and calendars. Its manual portfolio tracker and optional Claude integration overlap with Banking features. The MIT code license does not establish rights to third-party market data. Its UI/provider implementation is oriented toward US equities; Danish and European coverage needs explicit adaptation and verification.

## Included sources

The following reflects the [provider code](https://github.com/ErTasselli/OpenTerminal/tree/main/server/src/providers), not just the README. No payment being configured in code is not proof of unrestricted permitted use.

| Source | Data used | Access/cost finding |
| --- | --- | --- |
| Nasdaq | Quotes, history, options, earnings | Website endpoints called without keys. No subscription configured; licensed feed entitlement not established. |
| Yahoo Finance | Quotes, charts/history, search, options | Unofficial website endpoints, some requiring cookies/crumb tokens. No paid plan configured; susceptible to access changes. |
| Stooq | CSV quotes and daily history | Keyless downloads; this inspection's history request received HTML instead of CSV. |
| TradingView scanner | Fundamentals, screening, heatmap and earnings | Unauthenticated website scanner/search endpoints. This is not the official MCP integration. |
| CoinGecko | Crypto prices, rankings and market metrics | Official free keyless API has dynamic IP limits; free Demo keys and paid Pro tiers also exist. [Access documentation](https://docs.coingecko.com/docs/keyless-public-api). |
| Binance | Spot tickers, candles and order books | Public market-data endpoints require no API key; rate and access restrictions apply. [Official API documentation](https://github.com/binance/binance-spot-api-docs/blob/master/rest-api.md). |
| FRED | Yields, daily VIX and macro series | Repo downloads CSV without a key. Formal API requires a free key; series rights/attribution still matter. [API access](https://fred.stlouisfed.org/docs/api/api_key.html), [terms](https://fred.stlouisfed.org/legal/). |
| Forex Factory / Fair Economy | Economic calendar | Public weekly JSON feeds, no key/payment configured. Not all events have actual release values. |
| Yahoo / Google News RSS | Headlines and links | Feeds accessible without keys; linked publishers can require subscriptions. |
| SEC EDGAR | Insider filings / Form 4 | Public data without an API key; identify the application and respect fair-access limits. [SEC documentation](https://www.sec.gov/search-filings/edgar-application-programming-interfaces). |
| FINRA | Daily short-sale volume | Free for non-commercial use. This is not short interest and does not represent all market trading. [FINRA source](https://www.finra.org/finra-data/browse-catalog/short-sale-volume). |

Optional Claude API usage adds a separate cost. Banking could retain its existing advisor instead.

## Actual endpoint checks

Bounded, unauthenticated public HTTP requests were made from the local PC, using an identifying research user agent. No private banking data or keys were sent. Source code was inspected, not installed or executed. Detailed results: `artifacts/openterminal-research/probes.json`.

- Usable samples: Nasdaq quote, TradingView scanner, CoinGecko, Binance, economic calendar, both RSS feeds, SEC company submissions and FINRA's daily file.
- Yahoo returned price history for AAPL, NOVO-B.CO in DKK and VWCE.DE in EUR. This confirms those endpoint samples, not complete international support throughout OpenTerminal.
- Stooq returned an HTML challenge instead of CSV. No bypass attempted.
- FRED's CSV request timed out after 15 seconds. This alone does not establish permanent unavailability or a paywall.

These checks do not establish sustained reliability, licensed real-time prices, all provider functions or Azure access. Friday's latest stock bars were expected during Sunday's inspection. Full SEC Form 4 parsing was not exercised.

## Separate option: official TradingView MCP

[TradingView now documents an official MCP server](https://www.tradingview.com/mcp/docs), in beta, included with Essential and higher paid plans; trials are excluded. It uses TradingView OAuth and offers historical bars, screening, fundamentals, macro data, news and calendars. This updates the earlier broad assessment that TradingView lacked a suitable data integration.

OpenTerminal does not use this interface. Banking authentication, relevant exchange entitlements, and permission to display/store the returned data still need verification. No exact subscription quote or paid account test was completed. [Current plans](https://www.tradingview.com/pricing/).

TradingView also offers [free branded widgets](https://www.tradingview.com/widget/), but display widgets should not be treated as an AI data API.
