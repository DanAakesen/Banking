using System.Globalization;

namespace Banking.Api.Providers;

// Entirely invented data. Only structural scenarios (three DKK accounts, paging, balance types,
// shared alternative identity) were informed by live acceptance. No live values are inputs.
public sealed class ProductDemoProvider(TimeProvider clock) : IBankProvider
{
    public string Name => "product-demo";
    public bool IsDemo => true;
    public const string SessionId = "fictional-household-v1";
    public static readonly string[] Roles = ["everyday", "bills", "savings", "car", "summerhouse"];
    public static string DisplayName(string value)
    {
        var clean = value.StartsWith("Demo ", StringComparison.Ordinal) ? value[5..] : value;
        return DemoLanguage.Translate(clean.Length == 0 ? clean : char.ToUpperInvariant(clean[0]) + clean[1..]);
    }
    public Task<IReadOnlyList<BankInfo>> Banks(CancellationToken ct) => Task.FromResult<IReadOnlyList<BankInfo>>(
        [new("Familiens demobank", "DK", 180 * 86400, true)]);
    public Task<string> Authorize(string bank, string country, string state, Uri callback, DateTimeOffset until, CancellationToken ct)
        => Task.FromResult($"{callback}?state={Uri.EscapeDataString(state)}&code={SessionId}");
    public Task<BankSession> Complete(string code, CancellationToken ct)
    {
        if (code != SessionId) throw new ProviderFailure("INVALID_CODE");
        return Task.FromResult(new BankSession(SessionId, clock.GetUtcNow().AddDays(180), Roles.Select(role =>
            new ProviderAccount(role, "fictional-identity-" + role, DisplayName(role == "car" ? "Car savings account" : role == "summerhouse" ? "Summer house savings account" : role + " account"), "DKK",
                ["fictional-alternate-" + role, "fictional-shared-alternative"], DemoBankDetails.Account(role))).ToList()));
    }
    public Task<AccountBankDetails?> AccountDetails(string session, string account, CancellationToken ct)
    { Require(session,account); return Task.FromResult<AccountBankDetails?>(DemoBankDetails.Account(account)); }
    public Task CloseSession(string session, CancellationToken ct) => Task.CompletedTask;
    public Task<TransactionPage> Transactions(string session, string account, bool full, DateOnly? from, DateOnly to, string? cursor, CancellationToken ct)
    {
        Require(session, account);
        var rows = Rows(account).Where(x => full || x.BookingDate is null || x.BookingDate >= from && x.BookingDate <= to)
            .OrderByDescending(x => x.BookingDate).ThenBy(x => x.Reference, StringComparer.Ordinal).ToList();
        var offset = cursor is null ? 0 : int.Parse(cursor, CultureInfo.InvariantCulture);
        if (offset < 0 || offset > rows.Count) throw new ProviderFailure("INVALID_CURSOR");
        var page = rows.Skip(offset).Take(100).ToList();
        return Task.FromResult(new TransactionPage(page, offset + page.Count < rows.Count ? (offset + page.Count).ToString(CultureInfo.InvariantCulture) : null));
    }
    public Task<IReadOnlyList<SourceBalance>> Balances(string session, string account, CancellationToken ct)
    {
        Require(session, account);
        var rows = Rows(account);
        var opening = account == "savings" ? 22000m : account == "bills" ? 6000m : account == "everyday" ? 12000m : 0m;
        var booked = opening + rows.Where(x => x.Status == "BOOK").Sum(x => x.Amount);
        var available = booked + rows.Where(x => x.Status == "PDNG").Sum(x => x.Amount);
        return Task.FromResult<IReadOnlyList<SourceBalance>>([new(booked, "DKK", "ITBD", clock.GetUtcNow()), new(available, "DKK", "ITAV", clock.GetUtcNow())]);
    }
    private static void Require(string session, string account)
    {
        if (session != SessionId || !Roles.Contains(account, StringComparer.Ordinal)) throw new ProviderFailure("INVALID_DEMO_ACCOUNT");
    }
    private List<SourceTransaction> Rows(string role)
    {
        var today = DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime);
        // A fixed fictional opening date keeps booked entries stable across subsequent daily syncs.
        var first = new DateOnly(2024, 1, 1);
        var rows = new List<SourceTransaction>();
        void Add(DateOnly date, string key, decimal amount, string description, string status = "BOOK", bool reference = true)
        {
            if (date > today) return;
            rows.Add(new(reference ? $"fictional-{role}-{date:yyyyMMdd}-{key}" : null, amount, "DKK",
                // Retain the original source payload for stable fingerprints of entries without references.
                // Sync stores the clean display description after computing identity.
                status == "BOOK" ? date : null, date, "Demo " + description, status));
        }
        for (var month = first; month <= today; month = month.AddMonths(1))
        {
            if (role == "everyday")
            {
                Add(month, "salary", 28500m, "salary");
                // Additive family-of-four history: deterministic amounts and references survive every sync.
                // Two working adults, two school-age children; wholly invented merchants and spending.
                var variation = ((month.Year * 12 + month.Month) % 7 - 3) * 17m;
                Add(month, "family-partner-salary", 24500m, "partner salary");
                Add(month.AddDays(1), "family-bills-transfer", -11000m, "family bills transfer");
                Add(month.AddDays(1), "car-savings-transfer", -2500m, "car savings transfer");
                Add(month.AddDays(1), "summerhouse-savings-transfer", -5000m, "summer house savings transfer");
                foreach (var day in new[] { 2, 9, 16, 23 })
                    Add(month.AddDays(day), "family-supermarket", -(830m + day * 5m + variation), "supermarket family shop");
                foreach (var day in new[] { 5, 12, 19, 26 })
                    Add(month.AddDays(day), "family-fresh-food", -(145m + day * 2m), "bakery and fresh food");
                Add(month.AddDays(3), "family-school-lunch", -740m, "school lunches");
                Add(month.AddDays(5), "family-fuel", -(850m + variation), "fuel station");
                Add(month.AddDays(20), "family-fuel-second", -(720m - variation), "fuel station");
                Add(month.AddDays(6), "family-parking", -180m, "parking and bridge tolls");
                Add(month.AddDays(8), "family-clothing", -(850m + (month.Month % 3) * 125m), "children clothing and shoes");
                Add(month.AddDays(12), "family-takeaway", -(480m + variation), "family takeaway");
                Add(month.AddDays(22), "family-restaurant", -(690m - variation), "family restaurant");
                Add(month.AddDays(10), "family-pharmacy", -(235m + month.Month % 4 * 45m), "pharmacy");
                Add(month.AddDays(15), "family-sport", -640m, "children sports clubs");
                Add(month.AddDays(18), "family-outing", -(395m + month.Month % 3 * 130m), "family cinema and outings");
                Add(month.AddDays(21), "family-lunch", -980m, "workplace lunches");
                Add(month.AddDays(24), "family-gifts", -(350m + variation), "birthday gifts");
                Add(month.AddDays(25), "family-home", -(540m + month.Month % 4 * 110m), "home and garden");
                Add(month.AddDays(6), "family-music", -169m, "music family subscription");
                if (month.Month % 3 == 0) Add(month.AddDays(13), "family-swimming", -1260m, "swimming lessons");
                if (month.Month is 3 or 9) Add(month.AddDays(16), "family-dentist", -1450m, "family dental care");
                if (month.Month == 2) Add(month.AddDays(10), "family-winter-break", -8200m, "winter school holiday");
                if (month.Month == 7) Add(month.AddDays(9), "family-summer-holiday", -24500m, "summer family holiday");
                if (month.Month == 8) Add(month.AddDays(9), "family-school-kit", -1850m, "back to school supplies");
                if (month.Month == 12) Add(month.AddDays(15), "family-christmas", -4600m, "Christmas gifts");
                if (month.Month == 5) Add(month.AddDays(18), "family-car-service", -4200m, "annual car service");

                Add(month.AddDays(1), "bills-transfer", -10500m, "bills transfer");
                Add(month.AddDays(1), "savings-transfer", -1800m, "savings transfer");
                Add(month.AddDays(4), "transport", -495m, "transport pass");
                Add(month.AddDays(7), "subscription", -129m, "streaming subscription");
                Add(month.AddDays(11), "dining", -365m, "restaurant");
                Add(month.AddDays(17), "shopping", -650m, "household shopping");
                foreach (var day in new[] { 3, 10, 17, 24 }) Add(month.AddDays(day), "groceries", -(410m + day * 7m), "groceries");
                if (month.Month % 3 == 0) Add(month.AddDays(19), "refund", 225m, "purchase refund");
                Add(month.AddDays(14), "coffee-a", -32m, "coffee", reference: false);
                Add(month.AddDays(14), "coffee-b", -32m, "coffee", reference: false);
            }
            else if (role == "bills")
            {
                Add(month.AddDays(1), "transfer", 10500m, "bills transfer");
                Add(month.AddDays(1), "family-transfer", 11000m, "family bills transfer");
                Add(month.AddDays(3), "family-childcare", -3900m, "after school childcare");
                Add(month.AddDays(5), "family-car", -3800m, "family car lease");
                Add(month.AddDays(7), "family-heating", -(month.Month is >= 5 and <= 9 ? 650m : 1450m), "district heating");
                Add(month.AddDays(9), "family-phones", -338m, "family mobile plans");
                Add(month.AddDays(11), "family-insurance", -480m, "family accident insurance");
                Add(month.AddDays(13), "family-union", -990m, "union and unemployment fund");
                if (month.Month % 3 == 0) Add(month.AddDays(14), "family-water", -1890m, "water and waste");

                Add(month.AddDays(2), "housing", -7400m, "housing");
                Add(month.AddDays(4), "utilities", -850m, "utilities");
                Add(month.AddDays(8), "insurance", -620m, "insurance");
                Add(month.AddDays(10), "internet", -279m, "internet");
            }
            else if (role == "savings") Add(month.AddDays(1), "transfer", 1800m, "savings transfer");
            else if (role == "car") Add(month.AddDays(1), "car-transfer", 2500m, "car savings transfer");
            else if (role == "summerhouse") Add(month.AddDays(1), "summerhouse-transfer", 5000m, "summer house savings transfer");
        }
        // A returned August contribution makes the Car goal visibly behind its explicit savings plan.
        // Preserve every existing deposit; the withdrawal and its counterpart explain the shortfall.
        if (role is "car" or "everyday") Add(new DateOnly(2026, 8, 12), "car-returned-contribution", role == "car" ? -2500m : 2500m, "car savings contribution returned");
        if (role == "everyday") Add(today, "reservation", -175m, "card reservation", "PDNG");
        var balance = role == "savings" ? 22000m : role == "bills" ? 6000m : role == "everyday" ? 12000m : 0m;
        var enriched = new List<SourceTransaction>();
        foreach(var row in rows.OrderBy(x=>x.BookingDate).ThenBy(x=>x.Reference,StringComparer.Ordinal))
        {
            if(row.Status == "BOOK") balance += row.Amount;
            string? counterpart = null;
            if(row.Description.Contains("transfer") || row.Description.Contains("contribution returned"))
                counterpart = role == "everyday" ? row.Description.Contains("bills") ? "bills" : row.Description.Contains("car") ? "car" : row.Description.Contains("summer") ? "summerhouse" : "savings" : "everyday";
            enriched.Add(row with { Details = DemoBankDetails.Transaction(DisplayName(row.Description),row.Amount,role,row.Status == "BOOK" ? balance : null,counterpart) });
        }
        return enriched;
    }
}
