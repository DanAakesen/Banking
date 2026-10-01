Current Saxo research decision (28 September 2026): authenticated Demo visitors and Dan may use the shared Saxo LIVE market feed for instrument search, quotes and charts regardless of the trading SIM/LIVE selector. Dan alone may read private LIVE brokerage data or manage the LIVE connection. Demo cannot access LIVE accounts, balances, holdings, orders, activity or credentials. Order preparation and explicit SIM confirmation remain separate from research. Prepared and tested, not deployed; see [Saxo market data](docs/saxo-market-data.md).

Current confirmed architecture (27 September 2026): one frontend codebase served locally or from Azure; both use the same deployed production API, advisor and integrations, with separate Dan data and one shared fictional Demo financial dataset. No local application database, local business backend or direct SQL calls in the normal development workflow. This supersedes earlier local-first runtime descriptions below; disposable backend test fixtures remain permitted. Azure release is deployed and shared Demo behavior is API-verified across Azure and the active localhost:5444 frontend. Owner and microphone acceptance remain pending. See [shared production backend plan](docs/shared-production-backend-plan.md).

Latest increment (12 September 2026): the local text/voice advisor reads the authenticated workspace's saved goals, all budget entries, categories, account savings balances, actual financial results and paginated transactions. On an explicit request it can append income, expense or savings budget entries through the existing form validation and concurrency checks. This supersedes earlier synthetic-only/read-only advisor restrictions for these operations. Bank sync stays disabled and Azure is unchanged. See [local integration](docs/local-overview-advisor.md).

# Banking — product and scope

17 September 2026: Dan remains the only real user; all other users are Demo visitors. Text and voice share workspace-scoped financial context, now including watchlists. New hosted Demo copies include loan, investment and pension records, with generic supplementary examples for older templates. See [Demo/AI coverage](docs/demo-advisor-coverage.md). Local only; deployment pending.

Latest local roadmap pass (13 September 2026): the integrated advisor now supports contextual data questions, budget/Review proposals, explicit preferences and saved-data scenarios. Loans, investment/pension statements, recorded wealth and a Markets watchlist are implemented locally. Saxo SIM OAuth is prepared but needs callback registration and fresh sign-in; Pensure access remains pending. These increments are not deployed. See [current roadmap](docs/roadmap.md), [execution evidence](docs/roadmap-execution.md) and [wealth integration details](docs/wealth-integrations.md).

Latest advisor UI (12 September 2026): approved conversation pane implemented in the local synthetic prototype, with voice beside Send, chat-history overlay, expanded modal, and browser-persisted conversations/drafts. See [implementation](docs/advisor-conversation-ui.md). Not deployed.

Current advisor increment (12 September 2026): the separate local synthetic Demo prototype has GPT-Live API voice, backend financial/scenario tools, voice-driven visual updates and explicit saves, plus hosted analysis generation/cancellation. It is not deployed and has no Live bank access. See [voice evidence](docs/advisor-voice-e2e.md); older disconnected-placeholder descriptions below refer to the main Banking app.

Status: local backend and frontend implemented; panoramic Overview verified with 57 backend tests and 41 browser workflow/visual checks. Initial live Danske Bank import and fictional Demo data are available. Azure release deployed on 12 September 2026, ready for owner acceptance: https://banking-dan-0ac7d719.azurewebsites.net. Next direction: advisor/voice and broader financial coverage in increments. See [feature roadmap](docs/roadmap.md). Owner: Dan. Personal, non-commercial, single-user project. See [implementation evidence](docs/local-backend.md).

## Purpose

A single, mobile-friendly overview of the user's own accounts, balances, transactions, spending, and budgets. History and user-defined categories must be preserved independently of the bank connection. Jakob Fisker's LinkedIn post is inspiration, not a requirements specification.

The digital advisor's primary design requirement is **generative UI**: agent-authored HTML/CSS/JavaScript, Markdown and supported rich artifacts, including interactive analyses. It is not restricted to predefined cards. Banking provides a responsive, theme-aware rendering shell with isolated executable artifacts and persisted revisions. Confirmed by Dan on 12 September 2026. The subsequently authorized [local synthetic prototype](prototypes/advisor/README.md) is implemented; runtime AI is connected for synthetic-only Chrome testing; integration with the deployed app is still pending. See [generative advisor UI](docs/generative-advisor-ui.md).

## Original MVP delivery rule (historical)

The confirmed shared-production-backend decision above supersedes this original local-first delivery phase. Normal frontend development now depends on the deployed API; isolated backend test fixtures remain available. Deployment still requires explicit authorization.

**The entire MVP is built and verified locally first. Azure resources and deployment are the final phase and require Dan's explicit approval.** A finished design, passing tests, or general agent rules do not provide that approval. No Azure dependency may be required to start the local solution.

