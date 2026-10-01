using System.Globalization;

namespace Banking.Api.Providers;

// Synthetic fixtures only; a simulator result never proves live bank connectivity.
public sealed class SimulatorProvider : IBankProvider
{
    public string Name => "simulator";
    public bool IsDemo => true;
    public Task CloseSession(string session, CancellationToken ct) => Task.CompletedTask;
    public Task<IReadOnlyList<BankInfo>> Banks(CancellationToken ct) => Task.FromResult<IReadOnlyList<BankInfo>>(
        [new("Demo Bank", "DK", 180 * 86400, true), new("Demo Euro Bank", "DE", 90 * 86400, true)]);
    public Task<string> Authorize(string bank, string country, string state, Uri callback, DateTimeOffset until, CancellationToken ct)
        => Task.FromResult($"{callback}?state={Uri.EscapeDataString(state)}&code={(country == "DE" ? "demo-eur" : "demo-dkk")}");
    public Task<BankSession> Complete(string code, CancellationToken ct)
    {
        if (code is not ("demo-dkk" or "demo-eur")) throw new ProviderFailure("INVALID_CODE");
        var currency = code == "demo-eur" ? "EUR" : "DKK";
        return Task.FromResult(new BankSession(code, DateTimeOffset.UtcNow.AddDays(90),
            [new($"{code}-main", $"{code}-identity-main", "Demo current account", currency),
             new($"{code}-savings", $"{code}-identity-savings", "Demo savings account", currency)]));
    }
    public Task<TransactionPage> Transactions(string session, string account, bool full, DateOnly? from, DateOnly to, string? cursor, CancellationToken ct)
    {
        var currency = session == "demo-eur" ? "EUR" : "DKK";
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var all = account.EndsWith("savings", StringComparison.Ordinal)
            ? new List<SourceTransaction> { new("saving-in", 1000, currency, today.AddDays(-2), today.AddDays(-2), "Demo transfer", "BOOK") }
            : new List<SourceTransaction> {
                new("salary", 25000, currency, today.AddDays(-5), today.AddDays(-5), "Demo salary", "BOOK"),
                new("groceries", -425.50m, currency, today.AddDays(-4), today.AddDays(-4), "Demo grocery store", "BOOK"),
                new("rent", -8000, currency, today.AddDays(-3), today.AddDays(-3), "Demo rent", "BOOK"),
                new("saving-out", -1000, currency, today.AddDays(-2), today.AddDays(-2), "Demo transfer", "BOOK"),
                new(null, -25, currency, today.AddDays(-1), null, "Demo coffee", "BOOK"),
                new(null, -25, currency, today.AddDays(-1), null, "Demo coffee", "BOOK"),
                new(null, -99, currency, null, today, "Demo reservation", "PDNG"),
                new("historical", -150, currency, today.AddYears(-2), today.AddYears(-2), "Demo historical purchase", "BOOK") };
        var filtered = all.Where(x => full || x.BookingDate is null || x.BookingDate >= from && x.BookingDate <= to).ToList();
        // The first page is intentionally empty but has a continuation key.
        if (cursor is null) return Task.FromResult(new TransactionPage([], "0"));
        var offset = int.Parse(cursor, CultureInfo.InvariantCulture);
        var items = filtered.Skip(offset).Take(2).ToList();
        var next = offset + items.Count < filtered.Count ? (offset + items.Count).ToString(CultureInfo.InvariantCulture) : null;
        return Task.FromResult(new TransactionPage(items, next));
    }
    public Task<IReadOnlyList<SourceBalance>> Balances(string session, string account, CancellationToken ct)
        => Task.FromResult<IReadOnlyList<SourceBalance>>([new(account.EndsWith("savings", StringComparison.Ordinal) ? 1000 : 15374.50m,
            session == "demo-eur" ? "EUR" : "DKK", "CLBD", DateTimeOffset.UtcNow)]);
}
