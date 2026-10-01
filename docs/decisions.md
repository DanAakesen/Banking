# Banking — decisions

## D-AUTO-MERGE — confirmed 1 October 2026

Dan explicitly requires cloud implementation jobs to review and run appropriate required validation, then commit, push and merge into `main` autonomously without another approval. This supersedes earlier approval-before-merge guidance. Preserve other work, fetch current refs, check deployment triggers, and respect required checks and branch protection. Never force-push or bypass protection. Failed/unavailable required checks, denied permissions and product conflicts remain blockers. When PR APIs are unavailable, ordinary non-forced Git merge/push is permitted where direct updates are allowed and checked automation does not deploy. Production deployment and production mutations remain separately authorized and are not implied by merging.

## D-SAXO-RESPONSE-DELAY — confirmed 1 October 2026

Dan authorized independent per-response feed-delay labels across Markets, Investments and watchlists. Charts use `ChartDelayMinutes`; prices use `QuoteDelayMinutes` (broker portfolio prices retain their own `priceDelayMinutes`). Positive values read “Chart · N min delayed” or “Price · N min delayed”; zero reads “No reported delay”; missing, invalid or negative reads “Delay unknown”. Apply equivalent Danish copy. Never infer a universal 15-minute delay, real-time or executable prices, or feed delay from retrieval age or legacy prose.

Data, delay, part status and retrieval timestamps form one response snapshot. Retained history keeps `HistoryRetrievedAt`; quote retrieval uses its matching `RetrievedAt`. A transient refresh retaining data reads “Update failed · showing previous data”, independently for chart and price. Authorization/entitlement failures discard affected data. Instrument/range changes and obsolete responses must not transfer metadata to another display. Retrieval timestamps are labelled separately from feed delay. Saxo LIVE remains the research feed in both trading modes and allowed Demo market views; private LIVE portfolio/orders stay separate. No subscription, capability upgrade, trading or deployment is authorized by this feature.

## D-CLOUD-DEV — confirmed 1 October 2026

Dan clarified on 1 October 2026 that GitHub, not a particular agent environment, is the single source of truth. Private `DanAakesen/Banking` is authoritative for every agent/provider, including GitHub Copilot and Codex. All implementation, builds, tests and previews must use cloud-hosted compute connected to this repository. Codex must always use the Banking Codex Cloud environment (`6abdf572b9088191946caf44f7500f06`) mapped to `DanAakesen/Banking`. GitHub Copilot must use GitHub Copilot cloud agent and its GitHub Actions-powered development environment for this repository. Other providers must use their own cloud-hosted agent environment connected to this repository. Local clients may only coordinate or submit work to the required cloud agent. Local IDE agent mode, local CLI implementation and local app execution are prohibited. If the required cloud environment is unavailable, report the blocker; do not substitute local execution or another environment. Read the current repo rules and refresh the relevant GitHub branch before work. Commit and push completed task changes, normally through a task branch and reviewable PR. Unpushed changes and environment snapshots are not delivered work. Local clients may only coordinate or submit work to the required cloud agent; local implementation/runtime is prohibited. Lack of cloud/GitHub access is a blocker, not permission to fall back locally. Preserve the shared production API architecture and separate authorization for deployment, production writes and PR merges. See [cloud development](cloud-development.md) for the workflow and independently verified Codex environment.

## D-SHARED-API — confirmed 27 September 2026

Dan clarified and confirmed: one app running locally or on Azure, both using the same deployed production API; no local app database or direct SQL access. Production owns business logic, advisor execution, integrations and scheduling. Dan's owner-only real data and one persistent shared fictional Demo financial dataset remain separate. UI changes remain local until deployment, while data changes are shared. This supersedes local-backend-as-normal-development and session-cloned Demo financial-copy requirements. Private conversations, secrets and real-provider accounts are not made public by sharing Demo financial records.

