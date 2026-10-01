# Saxo read-access operations

Status: 28 September 2026, deployed as `2026.09.28-saxo-live-readiness` and verified on Azure and localhost:5444 through the same production API. LIVE access remains disabled; no LIVE credentials, permissions or orders were changed. No new real or simulated orders were submitted during this work.

## Release and activation

1. Release the backend, frontend modules (including `saxo-session.js`), advisor bundle and frontend-host asset allowlist together. Do not publish only the browser changes: session-bound OAuth completion requires the new API.
2. Dan reviews and accepts Saxo's terms. Confirm the licence scope for workplace demonstrations, shared SIM access and market-data presentation separately; code cannot grant those permissions.
3. Install the approved LIVE application credentials only in protected Azure settings: `Saxo__LIVE__AppKey`, `Saxo__LIVE__AppSecret`, `Saxo__LIVE__RedirectUri`. Register the Azure `/api/saxo/auth/callback` URL with Saxo. Never copy credentials into localhost, browser storage or source.
4. Explicitly set `Saxo__LIVE__ReadEnabled=true` when ready for the authorized read test. It defaults to false. The owner signs in from Investments or Markets and completes the return in the same browser tab and Banking session. Azure captures the authorization code; JavaScript only holds a short-lived completion proof. A cancelled or expired flow requires a new sign-in.
5. Compare LIVE data against Saxo's platform at aligned timestamps: accounts/currencies, booked and available cash, unsettled transactions, quantities, opening prices/fees, current prices, valuation quality and margin. Record discrepancies and rounding tolerances based on the instrument. Missing values remain unknown.
6. Recheck Azure and localhost:5444 through the same API, including owner logout, Demo isolation, environment switching, advisor reads and sign-in return. LIVE order writes remain server-rejected regardless of the switch or credentials.

## Controls

| Control | Behavior |
| --- | --- |
| `Saxo__ReadEnabled=false` | Stops the portfolio/activity read client. Defaults to enabled. It is not a provider-grant revocation. |
| `Saxo__LIVE__ReadEnabled=false` | Stops LIVE portfolio/activity reads specifically; default false. |
| Investments → Disconnect | Owner-only; deletes the app's encrypted session and blocks configured token fallbacks. Cancels pending sign-ins for that environment. Does not cancel open orders or revoke the grant at Saxo. Revoke the provider grant through Saxo when required. |
| `Saxo__SIM__TradingEnabled=false` | Existing server-side SIM execution kill switch. Checked again immediately before submission. LIVE execution has no enable setting in this implementation. |
| `Saxo__SIM__MaxOrderNotional` | Default 20,000 in the instrument currency. |
| `Saxo__SIM__MaxDailyNotional` | Default 100,000 per account and instrument currency over a rolling 24 hours. |

The notional controls count gross attempted entry value, including unsuccessful/uncertain reserved submissions, without FX conversion or buy/sell netting. They are conservative submission limits, not a complete portfolio exposure model. Three distinct submissions per minute are allowed across the shared SIM service. A protected ledger and exclusive submission lock persist across restarts. Existing immutable proposal, broker precheck, explicit confirmation, single-use claim and post-submission verification remain in force. Unsupported asset types/order types and invalid tick/lot increments fail closed.

## Provider health and request behavior

