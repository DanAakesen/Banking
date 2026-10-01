# Local shared-production frontend host

This standalone ASP.NET host serves an explicit allowlist of the Banking and advisor frontend files from this checkout. It forwards `/api/*`, `/advisor/api/*`, and opaque `/advisor-render/artifact/{id}` requests over HTTPS to the fixed production Banking API. It contains no local database, business API, or advisor backend.

Normal startup is `scripts/Start-Frontend.ps1`. The default is `https://localhost:5443`; `-Port 5444` is available for a separate side-by-side session. The launcher refuses to replace an existing listener and requires a trusted ASP.NET development certificate. Before starting, it checks the fixed production `/api/runtime-info` endpoint and requires contract v1, Azure shared-demo data, and the relative advisor renderer. Older releases fail closed.

```powershell
dotnet test tools/frontend-host/tests/FrontendHost.Tests/FrontendHost.Tests.csproj --configuration Release --nologo
.\scripts\Start-Frontend.ps1
.\scripts\Start-Frontend.ps1 -Port 5444
```

Until the production readiness contract is released, a direct project launch can be used only for controlled static/auth transport smoke checks:

```powershell
dotnet run --project tools/frontend-host/FrontendHost.csproj --no-launch-profile -- --port 5444
```

That direct launch intentionally bypasses the normal readiness preflight. Do not use finance, advisor-data, or provider workflows through it before the release contract is available. Production API requests still go only to the fixed Azure origin; there is no local-data fallback.

Requests are restricted to HTTPS loopback on `localhost` and the configured port. Mutations require the exact local `Origin`; cross-site requests are rejected except for safe top-level document navigation. The browser-side production session and advisor cookies are renamed to port-scoped host-only cookies so a second development port cannot overwrite the first port's browser session. Only those mapped cookies return upstream, only allowed response cookies return to the browser, and redirects are accepted only when they are root-relative or point to the fixed API origin. Request/response bodies stream and client cancellation is propagated.