Evidence: Dan's explicit correction, "one app that runs locally and on azure, to use the same deployed backend", followed by "exactly! Create a plan" and the request to reflect the decision in repo instructions. Implementation was then authorized with GPT-6 Luna at Max effort while Dan edits loading/page UI concurrently. [Plan](shared-production-backend-plan.md), [execution evidence](shared-backend-execution.md). Deployment and database deletion remain outside this authorization. Preserve the separate confirmed Demo Saxo SIM access decision below; sharing fictional finances does not expose LIVE accounts or credentials.

- Confirmed 17 September 2026: Dan is the only real user; all other visitors are Demo users. AI must use the current workspace's full saved financial context in both text and voice. New hosted Demo sessions receive isolated synthetic data, including loan, investment, pension and watchlist examples. No additional real-user registration is required. See `demo-advisor-coverage.md`. This is local implementation authorization, not deployment approval.

- Confirmed 8 September 2026: Dan approved Budget concept 1 for implementation and supporting Demo refinement. Keep its hero height equal to Overview and Accounts. Implement four actual-versus-budget metrics, manual entry editor and category comparisons. Actual savings use explicitly linked accounts and net matched contributions; no automatic goal funding or bank writes. See `budget-studio.md` for implementation semantics, current-plan historical comparisons and local evidence.

All decisions below were recorded on 2026-09-07. The source is Dan's instructions in the Banking design conversation; technical proposals are marked separately. No decision is Azure/deployment approval.