**Backend first, collaborative frontend design second, frontend implementation only after Dan's design approval.** Complete the MVP's local data storage, bank integration, business logic, API, background processing, security, and backend tests before the frontend design phase. Use API tests and technical tools to verify the backend without building a temporary dashboard. The frontend remains part of the full MVP and must work locally before any Azure release approval.

## Latest local MVP clarifications

10 September 2026: retain additional bank metadata to explain transactions and improve Review suggestions. Accounts adds bank-reported booked balance history and masked counterpart details; Review uses merchant categories and exact own-account identification as evidence, with explicit confirmation before classification or transfer exclusion. Existing manual choices remain authoritative. See [bank metadata](docs/bank-metadata.md), including the quota-respecting Live backfill status.

10 September 2026: accounts support user-owned names and an explicit savings marker. Overview hero cards show actual available-to-spend (period income − expenses − net savings deposits) and the current total available balance of marked savings accounts. Add Debt → Loans as an empty placeholder. Creation actions open centered modals, including new goals, budgets, budget entries, categories, rules and transfer matching; existing editing pages remain. See [implementation and verification](docs/account-preferences-and-creation-modals.md).

Budget option 1 is implemented: scenic actual-versus-budget hero, paginated manual editor, category comparisons, and net savings contributions from explicitly linked accounts. It retains the shared Overview/Accounts hero height. Demo has three linked savings entries and varied recurrence periods. See [Budget studio](docs/budget-studio.md) for semantics and evidence.

The owner approved the panoramic Overview on 8 September 2026, including morning/afternoon/evening greetings and matching scenery. All five themes and both languages remain supported. It presents account balances, explicit period comparisons, a money-flow breakdown, spending mix, account-linked goal journeys, seven-day estimates and a compact advisor preview. Actual AI remains disconnected. The owner explicitly authorized expanded family-of-four Demo history, three editable goals (Family holiday, Car, Summer house), and a transaction-backed active family budget. This is operator-invoked enrichment; startup never creates goals or budgets, and Live data is never seeded. See DESIGN.md for the exact decision and local evidence.

Budget entries can link to transaction categories. Budget progress on Budgets and Overview compares actual booked income/spending this calendar month against the full monthly allowance. Shared-category entries are combined without counting transactions twice. Unmapped entries, unbudgeted activity and incomplete history remain visible. Savings plans do not fund goals automatically; goals measure their linked account balances.

Budget rows offer Income, Expense and Savings in one dropdown. Savings retains the existing Expense/isSavings data model and arithmetic. Budget naming and currency belong in the top plan bar, with Rename for saved budgets. Demo transaction descriptions and generated budget-entry names should read naturally without a repeated Demo prefix. All dropdown panels must match their trigger width.

Empty collections must explain that no budgets/goals exist and offer explicit creation. Budgets only opens its manual editor after Create budget; visiting the page must not implicitly open a draft. Overview offers direct creation when none exist, and Choose budget when saved plans exist but none is active.

8 September 2026: Dan approved a welcome page with Try Demo and Sign in as Dan. The local implementation uses a password set by Dan himself from a trusted owner session, then direct browser sign-in. No external identity provider or Azure registration is created. Demo sessions cannot access Live, mint owner tickets, or configure the owner password. See [local access](docs/local-access.md).

Confirmed budget follow-up: every entry has type Income or Expense. Savings is an Expense entry marked Savings. The summary shows monthly-equivalent income, ordinary expenses (excluding savings), planned savings and available to spend / Rådighedsbeløb, calculated as income − ordinary expenses − planned savings. Do not double-count savings or present planned savings as achieved bank savings. Dan accepted the revised visual direction subject to these additions; the approved additions are implemented locally.

Budget correction, 7 September 2026: a budget is a named plan containing individually named recurring entries (amount plus monthly/three-monthly/six-monthly/yearly frequency). Manual entry is the default when no budget exists. Support multiple plans and an active plan for budget-dependent metrics. Transaction suggestions must offer merge into an existing plan or create a new plan, with explicit review of updates. Comparison and change-based projections come later. This supersedes the implemented category-limit interpretation; the redesign is now implemented with dedicated backend and browser checks; Dan's own creation acceptance remains. See [budget redesign](docs/budget-redesign.md).

The original local build used honest disconnected advisor placeholders and mobile visual checkpoints. **On 12 September 2026 Dan requested actual advisor, UI voice and sandbox analysis as a planned next release.** See the [roadmap](docs/roadmap.md). Provider activation, costs and real-data processing still need a concrete approved scope; planning does not activate AI.

Settings is a dedicated page with its own left navigation and a central content area. Its Back action returns to Overview. Theme selection belongs inside Settings. Mobile support is required across the application; the desktop sidebar must adapt to a usable narrow-screen navigation pattern.

