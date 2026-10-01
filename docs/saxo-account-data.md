# Saxo account data inspection — 17 September 2026

Status: read-only inspection of the connected local SIM account. No order, account setting, deployment or product code changed. Snapshot: 17:05:34 UTC / 19:05:34 Copenhagen. Values can change after booking and settlement.

## Confirmed account and balances

One active Normal / trial account, denominated in **EUR**, created 17 September 2026. The actual booked cash is **EUR 1,000,000.00**, not DKK 100,000. The account-specific balance contains **EUR 999,973.83 available for trading** and the same total account value. All balance amounts below are EUR unless identified as percentages/counts/flags.

| User-facing measure | Saxo field | Actual result |
|---|---|---:|
| Account value | TotalValue | 999,973.83 EUR |
| Available for trading | CashAvailableForTrading | 999,973.83 EUR |
| Booked cash | CashBalance | 1,000,000.00 EUR |
| Unbooked transactions | TransactionsNotBooked | -26.17 EUR |
| Blocked cash | CashBlocked | 0.00 EUR |
| Blocked from withdrawal | CashBlockedFromWithdrawal | 0.00 EUR |
| Stock/non-margin position value | NonMarginPositionsValue | 0.00 EUR |
| Open positions | OpenPositionsCount + positions endpoint | 0 |
| Open orders | OrdersCount + orders endpoint | 0 |
| Closed positions | ClosedPositionsCount + closedpositions endpoint | 1 |
| Margin used | MarginUsedByCurrentPositions | 0.00 EUR |
| Margin utilisation | MarginUtilizationPct | 0% |
| Balance calculation status | CalculationReliability | Ok |

Reconciliation: **1,000,000.00 - 26.17 = 999,973.83 EUR**. Unbooked detail: commission -26.14, exchange fee -0.01, share value -0.02 EUR. These are rounded account-currency amounts, not original USD charges. Do not add booked cash to TotalValue again.

The portfolio closed-position endpoint confirms Genmab ADR bought at **34.49 USD**, sold at **34.47 USD**, one share; opening costs **15.00 USD**, closing costs **15.01 USD**. Gross price loss is **0.02 USD**; fees dominate this tiny SIM test. Exact reported gross loss in base currency is -0.01742562 EUR; opening and closing base-currency costs are -13.07 and -13.08 EUR. Rounding explains the cents displayed in the account breakdown. No cost assumption was used.

## Capability flags

- Fractional orders disabled: whole shares required for the current stock flow.
- Margin trading allowed at broker account level; Banking's current order feature remains stock-only and blocks shorts.
- Cash positions can be used as margin collateral; individual margining enabled; portfolio-based margin disabled; margin lending None.
- Currency conversion at settlement enabled: USD/DKK instrument amounts must retain their currency alongside EUR account impact.
- Account value protection supported but limit is zero; do not present this as active protection.
- Direct market access false; client-managed account; not shareable.
- LegalAssetTypes includes stocks, ETFs, funds, bonds, FX, futures, options and CFDs. This is account metadata, not proof that every instrument is tradable, quoted, suitable or supported by Banking.

## Existing integration gap

`SaxoReadClient.Read` requests `/port/v1/balances/me?FieldGroups=CalculateCashForTrading`. Its actual current result omits CashAvailableForTrading, so Banking maps buyingPower to null. The explicit `/port/v1/balances?AccountKey=...&ClientKey=...&FieldGroups=CalculateCashForTrading,MarginOverview` response contains it. Read account balances by selected account and currency before adding the account summary UI. Keep client-wide aggregate and account-specific scopes separate even though there is only one account today.

Account list, stock instrument details and order precheck already serve the order dialog. Most balance detail below is currently discarded by the normal portfolio mapper.

## Historical data limitation and count discrepancy

Queried `/hist/v4/performance/timeseries` and `/hist/v4/performance/summary` with the actual account/client keys and StandardPeriod=AllTime, without MockDataId. Responses included March 2021 values around 2.7m, benchmark placeholders, and a summary claiming 10,697 trades. The account was created today. These are sample-like SIM responses and cannot represent this account's actual history. Exclude them from both UI and AI account-performance facts. Saxo documents mock account-history/performance services in SIM. LIVE history remains unverified.