| ID | Status | Decision | Rationale and evidence |
|---|---|---|---|
| D01 | Confirmed requirement | Personal, non-commercial, single user; own accounts | Original project brief |
| D02 | Confirmed requirement | Azure-native, subscription Dan Aakesen, account Dan@novaro.dk; no Vercel/Convex | Original project brief |
| D03 | Confirmed requirement | Enable Banking first, private Danske Bank account; provider-neutral contract | Original project brief |
| D04 | Confirmed requirement | AIS only; no payments, transfers, or MitID information in Banking | Original project brief |
| D05 | Confirmed requirement | Immediate import, owned durable history, categories, rules, budgets, and balance snapshots | Original project brief |
| D06 | Confirmed requirement | Key Vault in Azure, Managed Identity, least privilege, Dan only, and no sensitive logs | Original project brief |
| D07 | Confirmed decision | VNet, Private Endpoints, and Private DNS removed from the baseline and price; optional item only after the plan | Dan's instruction (translated from Danish): "Remove this" and "optional to-do item after the project plan" |
| D08 | Confirmed decision | Entire MVP locally first; Azure resources and deployment only at the very end, after explicit approval | Dan's latest instruction (translated from Danish): "Only after the entire MVP works locally" and "I must approve" |
| D09 | Proposed technical design | Container Apps/Jobs, Azure SQL Basic, Storage Queue/Blob, Key Vault, Entra, ACR, and Monitor | Earlier architecture proposal; mapped to local components first |
| D10 | Proposed region choice | West Europe | Earlier proposal; service availability and owner's region choice to be resolved before release |
| D11 | Proposed starting value | Background sync every six hours, subject to bank-specific limits | Dated Enable Banking documentation; not a universal bank limit |
| D12 | Proposed MVP scope | One Danske Bank connection, history, categorization, budgets, stable sync/reconnection, and local restore; more banks and MCP later | Combines earlier phases 1–3 into one complete local MVP; see PRODUCT.md |
| D13 | Confirmed decision | Project content stays in English; assistant replies follow the language of Dan's current message, including switches | Dan's clarification (translated from Danish): "Just reply in the same language as I write" |
| D14 | Confirmed decision | Complete and verify the local MVP backend first; then design the frontend collaboratively with Dan and obtain his design approval before product UI implementation | Dan wants to collaborate on frontend design before it is built, and complete the backend before discussing presentation |
| D15 | Implemented technical choice | C#/.NET 10, ASP.NET Core, EF Core, SQL Server LocalDB, SQL-backed jobs, and Windows DPAPI; x64 execution on this machine | Chosen during Dan-authorized local backend implementation; uses installed local dependencies and a SQL dialect compatible with the future Azure design |
| D16 | Implemented technical boundary | Simulator enabled by default; live provider disabled, with separate live database and approval/protection prerequisites | Makes local testing independent of external registration and prevents mixing synthetic and real figures |
| D17 | Confirmed MVP requirement | Live/Demo workspace switching, presented as the Dan/Demo account selector under D25; all functions work against fully isolated demo data. Create the final demo dataset only after understanding the actual data shape and scenarios | Product demo backend is now implemented after live import: three fictional accounts with independent history, categories/rules/budgets. UI switching and full product acceptance await frontend design/implementation |
| D18 | Confirmed operating instruction | Complete all backend/integration work autonomously; stop only for concrete required Dan input or the collaborative UI design stage. Always give status and next steps | Dan's latest instruction after the initial implementation handoff. Azure/deployment approval remains separate and mandatory |
| D19 | Implemented recovery design | Portable passphrase-encrypted recovery keeps finance history and user edits, strips bank access secrets and forces reconnection | Tested with a different Data Protection key ring; no portability dependency on the original Windows profile |
| D20 | Confirmed account correction | Enable Banking login uses danaakesen@gmail.com in Chrome with the Dan profile. Dan enters any requested password directly in the browser | Dan's explicit correction during onboarding. Azure account and production UI identity remain Dan@novaro.dk under the original scope |
| D21 | Verified integration configuration | Banking is registered as production AIS, active and restricted to three owner-linked Danske Bank accounts; local callback uses https://localhost:5443/api/auth/callback/live | Portal registration, signed metadata, MitID callback, and first import verified. Three DKK accounts, 2,905 transactions, and six snapshots retained after local restart |
| D22 | Implemented identity/recovery correction | Shared alternative hashes do not establish account identity; primary conflicts still stop reconciliation. Persist successful bank sessions encrypted before local reconciliation and provide idempotent authenticated retry | Live callback exposed one alternative shared by three distinct accounts. Signed session recovery avoided repeating MitID; synthetic tests cover conflicts, replay, and recovery scope |
| D23 | Implemented product demo | Use the separate Banking_Demo database and entirely fictional data after observing live schema; retain the earlier Banking_Local engineering database | Product demo has 3 accounts / 628 entries / 8 categories, rules and budgets on 2026-09-07. No copied live descriptions, identifiers, names, balances, or amounts. Initialization rejects existing data; reset UX remains undecided |
| D24 | Confirmed product requirement | Suggest budgets automatically from transactions, then allow manual adjustment; preserve manual decisions during sync and regenerated suggestions | Dan requested auto budgets followed by manual adjustment. Implemented named-plan suggestions use completed-month averages by description/sign, explicit review, merge/new choice and a separate Save; see budget-redesign.md |
| D25 | Confirmed design correction | Replace the separate Live/Demo toggle with an account selector labeled Dan or Demo | Dan selects the live workspace; Demo selects isolated synthetic data. Same authenticated owner; no expansion to multi-user access |
| D26 | Confirmed design decision | Graphite (first/darkest candidate) is the approved dark target; Settings offers five preset themes, with custom themes later | Light and Graphite are approved; three other palettes remain to be designed. Theme preference is independent of workspace |

## Local frontend approval and implementation

Confirmed owner approval: "The periods should be 1 dropdown, and the demo up top should not be there otherwise ok for now. We can iterate on them when they are done. Proceed." Implement one period dropdown (Custom-only dates); remove the top account selector and keep Dan/Demo selection in navigation. The reviewed Settings/mobile goal/budget layouts are approved for local implementation and later iteration.

Implemented technical choice: native JavaScript modules, HTML and shared CSS served by existing ASP.NET Core. No added frontend framework or external assets. Browser sessions use one-time local launch tickets, HTTPS-only protected HttpOnly cookies, same-origin checks and a required client header; bearer API credentials stay outside the browser. Five themes and Danish/English preferences persist locally without storing bank data.

43 backend tests and 14 real Chrome checks pass. Dan's product goal/budget creation acceptance remains; no product records were seeded or removed. This is not Azure/deployment approval.