Dan will create goals and budgets himself through the finished UI in both Dan and Demo. Implement the creation/editing workflows and read-only budget previews, but do not populate either product workspace with new goals, budget suggestions, or budgets. Disposable automated-test fixtures may exercise creation. Stop seeding budgets during new Demo initialization; preserve the eight historical Demo budgets unless Dan asks to remove them.

## MVP

- Review replaces Activity in navigation: an exception inbox for missing categories and conservative internal-transfer suggestions. Supports account/type filters, single/bulk categorisation, optional future rules, transfer confirmation/dismissal, 24-hour snooze, persisted history and guarded Undo. Accounts remains the full transaction explorer. Clearing Review does not establish bank-balance reconciliation; duplicate/refund detection is deferred.
- Local user interface and API with accounts, balances, transaction search, spending overview, and budgets. Accounts combines all-account or single-account transactions, a searchable account directory, a dedicated Account column, account/category colours, panoramic balance allocation, period income/spending/net-retained metrics, and compact category spending visuals. Upcoming-payment estimates remain on Overview.
- Enable Banking as the first provider; the first real connection is Dan's private Danske Bank account.
- Enable Banking control-panel login uses Dan's personal account, **danaakesen@gmail.com**. This is separate from the Azure account and the previously specified production UI identity.
- Immediate import of all history actually made available by the API, with visible progress and durable storage.
- Ongoing synchronization within bank/provider limits, with retries, duplicate detection, and visible data freshness.
- Handling of expired/revoked consent and reconnection without losing history or corrections.
- User-owned rule-based categorization and manual category corrections. Named budgets contain individually named entries with an amount and recurring frequency. Start manually; transaction suggestions can create a new plan or merge into a selected one after review. Support multiple plans with an explicit active plan. Preserve manual adjustments during synchronization and suggestion refreshes. This revised budget requirement is implemented locally.
- Balance snapshots, a clear distinction between reserved and booked entries, and internal transfers.
- Local backup/restore, with evidence of access restriction and the absence of sensitive information in logs.
- An account row displaying **Dan** for the live workspace and **Demo** for the synthetic workspace, replacing the separate Live/Demo toggle. Its menu offers Settings, Connections and Sign out; users switch workspaces by signing out and choosing again on the welcome screen. Demo provides all MVP workflows using separate synthetic data, including automatic budgets, manual adjustments, categories, rules, connection/import simulation, and persistence. Demo never displays or changes Dan's live data or starts a real bank flow.
- Settings contains Danish/English language selection, profile settings, and a choice of **five preset themes**. Light and Graphite (the first/darkest dark candidate) are approved visual targets; the other three palettes remain to be designed. Custom themes are a later extension. Theme choice is a saved user preference, independent of the selected Dan/Demo workspace.

### Design-driven features — implemented locally, owner acceptance pending

- Named-budget suggestions group booked transactions by exact description and sign and show the history period, currency, data coverage, and calculation basis. Exclude confirmed internal transfers and avoid double-counting reservations; make refund and irregular-expense treatment explainable. Insufficient history produces an explicit limitation, not an invented budget. The named-plan preview defaults to monthly averages over three completed months; 1–12 months are supported. Credits become separate Income suggestions requiring review. A monthly average does not establish a payment recurrence. The earlier category-limit API remains available for historical compatibility.
- Generate a proposed starting budget for review and manual adjustment. Recalculation produces a new suggestion without silently replacing an accepted or manually edited budget. Budget data and suggestions stay within their Dan or Demo workspace.
- Overview includes comparable income/spending/net-saving trends, estimated upcoming payments, and goal progress with labeled On track / At risk / Behind plan states. Unknown coverage or plans remain visibly unknown.
- Each goal has a name, description, target amount/currency, and an optional deadline. Its measurement source is either one selected account or the combined balance of all accounts in the current workspace. A details area holds editable notes and optional reference links (for example, a home, trip, or item being saved for), giving Dan and the advisor useful context.
- Goal progress uses an explicit balance basis and freshness timestamp. The implemented basis is the latest booked balance, never a sum of available and booked snapshots. Each goal must link to one dedicated account, and each account may be linked to at most one goal. All-account and shared-account goals are no longer supported. Banking neither creates real bank accounts nor reserves or moves funds. A missing account/balance is unknown, not zero. An optional deadline alone does not establish an agreed savings pace; On track / At risk / Behind plan requires a defined plan or baseline.
- A personal digital advisor uses the selected workspace's financial data and goals through bounded read-only access. Contextual pills open an overlay chat; advice explains sources and assumptions. The advisor cannot make payments or change bank data. The current implementation is a disconnected placeholder. On 12 September 2026 Dan requested actual advisor, UI voice and sandbox what-if analysis as a next release; see the roadmap for scope and activation gates.

