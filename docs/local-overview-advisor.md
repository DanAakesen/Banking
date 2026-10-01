# Local Overview advisor

## Scope

Approved by Dan on 12 September 2026: the accepted advisor pane reads saved goals, budgets and every budget entry, categories, account savings balances, actual financial results and paginated transactions in the authenticated Banking workspace. Explicit requests can append a budget entry using the same validation as the form. This supersedes the earlier separate-fixture-only and read-only restrictions for these operations. No Azure deployment or additional bank sync. Standalone HTTP remains a synthetic prototype.

## Run

Run `scripts/Start-OverviewAdvisor.ps1` and open `https://localhost:5443/#/overview`, then choose Demo. The script starts the advisor on loopback port 5450 and its isolated artifact renderer on 5451. Banking runs with `EnableBanking:Enabled=false` and `Local:AdvisorEnabled=true`. Since 25 September 2026 the local worker is no longer disabled: with Enable Banking off, the only configured workspace is Demo, so the worker keeps the fictional Demo data current through the product-demo provider and never reaches Live. Azure remains the sole Live sync worker.

## Implementation

- The approved UI is embedded at `/advisor/`, proxied locally to the existing Node service. Relative module/asset URLs preserve standalone use.
- The proxy is unavailable outside Development or without the explicit flag. It requires a valid Banking session, HTTPS localhost:5443 and same-origin writes. It forwards the authenticated session only to the fixed loopback companion. That service reads /api/advisor-context over certificate-validated localhost HTTPS using existing browser authorization and selected mode. Its budget append endpoint delegates to BudgetPlanService.Save. Credentials never enter provider prompts, artifact data or logs. Demo sessions cannot select Live.
- The generated iframe stays sandboxed on its separate renderer origin. Its bridge trusts only the standalone shell or the explicit local Overview origin; bank APIs remain outside its tool interface.
- Overview replaces its advisor placeholder in the selected authorized local workspace; Live must already be configured. Existing deployment behavior remains unchanged.
- Expand changes the host panel without moving/reloading the iframe; background controls are inert until collapse. Chat history and the active analysis remain in place. Mobile stacks the pane; desktop keeps it to the right of Cash Flow.
- Theme comes from Banking Settings. Chat and artifact storage is scoped by a one-way session-and-mode identifier. A new login starts a new scope; previous files remain stored, but are not automatically surfaced in the new session. Old prototype conversations are preserved separately.
- The advisor service must remain running. The local page displays an offline response if the service is unavailable.

## Verification

.NET build passed; four proxy access tests and 21 existing advisor tests passed.

Verified in the Codex browser through the actual HTTPS Overview on 12 September 2026:

- Submitted the goal conversation starter, received the provider response, and rendered its interactive HTML analysis inside the Overview pane.
- Changed the extra monthly contribution from 3,000 to 6,000 DKK; the generated visual updated the monthly total to 11,000 DKK and projected date to May 2028.
- Expanded and collapsed the host pane without losing the conversation or scenario. Opened chat history and started a new chat immediately; the previous chat remained available.
- Switched Banking between Light and Graphite and verified the embedded theme followed. Restored Graphite.
- Inspected desktop and 390-pixel mobile layouts, including expanded chat, history, starters and composer. Reset the temporary viewport override after verification.

Voice controls and transport are carried over from the prototype and covered by the existing checks; a physical microphone conversation was not repeated through the embedded Overview during this increment.

## Voice failure and controls refinement

12 September 2026: a real voice-triggered analysis returned HTTP 500 `internal_error` at 20:24 UTC, before a session or turn identity was received. Voice and context tools continued working. The provider's underlying cause is unknown. Session-creation requests are not automatically replayed; existing-session GET requests now retry transient 500/502/503/504 failures twice with bounded backoff. New failures retain sanitized status, code, request ID and operation for diagnosis, without raw provider bodies or credentials. Analysis failures are communicated to the active voice session as well as the conversation, without a duplicate footer error.

The composer uses one voice control: waveform when idle, a red stop square while connecting or connected. Stop immediately releases microphone tracks and closes the session. The separate Mute/End/status bar and native audio player are removed; status remains available to assistive technology and errors appear in the chat. Connection cancellation ignores late microphone or session responses. Twenty-seven automated checks cover transport, recovery limits, isolation, voice routing and the start/stop/error lifecycle.

