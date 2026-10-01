# SIM test portfolio proposal — 27 September 2026

Status: **Four approved SIM limit buys submitted and independently verified as Working at Saxo on 27 September 2026 at 19:44 Europe/Copenhagen. No fills or holdings yet.** Dan approved Siemens as the SAP replacement and the previously surfaced commissions. SAP was not submitted. Earlier preparation statements below are dated history; see the execution record at the end for current state.

Dan explicitly chose to continue without LIVE or LIVE/SIM account linking. All subsequent orders remain SIM-only. This supersedes the earlier instruction to resolve quote access through account linking before step 2. Missing broker prices remain a known limitation, not permission to invent prices or report unverified valuation/P&L.

## Verified through the production API

- Shared Demo SIM trading enabled and allowed, with explicit confirmation required. No open broker orders were returned; the bounded activity response was empty.
- All four exact stock listings below are tradable according to ticket validation and support Limit orders. The shared SIM account is denominated in EUR.
- All four return `SAXO_MARKET_DATA_NO_ACCESS`; no executable Saxo bid/ask is available.
- Reference prices were freshly fetched through `/api/markets/chart` on 27 September. Yahoo Finance reports the quote timestamps below. These are research references, not Saxo execution quotes; they do not guarantee the prices at which SIM will fill.

## Proposed purchase limits

| Stock / Saxo symbol | UIC | Quantity | Research reference | Reference time (Europe/Copenhagen) | Proposed limit per share | Maximum stock consideration |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| Genmab / GMAB:xcse | 14400824 | 1 | 2,277 DKK | 25 Sep 2026 16:59:52 | 2,280 DKK | 2,280 DKK |
| Vestas / VWS:xcse | 15611 | 5 | 198.50 DKK | 25 Sep 2026 16:59:42 | 199 DKK | 995 DKK |
| SAP / SAPG:xetr | 1126 | 2 | 185.92 EUR | 25 Sep 2026 17:39:50 | 186 EUR | 372 EUR |
| Microsoft / MSFT:xnas | 261 | 1 | 516.17 USD | 25 Sep 2026 22:00:01 | 517 USD | 517 USD |

Limits are proposed maximum purchase prices rounded slightly above the dated references. They are **not** observed Saxo prices. Per-currency totals: **3,275 DKK + 372 EUR + 517 USD**, excluding commissions and FX charges. Do not sum different currencies without a dated conversion source. Account-currency cash requirements and fees must be obtained from the broker precheck after Dan approves the proposal, before submission; seek new approval if the material terms/costs change.

Suggested duration: GoodTillCancel, because preparation is on Sunday. Unfilled orders remain open until filled or cancelled; market opening does not guarantee execution. No attached stop-loss or take-profit in this initial proposal. Test those separately after base purchases and portfolio reconciliation. No short sales, leverage, fractional shares or ETFs.

## Why these test fixtures

- Genmab and Vestas: Danish listings with different prices and share counts.
- Vestas five shares and SAP two shares permit a separately approved partial-close test.
- SAP: EUR listing in the same currency as the SIM account.
- Microsoft: USD listing, alongside DKK positions, exercises conversion into the EUR account currency.
- This is a functional test dataset, not a portfolio allocation or expected-return recommendation.