These additions extend the original tested backend. Goal CRUD/progress, read-only budget previews, trends, monthly-payment estimates, and advisor status now have a local implementation; see docs/local-backend.md for validation. Preferences and product UI are now implemented and browser-tested. Actual AI is not implemented yet and is planned in the next-release roadmap. Dan performs goal/budget creation acceptance in his product workspaces; automated mutation checks used disposable test databases.

## Demo mode

Confirmed by Dan during backend implementation: the final demo dataset is created only after the shape and relevant scenarios of his actual data are understood. Existing simulator fixtures are engineering test data, not the finished product demo. Use the observed schema and scenarios to generate wholly synthetic examples; do not copy real names, identifiers, descriptions, balances, or transaction amounts into the demo dataset.

Live and Demo share behavior and data contracts, with separate storage and credentials. The welcome page offers Try Demo without login and Sign in as Dan for private accounts. Demo sessions are restricted to Demo on the server; only an authenticated owner can select Dan. This supersedes the earlier owner-only entry flow; it does not add multi-user sign-up. The selected workspace must be clear and enforced server-side. Switching must clear stale views/caches and advisor context and ignore late responses from the previous workspace. Background live synchronization stays bound to its live workspace; selecting Demo does not reroute jobs or callbacks. A demo reset must affect only demo data. Dan subsequently approved local UI implementation; it now follows these rules. This does not authorize external access or deployment.

This MVP scope includes both backend and frontend. See the [phase plan and acceptance criteria](docs/project-plan.md) for their separate delivery stages.

## Planned product extensions

- More of the user's own accounts and banks from Enable Banking's current catalogue.
- Additional providers through the same contract and stable user-owned account identities.
- Read-only MCP for ChatGPT with bounded search and analysis tools.
- Subscription overview and further mobile improvements.
- Saxo investments, loans and house-finance scenarios, PFA pension integration, and an optional market terminal. Dan currently has no investments or loan, and confirms existing Saxo developer access. See [feature tracker and unresolved provider decisions](docs/roadmap.md).
- Custom themes after the five preset themes.

Extensions are not automatically part of the MVP. If included before the first release, they must also be built locally before the Azure phase. Investment and pension connections are confirmed future ambitions, not implemented coverage. Business use, additional real-data users, and internet hosting remain outside this local iteration. Demo needs no login on the local app; this does not authorize public network exposure.

## Confirmed requirements

- Goals gallery (approved 9 September 2026): inspirational photo cards, status beside each goal title, dedicated-account progress, monthly contribution history, reconciliation, and estimated date impact from shortfalls. Users can attach/change/remove goal photos and define an explicit monthly savings plan. Existing creation, descriptions, notes and reference links remain. Demo includes verified on-track and behind-plan examples. See [Goals implementation](docs/goals-gallery.md).

- Future hosting: Azure-native in subscription **Dan Aakesen**, account **Dan@novaro.dk**. No Vercel or Convex.
- AIS only: accounts, balances, and transactions. No payments or transfers through the app or AI.
- MitID is used exclusively in the bank's official approval flow. Banking never receives or stores MitID information.
- Provider-neutral integration. Enable Banking supplies the connection; Banking owns categorization and history.
- In Azure, historical bank data, categories, rules, budgets, and balance snapshots are stored in an owned database; Dan excluded Key Vault on 12 September 2026; the proposed private-key location is encrypted App Service configuration, with restricted access and tested recovery. See [Azure release plan](docs/azure-release-plan.md). Managed Identity and least privilege apply between components.
- Production access is limited to the identity behind Dan@novaro.dk. No bank data or secrets in ordinary logs.
- **VNet, Private Endpoints, and Private DNS are excluded from the baseline and budget.** They appear only as an optional item after the phase plan.

## Open items

- The local backend uses C#/.NET 10, ASP.NET Core, EF Core, and SQL Server LocalDB. The frontend uses native JavaScript modules, HTML and shared CSS served by ASP.NET Core; no additional framework build or cloud dependency.
- Initial Danske Bank history/account structure/consent are verified: three DKK accounts, history from 2024-09-09, consent until 2027-03-06. Actual ongoing quota behavior and comparison against the bank UI remain follow-up checks.
- Enable Banking setup and the initial application bank/MitID consent are complete. Future expired/revoked consent needs Dan's participation. A public callback, tunnel, Azure resource, or deployment still requires separate explicit approval.
- West Europe and Azure service choices are design proposals, not permission to provision. The current Azure identity/subscription and prices must be checked before any approved release.
- Light and Graphite Overview targets are approved. The local screen set and five themes are implemented; owner visual/creation acceptance, currency conversion, eventual advisor implementation and later ChatGPT OAuth compatibility remain open.


