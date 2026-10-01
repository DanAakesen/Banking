# Banking cloud development

Confirmed by Dan on 1 October 2026: use private `https://github.com/DanAakesen/Banking` as source of truth and develop only in its Codex cloud environment.

## Working rules

- Implement, build, test and preview inside Codex cloud. Use branches and reviewable pull requests for subsequent work.
- Retain the local checkout for reference. Do not use local launchers, local databases or local development services. The initial repository migration and guidance updates are authorized exceptions.
- The shared deployed production API still owns business logic, integrations, scheduling and separate Dan/shared fictional Demo data. Cloud test fixtures must remain isolated; never fall back to production credentials or data.
- Production deployment, database migration against production and financial actions require their own explicit authorization.
- Secrets, environment files, local databases, diagnostic logs, historical browser captures and generated release artifacts are excluded from Git. Configure any subsequently required credentials in the environment's secret controls, with explicit authorization.

## Codex environment configuration

Select repository `DanAakesen/Banking`, default branch `main`, personal environment access. Use .NET 10 SDK compatible with `global.json` (10.0.102 with latestFeature roll-forward), Node.js, Git and bash. Permit package registries and official Microsoft SDK download domains needed during setup, and the specific deployed Azure API hostname during tasks. No production credentials are required to restore and compile source.

The setup conversation should restore `Banking.sln`, `tools/frontend-host/FrontendHost.csproj` and `tools/frontend-host/tests/FrontendHost.Tests/FrontendHost.Tests.csproj`, then build and run suitable isolated tests. Check actual project paths before execution. Some older integration fixtures require SQL Server; report unavailable fixtures rather than substituting a real database. The existing `scripts/start-cloud.sh` is an Azure production startup script, not a Codex development setup script.

The existing frontend host requires HTTPS loopback and specific ports. A cloud preview may need a reviewed adaptation; do not launch the production Banking worker to obtain a preview. Keep the shared API boundary intact.

## Migration status

- 1 October 2026: private repository `DanAakesen/Banking` created and initial source uploaded to `main` at commit `528cd5f904296f7576d2c5a262a42426cf2bb991`; GitHub API and remote ref verified.
- Codex environment **Banking** created, identifier `6abdf572b9088191946caf44f7500f06`. Its saved detail page confirms repository `DanAakesen/Banking`, universal image, setup/maintenance commands, caching enabled and no secrets or environment variables. Agent networking uses Common dependencies plus `banking-dan-0ac7d719.azurewebsites.net`, the deployed API hostname verified in `tools/frontend-host/Program.cs`. This grants network reachability, not authenticated access or production-write/deployment permission.
- [Open the Banking environment](https://chatgpt.com/codex/cloud/settings/environment/6abdf572b9088191946caf44f7500f06). Use it when choosing cloud execution in Codex.
- The first actual cloud setup installed .NET SDK 10.0.401 and reached NuGet restore. It exposed NU1004 because the API lock file contains `linux-x64` while the initial restore omitted the runtime. Setup now restores the API with `--runtime linux-x64 --locked-mode`, then the test project with `--no-dependencies --locked-mode`. Build/test success must be verified separately. Backend integration fixtures currently hard-code Windows SQL Server LocalDB and cannot be treated as Linux-compatible. Use the separate frontend-host test suite for cloud setup validation; report the backend limitation explicitly.
- Corrected cloud setup verified on 1 October 2026: .NET SDK 10.0.401, Node.js 20.20.2; locked restores succeeded; `Banking.sln` built with **0 warnings and 0 errors**; frontend-host tests **18 passed, 0 failed, 0 skipped**. Maintenance restores succeeded and Codex displayed **Test complete** with a connected cloud terminal. No application service or production worker was launched.
- Azure reachability verified from the connected cloud terminal after setup: a read-only HTTPS request to `https://banking-dan-0ac7d719.azurewebsites.net/` returned **HTTP 200**. This confirms network access to the app, not authenticated owner/API acceptance or deployment permissions.

Repository publication and actual Codex environment readiness must be verified separately. Never claim cloud tests passed solely because an environment configuration was saved.

Reference: [official Codex cloud environment guidance](https://learn.chatgpt.com/docs/environments/cloud-environments).
