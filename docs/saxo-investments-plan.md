# Saxo SIM and Investments delivery plan

Confirmed by Dan on 27 September 2026. Keep this sequence; pension is parked pending provider access/data clarification.

## Agreed page responsibilities

| Page | Responsibility |
| --- | --- |
| 360 | Overall finances and a concise investment summary; exclude SIM from personal wealth. |
| Investments | Owned portfolio, valuation, allocation, performance where verified, and activity. Selecting a holding opens its existing Markets chart. |
| Markets | Discover and research instruments, charts, and the guarded order flow. |

## Four approved steps

1. **Shared Saxo backend — deployed; Demo access verified on Azure and localhost.** Support SIM reads and guarded SIM orders for Demo visitors and Dan through the single Azure API used by both frontends. LIVE access is exclusive to Dan; this release does not enable LIVE order execution. Preserve explicit review/confirmation, account ownership, cash/holdings validation and duplicate protection. No order is authorized by this deployment step.
2. **Small varied SIM portfolio — pending.** Prepare 3–4 concrete positions spanning suitable currencies/instrument types within verified broker/app support. Present instruments, quantity, limit, duration and exits for Dan's approval before placement. Current order implementation supports whole-share stocks only; do not assume ETF support. Verify acceptance and actual execution separately.
3. **Reconciliation — pending.** Reconcile quantity, purchase price, current value, realized/unrealized result, currencies, fees, settlement and available cash. Include a separately approved partial close. Do not treat value changes from deposits/FX as investment return.
4. **Investments design and build — pending.** Produce three visual concepts from the verified data, then implement the selected direction responsively for desktop, tablet and mobile. Reuse Markets for instrument research/trading. Historical SIM samples must not masquerade as this account's performance.

Source evidence: [capability audit and fresh SIM verification](saxo-investments-capability-audit.md).

## Step 1 implementation contract

- Read-only instrument lookup, order ticket details and broker order/activity reads no longer depend on a Development host. Broker requests remain pinned to Saxo's SIM gateway.
- **Corrected by Dan during release, 27 September:** public Demo visitors may read, prepare and explicitly confirm orders on the shared Saxo SIM account. `Saxo:SIM:TradingEnabled=true` enables this. LIVE access remains exclusive to the authenticated Dan user and Live workspace; LIVE order execution is outside this release. The earlier owner-only SIM restriction was incorrect.
- Review tickets and receipts use a hash of the validated browser session, independently of the shared Demo financial-data scope. Another visitor cannot inspect or confirm a ticket. Completed broker orders and holdings belong to the shared SIM account.
- Submission accepts the immutable saved ticket ID plus `confirm: true`. Missing/false confirmation fails before broker work. The advisor's existing explicit card confirmation stays mandatory; a voice/model tool cannot confirm it.
- Production ticket state lives under `Cloud:StateDirectory/saxo-orders-sim`, protected by the existing cloud data-protection key ring. It never defaults to an instance-local user profile. An atomic persistent claim is created before the broker write; uncertain submissions and crashes cannot replay the ticket.
- Increased cash requirement or a changed estimate currency requires a new review. Existing account/instrument ownership, expiration, cash and holdings checks remain.
- Acknowledgement remains `Accepted`, not `Filled`. Order/activity lookups and the advisor's evidence check remain separate from submission. Existing order history coverage is 100 rows / seven days with coverage flags.
- Status exposes SIM trading enablement, current-user access and the confirmation requirement. LIVE order endpoints stay forbidden irrespective of the SIM switch.

## Release and acceptance

Deploy compatible backend, Markets client and advisor together. Old clients without `confirm: true` fail closed. Enable `Saxo__SIM__TradingEnabled=true` only as part of the approved release. Keep the existing persistent `/home/Banking` state volume and protection key ring; deployment must not remove claim or receipt files. Disabling the switch stops preparation/submission while preserving read/status access. No database migration is needed.

After release, use both the Azure frontend and the frontend-only localhost host (currently 5444) as a Demo visitor. Check instrument lookup, account details, order history, LIVE rejection, missing-confirmation rejection, session-isolated review tickets and an unsubmitted review. Do not use the legacy local backend on 5443 as acceptance evidence. Actual SIM submissions belong to step 2 after concrete approval.

## Engineering evidence — 27 September 2026

