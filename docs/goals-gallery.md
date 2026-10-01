# Goals gallery — local implementation

Confirmed 9 September 2026: Dan selected the first displayed Goals concept, `exec-8072d351-1e67-4ac2-918d-a27244ced883.png`, and requested implementation. The canonical target is `docs/design-targets/goals-gallery.png`. The status pill moves from the lower detail heading to the right of the goal title on each card. Demo must demonstrate an on-track goal and a delayed goal with explanatory transactions.

## Experience

- Scenic hero shares the existing 320px wide-desktop / 360px narrower-desktop height. Existing Copenhagen morning, afternoon and evening photographs are reused. Monetary totals group by currency; missing balances/plans are not silently counted as zero.
- Photo-led, selectable cards show name, description, status, booked savings, target, percentage, the recognizable dot-and-line journey, remaining amount and explicit monthly savings. The complete card, including its photo, selects and reveals the details. The photo picker remains a separate control. The selected card has a complete outline, never a colored left border.
- Selecting a goal shows its dedicated account and the approved contribution-first detail panel. Three recorded months show net contributions against their monthly plans, followed by a clearly planned next contribution. One compact insight explains timing or shortfalls. Period deposits, withdrawals and net movement sit alongside the saved notes, reference links and goal photo. Opening/closing reconciliation, booked transactions, forecast assumptions and delete live in one initially collapsed disclosure. Notes and plan editing remain available.
- Optional monthly amount and contribution day (1–28) are saved in the existing Savings pace form with the explicit baseline, start and deadline. Existing goals without a monthly amount retain their original linear status calculation and have no invented monthly forecast.
- Add/change/remove a photo through the card. JPEG, PNG or WebP input up to 10 MB is decoded and normalized in the browser to a bounded JPEG, without original metadata. A versioned, workspace-scoped API stores it in that goal's database. Photo contents are omitted from goal lists, loaded separately, and never fetched from an arbitrary remote URL. Native uploads and keyboard card navigation work on mobile.
- Graphite, Light, Slate, Sand and Forest share theme tokens. New strings have English/Danish translations. Existing explicit empty/Create flows remain.

## Financial definitions

One dedicated account per goal remains mandatory. Goal progress is its latest ITBD/CLBD booked balance, not a budget entry or an available balance. Pending transactions never contribute.

For an explicit monthly plan, expected balance = minimum of target and (starting balance + contributions due from plan start through today). Status is behind plan if the booked balance is below that expectation or the planned monthly amount reaches the target after its deadline. Existing seven-day linear risk tolerance applies only to older linear plans.

Monthly contributions display the account's recorded net deposits (credits minus withdrawals). A returned contribution is visible as both a deposit and a withdrawal; a zero net month is marked missing and the withdrawal is called out. These are account movements, not household income/expense. Matched transfers remain excluded from household cash-flow totals.

The opening balance is reconstructed as current booked balance minus recorded credits plus recorded withdrawals in the displayed period. Complete imported history is required before showing that reconciliation or calling a contribution missing. The API identifies freshness and coverage; stale/unavailable balances suppress date forecasts. User edits to a baseline or plan alter the comparison; they do not rewrite transaction history.

Forecast = the number of whole future monthly contributions needed to cover the remaining target, starting with the next contribution day after today. It assumes no interest, investment return or additional withdrawals. The comparison without a shortfall adds only the cumulative plan shortfall back to the current balance and applies the same formula. Dates beyond the supported calendar range remain unavailable. This is an estimate, not a bank instruction.

Goal monthly plans are explicit, separate from budget entries. The approved Demo amounts match the active budget. Editing a budget does not silently rewrite a goal's savings plan.

## Approved Demo changes

Only `product-demo` was changed. All existing deposits were preserved. A paired synthetic return of the Car contribution on 12 August 2026 moves 2,500 DKK from Car back to Everyday. It is matched as an internal transfer, keeping household cash and income/expense arithmetic intact.

`Enrich-FamilyDemo.cjs --apply` imports it through the normal local provider flow. `Refine-DemoGoalJourneys.cjs --apply` checks workspace/provider identity, matches the pair, assigns explicit July 2026 baselines and monthly plans, and checks reconciliation/status. It does not reset the database, create additional goals or change budget entries. The helper rerun reports `updated: 0`.

Verified snapshot, 9 September 2026:

| Goal | Booked balance | Monthly plan | Shortfall | Status / estimated completion |
|---|---:|---:|---:|---|
| Family holiday | 81,400 DKK | 1,800 DKK | 0 DKK | On track, April 2029 |
| Car | 80,000 DKK | 2,500 DKK | 2,500 DKK | Behind plan, July 2031 instead of June 2031 |
| Summer house | 165,000 DKK | 5,000 DKK | 0 DKK | On track, December 2043 |

The longer dates are deliberate arithmetic consequences of the saved targets and monthly contributions, superseding older illustrative/ambitious Demo deadlines. Car's July–September reconciliation is 75,000 + 7,500 − 2,500 = 80,000 DKK. Holiday is 76,000 + 5,400 = 81,400 DKK. Total goal-account savings are 326,400 DKK; the monthly plan remains 9,300 DKK. These are fictional data, not Dan's finances.