Browser verification used a real GPT-Live WebRTC session with a silent synthetic audio source through the HTTPS local proxy. Observed `session.started`, the red Stop control, a hidden audio element without native controls, then provider-confirmed `session.closed` and restoration of Start voice. Refreshed the actual Overview and verified that the extra voice bars are absent. The original failed analysis was not resubmitted; the new spoken-failure notification was checked at the event boundary, not through another deliberately failed paid generation.

## Quiet voice startup and new-chat placement

Dan subsequently requested New chat beside Expand in the advisor header, outside the history drawer. The existing immediate save-and-new-chat behavior is retained.

The reported spontaneous investment question was emitted as `session.output_transcript.delta` before any input transcript, confirming assistant-generated speech rather than a user recording or hardcoded starter. Session instructions now explicitly wait for the caller and prohibit impersonating the user or replaying history. The shell delays context injection until actual user input and gates assistant audio, transcript display and delegation until a current user input or an application-issued result notification. Old messages remain in chat history; starting voice does not replay them. Targeted tests cover unsolicited output/delegation suppression and restoration of normal responses after user speech.

Chat scrolling now follows every message render, including updates to an existing voice transcript. Updates are coalesced per animation frame and scroll only the conversation region to the latest message, preserving the host page position. Nine focused scroll, voice UI and conversation tests passed. Browser verification opened a 25-message conversation and confirmed its latest message remained 16 pixels above the viewport bottom; the user's current conversation was restored afterward.


## Saved goals and first-load behavior — 12 September 2026

