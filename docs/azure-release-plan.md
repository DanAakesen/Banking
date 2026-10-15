# Banking — Azure release

Updated 12 September 2026. **Deployed and ready for Dan's acceptance test.** Dan explicitly approved the full deployment after the access check. Resources, migration and hosted checks are complete; evidence and the first-scheduled-bank-pull limitation are in [.azure/deployment-plan.md](../.azure/deployment-plan.md).

## Current cloud release procedure — 15 October 2026

Dan now authorizes continuous publication of reviewed, validated `main` changes within the current presentation scope; see [the delivery policy](cloud-development.md#continuous-publishing--15-october-2026). Earlier approval-per-release text and the 12 September state below are historical. Cloud release execution is delegated to `gpt-6-luna` at medium effort through the reviewed [GitHub Actions workflow](github-actions-release.md). Main may configure the now-explicitly-authorized narrow OIDC identity using its existing owner session and dispatch/inspect cloud runs; no source build, test or Banking app execution runs on the coordinator PC.

The tracked `scripts/Release-SharedBackend.ps1` defines the complete API/advisor/static package layout and existing Entra-authenticated SCM sequence (Inspect → Stage/rollback capture → Publish → Status). It has historical Windows paths and a dependency on an old Node artifact; `Release-Full.ps1` also hardcodes an obsolete release name. `tools/Banking.Deployment` is a Windows-owner DPAPI migration utility, not a portable cloud deployment agent. Do not invoke Infrastructure, Network, Settings, EnableAdvisor, Migrate, schema/import, secret or provider configuration steps as part of this code-only release. The ignored `.azure/deployment-plan.md` is absent from this cloud checkout (Main has a historical local copy); the current tracked workflow/runbook is authoritative.

### Prepare and validate

- Refresh `origin/main`, require an exact reviewed/validated source SHA and clean tracked source, and serialize the release. Review only new diffs since the accepted baseline. No migrations were added by the pending annotation/presentation batches; preserve the existing schema and production settings.
- Build from a clean `git archive` of that SHA with .NET 10.0.401 at `/workspace/.dotnet/dotnet`, using the existing locked Linux-x64 restore and framework-dependent Release publish. Set `InformationalVersion` to a unique release label with the full source SHA so `/api/runtime-info` can prove identity. Keep package, checksum and per-file manifest under ignored `artifacts/continuous-publishing/`.
- Include published API/static files, the existing `scripts/start-cloud.sh`, advisor runtime `.mjs` files (exclude tests/fixtures), `advisor/public` and `advisor/examples`, and a verified official Linux-x64 Node runtime. Use the exact Node version validated in cloud; verify its official distribution SHA-256. Do not reuse the host's dynamically linked Node binary as a portable runtime without compatibility evidence.
- Reject local/development settings, secrets, keys, `.env` files, databases, test fixtures, private captures and unrelated artifacts. Check every tracked frontend/advisor release asset against its manifest and smoke-import the packaged advisor modules with the package's Node executable, without starting workers or making model/provider calls. Run appropriate isolated build, Node, backend/transport and Chromium checks; unavailable Windows LocalDB tests are not passing tests.

### Authenticated execution and rollback gate

Use an existing supported Azure identity scoped to the existing subscription `0ac7d719-89bc-4100-be87-a79d33e953a7`, group `rg-banking-prod-weu`, app `banking-dan-0ac7d719`. Retain proxy/CA trust and never print tokens or settings. The tracked sequence requires `management.azure.com` and `banking-dan-0ac7d719.scm.azurewebsites.net`, plus the configured identity's authentication endpoints. The managed development executor lacks this access; the explicitly authorized GitHub Actions OIDC runner supplies the supported release route. Main owns the narrow control-plane setup, without exporting its owner credentials.

Before upload, inspect current deployment/build and retain a verified checksum of the prior code archive under `/home/Banking/releases/before-<release>.zip` through authenticated SCM, as the tracked Stage step describes. Do not claim a backup exists until it is checked. Preserve `/home/Banking`, Data Protection keys, SQL data and existing application settings. Upload only the exact manifested artifact using Entra bearer SCM ZipDeploy; basic publishing/FTP remain disabled. Poll deployment status to terminal success and record ID/times. On failure, inspect the actual status before retrying; an upload acknowledgement is not acceptance.

Rollback uses the verified prior code package, retaining current financial data and keys. Assess compatibility and worker/scheduler effects before reverting; do not restore an old database or enable a second scheduler. No new paid resource, credential, broad access rule or production data change is part of this runbook.

### Postdeploy acceptance

Verify HTTPS health, `/api/runtime-info` source/build, exact main JS/CSS and advisor assets, and the CSP's legacy plus three current stylesheet hashes. Use the read-only live Demo browser/isolation tests without rerunning `repair-demo.py`, owner writes or mutation-containing historical production smoke scripts. Confirm anonymous/forged identity requests cannot read Dan data, Demo-to-Live reads are denied, and unrelated inline CSS/scripts remain blocked while the reconstructed exact Codex 26.1007.9446.0 overlay/cursors are active and intercept viewport selection. Main/Dan separately checks the real embedded Codex annotation tool. Report source SHA, main SHA, artifact checksum, deployment ID/status, rollback archive identity and all unavailable acceptance separately.

### Deployment capability observation — 15 October 2026

GPT-6 Luna at medium inspected the attached Banking cloud environment. .NET is available at `/workspace/.dotnet/dotnet`; Azure CLI and PowerShell are absent. Runtime status exposes no configured Azure credential bindings or outbound identity, the safe CLI metadata check found no existing auth state, and the enforced policy excludes the required management/SCM hosts. The public app is reachable and still reports `2026.09.29-saxo-session-keepalive` with only the legacy annotation stylesheet hash. No deployment was attempted and no remote rollback archive was verified at that observation. Dan subsequently explicitly approved the GitHub Actions OIDC connection. Main's separate bounded Luna delegate configures only that identity/federation/site-role/variables contract; this cloud worker implements and validates the workflow and package. Its enable gate stays off until prerequisites are verified; the GitHub cloud runner then executes the release without copying owner credentials into this executor.

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
