# Local MVP — frontend review and build handoff

Latest local update: the overnight quality pass and visual upgrade are complete. Cash-flow charts, interactive category rings, budget allocation and goal visuals are implemented. See the [morning report and screenshots](overnight-quality-ui.md). Owner acceptance remains.


Latest checkpoint, 7 September 2026: the approved named-budget redesign is implemented locally, including income/expense/savings entries, monthly totals, recurring frequencies, multiple plans, explicit activation and reviewed transaction merge/new drafts. 54 backend tests and 39 Chrome workflows pass. See [current evidence](local-frontend.md). Dan should create his own budget and review the result, then continue with Goals. The earlier four-step evidence below is historical; owner acceptance and Azure/deployment approval remain outstanding.

## Four-step status — 7 September 2026

| Step agreed with Dan | Evidence and remaining work |
|---|---|
| 1. Backend additions | Complete for the current local scope, including browser access. 43 backend tests pass. Actual AI explicitly deferred. |
| 2. Design | Approved for implementation with a single period dropdown and no top Demo control. Further iteration happens on the working UI. |
| 3. Local frontend implementation | Implemented: approved layouts, local APIs, five themes, Danish/English, Dan/Demo switching, creation/editing flows and disconnected advisor overlay. |
| 4. Local MVP verification | 14 browser workflow checks and 43 backend tests pass. Owner acceptance/visual refinement remains: Dan creates goals/budgets in his actual workspaces and reviews bank figures. |

No Azure resources, registration, external hosting, tunnel or deployment is authorized.

## Review package

- [Settings, desktop and mobile](design-concepts/2026-09-07/09-settings-responsive-proposal.png): separate Settings navigation, central content, Back to Overview; mobile section selector. Light/Graphite plus proposed Slate/Sand/Forest. Proceeding uses this as the working direction, not evidence of approved exact color tokens.
- [Mobile Overview and blank goal form](design-concepts/2026-09-07/10-mobile-overview-goal-proposal.png).
- [Mobile budget entry, suggestions and unsaved review form](design-concepts/2026-09-07/11-mobile-budget-flow-proposal.png).

Images are generated proposals with fictional figures. They are not running UI screenshots and do not represent created goals or budgets. Goal/budget views must display any existing records honestly; the empty-state budget image does not authorize hiding or deleting the eight historical Demo budgets.

## Binding details beyond the pictures

- Preserve the approved sans-serif page headings. The budget mockup's serif headings are a generation discrepancy; serif is reserved for the Banking wordmark.
- Mobile Overview retains the income/spending/net comparisons and their labeled comparison period, account access, and recent activity further down the scrolling page. The compact mockup omits some of these to show navigation; this is not a scope reduction. Render actual calculated comparisons, not decorative invented chart series.
- Only Custom reveals From/To inputs. Presets remain reachable without horizontal overflow. Bottom navigation stays above safe-area insets; content and form controls cannot be obscured by navigation, advisor overlay or the mobile keyboard.
- Overview/Accounts/Activity/More is the proposed mobile navigation. More exposes Budgets, Goals, Connections, Advisor, Settings, and future Investment/Pension destinations. Desktop retains the approved left sidebar. Settings replaces that navigation with its own sections and Back to Overview.
- Dan/Demo selector is workspace selection under the same owner identity. An account change with a dirty form asks to discard the unsaved form; cancellation keeps the current workspace. After a confirmed switch clear the form, all financial views, previews and advisor state, and reject late responses from the old workspace. Theme/language remain unchanged.
- Goals start empty: name, description, target/currency, one account or all-account balance, optional deadline. Details expands notes and labeled links; Savings pace expands optional baseline/start-date inputs. No baseline or saved goal is inferred on page load. Existing API validation drives inline errors. Links are never fetched automatically.
- Goal creation/editing is a focused page on mobile; on desktop use the same ordered form inside the approved main shell with a readable maximum width. Back/Cancel returns to the list, with a discard check only for unsaved changes. Success returns to the saved goal detail with its measurement source, freshness and progress. Disable repeated submission while saving; failed validation preserves fields, and a version conflict requires refreshing/reconciling rather than overwriting.
- Budgets offer Suggest from transactions and Create manually. Suggestion preview shows the history window, coverage, calculation basis, uncategorized count and separate credits. **Use 'Credits shown separately', not the image's 'Refunds shown separately': credits are not proven refunds.** No amount is suggested when coverage is insufficient. Explain how to categorize/import more history and keep manual creation available.
- Review one suggested category at a time, adjust its amount, then explicitly Create budget. No auto-save or save-all is implied. Existing overlapping budgets link to their edit flow rather than being overwritten by previews. After a failed save retain the draft and make the error actionable; on success show the saved budget and actual spending from the API.
- Advisor opens a dismissible overlay explaining Not connected. No fake chat, prompt submission, generated advice or AI data sharing. Preserve the page beneath it and restore focus when dismissed.
- Language and theme are user preferences; selection takes effect immediately and persists after reload, independent of the chosen workspace. Custom themes remain later scope. User preference storage must contain no bank data or secrets.

## Acceptance route after layout review

Implement the approved shell, Overview and Settings first, then account/activity and the goal/budget flows using shared components. Integrate safe local browser authentication before exposing financial data in a browser. Verify keyboard/touch navigation, 360px and 390px mobile layouts, desktop, long Danish labels, all five themes and error/empty states. Use Demo data for review screenshots. Do not create product goal/budget records during browser automation; use separate disposable data for mutation tests and leave final creation in Dan/Demo to Dan.

The design package has now been approved with the dropdown/no-top-Demo corrections and implemented. The next owner checkpoint is the running local UI: create/edit goals and budgets and provide visual feedback. See local-frontend.md. Do not trigger repeated image approval rounds.
