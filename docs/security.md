# Banking — security and access

Status: local security controls implemented and tested; Azure-specific controls remain design requirements. Azure setup and deployment require the separate approval in the [project plan](project-plan.md).

Implemented locally: loopback listeners and Host/IP checks, bearer token encrypted with Windows DPAPI, same-origin browser requests, single-use callback state, protected session/cursor/key material, bounded request/results, optimistic concurrency, and a log-category allowlist with sanitized event fields. The API rejects production configuration. Synthetic and real data cannot share a database. Live enablement requires explicit approval/protection flags and a separate `Banking_Live_` database; these flags must never be set as a shortcut around approval.

The key/data directories now have verified ACLs limited to the Windows owner, SYSTEM, and Administrators. The live database is configured inside that directory; an attached-database test verified both data and transaction-log file placement. Disk encryption is **confirmed by Dan's administrator output on 2026-09-07**: fully encrypted and protection on. His administrator run reported false for key/ACL checks; the backend process independently verified the existing key and ACLs at its configured path. The context discrepancy is unresolved. Application secret protection alone does not encrypt LocalDB financial rows.

Two recovery formats are supported. The original local archive depends on the Windows user/key ring. The new portable archive uses AES-256-GCM with PBKDF2-SHA256 (600,000 iterations, random salt/nonce) and a passphrase entered privately in the terminal. Tests restore it with an unrelated key ring, detect tampering/wrong passphrases, and preserve history/categories while removing reusable bank secrets and requiring reconnection. The user must keep the passphrase separately; no passphrase is logged or stored by the application.

## Local first

- Bind development services to loopback. The auth simulator and synthetic bank data are clearly development features and must be rejected by production configuration.
- Store any real keys in an OS-protected local secret store outside the repository. The repository, screenshots, test fixtures, and ordinary logs must contain no real bank data or secrets.
- Protect the local database/backup with OS access control and encryption; avoid accidental synchronization to third-party file locations. Verify the protection before importing real data.
- Do not create Entra, Key Vault, or other Azure resources as prerequisites for local tests. Dan has authorized Enable Banking integration setup in his Chrome session. Private sign-in and bank/MitID consent remain owner actions; verify local data protection before live import.
- If provider redirect rules require external HTTPS access, submit a limited callback solution for approval. No automatic tunnel, public exposure of the local UI/database, or Azure deployment as a workaround.

## Local browser access — implemented

The static shell contains no bank data or credentials. Try Demo issues a Demo-only browser session without owner authentication. Sign in as Dan verifies the local owner password. First-time password setup requires an existing authenticated owner session; visitors cannot claim the owner identity. The password is hashed with ASP.NET Core Identity PasswordHasher (210,000 PBKDF2 iterations) and the hash is protected with the DPAPI-backed Data Protection key ring outside the repo. Testing hosts always keep this credential in memory. Five failed sign-ins per 15-minute window trigger a temporary lockout; this in-memory throttle resets with the host.

Browser cookies are opaque 256-bit random session tokens; only their SHA-256 hashes, roles and eight-hour expiry times live in server memory. Cookies are HttpOnly, Secure, SameSite=Strict and host-only. Sign-out, entering public Demo, and first password setup revoke prior applicable sessions; restarting the host expires all browser sessions. Every cookie-authenticated API request requires X-Banking-Client: web, and mutation requests also require the exact same HTTPS Origin. Demo requests for Live or owner credential setup are denied before workspace resolution. Only bearer clients can mint two-minute, one-use owner launch tickets. The launch script remains a trusted setup/recovery entry, not the normal sign-in flow.

Loopback host/listener restrictions still apply. CSP restricts scripts/styles/connections to self and forbids frames/objects. API responses are no-store. No bank data, cookies, session tickets or API tokens are stored in localStorage; only validated language/theme values. The selected workspace name alone is stored in sessionStorage and is never accepted as authorization. The local access model is not production Entra authentication. The normal browser uses its trusted localhost certificate; certificate checking was not disabled.

## Account selector and preferences

Goal details and reference links are private financial context scoped to their workspace. Validate reference URLs as ordinary HTTP(S) links and render notes safely; do not automatically fetch linked sites. If link retrieval is later introduced for the advisor, scope it explicitly and treat retrieved content as untrusted data, never instructions or authorization.

