# Investments page audit — 27 September 2026

Scope: inspect the existing Investments page against the four approved SIM orders. Read-only investigation; no additional orders, edits to financial records, deployment or frontend changes.

## Verified provider state

Production API observed at 19:56:25–26 Europe/Copenhagen:

- Genmab 5040511178, Vestas 5040511179, Microsoft 5040511180 and Siemens 5040511181 are all `Working` with the previously approved quantities and limits.
- Audit history contains `Placed / Confirmed`; no fill evidence. No history errors or pagination in these responses.
- Portfolio has zero positions. Account reports four orders, invested 0 EUR, cash and total value both 999,973.83 EUR, reliability `Ok`.
- These are pending buys, not portfolio holdings. Do not resubmit or count their intended value as invested assets.

## Browser inspection

Inspected `https://localhost:5444/#/investments`, the frontend-only host using the deployed backend, as Demo. Preserved an existing Markets tab after its unsaved-changes prompt and used a separate inspection tab.

- Page is still a manual statement-value workflow: large “See what you own” hero, unknown recorded value in DKK, “No investments recorded”, and “Add statement value” actions.
- Saxo integration appears below as a secondary provider block. “Read SIM portfolio” successfully returns 999,973.83 EUR total/cash and zero positions, matching the production API.
- Page never displays the four pending orders or their activity.
- Sidebar displays “Not connected” despite a working Saxo session. Source confirms this is a hardcoded label in `app.js`, not a provider response.
- A “Sign in to Saxo SIM” action remains visible while access is configured and portfolio reads succeed.
- Recorded wealth panel contains separately recorded bank/investment/pension figures. Its DKK investment zero is not the Saxo account total. The app correctly excludes SIM from recorded wealth, but the mixed page purpose is confusing.

## Code and data gaps

`wwwroot/wealth-ui.js` renders both Investments and Pension, fetches manual `wealth` records/summary plus Saxo status, and only reads the portfolio on button click. It has no order-history request, portfolio refresh flow, holdings allocation, performance visual, or holding-to-Markets navigation. Pension should remain unaffected by an Investments redesign.

`Providers/SaxoReadClient.cs` currently maps position name, symbol, UIC, quantity, asset type, current price, delay, unrealized trade P&L in base currency and reliability. It does not expose acquisition price, per-position instrument currency, current market value, position/account identity, realized result, settlement or actual fill fees. These are gaps in our current mapped response, not proof Saxo cannot provide them. Verify broker field availability when reconciling fills before promising these metrics.

`Providers/SaxoOrders.cs` already exposes working orders and bounded seven-day activity; Investments can reuse it. The mapped order response lacks currency, duration, and actual execution price; reliable instrument enrichment/additional broker fields are needed. Session-owned submission receipts are not a shared activity source: another Demo browser session sees shared broker orders/history but must not see another session's private review ticket.

Research-symbol mapping currently handles selected special Danish tickers and common US listings; it does not map the approved Genmab/Vestas/Siemens listings. Holding-to-chart navigation needs an explicit verified listing mapping, not guessed cross-exchange substitutions.

## Recommended delivery order

1. Define an Investments-specific portfolio contract: account/currency/as-of, separate open orders, actual holdings, and bounded activity, preserving error/coverage indicators.
2. Populate the waiting state from verified data now: four pending limit buys, zero holdings, cash balance. Load automatically with a refresh action; show actual SIM connection status.
3. Once fills exist, reconcile quantity, execution price, fees, FX and positions against Saxo before deriving allocation or returns. Missing quotes/values remain unavailable. Market research references are not execution quotes.
4. Follow the agreed design step: three visual concepts backed by those data states, select one, then implement desktop/tablet/mobile. Avoid extending the manual Pension/statement layout into the new Investments page.

This audit completes the requested inspection. The orders remain pending; there is no fill/return validation yet and no automatic monitoring was scheduled.
