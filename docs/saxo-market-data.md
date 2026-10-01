# Saxo market data

Confirmed by Dan on 28 September 2026. Deployed build: `2026.09.29-saxo-short-ranges` (1H, 1-minute 1D, short-range live refresh and gap note). Verified 29 September 2026: Saxo LIVE price history and quotes both return for all eight ranges, with a 15-minute delay; see the last section. The LIVE market-data session expired overnight between 28 and 29 September, and only Dan can renew it by signing in.

## Source and environment

- Instrument search, selected-instrument price and OHLC history use Saxo LIVE, regardless of the SIM/LIVE trading selector. No Yahoo requests or fallback.
- Account balances, holdings, order reads and execution retain their own SIM/LIVE environment. LIVE execution remains server-disabled. A market-data sign-in preserves the selected trading environment.
- Updated product decision, 28 September 2026: Dan explicitly authorized authenticated Demo visitors to use the shared Saxo LIVE market feed for instrument search, prices and history. Only the typed market-data projection is shared. Credentials stay server-side; LIVE OAuth/session management, accounts, balances, holdings, orders and activity remain owner-only. This supersedes the earlier owner-only research rule. It is a product authorization, not evidence of provider entitlement or successful live-feed verification.
- Local frontend uses the same deployed API. No local database or business backend is introduced.

## Contract and presentation

- `ref/v1/instruments` resolves Saxo UIC, asset type and exact venue. Existing known symbols have explicit aliases; ambiguous legacy symbols require selecting a listing. Nothing picks the first search result as an executable instrument.
- `chart/v3/charts` returns historical OHLC/volume. Nine ranges, including 1H, use provider-supported horizons and at most 1,200 samples. The request sends `AssetType`, `Uic`, `Horizon`, `Count` and `FieldGroups=ChartInfo,Data,DisplayAndFormat`, which returns the latest samples up to now. Saxo defines `Mode` only together with `Time`, so neither is sent. Invalid/missing candles are omitted, duplicate timestamps are deduplicated, and current intraday ranges retain actual returned trading days across weekends.
- `trade/v1/infoprices` supplies `PriceInfoDetails.LastTraded`, `LastClose`, `LastUpdated` and quote-delay metadata. The displayed timestamp is Saxo's snapshot update time, not an invented trade time. Missing timestamps, missing/zero prices and NoAccess remain unknown. Historical candles never masquerade as an executable quote.
- Source, delay and retrieval/quote timestamps appear beside the chart. Data refreshes once per minute only while visible; this is polling, not a streaming feed. 1H and 1D refresh every 20 seconds while visible (see the short-ranges section). A transient failure may retain explicitly stale Saxo data, but authorization or entitlement denial removes the previous data. Cache identity changes with Saxo credentials/session state and every read checks authorization before cache lookup.
- TradingView remains the chart drawing library and isolated Explore heatmap/fundamentals provider. It does not supply the selected-instrument OHLC chart or price. Those Explore widgets retain their separate attribution; this task does not implement a Saxo market-wide heatmap.
- Advisor `market_search` and `market_chart` use these same endpoints and must retain delay, timestamp and missing-data semantics.

## Validation and release gate

Prepared checks cover fixed LIVE URLs/GET-only requests, all ranges, exact listing ambiguity, invalid bars, quote access denial, missing values, workspace authorization before cache retrieval and private brokerage isolation, kill switch/disconnect and stale-only transient fallback. UI checks use explicitly marked response fixtures; they do not prove a Saxo entitlement.

After a fresh Saxo market-data sign-in, inspect real MSFT and Danish/German listing search, quote and chart responses through the Banking browser. Verify the same response source while switching SIM/LIVE trading environments and both Azure/local frontends. Check short and long chart ranges, `LastUpdated`, returned currency/venue and provider delay. If Saxo denies the feed, record the provider limitation without substituting Yahoo or fabricating prices. Do not place orders or purchase subscriptions as part of this check.

