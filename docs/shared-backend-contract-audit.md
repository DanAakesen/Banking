# Shared-backend contract audit

**Audit date:** 27 September 2026  
**Purpose:** Read-only compatibility and security review for [the shared-production-backend plan](shared-production-backend-plan.md). This records live observations separately from the current checkout's source contract. No production financial data or running services were changed.

## Live observations

Probed `https://banking-dan-0ac7d719.azurewebsites.net` over HTTPS without owner credentials or financial-data requests.

| Request | Result | What it establishes |
| --- | --- | --- |
| `GET /` | `200 text/html` | The deployed app serves its shell from the Azure origin. |
| `GET /health` | `200`, `{"status":"running","environment":"azure"}` | The production API host is responding. |
| `GET /api/browser/status` with `X-Banking-Client: web` | `200`, `role: null`, `passwordConfigured: true`, `localAdvisor: true` | The browser status contract is public to the documented web client; the deployed advisor feature flag is on. |
| `POST /api/browser/demo`, then `GET /api/browser/status` | `200`; role verified as `Demo` | Try Demo can establish a production browser session. Cookie contents were not recorded. |
| `GET /advisor/api/workspace` in that fresh Demo session | `200`, `aiConfigured: true` | The hosted advisor workspace endpoint is live and reports AI configured. No prompt or paid AI request was made. |
| `POST /api/browser/logout` | `204` | The temporary Demo session was revoked. |
| Public shell scripts including `/app.js`, `/auth-ui.js`, `/ai-workspace-ui.js`, and `/overview-advisor.js` | `200` | Static assets are served without a browser session. The deployed advisor client uses `/advisor/api/...`; the shell checks `/api/browser/status`. |

The live shell CSP is `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; frame-src 'self' https://www.tradingview-widget.com`. It allows same-origin API calls and frames, not an absolute Azure artifact frame from a localhost page.

These probes did not access the authenticated financial `/api/*` surface, bank data, owner workspace, provider status, voice session creation, generated artifacts, or Saxo. The deployed build is not identified by `/health`, and the checkout has no Git history or reported build hash matching Azure. The live protected main API version and whether the current shared-scope change is deployed remain unverified.

## Current browser and route contract

The shell and advisor clients use root-relative URLs and browser credentials: the main app calls `/api/...`; the advisor calls `/advisor/api/...` with `credentials: 'same-origin'`. The local frontend host must preserve these paths and the same-origin browser model.

The main API route inventory in `src/Banking.Api/Endpoints.cs`, `PlanningEndpoints.cs`, and `Program.cs` covers browser login/status, mode and provider connections, accounts and transactions, categories and rules, budgets and budget plans, goals, review, summaries/jobs, markets/research, loans/wealth/pension preview, and advisor context. Production route inventory is not published: `/health` only reports running/environment, and OpenAPI is mapped only outside cloud hosting. There is no current build or capability identifier for comparing the local page's backend with Azure.

