# Family-of-four Demo enrichment

Confirmed owner request, 8 September 2026: retain Family holiday, add Car and Summer house, create a transaction-backed family budget and expand synthetic transaction history. Local Demo only.

## Result

- 1,672 current transactions (1,671 booked plus one pending reservation), up from 629. Fixed history begins January 2024, with repeatable source identities and deterministic monthly variation.
- Two monthly salaries: 28,500 and 24,500 DKK. Household costs include supermarket shops, fresh food, childcare, lunches, clothing, car leasing/fuel/service, heating, water, insurance, memberships, sport, health, gifts and school holidays. Quarterly, half-yearly and annual charges create seasonal peaks.
- Car: target 225,000 DKK against Savings account, 24-month plan. Summer house: target 1,200,000 DKK against all DKK account balances, 36-month plan. Descriptions and notes explain intended use and shared balances; targets do not reserve money or claim independent savings pots. Existing holiday goal is unchanged.
- Active budget “Family of four”: 20 editable entries, derived from 1 September 2025–31 August 2026 (547 external booked transactions). Expenses are grouped by category; salary streams remain separate; Holidays and Gifts use annual intervals. The savings contribution follows the actual matching monthly Savings transfer.
- Monthly plan: income 53,075.00 DKK; expenses 40,972.26 DKK; savings 1,800.00 DKK; available 10,302.74 DKK. Historical average expenses are 40,972.25 DKK; the sub-cent difference before display is from rounding individual budget entries and dividing annual entries by 12. Planned averages are not forecasts or actual achieved savings.
- Existing saved budget entries and legacy category limits are retained. Only the new budget became active.

## Implementation and verification

`ProductDemoProvider.cs` adds fictional entries without replacing original references, fingerprinted duplicate coffees or original booked amounts. Its balance calculation continues to reconcile opening balance plus the complete generated ledger. `scripts/Enrich-FamilyDemo.cjs` creates missing category rules, reconnects only the local synthetic provider for a full import, matches exact internal transfer pairs, and uses ordinary Demo APIs to create the two goals and named budget. No payment endpoint or Live credentials are involved. This script requires `--apply` and never runs at startup.

The protected pre-change Demo backup is `artifacts/demo-before-family.banking`. First-run and repeat-run summaries are `artifacts/demo-family-first-apply.json` and `artifacts/demo-family-verification.json`. The repeat run retained 1,672 transactions and created zero goals, budgets or transfer matches. Existing goals and budget entries were checked for preservation.

All 57 backend tests passed, including import/reconnect identity stability, balance reconciliation, manual classification preservation and Live workspace isolation. The larger fixture now drives deferred pagination in its disposable test database. Overview, Goals and Budgets were checked in Chrome at 1600 and 390 px: no page overflow or browser errors. Actual screenshots are in `artifacts/ui-review/family-*.png`.

The Overview uses available cash; goal progress uses the existing booked-balance basis. The 175 DKK pending reservation accounts for the difference in combined cash and all-account goal progress. No live data was changed, no external bank consent was requested and no Azure resources were created.