Official contracts: [chart](https://www.developer.saxo/openapi/referencedocs/chart/v3/charts/get__chart), [instrument search](https://www.developer.saxo/openapi/referencedocs/ref/v1/instruments/get__ref), [info price](https://www.developer.saxo/openapi/referencedocs/trade/v1/infoprices/get__trade), [price details](https://www.developer.saxo/openapi/referencedocs/trade/v1/infoprices/get__trade/schema-priceinfodetails).

## Combined release deployment and provider acceptance — 28 September 2026

The complete Markets, Investments, API and advisor release is live as `2026.09.28-combined-markets-investments` on Azure and localhost:5444. Both origins passed HTTP 200 health/runtime checks, and `scripts/Test-CompleteReleaseParity.ps1` confirmed matching runtime build, nine frontend asset hashes, shared Demo account identities and LIVE denial on both. Deployment ZIP SHA256: `9969D678B394513FB6FC3B45A1FACFE8431FFFA7A6C9740089FBB4917C41BEAA`; rollback is staged at `/home/Banking/releases/before-combined-markets-investments-20260928.zip` (SHA256 `874052b624d875c29858531480f9ccaffdf2a78e32baebafdfe0b7c859b2f738`).

Authenticated Demo market search returned HTTP 503 `SAXO_MARKET_SIGN_IN_REQUIRED` on both origins. The real provider chart, source and delay therefore remain unverified until Dan renews the market-data sign-in. No alternate feed or synthetic prices were used in this check. Demo LIVE status, portfolio and orders returned HTTP 403 `SAXO_LIVE_OWNER_REQUIRED`; LIVE trading remains server-disabled. No orders, provider consent, settings, schema, infrastructure, roles or persistent session/keyring files were changed. The UI handoff reports 49 tests and desktop/tablet/phone plus light/dark browser checks; a separate postdeployment visual session was unavailable.

Combined deployment is complete; the backend and Markets/Investments UI are live on Azure and localhost:5444.

Both endpoints are authenticated reads: `GET /api/markets/search?q=...` and `GET /api/markets/chart?symbol=...&range=...`. Neither accepts a trading environment. Use the exact search-result symbol (including venue) when requesting a chart. The response contract is additive; existing chart fields remain compatible.

| Response field | Meaning for the UI |
| --- | --- |
| `source` | `Saxo LIVE`, independent of the order/account SIM/LIVE selector. |
| `currency`, `exchange` | Units and venue of the returned chart; never silently converted to the account currency. |
| `bars` | Valid historical OHLC records, possibly empty. Never use the final close as a missing current quote. |
| `price`, `previousClose`, `quoteTime` | Nullable. Display unknown values as unavailable, not zero. `quoteTime` is the provider snapshot update time. |
| `chartDelayMinutes`, `quoteDelayMinutes` | New nullable numeric delay fields for separate badges. Null means unknown; zero means no reported delay, not a guarantee of an executable real-time price. The existing `delay` text remains available. |
| `retrievedAt`, `stale` | A transient refresh failure retains the original retrieval time with `stale: true`. Do not label a stale response as refreshed successfully. |
| `warning` | A chart may remain usable while its quote is unavailable or denied. Preserve that distinction. Stale fallback currently carries readable warning text; other warnings use provider codes. |

Authentication cooldowns use the same market-data error codes as the first failed provider response. `SAXO_MARKET_SIGN_IN_REQUIRED` requires a market-data sign-in; `SAXO_MARKET_DATA_NO_ACCESS` indicates denied feed access. A denied chart removes its cached snapshot, so subsequent transient errors cannot resurrect it. No trading request is retried or changed by this work.

`SAXO_MARKET_DATA_MISMATCH` rejects historical data with missing currency or a conflicting venue. A quote explicitly denominated in a different currency is suppressed while the valid chart remains available. Invalid/fractional/out-of-range instrument UICs are excluded; exact duplicate listings are removed while genuinely ambiguous listings still require selection.

Backend follow-up validation (28 September 2026): build and 95 Saxo/provider tests passed, including 23 market-data tests (`artifacts/check-saxo-backend-followup-results/saxo-backend.trx`). The owner/Demo market-route HTTP boundary also passed using the x64 test runtime and isolated test databases (`market-http.trx`): 96 scoped checks total. The combined release and current real-provider limitation are recorded below.

## Prepared validation — 28 September 2026

- Build succeeded without warnings/errors.
- 83 Saxo/provider tests passed (`artifacts/check-saxo-market-results/market-core.trx`). Three HTTP access/order-boundary tests passed separately using the x64 test runtime (`market-public.trx`, `market-order-boundaries.trx`). 62 UI/advisor checks passed (`artifacts/saxo-market-ui-tests.txt`). Total scoped checks: 148.
- Earlier broad attempts encountered the known ARM64 LocalDB loader error and an x64 test-host crash. Those attempts are not passing evidence; the affected HTTP tests were rerun separately with `DOTNET_ROOT_X64` configured and passed.
- Browser-only, clearly marked response fixtures verified source/time/delay display, historical candles, stale refresh messaging and layout at effective CSS widths around 391, 1023 and 1440, in Graphite and Light, without document overflow or console errors. The source guard visibly rejects the still-deployed Yahoo response. The temporary tab and overrides were removed. Accounts comparison was interrupted by session expiry, so no fresh Accounts comparison is claimed.
- Real Saxo market-data responses remained pending deployment at the time these preparation checks ran. The release is now deployed; see the acceptance section above for the current sign-in dependency. No orders, subscription changes or credentials were changed during preparation.

## Shared research and advisor verification — 28 September 2026

Deployed in `2026.09.28-combined-markets-investments`. `RequireResearchAccess` is used only by the market-data provider; the existing brokerage and OAuth access guard remains unchanged. Unauthenticated API calls are rejected before reaching the provider. Demo reads share the same market-only cached projection as Dan; no raw broker response or token is returned. Provider kill switches and Saxo access failures still apply.

Chat and delegated voice use `market_search` followed by `market_chart` for research, independent of the trading selector. SIM order preparation separately resolves a SIM listing and trading ticket; LIVE research UICs and historical prices must not become executable SIM terms. Research answers preserve source, currency, quote timestamp, separate chart/quote delays, staleness and unknown values. The advisor rejects a chart response from an alternative source instead of using it as Saxo evidence.

Validation: 96 Saxo/provider tests and three HTTP authorization/confirmation tests passed. Twenty-five advisor tests passed, including controlled chat and voice request flows in Demo and owner workspaces for delayed, stale, unavailable-quote and expired-sign-in responses. Those flows perform market reads only, preserve the evidence passed to the summarizer, and create no order proposals or submissions. Existing tests verify that spoken/text confirmation cannot bypass the explicit SIM order card. The provider projection also drops injected account/order/position fields from fixture responses.

Evidence: `artifacts/check-saxo-shared-research-results/saxo-research.trx`, `saxo-research-http.trx`, and `advisor-tests.txt` (124 scoped tests total). These use isolated test databases and mocked Saxo/AI responses; they do not establish real Saxo feed entitlement, actual model routing quality, or microphone acceptance. Real Demo search on Azure and localhost currently returns `SAXO_MARKET_SIGN_IN_REQUIRED`; feed-backed chart/source/delay and live chat/voice remain pending fresh sign-in.



## Partial availability, diagnostics and SIM holdings — 28 September 2026 (local, not deployed)

Dan asked for the missing Saxo market data on Markets and Investments to be fixed in the API as well as in the UI. The changes below are implemented and tested locally. Localhost uses the deployed production API, so none of the backend behaviour is live until an authorized release.

**Confirmed causes**
- Production still returns HTTP 502 `SAXO_MARKET_DATA_NO_ACCESS` for every checked one-month chart: MSFT, GMAB.CO, SIE.DE and VWS.CO. Rechecked in Demo on 28 September. Search works.
- The old provider requested history first. When history failed, the independent quote was never requested.
- 403 responses and provider codes containing "Access" were collapsed into one code without the operation or Saxo's own code. The budget handler then paused the whole `chart` service group for five minutes, so one denial blocked every symbol.
- SIM holdings return `priceType: None`, `ApproximatedPrice` and price 0. Saxo documents that the simulation environment has no market data for non-FX instruments. Those broker valuations cannot become current prices.

**Unresolved provider dependency**
- Saxo's own help pages give two documented causes of `NoAccess` on LIVE:
  - Market data for OpenAPI is disabled by default for non-FX instruments until the account holder enables it in SaxoTraderGO (My Profile → Other/Account Activity → Open API Access → Enable, then accept the terms): [how to enable market data](https://openapi.help.saxo/hc/en-us/articles/4418427366289-How-do-I-enable-market-data).
  - Some instruments need a paid price subscription: [NoAccess causes](https://openapi.help.saxo/hc/en-us/articles/4405160773661-Why-do-I-get-NoAccess-instead-of-prices).
- The deployed API discards Saxo's error code, so we cannot yet prove which cause applies. Once this change is deployed, the sanitized `diagnostics.providerCode` and the `saxo_market_failure` log line show the actual code per operation.
- Enabling OpenAPI market data means accepting an agreement, which only Dan can do. Nothing here suggests buying a subscription.

**API behaviour** (`MarketDataProvider.cs`, `SaxoRequestBudget.cs`, `Errors.cs`, `Program.cs`)
- The exact LIVE listing is resolved first (venue-qualified symbol; never guessed between venues). History (`chart/v3/charts`) and quote (`trade/v1/infoprices`) are then requested independently.
- A history failure keeps a valid quote, and a quote failure keeps valid history. Additive fields describe each part:

| Field | Values and meaning |
| --- | --- |
| `historyStatus` | `available`, `empty`, `stale`, `denied`, `unavailable` |
| `quoteStatus` | `available`, `stale`, `denied`, `unavailable`, `mismatch` |
| `historyRetrievedAt` | When the history was retrieved |
| `assetType` | Asset type of the resolved listing |
| `diagnostics` | `[{operation, code, status, providerCode, cooldown, fields}]` for each failed part. `fields` is present only for rejected requests: at most five sanitized parameter names from Saxo's `ModelState`, never the messages. |
| `historySamples` | Counts for the history response: `received`, `kept`, `outsidePeriod`, `missingIntervals` (intraday ranges only) and `dropped` by reason. Counts only. Added 29 September 2026; see "VWS intraday gap". |

- Outcomes by case:
  - **401 on either part:** `SAXO_MARKET_SIGN_IN_REQUIRED`, and the cached snapshot is removed.
  - **Both parts denied:** `SAXO_MARKET_DATA_NO_ACCESS`, with both diagnostics in `details`. The cache is removed, so later transient errors cannot bring the data back.
  - **Both parts transient:** the previous snapshot, explicitly marked stale, or `SAXO_MARKET_DATA_UNAVAILABLE` / `SAXO_RATE_LIMITED`.
  - **Transient history failure only:** earlier bars may be reused, marked `historyStatus: stale`.
  - **Quotes:** never reused as current prices. Historical closes never fill a missing quote.
- The Saxo codes are kept distinct: 400/404/422 map to `SAXO_MARKET_REQUEST_REJECTED`, 429 to `SAXO_RATE_LIMITED`, 403 to `SAXO_MARKET_DATA_NO_ACCESS` and 401 to sign-in required.
- `providerCode` is Saxo's `ErrorCode` only when it matches `^[A-Za-z][A-Za-z0-9_.-]{0,63}$`. Messages, raw bodies, tokens and account data are never returned or logged.
- Error responses may include a typed `details` object. The frontend `api()` helper now passes it on.
- A quote-only result needs a verified quote currency; otherwise `quoteStatus: mismatch`.
- Cooldowns:
  - A 403 on a chart or info-price read pauses only that instrument (AssetType and Uic) for five minutes.
  - 401, 429 and 5xx responses still pause the service group.
  - A cooldown repeats the operation's earlier status and provider code, with `cooldown: true`.

**UI**
- Markets and Investments each explain which part is unavailable (sign-in, history, quote, access denied with Saxo's code, or transient) and keep the usable parts on screen. A signed-out or expired LIVE market-data session is stated in the header control and, briefly and without buttons, in the chart area (see the section on the signed-out presentation at the end).
- Neither page tells users to check or buy subscriptions.
- The delay badge uses `quoteDelayMinutes`. Null means unknown; zero means "no reported delay", never "real-time".
- SIM positions use the LIVE research quote only when the Saxo listing symbol, asset type and currency match exactly, and only when the broker valuation is unreliable. The LIVE price is tagged `LIVE`, with quote time and delay.
- Estimated value and P&L are calculated from SIM quantity and open price in the instrument currency, and tagged `est.`.
- Without a verified FX source there is no currency conversion. Cross-currency weights stay unknown, and broker account totals are never replaced.
- Markets: `pairLiveQuote` in `markets-ui.js`. Investments: `wealth-ui.js`, handled by the Investments subagent.
- The advisor passes partial snapshots through unchanged. Its instructions treat `historyStatus` and `quoteStatus` separately and do not claim a missing subscription. API failure messages include sanitized `operation:status:providerCode` diagnostics.

**Validation (local)**
- 106 Saxo backend tests passed on the native ARM64 test host, including 36 market-data tests. They cover:
  - history denied with the quote available, and the reverse;
  - both parts unavailable;
  - expired authentication and cache invalidation;
  - instrument-scoped permission cooldown against a service-wide sign-in cooldown;
  - exact listing, asset type and currency;
  - sanitization of unsafe provider codes;
  - Demo research access without private LIVE brokerage;
  - rejected versus throttled requests.
- Evidence: `artifacts/check-market-partial-results/saxo-all-arm64.trx` and `market-data-arm64.trx`.
- The same class aborted with a test-host crash under the x64 host (the known emulation issue). That run is not counted as passing.
- The HTTP route test could not run because the `Banking` LocalDB test instance no longer exists. It was not recreated.
- Node tests:
  - five Markets pairing tests in `tests/ui/markets-live-quotes.test.mjs`;
  - 17 advisor market/context/tool tests.
- Browser checks at 1440, 1024 and 390 px (Graphite and Sand) used clearly synthetic response fixtures for the new contract: full, history-denied, quote-denied and both-denied. They covered the real Demo SIM positions paired with fixture LIVE quotes. No console errors other than the expected 502 network entry, no overflow, one `h1` and no one-sided borders.
- The real Demo state against the deployed API shows the access-denied state without evidence details, because the deployed API predates this change.

**Needed for final verification**
1. An authorized deployment of this backend, frontend and advisor.
2. A recheck of MSFT, GMAB.CO, SIE.DE and VWS.CO to read the actual `providerCode`.
3. If the code is `NoAccess`, Dan enables OpenAPI market data in SaxoTraderGO, then the same charts are rechecked.

## Post-deploy provider result — 28 September 2026
Deployed as `2026.09.28-saxo-partial-market-data`; release evidence is in `.azure/deployment-plan.md`. Authenticated Demo reads of the deployed API, via localhost:5444 → Azure:
- Search for Microsoft returns HTTP 200 with three listings: `MSFT:xnas` (UIC 261), `MSF:xetr` and `MSFT:xmil`.
- The one-month charts for MSFT, GMAB.CO, SIE.DE and VWS.CO now return **HTTP 200** with a partial snapshot. The listings resolved exactly to `MSFT:xnas`, `GMAB:xcse`, `SIE:xetr` and `VWS:xcse`, with currencies USD, DKK, EUR and DKK. Source is `Saxo LIVE`, asset type `Stock`, and no stale data is reused.
- All four give the same result. **History:** `historyStatus: denied`, with diagnostic `history / SAXO_MARKET_DATA_NO_ACCESS / HTTP 403 / providerCode null`; Saxo's 403 body carried no `ErrorCode`. **Quote:** `quoteStatus: denied`, with diagnostic `quote / SAXO_MARKET_DATA_NO_ACCESS / HTTP 200 / providerCode NoAccess`, meaning the info-price response itself marked its prices `NoAccess`.
- Quotes are now requested and evaluated independently of history. Here Saxo also denies the quote, so no price, previous close or delay is available. Nothing is replaced by historical data or zero.
- SIM holdings are unchanged: `priceType: None`, `ApproximatedPrice`, price 0. No LIVE quote can be paired, so current values stay unknown.

Interpretation: `NoAccess` for stocks on NASDAQ, Copenhagen and XETRA, with both the history and the quote endpoint denied, matches Saxo's documented "market data not enabled for OpenAPI" cause. A subscription gap for particular instruments usually affects specific instruments, not every listing on three venues. The code is the same for both causes, so this remains an inference, not proof. The fix is an account-holder decision in SaxoTraderGO (Open API Access → Enable and accept terms). Nothing was enabled, accepted or purchased.

## Recheck after OpenAPI market data was enabled — 28 September 2026

Dan enabled OpenAPI market data in the Saxo Trader app. Rechecked at about 21:55 and 22:20 Copenhagen time as an authenticated Demo visitor, through localhost:5444 → the deployed API (build `2026.09.28-saxo-partial-market-data`). Reads only: no orders, order checks, sign-ins or setting changes.

| Chart (1 month) | Exact listing | Quote | History |
| --- | --- | --- | --- |
| MSFT | `MSFT:xnas`, Stock, USD | Available: 509.22, previous close 516.17, Saxo time 20:00:00 UTC (NASDAQ close) | Unavailable: `SAXO_MARKET_REQUEST_REJECTED`, HTTP 400, `InvalidModelState` |
| GMAB.CO | `GMAB:xcse`, Stock, DKK | Available: 2,302, previous close 2,277, 15:10 UTC | Same 400 `InvalidModelState` |
| SIE.DE | `SIE:xetr`, Stock, EUR | Available: 278.45, previous close 278.30, 16:30:07 UTC | Same 400 `InvalidModelState` |
| VWS.CO | `VWS:xcse`, Stock, DKK | Available: 199.25, previous close 198.50, 15:10 UTC | Same 400 `InvalidModelState` |

- All four return HTTP 200 with source `Saxo LIVE`, `quoteDelayMinutes: 15`, `chartDelayMinutes: null` (no history), `stale: false`, and no cooldown.
- The LIVE session still worked, so Dan did not need to sign in again. The five-minute per-instrument 403 cooldown no longer applied because Saxo stopped returning 403.
- The entitlement is now proven for quotes. History fails for a different reason: Saxo rejects the chart request itself as malformed.
- SIM positions are unchanged (`priceType: None`, `ApproximatedPrice`, price 0). Markets and Investments now pair all four with the LIVE quote for the exact listing, asset type and currency. The price is tagged `LIVE` with time and 15-minute delay, and value and P&L are tagged `est.` in the instrument currency. For example, SIE 2 × 278.45 = 556.90 EUR est., and VWS 5 × 199.25 = 996.25 DKK est. Weights stay "—" because the holdings span three currencies. SIM broker account totals are unchanged.
- Browser check at 1440, 1024 and 390 px on both pages: no overflow, one `h1`, no one-sided borders, no console errors, no write requests and no subscription wording. The Markets header shows the LIVE price, today's change, "Delayed 15 min" and the quote time. The chart area names the missing history with Saxo's code, and the order ticket and positions stay usable.

## History request fix — 28 September 2026 (deployed 29 September; see below)

**Cause (strong evidence, confirmed only after deployment):** the provider sent `Mode=UpTo` without `Time` to `chart/v3/charts`. Saxo's reference defines `Mode` only relative to a supplied `Time`. Saxo's own [historical-market-data sample](https://github.com/SaxoBank/openapi-samples-js/tree/main/websockets/historical-market-data) sends `Mode=UpTo` only together with `Time`, and the [chart guide](https://www.developer.saxo/openapi/learn/chart) says a first request needs only `AssetType`, `Uic`, `Horizon` and field groups. The earlier 403 `NoAccess` masked this 400.

**Change:**
- `MarketDataProvider.cs` no longer sends `Mode`. The request is `AssetType`, `Uic`, `Horizon`, `Count` (≤ 1,200) and `FieldGroups=ChartInfo,Data,DisplayAndFormat`.
- A rejected request now records up to five sanitized parameter names from Saxo's `ModelState` in `diagnostics[].fields` and in the `saxo_market_failure` log line. If Saxo rejects another parameter after deployment, the field is visible without logging messages or bodies.
- Markets and Investments describe a rejected history request as "Saxo rejected the price-history request", with Saxo's code, instead of "temporarily unavailable". Investments hides Retry for this case, because retrying cannot help.

**Validation (local):**
- 107/107 Saxo backend tests passed on the native ARM64 host. New checks: chart requests send `Mode` only together with `Time`, `Count` ≤ 1,200, and ModelState field names are sanitized, while messages and account text never leave the provider.
- 60/60 UI node tests and 114/114 advisor tests passed.
- A browser check at 1440, 1024 and 390 px used the local frontend against the deployed API, which currently returns this exact 400. Both pages showed the new wording, with no overflow, console errors or writes. A synthetic `history-rejected` fixture check on Markets gave the same result.

**Needed for final verification:** an authorized deployment (delegated to GPT-6 Luna, medium). Afterwards, recheck the four one-month charts and the other ranges for `historyStatus: available`, bars in the listing currency and `chartDelayMinutes`.

## History-request fix deployed — 29 September 2026

Dan approved the release ("Godkendt"). GPT-6 Luna (medium) deployed it as `2026.09.29-saxo-history-request`, SCM `3b5792c0-406e-4731-a98b-de97bda9497c`, 06:46:51–06:46:58 UTC. Rollback: `/home/Banking/releases/before-saxo-history-request-20260929.zip`. Evidence is in `.azure/deployment-plan.md`.

**Provider result: not yet verifiable.**
- Both of Dan's Saxo sessions expired overnight. At 08:40 Copenhagen time, before the deployment, search and all four charts already returned HTTP 503 `SAXO_MARKET_SIGN_IN_REQUIRED` on the previous build, and the shared SIM portfolio reported an expired session.
- After the deployment, all 32 Demo chart reads (4 instruments × 8 ranges) return the same 503. Saxo therefore has not yet answered the corrected chart request, and whether the 400 `InvalidModelState` is gone remains unconfirmed.
- The likely cause of the expiry, Saxo's refresh-token lifetime without activity, is an inference; the refresh logic was not investigated here.
- Demo LIVE portfolio and orders still return 403 `SAXO_LIVE_OWNER_REQUIRED`.
- Browser check at 1440, 1024 and 390 px, with all eight Markets ranges switched:
  - Markets shows the sign-in-required state, with no invented values and Retry available.
  - Investments shows the expired SIM session.
  - No overflow, console errors other than the expected 503 responses, writes or subscription text.

**Required owner action:**
1. In his private Live workspace, Dan opens Markets and chooses "Log ind for markedsdata" (Sign in for market data), then completes the Saxo LIVE sign-in in the same tab. (From the 29 September UI change, the same action is the "Sign in" button on the "Saxo LIVE market data · Session expired" control at the top right of Markets or Investments.)
2. The shared SIM holdings could be read again at 08:58, so "Forbind Saxo SIM" (Connect Saxo SIM) is needed only if that session expires again.

Afterwards, recheck every range for bars, `chartDelayMinutes` and quotes, then repeat the browser check with a rendered chart.

## Provider verification after Dan's LIVE sign-in — 29 September 2026

Dan signed in to Saxo LIVE market data again. Rechecked from about 09:26 to 09:33 Copenhagen time on build `2026.09.29-saxo-history-request`, as an authenticated Demo visitor. API reads went through the Azure origin; the browser check also used Azure, because another agent is editing the local sign-in UI. Reads only.

**Result: the history-request fix is confirmed.** All 32 chart reads return HTTP 200 with `historyStatus: available` and `quoteStatus: available`. Every one reports `chartDelayMinutes: 15`, `quoteDelayMinutes: 15`, `stale: false`, source `Saxo LIVE` and no diagnostics. The 400 `InvalidModelState` is gone, which confirms the cause: `Mode` sent without `Time`.

| Instrument | Exact listing | Bars per range | Quote (Saxo time, UTC) |
| --- | --- | --- | --- |
| MSFT | `MSFT:xnas`, Stock, USD | 1d 78 (28 Sep 13:30→19:55), 5d 130 (22 Sep 13:30→28 Sep 19:45), 1mo 20, 3mo 64, 6mo 126, ytd 185, 1y 251, 5y 261 | 509.22, previous close 516.17, 28 Sep 20:00:00 |
| GMAB.CO | `GMAB:xcse`, Stock, DKK | 1d 3 (29 Sep 07:00→07:10), 5d 129, 1mo 22, 3mo 67, 6mo 125, ytd 186, 1y 250, 5y 261 | 2,324, previous close 2,302, 29 Sep 07:11:13 |
| SIE.DE | `SIE:xetr`, Stock, EUR | 1d 3 (29 Sep 07:00→07:10), 5d 137, 1mo 22, 3mo 67, 6mo 129, ytd 190, 1y 254, 5y 261 | 280.65, previous close 278.45, 29 Sep 07:11:43 |
| VWS.CO | `VWS:xcse`, Stock, DKK | 1d 3 (29 Sep 07:00→07:10), 5d 89, 1mo 22, 3mo 67, 6mo 125, ytd 186, 1y 250, 5y 261 | 194.70, previous close 199.25, 29 Sep 07:11:33 |

**Range spans**
- Daily ranges start on 31 Aug (1mo), 29 Jun (3mo), 30 Mar (6mo), 2 Jan (ytd) and 29 Sep 2025 (1y). The 5y weekly range starts on 4 Oct 2021.
- They end on 28 Sep for NASDAQ and 29 Sep for the European listings.
- US counts reflect the Labor Day holiday. The European 1d range shows today's first bars only, consistent with the 15-minute delay; before NASDAQ opens, MSFT 1d shows the last full session.

**Open observation (not investigated further)**
- VWS 5d has 22 bars per day versus 32 for GMAB on the same exchange. The same 11:00–13:15 UTC window is missing every day.
- From Demo we cannot tell whether Saxo returns no samples in that window or returns samples that fail the candle validation (for example High below Close).
- A sanitized count of dropped rows in the diagnostics would settle this. That would be a backend change and needs a separate approval.

**Search and holdings**
- Search for Microsoft returns HTTP 200: `MSFT:xnas` (UIC 261), `MSF:xetr` and `MSFT:xmil`.
- SIM positions are still `priceType: None`, `ApproximatedPrice`, price 0.
- Markets positions and Investments tiles show the LIVE price tagged `LIVE` and value/P&L tagged `est.` in each instrument's currency. At 09:29, for example: SIE 2 × 280.15 = 560.30 EUR est., and VWS 5 × 194.85 = 974.25 DKK est. (−2.09%).
- Weights stay "—". Broker totals remain Saxo SIM's own figures (account value 999,952.34 EUR, invested 1,450.04 EUR, unrealised P&L "—").

**Demo boundary:** Demo reads of Dan's LIVE portfolio and orders return 403 `SAXO_LIVE_OWNER_REQUIRED`, as does LIVE status.

**Browser, Azure origin, 1440/1024/390 px:**
- Markets: MSFT candles render for all eight ranges, with the OHLC/volume legend, the average-cost line, source/delay text and an empty error line. Line, Area and Candles switch correctly, and MA 50 toggles. Switching to SIE shows its chart, price, today's change and day range.
- Investments: the chart renders on all eight ranges. The meta line reads "Saxo LIVE · History … · chart delayed 15 min · Quote … · delayed 15 min". Switching holding redraws the chart.
- No horizontal overflow, one `h1`, no one-sided borders, no subscription text, no console errors and no write requests.
- Not browser-checked: localhost:5444, which is mid-change by another agent.

## VWS intraday gap — investigation and diagnostic (29 September 2026, deployed; cause confirmed)

Dan asked for the recurring VWS 5-day gap to be checked and fixed.

**Evidence (Demo reads of the deployed API)**
- Only VWS is affected. On 23, 24, 25 and 28 September, the 15-minute samples from 11:00 to 13:15 UTC are missing: 22 samples a day instead of 32. GMAB, NOVOb, MAERSKb, DSV, ORSTED, CARLb and DANSKE on the same exchange each return all 32.
- Trading did happen in that window. Saxo's daily VWS bars contain 14–21 % more volume than the sum of the visible 15-minute samples; for GMAB the sums agree within 4 %. On 23 and 28 September the daily low or high also lies outside every visible 15-minute sample.

**Cause: inferred, not confirmed**
- Saxo's v3 `ChartSample` schema has trade OHLC and volume, bid/ask OHLC, `Interest`, `Growth` and `MarketTradingState`. It has no interpolation flag.
- The previous parser dropped a sample only for a missing or unparseable time, a future time, a missing or non-positive O/H/L/C, or a high/low that does not bracket open/close. There is no outlier, volume, session, time-of-day or interpolation filter. Duplicate timestamps are replaced by the later sample. The 1d/5d ranges keep whole UTC trading days.
- None of these rules can remove a valid sample. An identical window, every day, for a single instrument, points to Saxo either not sending 15-minute samples for VWS in that window or sending ones without usable trade prices. The deployed API did not count rejected samples, so which of the two cannot be told from outside.

**Change (backend only)**
- `historySamples` is added to every chart snapshot. It reports `received`, `kept`, `outsidePeriod` (valid samples outside the selected range), `missingIntervals` and `dropped`.
  - `missingIntervals` counts empty horizon slots between the first and last sample of each UTC day. It applies to 1d/5d only and includes real exchange breaks; it is null for daily and weekly ranges.
  - `dropped` counts rejected samples by reason: `missingTime`, `futureTime`, `missingPrice`, `quoteOnly` (bid/ask samples without trade prices), `nonPositivePrice`, `inconsistentRange` and `duplicateTime`, plus `total`.
  - It carries counts only: no prices, timestamps, instrument or account data.
- A `saxo_market_samples` log line (range and counts only) is written when samples are dropped (Information) or intervals are missing (Debug).
- The acceptance rules are unchanged. Every well-formed trade sample is kept exactly as Saxo sent it. Malformed samples are counted, not repaired, and gaps are never filled; bid/ask samples are not mixed into the trade series.

**Validation:** 114/114 Saxo tests on the native ARM64 host. Seven new tests cover:
- each rejection reason, and that well-formed edge cases are kept (zero volume, flat OHLC, missing volume, offset or seven-digit timestamps, extra bid/ask and trading-state fields);
- a missing 11:00–13:15 block as absent, close-only, quote-only and inconsistent samples: the gap stays unfilled, and only the cause's counter changes;
- complete days reporting zero missing intervals;
- a counts-only JSON shape.

**Confirmation after deployment:** read `historySamples` for `VWS.CO` 5d.
- `dropped.total` 0 with `missingIntervals` 40 means Saxo sends nothing there. That is a provider data gap to report to Saxo; Banking correctly shows no data.
- A non-zero reason counter identifies the malformed field for a follow-up decision.

**Confirmed after deployment (build `2026.09.29-saxo-samples-signin-ui`, 29 September 2026 at 11:19 Copenhagen time, Demo on Azure):**
- `VWS.CO` 5d: Saxo sent 1,200 samples. 97 were kept and 1,103 lie outside the five-day range. **All seven drop counters are 0**, and `missingIntervals` is 40 (10 per full day × 4 days).
- Saxo therefore sends no 15-minute VWS samples between 11:00 and 13:15 UTC. Banking drops nothing and shows no invented data.
- For comparison, GMAB, SIE and MSFT 5d return 0 dropped and 0 missing intervals. VWS 1d (today, 5-minute samples, 26 so far) has no gap yet, because the window had not been reached.
- The cause is a provider data gap. Only Saxo can fill it; report it to Saxo support if it matters.

**UI note (local, part of the short-range change):** the chart library compresses intraday gaps. When `missingIntervals` is above 0, Markets and Investments therefore show one muted line under the chart: "Saxo sent no data for some 15-minute intervals (40 missing)." Real VWS 5d data shows exactly this.

## Signed-out presentation — 29 September 2026 (deployed in `2026.09.29-saxo-samples-signin-ui`)

Only the presentation of the two sign-in states changed; the API, the error codes, the sign-in handlers and URLs, and who may sign in are the same.

- **Header control.** Markets and Investments show LIVE market data as a header pill, "Saxo LIVE market data · Session expired" for `SAXO_SIGN_IN_REQUIRED` and `SAXO_MARKET_SIGN_IN_REQUIRED`, or "· Not signed in" for `SAXO_ACCESS_REQUIRED`. Dan's pill has one "Sign in" button (`purpose: market-data`, trading environment preserved). Demo sees the state without a button. Under the LIVE trading environment there is a single LIVE pill, because both use the same LIVE sign-in.
- **Content.** The chart area, watchlist notice, quote card and search dialog say "Saxo LIVE market data is not signed in." or "Session expired", with no sign-in and no Retry. `SAXO_MARKET_DATA_NO_ACCESS`, a rejected history request, an unavailable quote, a listing mismatch, rate limits and transient failures keep their messages and Retry.
- **Trading connection.** The same pattern applies to the SIM or LIVE broker session ("Saxo SIM · Not signed in" / "Session expired"); the full-width Investments banner and the Markets account, ticket and holdings sign-in panels are gone.
- Design and verification: [DESIGN.md](../DESIGN.md), "Saxo sign-in control — 29 September 2026". The `missingIntervals` chart note under "Not done" above was not part of this change.

## Short ranges, live refresh and real-time readiness — 29 September 2026 (deployed as `2026.09.29-saxo-short-ranges`)

Dan wants better short-term chart information before buying a stock.

**Saxo limits (chart/v3 reference, checked 29 September 2026):**
- Allowed `Horizon` values in minutes: 1, 2, 3, 5, 10, 15, 30, 60, 120, 180, 240, 300, 360, 480, 1440, 10080, 43200, 129600 and 518400.
- `Count` is at most 1,200 samples per request.
- `Mode` is used only together with `Time`, so neither is sent.

**Ranges**

| Range | Horizon | Count | Window |
| --- | --- | --- | --- |
| 1H (new) | 1 min | 120 | Latest 60 minutes of returned samples; after the close, the last hour of that session |
| 1D (changed from 5 min × 400) | 1 min | 600 | Last UTC trading day |

- 600 covers the longest of the three sessions: XETRA 510 minutes, Copenhagen 480 and NASDAQ 390.
- `missingIntervals` now covers 1h, 1d and 5d, at each range's horizon.
- Illiquid instruments can legitimately have minutes without trades. Markets and Investments show one muted line under the chart, "Saxo sent no data for some N-minute intervals (n missing).", from the shared `saxoGapNote()`; nothing is filled in.
- The advisor `market_chart` tool accepts `1h`.

**Live refresh**
- **Polling:** on 1H and 1D, the selected chart and its quote refresh every 20 seconds while the tab is visible, on both Markets and Investments. Other ranges keep the one-minute cycle.
- **Hidden tab:** polling pauses. When the tab becomes visible again, the page refreshes immediately if the data is 20 seconds or older.
- **Stop:** polling stops on sign-in-required, access denied, owner-only, disabled, listing and rejected-request states. Transient and rate-limited failures keep the earlier data, marked as before.
- **Source line:** shows "Updated hh:mm:ss", the API retrieval time with seconds, plus "refreshes every 20 s while visible".
- **Server freshness** (shared by every Demo and owner client, because they use the same projection): 15 seconds for 1h/1d and 30 seconds for the other ranges. Several clients polling the same instrument therefore cause about one Saxo chart request and one info-price request per 15 seconds; requests that miss the cache at the same moment can briefly add a duplicate. `SaxoRequestBudget` (90 per minute per service group and token, plus cooldowns) still applies.

**Delay label (rule unchanged)**
- A positive delay reads "Delayed N min". Zero reads "No reported delay", never "Real-time". A missing, invalid or negative value reads "Delay unknown".
- Saxo documents `DelayedByMinutes` as "if set", so an absent value stays unknown.
- The rule lives in one shared helper, `saxoFeed()` in `saxo-session.js`, and in `Delay()` in `MarketDataProvider.cs`.

**Real-time path: declined by Dan (29 September 2026)**
- Saxo's help ("Why are quotes still delayed after I subscribe to market data") says real-time non-FX prices over OpenAPI LIVE need both of these:
  - a real-time entitlement for that exchange on Dan's account (SaxoTraderGO web: Account → Other → Subscriptions). Depending on the account and exchange, this may already be included rather than paid; the account has not been checked;
  - the API session upgraded from the default TradeLevel `OrdersOnly` to `FullTradingAndChat`.
- Where those apps' charts came from (read-only code review, 29 September 2026):
  - **Trading-Agents-Saxo:** chart history came from Yahoo Finance through `yfinance` (`apps/api/main.py`, `/stock/{ticker}/history` → `yf.Ticker(...).history(...)`). The live price was Saxo `trade/v1/infoprices`, polled every 1.5 seconds and sent to the chart over SSE. Charts were drawn with lightweight-charts.
  - **Trader:** the cockpit chart used Saxo `chart/v3/charts` for Stock/ETF/fund listings only. Quotes came from Saxo info-price subscriptions, falling back to Yahoo `query1.finance.yahoo.com` chart and quote polling. Separate TradingView widgets (ticker tape, heatmap, advanced chart) load TradingView's own data.
  - Neither app selected CFD or FX instruments, changed the session TradeLevel or read Saxo's delay flag. Their "real-time" look therefore came from Yahoo/TradingView data and frequent polling, not from undelayed Saxo stock data.
  - Yahoo usually shows near-real-time US prices, while many European listings there are also delayed. That is a provider claim, not verified here.
  - Banking's confirmed rule is Saxo LIVE only, with no Yahoo. Using Yahoo or TradingView prices would need a new decision.
- Dan's earlier Trader and Trading-Agents-Saxo apps were checked on 29 September 2026. They updated prices continuously: a WebSocket info-price subscription at 1 second, or polling every 1.5 seconds. Neither read `DelayedByMinutes` or changed the session TradeLevel, and both defaulted to SIM. That shows frequent updates, not that stock prices were real-time.
- Real-time data goes to one session at a time. Signing in to SaxoTraderGO or SaxoInvestor downgrades the API session to delayed data again, and upgrading the API session downgrades the platform's session.
- Dan decided on 29 September 2026: "Im not going to subscribe for that". Banking stays on 15-minute-delayed prices, with no subscription and no TradeLevel or capability upgrade ([decision](decisions.md)).

**Licensing guard: not needed now**
- Real-time exchange data under a non-professional subscription is usually for personal use only.
- `SaxoMarketDataProvider.ForAudience()` in `MarketDataProvider.cs` is the single place, applied after the shared cache on every chart response, for a future owner-only real-time rule. Today it passes the delayed projection through unchanged.
- Because real-time was declined, no owner-only rule is needed and the hook stays a pass-through. If that decision is ever reversed, decide the Demo rule first; otherwise Demo would receive the same shared projection.
- No redistribution of real-time data to Demo is implemented.

**Validation (local)**
- Saxo backend tests: 122/122 on the native ARM64 host. They cover documented horizons and counts, full-session coverage, the 1H window during and after a session, one-minute missing intervals, delay labels for 15, 0, null and absent, and 15- versus 30-second shared freshness.
- UI node tests: 82/82, including the delay classification, the polling rule (visible, hidden, blocked and long ranges), the "Updated" time, the gap-note text and the Investments missing-interval field.
- Advisor tests: 114/114.
- Browser check on localhost:5444 at 1440 and 390 px (local frontend, deployed API):
  - **1D on SIE (real API, which still returns 5-minute bars until deployment):** Markets and Investments made 2 chart requests in 45 seconds while visible, 0 in 45 seconds while hidden, and 1 immediately when visible again. "Updated hh:mm:ss" changed on each refresh.
  - **1H:** used a clearly synthetic fixture, because the deployed API does not accept `1h` yet. It rendered on both pages with the gap note.
  - **Gap note with real data:** VWS 5d from the deployed API shows "Saxo sent no data for some 15-minute intervals (40 missing)." under the chart on both pages at 1440 and 390 px. It is hidden on 1M.
  - No overflow, one `h1`, no one-sided borders, no console errors and no writes. At 360–390 px the nine range buttons now fit on one row.
- Needed for final verification: an authorized deployment, then a recheck of 1H/1D bar counts and `missingIntervals` against Saxo.

**Deployed and verified — 29 September 2026**
- The first ZIP deploy (11:20 UTC) was accepted by App Service, but the old build kept running, so it was rolled back.
- A retry with the same verified package plus an explicit App Service restart succeeded. Details are in `.azure/deployment-plan.md`.
- Demo on Azure, 13:38 Copenhagen time: all four instruments return 1-minute 1H/1D bars, delayed 15 minutes, with 0 samples dropped.
  - MSFT 1D: 390 bars, the full session.
  - GMAB 1H: 33 minutes without trades, shown by the gap note.
- Markets polling was verified on Azure: 2 refreshes in 45 seconds while visible, 0 while hidden, and 1 on return.
- Investments could not be checked, because the shared SIM session had expired.
- VWS 1D contains 1-minute samples from 11:00 to 11:23 UTC today. The recurring VWS gap seen earlier is in the 15-minute (5d) series.

## Per-response delay labels — 1 October 2026

Feature implementation in the authorized Banking cloud worker; not deployed. Supersedes the old combined delay-label wording above, while retaining the subscription/entitlement and audience decisions.

`ChartDelayMinutes` and `QuoteDelayMinutes` are independent response fields. The shared `saxoDelayLabel()` renders “Chart · 15 min delayed” and “Price · 15 min delayed” only when that part reports 15; other positive values use their actual number. Zero is “No reported delay”, missing/invalid is “Delay unknown”, with equivalent English/Danish copy. Legacy `delay` prose and retrieval timestamps never supply a missing delay. Portfolio-reported prices retain their own delay field. No real-time/executable-price claim is made.

`Chart retrieved` uses `HistoryRetrievedAt` and `Price retrieved` uses the matching snapshot's `RetrievedAt`, including the date and seconds. Retained data keeps its original timestamps and delays. Unknown history retrieval stays unknown rather than borrowing a fresh price's timestamp. Chart and price statuses are rendered independently; only retained failed parts show “Update failed · showing previous data”. Authorization, entitlement, rejected listing and release failures clear affected retained data. Stale research quotes cannot become current portfolio estimates. Watchlist sparkline/price metadata is visible and wraps within existing rows/cards; tile sparklines use their own history response. Switching instrument/range ignores obsolete replies; newer quote responses cannot be replaced by an older overlapping read.

The initial isolated verification uses synthetic browser interception, never a business backend/database or production mutations. Browser suite: `node tests/ui/saxo-response-delay.browser.cjs` (Playwright with system Chromium; `BANKING_CHROMIUM_PATH` and `BANKING_PLAYWRIGHT_PATH` can select installed equivalents). Unit suite: `node --test tests/ui/saxo-response-delay.test.mjs tests/ui/market-live-refresh.test.mjs tests/ui/markets-live-quotes.test.mjs tests/ui/investments.test.mjs tests/ui/saxo-signed-out.test.mjs tests/ui/saxo-market-session.test.mjs`. Screenshots are generated under ignored `artifacts/saxo-response-delay/`. Isolated provider tests: filter `FullyQualifiedName~SaxoMarketDataTests`; normal frontend-host suite is also Linux-compatible. Windows LocalDB fixtures and private owner acceptance remain separate and unrun; authorized live Demo evidence follows below. Production-only owner acceptance is SAXO-DELAY-01–04 in the production test plan.

Current cloud results: Release solution build passed with 0 warnings/errors; 55 isolated SaxoMarketDataTests passed, 18 frontend-host tests passed, and 66 focused frontend Node tests passed (none skipped). Fourteen browser scenarios passed: both pages at 1440/1024/390 px in Graphite/Light plus Danish at 390 px; compared with Accounts screenshots, no horizontal overflow, uncaught JavaScript errors, CSP violations or one-sided borders. Interactions cover differing delay fields, cache reuse, atomic refresh, partial chart/quote failure, retained whole-response failure, denial clearing, instrument/range changes, overlapping reads and tile sparkline metadata. These isolated results do not establish live-provider acceptance. The separately authorized read-only Demo integration check follows below; private owner acceptance and Windows LocalDB tests remain unrun.

### Read-only Demo integration — 1 October 2026

Verified current cloud frontend source at `e240fdcf0e14c986efff2cbba6b9f30616776494` against the actual deployed API, using the repository's frontend-only HTTPS transport and system Chromium. The initial anonymous browser had `role: null` and market requests returned HTTP 401. Dan explicitly selected Public Demo for the follow-up, allowing the existing “Try Demo” flow to establish a Demo browser session. Subsequent `/api/browser/status` returned `role: Demo`; no credentials or cookies were copied between environments. This is Demo acceptance, not Dan/private LIVE acceptance.

Twelve browser stages matched visible independent chart/price labels and both retrieval timestamps to real HTTP 200 `/api/markets/chart` responses for the matching symbol and selected range:

- Markets: `MSFT:xnas` at `1mo`, `1d`, `5d`, manual refresh; then `AAPL:xnas` at `5d`, including mobile.
- Investments: existing Demo SIM holdings, with LIVE research history/quotes for `SIE:xetr` at `6mo`; switching to `MSFT:xnas` at `6mo` and `1d`, automatic 20-second refresh, and mobile.
- Both pages fit at 1440 and 390 pixels without document overflow. The final complete repeat had no uncaught browser errors, API failures or blocked mutation attempts. One earlier untyped navigation error was not reproduced by a focused navigation repeat or the final full repeat; no cause or source fix is established.

Observed responses reported `source: Saxo LIVE`, `chartDelayMinutes: 15`, `quoteDelayMinutes: 15`, `historyStatus: available`, and `quoteStatus: available`. Each displayed label matched its actual field; these observations do not establish a universal delay. Cached responses retained their original `historyRetrievedAt`/`retrievedAt`; Investments automatic refresh subsequently changed the matching displayed timestamps. Previous-session quote times remained separate from feed delay and retrieval time. No provider response was fabricated or intercepted with fixture data.

Scope limits: Demo watchlists were empty and were not mutated, so populated watchlist integration remains unverified. Live zero/missing/differing delays and partial/failed provider responses were not observed; prior isolated tests cover those semantics, not live acceptance. Private Dan LIVE views, new Saxo sign-in, trades, subscriptions, database access and production data/settings mutations were not exercised. Browser traffic allowed GET/HEAD plus Demo session creation and the existing SIM-only read-only portfolio preview; the preview endpoint was inspected to call `SaxoReadClient.Read`, with no order/write surface. No business backend or database was launched.

Azure root and `/api/runtime-info` returned HTTP 200. Runtime still reports `2026.09.29-saxo-session-keepalive`; deployed `/saxo-session.js` SHA-256 remains `78241ca4f1a862819bfca931a3845ad7d7345f7b0110c4d85377044be66205e9`, lacks `saxoDelayLabel`, and differs from tested cloud source `a668b29c76b49b31b2637ae568df269b115233b4b5348ef2d7e8bfe579b42519`. This verifies the merged frontend against the deployed API; the feature frontend itself is not deployed. No deployment was performed. Application source stayed unchanged; builds/unit suites were not repeated for this evidence-only documentation update.