Reference links: [Genmab](https://finance.yahoo.com/quote/GMAB.CO/), [Vestas](https://finance.yahoo.com/quote/VWS.CO/), [SAP](https://finance.yahoo.com/quote/SAP.DE/), [Microsoft](https://finance.yahoo.com/quote/MSFT/).

## Execution boundary

1. Dan approves or revises the four instruments, quantities, limits, duration and lack of attached exits.
2. Fetch the current SIM account and instrument details again. Precheck the approved terms only; do not change limits automatically to chase a fill. Review ticket expiry is two minutes and tickets belong to the originating browser session.
3. Surface actual costs and any changed/material broker conditions. Preserve the explicit confirmation boundary. Submit only approved terms, once per ticket.
4. Verify order acknowledgement, working status and actual holdings separately. Never claim `Accepted` means `Filled`. Report missing prices/P&L honestly; do not use SIM historical mock reports as portfolio returns.

No order submission occurred. The original proposal preparation used no precheck writes; the subsequently approved three purchases were prechecked as recorded below. No LIVE connection, subscription or consent changes occurred.

## Approval and broker precheck update — 27 September 2026

Dan: "Find en anden en sap, de andre godkendt". This approves the exact Genmab, Vestas and Microsoft quantities, limits and duration above; SAP is rejected and must not be submitted. The original table is retained as proposal history, not authorization for SAP.

All three approved purchases returned `PreCheckResult: Ok` and local ticket state `Reviewed` through the deployed production API in shared Demo/SIM. No submission endpoint was called. Review tickets were not retained; obtain fresh tickets in the submitting session.

| Approved stock | Broker commission in instrument currency | Estimated total in account currency (EUR) | Estimated cash required (EUR) |
| --- | ---: | ---: | ---: |
| Genmab | 29 DKK | 308.8913239 | 312.76 |
| Vestas | 29 DKK | 136.9877504 | 140.86 |
| Microsoft | 15 USD | 467.08004 | 480.21 |

Broker fields `EstimatedTotalCostInAccountCurrency` and `EstimatedCashRequired` differ; these are preserved separately, not presented as the same final debit. Estimated cash required sums to 933.83 EUR. The precheck reports zero exchange fee, stamp duty and additional transaction costs, but does not establish a separate final FX charge. Commissions total 58 DKK + 15 USD and were excluded from the original stock-consideration proposal. Surface them before submission, especially the roughly 3% commission on the smaller Vestas and Microsoft tickets.

### Replacement pending approval

- Siemens AG, Xetra, `SIE:xetr`, UIC `117646`, whole-share Stock in EUR. Ticket validation succeeded and includes Limit support.
- Proposed SIM Buy: **2 shares at a limit of 279 EUR**, GoodTillCancel, no attached exits. Maximum stock consideration **558 EUR**, excluding broker charges. This is a functional test choice for EUR holdings, not an expected-return recommendation.
- Production research endpoint `/api/markets/chart?symbol=SIE.DE&range=1mo` returned Yahoo Finance reference **278.30 EUR**, timestamp **25 September 2026 17:39:59 Europe/Copenhagen**, fetched **27 September 2026 19:40:47 Europe/Copenhagen**. [Reference](https://finance.yahoo.com/quote/SIE.DE/).
- Saxo still reports `SAXO_MARKET_DATA_NO_ACCESS`; the reference is not an executable quote. Do not automatically adjust the proposed limit.
- Siemens has not been broker-prechecked or submitted; obtain approval of its concrete terms first.

## Execution record — 27 September 2026, 19:44 Europe/Copenhagen

Dan replied "Ja" to the concrete Siemens proposal (2 shares, 279 EUR limit, GTC, no attached exits, plus commission) and the other three commissions. Fresh instrument/account checks and broker prechecks passed for all four. Siemens commission was 12 EUR; Genmab/Vestas remained 29 DKK each and Microsoft 15 USD. Siemens estimated cash required was 582 EUR, distinct from 570 EUR consideration plus commission; no claim is made that the extra reservation is a final fee. No exchange fee, stamp duty or additional transaction costs were returned by precheck.

Submitted exactly once per reviewed ticket using the deployed production API in shared Demo/SIM. All four receipts returned `Accepted`, no error. Separate broker reads returned each exact order ID, symbol, quantity and limit as `Working`; audit history contained matching `Placed / Confirmed` records. No SAP order, attached exit, cancellation or LIVE operation was sent.

| Stock | Quantity | Limit | Broker order ID | Review ticket ID | Verified status |
| --- | ---: | ---: | --- | --- | --- |
| Genmab | 1 | 2,280 DKK | 5040511178 | f77135ad-4203-4bfd-9247-40298cbfd00a | Working |
| Vestas | 5 | 199 DKK | 5040511179 | fd9ab929-e50a-4c4a-8de4-b08f7ace41d4 | Working |
| Microsoft | 1 | 517 USD | 5040511180 | d980f622-c264-489d-b398-7ed623a3b726 | Working |
| Siemens AG | 2 | 279 EUR | 5040511181 | 39ad3e40-0ec4-4433-84b4-4327f8d03bd1 | Working |

Order read observed at 19:44:12 +02:00: four working orders, no pagination, no history error. Read-only portfolio preview observed at 19:44:40 +02:00: zero positions, account orders count 4, invested 0 EUR, cash and total value both 999,973.83 EUR, reliability `Ok`. Therefore acceptance is verified, execution is **not**. Do not resubmit these orders because positions remain empty. GTC orders remain open until filled or cancelled; later fill reconciliation is the remaining step. Broker quote access remains unavailable; no invented execution prices or P&L were introduced.

## Release reconciliation attempt — 28 September 2026
Build `2026.09.28-complete-investments` is deployed and verified through Azure and localhost:5444. Fresh combined portfolio/orders/activity reads returned `SAXO_ACCESS_REQUIRED` and `SAXO_SIGN_IN_REQUIRED`. Therefore the order statuses above are historical observations, not current verified statuses. Current quantities, purchase prices, final fees, holdings and portfolio values remain unknown until Saxo SIM sign-in is renewed. No orders were placed, replaced, cancelled or duplicated, and LIVE was not enabled. The UI preserves unknown values and keeps SIM separate from personal wealth. Redacted endpoint evidence is in `artifacts/investment-release-azure.json` and `artifacts/investment-release-local.json`.

## Verified SIM reconciliation — 28 September 2026, 07:34 Europe/Copenhagen
After Dan renewed Saxo sign-in, sequential reads through Azure and localhost:5444 both returned status Ok, reliability Ok, no pagination and matching financial records. Account currency EUR; cash 999,973.83; account value 999,973.83; invested 0; unbooked activity 0; holdings 0. Cash + invested + unbooked reconciles to account value. Optional commission/exchange-fee/share-value fields were not returned and remain unknown, not zero or final execution fees.

All four original order IDs remain Working with their approved quantities and limit prices: Genmab 1 at 2,280 DKK, Vestas 5 at 199 DKK, Microsoft 1 at 517 USD, Siemens 2 at 279 EUR. Filled quantities are absent, not a verified numeric zero. Eight audit events are exactly Placed/Requested and Placed/Confirmed for each original order; none confirms a fill. There are no holdings or actual execution prices/costs to reconcile yet. No new, replacement, cancellation or LIVE request was sent.

Browser checks on both frontends show the same 999,973.83 EUR, zero holdings and four open orders in Investments and the separate 360 Saxo SIM section. The recorded Demo asset total remains 433,352 DKK; the SIM balance is not included or converted into personal wealth. Evidence: artifacts/investment-release-azure.json and artifacts/investment-release-local.json. This supersedes the earlier sign-in-blocked read, while fill/fee acceptance remains pending.

## First confirmed fills and reconciliation — 28 September 2026, 09:16–09:20 Europe/Copenhagen
Read-only verification on deployed build `2026.09.28-investments-signin` confirms two original SIM orders filled and two remain Working. No new, replacement, cancellation or LIVE request was made.

| Order | Instrument | Confirmed filled quantity | Execution/open price | Reported opening commission | Confirmed fill time (Copenhagen) |
| --- | --- | ---: | ---: | ---: | --- |
| 5040511179 | Vestas / VWS:xcse | 5 | 199 DKK | 29 DKK (3.88 EUR) | 09:00:02 |
| 5040511181 | Siemens / SIE:xetr | 2 | 277.95 EUR | 12 EUR | 09:00:10 |

Both have matching FinalFill/Confirmed audit records, complete filled quantities and holding SourceOrderId. Vestas consideration is 995 DKK; including the reported commission it is 1,024 DKK (204.80 DKK per share). Siemens consideration is 555.90 EUR; including reported commission it is 567.90 EUR (283.95 EUR per share). Other individual cost fields are absent and remain unknown, not certified zero. Both positions carry value date 30 September 2026.

Account-level reconciliation is exact for each individual response: at 09:16, 999,973.83 EUR booked cash + 683.16 EUR invested - 704.88 EUR unbooked transactions = 999,952.11 EUR account value. At 09:20 through localhost:5444, invested was 684.43 and value 999,953.38, also an exact reconciliation. Do not mix valuations from different read times. The broker's rounded unbooked components (share value -689.01 and commission -15.88) differ by one cent from the reported total -704.88; retain the authoritative total and do not invent an additional fee. Evidence: artifacts/saxo-fills-20260928-0916-azure.json and artifacts/saxo-fills-20260928-0920-local.json.

Genmab 5040511178 (1 at 2,280 DKK limit) and Microsoft 5040511180 (1 at 517 USD limit) remain Working. Read-only ticket queries still return SAXO_MARKET_DATA_NO_ACCESS for bid/ask on both; the reason Genmab has not filled cannot be confirmed from an executable quote. Microsoft's regular Nasdaq session starts at 09:30 Eastern / 15:30 Copenhagen on this date, later than this check; this explains the session timing but is not a broker-supplied rejection or guarantee of a future fill. Official hours: https://www.nasdaq.com/nasdaq-system-hours-of-operation.

### Browser acceptance findings — not yet corrected
- Investments correctly shows 2 holdings, 2 working orders and 10 activity records. 360 shows the same SIM account separately from personal wealth. The localhost frontend-only host was stopped; restarted only the existing frontend launcher on port 5444 and verified its production API reads.
- Saxo supplies CurrentPrice 0, CurrentPriceType None, MarketValue 0 and CalculationReliability ApproximatedPrice for both positions, while reliable account-level invested values are nonzero. The holdings table/detail renders these unavailable prices and values as zero and displays approximate P&L without a reliability label. It must preserve missing/unreliable valuations instead of implying worthless holdings.
- Opening commission is supplied as a structured cost object, but the detail renderer passes that object to a numeric amount formatter, so Opening costs appears unknown. Show known cost components individually; do not total absent components as zero.
- FinalFill/Confirmed is rendered as raw FinalFill plus a blanket note saying the event is not confirmation of a completed trade. Confirmed fills need their own label and correct description, while placement acknowledgements retain the distinction.
- Booked cash is not yet reduced by the purchases. The UI currently suppresses the allocation because it ignores unbooked transactions; expose pending settlement and use the reconciled figures with explicit labels before claiming a complete allocation.

This check verifies actual fills and the accounting bridge; the display issues above remain the next implementation work. No application code or deployment was changed in this verification.
