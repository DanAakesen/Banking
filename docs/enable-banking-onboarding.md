# Banking — first real bank connection

Status on 2026-09-07: Banking is registered under danaakesen@gmail.com as production AIS, Active / Restricted, Application ID `d872acae-759b-4725-ac47-e48405ae1280`. Dan completed portal and application MitID consent. The local backend imported three Danske Bank DKK accounts, 2,905 transactions, and six ITBD/ITAV snapshots. Earliest booked date: 2024-09-09. Actual consent expiry: 2027-03-06 12:29:27 UTC. The private key remains encrypted locally. No Azure resource, tunnel, or deployment was created.

## Current owner action

No further bank or certificate action is needed now. The next owner collaboration is frontend design. Passwords and MitID remain owner-only; never copy callback codes/state or private keys into documentation or logs.

The callback initially failed with `AMBIGUOUS_ACCOUNT_IDENTITY`: three distinct primary hashes shared one of eight alternative hashes. Signed GET session/account-detail reads established the actual shape. The matcher now ignores shared alternatives while rejecting primary conflicts. A protected local recovery restored the authorized session without repeating MitID, followed by all 30 available transaction pages. Successful exchanges are now checkpointed before local reconciliation, with authenticated idempotent retry.

Dan supplied administrator evidence that C: is fully encrypted with protection on. The backend independently verified its protected key and restrictive directory ACLs. His administrator run returned false for those latter checks; the context difference is unexplained. Trusted HTTPS localhost was verified in PowerShell and manually by Dan in Chrome. Earlier automated tabs encountered `ERR_BLOCKED_BY_CLIENT`; this did not prevent Dan's manual callback from reaching the backend. The browser tool rejected `chrome://extensions/`; no policy bypass was used.

Requesting consent at the exact advertised 180-day maximum was rejected. Whole-second expiry five minutes below that maximum succeeded. The actual returned expiry above is the source of truth. Bank/provider quota behavior beyond this successful initial import, future consent renewal, and comparison against the bank UI remain follow-up acceptance checks.

## Prepared registration values

| Field | Value |
|---|---|
| Name | Banking |
| Environment | Production, restricted to the owner's linked accounts |
| Purpose/description | Personal, non-commercial, read-only overview of my own accounts, balances and transactions. Data is stored locally during development. No payment initiation. |
| Key option | Generate outside the browser and import public certificate |
| Public certificate file | `C:\Users\danaakesen\AppData\Local\Banking\enable-banking-public.crt` |
| Redirect URL | `https://localhost:5443/api/auth/callback/live` |
| Data protection email | Dan@novaro.dk |
| Privacy URL | `https://localhost:5443/legal/privacy` |
| Terms URL | `https://localhost:5443/legal/terms` |

Run `./scripts/Start-Backend.ps1 -Https` while using the local document URLs. The script also selects HTTPS automatically when local live configuration exists. The URLs serve plain-text registration information, not product frontend screens.

**Verified portal behavior:** registration rejected the HTTP callback with `uses unsupported scheme` (HTTP 400). The same registration succeeded with the HTTPS localhost URLs above, confirmed by the application card and new Application ID. This verifies registration acceptance, not the end-to-end bank callback. Do not deploy or start a tunnel as a workaround. [Control panel documentation](https://enablebanking.com/docs/api/control-panel/).

Public key SHA-256: `9AB33C4CDB24C525D365A9A6601925C888031E6D04C8F3E2D75A0F6187D20D41`. The private key stays in `%LOCALAPPDATA%\Banking\enable-banking-private.dpapi` and must not be uploaded.

The self-signed API public certificate uses the existing RSA-3072 key and expires on **2027-09-07 at 11:51:14 UTC**. Key preparation verifies the certificate matches the private key, refuses mismatched/expired certificates, and preserves existing files on repeated runs. Plan certificate renewal with Enable Banking before expiry; this certificate is separate from the ASP.NET localhost TLS certificate.

## What the assistant does after those inputs

1. Review the Application ID, linked-account state, loopback URL acceptance, and disk-encryption evidence. Preserve any existing local configuration.
2. Use `Configure-EnableBanking.ps1` with the supplied ID and confirmed prerequisites. This writes an ignored local configuration file and selects the separate `Banking_Live_Dan` database, with both data and transaction-log files inside the protected local data directory.
3. Run `Verify-BankProvider.ps1` to read the provider's application metadata: production environment, active state, AIS support, and registered callback. These checks alone do not verify a bank connection.
4. Start the backend and use `Connect-Bank.ps1` to select the exact current Danske Bank/DK entry and create a short-lived authorization URL. Dan completes the official bank/MitID flow in Chrome; Banking receives only the callback code/state. An error/cancellation consumes state without importing data.
5. Verify the first complete import: all available pages, stable accounts, booked/pending entries, earliest/latest dates, counts, balance types, currencies, and freshness. Reconcile against the bank with Dan. Review ambiguous reference-less corrections rather than double-counting them.
6. Exercise resync, consent/reconnection, failure recovery, local and portable backups, and Live/Demo isolation using the actual connection. Create the final entirely synthetic demo dataset only after the actual schema/scenarios are understood, as requested.
7. Once backend acceptance has evidence, move to collaborative UI design. Azure and deployment remain the last phase after separate explicit approval.

## Local preparation already completed

- RSA-3072 key pair generated locally; private key encrypted with Windows user-bound Data Protection, separate Live purpose.
- Secret/key/data directories restricted to the Windows owner, SYSTEM, and local Administrators; verified with no inherited broad access.
- Portable backup uses AES-256-GCM and PBKDF2-SHA256 with a passphrase entered privately in a terminal. Recovery works with a different Data Protection key ring and invalidates bank access until reconnection.
- Live is enabled in the protected Banking_Live_Dan database. Initial import and a same-user encrypted backup succeeded; 2,905 transactions remained available after restart. No paid action or deployment was performed.