The deployed browser auth status is verified above. The current source contract uses `X-Banking-Client: web`, HTTPS, and exact same-origin validation for browser exchange and write requests. It issues the opaque `__Host-Banking.Local` cookie with `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, and an eight-hour lifetime. Cloud blocks `/api/browser/ticket`, `/api/browser/session`, and `/api/browser/password`; the local frontend flow must use the production `/api/browser/demo`, `/api/browser/sign-in`, `/api/browser/status`, and `/api/browser/logout` operations. The server derives Owner or Demo role from its session store. Demo cannot select Live through a forged mode header.

Cookies are not scoped by port. Several services can share the `localhost` cookie jar even when they listen on different ports. Give the local host a distinct browser-cookie name, then translate only that cookie's name to the production `__Host-Banking.Local` name on the fixed upstream request and translate the matching `Set-Cookie` name back. Preserve the opaque value and host-only, secure attributes. Apply an equivalent local namespace to the advisor's `banking_advisor_demo` cookie, whose upstream path is rewritten from `/api` to `/advisor/api`. Do not forward unrelated cookies or expose either cookie to arbitrary hosts. Local and Azure sessions remain separate; shared Demo data does not require shared login cookies.

In the current source, `LocalAdvisorProxy` owns `/advisor/*` and `/advisor-render/*`. In Azure it forwards to the local Node companion; the live `localAdvisor: true` flag and successful `/advisor/api/workspace` request confirm that the deployed advisor is enabled. Advisor data reads and writes, memory/library, voice, and render routes are separate from main `/api/*` routes. Voice is available through the advisor service, but voice session creation was not probed because it starts a provider session.

Classify these route groups before implementing the local host:

- Main static UI: files below `src/Banking.Api/wwwroot`, with the root-relative asset paths referenced by `index.html`.
- Advisor static UI: files below `prototypes/advisor/public` when editing that UI locally.
- Main API: `/api/*` to the fixed Azure origin.
- Advisor execution and tools: `/advisor/api/*` to Azure.
- Generated artifact documents: `/advisor-render/artifact/<64 lowercase hex characters>` to Azure.
- Health/legal routes and registered Enable Banking/Saxo callbacks remain production endpoints. The current source now uses the fixed Azure HTTPS callback for cloud synthetic Demo authorization; local Development retains its loopback callback. No callback flow was initiated.

Static fallback must never return HTML for an API or artifact request. Do not proxy `/advisor/*` as one undifferentiated group: local advisor UI files need to be served locally while `/advisor/api/*` remains remote.

## Security and compatibility blockers

### Artifact URLs and isolation

The advisor render endpoint originally returned an absolute renderer URL. The main app assigns that URL to a sandboxed iframe. The artifact response sets a restrictive CSP including `default-src 'none'`, `connect-src 'none'`, `sandbox allow-scripts`, `frame-ancestors`, and a restrictive Permissions Policy. The parent iframe has `sandbox="allow-scripts"` without `allow-same-origin` and `referrerPolicy="no-referrer"`. An artifact response was not requested live because rendering creates a temporary server-side artifact.

C's current working source now returns a root-relative `/advisor-render/artifact/<id>` URL in cloud mode. With the local frontend proxy this keeps the iframe on the browser-visible localhost origin; the cloud artifact CSP permits `'self'` and the configured Azure origin, so same-origin localhost framing should work through the proxy. The Node test checks the sandbox/no-network CSP and bridge origin, but full local-proxy browser framing remains unverified. Retain the iframe sandbox, no-network artifact CSP, restricted message bridge, no-referrer behavior, and permissions policy. Never rewrite arbitrary URLs or let generated content reach the authenticated local API.

**Renderer ownership finding fixed in the working source; production still awaits release.** The review found that a copied opaque artifact URL could previously be opened by another authenticated visitor. The coordinator reviewed the fix: minted cloud URLs now carry the workspace mode, `LocalAdvisorProxy` validates that mode against the authenticated cookie/owner role and injects identity itself, and the renderer compares the cookie-derived session-and-mode hash with the stored `sid`. Missing identity, another visitor, and a mismatched workspace are rejected. Node regression tests verify both legitimate Demo/Live previews and those rejection cases. Sandbox and CSP protections remain. Final .NET proxy verification is recorded in the execution evidence.

The source CSP and deployed CSP differ: current source adds one reviewed style hash for the Codex annotation overlay; the live shell observed here allows only `style-src 'self'`. Preserve the strict deployed policy and do not add `unsafe-inline` or broad origins to make local rendering work. The local host may need to match the active local source policy for the annotation hash, but should not silently weaken the cloud shell policy.

### Provider callbacks

The Enable Banking Live authorization callback is configured on Azure at `/api/auth/callback/live`; the route selects Live from its fixed path and completes one-use state persisted by the API. The ordinary `/api/auth/callback` is the Demo callback. Saxo uses the production origin at `/api/saxo/auth/callback`, and the callback redirects to the service's fixed `/#/markets` return URL. No current callback returns to the local frontend.

The current source's `ConnectionService.CallbackUri` now selects the fixed Azure HTTPS `/api/auth/callback` for cloud Demo authorization; the loopback callback remains limited to local Development. The focused source test covers both. The protected connection-authorize route was not called because it writes an authorization-attempt row. Do not accept a caller-provided callback.

Start provider consent through the Azure API and keep the registered production callback there. A local-only callback will not receive the registered provider response. If the user experience needs a local return, use a fixed allowlisted destination bound to one-use state or show an explicit safe link. Never accept an arbitrary return URL or move provider OAuth state/cookies to localhost. No provider consent or callback was initiated in this audit.

### Shared Demo scope and private advisor state

Before the current C source change, cloud `DemoScope` was derived by hashing each browser session cookie. `DemoSessionsMiddleware` created a separate financial copy on the first Demo API request, capped copies, and cleaned expired scopes during that path. This was incompatible with the confirmed persistent shared Demo dataset; the live audit deliberately avoided those requests.

The current working source sets cloud Demo `DemoScope` to the canonical empty string in `WorkspaceMiddleware`; `SharedDemoScopeMiddleware` asserts that invariant before the main API handlers. `BankingDb` applies a query filter to every entity type deriving from `Entity`, so the effect covers financial rows and operational rows such as connections, authorization attempts, jobs, imports, reviews, loans, wealth and research. Writes also stamp the current scope. This is not a data migration and does not inspect, merge, seed, or delete database rows. It makes every existing Demo row whose `DemoScope` is empty visible and editable to all Demo sessions; rows in old non-empty visitor scopes remain filtered out. Confirm the exact empty-scope dataset is wholly fictional and reconcile all entity relationships before release.

The previous clone inventory did not include every type named in cleanup (including jobs, authorizations, import items, and transfers); attachments/media and newer advisor tools also needed explicit scope review. The current empty-scope design removes that per-visitor clone path but deliberately shares these EF entities with the canonical Demo records. The new scope is selected server-side, not from client headers or query parameters. Dan's workspace remains in its separate Live database.

Do not reuse that stable financial scope for private advisor data. `LocalAdvisorProxy` currently sends a cookie-derived `X-Banking-Scope`; the advisor service uses it to scope memory and library data. In cloud mode, advisor workspace state is keyed by a hash of the authenticated Banking session and mode, and cloud tests verify separate session scopes for memories and saved artifacts. The renderer ownership fix above now also binds previews to the authenticated session and workspace. Verify proposals, memories, uploaded artifacts, generated revisions, and tool reads/writes follow the same private boundary.

### Saxo SIM and release drift

Dan confirmed on 17 September that Demo visitors may use the existing Saxo SIM connection for simulation reads; LIVE remains owner-only. This supersedes the earlier blanket Demo provider-access restriction. The current source stores SIM and LIVE credential/token state in separate protected App Service files, not per browser or Demo financial scope. Keep SIM credentials and tokens server-side, permit only the authorized SIM read capability for Demo, and keep every LIVE path owner-only. Do not infer that source-only SIM order endpoints are deployed: `SaxoOrders.LocalSim` rejects non-Development/non-Testing hosts, and its ticket scope is currently derived from `Workspace.Mode + DemoScope`.

The 17 September deployment note in `.azure/deployment-plan.md` reports hosted Saxo SIM credentials and callback readiness, but hosted sign-in/read remained pending then. That is dated release evidence, not a current connected-session check. This audit did not read token state or call Saxo. Source-only order endpoints added later must not be treated as production capabilities.

### Local transport first-pass review

Read-only review of `tools/frontend-host/Program.cs` and `tools/frontend-host/tests/FrontendHost.Tests/TransportTests.cs` found the main boundary in the right shape: the upstream origin is fixed in code, redirects/cookies/automatic decompression are disabled in `SocketsHttpHandler`, connect timeout is bounded, request headers are allowlisted, cookies are explicitly translated, and response bodies use `ResponseHeadersRead` plus request-abort cancellation. `/api/*`, `/advisor/api/*`, and opaque artifact routes are distinct from explicit local static allowlists; unmatched paths return 404. The current transport tests cover per-port cookie mapping, static/API separation, upstream outages, chunked response streaming, client cancellation, and stripping provider/untrusted redirects.

The first host version used one localhost session cookie name for both supported ports. Browsers do not scope cookies by port. Current source and tests now use/assert port-specific session and advisor cookie names, and `ReadPort` defaults to the confirmed `https://localhost:5443` origin. The source-reference scan found the advisor theme and scene assets missing from the original allowlist; current code serves a theme-variable prefix from the main stylesheet and maps the scene to the local evening image, with tests for both routes.

The API redirect mapper maps only the fixed Azure origin back to localhost and strips untrusted external redirect locations; transport tests exercise both cases. Saxo's actual SIM authorization host in source is `sim.logonvalidation.net` (LIVE is `live.logonvalidation.net`), while the current Saxo connect response returns its authorization URL as JSON, so the HTTP `Location` mapper is not the normal consent path. Do not widen redirects without a concrete endpoint contract. The provider callback and Saxo return target remain Azure URLs; completing consent from localhost returns to Azure, where the localhost cookie is absent. Keep the registered Azure callback and provide a clear path back to the local UI unless a fixed, one-use return flow is separately implemented.

The coordinator reports 18/18 frontend-host tests passing in both Debug and Release, plus an HTTP smoke check with ten static assets and Azure health, Demo login, advisor workspace, and logout succeeding. The smoke check did not establish browser rendering behavior; the browser-control surface was unavailable. The source review confirms chunked streaming, client cancellation, and exact-host redirect mapping have test coverage. Local-versus-cloud artifact framing through a real browser remains unverified. The artifact URL ownership gap was fixed in source and covered by regression checks; deployed browser acceptance remains pending. Keep `/advisor-render` behind the authenticated proxy; do not expose the Node renderer port.

`artifacts/saxo-20260917.zip` is present, but the workspace has no Git history or deployed build identifier to establish that it matches the running Azure app. Treat it as a dated local artifact, not release provenance; no deployment or artifact publication was performed in this audit.

## Handoff to implementation

**B can proceed** with a loopback-only HTTPS static host, fixed Azure upstream, root-relative route preservation, exact Host/Origin checks, local cookie-name translation, and separate static/API/artifact routing. Preserve statuses, streaming and cancellation, but forward only allowlisted headers; overwrite validated Host/Origin as the Azure origin and strip spoofable session/scope/forwarding headers. Keep provider callbacks pointed at Azure.

**C should gate shared-Demo release** on a stable server-owned financial scope, no automatic per-visitor clone/expiry for normal reads, confirmation that the canonical empty-scope dataset is fictional and referentially consistent, independent private advisor scopes including renderer fetch authorization, the confirmed shared Demo Saxo SIM-read behavior with owner-only LIVE access, and server-side protection of provider credentials. Add harmless build/capability metadata because current production exposes no route for comparing backend builds; do not advertise a capability as deployed until it is in Azure.

The following remain unverified live: authenticated main `/api/*` route versions, owner-only data paths, current Saxo connection state, voice/WebRTC, prompt streaming/cancellation, and artifact rendering through localhost. They require the new shared-scope behavior or a narrow, non-mutating acceptance method; they were not inferred from a successful static build or source map.

**Audit boundary:** the only protected request used a fresh Demo session for advisor workspace status; it made no financial API call. The session was logged out with HTTP 204. No owner login, private record read, financial record write, provider consent, trade, or AI prompt was performed.