## Latest owner clarifications

- Confirmed budget follow-up: Dan accepted the revised concept with Income/Expense entry types and four monthly summary figures. He explicitly confirmed savings as Expense entries marked Savings. Available to spend / Rådighedsbeløb = income − other expenses − planned savings. The ordinary-expense summary excludes savings to prevent double subtraction. Planned budget allocations stay separate from actual bank cash flow. See budget-redesign.md; implemented locally after Dan said 'Build it'.
- Confirmed 7 September 2026: budgets are named plans containing named recurring amount entries (month/3 months/6 months/year), not individual category-period limits. Default to manual creation; transaction generation offers reviewed merge into an existing plan or creation of another plan. Support multiple budgets and an active state so budget metrics know which plan to use. Comparison and budget-change projections are future scope. See budget-redesign.md for implemented activation and additive migration details. Actual-spend mapping and projections remain later work.
- Confirmed 7 September 2026: Dan approved the Review concept and requested implementation. Review replaces Activity navigation; Accounts remains the ledger. Implemented MVP covers missing categories and unambiguous internal-transfer candidates, optional future rules, bulk categorisation, 24-hour snooze, dismissal and guarded Undo. These are app-owned changes, not bank writes or bank-balance reconciliation. Duplicate/refund detection remains deferred. No cloud or actual AI scope was added.
- Confirmed: proceed with the proposed local build sequence and remote/mobile screenshot reviews. Keep the established backend-before-frontend and explicit Azure/deployment approval boundaries.
- Confirmed: actual AI waits. This local MVP iteration includes honest disconnected advisor placeholders only; no model calls, provider setup or financial data sharing.
- Confirmed: Settings is its own page with a new left navigation, middle content and a Back button returning to Overview. The five-theme picker belongs there. Mobile support is mandatory.
- Confirmed: Dan creates goals/budgets himself through the UI in Dan and Demo. Implement workflows, not owner records. New Demo initialization no longer seeds budgets. Existing seeded demo budgets remain untouched; no deletion is authorized.
- V1 implementation conventions, open to visual/product review: budget previews average gross categorized booked debits over three completed months by default (1–12 selectable), show credits separately, and never save themselves. Goals use latest booked balances; an explicit baseline/deadline enables linear pace with a seven-day contribution allowance for At risk. Missing/stale/mixed-currency data never yields invented progress. Monthly-payment estimation is conservative exact-description pattern matching, not bank scheduling.

## Design target approval

Goal account rule, 8 September 2026 — confirmed owner correction, superseding the 7 September shared/all-account design: one goal requires one dedicated account; an account can belong to only one goal. Keep name, description, notes, reference links, target, optional deadline and explicit savings-pace baseline. Progress measures the latest booked balance on that account. No combined-all-account goals, shared balances or real-account creation by Banking. Existing incompatible goals require explicit reassignment and show unknown progress until resolved. Implemented locally; Demo reassignment is explicit and wholly synthetic.

Design approval, 7 September 2026: the owner approved the v3 light Overview as the target, except From/To inputs must appear only under Custom. The owner selected Graphite, the first/darkest dark candidate, as the dark target. Both images are subject to D25 account-selector labels; Settings contains the five-theme picker from D26. Canonical target records live in docs/design-targets/README.md and DESIGN.md. This request updates product/design records and target assets, not frontend execution or deployment.

## Superseded

- The cloud-first sequence and Azure as a development prerequisite are superseded by D08.
- Building the web app alongside the initial backend foundation is superseded by D14. Existing screen proposals are not frontend design approval; the full MVP still includes a locally verified frontend.
- Private networking in the baseline and the earlier budget of DKK 350/month excluding VAT are superseded by D07. The revised preliminary estimate is DKK 80–150/month excluding VAT, not a quote.

## Unresolved

