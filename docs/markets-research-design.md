# Markets — shared data for charts and AI

**Superseded on 14 September:** use [Markets and manual Saxo trading](markets-and-trading-plan.md). Banking must own copied code with no dependency on the retired applications. Basic market data and manual Saxo orders come first; insider enrichment and advanced research are deferred.

13 September 2026. Proposed design, replacing the display-widget-first [earlier plan](markets-free-design.md). Dan asked to reuse Trader and Trading-Agents-Saxo and retain a zero new market-data subscription requirement. This is a research and design increment, not an implementation or deployment.

## Recommendation

Build Banking's Markets research workspace around a small shared market-data service, adapting the useful parts already implemented in **Trader**. Feed both our interactive chart and advisor tools from the same stored data snapshot. Use TradingView **Lightweight Charts**, the open-source chart renderer already in both projects. It brings no market data and requires no TradingView subscription. Keep its license/NOTICE attribution. [Official project](https://github.com/tradingview/lightweight-charts).

MCP is a way to expose tools, not a prerequisite for getting data. Banking can call our own server functions using its existing advisor tool mechanism. A thin private MCP interface can expose the same service later if external clients need it; no new data subscription is needed merely to provide that interface.

## Free MCP options actually found

| Option | Useful data | Constraint and decision |
| --- | --- | --- |
| Community Yahoo/yfinance MCP | Price history, company data, financials, earnings and other supported Yahoo fields | Free open-source wrapper; unofficial Yahoo access. No guaranteed service or unrestricted data rights. Prefer adapting our existing .NET provider over adding another server just for the MCP label. [Example implementation](https://github.com/barvhaim/yfinance-mcp-server), [upstream limitations](https://github.com/ranaroussi/yfinance). |
| Official Alpha Vantage MCP | Supported historical market data, fundamentals and indicators | Free key tier: 25 API requests/day. Real-time and 15-minute-delayed US data are premium. Provider also describes unlimited access for verified open-source/educational projects; Banking eligibility is unconfirmed. Optional low-frequency enrichment, not the dashboard refresh engine. [Official MCP](https://github.com/alphavantage/alpha_vantage_mcp), [limits](https://www.alphavantage.co/support/). |
| Our own Banking market tools / optional MCP | Exactly the cached bars, metadata and calculations shown on our page | No separate MCP subscription; existing app hosting/AI costs remain. Recommended path because it reuses existing architectural components. |

These MCP services were documentation/code-researched, not installed or tested with personal credentials. A free MCP wrapper does not remove its underlying source's limits.

## Verified reusable inventory

Source inspection found these implementations; their current runtime health is not established by reading code. No trading applications were started, and no credentials copied.

| Existing asset | What to adapt |
| --- | --- |
| `C:/Repo/Trader/src/Trader.Infrastructure/MarketData/YahooFinanceProvider.cs` | Native .NET daily/intraday OHLCV retrieval, adjusted-close parsing and omission of incomplete bars |
| `Trader/.../MarketData/YahooSymbolMap.cs` and related tests | Saxo/MIC to Yahoo mapping, including Copenhagen and European exchanges. Change unknown-exchange fallback to unresolved; never silently select a different US listing. |
| `Trader/.../Data/SqliteBarCache.cs` | Timestamp/interval cache pattern, adapted to Banking's storage. Include provider, exchange, currency and adjustment mode in identity; refresh revised bars rather than retaining old corporate-action values forever. |
| `Trader/src/Trader.Brokers.Saxo/SaxoBrokerAdapter.cs` | Instrument resolution, chart/v3 history and quote handling. Adapt read-only methods, not the order engine. Preserve delay/price-type fields. |
| `Trader/web/trader-web/src/components/cockpit/PriceChart.tsx` | Candles/line/area, volume pane, responsive sizing, theme updates and selected-range interaction. React wrapper is reference; port needed behavior to Banking's existing frontend. |
| `Trader/.../components/research/ResearchCharts.tsx` | Multi-series comparison charts and supporting distributions |
| `Trader/src/Trader.Domain/Indicators/` and `Trader.Application/Services/CorrelationMatrix.cs` | Deterministic indicators and comparison calculations, subject to their existing tests and data requirements |
| `Trader/.../Knowledge/Edgar/EdgarInsiderTradeProvider.cs` | Cached public SEC Form 4 context as optional US-company detail |
| `C:/Repo/Trading-Agents-Saxo/apps/api/market_metadata.py` | Normalized company/sector/earnings metadata and caching ideas. Its spread proxy is an estimate, not a real bid/ask quote; do not present it as one. |
| `Trading-Agents-Saxo/apps/api/snapshot_builder.py` | One analysis snapshot shared across computations and explanations |
| `Trading-Agents-Saxo/apps/saxo/src/components/StockChart.tsx` and `IntradayChart.tsx` | Chart/annotation interaction ideas, supplementing the newer Trader chart |

Do not copy the old autonomous trading pipeline, buy/sell signals, trade execution, duplicate identity/storage system or credentials. OpenTerminal now contributes secondary layout/discovery ideas rather than the data foundation. Prefer our newer Trader implementations where functionality overlaps.

## Data plan

1. **Useful without Saxo login:** reuse Yahoo daily history for the personal research workspace, with cached observations and explicit source/date. Earlier direct endpoint probes returned AAPL, NOVO-B.CO in DKK and VWCE.DE in EUR. That establishes sampled availability, not comprehensive service reliability or permission for public redistribution. Keep public Demo synthetic until its feed rights are resolved.
2. **Saxo when authorized and connected:** instrument metadata, actual holdings, history and the quote access already available to the account. Do not buy exchange subscriptions. Delay/availability depends on feed rights; SIM data stays clearly simulation. A developer app key alone does not establish live data entitlement. [Saxo pricing-data semantics](https://www.developer.saxo/openapi/learn/pricing).
3. **Company detail:** cautiously reuse the older metadata normalization; retrieve supported Yahoo fields on demand. Missing ETF fees, holdings or fundamentals stay unavailable. Alpha Vantage's free tier and SEC can be optional targeted enrichment, not invisible fallbacks.
4. **No false source blending:** snapshots include provider, instrument/exchange/currency, period, interval, price type, adjustment basis, observation time, retrieval time and coverage. One series uses one basis. Switching provider is visible. Source outages show cached data with its date or an unavailable state.

Yahoo is unofficial and its upstream library describes personal-use restrictions. This is a pragmatic personal research option, not a guaranteed free real-time exchange feed. Data rights for cloud hosting, storage and external-AI processing must be checked during provider validation. The architecture can still be built/tested with recorded fixtures without pretending those questions are settled.

## Page design and interactions

**Research** is the landing view. A compact watchlist ribbon shows instruments and observed changes. The main row gives two thirds to an expandable chart and one third to the existing AI advisor. Above the chart: selected instrument, exchange, currency and data date; below: return over the selected period, volatility and maximum drawdown, computed from the same eligible observations. No portfolio cash hero on Markets.

Select a date range with the chart's range tool, or a keyboard-accessible From/To control. **Explain this range** passes the exact snapshot and dates to the advisor. Its response can annotate the chart with evidence-backed observations and create a separate generative visual. A falling price alone does not establish a cause; explanations needing news must retrieve supporting news or state uncertainty.

**Compare** overlays up to four chosen instruments, rebased to 100 on a common valid start date. Show currency/FX treatment, price-return versus total-return basis and aligned observation count. Correlation and drawdown come from server calculations. Do not claim ETF diversification from price correlation alone; actual fund holdings are a separate dataset.

**Discover** shows a heatmap of the user's selected research universe, calculated from our cached observations, with simple return/volatility filters. It is not an all-market screener. Missing observations stay gray. Symbols selected here update the same native chart and advisor context.

Company context, earnings/filings and research notes live in compact detail tabs. Every symbol or time selection is shared with the advisor; the same data is available through text and voice. “Compare Novo with my ETF over the last year” can open the comparison; “Save this analysis” records a snapshot in Analysis. Refresh adds a version without rewriting history.

Tablet uses a full-width chart with expandable advisor; phone uses watchlist swipe, chart, compact detail tabs and the existing voice companion. Keep light/dark themes, centered edit dialogs and expand controls. The [revised layout study](design-targets/markets-research.html) is illustrative, not a running data integration.

## Delivery sequence

1. **Provider/reuse proof:** adapt a read-only slice; verify Danish stock, European ETF and US stock history, identity and currency. Run applicable parsing/mapping/calculation tests and one visible chart + AI question against the same snapshot. Prove use of the dates and observations in the answer before building more panels.
2. **Research page:** chart, watchlist, source freshness, accessible selected range, advisor context and saving to Analysis.
3. **Comparison and Discover:** common-period return curves, deterministic risk statistics and explicitly scoped heatmap. Current-data refresh preserves saved runs.
4. **Optional context and MCP:** supported company/earnings/filing adapters; add Alpha Vantage only if its free allowance is useful. Expose the same service through MCP if another client needs it; existing Banking voice/text tools do not wait for that.

No market-data subscription, TradingView paid plan, automated trading or deployment is part of this proposal. The first acceptance outcome is that Dan and the AI can inspect and discuss the **same actual chart data**, rather than an attractive but disconnected widget.