- Overview's illustration mounts only until the first successful Overview load in the document. Subsequent navigation still refreshes data, without the illustration. The artificial ten-second minimum is removed.
- Both text analysis and the voice tool fetch current server goal records on each request. The model receives definitions, names, descriptions, notes, references, dedicated account association, savings plan, booked progress, freshness/reason flags and the existing contribution journey. A missing connection fails visibly; no synthetic goal is substituted.
- Coverage matches the goal page: up to 100 goals, three recent months of journey and at most 30 recent booked transactions per goal, with total/count and coverage metadata. Photos are represented by `hasPhoto`, not image bytes. Older contribution history is not claimed to be complete.
- Voice uses `read_goals`; the backend prepares a short factual spoken answer from the complete goal records rather than truncating raw JSON to the first goal. Long answers use bounded quiet appends before the spoken completion, following [Live delegation](https://developers.openai.com/api/docs/guides/live-delegation). The fixed standalone scenario calculator is never applied to Banking goals.
- Generated artifacts receive the current authenticated context through the isolated bridge. The agent cannot change goals or bank data.
- Verified: x64 build and five proxy tests; 32 Node tests across transport, voice, goal scope, persistence and chat behavior. A real Responses routing call selected `read_goals` for the three Banking Demo goals. The real voice-answer backend correctly explained Car's returned August contribution, 2,500 DKK shortfall and one-month delay to July 2031. This was a provider/backend check, not a new physical-microphone recording.
- Browser verification: initial loading appeared and completed without the ten-second hold; Goals → Overview showed no loading layer. Demo's saved goal names and current values were checked against its goal page.

## Financial context, budget entries and chat refinements

The text router and voice delegation share `read_goals`, `read_banking_data`, `read_transactions` and `create_budget_entry`. Context is freshly loaded per request. It includes all saved budget entries, monthly/annual planned totals, the active budget, category/account links, monthly actual-versus-budget progress and actuals for the selected Overview period. Transaction reads are paginated to 100 records. The provider must preserve dates, currencies, freshness and incomplete-history flags; savings account balances are stocks, monthly savings allocations are flows.

Budget creation requires an explicit request, an existing target budget and clear name, amount, type and period. The router asks when these are ambiguous. Income, Expense and Savings map to the form's existing entry model; periods are 1/3/6/12 months. Existing entries are preserved. The server checks workspace-owned IDs, amounts, limits and the current row version. Operation IDs are reserved before writing and reused on retries; the text composer preserves an unresolved request identity. No bank transfer, payment, investment trade, budget deletion or editing of existing entries is exposed.

The chat matches the actual computed navigation font size (12.74 px in the verified desktop layout). The New chat icon follows the foreground color (white in Graphite); only user bubbles have timestamps, inside the top-right corner. The voice Stop control has a thin circular red border. Activity shows application progress and completed tool names, not hidden chain-of-thought. The full factual assistant answer is shown without the previous punctuation-based truncation.

Verification on the local Demo workspace:

- Asked the real advisor through the Overview UI for the active budget: it returned 22 entries and monthly income 53,075 DKK, expenses 40,972.26 DKK, savings 9,300 DKK and available 2,802.74 DKK.
- Requested `AI QA Internet`, Expense, 1,200 DKK every three months. The provider selected `create_budget_entry`; the existing budget page showed 23 entries, the new quarterly row, 400 DKK monthly equivalent, expenses 41,372.26 DKK and available 2,402.74 DKK. Removed only that disposable test row through the normal UI and saved; original totals were restored.
- Inspected the actual chat screenshot: compact text, white plus, user timestamp inside the bubble, assistant messages without timestamps. Overview navigation had no loading layer after its first successful load.
- One earlier read attempt returned a generic unexpected error; a manual retry succeeded. Its underlying cause was not captured. Transport and timeout exceptions now produce actionable connection/timeout errors, without automatic request replay or private diagnostics.
- The x64 budget service test verifies preservation, repeated requests, mismatched replays, invalid periods and stale versions. Five proxy authorization tests passed. Node tests cover both text and voice budget tool dispatch, no writes from reads, workspace isolation and repeated voice delegation. A new physical-microphone conversation and Live-workspace writes were not performed in this increment.

## Persistent voice companion — 13 September 2026

Implemented AI-12 locally. A single iframe is owned outside the replaceable route container. Docked Overview, floating mini, right chat panel and expanded chat change presentation without moving/reloading the iframe or reconnecting WebRTC. The mini capsule has the requested reddish outline matching Stop. Its waveform uses measured microphone/remote audio levels; working/connecting use distinct restrained animation. Assistant-only captions replace themselves within two lines and clear when the user speaks or voice ends.

The drag grip supports pointer/touch capture, arrow-key movement, Home/double-click reset and local position persistence. Placement clamps after resize and visual-viewport changes. Hover/focus reveals chat/expand; touch retains visible controls. The mini pill disappears on Stop or session end; restart voice from Overview. Workspace changes, sign-out and Stop close the session; browser reload still ends a call. The existing prototype five-minute session cap remains.

Page context and refreshed date/currency headers reach the persistent shell. Confirmed budget-entry writes notify Banking only after success. The open budget refreshes its data and highlights the summary/visible affected row; Overview refreshes its financials. Dirty forms are not overwritten. This is limited to existing supported writes, not new editing/deletion capabilities.

Verification: x64 build passed without warnings; five advisor proxy tests and all 35 Node tests passed. Through the local browser and real OpenAI voice transport, synthetic spoken audio asked which saved goals were behind. The same session continued Overview → Budgetter, returned Car's 2,500 DKK missing contribution via read_goals, and displayed assistant-only mini captions. Mouse drag moved the capsule from (919,574) to (683,373); keyboard movement and reset also worked. Expanded chat retained the conversation. Desktop and 390 px mobile layouts were visually inspected. This used synthetic audio, not the physical microphone.

While that session remained active and Budgetter was open, a typed request created the disposable Voice companion QA expense: 1,200 DKK quarterly, 400 DKK/month. The page updated from 22 to 23 entries without navigation; expenses became 41,372.26 DKK and available 2,402.74 DKK. Removed only that QA row via the budget UI and saved; original totals and 22 entries were restored. The voice paraphrase of that typed confirmation was imprecise; the tool's completion wording was made explicit about budget-entry type and per-period versus monthly amounts. Financial values on the page remained correct. A new spoken paraphrase of this revised wording has not been verified.

Fixed browser findings: the new stylesheet needed registration in the public static-asset allowlist; inline icon variables were replaced with stylesheet classes to respect CSP; mini caption content is separately clamped to two lines. Non-JSON proxy failures now show a readable error instead of a JSON parse exception. No Azure deployment or Live bank write was performed.

Layout follow-up: desktop uses a shared equal three-column grid, with Cash Flow spanning two and AI the third; lower cards use those same column widths. At the verified wide viewport, all three tracks measured 481.555 px and the AI aligned with the third lower card. Tablet tracks measured 337.901/337.911 px (rounding only). At 390 px the AI precedes Cash Flow in one column. Stop/ending and inactive states suppress the floating pill; Overview remains the restart location. Dedicated mobile UX is tracked as AI-13.
