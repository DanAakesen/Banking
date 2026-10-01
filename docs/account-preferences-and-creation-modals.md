# Account preferences and creation modals — 10 September 2026

## Confirmed product decisions

Dan requested editable account names, a savings-account marker, Overview cards for available-to-spend and total savings, and a Debt navigation section with an empty Loans page. He subsequently requested centered modals for all creation entry points, including goals and budgets. These requests authorize local implementation only.

## Accounts and Overview

- `Account.CustomName` is optional user metadata, separate from the provider's `Name`. The accounts API exposes the effective name plus the provider name and preference fields. Import/reconnection continues to update only the provider name. An empty custom name restores the bank name.
- `Account.IsSavings` is an explicit user choice. Live accounts start unmarked; no account type is inferred from Dan's balances or names. The migration marks only the three known fictional product-demo savings accounts once. Subsequent user changes persist.
- Accounts → Edit accounts opens a dialog containing an account picker, custom name, and savings checkbox. The picker includes the available balance and currency to distinguish identical provider names. The Overview money dialogs also expose this editor.
- Preference writes use optimistic concurrency and the existing authenticated workspace boundary. They do not modify bank records, balances or transactions. Both fields are included in the existing entity backup format.
- Overview **Available to spend / Rådighedsbeløb** is actual income minus actual expenses minus net savings deposits for the selected period and currency. Income/expenses use current booked transactions excluding confirmed internal-transfer pairs. Savings uses signed current booked transactions on marked savings accounts, including transfers. Movement between savings accounts cancels; withdrawals reduce savings and release cash. An external credit or debit on a savings account affects both cash flow and savings, avoiding double counting.
- This is a period cash-flow result, not the current account balance or a forecast after future bills. It does not use planned budget entries. Its dialog shows the exact inputs, date range, assumptions and incomplete/undated-history warnings. Without marked savings accounts it shows a configuration warning; no-account results remain unknown.
- **Total savings** sums each marked account's latest available balance (`ITAV`/`CLAV`) in the selected currency. It is independent of the transaction period. No marked accounts or any missing required balance produces an unknown total, not a fabricated zero. The breakdown exposes stale balances.
- Debt → Loans is a blank page with a heading, available through desktop navigation and mobile More. No debt integration or financial operation is implemented.

## Centered creation workflows

- Goal, budget, transaction-based budget, category, rule and transfer-match creation keep the originating page behind a centered native dialog. Existing Add bank and transaction-rule dialogs retain their behavior.
- Direct legacy creation URLs open the parent page and the same modal. Closing or cancelling returns to the original page; a successful save opens or refreshes the saved item.
- Budget entry creation uses a smaller child dialog, including name, amount, type, frequency and optional category/savings-account linkage. It only adds to the unsaved budget draft. Cancelling an entry preserves the parent draft. A new budget starts with zero entries and an explicit Add entry action.
- Goal reference-link fields remain inline within the goal modal; they are fields of that creation form, not a separate page.
- Dialogs scroll within the viewport, retain visible Close/Cancel controls and protect unsaved changes. Save failures retain values. Budget DOM queries are scoped to their current editor, and background IDs are temporarily isolated to prevent duplicate form-control IDs while the modal is open. Background IDs are restored on close/navigation.
- Existing editing pages are retained; this request changes creation entry points.

## Local verification

- `dotnet test tests/Banking.Tests --arch x64 --filter "FullyQualifiedName~AccountPreferencesTests|FullyQualifiedName~PlanningTests" --verbosity quiet`: **11 passed**.
- Tests cover preference validation, optimistic concurrency, provider-name preservation, workspace/anonymous access, savings transfers/withdrawals, direct savings credits/debits, pending/out-of-period exclusion, missing balances, empty configuration and currency separation.
- JavaScript syntax checks passed for the changed app, budget, account, Overview and localization modules.
- Browser: renamed and unmarked a Demo account, observed the changed name and savings balance after save/reload, then restored both original values. Verified Overview breakdown arithmetic and the blank Loans route.
- Browser: opened goal, budget, transaction-import, budget-entry, category, rule, transfer-match and bank dialogs. Checked direct goal/budget creation URLs and restoration of the existing budget after discarding a draft.
- Browser: goal and budget failed-save tests used temporary client-side responses, never persisted test records. The forms retained their values; the budget submitted the expected single Income entry with amount 1000. Temporary response overrides were removed.
- Inspected desktop and narrow layouts (390px requested, 355px actual CSS viewport in the in-app browser), plus Graphite and Light rendering. No horizontal overflow in the inspected mobile goal/budget dialogs. This is browser viewport verification, not a physical-phone Safari test.
- No test goals, budgets, categories, rules or transfer matches were saved into either product workspace. No Live account names or classifications were guessed. The API is running locally on HTTPS port 5443 after the migration; restart requires Dan to sign in again.

Implementation: `Entities.cs`, `Endpoints.cs`, `PlanningService.cs`, `DemoService.cs`, `AccountPreferences` migration, `app.js`, `overview.js`, `accounts-ui.js`, `budget-ui.js`, shared CSS and `i18n.js`.

## Unsaved-change confirmation — follow-up 10 September 2026

Dan requested replacement of the browser-native discard prompt with a friendly, centered UI. Internal leave guards now await a shared theme-aware dialog with **Keep editing** (default focus) and **Discard changes**. Escape keeps the draft. The prompt appears above the current page or creation dialog and preserves the underlying form and focus. Budget-entry cancellation uses the same dialog while preserving the parent budget's dirty state. Internal links stop default navigation before awaiting the decision; browser hash navigation restores the current route when cancelled.

