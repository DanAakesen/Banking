# Banking — production acceptance tests

## SAXO-SHARED — guarded shared-backend SIM orders (27 September 2026)

Source implementation complete and engineering-tested, **not deployed**. See [delivery plan and test evidence](saxo-investments-plan.md). Backend validation: 49 passing cases plus two added claim-race cases, with all 19 Saxo order tests passing in the final focused run; 18 advisor tests passed. Actual trade tests require approval of specific orders in step 2.

| Case | Expected result after the approved release | Production result |
| --- | --- | --- |
| SAXO-SHARED-01 | Instrument search, ticket details, account balances and order/activity reads work through Azure and frontend-only localhost, without a local business service. | Not run |
| SAXO-SHARED-02 | Public Demo can read SIM data but cannot prepare/submit orders or read another user's private tickets; forged identity headers do not help. Dan's authenticated session may prepare SIM when enabled. | Not run |
| SAXO-SHARED-03 | LIVE requests remain rejected. Disabling the SIM trading switch blocks preparation/submission while read/status endpoints continue to work. | Not run |
| SAXO-SHARED-04 | Review causes no placement. Missing/false explicit confirmation, expiry, changed costs and insufficient funds/holdings prevent submission. Voice cannot bypass the review card. | Not run |
| SAXO-SHARED-05 | Approved step-2 order submits at most once across repeated confirmation/restart. Uncertain outcome remains uncertain and is reconciled against Saxo rather than resent. | Not run; requires concrete order approval |
| SAXO-SHARED-06 | Account currencies, receipt state and broker fill evidence agree across both frontends. Accepted is not labelled filled. | Not run; populated account belongs to step 2 |

## Shared-backend transition — 27 September 2026