- 49 backend tests passed together on the x64 test target: Saxo orders/session, cloud security, public API access and advisor proxy. Two additional cross-process claim-race cases were then added; the final Saxo order suite passed all 19 cases (51 distinct backend cases validated across those runs).
- 18 advisor tests passed: explicit card confirmation, no model/voice submission bypass, broker-status verification, shared-backend requests and cloud conversation isolation.
- `node --check src/Banking.Api/wwwroot/markets-ui.js` passed. Markets and advisor now send the required explicit confirmation flag; Markets explains owner/enablement failures in Danish and English. No layout redesign was made.
- Initial broad API test attempt used an ARM64 process and failed to load x64 LocalDB. Corrected with the repository's `dotnet test --arch x64` pattern; the affected tests then passed. Disposable test databases only; no runtime data store was changed.
- Cross-process behavior is covered by injecting a durable claim while a broker precheck is pending, for both successful and rejected prechecks. No second broker write or receipt overwrite occurs. This does not claim a multi-instance Azure soak test.
- No deployment, cloud setting change, fresh broker precheck or real/SIM submission performed during step 1 implementation. Hosted browser acceptance remains pending after release.

Validated commands:

```powershell
dotnet test tests/Banking.Tests/Banking.Tests.csproj --arch x64 --filter "FullyQualifiedName~SaxoOrderTests|FullyQualifiedName~SaxoSessionTests|FullyQualifiedName~CloudTests|FullyQualifiedName~PublicAccessTests|FullyQualifiedName~LocalAdvisorTests" -p:UseAppHost=false -o artifacts/shared-saxo-tests-x64
dotnet test tests/Banking.Tests/Banking.Tests.csproj --arch x64 --filter "FullyQualifiedName~SaxoOrderTests" --no-restore -p:UseAppHost=false -o artifacts/shared-saxo-tests-x64
node --test prototypes/advisor/saxo-tools.test.mjs prototypes/advisor/voice.test.mjs prototypes/advisor/banking-context.test.mjs prototypes/advisor/cloud.test.mjs
node --check src/Banking.Api/wwwroot/markets-ui.js
```

Release change set: `SaxoOrders.cs`, `PlanningEndpoints.cs`, `wwwroot/markets-ui.js`, `prototypes/advisor/saxo-tools.mjs`, focused tests, and this plan/context/acceptance documentation. Preserve unrelated current UI work during packaging; deployment scope needs explicit approval. The target app setting is `Saxo__SIM__TradingEnabled=true`. Roll back by disabling that setting while retaining encrypted receipts and permanent claim files.

## Corrected release and acceptance — 27 September 2026
- User explicitly confirmed Demo visitors can prepare/submit SIM orders, with LIVE reserved for Dan. This supersedes owner-only SIM statements in the initial engineering evidence above. The confirmed rule is also recorded in agent-context.md.
- Deployed build `2026.09.27-shared-saxo-demo`; active successful SCM deployment `16c1eeb6-f073-4f2a-9ec4-cdfd9835e994`, completed 16:06:21 UTC. SIM trading setting enabled. Package SHA256 `0470958009F920BF55415D6C60AE43C6564061CF9B33DF5E9AB8828CB4B8AED9`.
- Both Azure and localhost:5444 passed scripted authenticated Demo checks: SIM allowed, explicit confirmation required, account/holdings reads, instrument search, ticket details, orders/history, input validation, missing-confirmation rejection, unknown-ticket denial and LIVE denial. Each checks the exact deployed build. No executable submission request was sent.
- Real browser: both Markets pages show connected SIM and the same EUR account ending 1575, value/available cash 999,973.83 EUR and invested 0.00 EUR after restart. Existing Saxo sign-in survived both deployments. One in-app tab retained the restart error and was replaced with a fresh tab; this was not an API failure after startup.
- Current focused backend suite: 53 passed; final updated public routes: 7 passed. Added shared-Demo session isolation and cross-visitor ticket-confirmation denial; own-session fake-broker submission passes. Local/hosted provider acceptance is distinct from fake-broker submission tests.
- Genmab ticket lookup succeeds but Saxo returns PriceTypeAsk/PriceTypeBid `NoAccess`, no bid/ask. The optional actual broker-precheck check was therefore not run: no invented price was supplied. Step 2 must obtain/approve a concrete limit price before real SIM precheck/submission. No actual orders placed; no fill claimed.
- No migration, local database, data import/reseed, infrastructure or role change. Only the API assembly/debug symbols, Markets client and advisor Saxo helper differ from the verified full-release package. Added Workspace.SessionScope source supports session-specific tickets. Rollback backups retained under /home/Banking/releases; receipt/claim/key directories untouched.

