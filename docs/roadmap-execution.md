# Roadmap execution — 13 September 2026

Dan requested implementing remaining roadmap items from top to bottom while away, with explicit transitions and continuous progress. This authorizes local implementation and verification of the requested features. Existing provider authorization remains in scope; new provider terms, paid subscriptions, new financial-data recipients and deployment changes need a concrete approved scope.

## Current position

The original ordered pass is complete for locally feasible work. See the reconciled feature statuses in roadmap.md and the final verification section below. Saxo authentication, Pensure access, terminal/feed selection and later deployment remain explicit dependencies. AI-14/15 were added as new backlog items, not implemented in this pass.

## Ordered progress

- AZ-01–03: previously deployed; preserve production and migration history.
- AZ-04: previously deployed and technically verified. Dan confirmed the deployed site works in the conversation. Owner-only bank consent and physical-device checks cannot be impersonated.
- AI-01: implemented locally. Cash Flow, Spending Mix and Goal Journey open the shared advisor with a contextual question in the composer. Browser verified all three actions and the correct goal draft; no automatic paid submission.
- AI-02/03: existing local implementation revalidated with all 35 prior Node tests. Preserve prior real voice/WebRTC and hosted-sandbox evidence. No new physical microphone check or deployment claimed. Hosted execution results persist locally after download; a server restart during a run still requires reconciliation, not blind resubmission.
- AI-04: trusted `calculate_banking_scenario` uses saved budget totals and a saved goal's recorded balance/schedule. Tests cover arithmetic, dates, missing/cross-currency data, deficits and no mutation. Real UI/provider returned baseline available 2,802.74 DKK unchanged after expense -2,000 and savings +2,000; Summer house 5,000/month to 7,000/month moved Dec 2043 to Jan 2039. Balance was stale and explicitly labelled hypothetical. Follow-up separated balanceRecordedAt from projectionFrom after the model confused these dates; that final wording correction still needs provider recheck.
- AI-05: persistent daily local-service limits across workspaces (100 questions, 12 voice starts, 10 analyses), retry deduplication and UTC reset. Counts visible in chat-history usage details. These are request caps, not billed cost; production activation still needs hosted identity/quota integration. Tests cover restart persistence semantics and caps.
- AI-06: existing isolated generative renderer, themes, saved revisions and hosted artifact retrieval passed existing checks. Preserve the approved visual UI.
- AI-07: staged new budgets/entry edits, before/after monthly totals, explicit Save button or voice approval for a pending proposal, workspace-owned stored payload, existing Banking Save concurrency/idempotency. Transaction-derived suggestions use the existing suggestions endpoint. 41 tests pass including staging without writes, confirmation, foreign-scope rejection, replay and untouched-entry preservation. UI/save test pending.
- AI-08–13, DEBT-01, INV-01–02, PEN-01–02, MKT-01–02: remaining, in that order. AI-12 already implemented; reassess rather than recreate.

## Continuation

A 30-minute thread heartbeat continues this task if it becomes idle. It must resume this log, avoid duplicate work, and pause when all feasible work is complete and remaining items have concrete external blockers.

Automation ID: `continue-banking-roadmap`. Earlier checkpoint details below are historical. Current runtime and verification are recorded in the final section. Node loads the existing root .env internally; never print it. Local code changes are not deployed.

## Guardrails and evidence

Use local Demo for mutation and paid AI checks. Preserve Dan's renamed accounts, budgets and chat history. Production remains the sole bank sync worker. Browser verification uses the existing local app. Completed work is distinct from automated checks, physical microphone acceptance, deployment and provider access.

## AI-07–13 completed local pass

- AI-07: real provider/UI staged a separate QA budget with salary 10,000/month and Internet 1,200/quarter (400/month), then saved through confirmation. Existing active Family plan unchanged. QA budget removed afterwards through the app. Fixed native confirmations with themed centered dialogs when browser automation exposed the old popup problem.
- AI-08: verified actual spending 39,060 vs 37,579, delta 1,481 DKK. Source button opened Accounts with 14 July–13 August dates; restored one-month filter. Added explicit instruction against invented markdown links.
- AI-09: signed Review proposals, explicit approval, preserved manual decisions and no blind retries after uncertain writes. Unit/integration tests pass; full live-provider Review acceptance still pending.
- AI-10: Overview shows at most two record-backed attention buttons; observed increased uncategorized spend and eight Review items. Opens a draft, not an automatic paid request.
- AI-11: authenticated Demo/Live-separated local memory. Browser verified add/edit/remove of a temporary priority; no test memory remains.
- AI-12: retained existing persistent voice implementation; no new physical microphone test.
- AI-13: verified 390px compact mobile launcher, opening full chat and minimizing back. Desktop viewport restored.

