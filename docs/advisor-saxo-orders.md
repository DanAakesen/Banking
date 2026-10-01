# Guided Saxo orders in chat — local implementation, 22 September 2026

27 September update: follow [the shared Saxo/Investments plan](saxo-investments-plan.md). Production SIM preparation/submission is available to Demo visitors and Dan when enabled. Review tickets belong to the authenticated browser session, independent of shared Demo financial data. The client confirmation sends `confirm: true` to the immutable-ticket backend endpoint. LIVE access is reserved for Dan; LIVE order execution remains outside this release. This supersedes the historical local-only boundary and the incorrect owner-only SIM restriction.

The advisor can discuss a stock, resolve its exact Saxo listing, read the broker ticket and owned account IDs, collect order choices, and prepare a SIM review card. The user submits by pressing **Confirm SIM order**. Text/voice model tool calls cannot bypass this confirmation. Live trading and production deployment are outside this increment.

Supported choices: stock buy/sell limit orders, 1–1,000 whole shares, DayOrder or GoodTillCancel. New buys may include an attached stop-loss and/or take-profit. Attached exits use the same instrument, account and quantity, with GoodTillCancel duration. The advisor asks explicitly about both exit choices; `null` means the user declined. Market, trailing-stop, standalone stop-limit and modification/cancellation of submitted orders are not exposed by the advisor.

The server resolves a human-readable account ID to its owned Saxo account key. It validates instrument currency, prechecks the complete order, and creates a scoped immutable ticket lasting two minutes. Confirmation rechecks ownership, cash/holdings, broker precheck and estimated cash requirement. Increased cost or expired review requires a fresh review. A ticket is persisted as uncertain before submission, so retries and process restarts cannot automatically duplicate it. Related-order IDs and missing child acknowledgements are recorded.

After submission the advisor reads Saxo open orders and order activity, matching exact order IDs or the ticket reference. Accepted, filled, rejected and unconfirmed states stay distinct. The card includes **Refresh order status**; missing history or a failed lookup never implies a fill. Coverage is the existing latest 100 open orders and seven-day audit window, with pagination flags retained by the order-list resource.

Tool surface: `saxo`, `saxo_orders`, `saxo_instruments`, `saxo_ticket`, `saxo_order_status`, and `prepare_saxo_order`. Existing `confirm_proposal` is explicitly blocked for Saxo cards. The application confirmation endpoint requires both `confirm` and `confirmOrder` and uses the saved payload, never client-provided order changes.

Source contracts: [Saxo order placement](https://www.developer.saxo/openapi/learn/order-placement) and [precheck](https://www.developer.saxo/openapi/referencedocs/trade/v2/orders/post__trade__precheck). Broker precheck remains authoritative for instrument-specific support.

## Validation

- Actual authenticated advisor retrieved 999,973.83 EUR account value/cash, zero positions, zero open orders and nine historical events. No order submitted.
- Actual instrument search distinguished GMAB:xcse from GMAB:xnas; ticket returned account 22741575 in EUR and instrument currency DKK. Saxo reported NoAccess for Copenhagen Genmab quotes; advisor surfaced it as unavailable, not a usable executable price.
- Backend: nine Saxo order tests passed, covering scoped/expired tickets, cash/holdings, duplicate and uncertain writes, attached-order payloads and missing child acknowledgement.
- Advisor: 101 tests passed during implementation. A final focused run passed all 13 Saxo/voice tests, including preparation without placement, human confirmation gate, workspace scope, no replay, status evidence and unavailable status.
- Actual Saxo SIM precheck passed for an explicitly test-priced Genmab Copenhagen buy with attached stop-loss and take-profit. The instrument requires StopIfTraded; the service resolves and freezes the supported stop type in the reviewed ticket. No order submitted. Refreshing the card confirmed that it remained unsubmitted.
- The rendered card showed the correct account/instrument currencies and estimated total cost (not mislabeled as fees). Mobile viewport inspection confirmed wrapped fields and no horizontal overflow within the card; the viewport was restored afterward.
- Actual order submission and microphone acceptance are not claimed as tested in this increment. The user retains the final submission action.
