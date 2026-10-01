# Markets — free data and research workspace

**Superseded:** Dan rejected the display-widget-first approach. Use [Markets — shared data for charts and AI](markets-research-design.md), based on inspection of his Trader and Trading-Agents-Saxo implementations. This document is retained as an earlier proposal, not the current design.

13 September 2026. Status: proposed implementation plan; no feeds or terminal installed. Dan confirmed a free-only TradingView constraint after the [provider investigation](openterminal-research.md).

## Decision and limits

Use Banking's existing Markets page and advisor. Adopt selected OpenTerminal research patterns, with free TradingView embeds for market display. Do not add a second application, account system, AI assistant or portfolio ledger.

**TradingView MCP is excluded from this free plan.** Its official documentation includes it with Essential and higher paid plans, not free accounts or trials. It would provide history, fundamentals, screening, news and calendar tools, but delivers none of those to our AI under the chosen zero-subscription constraint. No trial or unofficial MCP workaround is planned. [Official MCP documentation](https://www.tradingview.com/mcp/docs).

TradingView's free widgets provide branded market displays. They do not supply our backend with a reusable market-data API. Exchange availability and delays vary; keep the provider's attribution and delay indications. Free widgets cannot guarantee live Danish exchange prices or arbitrary custom styling. [Widget catalogue and FAQ](https://www.tradingview.com/widget/).

Free-only here means no new market-data subscription. Existing Azure hosting and OpenAI usage still have their existing costs.

## Page design

Keep Markets under Wealth, distinct from Investments (owned assets). Preserve Banking's compact navigation, themes, typography, rounded surfaces and centered dialogs. No trading controls, decorative colored left borders, or large duplicate balance hero.

Desktop has a compact heading with symbol search and Customize. A narrow market overview strip precedes the main research workspace: watchlist at the left; selected-instrument chart in the center; existing AI advisor at the right, approximately one third of the main workspace. Below the chart, three compact regions show company context, news and upcoming events. Discover and Calendar are alternate views, avoiding loading every widget at once.

Tablet: advisor opens from an icon into the existing expanded modal; watchlist and chart share the main space. Phone: horizontal watchlist, then chart, then a single detail tab at a time. AI uses the existing expandable companion/pane. Reordering uses up/down actions on touch and keyboard as well as desktop dragging.

See the [interactive layout study](design-targets/markets-free.html). It uses explicitly illustrative content and no external requests.

## What we take from OpenTerminal

| Pattern | Banking treatment | First version |
| --- | --- | --- |
| Movable widget workspace | Port the layout interaction concept into our existing stack; retain MIT attribution for any actual copied code | Reorder/hide sections; reset layout; bounded layouts instead of arbitrary overlapping windows |
| Watchlist and instrument search | Extend existing Banking watchlist; store provider-qualified symbol, exchange and currency separately | Selecting an instrument updates the research context; add/edit in centered modal |
| Main chart and interval controls | Use a free TradingView Advanced Chart embed, not OpenTerminal's unofficial quote adapter | Chart expands into a large modal; provider-supported controls remain inside embed |
| Sector heatmap and screener | Free TradingView widgets in Discover | Lazy-loaded; no assumption that clicking inside them can control Banking's watchlist |
| News and economic calendar | Compact previews, with deeper views on demand | Free display widgets; external links preserve publisher/access restrictions |
| Provider health and fallbacks | Adopt the useful health/freshness pattern in our own data tools | Show last successful observation, source, exchange/currency and unavailable status; never mix incompatible symbols |

Do not copy its manual portfolio ledger, Claude chat, options chain, order book, short-selling panels or US-only scanner defaults into the initial personal-finance experience. The useful parts are research organization and visual exploration. OpenTerminal uses React/Next while Banking has its own frontend, so this is selective adaptation, not dropping its components into the current page unchanged.

## Widget and data ownership

| Region | Free source/design | AI access |
| --- | --- | --- |
| Market overview | TradingView Market Overview widget | Display only |
| Selected instrument | TradingView Advanced Chart and optional Symbol Info/Fundamental Data | Display only; do not read iframe contents or imply the advisor can see the chart |
| Watchlist | Banking's stored symbols and notes | Yes; research interests, not holdings or current prices |
| Discover | TradingView ETF/stock heatmap or screener, loaded on request | Display only |
| News | TradingView Top Stories display; separately permitted RSS headline/link adapters are an optional later step | Only independently retrieved, attributable headlines; not paywalled article bodies |
| Upcoming events | TradingView Economic Calendar display | Display only in first version |
| Owned portfolio | Existing Saxo integration after sign-in and entitlement verification | Actual account data when connected; never fabricate holdings from watchlists |
| Macro context, later | Official FRED API with free key | Source-dated observations, subject to series rights; not a live stock quote service |
| US company filings, later | SEC EDGAR public API | Actual filing context; US coverage, not universal company fundamentals |

Crypto feeds are optional future modules, not default clutter. Nasdaq/Yahoo website adapters remain experimental candidates until access terms and operational reliability are settled. Stooq and the timed-out FRED CSV path are not reliable defaults based on our probes. Paid feeds and paid TradingView MCP must never activate as fallbacks.

## AI behavior

The selected Banking symbol, exchange and research notes can accompany a user prompt. Do not send balances or memories to a TradingView widget. Our server tools expose only independently available records, with dates, units, provenance and explicit unavailable fields.

Useful initial actions: explain an instrument type; compare stated characteristics; connect research to confirmed priorities; analyze the connected Saxo portfolio; create an analysis from accessible inputs. Explanations based on general knowledge are distinct from claims based on current market data. If asked to explain a displayed price movement without accessible history/news, say that the widget's figures are not available to the advisor and offer an analysis using available records. No screenshot scraping or invented chart interpretation.

Saved analyses retain their data snapshot and source dates. Refresh creates a new version only from data we can actually retrieve. Research actions stay separate from trading and from automatic memory creation.

## Build sequence and acceptance

1. **Validate free display coverage.** Test the supported widget configuration for Copenhagen Novo Nordisk, a European UCITS ETF, a US stock and an FX pair. Record unavailable/delayed symbols rather than silently substituting instruments. Confirm authorized embed availability on local and production hosts before relying on it.
2. **Build native shell and watchlist.** Add selected-symbol context, centered create/edit, accessible reordering, persistence, responsive layout and dark/light mappings. Keep current Markets notes intact.
3. **Add lazy-loaded widgets.** Main chart first, then Discover and Calendar. Retain branding; provide a meaningful failed-load state and provider link. Configure only required external origins; do not weaken the existing generative-artifact sandbox.
4. **Connect only accessible data to AI.** Start with our stored research and authorized Saxo records. Add independently supported free sources incrementally, with caching, explicit source freshness and no paid fallback. Keep display-only information clearly distinct.
5. **Production acceptance after an authorized deployment.** Confirm no TradingView subscription is required; test unavailable symbols, blocked embeds, mobile controls, saved layouts and AI refusal to invent inaccessible widget values. Verify watchlists never increase portfolio totals. Update the production test script as implementation proceeds.

Remaining questions: exact Danish/European widget coverage, delays, private-site embed eligibility and relevant symbol/selection APIs. These are validation tasks, not promises established by the source-level research. Markets implementation awaits the next build instruction; this request authorizes planning after the memory fix.
