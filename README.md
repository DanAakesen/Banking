# Banking

## Current development workflow — 1 October 2026

Private `DanAakesen/Banking` on GitHub is the single source of truth for every agent and provider, including GitHub Copilot and Codex. Develop, build, test and preview in a cloud-hosted workspace connected to this repository; Codex must always use the Banking Codex Cloud environment (`6abdf572b9088191946caf44f7500f06`) mapped to `DanAakesen/Banking`. GitHub Copilot must use GitHub Copilot cloud agent and its GitHub Actions-powered development environment for this repository. Other providers must use their own cloud-hosted agent environment connected to this repository. Local clients may only coordinate or submit work to the required cloud agent. Local IDE agent mode, local CLI implementation and local app execution are prohibited. If the required cloud environment is unavailable, report the blocker; do not substitute local execution or another environment. Refresh the relevant GitHub branch and read its rules before changes, then commit and push completed work on task branches with reviewable pull requests. Local clients may only coordinate or submit work to the required cloud agent; local development is prohibited. See [cloud development](docs/cloud-development.md). The deployed shared API remains the application backend; reviewed and appropriately validated work must be committed, pushed and merged autonomously under standing authorization; deployment and production data changes still require separate authorization. Local setup instructions below are historical and superseded.

Latest local update: the overnight quality pass and visual upgrade are complete. Cash-flow charts, interactive category rings, budget allocation and goal visuals are implemented. See the [morning report and screenshots](docs/overnight-quality-ui.md). Owner acceptance remains.


Personal, read-only finance solution for Dan using Enable Banking, with later hosting in his own Azure subscription.

**The entire MVP must work locally first. Azure resources and deployment are the final phase and require Dan's explicit approval. No such approval exists.**

Build and verify the MVP backend first. Then design the frontend together with Dan and obtain his design approval before implementing any product UI. Backend completion alone is not completion of the full local MVP.

The local backend and frontend are implemented, including the approved Review inbox. **54 backend tests and 39 Chrome workflow checks pass.** The initial Danske Bank import has three accounts and durable history; Demo is separate and fictional. Dan's UI acceptance remains: create goals/budgets in each workspace and review the result. No Azure resources or deployment have been created.

The approved Budgets redesign is implemented: named plans, recurring income/expense entries, planned savings, monthly available-to-spend totals, explicit activation and reviewed transaction merge/new workflows. See [budget redesign](docs/budget-redesign.md).

## Run locally

On Windows with the .NET 10 SDK, x64 .NET 10 runtime, and SQL Server LocalDB installed:

For a new empty product-demo database, run `./scripts/Initialize-Demo.ps1` once before starting the host. Dan's local demo is already initialized. Initialization never overwrites existing data.

1. Run `./scripts/Start-Backend.ps1 -Https` from PowerShell.
2. In another terminal, run `./scripts/Open-Banking.ps1` to open an authenticated local session in Chrome.
3. Run `./scripts/Test-Backend.ps1` for SQL/API/provider checks, or `./scripts/Test-Frontend.ps1` for disposable-data browser checks.

The UI is at `https://localhost:5443`; the technical API also listens on `http://127.0.0.1:5080`. Access is local to this PC. Use `./scripts/Invoke-Banking.ps1 -Path /api/accounts` for authenticated technical requests; the protected API token is not printed. New Demo initialization creates no goals or budgets; Dan creates those through the UI. See [local frontend and screenshots](docs/local-frontend.md) and [local backend](docs/local-backend.md).

| Document | Contents |
|---|---|
| [Product](PRODUCT.md) | Purpose, MVP, requirements, and later extensions |
| [Project plan](docs/project-plan.md) | Local phases, acceptance criteria, final Azure phase, and optional networking |
| [Architecture](docs/architecture.md) | Local components, flow, and future Azure mapping |
| [Data model](docs/data-model.md) | History, identities, categories, budgets, and imports |
| [Security](docs/security.md) | Login, secrets, logs, and read-only MCP |
| [Product experience](DESIGN.md) | Screens, states, and local browser verification |
| [Decisions](docs/decisions.md) | Confirmed requirements, proposals, and open items |
| [Sources and budget](docs/research.md) | Dated research basis and estimates |
| [Agent context](docs/agent-context.md) | Working rules, documentation routes, and status |
| [Local frontend](docs/local-frontend.md) | Running screens, screenshots, browser checks and owner acceptance |
| [Local backend](docs/local-backend.md) | Verified commands, API surface, test evidence, and remaining integration work |
| [First real bank connection](docs/enable-banking-onboarding.md) | Prepared registration values and the concrete owner steps needed for the first Danske Bank test |

### Local sign-in

Open https://localhost:5443 and choose **Try Demo** or **Sign in as Dan**. Dan sets his own local password once from an authenticated owner session (Settings → Profile). Demo sessions cannot access live accounts. [Setup and access boundaries](docs/local-access.md).
