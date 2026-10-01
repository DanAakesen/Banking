# Budget category links and actual progress

Update: Budget studio adds actual savings from explicit account links and four actual-versus-budget metrics. Its editor and category rail supersede the full-page card grid below. See [Budget studio](budget-studio.md) for current semantics; the following records the original category-link implementation.

Implemented locally on 8 September 2026 following the owner's request to align Demo budgets, categories and progress.

## Behaviour

BudgetEntry.CategoryId is nullable and workspace-local, with a restricted category foreign key. Old budget rows remain unlinked until explicitly edited. The family Demo helper `scripts/Link-FamilyBudget.cjs --apply` links all 19 income/ordinary expense entries, preserves all amounts and frequencies, and classifies the four remaining synthetic Coffee entries as Dining. The savings entry is not category-linked. Salary + Partner salary share Income; Dining + Other spending share Dining. Shared rows add their allowances before a category's transactions are counted once.

`GET /api/budget-plans/{id}/progress` reports the current Copenhagen calendar month through today. An optional month parameter accepts the first day of a past/current month. Actuals include current BOOK records in the plan currency and date range; exclude pending, undated and matched internal transfers. Positive and negative transactions are kept separate consistently with the existing cash-flow model. The full monthly equivalent (amount / intervalMonths) is the allowance; no daily pacing or annual-payment forecast is implied. Category-less or unmatched-category actuals are visible as Unbudgeted. Missing links, insufficient history and stale syncs are reported.

Budgets exposes saved category links under Transaction categories, and progress on Budgets and the active-budget Overview panel. Auto-budget suggestions carry a category ID only when the source group has one consistent category. Users can change links and save. Changes to category names do not break ID-based links. Invalid/cross-workspace category IDs and category links on savings rows are rejected. Category deletion cannot remove referenced links.

Goals still read booked account balances, and spending targets do not earmark funds for them. No budget amount, target or bank transaction amount was changed in this task. Four synthetic classifications changed; Live financial records were not modified. The additive nullable-column migration runs on the existing local databases; no Azure action or deployment was performed.

## Evidence

- 58 backend tests passed. Added coverage verifies shared-category aggregation, quarterly normalization, overspend, exclusion of pending/foreign-currency/out-of-period/transfer records, reclassification to unbudgeted, and cross-workspace/invalid-category rejection.
- 12 targeted browser workflow checks passed, including saving a category link, active budget metrics, editing/importing plans, concurrency protection and Danish labels.
- All five themes checked at 1440, 1024 and 390 px without page overflow or script errors. Actual captures: `artifacts/ui-review/budget-progress-desktop.png`, `budget-progress-mobile.png`, `budget-progress-light-tablet.png`.
- Demo period 1–8 September 2026: 53,000 DKK received; 20,589 DKK spent; zero unlinked ordinary entries. Full monthly plan remains income 53,075 DKK, expenses 40,972.26 DKK, savings 1,800 DKK and available 10,302.74 DKK. These are different periods/bases, labelled in the UI.