The balance response reports NetPositionsCount=1 despite OpenPositionsCount=0; `/port/v1/netpositions/me` and `/port/v1/positions/me` are empty and closedpositions contains the completed Genmab trade. Treat the count as a provider discrepancy at this observation, not a current holding. Use the actual position collection to populate Holdings; do not infer one holding from NetPositionsCount.

The trustworthy closed-position record exposes instrument, quantity, opening/closing price and time, trading loss, opening/closing costs, base-currency equivalents, FX profit/loss, closing method and references to both orders. This supports a completed-trades list and reconciled trade breakdown now. Do not label period return or today's profit from the account balance difference alone: deposits, withdrawals, fees and FX also affect value.

## Recommended Markets layout (proposal, not implemented)

1. Keep SIM/LIVE and connection status right-aligned on the tab row.
2. Add a compact account summary below that row: **Account value**, **Available to trade**, **Invested value**, **Unbooked activity**. Show EUR and SIM once clearly. Label available cash plainly rather than mixing it with margin buying power.
3. Account summary opens an Account details drawer with cash reconciliation, fee breakdown, account currency/capabilities, timestamps and source status. Margin detail stays collapsed unless relevant.
4. Keep Watchlist / Holdings beside the chart. Orders gives working orders and completed trades; clicking a holding selects the chart and enables the normal buy/sell flow.
5. Add performance chart only when backed by verified account history or Banking's explicitly dated snapshots. Never show Saxo's generic SIM performance samples as this account's returns.
6. Keep SIM out of personal net worth. DKK display conversion, if added later, must show the FX source/time and preserve the underlying EUR amount.

## Full returned field inventory

The tables below enumerate returned account and balance fields, including nested fields. Technical account/client identifiers and authentication data are deliberately omitted. Blank/missing values do not mean zero. Fields not returned are not available in this snapshot.

### Account metadata

| Field | Observed value |
|---|---|
| AccountSubType | None |
| AccountType | Normal |
| AccountValueProtectionLimit | 0.0 |
| Active | true |
| CanUseCashPositionsAsMarginCollateral | true |
| CfdBorrowingCostsActive | false |
| CreationDate | 2026-09-17T15:21:02.393Z |
| Currency | EUR |
| CurrencyDecimals | 2 |
| DirectMarketAccess | false |
| FractionalOrderEnabled | false |
| FractionalOrderEnabledAssetTypes | [] |
| IndividualMargining | true |
| IsCurrencyConversionAtSettlementTime | true |
| IsMarginTradingAllowed | true |
| IsShareable | false |
| IsTrialAccount | true |
| LegalAssetTypes | ["FxSpot", "FxForwards", "ContractFutures", "Stock", "StockOption", "Bond", "FuturesOption", "StockIndexOption", "CfdOnStock", "CfdOnIndex", "StockIndex", "CfdOnEtf", "CfdOnEtc", "CfdOnEtn", "CfdOnFund", "CfdOnRights", "CfdOnCompanyWarrant", "Etf", "Etc", "Etn", "Fund", "FxSwap", "Rights", "IpoOnStock", "CompanyWarrant"] |
| ManagementType | Client |
| MarginCalculationMethod | Default |
| MarginLendingEnabled | None |
| PortfolioBasedMarginEnabled | false |
| Sharing | ["NoSharing"] |
| SupportsAccountValueProtectionLimit | true |
| UseCashPositionsAsMarginCollateral | true |

### Account balances