The Dan/Demo account selector represents isolated workspaces. Owner sessions can access both; unauthenticated visitors must explicitly enter Demo and receive only Demo permissions. The Demo selector offers Sign in as Dan instead of granting Live access. A display name is never authorization evidence and does not change the allowed login identity. Enforce workspace selection on the server for budgets, suggestions, advisor context, and all other financial reads/edits. Switching must clear previous advisor context and cached views and suppress late responses. Validated theme/language preferences cannot alter provider, credential, or database scope.

## Bank and MitID

- Product Demo mode receives its isolated database/simulator; request scope, callbacks, jobs, edits, and cryptographic purpose separation are tested. It must never resolve live connections or the live bank adapter. The future UI must invalidate caches and reject stale responses when switching. Backend workspace tests do not establish product UI switching or complete live/demo acceptance.

- Account information only (AIS). Implement an allowlist of required authorization, session, and read operations. POST to an AIS session is allowed by the contract; payment endpoints are not.
- Use the bank's official browser flow. Banking must never ask for, receive, proxy, or store MitID information.
- The callback uses short-lived, single-use state tied to the initiated flow. Validate redirect, state, and replay; exchange the code server-side. Avoid callback query strings in access logs, analytics, and error reports.
- A successful session exchange is encrypted and durably checkpointed before local account reconciliation. Authenticated, workspace-bound retry resumes that checkpoint without reusing the callback code, and clears it on success. The completed connection ID makes retries idempotent. Authorization attempts/checkpoints are excluded from backups. Operator repair of older exchanges validates signed session details and exactly one consumed bank/country attempt with a one-minute clock tolerance; it cannot run in Demo.
- Enforce session/expiry and provider limits server-side. Reconnection requires the user's bank approval; do not automatically bypass consent or rate limits.

## Later Azure identities

| Component | Least access |
|---|---|
| Web app/API | Read financial views; change own categories, rules, and budgets; limited calls to the internal connection service |
| Bank integration/worker | Required bank operations, key signing/secret access, and import writes to specified bank/sync tables |
| MCP | SELECT on bounded views; no bank key, raw session data, change access, or bank integration |
| Deployment identity | Separately approved release scope only; not a runtime identity |

Use separate Managed Identities and scoped database/Azure roles; do not grant broad Owner/db_owner rights to runtime. Dan excluded Key Vault on 12 September 2026. Proposed production secrets use encrypted App Service settings with restricted configuration access; signing occurs in server memory. Protect the persistent key ring with separate recoverable encryption material and test rotation/restore. See [current Azure proposal](azure-release-plan.md).

Limit production login to Dan's concrete tenant and object ID behind Dan@novaro.dk; an email string alone is not authorization. Require HTTPS and MFA through an approved Entra setup; submit any license/tenant changes before execution. Control UI and API access on the server.

VNet, Private Endpoints, and Private DNS are not baseline. Before release, validate a concrete design for service firewalls, public endpoint protection, and egress. Do not open access broadly to all Azure customers as an automatic solution. If required access boundaries cannot be met, present the conflict; do not add optional networking without a decision.

## Logs, backup, and AI

- Logs contain only permitted technical fields: job status, duration, count, and anonymous correlation IDs. Redact at the source, including SDK errors, SQL telemetry, proxy/HTTP logs, and callbacks. No raw request/response bodies, amounts, account numbers, transaction text, or tokens.
- Show freshness/errors in the product without sensitive details in operational alerts. Budget alerts are not an automatic spending cap.
- Test backup/restore locally and later in Azure. Preserve categories and history when consent expires; expiry stops future bank access, not reading of the user's stored data.
- Later MCP uses OAuth, correct issuer/audience/scope validation, and user scoping. Proposed tools: accounts, balances, transaction search, spending by category, and budget status.
- Limit dates, accounts, page/result size, and allowed fields. No arbitrary SQL, arbitrary URLs, file access, payments, or write tools. Treat transaction text as data, never as instructions.
- Data returned to ChatGPT leaves Azure. Scope and connection must be approved before live MCP use; a local MCP test does not prove ChatGPT/OAuth compatibility.

