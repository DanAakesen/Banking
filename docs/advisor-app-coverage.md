# Advisor app coverage — 18 September 2026

## Local revalidation — 22 September 2026

### Prompt-owned activity lists

### Voice grounding repair — 22 September 2026

An empty `clarify.question` was returned unchanged to text/voice, leaving the voice model without a verified answer. That path now summarizes authenticated Banking context, returns the data as `read_banking_data`, and fails explicitly if no answer is produced. Voice delivery rejects an empty verified answer instead of falling through to scenario/fixture text. Instructions require current tool evidence and preserve amounts, currency, balance type and observation dates; previous assistant figures are not evidence.

AdvisorDataService now exposes available balances alongside booked balances. Actual browser/model verification returned 326,400 DKK savings and 75,388 DKK available on Lønkonto (75,563 DKK booked), with the 12 September observation date. This matches the UI figures. The Node suite passed 91 tests, then the additional empty-voice-result regression passed with all nine voice UI tests. Backend build passed; the Advisor-filter suite passed 10 and failed two DemoAdvisorCoverage fixture expectations (WealthRecords expected 3, actual 2), before their context assertions. No deployment. Spoken delivery must be rechecked with the owner; successful text/data verification is not microphone acceptance. Restarting the local backend reset the browser's local session; Demo was reopened.

Each user message now owns its tool steps, displayed directly after that prompt and before the answer. Completed lists stay collapsed independently; the current list opens during tool work. Active icons pulse, completed icons stop, and reduced-motion preferences disable the pulse. Text replies and voice transcripts close the current list before rendering. The existing 87 advisor tests and three new lifecycle tests pass. Browser verification covered two consecutive questions, separate open/closed states, computed animation state and prompt/activity/reply ordering.

Owner confirmed microphone input and spoken answers for savings and salary-account questions. This confirms interaction, not numerical accuracy: the inspected earlier voice transcript stated 184,000 DKK savings and 32,500 DKK salary-account balance, unlike the verified workspace figures. A subsequent text read returned 75,563 DKK booked salary balance. Investigate voice grounding separately before claiming financial-answer acceptance. One text clarification also rendered an empty reply during this check.

Banking and the advisor were restarted locally with the bank worker disabled. Manual pension name editing now saved and survived reload; the original name was restored through the same form. The earlier REQUEST_FAILED did not reproduce, so its cause is still unknown and no production fix is claimed.

The activity-panel listener exposed an outdated DOM stub in the chat-scroll tests. The stub now supports summary listener registration. The full advisor suite passes 87 tests; nine 360/budget calculation tests pass; five wealth backend tests pass using the existing 18 September test build.

Owner reconnected Saxo SIM. The actual advisor read matched Markets: account value and available cash 999,973.83 EUR, zero positions and zero open orders. No orders were placed. Activity stayed expanded during the read and collapsed afterward.

Browser inspection covered phone/tablet Overview, Accounts, Budgets, Goals, Review and Markets, plus desktop Overview/Budgets. No horizontal document overflow was observed in the checked layouts; tablet Markets retained the left watchlist. This is a representative layout pass, not exhaustive breakpoint acceptance. Viewport override was reset. Microphone interaction remains awaiting owner verification. No Azure changes or deployment.

Owner approved adding the missing app data/tools identified in the local audit. Implemented locally; no Azure deployment.

## Read tools
`read_app_data` is an allowlisted adapter to authenticated Banking APIs, not a generic HTTP tool. It supports Saxo account snapshots (funds, positions and P/L), SIM order status, market search/charts, bank balance history, transaction detail, wealth history, budget forecast, upcoming estimates, cash flow, trends, goals, loans, statements, watchlists, categories, rules and Review history. Demo cannot request LIVE Saxo. Provider access failures stay visible; no replacement holdings or values are generated.

Budget forecast uses the same exported calculation as the UI. Investment interpolation and pension period calculation also reuse the UI functions. No new forecast formula or financial history is fabricated. Explicit query periods override section selections. Upcoming estimates default to today in Copenhagen.

## Edits
`propose_app_change` stages create/update/delete operations for goals, loans, wealth statements, watchlist records, categories and rules. It fetches existing records within the authenticated workspace, preserves unspecified editable fields and the original version, and displays before/after values before confirmation. Account display-name updates also use staged proposals, preserving the server-read savings flag and version; creating or deleting accounts is not allowed. Existing budget and Review proposals remain supported. Save calls reuse normal application validation and concurrency checks. Applied proposals are idempotent; an uncertain write is marked checking and cannot be blindly replayed. No bank connection, transfer, payment or trade execution tool was added.

