# Shared production backend — execution evidence

27 September 2026. Implementation authorized; deployment not authorized by this task.

## Concurrent work boundary

Dan is changing loading animations and page UI concurrently. Implementation workers own new frontend-host files, startup scripts and backend contracts only. They must not modify `src/Banking.Api/wwwroot/` or `prototypes/advisor/public/`, terminate the current localhost app, or overwrite unrelated source. There is no Git metadata in this checkout, so a broad repository reset/diff or unreviewed full-source deployment cannot be used as a safety mechanism.

Workers: `shared_api_audit`, `shared_frontend_host`, `shared_demo_backend`, each explicitly started as `gpt-6-luna` with `max` reasoning. Coordinator owns integration, startup handoff and evidence.

## Runtime transition

Normal target: local static assets and transport-only HTTPS proxy to the fixed Azure API. Production authentication, business logic, advisor execution, financial persistence and providers remain on Azure. Existing local databases and protected keys remain untouched. Backend tests continue using isolated disposable fixtures.

For side-by-side verification use a separate loopback port without interrupting the existing app. Browser cookies must be namespaced by the development host and translated to the exact upstream cookie names: host-only cookies are shared across ports, so a plain pass-through could overwrite the existing localhost session. This is cookie transport, not local session issuance or authorization.

Normal command after the backend contract is released: `scripts/Start-Frontend.ps1`. Default URL: `https://localhost:5443/#/overview`. `Start-OverviewAdvisor.ps1` and `Start-Backend.ps1` are compatibility wrappers for this command; neither starts a local business service, advisor or SQL instance. `Open-Banking.ps1` opens the welcome/sign-in flow, without issuing a local owner ticket. Use `-Port 5444` for a separate frontend instance. The launcher refuses to replace an occupied port.

The currently running legacy localhost process is intentionally left alone while Dan works on loading animations. Changes to startup scripts take effect only on the next launch. The new launcher requires the shared-backend capability contract on Azure; until release, transport-only static/auth smoke checks are separate from a supported normal start.

## Release preparation

Before any release, assemble and review the exact backend files and additive schema changes (if any). A full checkout publish would include unrelated pending UI work and is not automatically acceptable. Obtain a known deployed artifact/source baseline or review the broader scope explicitly. Keep the prior compatible artifact for rollback; never restore a database snapshot over newer Dan edits.

The backend release must include the persistent shared Demo financial scope and required advisor-renderer contract before both frontends can prove the complete shared-data experience. Public Demo still cannot access Dan or expose real provider credentials. Private advisor conversation scope remains independent from shared fictional financial scope.

Preserve the confirmed existing Demo Saxo SIM access. Saxo LIVE remains owner-only. Current production order submission still has its existing local-only guard; moving frontend traffic to Azure does not implicitly enable hosted order execution. PFA access remains a separate provider integration dependency.

## Verification status

No backend deployment, production schema migration, application database deletion, owner-data mutation or new provider consent/trade occurred. The new backend uses the existing canonical Demo scope; it does not merge or delete old visitor records, and adds no database migration. Private advisor storage remains separate. Existing approved Demo Saxo SIM access is preserved.

Verified transport evidence:

- Frontend host: 18/18 focused tests pass on the final Debug source. Covers fixed upstream, host/origin rejection, header filtering, per-port cookies/logout, approved assets, API failures, external/unsafe redirects, response streaming and cancellation.
- Live HTTP smoke on temporary port 5444: ten app/advisor assets returned 200; `/health` reported Azure; fresh Demo login returned 200 and the expected port-specific cookie; browser status reported Demo; advisor workspace returned 200 with AI configured; logout returned 204. No main financial API request or AI prompt was sent. A transient asset 404 during concurrent editing resolved on retry; all ten assets then returned 200.
- Normal startup rejects the old deployed API because its new runtime-info contract is absent. Occupied port 5443 is rejected without stopping its process. Startup scripts parse successfully.
- The temporary 5444 host was stopped after the smoke check. Existing 5443 API and 5450 advisor processes were left unchanged.
- Browser visual checks could not complete: the in-app test tab failed to attach, the browser kernel timed out, and Chrome was unavailable. HTTP and source checks do not establish visual or microphone acceptance.

Backend fixture evidence:

