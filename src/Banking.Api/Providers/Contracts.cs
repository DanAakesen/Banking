namespace Banking.Api.Providers;

public sealed record BankInfo(string Name, string Country, int MaximumConsentSeconds, bool IsDemo);
public sealed record ProviderAccount(string Id, string Identity, string Name, string Currency, IReadOnlyList<string>? IdentityAliases = null,
    AccountBankDetails? Details = null);
public sealed record AccountBankDetails(string? Description, string? Type, string? Product, IReadOnlyList<BankIdentifier> Identifiers);
// Raw account identifiers never cross the adapter boundary or enter staging/logs.
public sealed record BankIdentifier(string Scheme, string Fingerprint, string Masked);
public sealed record TransactionBankDetails(string? Creditor, string? Debtor, BankIdentifier? CreditorAccount,
    BankIdentifier? DebtorAccount, string? MerchantCategoryCode, string? BankCode, string? BankSubCode,
    string? BankDescription, DateOnly? TransactionDate, decimal? BalanceAfter, string? BalanceCurrency);
public sealed record BankSession(string Id, DateTimeOffset ValidUntil, IReadOnlyList<ProviderAccount> Accounts);
public sealed record AuthorizedSession(string Bank, string Country, DateTimeOffset CreatedAt, BankSession Session);
public sealed record SourceTransaction(string? Reference, decimal Amount, string Currency, DateOnly? BookingDate,
    DateOnly? ValueDate, string Description, string Status, TransactionBankDetails? Details = null);
public sealed record SourceBalance(decimal Amount, string Currency, string Type, DateTimeOffset? BankTime);
public sealed record TransactionPage(IReadOnlyList<SourceTransaction> Items, string? Cursor);
public sealed class ProviderFailure(string code, TimeSpan? retryAfter = null) : Exception(code)
{
    public string Code { get; } = code;
    public TimeSpan? RetryAfter { get; } = retryAfter;
}
public interface IBankProvider
{
    string Name { get; }
    bool IsDemo { get; }
    Task<IReadOnlyList<BankInfo>> Banks(CancellationToken ct);
    Task<string> Authorize(string bank, string country, string state, Uri callback, DateTimeOffset until, CancellationToken ct);
    Task<BankSession> Complete(string code, CancellationToken ct);
    Task<TransactionPage> Transactions(string session, string account, bool full, DateOnly? from, DateOnly to, string? cursor, CancellationToken ct);
    Task<IReadOnlyList<SourceBalance>> Balances(string session, string account, CancellationToken ct);
    Task<AccountBankDetails?> AccountDetails(string session, string account, CancellationToken ct) => Task.FromResult<AccountBankDetails?>(null);
    Task CloseSession(string session, CancellationToken ct) => throw new ProviderFailure("SESSION_CLOSURE_NOT_SUPPORTED");
}
public sealed class ProviderRegistry(IEnumerable<IBankProvider> providers)
{
    public IBankProvider Get(string? name = null) => providers.FirstOrDefault(x => name == null || x.Name == name)
        ?? throw new ProviderFailure("PROVIDER_NOT_ENABLED");
}
