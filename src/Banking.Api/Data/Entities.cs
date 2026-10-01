namespace Banking.Api.Data;

public abstract class Entity
{
    public string DemoScope { get; set; } = "";
    public Guid Id { get; set; } = Guid.NewGuid();
    public byte[] Version { get; set; } = [];
}

public sealed class Connection : Entity
{
    public string Provider { get; set; } = "simulator";
    public string Bank { get; set; } = "Demo Bank";
    public string Country { get; set; } = "DK";
    public string Session { get; set; } = ""; // Protected at rest.
    public DateTimeOffset ValidUntil { get; set; }
    public string Status { get; set; } = "Active";
    public DateTimeOffset? LastSuccess { get; set; }
    public string? ErrorCode { get; set; }
    public bool IsDemo { get; set; }
    public DateTimeOffset? RetryNotBefore { get; set; }
}

public sealed class Account : Entity
{
    public Guid ConnectionId { get; set; }
    public Connection Connection { get; set; } = null!;
    public string IdentityHash { get; set; } = "";
    public string ProviderAccountId { get; set; } = "";
    public string Name { get; set; } = "";
    public string? CustomName { get; set; }
    public bool IsSavings { get; set; }
    public string? BankDetailsJson { get; set; }
    public DateTimeOffset? BankDetailsImportedAt { get; set; }
    public string Currency { get; set; } = "XXX";
    public bool Accessible { get; set; } = true;
    public DateTimeOffset? LastSuccess { get; set; }
    public DateOnly? EarliestTransaction { get; set; }
    public DateTimeOffset? InitialImportCompleted { get; set; }
}

public sealed class AccountAlias : Entity
{
    public Guid ConnectionId { get; set; }
    public Guid AccountId { get; set; }
    public Account Account { get; set; } = null!;
    public string IdentityHash { get; set; } = "";
}
public sealed class BankTransaction : Entity
{
    public Guid AccountId { get; set; }
    public Account Account { get; set; } = null!;
    public string SourceKey { get; set; } = "";
    public string? EntryReference { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "XXX";
    public DateOnly? BookingDate { get; set; }
    public DateOnly? ValueDate { get; set; }
    public string Description { get; set; } = "";
    public string Status { get; set; } = "BOOK";
    public bool Current { get; set; } = true;
    public Guid? CategoryId { get; set; }
    public Category? Category { get; set; }
    public string Classification { get; set; } = "Unclassified";
    public string? BankDetailsJson { get; set; }
    public DateTimeOffset ObservedAt { get; set; }
}

public sealed class BalanceSnapshot : Entity
{
    public Guid AccountId { get; set; }
    public Account Account { get; set; } = null!;
    public Guid JobId { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "XXX";
    public string Type { get; set; } = "";
    public DateTimeOffset? BankTime { get; set; }
    public DateTimeOffset ObservedAt { get; set; }
}

public sealed class Category : Entity { public string Name { get; set; } = ""; }
public sealed class CategoryRule : Entity
{
    public string Contains { get; set; } = "";
    public Guid CategoryId { get; set; }
    public Category Category { get; set; } = null!;
    public int Priority { get; set; }
    public bool Active { get; set; } = true;
}
public sealed class ClassificationChange : Entity
{
    public Guid TransactionId { get; set; }
    public Guid? PreviousCategoryId { get; set; }
    public Guid? CategoryId { get; set; }
    public DateTimeOffset ChangedAt { get; set; }
}
public sealed class BudgetPlan : Entity
{
    public string Name { get; set; } = "";
    public string Currency { get; set; } = "DKK";
    public bool IsActive { get; set; }
    public Guid LastRequestId { get; set; }
    public string LastRequestHash { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public List<BudgetEntry> Entries { get; set; } = [];
}
public sealed class BudgetEntry : Entity
{
    public Guid BudgetPlanId { get; set; }
    public Guid? CategoryId { get; set; }
    public Guid? SavingsAccountId { get; set; }
    public string Name { get; set; } = "";
    public string Type { get; set; } = "Expense";
    public bool IsSavings { get; set; }
    public decimal Amount { get; set; }
    public int IntervalMonths { get; set; } = 1;
    public int Position { get; set; }
    public string Source { get; set; } = "Manual";
    public DateOnly? HistoryFrom { get; set; }
    public DateOnly? HistoryTo { get; set; }
}
public sealed class Budget : Entity
{
    public Guid CategoryId { get; set; }
    public Category Category { get; set; } = null!;
    public DateOnly From { get; set; }
    public DateOnly To { get; set; }
    public string Currency { get; set; } = "DKK";
    public decimal Limit { get; set; }
}
public sealed class TransferMatch : Entity
{
    public Guid OutgoingId { get; set; }
    public Guid IncomingId { get; set; }
}
public sealed class ReviewAction : Entity
{
    public string Kind { get; set; } = "";
    public string ItemKey { get; set; } = "";
    public string Signature { get; set; } = "";
    public string Payload { get; set; } = "{}";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? SnoozeUntil { get; set; }
    public DateTimeOffset? UndoneAt { get; set; }
}
public sealed class Goal : Entity
{
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public string Notes { get; set; } = "";
    public string ReferencesJson { get; set; } = "[]";
    public decimal Target { get; set; }
    public string Currency { get; set; } = "DKK";
    public string Scope { get; set; } = "Account";
    public Guid? AccountId { get; set; }
    public Account? Account { get; set; }
    public DateOnly? Deadline { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    // Explicit baseline for a linear savings plan; optional, never inferred from historical balances.
    public DateOnly? PlanStart { get; set; }
    public decimal? StartingBalance { get; set; }
    public decimal? MonthlyContribution { get; set; }
    public int ContributionDay { get; set; } = 1;
    public string? PhotoDataUrl { get; set; }
}
public sealed class SyncJob : Entity
{
    public Guid AccountId { get; set; }
    public Account Account { get; set; } = null!;
    public string Status { get; set; } = "Queued";
    public bool FullHistory { get; set; }
    public string? Cursor { get; set; } // Protected at rest.
    public int Pages { get; set; }
    public int Items { get; set; }
    public int Attempts { get; set; }
    public bool FetchCompleted { get; set; }
    public DateOnly? From { get; set; }
    public DateOnly To { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset NextAttempt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public string? ErrorCode { get; set; }
    public DateTimeOffset? LastAttemptAt { get; set; }
}
public sealed class ImportItem : Entity
{
    public Guid JobId { get; set; }
    public int Ordinal { get; set; }
    public string Payload { get; set; } = "";
}
public sealed class AuthorizationAttempt : Entity
{
    public string StateHash { get; set; } = "";
    public string Provider { get; set; } = "";
    public string Bank { get; set; } = "";
    public string Country { get; set; } = "DK";
    public Guid? ReconnectId { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? UsedAt { get; set; }
    public string? PendingSession { get; set; } // Protected; retained only until local completion succeeds.
    public Guid? CompletedConnectionId { get; set; }
}
