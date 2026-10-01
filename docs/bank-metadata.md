# Bank metadata and account balance history

Implemented locally on 10 September 2026 following Dan's approval. No Azure resources, deployment, new consent scope, payment capability or AI integration.

## Data and privacy

The provider-neutral contracts now preserve creditor/debtor names, masked account identifiers with internal normalized fingerprints, merchant category code, bank transaction code/subcode/description, optional transaction date and balance after transaction with its currency. Account metadata preserves description, cash account type, product and identification fingerprints. Full counterpart account numbers never leave the Enable Banking adapter; they are neither staged nor exposed in browser responses. Unknown optional fields remain unknown. Bank metadata is not emitted in application logs.

The nullable BankMetadata migration preserves existing rows. Encrypted backup/restore includes the new entity fields. Transaction identity retains the exact legacy serialization of the original seven source fields: adding metadata cannot change fallback identities or discard manual categories. Custom account names, explicit savings flags, budgets and goals remain user-owned.

Evidence: an authorized earlier sample of 119 transactions across three Danske Bank accounts contained 119 post-transaction balances and transaction codes, 90 merchant codes, 80 creditors and 11 debtors. This is a sample, not a completeness claim. Field definitions follow [Enable Banking's official reference](https://enablebanking.com/docs/api/reference/). Optional transaction dates were absent in that sample. Exchange rates and investment/pension data are outside this increment.

## Product behavior

- **Accounts:** a per-account balance history with the selected period, account picker, date/value inspection and recorded-value disclosure. It uses bank-reported booked closing balances on transaction days, not available cash. Within-day closing values require one unique complete balance chain; missing values, mixed currency and ambiguous ordering create gaps. No GUID ordering, estimates or cross-account aggregation.
- **Transaction details:** the existing centered modal adds sender, recipient, masked identifiers, bank description, merchant category and booked balance after posting. Technical codes and rule creation stay collapsed. API responses never include internal fingerprints. The account edit modal shows supplemental bank description/type without changing names or savings settings.
- **Review:** a small, explicit MCC mapping suggests an existing category only if the name mapping resolves uniquely. Unknown codes have no inferred meaning. Nothing is automatically classified from MCC. Exact account-identifier evidence can resolve same-date/amount/currency transfer collisions; known same-scheme conflicts reject candidates. Ambiguous or very large repetitive groups remain manual. Confirm/skip/dismiss/undo keep their existing workflow.
- **Budget, Overview and Goals:** no extra raw bank fields or automatic plan changes. Confirmed review choices feed existing category actuals and transfer exclusions. Goal progress remains tied to its dedicated account.

## Import and Demo

Each existing Enable Banking account receives one full-history enrichment job, scheduled after the existing account cooldown. Paging, provider backoff, consent expiry, checkpointing and reconciliation checks remain active. Completed full imports record BankDetailsImportedAt. An empty chart explains that metadata awaits the next eligible sync. Unavailable or aged-out historical transactions are not invented.

ProductDemoProvider emits wholly synthetic metadata for new imports. For the already refined Demo database, the explicit local maintenance action `enrich-demo-bank-details` updates metadata only. Synthetic running balances reconcile to the existing booked snapshot; no transactions, monetary amounts, categories, goals, budgets or confirmed matches are added/deleted. The command rejects Live. Run it only for an explicitly authorized Demo refinement, never automatically at startup.

`bank-details-status` is a read-only local maintenance action reporting aggregate counts, import timestamps and job status without bank values. Before enrichment, encrypted backups of both product workspaces were saved in the protected local Banking directory.

## Verification and current limitations

- Complete backend suite: 71 passing tests before final queue hardening. Subsequent targeted metadata, Review and public-access suite: 14 passing, including one additional cooldown test.
- Regression coverage includes legacy fallback identity, metadata resync preserving manual classification, masked responses, workspace isolation, missing/ambiguous/negative balance chains, identity matching conflicts, and quota-respecting one-time scheduling.
- The older full browser suite reaches an unrelated stale assertion in `empty-collections.cjs`: it expects budget creation to navigate to `#/budgets/new`, superseded by approved centered modals. Do not restore page navigation to satisfy that assertion.
- Live enrichment was queued for approximately 19:30 Copenhagen time on 10 September, with zero new Live metadata imported at the last status check. The host must remain running; bank/provider restrictions may postpone completion. This is not yet a claim of a completed Live backfill.

Targeted browser verification passed: `BANKING_BANK_DETAILS_ONLY=1 node tests/ui/local-mvp.cjs`, using disposable databases only. Four workflow groups passed with zero script errors, including authenticated/public access, masked details, chart inspection, no overflow at 1440/820/390px in all five themes, and a Review category suggestion preselected without saving. Screenshots are in `artifacts/ui-review/bank-*`. A manual in-app-browser check also verified the centered modal and chart. Live owner acceptance and completed Live backfill remain separate.
