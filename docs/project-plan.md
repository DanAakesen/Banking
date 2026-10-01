# Banking — delivery plan

Updated 12 September 2026. The [feature roadmap](roadmap.md) is the canonical tracker for Azure, advisor/voice, investments, loans, pensions and the optional market terminal. It supersedes older planning text that indefinitely deferred actual AI or required every future feature before the first Azure release.

## Current position

The local banking backend, connection and approved main screens are implemented. Additional Danske Bank metadata is implemented; see [bank metadata](bank-metadata.md) for evidence and limitations. Implementation evidence is not blanket owner acceptance or permission to deploy.

Dan wants to prioritize major capabilities over minor polish. The next recommended milestone is an Azure release of the existing banking experience, so mobile access does not depend on the PC. AI/voice and the new financial domains are confirmed desired features for subsequent increments. Their exact ordering remains open to refinement.

## Release sequence

| Step | Deliverable | Gate |
|---|---|---|
| 1 — Define first release | Existing banking workflows, public Demo and private Dan; separate cosmetic backlog from genuine blockers | Explicit acceptance scope, not the entire long-term roadmap |
| 2 — Prepare locally | Production-compatible auth, secret/storage adapters, durable jobs and migration rehearsal; preserve the existing stack where practical | Validate relevant security, financial correctness, Demo isolation, recovery and mobile workflows locally |
| 3 — Review Azure proposal | Services, subscription/region, identity, cost estimate, migration, monitoring, backup and rollback | **Dan explicitly approves the concrete resources, registrations and deployment** |
| 4 — Deploy and verify | Approved Azure resources and app, preserved history, HTTPS, sign-in, callback and sync | Reconcile migrated records and verify hosted behavior; retain local recovery copy |
| 5 — Advisor release | Approved overlay design, text/voice and bounded what-if analysis | Local Demo prototype, data-processing/cost decision, authorized real-data validation, then separately approved deployment |
| 6 — Financial-domain increments | Loan planning, Saxo, pensions and optional market workspace | Validate each increment independently; provider access/terms and deployment approved as applicable |

These are phases, not time estimates. Provider research and design can proceed alongside Azure preparation. Cosmetic issues do not block independent work; authentication, privacy, financial data integrity and core workflow failures do.

## Delivery rules

- **Local first, deployment last within each release.** The complete first-release MVP must work locally before provisioning. Do not deploy to work around an unresolved local bank connection. Hosted callback, identity and recovery behavior still require verification after deployment.
- Preparing this roadmap does not authorize Azure resources, registrations, cloud secrets, permission changes, tunnels, paid API sessions or public endpoints. Prepare a reviewable scope before requesting approval.
- Preserve imported history and user corrections during migration; reimporting currently available bank history is insufficient. Test restoration and retain a rollback path.
- Keep one site with public Demo and private Dan. Resolve production identity explicitly; local password/capability authentication and Windows DPAPI are not automatically a hosted production design.
- New UI follows collaborative design approval. Screenshots and concise acceptance steps should support review from Dan's phone.
- Actual AI is planned; the running advisor remains a placeholder until implemented and validated. Read-only bank access, no trades/payments and strict Demo/Live isolation remain binding.
- Dan currently has no investments or loan. Do not populate Live with fictional assets, obligations or assumed house-finance terms. Authorized synthetic Demo scenarios can support development without indiscriminately overwriting user changes.

## Evidence and history

The original backend-first, collaborative-design and frontend sequence is recorded in [local backend](local-backend.md), [frontend review](frontend-review.md), [local frontend](local-frontend.md) and [decisions](decisions.md). Historical test counts and acceptance notes are dated evidence, not a claim that all current release conditions have passed. Maintain current feature status in the roadmap instead of duplicating old phase numbers here.

## Optional to-do after the project plan — excluded

- **VNet, Private Endpoints and Private DNS:** optional later work requiring a separate decision, price and approval. Excluded from the baseline architecture, initial release prerequisites and cost estimate; do not introduce them through a deployment template.
