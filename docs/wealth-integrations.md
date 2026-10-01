# Wealth integrations — local increment

Verified 13 September 2026. These changes are local, not deployed. Production remains the sole bank-sync worker.

## Available now

- **Loans:** actual debt or a separate scenario, dated principal, fixed nominal annual rate, monthly term, monthly/upfront fees, repayment curve and rate comparison. This is monthly amortization, not a bank mortgage offer, tax model or APR calculation.
- **Investments and Pension:** manually recorded statement values with provider, currency, date and source. Edit the same product record to update its valuation rather than adding another dated copy. Pension capital and optional annual before-tax retirement-income projection are separate.
- **Recorded wealth:** booked bank cash + non-cash investment statements + pension − actual loan principal. Scenarios, Saxo SIM and other currencies are excluded. Missing bank coverage makes the combined total unknown. Different source dates are not rolled forward; property and unrecorded assets are not included.
- **PensionsInfo JSON preview:** extracts scheme saved values, masks reference numbers and ignores insurance benefits and personal metadata. Unknown rows are skipped visibly. Review opens a populated modal; importing alone saves nothing. PDF values can be entered manually; there is no automatic PDF parser.
- **Markets:** a source-linked watchlist with notes, editing and deletion. No live/delayed quote feed; entries are research, not holdings or recommendations.
- **Advisor:** authenticated Banking context includes saved loan scenarios and wealth statements. Browser/provider verification returned the exact Demo pension value, annual projection, retirement age, loan principal/payment and scenario status.

## Saxo: prepared, not connected

Dan explicitly authorized inspecting and reusing credentials from `C:\Repo\Trader` and `C:\Repo\Trading-Agents-Saxo`. The saved Trader tokens inspected had expired in April 2026. Only the SIM client key and secret were copied to a separate Windows CurrentUser-protected file at `%LOCALAPPDATA%\Banking\saxo-sim.dpapi`. No keys or tokens were written to source or ordinary logs; Trader was not changed.

The existing app registration uses Trader's port-5000 callback. Banking requires `https://localhost:5443/api/saxo/auth/callback`. Register that callback for an appropriate SIM application, then update the protected Banking configuration's RedirectUri to that exact address and sign in through Banking. Do not replace a callback that Trader still needs. The developer-portal registration and fresh owner authentication remain unfinished; the app shows this dependency rather than using expired tokens.

The local implementation has one-use expiring OAuth state, protected rotating tokens, serialized refresh and a bounded read-only SIM adapter for balances and the first 100 positions. Provider total value includes cash; cash must not be added again. Unknown prices/reliability/delays remain unknown. SIM results never become real wealth. Transactions, historical performance and Live integration follow successful SIM validation and the applicable account/data permissions.

Sources reviewed: [Saxo security](https://www.developer.saxo/openapi/learn/security), [environments](https://www.developer.saxo/openapi/learn/environments), [account details](https://www.developer.saxo/openapi/learn/account-details), [performance](https://www.developer.saxo/openapi/learn/performance).

## Pensure: access still external

The [provider API documentation](https://api.demo.pensure.dk/) describes manually supplied credentials, PensionsInfo JSON/PDF download and export acknowledgement. Banking does not acknowledge/delete provider data or activate webhooks. Current access terms, cost and private-project eligibility remain unconfirmed. A focused personal-mail search on 13 September found no matching reply; that is not proof no reply exists elsewhere. No new enquiry was sent.

## Terminal evaluation

[OpenTerminalUI](https://github.com/Hitheshkaranth/OpenTerminalUI) and [OpenTerminal](https://github.com/ErTasselli/OpenTerminal) are different projects. Both present MIT-licensed code, but their data integrations and trading surfaces are not interchangeable. The former brings a larger application stack and multiple providers; the latter describes indicative/public feeds rather than execution-grade data. Code licensing does not grant market-data rights. Exact repository, provider access/cost and desired components still need selection. No terminal code or data feed was installed; the native watchlist provides a useful local research workflow now.

## Verification

- Full x64 backend suite: **89 passed**. Includes amortization reconciliation, zero-rate rounding, preview without writes, Demo/Live isolation, stale versions, statement deduplication, pension projection validation, unsafe research links and invalid OAuth state.
- Advisor Node suite: **48 passed**, including original-turn recovery after a restart without paid prompt resubmission. One initial full run had one unreproduced failure; the immediate full rerun passed all 48. Its cause was not established.
- Browser: Demo loan scenario saved and rate comparison reconciled; pension statement saved then updated in place; annual income remained separate; JSON preview showed one accepted/one skipped row and opened the correct review form without saving; watchlist saved; Investments empty/provider states inspected; Graphite and Light plus desktop/390px/900px layouts inspected.
- Real provider through the UI: pension 510,000 DKK, annual projection 120,000 DKK at age 70; house scenario 1,000,000 DKK with monthly payment 4,799.15 DKK. AI staged a Fuel station → Transport Review card without applying it.
- No new physical microphone test, Saxo authenticated portfolio read, Pensure authenticated import, market feed or Azure deployment is claimed.

Retained Demo examples are explicitly synthetic: House purchase scenario, PFA pension statement and Example company watchlist. No Live financial records were created.


## Local and production OAuth preparation — 17 September 2026

Dan created Banking Local SIM and Banking Production SIM, Code grant, with future simulated-trading capability checked. No order implementation is included. Credentials were installed in separate protected local configuration and the existing App Service settings. The displayed terms restrict credentials to personal development (or employees), good-faith OpenAPI exploration and at most five simultaneous devices; this must not be represented as an unrestricted public-demo service licence.

Callbacks:
- Local: `https://localhost:5443/api/saxo/auth/callback`
- Azure: `https://banking-dan-0ac7d719.azurewebsites.net/api/saxo/auth/callback`

Server configuration per environment uses `Saxo:SIM:AppKey`, `Saxo:SIM:AppSecret`, `Saxo:SIM:RedirectUri` (App Service separators: `__`). LIVE has independent keys and remains owner-only. Never print or commit actual values. Existing local DPAPI configuration remains supported. Azure reuses the existing certificate-protected Data Protection key ring, persisting encrypted session files under `Cloud:StateDirectory` (`/home/Banking`); no Key Vault. Different app keys/callbacks cannot inherit old tokens. Each installation must complete its own Saxo login; do not copy rotating tokens between installations. Callback completion returns to the configured installation, not localhost in production.

Validation: 16 focused .NET tests passed, including simulated OAuth exchange, encrypted persistence, refresh after session recreation, SIM/LIVE separation, app-key replacement, callback mismatch, state expiry/replay, and Demo authorization. Dan completed the actual local SIM login on 17 September; Chrome returned to local Markets, showed Connected, and successfully read an empty portfolio. Production configuration is installed; hosted deployment and authentication evidence follows below. Earlier preparation notes above are historical snapshots superseded by this section.
