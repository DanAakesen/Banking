# Saxo Investments capability audit

Date: 27 September 2026. Status: research; no runtime changes, trades or deployment.

Follow-up: Dan approved [the four-step implementation plan](saxo-investments-plan.md). Step 1 now has tested source changes removing the production read restriction and adding guarded shared-backend SIM submission. These changes are not deployed; the audit's deployed-behavior observations below remain valid until release.

## Verification boundary

The initial Codex browser attempt reached the official demo authentication form with empty credential fields; the browser connector could not open Chrome. A subsequent Windows Computer Use session successfully opened Chrome's Dan profile, used its saved Saxo login, and completed the existing Banking Production SIM connection through the deployed Markets page.

Fresh UI verification on 27 September 2026 at 17:17 Copenhagen confirmed the shared Azure API returned account data and the connected holdings collection. This is a successful account-summary/holdings read, not verification of every Saxo endpoint.

| Fresh measure | Result |
| --- | ---: |
| Account value | EUR 999,973.83 |
| Booked cash | EUR 999,973.83 |
| Available to trade | EUR 999,973.83 |
| Invested value | EUR 0.00 |
| Unbooked activity | EUR 0.00 |
| Blocked cash / margin used | EUR 0.00 |
| Margin available | EUR 999,973.83 |
| Margin utilization | 0% |
| Open holdings | None; connected holdings view explicitly confirmed no open positions |

Account metadata: Normal account; fractional shares disabled; FX conversion at settlement enabled; calculation reliability Ok. Unbooked commission, exchange fees and share-transaction detail were absent (displayed as dashes), not confirmed zero. The previously unbooked amounts have settled into booked cash; total account value is unchanged from the dated 17 September inspection. No trades were submitted.

Evidence comprises this fresh browser verification, current repository code, current official documentation, and the explicitly dated account inspection in [saxo-account-data.md](saxo-account-data.md). The 17 September inspection is historical evidence, not today's permissions. No LIVE account access was tested.

## Data and implementation coverage

| Area | Evidence and current implementation | Remaining verification/work |
| --- | --- | --- |
| Account overview | `SaxoReadClient` reads accounts and account-specific balances: cash, available cash, account value, invested value, unbooked activity, blocked cash, fees, margin and reliability. Fresh SIM balances verified through Azure on 27 September. | Retain currency and freshness per account in the future Investments view. |
| Holdings | Current adapter reads positions and exposes instrument, quantity, price, price delay and P/L in base currency. Fresh connected account has no open positions. It caps collection coverage at 100 positions and reports truncation. | Preserve position value, cost basis, account association and explicit currencies before portfolio allocation or detailed returns. Populated-position fields could not be freshly verified on an empty account; implement complete pagination where required. |
| Orders and activity | `SaxoOrders.Orders` reads working orders and seven days of order activities, with status and filled quantity. | All Saxo order-related routes, including reads, call `LocalSim`, which rejects production hosts. Separate read access from submission policy for the shared backend; do not remove trading guards wholesale. |
| Closed trades | The 17 September inspection verified one closed SIM trade with open/close prices, costs and base-currency equivalents. Saxo also documents historical closed-position reports. | Current normal read adapter does not expose closed trades. Verify coverage, pagination, account currency, fees and netting-mode restrictions before implementation. |
| Historical performance | Saxo documents v4 performance time series and summaries. | Not imported. The earlier SIM inspection received unrelated historical sample data, even without a MockDataId. Do not represent it as the connected account's returns. LIVE availability and account coverage remain unverified. |
| Bookings and transactions | Saxo documents historical transactions and booking reports, with dates, amounts, currencies and classifications. Bookings requires Personal Read permission. | Not integrated or account-tested here. Verify actual dividends, taxes, fees and cash movements, including signs and settlement dates, before promising an income view. |
| Allocation | Can be derived from complete, consistently valued holdings once their market values and currencies are retained. | Instrument allocation is distinct from sector/geography exposure. Those require verified classification data and coverage; ETF look-through must not be assumed. |

Current code inspected: `src/Banking.Api/Providers/SaxoReadClient.cs`, `src/Banking.Api/Providers/SaxoOrders.cs`, and `src/Banking.Api/PlanningEndpoints.cs`.

## Product recommendation — not an approved design

Markets should support finding, researching and trading an instrument. Investments should answer what the user owns, what it is worth, how concentrated it is, and what happened in the portfolio. Selecting a holding should open the existing Markets instrument experience.

The first viable Investments scope is account totals, holdings and allocation, followed by orders and closed trades once their shared-backend read paths are available. Historical returns and dividend income remain conditional on verified source data. Keep SIM separate from personal wealth. Missing data must stay missing rather than becoming zero or invented history.

## Next authenticated checks

1. Completed: SIM sign-in through the deployed API and fresh balance/empty-holdings verification without submitting orders.
2. Check populated position fields and reconcile position values, cash, unbooked amounts and total account value in a consistent currency.
3. Verify order and closed-trade reads after resolving their production read-path restriction in a separately authorized implementation.
4. Probe historical performance and transaction coverage through a bounded production-side read integration. Validate dates against account creation and known transactions; reject generic SIM samples.
5. Choose the page's final visuals from verified data. Pension remains parked pending provider clarification.

## Official sources checked

- [Portfolio](https://www.developer.saxo/openapi/learn/portfolio)
- [Performance](https://www.developer.saxo/openapi/learn/performance)
- [SIM mock data and back-office limitations](https://www.developer.saxo/openapi/learn/mock-data-in-simulation)
- [Historical transactions](https://www.developer.saxo/openapi/referencedocs/hist/v1/transactions)
- [Booking report and access level](https://www.developer.saxo/openapi/referencedocs/cs/v1/historicalreportdata-bookings/get__cs_reports_bookings_clientkey)
- [Historical closed positions](https://www.developer.saxo/openapi/referencedocs/cs/v1/historicalreportdata-closedpositions)