## Quote-access investigation — 27 September 2026
Step 2 remains paused by Dan until missing quotes are resolved. Fresh browser inspection of the signed-in Saxo Developer Portal showed the SIM applications and a `Connect live account` page with `START CONNECTING YOUR ACCOUNT HERE`; LIVE linkage has not been completed in this work. Banking Production SIM is already enabled for trading, so app trading permission is not the missing setting.

Saxo's account-linking guide (updated 7 September 2026) says linking a funded LIVE account grants SIM delayed data for products available on LIVE. Its NoAccess guide identifies an unlinked SIM account and missing OpenAPI market-data consent as causes. Saxo's more generic enable-market-data page says SIM data is unavailable, which conflicts with the more specific linking guide; therefore actual successful quotes must be verified after linking, not assumed.

Sources:
- https://openapi.help.saxo/hc/en-us/articles/4416934146449-How-do-I-connect-a-Live-account-to-a-SIM-Demo-account
- https://openapi.help.saxo/hc/en-us/articles/4405160773661-Why-do-I-get-NoAccess-instead-of-prices
- https://openapi.help.saxo/hc/en-us/articles/4418427366289-How-do-I-enable-market-data

App fix: HTTP 200 does not imply usable prices. Ticket quoteError now reports SAXO_MARKET_DATA_NO_ACCESS for either denied side, and SAXO_QUOTE_UNAVAILABLE for missing/nonpositive quotes or quote errors. Raw provider evidence is retained for diagnosis. Markets displays the issue and leaves the limit blank instead of using denied/missing prices. It does not substitute research prices or change SIM confirmation permissions. Tests: 27 SaxoOrderTests passed, including provider-error response classification and ticket integration.

Remaining provider action: obtain Dan's explicit approval before connecting his LIVE account to SIM or accepting market-data terms. Do not upgrade session TradeLevel speculatively, buy subscriptions, create LIVE apps or change the SIM-only order gateway. After the provider action, verify Genmab bid/ask, delay metadata and an unsubmitted broker precheck through Azure and localhost:5444. Only then resume step 2. No orders were submitted in this investigation.

### Quote-status release acceptance
- Active successful SCM deployment cb1b7dd5-38d6-4265-ac6e-6e1596fc6167, completed 27 September 2026 16:37:05 UTC. Runtime 2026.09.27-saxo-quote-status verified on Azure and localhost:5444 after restart. Deployed API assembly SHA matches the build: 33688B5E6F4C779F0A3BF10DE6E87BD35265CFC866145485561D006293739E19.
- Test-SharedSaxo passed on both frontends: Demo SIM access, account/search/ticket/order reads, denied quote surfaced explicitly as SAXO_MARKET_DATA_NO_ACCESS, missing confirmation and invalid input rejected, private unknown ticket denied, LIVE blocked. Actual broker review was explicitly skipped because no usable quote exists; no orders submitted.
- Backup retained at /home/Banking/releases/before-saxo-quote-status-20260927.zip, SHA256 0F52AB26985D297D2E05A688C6AAAE2E55402DAE4C58077F81263498232EF172. No provider consent/linking, subscription, setting, migration, role or infrastructure changes.
- Application error handling is fixed. Provider quote access remains blocked pending approved LIVE/SIM linkage and subsequent fresh quote verification. Step 2 is not started.
- Real browser verification on localhost:5444: Genmab CSE ticket shows unavailable bid/ask, the SIM/OpenAPI access explanation and an empty limit input. No Review or Confirm action used. Screenshot: artifacts/saxo-quote-access.png. The watchlist item added for this check was removed afterwards.

## Step 2 resumed without LIVE — confirmed 27 September 2026
Dan explicitly chose to continue SIM-only without linking LIVE. This supersedes the earlier pause pending quote access. Preparation is authorized; order submission still requires approval of concrete terms. Four exact SIM stock listings have been checked and a reference-priced limit proposal is ready in [SIM test orders](saxo-sim-test-orders-2026-09-27.md). No prechecks or orders sent. Missing broker quotes and valuation remain visible limitations.

