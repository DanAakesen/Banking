# Dedicated goal accounts

Owner-confirmed correction, 8 September 2026: reliable goal tracking requires one goal per account. This replaces the earlier shared Savings and all-accounts goal design.

## Implementation

Create/Edit requires one accessible account, excluding accounts used by other goals. An existing goal may keep its own account. The API requires Scope=Account and AccountId, checks account/currency ownership and serializes assignment through a transaction-owned database application lock. Concurrent requests cannot assign the same account twice. Changing a goal's account or deleting the goal frees the previous account for another goal. No new database migration or automatic changes to Live goal records were needed.

Legacy shared/all-account records are retained, but their measured amount is unknown and the UI requests a dedicated account. They are never presented as independent progress based on overlapping funds. Goals use latest booked balances with freshness and the existing explicit pace baseline. Banking cannot guarantee that a user avoids unrelated transactions in the underlying account; deposits increase progress and withdrawals reduce it. Banking does not lock money, create real bank accounts or initiate transfers.

## Explicit Demo migration

The synthetic provider now has Everyday, Bills, Savings, Car savings and Summer house savings accounts. Existing source identities and transaction amounts are preserved. New monthly matched internal transfers move 2,500 DKK to Car and 5,000 DKK to Summer house from Everyday; the new accounts start from zero. Synthetic history remains deterministic from January 2024.

`Enrich-FamilyDemo.cjs --apply` imports the expanded provider and matches both sides of the new transfers. `Dedicate-DemoGoals.cjs --apply` reassigns the two previously overlapping goals and adds the two corresponding savings-contribution rows to the existing family budget. Both helpers are explicit local Demo-only actions; rerunning reassigned zero goals and duplicated no rows. Real bank data is not an input.

Verified on 8 September 2026:

| Goal | Dedicated account | Booked balance | Target |
|---|---|---:|---:|
| Family holiday | Savings account | 81,400 DKK | 136,000 DKK |
| Car | Car savings account | 82,500 DKK | 225,000 DKK |
| Summer house | Summer house savings account | 165,000 DKK | 1,200,000 DKK |

1,804 current transactions, including 132 added transfer postings (66 matched pairs). Household available cash remains 452,414 DKK. The active budget keeps income 53,075 DKK and ordinary expenses 40,972.26 DKK; planned savings rise to 9,300 DKK and available to spend becomes 2,802.74 DKK. The two reassigned goals have explicit new-account baselines dated 8 September; the holiday plan, goal IDs, targets, descriptions and reference links were retained.

## Verification

59 backend tests passed, including simultaneous competing goal creates, duplicate/all-account rejection, edit/reassignment, workspace isolation, missing/stale balance handling and five-account Demo ledger reconciliation. Actual Chrome checks at 1440, 1024 and 390 px verified only unassigned accounts are offered, no All accounts selector remains, editing Car retains its assigned account, and there is no page overflow or script error. Screenshots: `artifacts/ui-review/dedicated-goals.png` and `dedicated-goal-create-*.png`.

The full frontend regression passed 35 workflow checks with no browser script errors, including dedicated-account goal create/edit/reload, five themes, both languages, mobile, account search, budget links and workspace isolation.