- Shared read results/errors cache for 15 seconds, isolated by environment and credential identity; original observation timestamps retained. Browser-specific tickets/receipts are not cached here.
- Outbound data/order requests have a per-environment/service-group/token budget of 90 per minute. Provider reset/Retry-After headers can pause requests sooner. 401/403 pause that identity for five minutes; 5xx pauses for 15 seconds. Exception (28 September 2026, not yet deployed): a 403 on a market-data chart/info-price read pauses only that instrument (AssetType+Uic) for five minutes, because entitlement is per listing. Market-data failures additionally emit a sanitized `saxo_market_failure` line (operation, HTTP status, Banking code, Saxo ErrorCode matching a short identifier pattern, cooldown flag). Writes are never automatically retried.
- Revoked refresh tokens stop further refresh; transient refresh failures enter a cooldown. Concurrent readers share one successful refresh. Reauthentication uses Saxo's own page, never Banking password fields.
- Session keep-alive (29 September 2026; deployed in `2026.09.29-saxo-session-keepalive`, 15:38 UTC, see `.azure/deployment-plan.md`). Saxo access tokens last about 20 minutes. Refresh tokens last about 60 minutes after the last refresh, and Saxo allows a session to be extended for as long as it keeps being refreshed ([Saxo help](https://openapi.help.saxo/hc/en-us/articles/4416637029649-How-do-I-get-an-access-token-that-lasts-longer-than-the-24H-token)).
  - Before this change, Banking refreshed only when a request needed a token. An idle hour, or a night, therefore ended both SIM and LIVE sign-ins. Observed: SIM last read around 10:41 UTC and expired by 11:44 UTC; LIVE expired overnight.
  - `SaxoSessionKeeper` now checks every 5 minutes (`Saxo:KeepAliveMinutes`, 1–15; `Saxo:KeepAlive=false` turns it off). It refreshes a stored SIM or LIVE session when the access token or refresh token would lapse before the next check. LIVE is kept only while LIVE reads are enabled.
  - It never signs in, never changes session capabilities and reads no account data. Changes of state are logged as `saxo_session_keepalive market=… outcome=…`, without tokens.
  - Saxo refresh tokens are single-use. If a refresh is rejected because another process (for example the old and new app during a restart) already rotated the token, the stored newer session is used instead of marking the sign-in disconnected.
  - A sign-in is still lost when Saxo revokes it, when the owner disconnects, or when the API is down for longer than the refresh-token lifetime.
  - Dan's earlier Trader app could last 24 hours because it supported a manually pasted Saxo 24-hour developer token (SIM only, not refreshable). Its OAuth refresh, like Banking's before this change, happened only when requests were made.
- Provider failures emit a sanitized `saxo_provider_failure` warning in existing application logs (environment, group, status only). `Banking.Saxo` meter, `saxo.provider.responses` counter: environment, service group and HTTP status only. No tokens, account keys, instruments or amounts. Connect this meter to the chosen production monitoring collector before claiming operational alert coverage; no collector or external alerts were configured here.
- Current caches and provider budgets are process-local. Before scale-out, provide a distributed quota coordinator and shared OAuth pending-state handling. The current release assumes one API instance.
- On repeated 400/409, inspect sanitized error codes and validate inputs; do not loop on the same request. On 401/403, restore authorization/permissions; on 429 respect cooldown. On 5xx/timeout, retain known observations with freshness/error state. Unknown order execution must be reconciled with Saxo before any new attempt.
- Position/order/activity lists are bounded at 100 with incomplete-coverage flags; accounts are limited to complete responses of at most 20. Decide whether pagination is necessary after seeing the actual portfolio; never describe a bounded partial list as complete.

## Continuing acceptance record

Read this alongside [the complete disclaimer checklist](saxo-live-readiness.md). The implementation does not certify fulfilment of every declaration.

- Final scoped runs: 74 Saxo tests, 7 public-access/authentication tests and 61 UI/advisor checks passed. See the readiness checklist for logs and the earlier aborted Windows test-host runs. Automated fake-provider coverage: owner/Demo and SIM/LIVE boundaries, bound OAuth completion/replay/cancellation, refresh/revocation, cache isolation/concurrency, rate/reset handling, unknown/fractional data, malformed precision, tick/lot checks, distinct-ticket limits and no uncertain-write replay.
- Browser evidence: isolated synthetic LIVE tab, immediate old-data clearing and rapid SIM/LIVE transitions, disconnect enablement, missing valuation/unknown asset handling, precision and responsive layouts in Graphite and Light. The normal local frontend also still reads deployed SIM data. Synthetic browser fixtures were confined to an agent-created tab, not shipped in the application.
- Azure and localhost:5444 release acceptance passed on 28 September 2026: matching build/assets/shared data, Demo LIVE denial, advisor/market-history reads and actual SIM portfolio/orders/activity reads. Real LIVE access, provider-platform value reconciliation and real LIVE expiry/revocation remain pending activation.
- Real SIM sell/exit acceptance and the full buy/sell × Day/GTC × supported child-stop/TP matrix remain required before considering LIVE trading. Existing entry fills do not prove every combination. Market orders, modification and cancellation are not added by this release.
- Before each Saxo-related release, and monthly while LIVE is enabled, the maintainer reviews [versioning/deprecations](https://www.developer.saxo/openapi/learn/versioning-and-obsolescence-policy), records announced retirement dates and reruns affected SIM regressions. This is an operating procedure, not an installed recurring automation.

Instrument validation references: [reference data](https://www.developer.saxo/openapi/learn/reference-data), [order placement](https://www.developer.saxo/openapi/learn/order-placement), and the provider's instrument-details tick/lot fields. Never invent a usable price or interpret an acknowledgement as a fill.

## LIVE credential configuration — 28 September 2026

Dan manually saved the LIVE application settings in Azure after the tool-based write was blocked. Read-only verification confirms AppKey/AppSecret are present, RedirectUri exactly matches the Azure `/api/saxo/auth/callback`, and `Saxo__LIVE__ReadEnabled=true`. Credential values were not printed. Both Azure and localhost:5444 still pass deployed build/asset/shared-account parity and reject Demo LIVE portfolio/orders access. LIVE order handlers remain SIM-only. This verifies configuration presence, not provider acceptance of the keys: Dan's owner-session LIVE OAuth sign-in and actual data reconciliation are still pending. The earlier tool-created restricted credential transfer file has not been successfully removed; cleanup remains unresolved and must not be reported complete.
