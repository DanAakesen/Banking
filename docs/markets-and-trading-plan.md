# Markets and manual Saxo trading

Current scope: 14 September 2026. This supersedes the research-only and display-widget-first plans. Planning only; no order has been submitted and trading access has not been activated.

## Confirmed direction

Banking owns all copied and adapted implementation code. The source projects are disposable: no project references, filesystem paths, service calls, symlinks or startup dependencies on them. Copy useful provider/chart/order-handling code and applicable tests into Banking, retaining any required third-party notices. Do not import their autonomous trading systems.

Start with basic market data and manual Saxo trading from Markets. Insider filings, advanced discovery, strategy engines and autonomous execution are outside the first increment. Providers remain replaceable.

## Three independent components

1. **Market data:** provider-neutral instrument search/resolution, latest available quote and historical OHLCV bars. Yahoo is the initial personal-research provider. Cache and snapshot storage belong to Banking. Provider identity, exchange, currency, delay and adjustment basis accompany observations. Never silently map an unknown exchange to a US ticker. Source failures show dated cache or unavailable data.
2. **Chart and analysis:** TradingView Lightweight Charts renders Banking data. The advisor receives the same snapshot and selected date range. Charting has no TradingView account/subscription dependency; comply with the chart library's attribution/license. Add further data providers without rewriting the chart or AI tools.
3. **Broker:** Saxo owns accounts, buying power, actual holdings, execution quotes, order validation, order submission, amendments/cancellation and status. Market-data-provider changes must not change the broker or order destination. Use Saxo instrument UIC + AssetType and confirmed account mapping for every order, not the Yahoo ticker alone.

Yahoo prices are useful research observations, not executable Saxo quotes. The order ticket must fetch its own Saxo pricing/validation and retain any reported delay or indicative status. No paid data subscription may be enabled automatically. Standard brokerage fees and FX costs still apply to actual trades.

## First page

- Compact heading: Markets, Saxo connection/account and a clear SIM or LIVE label.
- Watchlist and symbol search above the main workspace. Preserve selected exchange and currency visibly.
- Main desktop row: chart across roughly two thirds, advisor across one third. Quote date/source adjacent to the chart; intervals and chart expansion stay compact.
- Buy / Sell beside the selected instrument. These open a centered order modal consistent with the rest of Banking.
- Under the chart: tabs for Holdings, Open orders and Recent activity, using Saxo state. Order status is visible without leaving Markets. The Investments page uses the same portfolio records.
- Tablet/mobile: chart first, horizontally scrollable watchlist, advisor expandable and modal adapting to screen size. Essential account, instrument, quantity, price and confirmation remain visible.

First assets: cash equities and ETFs. First orders: market and limit where Saxo reports support; propose limit as the default. Sell existing holdings only initially. Do not implicitly enable shorting, leverage, derivatives, margin or automated strategies.

## Order flow

Select instrument → Buy/Sell → choose Saxo account, quantity, order type, limit price and supported duration → request Saxo precheck → review estimated cost, FX, cash required and any warnings → user confirms → submit → show broker order ID and actual status.

Precheck is a validation/estimate, not a reserved price or guaranteed fill. Revalidate when the ticket changes or its review becomes stale. Never label Accepted as Filled. Track pending, rejected, partial fill, filled and cancelled states and reconcile with Saxo after reconnect.

Keep a durable local submission record and unique client request ID. Prevent duplicate clicks and do not blindly retry an order after a timeout. An external reference is a correlation aid, not assumed broker idempotency. Uncertain submissions remain visible and are reconciled against broker state before any repeat attempt. Amendment and cancellation get equivalent review/status handling.

AI may explain research and help populate a draft ticket from a user request. Final real-money submission belongs to an explicit user confirmation in the order UI. No autonomous order submission or broad trading tool access is included.

## Current connection reality

Banking currently has SIM-only OAuth/session code and a read-only client for balances/positions. The code checks a Banking callback address, while project evidence records callback registration and fresh sign-in as unfinished. No current authenticated Saxo session or live entitlement was verified in this planning turn. An existing development app is not proof that Banking is ready to place live trades.

Complete Banking's independent callback/configuration and sign-in. Verify permitted read/write access, then implement and test the order lifecycle in Saxo SIM. LIVE uses separate credentials/environment and the user's actual permissions. Only the owner submits a real trade during live acceptance; development never uses a real order as a connectivity test.

## Delivery order

1. **Independent code and basic data:** copy/adapt providers, mapping, chart behavior and meaningful tests. Prove Banking builds/runs with the old projects inaccessible. Prove one Danish stock, European ETF and US stock resolve to the intended exchange and currency; show their history and explain the same snapshot through the advisor. No insider data required.
2. **Saxo connection and portfolio:** independent OAuth/configuration, account selection, balance/holdings, supported instrument mapping and reported execution-quote status.
3. **Manual SIM trading:** order ticket, precheck, submit, status, partial/rejected outcomes, amendment/cancellation and timeout reconciliation. Verify double-click/retry behavior and SIM/Live separation.
4. **Owner-controlled LIVE enablement:** separate valid live registration/sign-in with trading permission; show costs and environment. Production deployment and a real trade remain separate explicit owner actions.
5. **Later enrichment:** insider filings, more providers, richer comparisons and MCP exposure as useful additions. Do not make basic market data or trading depend on them.

## Acceptance and sources

The release is useful when Banking independently displays basic market history, the advisor can inspect the same observations, and the owner can complete a manual Saxo order workflow with visible costs and status. No dependency on the retired apps, no paid TradingView plan, and no automated trading.

Official Saxo documentation reviewed 14 September 2026: [precheck and cost estimates](https://www.developer.saxo/openapi/referencedocs/trade/v2/orders/post__trade__precheck), [order operations](https://www.developer.saxo/openapi/referencedocs/trade/v2/orders), [read/write token permissions](https://www.developer.saxo/openapi/learn/security), [separate SIM/LIVE environments](https://www.developer.saxo/openapi/learn/environments), [price-feed semantics](https://www.developer.saxo/openapi/learn/pricing).