| Field | Observed value |
|---|---|
| CalculationReliability | Ok |
| CashAvailableForTrading | 999973.83 |
| CashBalance | 1000000.0 |
| CashBlocked | 0.0 |
| CashBlockedFromWithdrawal | 0.0 |
| ChangesScheduled | false |
| ClosedPositionsCount | 1 |
| CollateralAvailable | 999973.83 |
| CollateralCreditValue.Line | 999973.83 |
| CollateralCreditValue.UtilizationPct | 0.0 |
| CorporateActionUnrealizedAmounts | 0.0 |
| CostToClosePositions | 0.0 |
| Currency | EUR |
| CurrencyDecimals | 2 |
| FinancingAccruals | 0.0 |
| InitialMargin.CollateralAvailable | 999973.83 |
| InitialMargin.CollateralCreditValue.Line | 999973.83 |
| InitialMargin.CollateralCreditValue.UtilizationPct | 0.0 |
| InitialMargin.MarginAvailable | 999973.83 |
| InitialMargin.MarginCollateralNotAvailable | 0.0 |
| InitialMargin.MarginCollateralNotAvailableIncludingCostToClosePositions | 0.0 |
| InitialMargin.MarginUsedByCurrentPositions | 0.0 |
| InitialMargin.MarginUtilizationPct | 0.0 |
| InitialMargin.NetEquityForMargin | 999973.83 |
| InitialMargin.OtherCollateralDeduction | 0.0 |
| IsPortfolioMarginModelSimple | true |
| MarginAndCollateralUtilizationPct | 0.0 |
| MarginAvailableForTrading | 999973.83 |
| MarginCollateralNotAvailable | 0.0 |
| MarginCollateralNotAvailableDetail.InitialFxHaircut | 0.0 |
| MarginCollateralNotAvailableDetail.MaintenanceFxHaircut | 0.0 |
| MarginCollateralNotAvailableIncludingCostToClosePositions | 0.0 |
| MarginExposureCoveragePct | 0.0 |
| MarginNetExposure | 0.0 |
| MarginOverview.Groups | [] |
| MarginUsedByCurrentPositions | 0.0 |
| MarginUtilizationPct | 0.0 |
| NetEquityForMargin | 999973.83 |
| NetPositionsCount | 1 |
| NonMarginPositionsValue | 0.0 |
| OpenIpoOrdersCount | 0 |
| OpenPositionsCount | 0 |
| OptionPremiumsMarketValue | 0.0 |
| OrdersCount | 0 |
| OtherCollateral | 0.0 |
| SettlementValue | 0.0 |
| SpendingPowerDetail | {} |
| TotalValue | 999973.83 |
| TransactionsNotBooked | -26.17 |
| TransactionsNotBookedDetail.Commission | -26.14 |
| TransactionsNotBookedDetail.ExchangeFee | -0.01 |
| TransactionsNotBookedDetail.ShareValue | -0.02 |
| TriggerOrdersCount | 0 |
| UnrealizedMarginClosedProfitLoss | 0.0 |
| UnrealizedMarginOpenProfitLoss | 0.0 |
| UnrealizedMarginProfitLoss | 0.0 |
| UnrealizedPositionsValue | 0.0 |
| UnrealizedPositionsValueExcludingCostToClosePositions | 0.0 |

## Sources and evidence

- [Local sanitized SIM response](../artifacts/saxo-sim-account-inspection.json).
- [Saxo account fields](https://www.developer.saxo/openapi/referencedocs/port/v1/accounts/get__port__me/schema-accountresponse).
- [Saxo balance fields and currency semantics](https://www.developer.saxo/openapi/referencedocs/port/v1/balances/get__port).
- [Saxo performance semantics](https://www.developer.saxo/openapi/learn/performance): historical metrics are calculated in end-of-day processing.
- [Saxo mock data in SIM](https://www.developer.saxo/openapi/learn/mock-data-in-simulation).
- [Actual local UI trading evidence](saxo-orders-local.md).

## Account cards implemented locally — 17 September 2026

The account-specific balance request now supplies an explicit account summary alongside the existing client portfolio response. Currency is checked against account metadata; missing amounts stay null, identifiers used for authentication are excluded, and the account list is bounded. Multiple returned accounts get an account selector without adding currencies together.

Markets now shows four clickable cards below the tabs. Mobile uses native horizontal touch scrolling, scroll snap, a next-card preview and accessible clickable line indicators. The details drawer shows cash, invested/unbooked amounts, fees, blocked cash, collapsed margin/account settings, source time and calculation reliability. SIM remains excluded from wealth. Desktop and 390px Chrome verified, including a real emulated touch gesture advancing the carousel, direct indicator navigation to the final card and opening/closing the mobile drawer. Account values matched the current SIM response. Build and JavaScript syntax passed; focused account mapping, wealth and order regression tests run. No deployment or trades performed.

Final validation: 14 focused tests passed (Markets, Wealth, Saxo orders). Graphite and Light were visually checked in desktop Chrome; Graphite was restored afterward. No browser console errors were observed.