- 41 selected .NET tests were exercised with the x64 runtime. The combined run passed 40/41; one isolated SQL LocalDB fixture hit a post-login timeout. Rerunning that exact fixture passed 1/1 in 17 seconds. The 14 proxy tests also passed separately. Every selected test therefore has a passing result, but the combined run was not uniformly green. No shared SQL/app process was restarted to obtain these results.
- 12/12 Node advisor cloud/server checks pass. Preview tests verify legitimate Demo and Live access, rejection of missing identity/mode, another Demo visitor and the wrong workspace, plus retained sandbox/CSP and private memory/workspace isolation.
- Other backend checks verify two Demo cookies see the same canonical record ID and saved update, stale writes return 409, old nonempty scopes stay inaccessible and cannot be overwritten, runtime-info reports the new contract, cloud synthetic callbacks use Azure, Demo SIM access remains available and LIVE requires the owner.
- Initial SQL failures under the ARM64 runner were resolved by the repository's required x64 test runtime; these were not production data failures.

Reproduction commands:

```powershell
dotnet test tools/frontend-host/tests/FrontendHost.Tests/FrontendHost.Tests.csproj --nologo
node --test prototypes/advisor/cloud.test.mjs prototypes/advisor/server.test.mjs
$env:DOTNET_ROOT_X64 = "$env:ProgramFiles\dotnet\x64"
dotnet test tests/Banking.Tests/Banking.Tests.csproj --arch x64 --artifacts-path artifacts/shared-backend-build-x64 --filter "FullyQualifiedName~Banking.Tests.CloudTests|FullyQualifiedName~Banking.Tests.DemoAdvisorCoverageTests|FullyQualifiedName~Banking.Tests.PublicAccessTests|FullyQualifiedName~Banking.Tests.SaxoOrderTests|FullyQualifiedName~Banking.Tests.LocalAdvisorTests"
```

The implementation/test paths and SHA-256 values are recorded in [the source snapshot](shared-backend-source-manifest.json). This is a review inventory, not a deployment bundle or proof of what Azure currently runs. No files under `src/Banking.Api/wwwroot/` or `prototypes/advisor/public/` were edited by this work.

## Release and acceptance still pending

Normal shared-backend startup intentionally remains blocked until the reviewed Azure backend release exposes runtime-info v1, canonical shared Demo behavior and relative authenticated renderer URLs. Verify the existing canonical production Demo dataset is entirely fictional and internally consistent before that cutover. Cross-frontend edits, owner read-only parity, full hosted advisor/voice/provider workflows and visual acceptance remain unverified until release. See SHARED-01 through SHARED-09 in `docs/production-test-plan.md`.

The current app process continues to support Dan's concurrent UI work. These startup changes are not evidence that his already-running process has switched backend.

## Full deployment and activation - 27 September 2026

Dan explicitly approved deploying all current changes, superseding the earlier deployment hold and narrow release scope. Final successful active SCM deployment: 980345ee-89fe-4021-ac6e-9b4087f4b5dc, completed 14:22:59 UTC. Package SHA256: 3E8D5EC1E51105704B1880541BD80B8DD0D7C08AB1EDF9FA873B8715A8F209F4. Runtime build: 2026.09.27-shared-backend.

Included the complete current frontend, backend and advisor, including the loading animation edit made during packaging. No database migrations were necessary: all 17 migration IDs matched the prior deployment. No data import, reseed, database replacement, app setting replacement or infrastructure apply occurred. Rollback files remain at /home/Banking/releases/before-full-20260927.zip.

Validation: 126 backend tests, 122 original advisor/UI tests, 18 frontend-host tests passed. Startup exposed a repository-relative advisor import; fixed app-tools.mjs to use BANKING_ASSET_ROOT, verified an actual package import and added an isolated-package regression (7/7 focused tests passed). The final package contains the fix.

Hosted Test-Azure: 18 checks passed, including shared Demo CRUD, stale-version 409, exact test-record cleanup and Live denial. Test-FullRelease passed financial context, market search and 22 chart bars, private advisor memory isolation, relative sandboxed rendering and cross-visitor artifact denial.

The shared frontend is running at https://localhost:5444. API verification confirms identical five-account datasets and bidirectional Demo edits across local and Azure; temporary test categories cleaned up. Advisor configuration is available through the proxy. Automatic approval review blocked stopping the legacy 5443 API and 5450 advisor processes (only reason supplied: blocked by policy), so they remain running; 5443 has NOT been switched. Normal future startup uses Start-Frontend.ps1 and no local database/business service.

Owner sign-in/read-only Dan parity, microphone acceptance and provider reauthentication remain user acceptance steps. No orders or consent actions were performed. The PFA provider dependency and production order restriction are unchanged.
- Browser verification: deployed Welcome and 360 Demo pages render successfully, with no captured browser console errors. Existing cloud canonical Demo has five accounts but no recorded investment/pension statements; no local statements were copied into the deployed database. Those panels correctly show no recorded value.
- Latest loading-ui.js byte hash matches current source over HTTPS after the final deployment.