## DEBT-01

Implemented local manual loans and separate scenarios, nominal fixed-rate monthly amortization, itemized fees, date/term and rate comparisons. Three backend tests passed covering monetary reconciliation, zero-rate/final-payment rounding, no preview writes, workspace isolation and concurrency. Browser saved a synthetic Demo scenario "House purchase · example": principal 1,000,000 DKK, 4%, 360 months, 25 monthly fee, 1,000 upfront fee. Monthly 4,799.15; at 5%, 5,393.22, difference 594.07. Actual debt remains zero. No Live loan created. Additive LoanPlanning migration applied locally; not deployed.

## Historical checkpoint — before the authorized Trader inspection

INV-01 in progress. No Saxo/Pensure credential keys found in Banking's existing local configuration (values never printed). Preparing SIM-only read adapter; real provider validation requires Dan's developer credentials and consent. API PID 26696, Node PID 18008; verify before stopping. CUA roadmapUI is tab 11; tabs 8/10 are stalled by old native confirmation and should not be reused. Local changes only.

## Added while the ordered pass was running

Dan requested roadmap additions, not immediate implementation, for AI-14 (visual connected memory graph, including explicit user and AI-stored memories, own left navigation entry) and AI-15 (saved analysis library and proactive suggested-analysis cards, in the same navigation section). Added as backlog. Proposed section name is AI workspace, not a confirmed naming decision. AI-generated memory capture is not silently enabled by these backlog additions.

## Final integration and verification — 13 September

- Original AI-01–12 local capabilities are implemented/revalidated. AI-13 has the compact mobile launcher; its dedicated mobile design remains a follow-up.
- Hosted analysis now persists the downloaded result before cleanup and can reconcile an interrupted original session after restart. No automatic paid prompt resubmission. Recovery tests verify original-turn selection and a single saved revision.
- DEBT-01, INV-02 and PEN-02 local workflows are implemented. INV-01 has protected local SIM OAuth and balance/position reading prepared; successful authentication remains a prerequisite for further provider scope. MKT-02 has a functional native watchlist; it is not a quote terminal.
- Pensure JSON preview was exercised through the browser with a synthetic file: one valid 42,000 DKK value, one skipped record, masked reference, no insurance amounts added, and no automatic save. Review opened the populated form, then closed without saving.
- Browser saved a synthetic PFA statement at 500,000 DKK and edited it to 510,000 DKK without duplication. Its 120,000 DKK annual projection at age 70 stayed separate. Recorded wealth was 958,022 DKK including 448,022 DKK booked bank cash. The 1,000,000 DKK house scenario remained excluded from actual debt.
- A real advisor question through Overview returned these exact saved figures and the scenario's 4,799.15 DKK monthly payment. Review required a read followed by a staging request; it then displayed a Fuel station -850 DKK → Transport confirmation card. That proposal remains unapplied. The current router performs one tool per conversational turn, not an autonomous multi-tool loop.
- Full backend suite: 89 passed. Full advisor suite: 48 passed on the final run. One prior full run had one unreproduced failure; no claim about its cause. Logs: artifacts/roadmap-backend-tests.log and artifacts/roadmap-node-tests.log.
- Browser inspected Graphite/Light, desktop plus 390px and 900px layout states, centered forms, statement updates, import review, market watchlist save, and advisor responses. Original Graphite theme and normal viewport restored after testing. No new physical microphone acceptance claimed.
- Current local API PID: 30492; Node advisor PID: 55944. Verify executable paths before stopping. API runs with Local:DisableWorker=true, EnableBanking:Enabled=false and Local:AdvisorEnabled=true. All additive migrations apply locally; no Azure migration/deployment occurred.
- CUA roadmapUI is tab 11. Earlier tabs 8/10 were stalled by native confirmation dialogs; the shared app confirmations were replaced with centered dialogs during this pass. Do not reuse those old tabs.
- See wealth-integrations.md for provider sources, exact external blockers and completed workflows. The continuation heartbeat is paused once this pass is handed off; no repeated unchanged-status notifications are needed.