## Step 2 execution — 27 September 2026, 19:44 Europe/Copenhagen
Dan approved Genmab 1 @ 2,280 DKK, Vestas 5 @ 199 DKK, Microsoft 1 @ 517 USD, and Siemens AG 2 @ 279 EUR replacing rejected SAP. All are SIM Buy limit orders, GoodTillCancel, without attached exits. Fresh broker prechecks passed; all four were submitted once and verified against broker working orders and `Placed / Confirmed` audit records. Order IDs: 5040511178–5040511181 respectively. Portfolio preview still reports zero positions and four orders; execution/fill reconciliation remains pending. Do not duplicate submissions. Full receipts, costs and verification timestamps: [SIM test orders](saxo-sim-test-orders-2026-09-27.md#execution-record--27-september-2026-1944-europecopenhagen). LIVE remains untouched.

## Existing Investments page inspected — 27 September 2026
Read-only production reconciliation at 19:56 and actual browser inspection on localhost:5444 confirmed four working orders, zero holdings, and a functioning manual SIM portfolio preview. Investments still renders the manual statement layout, omits open orders/activity, and has a hardcoded false “Not connected” sidebar label. The current mapped position response also lacks fields needed for acquisition/value/fee reconciliation. See [page audit and recommended implementation order](investments-page-audit-2026-09-27.md). No frontend changes, new trades or deployment occurred during this audit.

## Data contract and design exploration — 27 September 2026
Dan authorized the next data-preparation and three-concept design step. Additive position/cost/order fields and a SIM-only combined read endpoint are implemented in source; 44 focused tests pass including HTTP authorization checks. No deployment, UI replacement or new trade. Read [contract, source definitions, test evidence and release boundary](investments-data-contract.md). Actual filled-position reconciliation remains pending while the four orders are Working. Three image concepts use the verified waiting-state snapshot; owner design selection precedes frontend implementation.


## Concept 3 implementation — 27 September 2026
Dan approved the portfolio workspace, with Holdings as the default and Orders / Activity separate. Implemented locally in the existing wealth module and stylesheet, preserving Pension and the shared production API architecture. The false Investments navigation subtitle was removed. Review `investments-ui-qa-2026-09-27.md` for UI verification and release limitations. No new SIM order, LIVE linkage or deployment was performed. Existing order IDs must not be duplicated. Additional position/order fields from the prior backend work still need release; actual filled-position reconciliation remains pending.

## Investments and 360 deployed acceptance — 28 September 2026
The complete portfolio workspace and separate 360 SIM snapshot are deployed. Latest correction `2026.09.28-investments-signin` adds direct sign-in on Investments with single-use state-bound return to Azure or localhost:5444 Investments. Markets remains compatible. See production-test-plan.md for deployment and validation evidence.
Fresh signed-in production API/browser reads on both frontends agree: 999,973.83 EUR cash/account value, zero holdings/invested, four existing Working orders and eight placement audit records. No confirmed fills or final execution fees are reported. SIM is excluded from personal wealth; do not replace unknown live values with simulation. No additional orders or LIVE changes were made. The next provider-dependent acceptance is actual fills, quantities, execution prices, fees and resulting positions when Saxo reports them.

## Valuation investigation — 28 September 2026
Fresh signed-in reads confirm 2 holdings, but both return CurrentPrice=0, CurrentPriceType=None and CalculationReliability=ApproximatedPrice; independent quote reads return NoAccess. Field mapping is correct. The official linking/market-data documentation is inconsistent, so LIVE linking is not a guaranteed remedy and remains outside the SIM-only authorization. Existing Markets research quotes for the exact Siemens/Vestas listings are available; a separately labelled indicative valuation is a proposed next option only. See [evidence and boundaries](saxo-valuation-investigation-2026-09-28.md). No app code, trades, deployment or provider configuration changed.

## LIVE access direction and disclaimer review — 28 September 2026
Dan now wants LIVE data access and an explicit SIM/LIVE choice for his private account, usable from both frontends through the shared Azure API. This supersedes the earlier SIM-only data-access preference; it does not authorize real-money orders. Demo remains SIM-only, with owner authorization enforced before LIVE testing. The complete portal disclaimer was read without accepting it. [LIVE readiness checklist](saxo-live-readiness.md) records every testing declaration, relevant licence duties, current code evidence and remaining implementation/acceptance gaps. Current Investments combined reads/UI are still SIM-only, so credentials alone are insufficient. LIVE trading stays disabled while read access is implemented and verified.
