# Banking cloud development

Confirmed by Dan on 1 October 2026: use private `https://github.com/DanAakesen/Banking` as source of truth and develop only in its Codex cloud environment.

## Working rules

- Implement, build, test and preview inside Codex cloud. Use branches and reviewable pull requests for subsequent work.
- Retain the local checkout for reference. Do not use local launchers, local databases or local development services. The initial repository migration and guidance updates are authorized exceptions.
- The shared deployed production API still owns business logic, integrations, scheduling and separate Dan/shared fictional Demo data. Cloud test fixtures must remain isolated; never fall back to production credentials or data.
- Production deployment, database migration against production and financial actions require their own explicit authorization.
- Secrets, environment files, local databases, diagnostic logs, historical browser captures and generated release artifacts are excluded from Git. Configure any subsequently required credentials in the environment's secret controls, with explicit authorization.

## Codex environment configuration

Select repository `DanAakesen/Banking`, default branch `main`, private environment access. Use .NET 10 SDK compatible with `global.json` (10.0.102 with latestFeature roll-forward), Node.js, Git and bash. Permit package registries and official Microsoft SDK download domains needed during setup. No production credentials are required to restore and compile source.

The setup conversation should restore `Banking.sln`, `tools/frontend-host/FrontendHost.csproj` and `tools/frontend-host/tests/FrontendHost.Tests/FrontendHost.Tests.csproj`, then build and run suitable isolated tests. Check actual project paths before execution. Some older integration fixtures require SQL Server; report unavailable fixtures rather than substituting a real database. The existing `scripts/start-cloud.sh` is an Azure production startup script, not a Codex development setup script.

The existing frontend host requires HTTPS loopback and specific ports. A cloud preview may need a reviewed adaptation; do not launch the production Banking worker to obtain a preview. Keep the shared API boundary intact.

## Migration status

Repository publication and actual Codex environment readiness must be verified separately. A setup document alone does not create or publish an environment. Record the environment identifier and cloud build/test results only after the service confirms them.

Reference: [official Codex cloud environment guidance](https://learn.chatgpt.com/docs/environments/cloud-environments).