## Implementation and evidence

- Native modules: `wwwroot/goals-ui.js`, `goals.css`; existing goal creation/edit form retained in `app.js`.
- `GoalService` / `GoalJourney.cs`; workspace-scoped `/api/goals/{id}/journey` and versioned GET/PUT `photo` endpoints. Existing owner/Demo authorization and request protections apply.
- Additive EF migrations `GoalGallery` and `GoalContributionDayDefault`; original goals get contribution day 1 and optional monthly/photo fields. No Azure changes or deployment.
- Existing scenic images plus generated, inspected `goal-car.webp` and `goal-summer-house.webp`. These are stock-style synthetic Demo visuals; an uploaded picture replaces them.
- `GoalJourneyTests`: returned contribution, pending exclusion, catch-up, missing/stale history, workspace isolation, photo validation, concurrency and removal. UI suite covers create/edit/notes/links and real photo normalization/persistence/removal in disposable databases.
- Browser evidence: `artifacts/ui-review/goals-gallery-*`; synthetic verification: `artifacts/demo-goal-journeys-verification.json`. Design review is in root `design-qa.md`; prior Budget QA is preserved in `docs/budget-design-qa.md`.

AI remains disconnected. No payment actions, new bank approvals, Azure resources or deployments were added. Dan's final visual acceptance is the next iteration.


## Owner refinement — 9 September 2026

Confirmed follow-up: make the photo part of the card selection target; dynamically color behind-plan goal lines/dots red; remove the repeated Received labels; use expense red for the withdrawal row including zero until the current goal status is Reached; replace the repetitive target/forecast section.

Implemented: full-card native link hit area with separate accessible photo picker. Selection reveals the detail section. Both card and contribution tracks follow API status (BehindPlan red, AtRisk amber, Unknown neutral, on-track green), without name-based rules. Missing/partial contributions keep their explanatory text. Withdrawals stay numerically unchanged; zero is colored as an expense, not presented as a negative amount. Reached is the current backend status, not a claim of historical completion after funds are withdrawn.

The new forecast shows one prominent estimated arrival, timing badge, remaining scheduled deposits, amount left, next planned deposit, and smaller final deposit where relevant. Behind-plan goals explain their shortfall and counterfactual arrival. Assumptions and the target date are available in a collapsed disclosure. Installment counts are derived from the server forecast's scheduled dates, preserving the backend decimal calculation. No bank transfers are scheduled and no stored data or backend calculations changed.

Validation: `node tests/ui/goals-followup.cjs` passes nine targeted browser checks: photo/card selection, file picker independence, dynamic status colors, received-label removal, zero/Reached withdrawal styling, reconciled Holiday/Car forecast facts and Danish desktop/tablet/mobile layouts. Screenshots are `artifacts/ui-review/goals-followup-da-*`; findings are `goals-followup-checks.json`. Five theme captures remain in `goals-gallery-*`.


## Contribution detail redesign — 9 September 2026

Dan selected the first displayed image of the latest three-detail set (`exec-031c9254-ebf9-4c64-9d59-a51f59f0cf12.png`). Canonical target: `docs/design-targets/goals-contribution-detail.png`. This replaces the older separate forecast/KPI panel; upper cards retain the saved balance, target, percentage and remaining amount.

- The timeline aggregates **net booked contributions per month**, rather than implying all deposits happened on a scheduled date. Exact booked dates remain in the disclosure. The upcoming point is dashed, explicitly planned and never a bank payment instruction.
- Native meters compare actual net contributions with each month's due amount. Negative/zero shortfalls retain numeric labels; missing coverage shows unknown instead of zero. Behind-plan timelines inherit the same semantic red as the goal card, across all themes.
- Period movement is credits minus withdrawals. No household spending/income interpretation is introduced. Withdrawals including zero retain red until Reached. No future contribution appears for a reached goal, an absent plan or a stale balance.
- The forecast uses the existing server estimate and shortfall comparison. Repeated remaining-balance and installment-count tiles are removed. No financial backend or bank synchronization behavior changed.
- Notes and references are actual saved goal content, escaped in the view. No reference URLs are invented from the image. Uploaded photos are shared between the card and the detail thumbnail. Demo fallback photography reuses the existing local assets.
- On narrow phones, the same contribution timeline becomes vertical. Tablet keeps the timeline horizontal; supporting content adapts without overflow.
- The old technical placeholder note on the synthetic Family holiday goal was replaced through the existing Demo edit form with a family-travel example. No financial amounts, plans, bank data or Live records changed.

Validation: 8 pure render scenarios in `tests/ui/goals-contribution-detail.cjs` passed (normal, shortfall, absent plan, stale balance, incomplete history, reached, next/final payment, escaping). The Codex in-app browser verified the real Demo flow, notes save, edit navigation, keyboard disclosure, Danish/English, and 10 desktop/mobile theme states plus tablet. Existing `goals-followup.cjs` assertions were updated for the new presentation; that separate browser runner was not rerun in this change. Current screenshots and browser evidence are under `artifacts/ui-review/goals-detail-*`. See root `design-qa.md`.