## Context and multi-step research
Overview sends separate cash-flow, wealth and budget periods; Markets sends instrument, range and environment. Text and voice carry these selections as untrusted UI context, never authorization. Read research can request follow-up data for up to three rounds/eight queries, deduplicates identical queries, and cannot run write tools during research.

## Verification
85 advisor tests passed, including existing text/voice flows and new resource routing, preserved edits, foreign IDs, missing fields, confirmation, workspace isolation and uncertain-write tests. Two outdated UI test harnesses were updated for existing localization imports/DOM methods.

Local browser: actual model + API confirmed September budget forecast and independently selected three-month wealth period with matching chart figures. Saxo returned access/login required after the local host restart; successful authenticated Saxo reads require reconnecting SIM. No holdings, orders, goals or budgets were modified during browser checks.

Browser verification also completed market search and a one-month NOVO-B.CO chart read. A goal rename produced a pending before/after review card without saving. The UI comparison excludes read-only fields from updates, so metadata is not falsely shown as removed. Nine existing budget/360 calculation tests also passed. Microphone interaction was not manually exercised; voice routing was covered by automated tests.

## Review-card and save verification — 18 September 2026
Account renaming is now an update-only `accounts/customName` proposal. The adapter preserves the freshly read savings flag and concurrency version; bank identity, balances and account creation/deletion are outside this tool. Human-readable field labels, localized action titles and deterministic proposal introductions support Danish and English. Changed account/category references resolve to workspace names. Raw JSON quotes and read-only metadata are omitted from the change rows.

Browser verification against local Demo and the actual model: saved and reloaded changes for accounts, goals, loans, pension statements, watchlists, categories, rules and budget names. All test names/matching text were restored. A pending transaction was categorised as Tøj through a review card; the saved action appeared after navigation to Review history and was undone there (history confirms Fortrudt). No real bank records, trades or production deployment were involved.

Two discovered chat defects were repaired: explicit edits can look up a record then stage a review card without allowing automatic writes; existing budgets can be renamed with an empty entry patch, preserving all entries/totals. 87 advisor tests pass with test concurrency 1. A parallel run hit an automatic-memory timing assertion; its isolated rerun and the serial suite passed.

Separate observation: the pension page's manual edit form returned REQUEST_FAILED during restoration. Chat restoration succeeded and the page confirmed the original name. That manual-form failure is not diagnosed by this advisor change. Voice tool paths remain covered by automated tests; no microphone session was performed.

### Voice figure verification — 26 September 2026

Root cause of the earlier wrong spoken amounts (184,000 DKK savings, 32,500 DKK salary balance, versus the verified 326,400 / 75,388 DKK): those figures exist nowhere in code or data. The live voice model invented or recalled them itself. It speaks independently of the backend, and previous conversation (including unverified figures) was sent to it as context. Prompt instructions alone did not prevent this.

Changes, local only:
- **Answer drafts are checked:** every monetary amount in a drafted answer (text and voice) must match the supplied records. Matches allow exact values, spoken rounding with at least two significant digits, monthly equivalents (÷/× 3, 6, 12) and sums/differences of two recorded figures; user-stated amounts count as evidence. If anything is unmatched, the drafter gets one corrective retry. Any figures still unmatched are returned as `unverifiedFigures`, shown in chat and passed to voice with an instruction to say they are unverified.
- **Spoken words are checked:** after each utterance, voice compares the live model's transcript with all verified answers in the call. Unmatched amounts are marked in the chat bubble ("Not verified against your Banking data: …") and trigger one spoken correction that tells the user not to rely on the figure.
- **Old amounts are removed:** conversation history sent to the voice model has amounts replaced by `[amount]`, so earlier unverified numbers cannot be repeated.
- **Delivery is stricter:** verified answers must be spoken with exact amounts and currency, without rounding, estimating or converting.
- **Parsing:** English and Danish formats (326,400 / 326.400 kr. / 1,5 mio. / 184 tusind), and Danish number words through the existing transcript normalizer. Years, times, percentages and masked identifiers are ignored.

Validation: 122 Node tests pass, including new figure parsing/grounding tests (`figures.test.mjs`), the server's corrective retry and disclosure, and voice-side flagging, one-time correction, stricter delivery and redaction. Not verified: a real spoken session with the microphone. A human must still confirm spoken financial answers match the screen.