- The initial live import is verified. Future six-hour refresh, actual bank revocation/expiry, and comparison against the bank UI remain follow-up acceptance checks. See local-backend.md.
- Actual bank-specific quotas/reference quality and later cross-provider identity migration remain unverified. Portable encrypted recovery is implemented; ambiguous booked corrections now fail visibly without publishing duplicates. See local-backend.md.
- Initial history starts 2024-09-09; returned consent expiry is 2027-03-06 12:29:27 UTC. Broader bank data-quality and quota assumptions remain subject to observation.
- Final Azure network access without VNet: limited service firewall and egress properties must be tested; no broad Azure firewall exception as an automatic solution.
- OAuth/ChatGPT compatibility and data-sharing scope before the MCP release.
- There is **no** recorded Azure or deployment approval.

## Overnight refinement authorization

Confirmed 7 September 2026: Dan authorized completing a quality pass, then searching online for exceptional UI/chart references and replacing basic components with stronger visuals. This authorizes local refinement without another image approval round. Existing workflows and financial semantics remain binding. No Azure, deployment, external exposure or actual AI scope was added. A thread heartbeat continues only unfinished authorized work and is paused on completion.

Implemented: native JavaScript/SVG components and shared theme-aware CSS. No React migration or externally hosted rendering. A new read-only aggregate supplies daily cash-flow data, bounded by the existing date-range guard. Data/graph definitions and source links are in DESIGN.md and overnight-quality-ui.md.

## 8 September 2026 — local entry flow

Confirmed by Dan: build Try Demo without login and Sign in as Dan on the same site, keeping real data protected. This supersedes the earlier requirement that Demo always use the same authenticated owner. Multi-user registration and deployment remain deferred.

Implementation choice: a single local owner password, set by Dan from an existing trusted owner session, enables normal browser sign-in without new cloud registrations. Password setup remains an owner action. Demo uses the existing shared synthetic local database and supports edits there; it is not a separate dataset per visitor. Public network exposure remains unapproved.

Confirmed navigation decision, 8 September 2026: whole account row opens the utility list; Settings/Connections leave primary navigation, and Sign out returns to the Dan/Demo welcome screen. Style every dropdown option list consistently, including form rows and dialogs.

## 8 September 2026 — panoramic Overview

Confirmed: Dan selected the first of the two revised images (exec-46d3a4d5-8960-4fe1-8571-1abdf3e04e41.png), asked to build it, and requested three time-dependent welcome greetings/backgrounds while retaining all themes. He explicitly allowed Demo refinement. The implementation and exact one-time Demo changes are recorded in DESIGN.md. The second revised image was not selected. Actual AI and Azure/deployment remain outside this authorization.

## 8 September 2026 — Accounts option 2

Confirmed: “Build number 2 now” refers to the second displayed image, exec-e2764f0c-ebea-4c20-bd58-70c6d49b7273.png, saved as docs/design-targets/accounts-atlas.png. Implement the account-explorer composition in the existing local app, preserving its real API workflows and five themes. This supersedes the earlier Accounts right-side insight-card layout. It does not authorize AI, cloud deployment, new bank connections, or data seeding.


## 9 September 2026 — Goals option 1 and evidence-backed Demo journeys

Confirmed: Dan selected the first displayed Goals image, `exec-8072d351-1e67-4ac2-918d-a27244ced883.png`, requested moving the status pill beside the card title, and authorized a build with both on-track and behind-plan Demo examples. The implemented design is recorded in `docs/goals-gallery.md`.

Implementation choices: explicit optional monthly amount and due day complement the existing baseline/start/deadline. Booked dedicated-account balances remain the source of progress. Forecasts use future planned contributions and clearly exclude assumed interest/returns. The Demo Car shortfall is represented by a matched returned contribution, not deleted history or invented UI values. Existing monthly budget entries are preserved and remain independent from goal plans. These choices do not authorize AI integration, provisioning or deployment.


## 9 September 2026 — Contribution-first selected goal detail

Confirmed: Dan requested removal of duplicated upper-card information and selected option 1 of the latest detail concepts (`exec-031c9254-ebf9-4c64-9d59-a51f59f0cf12.png`). Build the entire expanded detail panel around monthly contributions and their effect, period movement, goal context and collapsed evidence. The previous remaining-amount/installment tiles are superseded. Implementation retains existing dedicated-account APIs and all local-only/read-only constraints. Canonical visual: `docs/design-targets/goals-contribution-detail.png`.

