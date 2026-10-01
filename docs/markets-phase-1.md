# Markets — approved phase 1

16 September 2026. Local implementation; not deployed.

## Selected design and scope

Use [image 2](design-concepts/2026-09-16/markets-02.png) for Workspace, with the owner's written corrections taking precedence. Remove the three bottom sections, the order modal, Compare, filters and the market-pulse strip. Match the shared hero height. Use the image-3 Saxo SIM/LIVE selector and buying-power area. Use Overview's advisor width and the same persistent advisor instance on the right (the request's reference to the left was interpreted as a typo).

Workspace has a Watchlist/Holdings toggle, instrument search, and a linked chart with period controls. Holdings means owned Saxo positions, not pending orders. Explore contains the heatmap, selected-company fundamentals and the chart on the left, with the same advisor on the right. No bottom news, calendar or holdings panels.

## Implementation

- `markets-ui.js` / `markets.css`: two tabs, search and persist a selected stock/ETF through the existing workspace-scoped research endpoints; linked OHLC/volume chart, keyboard navigation, source/time metadata, error/retry and empty states. Periods: 1D, 1W, 1M, 3M, 6M, YTD, 1Y, 5Y. No Compare or custom filters.
- `IMarketDataProvider` / `YahooMarketDataProvider`: replaceable provider, actual Yahoo search and chart data. Adapted historical-bar semantics from the old Trader code, with no runtime dependency. Bounded requests, 2-minute in-process cache and a clearly labelled stale snapshot on refresh failure (up to 24 hours). Search cache: 15 minutes. Restart clears these caches. Missing OHLC bars are omitted, duplicate timestamps reconciled, no synthetic substitution. Charts display raw provider OHLC, not dividend-adjusted total returns.
- Vendored TradingView Lightweight Charts 5.2.0 with license and visible attribution. Charts and table use the same API response. Currency is shown alongside the selected instrument and source metadata.
- Explore adapts the old PortfolioInsightsBoard's heatmap/fundamental widget pattern. Third-party documents run directly at the TradingView remote origin in sandboxed frames. No remote scripts run at the Banking origin; parent script/connect CSP stays self-only. The frame allowlist adds only www.tradingview-widget.com. Their content is display-only and unavailable to the Banking advisor. Provider restrictions may make an instrument unavailable in a widget.
- Saxo read-only path separates SIM/LIVE credentials, refresh and hosts. No order endpoint or trading tool added. Existing private SIM setup is preserved. Environment switching never turns a SIM portfolio into LIVE. The connected-empty state requires a successful broker response; failed or absent access remains unavailable.
- Buying power uses Saxo `CashAvailableForTrading` when supplied. If absent, the label explicitly changes to Cash balance; it does not imply the cash balance is tradable. Both are account/client base currency, not converted to Banking's page currency.

## Provider access still required

The implementation supports independent local `saxo-sim.dpapi` and `saxo-live.dpapi` credentials beneath the user's Banking application-data directory. No new credentials or entitlements are created. Each environment needs its own registered Banking callback and owner sign-in. Existing configuration token inputs remain environment-specific. Tokens/secrets never go to the browser.

LIVE connection and empty real holdings cannot be accepted until the owner completes the Saxo connection. No real trade will be used to test connectivity. The advisor pane is available locally; specialized market/portfolio tools and advice are phase 2.

## Later phases — user-requested roadmap

Phase 2: manual and AI-assisted Saxo orders, AI portfolio advising, news, and strategy-based Buy/Sell/Hold advice. Define strategy evidence, data freshness, costs, and the owner-confirmation flow before enabling live execution. These are planned, not implemented by phase 1.

Phase 3: explore autonomous trading using reusable concepts/code from the retired apps. Requires its own agreed controls and explicit activation. This backlog entry does not enable trading or copy the autonomous engines.

## References

- [TradingView chart API](https://tradingview.github.io/lightweight-charts/docs/series-types)
- [TradingView stock heatmap](https://www.tradingview.com/widget-docs/widgets/heatmaps/stock-heatmap/)
- [TradingView fundamentals](https://www.tradingview.com/widget-docs/widgets/symbol-details/fundamental-data/)
- [Saxo SIM/LIVE environments](https://www.developer.saxo/openapi/learn/environments)
- [Saxo cash available for trading](https://www.developer.saxo/openapi/referencedocs/port/v1/balances/get__port)

Browser and automated verification results are recorded after the implementation checks below.

## Local verification - 16 September 2026

- Build succeeded with zero warnings/errors. 16 focused tests passed (MarketTests, WealthTests, PublicAccessTests, LocalAdvisorTests).
- Chrome actual UI search: Novo returns US ADR, Copenhagen and Xetra listings separately. Added NOVO-B.CO and MSFT to the local Demo watchlist and verified persistence after reload. Existing watchlist records were preserved.
- Actual Yahoo data loaded for Copenhagen DKK and Nasdaq USD. All eight periods were clicked through the UI with non-empty data and no errors. MSFT sample at verification: 60 intraday bars, 22 one-month bars, 64 three-month bars; the table is intentionally capped at 100 while charts use all bars.
- Verified unavailable Saxo access in Demo does not show fabricated zero positions. Connected-empty and SIM/LIVE mapping verified in backend tests. Real Saxo sign-in/holdings remain provider-blocked.
- Desktop hero measured 320px. Advisor measured 459px in a 1409px grid (one third after gaps). Tablet at 1024px: content/advisor each 384px in a 784px grid; no page overflow. Phone at 390px: content 344px and no horizontal page overflow. Shared mobile advisor launcher appears above content.
- Fixed the tablet span rule and chart fit after resize. Reused advisor no longer adds Overview-specific financial prompts to Markets.
- TradingView isolation refinement: opaque-origin frames broke the provider's cookie access. Final implementation embeds only the remote TradingView document directly with sandbox and preserved remote origin. No third-party script executes at the Banking origin.
- No Azure deployment, no bank sync worker, no real order, no paid subscription activated.
- Final Chrome checks: Explore heatmap and Microsoft fundamentals loaded actual provider content. Corrected fundamentals autosizing and opaque background for readable dark/light text. Verified the light Workspace and advisor; route context now explicitly synchronizes advisor theme. Restored Graphite after testing.

## Full release preparation - 16 September 2026
Dan authorized deploying all workspace changes. The advisor is now packageable alongside the .NET app on Azure; cloud mode uses the authenticated site's origin and separate persistent visitor scopes. Saxo authorization and paid entitlements are still not created by deployment. Phase 2/3 remain planned.
