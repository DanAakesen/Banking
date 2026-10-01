# Banking — Azure release

Updated 12 September 2026. **Deployed and ready for Dan's acceptance test.** Dan explicitly approved the full deployment after the access check. Resources, migration and hosted checks are complete; evidence and the first-scheduled-bank-pull limitation are in [.azure/deployment-plan.md](../.azure/deployment-plan.md).

## Deployment

- URL: https://banking-dan-0ac7d719.azurewebsites.net
- Subscription: **Dan Aakesen**, `0ac7d719-89bc-4100-be87-a79d33e953a7`.
- Azure administrator: **Dan@novaro.dk**. CLI default may be a different work account: specify the subscription in every command.
- Resource group: `rg-banking-prod-weu`, **West Europe**.
- One App Service Linux **B1** instance, .NET 10, Always On; frontend, API and durable SQL-backed synchronization worker together.
- SQL server `banking-sql-0ac7d719`; separate Basic databases `Banking_Demo` and `Banking_Live_Dan`, each 5 DTU / 2 GB, seven-day point-in-time recovery.
- Storage `bankingdata0ac7d719`, private `recovery` container; shared-key and public blob access disabled.
- **No Key Vault, VNet, Private Endpoints, Private DNS, container registry, azd or GitHub deployment pipeline.**

Use Azure CLI/Bicep and an Entra-authenticated SCM ZIP upload. Basic publishing and FTP are disabled. `scripts/Deploy-Azure.ps1` implements Infrastructure, Network, Settings and Publish steps. A successful asynchronous upload is not release acceptance: confirm deployment completion, hosted health and actual workflows.

## Identity and isolation

The first release preserves the existing Dan/password login. This was the stated minimal-change assumption while an optional Google question was unanswered; Google registration is deferred. The existing password hash was migrated without reading or resetting the password. Public password setup and local bearer/ticket access are disabled. Browser-supplied owner headers are not trusted.

Public visitors choose Demo. Each browser session receives an isolated synthetic copy, expires after eight hours, and cannot access Live. Allocation is capped at 40 concurrent copies, with expired copies reclaimed on allocation. Owner edits never seed public Demo. Demo has no real bank calls.

The application uses Managed Identity with CONNECT, db_datareader and db_datawriter in the two application databases. It cannot perform schema migrations. Operator-only, encrypted, short-lived credentials are used through authenticated SCM for migration and then removed. SQL uses the app's six exact outbound firewall addresses and Proxy routing. Temporary operator rules have been removed; do not enable a broad Azure-services firewall rule.

SQL's explicit service-principal SID form uses the **client ID**, `283ecedc-b414-4761-92f9-2d1217ec7300`; Azure RBAC uses the **object ID**, `1e6fcf86-1072-4a2a-a021-232dc27110c3`. [Microsoft CREATE USER documentation](https://learn.microsoft.com/en-us/sql/t-sql/statements/create-user-transact-sql#k-create-a-contained-database-user-from-a-microsoft-entra-principal-without-validation)

## Secrets, persistence and recovery

Enable Banking's existing signing key and the Data Protection certificate are supplied through encrypted-at-rest App Service configuration and loaded only server-side. No Key Vault. Configuration access is privileged: an Azure administrator able to read app settings can recover these secrets. No secrets belong in repository files, deployment output or ordinary logs.

Certificate-encrypted Data Protection XML and encrypted browser-session/login state persist in `/home/Banking`. The encrypted keyring is backed up in private Blob Storage. Goal photos remain in SQL, preserving existing data rather than introducing a separate image migration.

Both databases were migrated and reconciled for every included table, excluding SQL-generated rowversion. Initial counts: **Live 2,925 transactions / 3 accounts**; **Demo 1,820 transactions / 5 accounts / 3 goals / 2 budget plans**. Existing bank sessions were re-encrypted under the cloud protection certificate. Source LocalDB databases, original Windows keys and encrypted pre-cloud backups are retained. Temporary transfer files and SQL tokens were removed.

SQL point-in-time recovery protects database history. Recovery also requires the corresponding Data Protection keys and certificate; database backup alone cannot decrypt bank sessions. The local protected deployment configuration is Windows-owner DPAPI encrypted and is not a portable independent credential backup. Do not delete the original keys or certificate during recovery/rotation.

The local Live worker is stopped. Azure is the sole active synchronization worker. Never restart local Live synchronization in parallel; before rollback stop cloud synchronization and assess whether newer cloud edits/data must first be recovered. Do not replace current cloud data with an older local copy blindly.

## Bank connection

The existing restricted Enable Banking application and private Gmail registration remain in use. Its Azure callback is registered at `/api/auth/callback/live`; the localhost callback is retained for recovery/development. Hosted privacy and terms URLs are registered. Scope remains accounts, balances and transactions only. No payments or trading.

Synchronization respects the existing per-account six-hour policy and provider cooldowns. No artificial polling increase is used for deployment acceptance. Dan performs any future bank sign-in/MitID himself if consent expires.

## Verification and limits

Run `scripts/Test-Azure.ps1` for hosted HTTPS, public/private access, local-endpoint rejection, origin checks, Demo isolation, reversible synthetic edits and logout. It never logs in as Dan or modifies Live financial records. Real password entry and phone acceptance remain Dan's tests.

Initial telemetry uses platform metrics and sanitized application console events. HTTP request/access tracing and detailed response logging are disabled. Application Insights is deferred until its payload controls are verified. This release is a single-instance personal service, not a high-availability or multi-user product.

Planning envelope: **25–45 USD/month**, before tax/exchange-rate effects and provider charges. Verified regional Linux B1 rate was **0.018 USD/hour**, or **13.14 USD at 730 hours**. Two SQL databases and small recovery storage are included in the envelope as estimates; this is not a billing guarantee. [Azure Retail Prices API](https://prices.azure.com/api/retail/prices)

AI/voice, Saxo, pensions and loan functionality remain separate roadmap releases. Optional private networking, Google sign-in, custom domain and manually triggered GitHub Actions can be considered later without expanding this release.