Browser-verified in a separate Demo tab: keep editing retains entered goal text; Escape retains the goal modal; discard closes it; browser Back + keep editing restores the goal route and draft; nested entry cancellation retains text; discarding an entry leaves the parent budget unchanged and still protected. Inspected centered desktop and stacked mobile buttons. Synthetic drafts were discarded without API writes. JavaScript syntax checks passed. No server restart was required.

Full document refresh, tab/window closure and navigation away from the app retain the browser-controlled `beforeunload` warning. Web applications cannot replace or style that browser safety prompt. Other destructive-action confirmations are outside this particular unsaved-change update.

## Shared creation header correction — 10 September 2026

Replaced the separate Close-button strip with one sticky header containing the title and Close button on the same row. Its background uses the same `--bg` token as the dialog, removing the mismatched surface rectangle. The original renderer headings supply the title but are visually hidden; the header follows transaction-preview step changes. Goals, budgets, import, categories, rules and transfer matching share the fix. Existing account, bank and budget-entry dialogs already use a single-row `.dialog-head` without a separate colored strip.

Verified goal title/button vertical alignment and equal dialog/header computed backgrounds. Opened budget, import, category and rule forms; checked matching backgrounds for all five themes and inspected the mobile rule dialog. JavaScript syntax validation passed. No form submissions or data mutations were needed.

## Inline account names — superseded interaction, 10 September 2026

The Accounts directory now uses a fixed name-above-balance hierarchy with a pencil action on each account. The desktop column grows from 300 to 340px (250 to 290px at intermediate desktop widths). The old spending-increase insight beneath the directory is removed. Tablet layout remains above the ledger; mobile retains horizontal account browsing.

Inline Save uses the existing versioned account-preferences endpoint, preserving the savings flag. Cancel/Escape and account selection respect the shared unsaved-change guard. Failed saves retain the input and allow retry. Names are escaped, limited to 200 characters and require non-whitespace content; the full preferences dialog still supports resetting to the bank name.

Verified in an isolated Demo browser tab: saved a temporary name, reloaded to confirm persistence, checked the savings flag and restored the original custom-name value. Simulated a 409 response to verify retained input, visible error and enabled retry; removed the temporary response stub. Checked keep/discard, Escape, account search, vertical balance geometry at 1600/1280/1024/390px, and no page overflow at those widths. Inspected Graphite and Light rendering and mobile inline editing. JavaScript syntax checks passed. No Live metadata was changed.

## Account modal refinement — 10 September 2026

Dan superseded inline renaming: each account pencil now opens the existing Edit accounts modal with that account selected, including its name and savings classification. Removed the inline form, handlers and styles. Removed the All accounts card from the directory; a compact All accounts action in the heading appears only while an account filter is active. Balances remain below names and the wider directory is retained.

Verified in Demo: pencils on two different accounts opened the matching account in both the modal selector and versioned preferences form, including when another account was selected in the page. Selecting an account and clearing it through the heading action worked. The account list contains only actual accounts. Inspected the desktop rendering; JavaScript syntax checks passed. No account data was changed during this verification.

## Account balance chart and period metric spacing — 10 September 2026

The ring now shows marked savings balances divided by all selected available balances in the chosen currency. Hover/focus shows the account name, available amount and share; pointer click or Enter/Space filters the account through the existing selection action. Chart segments have accessible button labels; the adjacent account list supports tiny and zero-balance accounts. Mobile now retains the ring. Existing unavailable-allocation and stale-history warnings are preserved.

Moved period metrics across the full hero width, separated number/currency spacing, and introduced fewer metric columns on smaller screens. Desktop retains the shared hero height; smaller layouts can grow vertically instead of overlapping.

Verification: eight detached browser render scenarios passed (mixed savings, unmarked accounts, zero savings, zero total, missing balance, negative balance, other currency and selected non-savings account). Demo savings amount 326400 / selected available total 449731 rounded to 72.6%. Real pointer hover and click, Enter activation and resetting the account filter worked. The three reported large-number examples fit at 1600, 1280, 1024, 768 and 390 CSS pixels without page or metric overflow. Graphite/Light visuals inspected. Mobile checks use a browser viewport; native touch-event simulation is unavailable in the in-app browser, so physical touch remains unverified. JavaScript syntax checks passed. Temporary DOM-only large-number examples were confined to the closed Demo QA tab; no financial records were changed.

## Account carousel and transaction filter responsiveness — 10 September 2026

Replaced the wrapping account directory with a full-width horizontal carousel above the ledger. Arrows page through visible accounts and disable at the ends; account search updates overflow, and keyboard arrows/Home/End work on the list. Native overflow scrolling supports touch without intercepting vertical page gestures. ResizeObserver maintains sizing; the final user refinement caps cards at 210px. Removed the horizontal scrollbar because arrows expose navigation. Editing opens the correct account modal and selecting an account retains its visible position.

The ledger heading now keeps title and Rules & categories together. Filters have one aligned row, switching to search above category and Search at ledger widths <=560px. Verified Demo arrow paging/end states, search, keyboard End, account editing and selected-card visibility. At 1600/1024/768/390px the account row and filter controls fit without page overflow or overlapping fields. Inspected tablet/mobile layouts. Final 210px cards verified in the browser. Touch uses native browser scrolling; physical-device touch testing remains outstanding. Syntax checks passed; no financial data was changed.
