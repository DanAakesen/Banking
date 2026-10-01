# Budget option 1 — design QA

final result: passed

Source: docs/design-targets/budget-studio.png, the first displayed concept selected by Dan. Actual: artifacts/ui-review/budget-studio-final.png, 1448 × 1086, public synthetic Demo, Graphite, August 2026. Source and rendered capture inspected together. Previous Accounts QA is preserved in docs/accounts-design-qa.md.

The selected hierarchy is implemented: compact plan toolbar, scenic four-metric hero, manual editor on the left, coloured category comparisons on the right. Existing fonts, icons and lake assets are reused. API amounts supersede illustrative mock figures. Hero height follows the stronger owner requirement to match Overview/Accounts: 320/360 px at desktop widths.

Functional differences: real category count, current-plan historical-period explanation, explicit category/account linking, seven-entry pagination and sticky Save actions. Tablet insights move above a full-width editor; phone rows become labelled cards. Currency suffixes stay smaller and trailing. No accent left borders.

Verification:
- 60 backend tests passed, including savings attribution and workspace boundaries.
- Full browser suite passed 37 checks before final visual refinements. Budget subset passed 13 checks after pagination and account-link verification, with zero script errors.
- Product Demo checks reconcile all four totals, test month/filter interactions and validate five themes at five widths, Danish at four widths, and identical hero heights across all three pages.
- Demo refinement rerun confirmed changed: 0; three account links and recurrence examples persist without changing monthly totals or bank transactions.
- Inspected Graphite/Light desktop, Sand tablet and phone editor captures. Theme transitions settle before capture. No page overflow or clipped hero values.

Known semantic limit: historical periods compare with the current saved budget, not an archived version. Unattributable shared categories retain the category-level total rather than invented row actuals. These limits are visible under Matching and period. Dan's visual acceptance remains pending. No Azure or deployment action was taken.
