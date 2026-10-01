# Banking — data model

Implemented BudgetEntry refinement: type is Income or Expense; isSavings is valid only for Expense. Nonnegative entered amounts and recurrence are stored separately. Planned monthly summary partitions entries into income, ordinary expenses and savings, then computes available to spend = income − ordinary expenses − savings. Savings is deducted once and does not alter bank-transfer classification. BudgetPlans/BudgetEntries exist in migration 20260907200740_NamedBudgetPlans; a unique filtered index on BudgetPlan.IsActive enforces zero/one active plan per workspace. LastRequestId/Hash supports idempotent immediate saves; parent rowversion covers the full entry set.

The older Budget entity below remains a legacy category-period limit. Named plans and entries are separate; legacy records are not silently converted. See [budget redesign](budget-redesign.md) for implemented behavior and remaining migration questions.

Implemented Review addition: `ReviewActions` stores action kind, item key, source fingerprint, created/snooze/undo timestamps, rowversion and a private JSON undo payload. The payload records previous app-owned category/classification state and versions of created rules/transfer matches. It contains financial descriptions and belongs only in the protected workspace database/encrypted backup, never ordinary logs. Migration `20260907174534_ReviewInbox` adds this table and its indexes; bank-owned transaction fields are unchanged. Undo refuses to overwrite later edits.

Status: the table below describes the target conceptual model. A smaller local schema is implemented with EF Core migrations in `src/Banking.Api/Migrations`: Connections, Accounts, Transactions, Balances, Categories, Rules, ClassificationChanges, Budgets, Goals, Transfers, Jobs, ImportItems, and Authorizations. Amounts use `decimal(19,4)`; entities use SQL rowversion for optimistic concurrency. Local SQL comes first; Azure SQL requires an approved release.

The local single-user implementation has no Owner table, category hierarchy, or separate cross-provider account mapping yet. Provider references are scoped to the connection/account. AccountAliases stores verified alternate identity hashes so reconnect can preserve accounts when the bank changes its preferred identifier. Connections carry a shared rate-limit cooldown; jobs carry durable last-attempt timestamps. The transaction sign preserves debit/credit direction in normalized form; the full provider payload is not retained after staging completes. Classification fields live alongside immutable-to-client bank fields; a separate change table records manual edits. See [implemented semantics and limits](local-backend.md).

| Entity | Responsibility and key fields |
|---|---|
| Owner | Owned user ID; later approved Entra tenant/object ID |
| Bank / ProviderBank | Owned bank ID, name/country; provider name, reference, and properties |
| Connection / Consent | Provider, owner, status, protected session reference, account access, expiry, last success, and reconnection need |
| Account / ProviderAccount | Owned stable account ID, bank, owner, type/currency, protected account identifier; provider and session mapping |
| Transaction / SourceReference | Account, decimal amount, currency, debit/credit, booking/value date, original description, status, provider references, and observation time |
| BalanceSnapshot | Account, amount, currency, balance type, bank reference time, and our load time |
| Category / CategoryRule | Name/hierarchy, match condition, priority, active status, and rule version |
| TransactionClassification | Transaction, category, source (rule/manual), timestamp, and change history |
| Budget | Period, category, currency, amount limit, and owner |
| BudgetSuggestion (planned) | Workspace, category, budget period/currency, proposed limit, source history window, coverage, calculation version, and review status; linked accepted budget where applicable |
| Budget revision (planned) | Budget, previous/new limit, source (accepted suggestion/manual), timestamp; preserve manual edits when recalculating suggestions |
| UserPreferences (implemented in browser) | Validated language and preset theme ID in localStorage; shared across Dan/Demo on that browser. Contains no financial data or secrets; no database entity yet |
| Goal (implemented locally) | Workspace/owner, name, description, target amount/currency, optional deadline, measurement scope (single account/all accounts), account ID for single-account scope, balance basis, optional agreed plan/baseline, and editable detail notes |
| Goal references (implemented locally) | Validated HTTP(S) URLs and optional labels, ordered JSON inside Goal; context links, never automatically downloaded content |
| TransferMatch | Link between transfers across owned accounts; status and manual correction |
| SyncRun / ImportCheckpoint | Connection/account, covered period, protected continuation key, progress, count, anonymous error code, and completion status |

## Rules for correct figures

Automatic-budget suggestions and user preferences are conceptual additions, not existing migrations or API behavior. Use booked categorized spending as the suggestion basis; exclude confirmed internal transfers and duplicate reservations. Define refund/irregular-expense handling and the lookback method before implementation. Keep suggestion provenance and manual edits in the selected workspace; never infer a zero budget from missing history.

Goals and reference details now have a local EF migration, API validation and concurrency control. No records are seeded. Budget suggestions are computed read-only previews; the separate suggestion/revision entities above remain conceptual, not implemented. The owner explicitly creates accepted budgets through the existing API/UI; recalculation never writes budgets. A single-account goal requires an account in the same workspace; an all-account goal resolves that workspace's accounts only. Derive progress from one clearly labeled balance type per account with freshness and coverage. Do not add available and booked balance types together. The proposed default is booked balance; mixed-currency totals require explicit dated conversion rules. Missing/disconnected sources retain the goal and show missing or stale coverage. Shared balances are measurements, not earmarked allocations; a plan/baseline is required for pace status. Notes and links are user context, never instructions that override advisor permissions.

The implemented Authorizations table also stores a protected pending session and completed connection ID. This allows local completion retry after a successful remote code exchange; success clears the protected checkpoint. Shared alternative account hashes are excluded from matching/storage, while primary identity conflicts still fail. These rules were verified against the first live connection and synthetic regressions.

- Use exact decimals, never floating point for money. Define one internal sign convention: income positive, expense negative; preserve the source debit/credit as evidence.
- Store the source currency. Unknown currency is not DKK. Do not sum currencies without a separate dated exchange rate; currency conversion is not required for the first account.
- Preserve balance type and time: available balance, booked balance, and reservations are different measures. Snapshots start at the first observation; do not invent earlier balances.
- Owned account identity survives a new session and provider change. Match verified account identifiers, not account name alone; uncertainty about a match must be visible.
- Provider references are scoped to account/provider, not global. Do not assume `transaction_id` is a stable deduplication key. Reconcile `entry_reference`, status, and relevant properties; identical amounts/text can be two legitimate transactions.
- Reservations can change, become booked, or disappear. Do not count them twice with the final entry.
- Repeated import is idempotent. Save checkpoint and data consistently; do not advance progress past data that has not been saved.
- The bank's original data and the user's categories are separate. Manual classification takes precedence over rules during resync; rule changes must not silently remove it.
- Internal transfers affect account balances but are excluded from spending/income measures by default. Show how budget figures were calculated.
- Protect original fields, raw imports when necessary, session references, and checkpoints as bank data. They belong in the data store, never in ordinary logs or repository fixtures.