## 9 September 2026 — Review option 1 and working Demo queue

Confirmed: Dan selected the first Review image (exec-46fda8e5-ce4e-48e1-8359-f75bc8558fd8.png) and then asked to adjust data so Demo works. The implementation preserves the existing backend review actions. Demo preparation removes app-owned categories from six known purchases and two app-owned transfer matches, allowing real categorisation/matching flows to be tried. This never changes bank transaction values or touches Live. It must not run on startup or undo subsequent user decisions. UI interaction tests use a temporary intercepted fixture and reload back to the persistent queue.

## 10 September 2026 — App-wide UI QA

Dan explicitly requested removal of colored left-edge selection markers everywhere and a complete responsive/consistency QA pass. The account picker now uses text/fill without an inset stripe. Existing full keyboard focus outlines remain. Local improvements and the verified scope are documented in docs/ui-qa-2026-09-10.md. This pass does not authorize Azure, bank changes or actual AI. Owner password setup remains Dan's private action; do not create or reset credentials to make QA pass.

## 10 September 2026 — Owner password length
Dan explicitly changed the local owner password policy to 8–128 characters. Apply the same bounds to backend setup validation, both setup inputs and Danish/English guidance. Existing credentials remain valid.
# Account preferences and creation modals — confirmed 10 September 2026

Dan explicitly requested custom account names, savings-account classification, actual period available-to-spend and total savings hero cards, a Debt/Loans placeholder, and centered creation dialogs across the product. Implemented locally; actual-period savings means signed booked movement on marked accounts, while total savings uses their latest available balances in one currency. Planned budget amounts remain separate. See [details and verification](account-preferences-and-creation-modals.md). No Azure/deployment authorization was granted.

## 10 September 2026 — Additional Danske Bank metadata

Confirmed: Dan authorized the proposed extra-field implementation after pausing it during voice research. Primary UI homes are Accounts (details and booked balance history) and Review (explainable category/transfer suggestions). Budget, Overview and Goals benefit through confirmed classifications and transfer matches; no automatic spending-plan or goal changes. Account identifiers are masked at the provider boundary and matched internally by normalized fingerprints. Existing Live history is enriched once through the normal rate-limited full-history queue. Demo enrichment is metadata-only and explicitly invoked. See [implementation, evidence and remaining Live import status](bank-metadata.md).

## 12 September 2026 — Major feature roadmap

Confirmed intent: move beyond minor refinements and track Azure deployment to subscription Dan Aakesen, a real advisor with UI voice and Agents API sandbox analysis, investments through Saxo, loans/house-finance planning, pensions and possible OpenTerminal navigation. Dan confirms no current investments or loan and existing Saxo developer access. The exact terminal repository is unresolved.

Recommended sequencing, not yet a deployment approval: ship the current banking experience to Azure first, then advisor/voice and separate financial-domain increments. Keep local-first validation and explicit approval of concrete Azure/deployment actions. New features do not automatically expand the initial release. OpenAI-hosted sandbox processing outside Azure and its real-data/cost boundary require a decision. Actual AI is now planned, superseding indefinite deferral; the current placeholder is not an implemented advisor. See [canonical feature tracker](roadmap.md). This planning change created no infrastructure or provider sessions.

## 12 September 2026 — Azure plan and Key Vault exclusion

Confirmed: Dan agreed to planning the Azure task, then explicitly said no Key Vault and asked whether deployment would use GitHub pipelines or Azure CLI. This supersedes the original Key Vault requirement. The revised proposal uses encrypted App Service configuration, with its different access/recovery tradeoffs recorded. Recommended deployment is Azure CLI plus Bicep and a versioned ZIP first; manually triggered GitHub Actions with OIDC may follow. That deployment-method recommendation is not yet a user selection or provisioning approval. See [Azure release plan](azure-release-plan.md).