SHARED-01 through SHARED-09 are defined in [the implementation plan](shared-production-backend-plan.md#acceptance-evidence). The full release deployed on 27 September 2026; see the final deployment section in [execution evidence](shared-backend-execution.md). The table below is the earlier pre-release snapshot; current outcomes follow it. Earlier per-visitor financial Demo-copy expectations are superseded by the confirmed shared Demo target; Dan isolation and private conversation protection remain mandatory.

| Case | Current evidence / remaining production check |
| --- | --- |
| SHARED-01 | Standalone frontend host ran on 5444 without local business services or SQL; legacy 5443 process left untouched. Normal launcher blocks until Azure exposes the new contract. |
| SHARED-02 | HTTP smoke: local assets and Azure health/auth/advisor responses verified. New runtime-info contract and both-surface build parity await release. |
| SHARED-03 | Transport security/cookie/logout fixtures pass; fresh proxied Demo login and logout verified against Azure. Owner sign-in/parity and deployed shared-scope isolation remain pending. |
| SHARED-04 | New shared-record/version/isolation fixtures implemented. Cross-frontend shared Demo edit acceptance awaits backend release; no production financial write used for this check. |
| SHARED-05 | Dan read-only parity pending owner acceptance after release. |
| SHARED-06 | Streaming/cancellation and advisor isolation/renderer fixtures pass; Azure workspace metadata succeeds through proxy. Full hosted chat, artifacts and microphone acceptance pending. |
| SHARED-07 | Provider policy/callback source tests; approved Demo SIM access preserved. No new provider consent/order. Existing production order guard and PFA dependency remain. |
| SHARED-08 | Outage, hostile requests, API 404 and missing-contract startup tested; no local fallback. |
| SHARED-09 | No production release. Visual browser check blocked by unavailable browser connection. Source/HTTP checks are not mobile/desktop visual acceptance. |

Updated: 17 September 2026. Tester: Dan. All user-test results below start **Not run**; engineering tests do not count as your acceptance.

## AI data coverage: owner and Demo visitors

Markets toolbar and headline follow-up (local only; production result **Not run**): verify Saxo sits right-aligned beside Workspace/Explore, with no buying-power display or controls on the photo. Its status button is neutral when disconnected, accent while checking, green only after portfolio read succeeds, and amber on failures with Retry. Demo offers only SIM; Connect Saxo starts SIM sign-in or explains missing provider setup. It must not ask for Dan sign-in. Repeat at 390px and light/dark themes; controls wrap below tabs. Verify introductory heading groups show a single headline on Markets, Overview, Goals, Loans, Investments, Pension, Memory and the welcome screen; data labels and warnings remain. Local Chrome desktop/mobile and the modified in-app heading groups checked; connected/error transitions checked with test doubles, not a real Saxo connection.

Run after deploying the Demo/AI coverage change. There is one real user (Dan); other visitors use Demo. All production results: **Not run**.

- DEM-AI-01: In a fresh private-browser session, choose Try Demo. Check accounts, budget entries, goals, Loans, Investments, Pension and Markets watchlist. Financial examples should exist even if the deployed template predates those features. They must be clearly synthetic; no owner LIVE data may appear. Explicitly connected Saxo SIM positions are allowed and remain separate from synthetic statements.
- DEM-AI-02: Ask chat to list saved investments, pension capital, actual loans, loan scenarios and watchlist symbols. Compare with their pages. A watchlist is not a portfolio; the house scenario must not count as debt, and pension payout must not be added to capital. Ask a second question about all budget entries and goals. Replies must use this session's records, not the old standalone Summer house fixture.
- DEM-AI-03: Repeat a financial-data question in voice. The result must match text and the pages. This check does not require testing voice goodbye.
- DEM-AI-04: In Demo session A, edit an example investment and ask AI again. It must use the new amount. Start a separate private-browser session B; its initial value must be unchanged. Deleting a disposable example in A must not make it reappear on refresh or affect B.
- DEM-AI-05: Sign in as Dan. Ask about your saved goals, budget, loans and investments. Missing records must remain missing, not be filled with Demo examples. Switch back to Demo and verify that owner records, chats and memories are absent. Public Demo may use shared Saxo SIM but must never access Saxo LIVE.

Local engineering evidence (17 September): 22 SQL/backend tests passed (Demo coverage, hosted session isolation, advisor access, ProductDemo, wealth and loans); two Node advisor tests passed, including text and voice tool routing for owner/existing Demo/new Demo using an OpenAI test double. Real Chrome chat through OpenAI returned the local 80,000 DKK investment total, 510,000 DKK synthetic pension, 60,000 DKK recorded example loan, separate 1,000,000 DKK house scenario, and the saved watchlist. Live-owner questions and real microphone audio were not exercised in this increment. Not deployed.

**Open:** [Banking production](https://banking-dan-0ac7d719.azurewebsites.net/).

## When to use this script

Run this script **only in production, after Dan requests the final deployment and that deployment is verified**. Continue building the agreed features first. Dan does not need to test local builds, preview environments or intermediate production releases.

This is the acceptance script for the complete intended release, including the Analysis library and Memory graph. Its presence does not mean those features have already shipped. Before the final handoff, record the deployed release below and mark any provider-dependent case explicitly Blocked if its integration is not included. Do not silently count an unavailable feature as passed.

Use **production Demo** for test creations and AI changes. Use **Dan in production** for comparing real figures. All test steps refer to the production URL above, including the Demo workspace. Do not use localhost. Production Demo financial data is shared across visitors and both frontends; create uniquely named test examples and clean up only those exact records. Advisor conversations and memories remain visitor-private. Avoid clearing browser storage during a visitor-session test.

## Record a result

Reply with the case ID and **Pass / Fail / Blocked**, for example:

> VOICE-03 — Fail — iPhone/Safari — voice stopped when I opened Goals. Expected it to continue. Screenshot attached.

For a wrong number, include the selected period, currency, expected value and displayed value. For AI, include your prompt and its response. Note the time and whether you used Demo or Dan. Do not include passwords or API keys.

## 1. Access and core banking

- [ ] **CORE-01 · Access:** Open the site on your phone, try Demo, then sign in as Dan. Expected: the correct workspace and account names; your private data is absent from Demo. Sign out and confirm private pages require sign-in again.
- [ ] **CORE-02 · Overview:** Compare cash balance with the bank using the same balance type and date. Check account names, currency and freshness. Expected: stale or unavailable data is identified; it is not presented as a fresh bank pull.
- [ ] **CORE-03 · Available money:** Select a period and compare income, expenses and net savings contributions. Expected: available-to-spend = income − expenses − net savings contributions. Total savings is the balance of marked savings accounts, not the period's deposits.
- [ ] **CORE-04 · Accounts:** Swipe the account cards, select an account, search transactions, change category filter and open transaction details. Expected: filters agree with the rows, balance remains below its account name, and no overlapping amounts or dropdowns.
- [ ] **CORE-05 · Budget:** In Demo create `QA acceptance budget` with monthly income 10,000, expense 2,000 and savings 1,000, using suitable categories/accounts. Expected: planned available-to-spend is 7,000. Edit the expense to 2,500: expected 6,500. Reload: values remain saved. Actuals reflect transactions, not invented matches to this test budget. Remove the QA budget when finished.
- [ ] **CORE-06 · Goals:** Open a goal by clicking its image or card. Compare the linked account balance, contributions and withdrawals. Expected: one goal per dedicated account, meaningful dates/amounts, and missing/stale evidence shown honestly. A behind-plan indicator must agree with the contribution evidence.
- [ ] **CORE-07 · Review and layout:** In Demo inspect one proposed category or transfer, apply it deliberately and check history/undo where offered. Then switch Light/Graphite and rotate your phone. Expected: your manual choice persists; forms are centered and usable; no decorative colored left border or horizontal page overflow. Restore your preferred theme.

## 2. AI text and generative UI

Keep the same Demo workspace and period throughout these comparisons.

- [ ] **AI-01 · Start a chat:** Open the Overview advisor, try a conversation starter, then New chat. Expected: one user bubble per prompt, clean AI text, visible Send/Voice controls and a working chat-history overlay.
- [ ] **AI-02 · Read all data:** Ask: **“List my saved goals, their linked accounts and balances. Then summarize my active budget's income, expenses, savings and available amount.”** Expected: exact saved records and currencies; unknown/stale values identified; no invented scenario substituted for your goals.
- [ ] **AI-03 · Explain a change:** Ask: **“Why did spending change compared with the previous period? Show the transactions supporting your answer.”** Expected: equal-length comparison periods, reconcilable difference and working source links/filters.
- [ ] **AI-04 · What-if arithmetic:** Ask: **“What if monthly expenses fall by 2,000 DKK and planned savings increase by 2,000 DKK?”** Expected: planned available-to-spend is unchanged; assumptions and any deficit are shown. No budget entry changes merely because a scenario was calculated.
- [ ] **AI-05 · Goal dates:** Ask how an extra monthly contribution would affect one saved goal. Expected: saved balance/target used, balance observation date distinguished from forecast start, and the result labelled hypothetical when evidence is stale. No fabricated investment return.
- [ ] **AI-06 · Visual analysis:** Request an interactive comparison, change one control, reopen the analysis and expand/minimize chat. Expected: the visual responds and remains readable; explanatory prose stays mainly in the conversation. Saving an analysis does not change your bank data.
- [ ] **AI-07 · Budget proposal:** Ask: **“Propose a new budget named QA AI acceptance with monthly income 10,000 DKK, expenses 2,000 DKK and savings 1,000 DKK. Show it before saving.”** Supply category/account choices if asked. Expected: before/after figures and a confirmation action; no saved budget yet. Confirm once: one budget with 7,000 available. Remove it after testing.
- [ ] **AI-08 · Edit protection:** Ask to change one entry in that test budget. Expected: other entries remain untouched. Cancel a proposal: no change. If you edit the budget elsewhere before accepting a stale proposal, expect a clear conflict rather than silently overwriting the newer data.
- [ ] **AI-09 · Assisted Review:** Ask it to read Review, then stage one supported category change. Expected: transaction, category and evidence before Save. A rule is created only if explicitly requested. An internal-transfer classification never moves money. Reload after a confirmed save: no duplicate action.
- [ ] **AI-10 · Remembered priorities:** Ask: **“Remember this test priority: keep a cash buffer of 25,000 DKK.”** Inspect it in remembered priorities, edit it, then remove it. Expected: subsequent answers use the current saved preference and stop treating the deleted preference as saved. Demo priorities do not appear in Dan's workspace.
- [ ] **AI-11 · Activity and failures:** Watch an answer being prepared. Expected: understandable tool/action progress, not a claim to expose private model reasoning. If a request fails, the conversation stays available and the failure is visible; there is no fabricated successful analysis or silent duplicate paid submission. Test a temporary network interruption only if convenient.
- [ ] **AI-12 · Persistence and limits:** Reopen chat history, reload, and inspect usage. Expected: saved conversations/analyses for the release's supported identity survive; Demo and Dan stay isolated. Request counts are labelled as counts, not exact billed cost. Cross-device owner persistence requires hosted storage and must be separately confirmed in the release notes.

Current local limitation to check in the release: the router performs one tool per conversational turn. Reading Review and staging a change may require a follow-up prompt.

## 3. Voice

- [ ] **VOICE-01 · Start/stop:** Tap Voice and grant microphone access. Expected: the voice icon becomes a red Stop control with a thin red border. Stop ends audio, releases the microphone and removes the floating pill.
- [ ] **VOICE-02 · Real conversation:** Ask in Danish, then English; interrupt a spoken answer and correct a number. Expected: it follows the correction and uses the same saved financial context as text. No prerecorded/test utterance appears on starting.
- [ ] **VOICE-03 · Navigate:** During the same call open Accounts → Budgets → Goals. Expected: the call continues and a compact companion remains available. Open chat and return to mini mode without starting another session.
- [ ] **VOICE-04 · Move and captions:** Drag the companion to another corner; rotate/resize the screen. Expected: it stays within reach. Mini captions show only the assistant's latest speech in one or two lines; full chat retains the conversation. Touch controls work without hover.
- [ ] **VOICE-05 · Confirmed action:** Ask for an edit to a Demo QA budget, review the proposed change, then approve that specific change verbally. Expected: one saved change and a refreshed affected page. Unsaved manual form edits must not be lost.
- [ ] **VOICE-06 · Lifecycle:** Stop and restart voice, then sign out or switch workspace. Expected: the previous call ends and private context is not carried into another workspace. Browser reload, closing the tab or phone OS suspension may end a call; seamless continuation across those events is not promised.

## 4. Wealth and research

- [ ] **WEALTH-01 · Loan scenario:** Create a Demo scenario: principal 1,000,000 DKK, fixed annual rate 4%, 360 months, monthly fee 25 DKK, upfront fee 1,000 DKK. Expected: monthly payment 4,799.15 DKK; scenario excluded from actual debt. Its graph declines to zero at the end of the term.
- [ ] **WEALTH-02 · Rate comparison:** Compare the same scenario at 5%. Expected: monthly payment 5,393.22 DKK, increase 594.07 DKK. Closing the comparison does not overwrite the saved 4% rate. Fees and assumptions are explicit.
- [ ] **WEALTH-03 · Pension statement:** Add a synthetic Demo statement of 500,000 DKK, with its date/source, annual pension 120,000 DKK before tax and retirement age 70. Expected: capital remains 500,000, not 620,000. Edit the same record to 510,000: only one record contributes to wealth.
- [ ] **WEALTH-04 · JSON preview:** Import a suitable synthetic PensionsInfo JSON file. Expected: values and skipped rows displayed, reference masked, no insurance benefit added to capital, and nothing saved before reviewing and pressing Save. PDF figures currently require manual entry.
- [ ] **WEALTH-05 · Investments:** Record a Demo non-cash investment statement with a date/currency/source, then update it in place. Expected: no double-counting of a total that already includes provider cash. The page does not pretend a manual statement is a synced portfolio.
- [ ] **WEALTH-06 · Combined wealth:** Reconcile booked cash + recorded non-cash investments + pension − actual debt. Expected: scenarios/Saxo SIM/other currencies excluded; pension shown separately from spendable cash; missing coverage and mixed valuation dates explained. Property is not included unless separately implemented.
- [ ] **WEALTH-07 · AI knows these records:** Ask for the saved pension capital/annual projection and the loan's principal/payment/scenario status. Expected: the same figures as the pages, without calling the scenario actual debt or claiming a provider connection.
- [ ] **WEALTH-08 · Markets:** Add `QA research`, a symbol, an HTTPS source and a note. Edit it, reopen the source, then remove the test item. Expected: saved research stays separate from holdings; no invented live prices. Check the form and cards on your phone.

## 5. Provider connections

- [ ] **CONNECT-01 · Saxo:** After callback registration and fresh owner sign-in, compare SIM cash/positions with Saxo. Expected: clear SIM label, explicit pagination/unknown prices, no wealth inclusion and no trading actions. Transactions, performance and Live access are not yet implemented/verified.
- [ ] **CONNECT-02 · Pensure:** After access and terms are resolved, verify imported pension values/projections against the source statement, including date and coverage. Do not mark this passed based on manual entry or JSON preview alone.

## 6. Memory and Analysis pages

- [ ] **NEXT-01 · Memory graph:** In production Demo, create two memories and connect them with a relationship label. Open nodes, drag one, zoom/pan and reload. Expected: real labelled edges, retained positions, source/date and edit/delete controls. Search and origin filters work. The graph opens zoomed out with small points and labels below them, never oversized text inside circles. Zoom using wheel/buttons: labels remain bounded to two lines; select a point for its full title/text. Entry spreads points from the center once; selecting/searching must not replay it. Reduced-motion mode skips the entrance. Phone users have a readable List view and can switch to Graph view. All controls work in Light and Graphite.
- [ ] **NEXT-02 · Memory accuracy:** Request an AI suggestion. Expected: AI origin and Needs review; it is not used as confirmed context until accepted. Edit and confirm it, then ask the advisor about it. Expected: the correction is used and AI origin remains visible. Delete a disposable linked memory: its incoming/outgoing edges disappear and new advisor requests omit it. No cross-workspace memories. Memories are priorities/context, not proof of bank facts.
- [ ] **NEXT-03 · Analysis library:** Create a visual analysis in production Demo. Change an interactive setting, then choose Update with current data. Expected: the same question reruns using freshly read Banking data and the original rolling-period duration/currency; a second dated version is saved. Select version 1: its original visual, inputs and settings remain unchanged. Reload/reopen: both versions remain. Differences may legitimately be zero when source data has not changed. Actual period activity is separate from planned budget values. A failed/cancelled refresh keeps prior versions. Verify charts and controls on a phone without horizontal overflow.
- [ ] **NEXT-04 · Suggested analyses:** Inspect suggested cards after saving goals, a budget or a confirmed memory. Expected: a specific reason tied to available data or that memory; no claim that a suggestion has already run. Selecting a card opens an editable creation dialog. Cancel creates nothing; Create deliberately starts and saves an analysis. Unreviewed AI inferences do not drive confirmed-memory suggestions.

## 7. Automatic memory and spoken session control

- [ ] **MEM-01 · End-of-chat capture:** In production Demo, state a durable preference without asking to remember it, wait for the response, then start a new chat. Expected: Memory shows processing, then an AI-origin memory with the exact source quote if useful; interpretations require review. The original chat remains available.
- [ ] **MEM-02 · Text inactivity and continuation:** State another preference and leave the completed chat idle for 10 minutes. Expected: processing occurs without closing the chat. Return and add a different preference; only the new segment is processed. Unsaved drafts and assistant statements are not saved as memories.
- [ ] **MEM-03 · Pause / deletion / isolation:** Disable automatic memory, complete a conversation, and confirm nothing new is captured. Re-enable it for new messages. Delete a captured memory and reopen the same chat: it is not recreated. Demo memories must not appear in Live.
- [ ] **MEM-04 · Failures and recovery:** If processing fails, expect a visible failed item and Retry on Memory, with the prior memories intact. Retry is deliberate, no endless paid loop. Reloading after a successful capture must not duplicate memories. Check the source quote, graph and switch on phone.
- [ ] **VOICE-07 · Spoken close:** Owner acceptance only; intentionally not exercised in development. Say “Goodbye” or “Close the voice session”, and separately “Farvel” / “Luk samtalen”. Expected: microphone stops and the floating pill disappears; finalized user messages can be processed for memory. Merely discussing how to end a call, quoting a goodbye, or cancelling an analysis must not close it.

## Production test run

- [ ] **AI-FX-01 · Shared composer effects:** Open AI in Light and Graphite on desktop and phone. Expected: a colorful inner pulse around the text composer, readable text, usable focus/Send/Stop and no horizontal overflow. Enable reduced motion: continuous effects stop. Navigate across Banking pages, including Markets, Accounts, Analysis and Settings: effects remain available in the open shared composer without resetting the chat.
- [ ] **VOICE-08 · Overview state orbs:** During a deliberate production voice test on Overview, listen, ask a question, request an application tool, then stop. Expected: Breathing while listening, Composing while speaking, Solving while preparing a response and Searching labelled Using tools while the delegated request is pending. A spoken progress update may temporarily take precedence. A failed tool and a late result after stopping cannot leave the searching indicator stuck. These states do not imply a web search. Owner result: Not run; see `overview-ai-effects.md` for local engineering evidence.

- Deployed release/build: **full-20260916**
- Deployment verified on: **16 September 2026; engineering checks below**
- Tester / device / browser: **Not provided**
- Test date: **Not run**
- Provider integrations included or blocked: **Enable Banking retained; Yahoo available; Saxo/Pensure connection blocked pending provider setup**

| Case ID | Pass / Fail / Blocked | Actual result / issue | Retested release and result |
|---|---|---|---|
| — | Not run | — | — |

### Maintenance rule

As features are built, keep case IDs stable, update production steps and expected results, and link the affected roadmap item. Do not ask Dan to test intermediate or local builds. On the final deployment he requests, fill in the deployed release and integration coverage before handing over this script. Keep engineering evidence separate from Dan's Pass/Fail/Blocked results. Never mark a feature production-ready from a local test alone. Preserve reported failures until a fix is deployed and retested; record the tested release/device when known.

## Markets phase 1 — MKT (deployed; owner results Not run)

Run after the final requested production deployment. Saxo cases require production-specific credentials/callback; local DPAPI setup does not carry into Azure.

| ID | Steps in production | Expected result |
|---|---|---|
| MKT-01 | Open Markets in Demo; search Novo; choose NOVO-B.CO on Copenhagen. | Correct exchange and DKK. Stock is added to watchlist and actual source-dated price history loads. |
| MKT-02 | Reload; select the saved instrument. Search MSFT and add it, then switch between the two. | Watchlist persists in this workspace. Name, exchange, currency, price and chart change together; no stale response replaces the current selection. |
| MKT-03 | Choose 1D, 1W, 1M, 3M, 6M, YTD, 1Y and 5Y. Open Price data. | Selected period and chart coverage change. Table agrees with chart data. Missing history is explained and failures show Retry or a clearly dated stale snapshot. |
| MKT-04 | Open Explore and then return to Workspace. Change the selected stock and theme. | Heatmap and company fundamentals load where supported. Chart retains the chosen stock/period. AI stays on the right at Overview width. No bottom three sections or market-pulse strip. |
| MKT-05 | Sign in as Dan; choose Saxo environment; connect through official sign-in; open Holdings. | Only that environment's actual positions appear. Zero positions shown only after successful read. Missing credentials or failed sign-in show unavailable, never zero or sample holdings. Blocked until provider setup is complete. |
| MKT-06 | Check buying power, switch SIM/LIVE, then check tablet and phone widths. | Currency/source preserved. If Saxo does not supply buying power, Cash balance is labelled separately. No trading controls active in phase 1. Search, chart and tabs fit without horizontal page overflow. |

All MKT owner acceptance results: **Not run**. No live trades form part of these cases.

### Markets trading desk — MKT-07 to MKT-10 (deployed 28 September 2026)
The trading desk supersedes MKT-04's Workspace/Explore tabs, the AI panel placement and MKT-06's "no trading controls" wording. Explore now sits below the desk. Saxo LIVE research is deployed ([saxo-market-data.md](saxo-market-data.md)); current Demo search requires fresh Saxo market-data sign-in and the UI must show unavailable/sign-in state without substituting prices.

| ID | Steps in production | Expected result |
|---|---|---|
| MKT-07 | As Dan, open Markets. Press `/`, search Microsoft, use the arrow keys and Enter; then add a second instrument with "+ Watch". | The header shows the selected instrument's Saxo LIVE price, change against the previous close and delay, with Day range, Quote time and Your position cards. The watchlist rows show price, day change and an intraday sparkline. Opening a result does not add it until "+ Watch". |
| MKT-08 | Change the period, chart type and MA 50/200; hover the chart; select a holding from Holdings and from Positions. | The chart, legend, key figures and header change together. Average-cost and working-order lines and buy markers show only for matching real positions and orders. MA toggles are disabled when there are too few daily bars. |
| MKT-09 | In Saxo SIM: pick Buy, confirm the listing, fill in quantity and limit, then review. Do not place unless an approved SIM test order is in scope. | The listing must be confirmed explicitly. Bid/ask appear only when Saxo grants them. The review shows Saxo costs and "not filled" wording. An accepted receipt shows Placed → Working → Filled, and the order appears under Working orders. LIVE shows read-only. |
| MKT-10 | At phone, tablet and desktop widths, in dark and light themes, scroll to Explore. | No horizontal overflow. From 900 px down, Buy/Sell shortcuts sit beside the instrument. The heatmap and company insights load only when reached. Demo shows Saxo SIM only and an unavailable/sign-in-required market-data state while the shared feed session is absent. |

MKT-11 (partial market data, 28 September 2026, local only):

| ID | Steps in production | Expected result |
|---|---|---|
| MKT-11 | After the partial-market-data release, open Markets and Investments in Demo and as Dan. Check MSFT, GMAB, SIE and VWS, then read `/api/markets/chart?symbol=MSFT:xnas&range=1mo` diagnostics. | Search works. Each unavailable part is named (history, quote, sign-in, access denied with Saxo code, or transient) and usable parts stay visible. SIM positions show `LIVE` prices and `est.` values only for exact listings, in the instrument currency, and broker totals are unchanged. No text asks for a subscription. If the code is `NoAccess`, Dan decides whether to enable OpenAPI market data in SaxoTraderGO, and the check is repeated. |

MKT-07–11 owner results: **Not run**.

MKT-11 engineering check (28 September 2026, build `2026.09.28-saxo-partial-market-data`, Demo only via localhost:5444 → Azure; not owner acceptance). **Demo part passed:**
- Search works and all four charts return partial snapshots with history denied (HTTP 403) and quote denied (`NoAccess`).
- Markets names each part with Saxo's evidence and Investments keeps SIM purchase details.
- No text asks for a subscription, and no `LIVE` or `est.` values appear because Saxo returns no quotes.
- 1440/1024/390 px: no overflow, one `h1`, no one-sided borders and no console errors.

**Owner part not run**, because it needs Dan's sign-in. UI handoff evidence: 49 UI checks and responsive desktop/tablet/phone, dark/light browser validation; separate postdeployment visual capture and owner acceptance remain pending. Engineering evidence is in DESIGN.md, "Markets trading desk".

MKT-11 recheck after Dan enabled OpenAPI market data (28 September 2026, about 21:55–22:20 Copenhagen, same build, Demo only via localhost:5444 → Azure; read-only). **Quote and SIM-pairing parts passed; history failed:**
- Quotes: all four charts return HTTP 200 with `quoteStatus: available` for the exact listings `MSFT:xnas` (USD), `GMAB:xcse` (DKK), `SIE:xetr` (EUR) and `VWS:xcse` (DKK). Source is `Saxo LIVE`, the delay is 15 minutes, and Saxo's quote time is shown. No re-sign-in was needed and no cooldown was active.
- SIM pairing: Markets positions and Investments holdings show the LIVE price tagged `LIVE` and value/P&L tagged `est.` in the instrument currency for all four. Weights stay "—" (three currencies) and broker totals are unchanged.
- History: every chart returns `historyStatus: unavailable` with `history / SAXO_MARKET_REQUEST_REJECTED / HTTP 400 / InvalidModelState`. The probable cause is the request sending `Mode=UpTo` without `Time`. A local fix is ready and awaits Dan's deployment approval; see `docs/saxo-market-data.md`.
- 1440/1024/390 px: no overflow, one `h1`, no one-sided borders, no console errors, no writes and no subscription wording.
- **Pending:** deployment of the history-request fix, then a recheck of one-month and other ranges for bars. Owner part still not run.

MKT-11 after the history-request release (29 September 2026, about 08:50–08:57 Copenhagen, build `2026.09.29-saxo-history-request`, Demo only via localhost:5444 → Azure; read-only). **Blocked by expired Saxo sessions, not by the release:**
- Health returns HTTP 200 with the new build on Azure and localhost:5444, and parity passed on both.
- Demo LIVE portfolio and orders return HTTP 403 `SAXO_LIVE_OWNER_REQUIRED`.
- All 32 chart reads (MSFT, GMAB.CO, SIE.DE and VWS.CO × eight ranges) return HTTP 503 `SAXO_MARKET_SIGN_IN_REQUIRED`. The same response was already present at 08:40 on the previous build. The shared SIM session has also expired. Whether history bars now return is **not verified**.
- Browser check at 1440, 1024 and 390 px, with all eight Markets ranges switched:
  - Markets shows the sign-in-required state.
  - Investments shows the expired SIM session.
  - No overflow, one `h1`, no one-sided borders, no subscription text and no writes. The only console entries are the expected 503 responses.
- At 08:58 the shared SIM holdings could be read again. Only Saxo LIVE market data still requires sign-in.
- **Next step:** Dan signs in, in his own Live workspace: Markets → "Log ind for markedsdata". Then rerun this check for bars per range, quote availability and SIM `LIVE`/`est.` pairing.

MKT-11 after Dan's LIVE sign-in (29 September 2026, 09:26–09:33 Copenhagen, build `2026.09.29-saxo-history-request`, Demo via the Azure origin; read-only). **Demo part passed:**
- All 32 chart reads (MSFT, GMAB.CO, SIE.DE and VWS.CO × eight ranges) return HTTP 200 with history and quote both available, 15-minute delay on each, `stale: false` and no diagnostics. The earlier 400 `InvalidModelState` is resolved. Bar counts and timestamps are in `docs/saxo-market-data.md`.
- Search works.
- SIM positions and tiles show `LIVE` prices and `est.` values in the instrument currency on both pages. Weights stay "—" and broker totals are unchanged.
- Demo still gets 403 `SAXO_LIVE_OWNER_REQUIRED` for Dan's LIVE portfolio and orders.
- Browser check at 1440/1024/390 px on Azure:
  - Charts render on every range for Markets and Investments.
  - Chart types and MA 50 work, and switching instrument or holding redraws the chart.
  - No overflow, one `h1`, no one-sided borders, no console errors, no subscription text and no writes.
- Open observation: VWS 5d lacks the same 11:00–13:15 UTC window every day; the cause is unknown.
- Owner part still not run.
- Follow-up deployed in `2026.09.29-saxo-samples-signin-ui` (11:19 Copenhagen time): `VWS.CO` 5d `historySamples` shows 1,200 received, 97 kept, 0 dropped for every reason and 40 missing intervals. **Confirmed: Saxo sends no VWS 15-minute samples from 11:00 to 13:15 UTC; Banking drops nothing.** GMAB, SIE and MSFT show 0/0.
- Browser check on Azure after that release, at 1440/1024/390 px: charts render on all ranges on both pages, and the `LIVE`/`est.` pairing is intact. The sign-in UI browser suite passed 66/66 checks against the deployed frontend.

| ID | Steps in production | Expected result |
|---|---|---|
| MKT-12 | After the short-range release, open Markets and Investments on an instrument whose exchange is open. Choose 1H, then 1D, and wait one minute. Switch to another tab for a minute, then return. | 1H shows the latest hour of one-minute bars and 1D the current session in one-minute bars. "Updated hh:mm:ss" advances about every 20 seconds while visible, stops while hidden, and refreshes at once on return. The delay label reads "Delayed 15 min" (never "Real-time"). The gap note appears only when Saxo sent no samples for some intervals. Sign-in-required or access denied stops the refresh. No order or setting changes. |

MKT-12 engineering check (29 September 2026, 13:38–13:50 Copenhagen, build `2026.09.29-saxo-short-ranges`, Demo on Azure; not owner acceptance). **Markets part passed; Investments part not run:**
- 1H and 1D return 1-minute bars for MSFT, GMAB, SIE and VWS: MSFT 1D has 390 bars (full session), and 1H is the last 60 minutes. Delay is 15 minutes and 0 samples were dropped. Missing minutes are shown honestly (GMAB 1H 33, SIE 2, VWS 3).
- Markets refreshes every 20 seconds while visible, pauses when the tab is hidden and refreshes on return. 1H renders with "Delayed 15 min".
- The Investments chart check is blocked: the shared SIM session had expired, and the page shows the new sign-in state.
- Owner part not run.

| ID | Steps in production | Expected result |
|---|---|---|
| SAXO-KEEP | After the session keep-alive release, sign in to Saxo SIM and LIVE, then leave Banking closed for at least two hours (or overnight). Open Investments and Markets. | Both remain signed in without a new Saxo login. Logs show `saxo_session_keepalive` refreshes and no `expired` outcome. A disconnect by the owner still ends the session. |

SAXO-KEEP engineering evidence (29 September 2026, build `2026.09.29-saxo-session-keepalive`): the SIM access token was refreshed by the keeper twice, about 5 minutes before expiry and 15 minutes apart, seen in read-only Demo status reads. The idle two-hour or overnight observation and owner acceptance are **Not run**.

## Release: full-20260916
Scope: all current application code, including Markets, Loans/wealth records, Memory/Analysis, advisor text/voice and automatic memory. New schemas are applied additively to both databases, without importing local financial records. Provider-dependent Saxo/Pensure sign-in remains Blocked until access is completed. Phase 2 order placement and Phase 3 autonomous trading are not implemented and are not part of this release. Dan's acceptance results remain Not run.
Engineering checks: existing Test-Azure.ps1 passed all 15 production security/session checks. Test-FullRelease.ps1 passed authenticated Banking context, Yahoo search and 22 daily bars, cloud memory CRUD with two-visitor isolation, saved analysis library and authenticated sandbox rendering. Initial requests during restart failed; the completed warm-release run passed. Chrome search/add Microsoft and 1M-to-1Y chart change verified. Owner acceptance remains Not run.

Chrome production UI verification: Microsoft search/add, real 1M and 1Y charts, Memory automatic-capture controls, and an actual OpenAI text exchange. Prompt: "Which goals do I have in Demo?" Result: read_goals activity plus Family holiday, Car and Summer house with measured balances and the missed/returned contribution explanation. Voice audio and spoken close were not tested in this deployment; owner voice acceptance remains open. Market search currently triggers the generic unsaved-change navigation confirmation after adding a stock; record as a minor follow-up.

## Floating advisor — FLT (local; awaiting deployment; owner results Not run)

Run these on the production link only after the next requested full deployment. These supersede earlier expectations that AI occupies a page column, including MKT-04's right-side advisor expectation.

| ID | Steps in production | Expected result |
|---|---|---|
| FLT-01 | Open Overview, Accounts, Budgets, Goals, Markets, Memory, Analysis and Settings. | The same floating composer is available; no reserved advisor column. A draft and active chat remain when changing pages. |
| FLT-02 | Send a message, request an interactive visual, open history, then expand/collapse. | User/AI bubbles and visual have readable backgrounds; outer shell stays transparent. Conversation, artifact and history remain usable. |
| FLT-03 | Drag the chat by its grip. Minimize and reopen. Resize to tablet and phone. | Position persists and clamps within the viewport. Composer clears the mobile navigation. Home on the focused grip resets position. |
| FLT-04 | Start voice, move the orb, browse to another page and hover/tap the orb. | Orb-only mode with existing state animations and reflection underneath. Actions animate into view and remain accessible by keyboard. No new voice connection on route change. |
| FLT-05 | Let AI speak; toggle captions; ask a follow-up. | Only the latest assistant speech appears in a replacing one/two-line caption. Caption does not cover the controls. |
| FLT-06 | Show chat from the orb, minimize again, then press Stop. | Same conversation throughout. Stop removes the voice orb and returns to chat. Voice can be restarted from the composer. |
| FLT-07 | Enable system reduced motion and repeat start/minimize. | Orb state remains visible without continuous motion; controls remain functional. |

Engineering evidence: [local implementation and test scope](floating-advisor.md). Do not treat synthetic voice checks as microphone/audio or production acceptance.

FLT-03 follow-up: verify the larger six-dot grip is centered above the input. Minimize text chat and move the launcher to the bottom: only a 12px viewport margin should remain, without invisible voice controls reserving space. Reload Overview and confirm both floating surfaces stay hidden until initial loading finishes. Owner production result remains Not run.

FLT-02 selected glass design: send `Hi` and a longer message. User bubbles remain right aligned with a minimum width; assistant bubbles remain left aligned. Neutral glass-like surfaces and highlighted edges separate conversation content from the underlying page, without an enclosing panel. Verify on desktop and phone. Owner production result remains Not run.

FLT-02 refinement: user text itself aligns right and short bubbles are compact (80px minimum). Expand activity: the chevron precedes the title and tool rows are indented. Switch Graphite → Light → Sand → Graphite with chat open: messages/composer follow the theme, and no solid white outer rectangle appears. Owner production result remains Not run.

17 September private-preview fix (local only): allow the authenticated advisor to be framed by its own browser origin, including the private VS Code tunnel, while retaining the explicit localhost ancestor and cross-origin write checks. The previous localhost-only frame policy caused a blank browser frame through the tunnel before the theme loaded. Verify the composer appears in the selected theme after refreshing the private preview and stays above mobile navigation. Local security/persistence tests: 12 passed; Graphite mobile composer verified through the tunnel at 390x844. No production deployment.

Latest FLT-02/03 expectation: no message timestamps. A small 3×3-dot grip sits inside the toolbar, with no separate grip row. Drag it, resize to phone width, start New chat, and confirm both starters and all toolbar controls fit. Switch all five themes: the advisor has its own related surface/border/accent palette while its outer container stays transparent. Owner production result remains Not run.

FLT-02 follow-up: include a generated visual larger than 64 KiB, change a slider, start New chat, and return through history. Preview should load and slider state should be restored. Engineering has verified this locally using saved-reference requests; owner production result remains Not run.

17 September refinement: verify FLT-01/02 with starters and toolbar on one row, toolbar remaining after first message, blank input placeholder after first message, elevated readable chat surfaces, no composer orb, and compact activity with small Solving orb only while working. Mobile starters have shorter labels to retain both choices in the same row. Owner results remain Not run pending deployment.

Latest FLT-02/03 acceptance (supersedes earlier bubble sizing/palette notes): send `Hi` and a long message; the user bubble should hug short text, remain right aligned, and have a different theme-compatible color from AI replies. Borders are subtle with soft shadows. Start New chat: both starters use the advisor palette. Switch all five themes and verify starters, toolbar, history search/selection and minimized launcher follow it. The minimized launcher has a visible theme-colored halo.

FLT-08 — Drag to resize: hover the left border of the chat input and check the horizontal resize cursor. Drag left to grow and right to shrink gradually; the right edge stays fixed. Minimum desktop width is 400px. There is no compact-width icon. The width persists on reload and route changes. Check dragging the toolbar still moves the whole chat, minimize/reopen preserves the conversation. At phone widths the chat fits the viewport. Keyboard users can focus Resize chat width and use Left/Right, Home (minimum), End (available maximum). Owner production result: Not run; local only awaiting deployment.

FLT-09 — AI Glass (local only; owner production result Not run): open Settings → Appearance, enable AI Glass, and verify the selected color theme stays unchanged. Inspect bubbles, toolbar, starters, composer, history and minimized launcher over busy page content. Reload and change routes: the setting persists. Drag/resize, scroll the conversation, switch between dark/light themes and check text remains readable. Disable: the standard colored surfaces return immediately. Chrome/Edge provide refraction; Safari/Firefox have a frosted fallback. Reduced-transparency preference should show solid readable surfaces.

Activity follow-up for FLT-02: toolbar sits 10px above the input. The activity row has no permanent dropdown chevron. Hover/focus shows an arrow just after its title; clicking the line or using Enter/Space expands/collapses tool rows. On touch, a subtle arrow remains visible. Engineering verified Chrome desktop/mobile and four public-access tests locally; no production result is implied.

FLT-08 follow-up: while holding the left resize edge, move in both directions and verify the 3×3-dot move grip stays fixed alongside the other toolbar icons, including during the drag, without horizontal lag or jumping.

FLT-03 shared position: minimize chat, drag its launcher to a new location, and reopen. The chat grows from the same bottom-right corner (clamped if necessary). Move the open chat, minimize again, and verify the launcher follows that position. Reload and switch routes to verify persistence.


Latest FLT-03/04/06/08 acceptance (local only, awaiting deployment): minimized chat uses the same animated orb as voice, at a smaller size, with no chat-icon replacement. Both have an opaque shaded core and the reflected-light effect. Start voice: its current Listening/Speaking/Working status stays visible without hover; hover/tap reveals controls and the stop square is centered in its circle. Stop and Show chat remain available. There is no expand/maximize control or presentation in either chat or voice. Fill a conversation beyond the visible height, drag the left resize edge in both directions, release, and scroll up/down; scrolling and typing must still work. Repeat with history open/closed and at phone width. Supersedes earlier expansion requirements. Owner result: Not run.


FLT-10 - Selected bubble material (local only, production owner result Not run): with AI Glass OFF, inspect short and long replies in dark/light themes. The richer colored finish is the default; curves and highlights are restrained. Both roles occupy at most 78% of the conversation width, preserving an opposite-side gap; short replies remain compact. With Glass ON, drag chat across a goal progress line or Overview chart: page content must visibly bend at bubble edges while the chat text stays sharp on a readable center. Verify long-message scrolling after width changes and 390px phone wrapping. Reduced-transparency must remove refracting layers and use solid surfaces. Chromium supports refraction; other browsers retain a blur fallback, with those browsers still awaiting independent validation.

FLT-10 follow-up: Glass ON must replace the opaque inset with continuous translucency, preserving theme/role colors. Check the composer both idle and focused: no large shadow beneath it, only fine edge highlights. Standard mode retains its existing material. Local Chrome Graphite/Light checked; production owner result remains Not run.

FLT-11 - Minimized text activity (local only; production owner result Not run): minimize an idle chat and expect Ready. Send a message, minimize before completion, and expect the voice-style working orb + Working. Navigate to another page; on completion expect a themed unread badge + Reply ready. Open the orb to read the reply, then minimize: badge cleared, Ready. A failed request must show Check chat with an exclamation badge. Ensure the label fits at the viewport bottom on phone/desktop and voice still displays its own live state. Local evidence: real Demo replies, navigation, acknowledgement and phone layout verified; working/failure/voice precedence covered by focused tests.

FLT-11 follow-up: scroll a long conversation upward, minimize, then reopen. Expect the conversation to land at the bottom, including its latest activity, without moving the underlying page. Verify the activity disclosure shows > on hover, bubble text is slightly heavier, and clicking inside the composer creates no bright focus border. Locally verified in Chrome; production owner result remains Not run.

FLT-12 - Advisor workspace drawer (local only; production owner result Not run): open the history icon. Expect an opaque panel from chat top down over the toolbar, with a top-right Close button and left navigation for Chats, Analyses, Memories, Usage. Chat titles/dates must be compact rows; search filters them and empty results are clear. Verify each navigation entry shows only its own content, actual usage limits/error state, existing memories and analysis library. Close/Escape returns focus to the opener; selecting a chat restores its conversation. Check Glass ON and desktop/390px layouts: no page bleed-through or horizontal overflow.

FLT-10 edge fade: scroll a long chat so its first visible bubble is clipped. Expect a soft 28px fade into the underlying page at the top, including Glass refraction. At scrollTop 0, the first message should be fully readable. The composer and workspace drawer must remain unfaded. Local only; production owner result Not run.

FLT-11 width follow-up: drag the left edge inward to 280px and verify it stops there. Toolbar and composer must remain usable; text wraps, menu remains inside the chat and search stays reachable. Resize Home also selects 280px; refreshing restores the narrow width. The right edge remains fixed.

## Saxo Demo SIM access correction

Production result: **Not run**. In Demo, verify SIM is the only environment, including after selecting LIVE as Dan and then switching to Demo. Check Connect Saxo and the Investments SIM preview. Missing credentials/callback must give a provider setup message, not an owner-login message. With SIM configured, compare holdings with the simulation account; exclude them from wealth. Direct Demo requests to status, connect and preview with `environment=LIVE` must return 403. Dan retains SIM/LIVE selection. Production OAuth still needs production-compatible credential storage and callback setup; local DPAPI credentials do not deploy.

Local evidence (17 September): 12 backend tests passed (PublicAccess, Wealth, Markets), including a real Demo browser-session cookie, all three LIVE rejections, invalid environments and retained owner access. Both changed JavaScript modules passed syntax checks. Chrome Demo showed SIM as the sole option and Connect reached the actual provider prerequisite: register the Banking callback. Successful OAuth/holdings read remains unverified until that setup is completed. Not deployed.

## Overview accounts and tablet Markets layout

Production result: **Not run**. Verify all Overview accounts and amounts remain visible without an internal scrollbar at desktop, tablet and mobile widths, including long account names. The hero may grow. Demo freshness shows its snapshot date; real accounts show the oldest balance update and a link to connection/sync details instead of the generic stale warning. Markets keeps watchlist left of the chart above 700px and stacks it above only on mobile. Confirm instrument selection and chart periods still work.

Local Chrome evidence: Overview at 1836px, 1024px and 390px showed all five accounts with equal client/content heights and no horizontal page overflow. Markets at 1024px and 768px remained side-by-side; 390px stacked correctly. At 768px, watchlist labels fit, selecting Novo Nordisk updated the chart and 3M became selected. Overview JavaScript syntax check passed. Not deployed.

Markets chart cleanup (17 September, local; production **Not run**): verify the source/timestamps/custom TradingView footer link and Price data disclosure are absent on both Workspace and Explore. Chart rendering, period controls and actual load failures remain. Local Chrome verified rendered canvas and 3M selection after removal. Saxo setup message now gives the exact required callback; local protected configuration was inspected without exposing secrets and still has the retired port-5000 registered callback with no Banking RedirectUri. Developer portal requires SIM sign-in; no registration or credential changes made.


## SAXO-LOCAL-PROD — separate SIM OAuth registrations

### ORDER-SIM — future production acceptance (not deployed)

Production result: **Not run**. Chart-based day-limit stock orders currently run locally only; backend production order endpoints intentionally reject requests. Before a later approved order release, explicitly decide whether to enable hosted SIM order entry. Never test with LIVE funds.

1. In Demo/SIM, select a stock chart, Buy, then confirm the exact Saxo listing/share class. Check account, quantity, limit, currency, unavailable/delayed quote messaging and two-minute review expiry.
2. Review Saxo fees/cash estimate, explicitly submit one agreed SIM order, then compare order ID/state with Saxo. Do not treat Accepted or Working as filled.
3. Double-click/reload after submission; confirm the same ticket cannot create another order. A network interruption must preserve uncertainty and offer status checking, not automatic resubmission.
4. Verify insufficient cash, unsupported stocks, short sales and all LIVE order attempts are rejected. Confirm cross-visitor receipts remain private.
5. Complete a SIM round trip during the selected listing’s trading session: buy one share, verify the broker reports a fill and Holdings shows it, click that holding to open its chart, sell the same quantity, and verify a second fill and zero remaining position. Verify any pending test orders are cancelled or expired.
6. Let an order review expire before confirming. The UI must say nothing was submitted, offer Refresh review, and require fresh confirmation; no broker order should be created by the expired attempt.
7. Investment Demo statements should not be reseeded. Existing production synthetic statements need separately scoped cleanup when deploying.
6. Check the ticket and Orders view on phone and desktop, including long stock names and provider errors.

Local engineering evidence: [Saxo order implementation](saxo-orders-local.md). One Mærsk B SIM order accepted/Working; no filled position claimed. These observations do not mark production acceptance complete.

### OAuth acceptance

Owner acceptance result: **Not run**. Registrations created by Dan, separate credentials installed, code deployed. Local authenticated SIM read passed. Production official SIM login is open; hosted authenticated read pending that sign-in. Acceptance checks:
1. Connect from local Markets: Saxo callback must return to localhost, and SIM cash/holdings must match the simulation account.
2. Connect from production Markets: return must stay on the Azure hostname; never redirect to localhost. Compare actual SIM holdings; empty is valid only after a successful provider read.
3. Restart the hosted app and read again; encrypted saved tokens must survive. Exercise token refresh after access expiry without reusing the previous refresh token.
4. Demo exposes only SIM and rejects all LIVE broker endpoints. Owner keeps independent LIVE configuration. No SIM totals enter recorded wealth.
5. Replacing an app registration must require its own login rather than inherit another registration's tokens. Credentials and token bodies must not appear in browser responses, logs or source.

Engineering evidence (17 September): 16 focused backend tests passed with synthetic token responses. Actual local Chrome SIM sign-in returned to localhost and read zero positions successfully. Production deployment `09a80565-1d75-440e-893a-07ab2c66346e` completed at 15:59:11 UTC. After container restart, all 15 Test-Azure checks passed; hosted SIM credentials/callback are ready, and Demo LIVE status/connect/preview each returned 403. Actual hosted read awaits the independent SIM sign-in. Restart/refresh persistence is unit-tested; provider-backed hosted restart/expiry checks are not yet performed. No trade is part of these checks.

## Mobile More menu (not deployed)

- [ ] **UI-MENU-01:** On a phone, open More. Expected: a compact bottom sheet, maximum 390px or 52% of viewport height; navigation scrolls while Close and the account row remain reachable. Scroll to Memory and navigate, reopen, expand the account menu, then close. No horizontal overflow or hidden account actions. Reduced motion disables the subtle entrance. Owner result: Not run.

- [ ] **UI-CHAT-BOUNDARY-01:** On mobile, drag expanded and minimized chat to the bottom, rotate/resize and open/close the keyboard. Expected: chat cannot cover bottom navigation, retains a 12px gap when the navigation is visible, and remains reachable in the visible viewport. Desktop drag limits remain unchanged. Owner result: Not run.

### SAXO-CARDS — account summary cards (production verification after deployment)

Production result: **Not run**; implemented and checked locally.

1. Open Markets in connected SIM. Verify Account value, Available to trade, Invested and Unbooked activity match the selected Saxo account, with correct currency and SIM label. Booked cash is not added to account value again.
2. Click a card: verify the account breakdown, pending commissions/fees, blocked cash, timestamp and collapsed margin details. Close with Close or Escape; focus returns to the triggering card.
3. On a phone, swipe through all four compact cards. Check next-card visibility, active line indicators, indicator navigation and no page-wide horizontal overflow. Values and currency must remain readable. Open the drawer from the final card.
4. On desktop all four cards fill the row. Check a light and a dark theme. If more than one account exists, switch accounts and confirm amounts and currency change together.
5. Disconnect/switch Saxo environment: previous account values must clear. Missing provider values show unavailable, never invented zero. SIM performance sample history must not appear as account returns.


### MOBILE-DENSITY — pending deployment / production verification

- On a phone, visit Overview, Accounts, Review, Budgets, Goals and Markets. Expect a single compact page heading, useful financial figures before scrolling, and no large scenic introduction.
- Check at 320px and 390px widths: no page-wide horizontal overflow; tabs, period/account selectors and creation actions remain usable.
- Markets: swipe account cards and the stock list; select a different stock and chart period. Confirm the chart updates.
- Budget: open New budget and confirm the name field spans the dialog; cancel without saving. Goals: the first goal should show its balance and progress without scrolling past a large photo.
- Check Light and Graphite; return to desktop and confirm the scenic headers and full layouts remain.
- Local evidence: Chrome responsive checks at 320px and 390px, all six pages; stock selection and 1W range interaction passed; New Budget dialog opened and cancelled without writes. These checks do not replace iPhone Safari production acceptance.

### LANG-DA — local verified; deployment and production verification pending

- Choose Dansk under Settings → Language. Check Overview, Accounts, Review, Budgets, Goals, Investments, Pension, Loans, Markets, Analysis, Memory, Connections, categories, activity, transfers and all three settings pages. UI labels, prompts, loading/empty states and dates must be Danish.
- Open the floating chat drawer, memory form and usage panel. Check chat placeholder, starters, toolbar, accessibility labels and minimized companion. Switch to English without reloading: both shells must follow; switch back to Danish. Existing conversation content is intentionally preserved.
- Demo bank, accounts, transactions, categories, budgets, goals and synthetic financial examples remain Danish with either UI language. Real company names/tickers remain their official names.
- At 390px, Danish chat controls and mobile navigation fit without overlap. Check theme names and the main-content skip link in both languages.
- Run `node --test prototypes/advisor/i18n.test.mjs prototypes/advisor/chat-boundary.test.mjs prototypes/advisor/server.test.mjs prototypes/advisor/overview-effects.test.mjs` and the x64 `ProductDemoTests` filter. Verify transaction identities/counts/amounts and Live isolation before and after explicit Demo localization maintenance.


### STARTUP-FLOW — pending deployment / production verification

- Freshly open the app: full-screen line-flow loading, no navigation/header/advisor; pulses travel across all 32 lines.
- Progress advances from zero through request completion to full, then reveals the workspace. Navigating away and back must not replay startup.
- Check phone layout, Light/Graphite and OS reduced-motion. A failed data request must exit the loader with a usable Retry; retry after recovery must succeed.
- Local evidence: Chrome desktop1440x1024 and phone390x844; throttled request progress observed at55 and70, shell inert and mobile without overflow; normal completion/navigation passed; blocked trends request exposed Retry and restored interaction.
Reduced-motion browser check also passed (animation: none); after network recovery the overview rendered and inert/loading state cleared.

### RESPONSIVE-SCENIC — pending production deployment
- At desktop, tablet portrait/landscape and 320–430 px phone widths, visit Overview, Accounts, Review, Budgets, Goals and Markets.
- Photos remain visible behind compact summaries; tablet/phone heroes do not reserve large empty vertical areas.
- Account names wrap without horizontal or vertical scrollbars inside the balance summary; balances remain readable.
- Swipe account/watchlist carousels and use their existing controls; intentional carousel scrolling remains functional.
- Confirm searches, period/currency selectors, goal navigation and budget controls remain accessible.
- Local evidence: six-route checks at 1440/1024/768/390/320 px, no document or hero overflow. Tablet Budget final geometry 188 px tall. Physical Safari acceptance remains pending.

### SHARED-HEADERS — pending production deployment
Confirm Overview, Accounts, Review, Budgets, Goals and Markets use the same photo header with one title and aligned controls. Summaries/search sit directly below, with no decorative repeated headline. Check title/action wrapping on phones, theme contrast, period/account selectors, goal creation and market search. Local syntax check and six-route geometry checks passed at 390/768/1440 px; tablet Goals/Review and phone Markets visually reviewed in Chrome.

## 360 overview — production acceptance after deployment

- Verify the seven metric cards: available to spend, cash, savings, income, spending, budget remaining, and estimated next-seven-day expenses. Follow each to its source/detail.
- Reconcile recorded assets with cash plus same-currency non-cash investment and pension statements. Savings are included in cash. Saxo SIM must not increase asset totals. Missing statements display an em dash and a partial-overview label.
- Change the period: income, spending and recorded daily sparklines should update. Budget remaining uses the current budget month; balances retain their own observation dates.
- Resize with the sidebar open and collapsed. Available overview content width: mobile <=700px; tablet 701–1099px; desktop >=1100px. Check immediately above/below both boundaries, plus 320px phone width. No clipped names, amounts or horizontal page scrollbar.
- On phone/tablet, swipe all seven metric cards or use their indicators. On phone, select Cash, Investments and Pension to replace the detail panel. On desktop/tablet all asset panels remain visible.
- Select chart sectors and account subdivisions by pointer and keyboard. The corresponding asset/account should highlight. Verify account links, statement links, and the savings/available-to-spend detail dialogs.
- Check light and dark themes, long account names, empty accounts, absent statement data, and an overdrawn account. Negative values must remain visible without misleading pie segments.

### 360 Demo visual coverage
- Demo shows six colored metric sparklines, each ending at its displayed value. Available money jumps at month-end payday and decreases afterward; savings and income rise in payday steps; spending accumulates; budget remaining declines. Switch between one and three months to check repeated paydays.
- Upcoming expenses shows its payment count and next due date, with no sparkline. Check zero, one and multiple payments.
- The 360 section must have no Demo/illustrative badges or captions. These are workspace-specific fixtures internally, never provider history or Live fallback data.
- Demo investment statement: 125,000 DKK (if no prior investment statement existed). Investment chart ends at the statement total; it is separate from Saxo positions, orders and SIM cash.
- Change one month to three months: investment chart dates and percentage performance must update. Pension contribution/return bars now show movement during the selected range, not lifetime composition. Their headline statement balances remain current. Missing history must not be extrapolated.
- Pension Demo fixture assumes monthly deposits of 1% of accumulated contributions on the last weekday and 4.5% annual accrual on the recorded balance; it is isolated from Live. At 324,000 DKK accumulated contributions, a one-payday range adds 3,240 DKK; a three-payday range adds 9,720 DKK.
- Live must never receive Demo trend factors, investment history or pension breakdowns. Missing actual historical data stays missing.

### Section period controls
- Overview daily period/currency controls sit above the cards on the right. Carousel indicators sit before the divider into current assets.
- Investments and pension sit below current assets, separated by a divider and an independent right-aligned period selector. Change each selector and confirm the other retains its value and performance. Check custom dates, phone layout and no horizontal page overflow.

- Overview: no currency picker in the daily cards and no 360 footer. Cash flow/spending breakdown default to one month with their own period selector. Set top cards to one week: monthly cash flow must remain 57,300 DKK income and 35,294 DKK spending in the current fixture. Changing cash-flow period must not change the top cards or investment/pension period.

### Budget overview redesign
- Verify Overview budget month switching, saved plan/actual totals, chart actual/projection distinction and uncategorized Review link.
- Desktop lower panels must be exactly 50/50; tablet equal panels while space permits; phone stacked with swipeable summary cards and no document overflow.
- Check no active budget, missing cash-flow history, zero budget, exceeded category limits and completed months.
- Local calculation tests cover reconciliation, absent history, remaining allowance and leap-month completion.

### Expanded advisor tools
- Voice balance grounding: after a new voice session, ask for total savings and available salary-account balance. Compare to current workspace UI, distinguish booked from available and retain observation dates. Empty backend answers must state unavailability, never invent figures or use prior assistant amounts. Local text/model check on 22 September returned 326,400 DKK savings and 75,388 DKK available (75,563 DKK booked); post-fix spoken verification is pending.
- Prompt activity: ask two successive text/voice questions. Each list must appear after its own prompt and before the reply, expand while active and collapse on response. Only active tool icons animate; respect reduced motion. Reopen an older list without altering the current one. Owner confirmed microphone interaction locally on 22 September; voice financial grounding remains unaccepted because inspected transcript amounts differ from workspace data.
- Local revalidation, 22 September 2026: 87 advisor tests, nine visualization calculation tests and five existing-build wealth tests passed. Owner reconnected SIM; actual text chat read account funds, positions and orders successfully. Manual pension editing saved/reloaded/restored without reproducing the earlier failure. Microphone verification remains pending; this does not constitute production acceptance.
- Verify text and voice read Saxo SIM funds/positions/orders after reconnecting; Demo must reject LIVE queries.
- Check market search followed by selected instrument chart; API failures remain visible.
- Explain independently selected wealth, cash-flow and budget periods; compare chart values exactly.
- Stage and confirm goals, loans, statements, watchlists, categories and rules in an isolated test workspace; check stale version conflicts and ambiguous network outcomes before production acceptance.
- Confirm no changes occur on read-only questions and no trading/payment tools are exposed.

### UI-REFINE — 18-item UI pass (local; pending deployment; owner results Not run)
| ID | Steps | Expected |
|---|---|---|
| UIR-01 | Switch to Light and Sand; open 360 → Budget. | Cards, forecast and category panels are readable; month picker icon visible; tiles keep saturated colours. |
| UIR-02 | With an account sync older than today, open 360 → Budget forecast. | Actual line stops at the sync date, shaded "No data" band, estimate starts there, note says "Data to …". Chart fills its panel on tablet. |
| UIR-03 | Open Budgets in Light. | Pills readable; whole-kroner summaries; "N DKK left/over" wording; eight categories plus "Show all categories (N)"; no inner scroll. |
| UIR-04 | In Danish and English, edit a budget entry amount with a decimal and save. | Field shows the app language's decimal separator; saved value and per-month amount are correct. |
| UIR-05 | 360 tiles/Spending mix; Goals without photos. | Icons match categories; each goal has a distinct default visual; stale goals state the balance age. |
| UIR-06 | Minimize the chat, reload and sign in again. | Chat returns minimized at the same position; "Ready" label legible over any page content. |
| UIR-07 | Markets without a Saxo session. | Sign-in card with Connect Saxo SIM; Buy/Sell/Orders disabled with hint; attribution link present; no CSP errors. |
| UIR-08 | Review → select a transaction with a bank merchant category. | "Suggested: <category>" with "Bank category: <MCC>" beneath. |
| UIR-09 | Tablet width (701–900px) on scenic pages and Loans; Settings → Appearance. | No separate masthead on scenic pages; Loans keeps it; theme previews show real colours. |
| UIR-10 | Restart the local host with Start-OverviewAdvisor.ps1; open Demo after a few minutes. | Demo sync brings accounts to today's date; Live remains unavailable locally. |

### RULES-UI and VOICE-FIG — 26 Sept 2026 (local; pending deployment; owner results Not run)
| ID | Steps | Expected |
|---|---|---|
| RUL-01 | Visit every page in two themes (one dark, one light), including the chat drawer and an analysis. | Exactly one title per page/section, with no tagline or subtitle stacked under it. No one-sided borders; lists use alternating tones; selected tabs show a tinted pill. |
| VFG-01 | Start voice and ask for total savings and the salary-account available balance. | Spoken amounts match the screen exactly (326,400 / 75,388 DKK in Demo); no "Not verified" note. |
| VFG-02 | In the same call, ask a question the data cannot answer (e.g. "How much will I have in 2040?" without a scenario). | The advisor says it cannot verify the figure; any invented amount is marked "Not verified…" and corrected aloud once. |
| VFG-03 | Say a number yourself ("Is 50,000 DKK enough?"), then ask for a comparison. | Your own figure is not flagged; comparisons use recorded amounts. |
### LANDING — redesigned first page, 27 Sept 2026 (local; pending deployment; owner results Not run)
| ID | Steps | Expected |
|---|---|---|
| LND-01 | Open the site signed out on desktop and phone, in the morning, afternoon or evening. | Matching scenery with a slow drift, greeting and time; one title; two entry options; card is readable in every theme. |
| LND-02 | Choose Try Demo. | Demo 360 opens without login. |
| LND-03 | Choose Sign in as Dan; test show/hide password, Caps Lock, a wrong password, then the correct password. | Error is shown and the form recovers; correct password opens Dan; Back returns to the choices. |
| LND-04 | Enable reduced motion and reduced transparency in the OS. | No continuous animation; the card is solid. |
### HEADERS — composed scenic headers, 27 Sept 2026 (local; pending deployment; owner results Not run)
| ID | Steps | Expected |
|---|---|---|
| HDR-01 | Open 360, Accounts, Review, Budgets, Goals and Markets on desktop. | Photo with title and glass controls on top, one headline figure bottom-left and glass cards bottom-right; the same figures are not repeated below the photo. |
| HDR-02 | Click the 360 headline, a Review chip, and the arrow on the 360 card row; search in Markets; edit a budget amount without saving. | Breakdown opens; Review filters; the row scrolls to the next card; results appear under the search; the Budgets figures update to the planned amounts. |
| HDR-03 | Repeat on tablet (about 1024 px) and phone (about 390 px), and in a light theme. | Controls fit under the title on phone; cards swipe; no horizontal page scroll; text stays readable. |
| HDR-04 | Enable reduced transparency and reduced motion. | Glass becomes solid; cards do not lift or animate. |

### GOALS-UX — goal journey, path chart and edit modal, 27 Sept 2026 (local; pending deployment; owner results Not run)
| ID | Steps | Expected |
|---|---|---|
| GOAL-UX-01 | Open Goals in Demo and select Family holiday, Car and Summer house. | The hero shows the ring, milestones and facts. Family holiday stays blue on plan since Jan 2025. Car is red and shaded, widening from Jul 2025 with an extra step at the 12 Aug withdrawal, about 10,000 DKK behind, arriving Oct 2030 after its Jun 2030 deadline. Summer house is green and about 10,500 DKK ahead. |
| GOAL-UX-06 | Scroll to the cards and select another goal; use browser Back and Forward. | Only the detail section changes; the page does not reload, and the header and scroll position stay. Back and Forward switch goals in place, and the selected card and URL follow. |
| GOAL-UX-02 | Switch the chart between To goal and So far; hover a withdrawal marker; focus the chart and use the arrow keys. | The range changes. The tooltip shows date, balance, plan, difference and the transaction. The arrow keys move between dates and are announced. |
| GOAL-UX-03 | Choose Edit plan, change the monthly amount, then Close. Choose Edit notes and links. Open `#/goals/{id}/edit` directly. | The modal opens over the page with a live preview that updates. Close asks to discard. Notes is focused. A direct URL opens the same modal. |
| GOAL-UX-04 | Save a real edit, then restore it. | The modal closes, the page refreshes in place, and the chart and hero reflect the change. |
| GOAL-UX-05 | Repeat on a phone and in a light theme, with reduced motion. | No horizontal scroll; the chart header, labels and preview fit; there is no animation. |
## Shared backend deployed - 27 September 2026

Current verified state supersedes earlier pre-release entries: Azure runs build 2026.09.27-shared-backend. SHARED-02/04: same runtime, identical five Demo accounts and bidirectional category edits verified through Azure and localhost:5444, with cleanup. SHARED-03: Demo-to-Live rejection and shared-data concurrency passed. SHARED-06: hosted advisor metadata, private memory, sandboxed artifacts and cross-session denial passed; actual microphone acceptance remains open. SHARED-01: frontend-only host runs on 5444; automatic approval review blocked stopping existing 5443/5450 processes, which remain legacy. SHARED-05: owner Dan sign-in/parity not tested. SHARED-07: no new provider consent or orders. See deployment evidence for package, rollback and test counts.

## Shared Saxo SIM — 27 September 2026 correction and release
Supersedes historical local-only and owner-only SIM descriptions. Demo visitors and Dan may prepare and confirm SIM orders. LIVE access is Dan-only; LIVE order execution is not enabled by this release. Orders need explicit confirmation and immutable browser-session-bound tickets; shared Demo data does not merge ticket ownership.

- SAXO-SHARED-01: On Azure and localhost:5444, runtime build is 2026.09.27-shared-saxo-demo and Demo status reports SIM trading enabled/allowed, ownerRequired false, confirmationRequired true.
- SAXO-SHARED-02: Read account balances/holdings, instrument search/details, orders and activity from Saxo; distinguish quote/history provider limitations.
- SAXO-SHARED-03: Public Demo can reach order input validation. Missing/false confirmation rejects before broker submission. Demo LIVE routes remain forbidden.
- SAXO-SHARED-04: Separate visitors share financial data but cannot read/confirm each other's review tickets. Confirming one's own valid review works in fake-broker tests; retry/restart cannot duplicate submission.
- SAXO-SHARED-05: An unsubmitted broker review may be checked using a verified price; do not invent a quote. An actual SIM order belongs to the separately approved concrete step-2 portfolio.
- SAXO-SHARED-06: Persistent encrypted tickets and atomic claims remain under /home/Banking across releases. No local database, migration, data import, real-money order or automated broker submission is part of release verification.

Engineering: 53 focused backend tests passed, final public-route suite 7/7 passed, Linux publish and JavaScript syntax passed. Hosted results to be recorded after restart.

Hosted result — 27 September 2026: SAXO-SHARED-01/02/03 passed against Azure and localhost:5444, build 2026.09.27-shared-saxo-demo. Actual browser confirmed connected SIM and matching account cards on both. SAXO-SHARED-04 passed in fake-broker/session middleware tests; provider submission not performed. SAXO-SHARED-05 not run because Genmab bid/ask is NoAccess; no invented limit used. SAXO-SHARED-06: durable files untouched, deployed runtime and persistent Saxo login verified; actual new ticket persistence covered by automated tests. No trades in this release. Logs: artifacts/shared-saxo-azure-verification.log, artifacts/shared-saxo-local-verification.log, artifacts/shared-saxo-azure-review-verification.log.

## Scheduled complete release preparation — 28 September 2026
- Scope includes all current application/advisor files, Goals and scenic-layout work, prepared Saxo fields/combined endpoint, and the separate 360 SIM snapshot.
- Source freeze manifest: `artifacts/complete-source-manifest.json`; fresh Linux package under `artifacts/release-complete-investments-20260928`; production build intended `2026.09.28-complete-investments`.
- UI/advisor tests 140/140; frontend-host tests 18/18; Azure validation five checks passed. Full backend serial suite still running at this entry; the first parallel LocalDB run stalled and is not counted as a passing release check.
- Browser: 360 and Accounts header comparison; desktop 1440, tablet approximately 1024, mobile approximately 390 CSS px (browser zoom affects rounding). No horizontal overflow or one-sided borders; dark/light inspection. Isolated in-browser contract fixture tested balances in EUR, holdings separate from open orders, reconciled allocation, and missing costs. It was cleared by disabling interception and reloading; nothing was saved to the API. Investment combined-contract fixture verified order status/zero filled quantity and unknown fees.
- Provider: fresh SIM read failed with `SAXO_ACCESS_REQUIRED`; UI reconnection reached the SIM login form. Fresh broker fill/fee/quantity verification requires renewed sign-in; no orders or LIVE changes performed.

## Scheduled complete release result — 28 September 2026
- Deployed build `2026.09.28-complete-investments`; complete current source including Goals/scenic layout and Investments/360 SIM integration. Successful SCM deployment `b259c9d5-b7bd-445a-8f1c-98df6868ac6e`; runtime verified after restart.
- 314 automated tests passed: backend 156, UI/advisor 140, frontend-host 18. Production access smoke checks and advisor context/history/private-memory/artifact-isolation checks passed.
- Azure/local parity passed for build, nine frontend assets and shared Demo account identities. Demo LIVE routes denied on both. Evidence: `artifacts/complete-parity.log`, `artifacts/complete-azure-smoke.log`, `artifacts/complete-advisor-smoke.log`, and `tests/Banking.Tests/TestResults/complete-serial.trx`.
- Browser on both frontends confirms separate SIM/unknown-value rendering and the Investments sign-in message without page overflow or console errors. No changes to the user's existing Goals edit form.
- Provider acceptance remains open: `artifacts/investment-release-azure.json` and `artifacts/investment-release-local.json` record the new combined endpoint as Unavailable pending Saxo SIM sign-in. Unknown counts are null, not zero. This does not prove a fill or current pending status. No trade mutations performed.

## Investments sign-in and connected verification — 28 September 2026
- INV-AUTH-01: On Investments, an unavailable Saxo session exposes direct sign-in in the header and notice. Click shows Connecting, prevents duplicates and sends SIM plus the originating Investments destination. A setup failure remains on the page with retry. Isolated browser interception verified this without invalidating the real broker session; interception was removed after testing.
- INV-AUTH-02: OAuth destination is stored with each single-use state. Azure and localhost:5444 Investments returns, concurrent states, replay rejection, seven malicious/unapproved redirect targets and unchanged Markets default tested with a synthetic token provider. 23 focused backend tests and 11 UI/data-model tests pass; Linux x64 publish passes.
- INV-DATA-01: Current Azure/local combined API and actual browser match: 999,973.83 EUR cash/value, 0 invested/holdings, 4 Working orders, 8 placement audit events, no pagination/errors. 360 SIM is separate from the 433,352 DKK Demo asset total. No order mutation. Purchase prices and final fees remain unverified because no filled positions/events are reported.
- Release package is scoped to API DLL/PDB and wealth-ui.js/wealth.css; newer concurrent Goals edits are preserved locally and excluded from this correction.

## Direct Investments sign-in release acceptance — 28 September 2026
- Deployed build `2026.09.28-investments-signin`; successful SCM deployment `63e94488-633c-4f33-b3a4-04903f97fd9d`, completed 06:02:40 UTC. Azure and localhost:5444 runtime verified after restart.
- Package SHA256 `A41B22BA016DA4AA701636E8D4EEF282C96AAAA7C9A3210063FB4D00E2CE0EF8`. Rollback `/home/Banking/releases/before-investments-signin-20260928.zip`, SHA256 `5C42E0D2EB7D668297B960532B2ADB6869264549864B30B7B211BE99B8424B34`. Only API DLL/PDB and wealth-ui.js/wealth.css differ from the previous complete release. Concurrent Goals edits remain local.
- Postdeployment: both changed asset hashes match on both frontends. Direct SIM authorization initiation succeeds for each originating Investments destination; unapproved return URLs are rejected (400), Demo LIVE portfolio access remains denied (403). Actual provider callback return was tested with a fake token provider, not by interrupting the renewed user session.
- Reconciliation and browser checks at approximately 08:08–08:10 Copenhagen: cash/account value 999,973.83 EUR; invested 0 EUR; 0 holdings; four Working orders; eight placement activity records. No read errors or pagination. No confirmed fills, execution prices or final fees. Evidence: artifacts/investment-release-azure.json and artifacts/investment-release-local.json.
- Both 360 pages show the same separately labelled Saxo SIM snapshot, excluded from the 433,352 DKK Demo recorded-asset total. Unknown personal investment/pension values stay unknown. No browser errors or horizontal overflow observed. Responsive desktop/tablet/mobile and light/dark sign-in checks completed locally.
- 23 focused backend tests and 11 Investments UI/data-model tests passed before release. No order mutation, LIVE enablement, schema, account-data, settings, role or infrastructure change. Status: deployed and verified; actual fill/fee acceptance remains a provider dependency.

## Actual SIM fill acceptance — 28 September 2026, 09:16–09:20 Copenhagen
INV-DATA-02: Vestas 5 at 199 DKK and Siemens 2 at 277.95 EUR are confirmed by holdings/source-order IDs and FinalFill/Confirmed audit records. Reported commissions: 29 DKK and 12 EUR respectively; absent fee components remain unknown. Genmab/Microsoft remain Working. Azure/local production reads show 2 holdings, 2 open orders and 10 activity records, no provider errors/pagination. Each response reconciles cash + invested + unbooked = total exactly; prices differ between observation times.
INV-UI-02 remains FAILED for unreliable zero holding valuations, omitted structured opening commission, raw FinalFill plus contradictory generic event text, and unexplained pending settlement in allocation. These were verified in the deployed browser and traced in wealth-ui.js; no fix/deployment is claimed. Full accounting evidence and remaining provider limits are recorded in saxo-sim-test-orders-2026-09-27.md under First confirmed fills and reconciliation.


## Fill display corrections — local acceptance, 28 September 2026
- INV-UI-02 fixed locally in wealth-ui.js, overview.js and wealth.css. Unavailable position prices/values/P&L remain unknown; confirmed purchase information remains visible. Structured commissions render as 12 EUR for Siemens and 3.88 EUR for Vestas in account currency. Unreported charges are not assumed zero. Confirmed FinalFill events show Filled with an execution-specific note; placement/partial events retain distinct meanings.
- Shared Investments/360 settlement bridge shows booked cash 999,973.83 EUR, pending settlement -704.88 EUR, and cash after settlement 999,268.95 EUR. Allocation includes signed unbooked transactions and is shown only when reconciled; no SIM values enter personal wealth.
- Automated: all 38 tests/ui tests pass, including 17 Investments cases. New coverage includes the actual observed settlement snapshot, incoming/outgoing settlement, missing/mixed/unreliable accounts, unreliable zero prices, structured known-zero fees, missing currency, confirmed full/partial/requested/placement events, and 360 isolation.
- Browser: localhost:5444 against the deployed API; actual holdings, fees, fill details and 360 settlement checked. Desktop 1440, tablet approximately 1024 and mobile approximately 390 CSS px; compared shared Accounts header/layout, Graphite and Light checked. No page overflow, one-sided borders or console/CSP errors observed. Temporary viewport/theme restored. No orders or backend data were changed.
- Delivery: local source only; these corrections have not been deployed to Azure. Earlier INV-UI-02 failure remains historical production evidence until a new release is verified.

## Fill-display corrections — deployed, 28 September 2026
Release `investments-fill-display-20260928` / SCM `f9ab66a9-c646-4e35-ba4f-e1e01111f844` is deployed (08:51:08 UTC). The three frontend asset hashes match Azure and localhost:5444; backend remains 2026.09.28-investments-signin. All 38 UI tests pass. Investments and 360 browser checks show the updated labels and truthful unknown states, with SIM excluded from personal wealth, no horizontal overflow and no console errors. See .azure/deployment-plan.md for rollback/hash proof.

Provider acceptance limitation: Saxo SIM sign-in expired since the earlier populated local checks. Both shared API frontends return SAXO_ACCESS_REQUIRED / SAXO_SIGN_IN_REQUIRED, so no fresh fills, prices, fees or order statuses can be verified. Renew sign-in directly from Investments and repeat the read-only reconciliation. No orders were placed or changed during release.

### Saxo connection recheck — 28 September 2026, approximately 11:07 Copenhagen
Dan reported that his existing Codex Azure Investments tab showed Connected. Inspected that exact tab and repeated read-only checks against Azure and localhost:5444: both return status Ok, 2 holdings, 2 Working orders and 10 activity records, with no portfolio/orders/activity errors. This supersedes the earlier sign-in dependency; no further sign-in is required at this observation.
- Confirmed FinalFill/Confirmed records: Vestas order 5040511179, 5 shares at opening price 199 DKK; Siemens order 5040511181, 2 shares at 277.95 EUR. Microsoft 5040511180 and Genmab 5040511178 remain Working. No order mutations.
- Actual deployed browser shows Siemens opening commission 12 EUR, settlement 30 September, and dashes for unreliable current valuation. Cash bridge appears with 999,973.83 EUR booked, -704.89 pending, 999,268.94 after settlement.
- The fresh Azure snapshot reconciles exactly: 999,973.83 + 686.37 - 704.89 = 999,955.31 EUR. The preceding browser observation differed by 0.10 EUR across its provider components. Browser may present the unreconciled notice when provider snapshot components differ. Position reliability remains ApproximatedPrice; individual price/market value/P&L stay unknown. Do not conflate this valuation limitation with a disconnected session.

## Saxo LIVE readiness release acceptance — 28 September 2026

- Deployed the complete current API/frontend/advisor as `2026.09.28-saxo-live-readiness`; SCM deployment `cd42cd29-61b1-4dbc-9b5e-47aff3eaea1b` succeeded and became active at 11:43:50 UTC. Explicit App Service restart followed; an initial startup probe failed, then the replacement instance became healthy at 11:48:25 UTC. Initial timeout checks were rerun successfully after warm-up.
- Package SHA256 `8FAE3B741A0E0DF697BB6E08F745C05E36C3E8BCBA8B9EFFA0884B67657DCFC2`. Rollback `/home/Banking/releases/before-saxo-live-readiness-20260928.zip`, SHA256 `8A72E33CD2678739B4BBAB513F13681AE62E58796FD3F331150C2557060BDD4C`.
- Fresh Linux publish and 149 UI/advisor tests passed. Recent final-source backend evidence: 74 Saxo and 7 public-access/authentication checks passed; not a claim of full backend-suite coverage. No schema/infrastructure/settings/permission changes were applied. Live identity-role query returned no Azure RBAC assignments for the API identity; existing SQL database-managed access was confirmed through successful application reads.
- Azure and localhost:5444 passed expected runtime build, nine asset hashes plus the new `saxo-session.js`, identical shared Demo account identities, and Demo LIVE portfolio/orders denial. Advisor service/configuration, financial context and market history passed on both frontends without generating a model response or editing data.
- Actual SIM reads succeeded through both frontends with no portfolio/order/activity errors: three holdings, one Working order and eleven activity records. Exact dated snapshots remain in `artifacts/investment-release-azure.json` and `artifacts/investment-release-local.json`. No orders were placed, replaced or cancelled. Provider-unavailable current valuations and trade P&L remain unknown.
- Browser verification: Investments rendered actual SIM holdings on both frontends; no console warnings/errors or horizontal overflow at observed widths 888 and 1422 CSS px. Earlier responsive/light/dark fixture acceptance remains recorded separately. Screenshot: `artifacts/saxo-live-readiness-deployed.png`.
- LIVE read-enable setting remains absent (default false); LIVE writes remain server-rejected. Credentials and persistent Saxo sessions/claims were preserved. LIVE registration/terms acceptance, licence scope, real LIVE reconciliation/lifecycle checks and external alert coverage remain pending; this deployment does not complete those external gates.

## Investments portfolio canvas — INV-CANVAS (deployed 28 September 2026; owner results Not run)
- INV-CANVAS-01 · Holdings map: open Investments with a connected Saxo SIM session. Each instrument appears once (lots merged), sized by market value, or by purchase value with the explanatory note when Saxo reports approximated prices. Unknown changes show `—` on neutral tiles; the selected tile has a full outline; tiles stack on a phone. Select tiles by mouse and keyboard; the focus panel follows and survives the 30-second refresh.
- INV-CANVAS-02 · Allocation and orders: Asset type/Currency ring appears only when cash after settlement plus invested reconciles with account value; otherwise the reason is shown. Working orders show Placed → Working/Partially filled → Filled, filled quantity and limit currency, never a fill estimate.
- INV-CANVAS-03 · Market data: before the Saxo market-data release, the focus chart reads "Price history needs the Saxo market-data release", no Today colour option or watchlist prices appear, and only one market-data request is made. The release is deployed; with a valid Saxo market-data session, as Dan, chart source is Saxo LIVE with average-cost line and buy markers; Today colouring and watchlist prices use Saxo previous close. Without the session, Demo shows the sign-in-required/unavailable state.
- INV-CANVAS-04 · Trade drawer (SIM only, do not submit unless an order test is separately authorized): Buy more / Sell open the drawer with the held instrument, Limit + Day, bid/ask when Saxo grants prices, review and receipt wording (Accepted is not Filled). Escape closes and returns focus. LIVE shows the read-only note. Local fixture evidence (synthetic, not Saxo): review, receipt, expired review refresh and interrupted-response status check.


## Combined Markets and Investments browser acceptance — 28 September 2026
- Root verified the deployed localhost:5444 Markets and Investments pages in IAB after reload. Both document widths were 1043 CSS px with no horizontal overflow; the latest 10 console warning/error entries were empty. Markets showed the expected Saxo LIVE sign-in-required state, unknown quote/history values and visible SIM positions. Investments showed four SIM holdings as purchase-value tiles, unknown current valuations, reconciled allocation and zero working orders. No order buttons or prechecks were used. This was a local browser check; Azure page rendering was not separately inspected. Azure runtime and frontend asset parity passed separately.

## Combined Markets and Investments deployment acceptance — 28 September 2026
See [.azure/deployment-plan.md](../.azure/deployment-plan.md) for SCM ID, package and rollback hashes, test evidence, health/runtime parity and provider limitation. Azure and localhost:5444 both serve 2026.09.28-combined-markets-investments; UI/advisor 49/49 and 113/113, frontend-host 18/18, focused MarketTests 2/2. Demo market search currently returns SAXO_MARKET_SIGN_IN_REQUIRED; real quote/chart/source/delay and owner browser acceptance remain pending a fresh owner sign-in. Demo LIVE brokerage routes remain denied. No trades were placed and LIVE trading remains disabled.

## PRES — presentation readiness (12 October 2026; deployment pending; owner results Not run)

Deadline **22 October 2026**, Demo presentation. Current scope, exact checks and evidence: [presentation readiness](presentation-readiness.md). PFA automatic integration is parked; actual statement/format remains a dependency. No production financial edits were made for this batch.

| ID | Production acceptance after authorized deployment | Current engineering evidence |
|---|---|---|
| PRES-01 | Fresh Demo entry → 360 → Accounts → Review/categories → Budgets → Goals. Change a period, navigate back and refresh; verify coherent identity, totals and coverage. | Read-only cloud-preview journey and before/after timings; first 360 fixed-latency median 1387 → 1032 ms. Owner/device rehearsal Not run. |
| PRES-02 | Ask text and voice for Investments fees/activity, goal contribution journey, selected-month budget actuals, pending transaction page and 360 allocation. Compare source dates/currency/status with the pages. Demo must reject private LIVE requests. | Registered schema + actual host/adapter fixtures pass; live model and microphone accuracy Not run. |
| PRES-03 | Pension: choose supported JSON → inspect fields → update existing product → reload. Check duplicate, stale version, malformed/oversized input and optional annual projection. Use manual entry for unsupported PFA formats. | Isolated parser and file-backed browser fixtures pass; no production upload/save. Linux cannot run existing SQL LocalDB persistence fixtures. |
| PRES-04 | Compare Pension with Accounts at desktop/tablet/mobile and dark/light themes. Tab through review form; check focus, empty/error/retry, and single-action header. | 10 isolated browser scenarios, 1440/1024/390, Graphite/Light/Sand, Danish mobile; no overflow/CSP/one-sided borders. |
| PRES-05 | Verify deployed runtime and asset hashes, then repeat SAXO-DELAY and the core Demo rehearsal. Test owner Dan independently. | Azure still reports 2026.09.29-saxo-session-keepalive; this batch and independent delay labels are not deployed. |

## SAXO-DELAY — per-response delay labels (1 October 2026; not deployed; owner results Not run)

- SAXO-DELAY-01: On Markets, Investments and watchlists, compare each displayed chart and price with its own API delay field. Positive N: “Chart · N min delayed” / “Price · N min delayed”; zero: “No reported delay”; absent: “Delay unknown”. Repeat in Danish. A chart and quote with different delays must remain different.
- SAXO-DELAY-02: Refresh data, change listing/range and return to a cached listing. Delay/status/retrieval metadata must update with the corresponding response; late replies must not affect the new selection. Retrieval date/time must be separate from delay.
- SAXO-DELAY-03: Under a safely controlled transient failure, retained data keeps its original delay and retrieval timestamp and says “Update failed · showing previous data”. Chart-only failure must not label a fresh quote failed; quote-only failure must not label fresh history failed. Sign-in/entitlement denial discards affected prior data. Stale quotes are not used for current estimates.
- SAXO-DELAY-04: Compare with Accounts at 1440, 1024 and 390 px in light/dark themes; check wrapping, keyboard navigation, no horizontal overflow/CSP errors, and accessible text labels. LIVE research remains independent of SIM/LIVE trading mode; private LIVE portfolio/order data is not shown in Demo. Do not place trades or change subscriptions to perform acceptance.

Engineering evidence is recorded in docs/saxo-market-data.md. Isolated browser fixtures do not establish owner acceptance or live-provider results. No production failure injection is authorized.


## ANNOTATE / DEMO-REPAIR — 15 October 2026

[Implementation and evidence](demo-repair-2026-10-15.md). The shared synthetic data repair is applied; annotation CSP and synthetic metadata generator changes are source-only, pending deployment. Previous presentation-readiness implementation remains merged and undeployed. Owner/microphone/PFA acceptance is unchanged.

| ID | Steps and expected result | Status / evidence |
|---|---|---|
| ANNOTATE-01 | In the actual Codex browser, enable annotation on Azure; overlay covers the viewport, selection/cursor work and normal page interaction resumes when closed. | Pending authorized deployment and actual Codex acceptance. Source-derived Chromium: 12 scenarios at 1440/1024/390 px pass. |
| ANNOTATE-02 | Main frontend-host and Azure main CSP retain the old stylesheet hash and permit only three verified current stylesheet hashes; unrelated inline style/script/handlers remain blocked. | Source parity, middleware and transport tests pass; old deployed policy verified unchanged. |
| ANNOTATE-03 | Demo cannot read Dan/Live accounts after the CSP update; advisor/artifact/frame/script boundaries remain unchanged. | Isolated middleware and existing transport authorization checks; live Demo-to-Live read must return 403. |
| DEMO-REPAIR-01 | Dry-run in a fresh Demo-only session; require one active product-demo connection and only synthetic accounts/rows. Changed/tampered plans, conflicts, disabled rules or ambiguous transfers stop safely. | 13 isolated Python protocol tests pass. No Dan/SQL/reset/sync path. |
| DEMO-REPAIR-02 | Inspect October Summary/360: income 53,000 DKK, expenses 27,897 DKK, uncategorized 64 DKK; five internal pairs (30,800 DKK) excluded from both sides. | Applied and ledger/API verified 15 October. Two intentional 32 DKK coffee examples remain. |
| DEMO-REPAIR-03 | September income 53,225 DKK, expenses 39,876 DKK. Preserve two manually cleared 850 DKK categories; exclude the two unmatched savings pairs. | Applied and ledger/API verified. The 1,700 DKK remaining uncategorized is preserved manual input. |
| DEMO-REPAIR-04 | Compare Summary, Accounts, cash flow, all categories, budget links/actuals, savings, balances and goal journeys over relevant periods; repeat repair produces no financial writes. | 40 periods, five accounts, four budget/month combinations and three journeys reconcile; full second apply is a no-op. |
| DEMO-REPAIR-05 | Inspect deployed corrected Demo 360 spending-by-category, Accounts, Budgets, Goals and Review at 1440/1024/390 px with dark/light themes and Danish mobile. No financial writes during browser acceptance. | PASS: 24 live screenshots; no financial writes, overflow, page errors or CSP violations. Runtime receipt in `artifacts/demo-repair/browser/`; owner/presentation-device acceptance remains separate. |
