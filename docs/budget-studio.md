# Budget studio — approved option 1

Implemented locally on 8 September 2026 after Dan selected the first Budget concept and authorized supporting Demo refinement. The canonical target is `docs/design-targets/budget-studio.png`. Generated figures are illustrative; the implementation uses API results.

## User experience

- Named plan selector, explicit activation, Rename, month selector and currency. Opening another plan does not activate it. Initially shows the last completed month; the current month is labelled month to date against a full monthly budget.
- Scenic hero with actual income, ordinary expenses, savings and available to spend, each compared with the monthly plan. Signed green/red differences support the numbers. Shared hero height: 320 px on wide desktop, 360 px on narrower desktop, content-driven on mobile.
- Manual editor with Income / Expense / Savings, amount, 1/3/6/12-month recurrence, monthly equivalent and attributable actual. Type filters, search and seven-row pagination. Add entry opens the correct page. Category and savings-account mappings are editable under Transaction categories.
- Category allocation strip, actual/budget bullet bars and signed differences, including unbudgeted transactions. Tablet layouts place insights above the full-width editor. No left accent borders.
- Empty states, reviewed transaction import/merge, unsaved-change protection, concurrency checks, five themes and both languages remain supported. Draft changes require Save before refreshing comparisons. Budget controls cannot edit bank records.

## Calculation and persistence

`BudgetEntry.SavingsAccountId` is optional, workspace-local and restricted to the plan currency. Only savings entries may use it, once per account within a plan. Different plans may compare the same account. The additive `BudgetSavingsAccounts` migration preserves old entries with a null link.

Income and expenses use booked transactions within the selected month/currency, excluding matched internal transfers. Savings use the signed sum of matched transfer transactions on explicitly linked accounts: contributions minus withdrawals. Transfers between linked savings accounts cancel when both sides fall in the month. Missing links yield unknown savings and available amounts rather than zero. Incomplete history and stale data remain explicit.

Available actual = income actual − ordinary expenses actual − savings actual. Planned available uses monthly equivalents. Negative savings represent net withdrawals. Goal progress continues to measure booked account balances independently.

Shared-category allowances aggregate once. A single mapped row receives its category actual. Shared-category rows receive individual actuals only when every transaction description matches exactly one entry name, ignoring case and outer whitespace. Otherwise rows show Shared category and the category panel supplies the total. No proportional allocations or duplicated totals are invented.

Historical comparisons use the **current saved plan**, not an archived version. Annual/quarterly entries are monthly equivalents, not predicted payment dates. This is stated under Matching and period; version comparison and projections remain future work.

## Demo refinement

`node scripts/Refine-DemoBudget.cjs --apply` verifies Demo and the synthetic provider, targets only the Family of four plan, links its three savings rows to Holiday/Car/Summer house accounts, and varies Insurance/Memberships/Health recurrence intervals while preserving monthly totals. Unexpected existing links are rejected; repeated runs make no changes. No bank transactions or Live records change. Existing 1,804-transaction family history supplies meaningful differences.

August 2026 actuals: income 53,000 DKK, expenses 37,396 DKK, savings 9,300 DKK, available 6,304 DKK. Monthly plan: income 53,075 DKK, expenses 40,972.26 DKK, savings 9,300 DKK, available 2,802.74 DKK (display-rounded). Children and Clothing are over budget; several other categories are within budget.

## Verification

60 backend tests passed, including net contributions, withdrawals, transfers between savings accounts, pending exclusion, missing mappings, duplicate account rejection and workspace boundaries. Full browser suite: 37 checks passed; budget workflows passed again after pagination changes. `scripts/Verify-BudgetStudio.cjs` checks Demo totals, filters, month changes, 25 theme/viewport combinations, four Danish widths, and equal hero heights on all three pages. Evidence: `artifacts/ui-review/budget-studio-*`.

No Azure resources, deployments, external registrations or AI integrations were created.

## Visual follow-up — 9 September 2026
Owner requested removal of the hero annotation and its bright outline. The hero now has a clean, borderless edge, with the shading clipped to the same rounded corners. Period semantics remain in the existing expandable Matching and period details. Category labels/bars receive more width; the last two amount columns are narrower at desktop and mobile breakpoints. Shared hero heights are unchanged. Verified across five themes, desktop/tablet/mobile widths and both languages.

Owner density follow-up, 9 September: category list maximum height increased from 465 to 650 px (tablet 200 to 320 px). Overspend notice and Matching and period are compact footer rows. Manage budget is one collapsed row; the preserved legacy-limits explanation/link now sits inside it. Browser checks verified expandable content and no overflow at 1448, 1024 and 390 px. Captures: artifacts/ui-review/budget-density-*.png.