## 12 September 2026 — Generative advisor UI is the primary requirement

Subsequent authorization: "Agree with prototype. Start building it." The first standalone local synthetic canvas used authored fixtures, current Banking theme tokens, complete HTML/JS and Markdown artifacts, persisted revisions and a controlled Demo-only bridge. Dan then explicitly requested real prompt-through-UI E2E, approved dedicated OpenAI key creation and directed Chrome use after the remote widget failed. The local prototype now uses actual OpenAI Agents API hosted execution on synthetic input. Each run downloads its completed artifact before deleting the hosted session; follow-ups carry the selected saved artifact/state to a fresh sandbox. Azure remains unchanged and the local bank sync worker remains stopped. See [implementation](../prototypes/advisor/README.md) and [Chrome evidence](advisor-e2e.md). Main-app integration, voice, Live-data processing and deployment remain separate scope.

Confirmed: Dan wants the agent to author its presentation, including HTML, JavaScript (working interpretation of "ja") and Markdown, rather than being restricted to hardcoded widgets. Use an extensible artifact renderer with responsive, theme-aware output and persisted revisions. Proposed executable output is isolated from the authenticated application and uses a controlled bridge to authorized read-only tools. The first advisor increment should prove this with synthetic Demo data. This clarification does not authorize implementation, external processing or deployment. See [design](generative-advisor-ui.md) and roadmap AI-06.

## 12 September 2026 — Full Azure deployment authorized

Confirmed: after the read-only access check, Dan instructed full deployment and requested a live test link. Execute in subscription Dan Aakesen with Azure CLI/Bicep. No Key Vault or private networking. Keep current Dan/password sign-in as the stated first-release assumption (no answer to optional Google choice); no password reset or disclosure. Preserve Live history, names, classifications and bank access through certificate-protected migration; public Demo uses expiring session-isolated synthetic copies. Only one Live worker after cutover; local databases and keys remain for recovery. Actual AI, loans, pensions and investments stay out of this release. See [execution evidence](../.azure/deployment-plan.md).

## 2026-09-12 — Local GPT-Live voice prototype (implemented)

Dan explicitly approved OpenAI API voice implementation and Chrome audio E2E in the local synthetic Demo. Use GPT-Live 1 over WebRTC, client delegation to a Responses function router, trusted backend calculations, and the existing Agents API for new rich visuals. Voice is owned by the trusted shell, never generated HTML. Saving needs an explicit request; hypothetical calculations do not. No Azure or Live-data activation is included. See `advisor-voice-e2e.md` for measured evidence and physical-device gaps.


## 12 September 2026 — Advisor conversation design selected

Confirmed: build the third image in the latest set, putting the voice icon inside the text composer beside Send and replacing Close with the chats-sidebar icon. Expanded mode shows history and the active conversation together. Voice animation will be designed later. Implemented locally in the existing synthetic prototype; previous chats and drafts are browser-local, artifacts retain server-side Demo persistence, and only one active voice session/analysis is supported. See `advisor-conversation-ui.md`. This does not authorize deployment or Live-data AI processing.


## Conversation memory and market-research boundary — 13 September 2026

Confirmed: implement automatic memory processing after conversations end. Text needs an inactivity boundary because it has no Stop button; the implemented default is 10 minutes, plus new/switched chat and best-effort page close. Capture stays user-controlled and source-backed. Dan authorized spoken goodbye/close to end the actual voice session and explicitly requested no execution testing of that behavior in this run.

Confirmed intended market repository: https://github.com/ErTasselli/OpenTerminal. Park integration until actual source availability, coverage/freshness and usage rights are verified; TradingView or another source is a possible alternative, not a selected integration.

## Markets phase boundaries - 16 September 2026

Confirmed: build selected concept 2 with Workspace/Explore tabs and written corrections in docs/markets-phase-1.md. Phase 1 is actual research data, saved watchlists, read-only Saxo holdings and periods. Phase 2 adds manual/AI-assisted orders, advice, news and strategy-based signals. Phase 3 is autonomous trading exploration; not activated. No old repository runtime dependency. The reference to an AI pane on the left is interpreted as the existing right-hand pane at Overview width. Holdings, not open orders, represents owned stocks.


