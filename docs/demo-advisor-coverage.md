# Demo and owner advisor data

Confirmed 17 September 2026: Dan is the only real user. All other users are Demo visitors; no registration or additional real-user accounts are required.

The text and voice advisor share `/api/advisor-context` in the authenticated workspace. The context includes accounts and booked balances, categories, all saved budget entries, budget progress, actual cash flow, goal journeys, loans and scenarios, dated investment/pension statements, recorded wealth and watchlist research. Watchlist interests are not holdings or orders. Missing live data must remain missing; never fall back to synthetic prototype values.

Hosted Demo sessions copy only the synthetic template, with new IDs and preserved relationships. This now includes `LoanRecord`, `WealthRecord` and `ResearchItem`. Existing budget/account/goal data continues to use the same copy mechanism. Each visitor has an independent scope; the owner Live workspace remains a separate database. Local development retains its existing shared Demo workspace.

Missing financial domains receive provider-neutral examples at initial Demo creation or creation of a new visitor copy: 60,000 DKK recorded example loan, two investment valuations totaling 80,000 DKK, 510,000 DKK pension capital and two research interests. Existing records and observation dates are preserved. Synthetic investment statements are not Saxo positions. No new PFA/Pensure schema or payout estimate is invented. Records deleted during a visitor session are not reinserted on subsequent reads.

For an existing local template, run the explicit, idempotent maintenance action `enrich-demo-financial-examples` in Demo mode. It rejects Live and non-synthetic connections. This is not a startup reset. The existing enriched household template remains the source of accounts, transactions, budgets and goals; supplementary examples do not invent historical bank transactions or budget payments.

Confirmed correction, 17 September 2026: Demo visitors may connect to and read the configured shared Saxo SIM account. SIM is separate from synthetic statements and never contributes to recorded wealth. LIVE remains owner-only, enforced on status, OAuth start and portfolio preview endpoints. Credentials stay server-side. Demo's market selector offers only SIM, including after switching from an owner's saved LIVE selection. Existing provider setup requirements still apply; no deployment is included.

Validation: SQL integration tests cover template enrichment, new visitor copies, record remapping, isolation, deletions, the owner context and Live seeding rejection. Advisor tests exercise both text and voice routing with supplied contexts for owner, existing Demo and new Demo identities, plus failure behavior without fixture fallback. These use test doubles for OpenAI; real browser acceptance is recorded separately in the production test plan.