## 17 September 2026 — Demo Saxo SIM access

Confirmed by Dan: Demo visitors may use Saxo SIM, while LIVE is restricted to the owner workspace. This supersedes the earlier blanket Demo provider-access restriction. The existing shared SIM connection is permitted for simulation reads; server credentials and all LIVE data remain protected. No order placement or deployment is authorized by this correction.

## 17 September 2026 — Local manual SIM orders

Dan subsequently requested local chart-based order entry, a small Mærsk test order, and removal of synthetic investment holdings. Implemented Buy/Sell whole-share day limit orders, Saxo listing confirmation, provider precheck, explicit review/submit, durable duplicate-submit protection, open orders and broker activity. This authorizes SIM testing; LIVE writes, AI/autonomous orders and production deployment remain disabled. Local-only endpoints reject production hosting and any LIVE environment. Removed the two known local Synthetic portfolio statements and stopped investment example seeding. Other financial Demo data is retained.

## 27 September 2026 — Goal path chart replaces contribution cards
Confirmed: Dan found the selected-goal detail unclear and asked for a chart. It shows a plan baseline from the plan start and the actual booked balance, marked red when missed or withdrawn contributions put it behind, and green when extra deposits put it ahead. It also projects when the goal is reached. Editing opens in a modal on the Goals page. This supersedes the 9 September contribution-first detail. The actual line is rebuilt from the goal account's booked transactions and current balance (no backend change); without a fresh balance or complete history, no line is drawn. See the DESIGN.md section "Goal journey detail, chart and edit modal". Local only; no deployment authorized.

## 27 September 2026 — Demo goal plans tuned for the path chart
Dan asked to adjust the Demo data so plan deviations are clearer. Only the three shared Demo goal plans were changed through the API: plan start, starting balance equal to the booked balance on that date, monthly amount and deadline. This gives one on-plan, one behind and one ahead goal. No transactions, balances or Live data changed. Transaction-level changes need a provider change, a deployment and a full Demo resync, so they remain unapproved. Details, including the previous values, are in DESIGN.md.

### 28 September 2026 — verified SIM data on 360
- Decision: show Saxo SIM as a separate latest-snapshot panel on 360, never as personal wealth or as invented period performance. It uses the existing deployed API from Azure and localhost:5444.
- Evidence: the combined read contract and frontend model preserve unknowns, pagination and broker currency; tests reject non-SIM data and prevent absent cash becoming a zero-percent allocation. Browser loaded/failure states checked at desktop/tablet/mobile widths in dark/light themes using a temporary isolated response fixture, removed after inspection.
- Provider status at release preparation: Saxo session expired (`SAXO_ACCESS_REQUIRED`); normal reconnection reached the Saxo SIM login form. Fresh fills/fees reconciliation therefore awaits renewed authentication. Earlier Working states are historical, not a current confirmation.

## 29 September 2026 — No real-time exchange data; stay on Saxo's delayed prices

Confirmed by Dan: "Im not going to subscribe for that". Banking stays on Saxo's 15-minute-delayed stock prices.
- No paid real-time exchange subscription.
- No API session upgrade from TradeLevel `OrdersOnly` to `FullTradingAndChat`, and no capability-upgrade call.
- No owner-only real-time rule is needed now. `SaxoMarketDataProvider.ForAudience()` stays a pass-through hook. Demo keeps the authorized delayed market projection.
- The label rule is unchanged: zero delay reads "No reported delay", never "Real-time"; a missing delay is unknown.

Evidence: Dan's reply on 29 September 2026 at 12:49, relayed from the "Fix errors" session, after Saxo's help page described the real-time path: a paid subscription plus an upgraded API session, with real-time data delivered to one session at a time. This supersedes the open real-time item in [Saxo market data](saxo-market-data.md). A future change of mind would need a new decision, including the Demo licensing rule. Documentation only; no code change and no deployment authorized.
