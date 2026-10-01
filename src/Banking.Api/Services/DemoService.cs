using Banking.Api.Data;
using Banking.Api.Providers;
using Banking.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace Banking.Api.Services;

public sealed class DemoService(BankingDb db, Workspace workspace, Vault vault, TimeProvider clock)
{
    public async Task LocalizeDanish(CancellationToken ct)
    {
        Check.That(workspace.Mode == "Demo", "DEMO_ONLY");
        Check.That(await db.Connections.AnyAsync(ct) && !await db.Connections.AnyAsync(x => !x.IsDemo || x.Provider != "product-demo", ct), "SYNTHETIC_CONNECTION_REQUIRED");
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        foreach (var x in await db.Connections.ToListAsync(ct)) x.Bank = DemoLanguage.Translate(x.Bank);
        foreach (var x in await db.Accounts.ToListAsync(ct)) {
            x.Name = DemoLanguage.Translate(x.Name);
            x.BankDetailsJson = DemoLanguage.TranslateDetails(x.BankDetailsJson);
            if (x.CustomName is not null) x.CustomName = DemoLanguage.Translate(x.CustomName);
        }
        foreach (var x in await db.Transactions.ToListAsync(ct)) { x.Description = DemoLanguage.Translate(x.Description); x.BankDetailsJson = DemoLanguage.TranslateDetails(x.BankDetailsJson); }
        foreach (var x in await db.Categories.ToListAsync(ct)) x.Name = DemoLanguage.Translate(x.Name);
        foreach (var x in await db.Rules.ToListAsync(ct)) x.Contains = DemoLanguage.TranslateRule(x.Contains);
        foreach (var x in await db.BudgetPlans.ToListAsync(ct)) x.Name = DemoLanguage.Translate(x.Name);
        foreach (var x in await db.BudgetEntries.ToListAsync(ct)) x.Name = DemoLanguage.Translate(x.Name);
        foreach (var x in await db.Goals.ToListAsync(ct)) {
            x.Name = DemoLanguage.Translate(x.Name); x.Description = DemoLanguage.Translate(x.Description); x.Notes = DemoLanguage.Translate(x.Notes);
        }
        foreach (var x in await db.Loans.ToListAsync(ct)) x.Name = DemoLanguage.Translate(x.Name);
        foreach (var x in await db.WealthRecords.ToListAsync(ct)) {
            x.Name = DemoLanguage.Translate(x.Name); x.Provider = DemoLanguage.Translate(x.Provider); x.SourceNote = DemoLanguage.Translate(x.SourceNote);
        }
        foreach (var x in await db.ResearchItems.ToListAsync(ct)) {
            x.Name = DemoLanguage.Translate(x.Name); x.Notes = DemoLanguage.Translate(x.Notes);
        }
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
    }
    public async Task EnrichFinancialExamples(CancellationToken ct)
    {
        Check.That(workspace.Mode == "Demo", "DEMO_ONLY");
        await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
        await DatabaseLock.AcquireTransaction(db, "Banking:demo-financial-examples", ct);
        await DemoFinancialExamples.Ensure(db, workspace, DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime), ct);
        await transaction.CommitAsync(ct);
    }
    public async Task EnrichBankDetails(CancellationToken ct)
    {
        Check.That(workspace.Mode == "Demo", "DEMO_ONLY");
        await using var transaction=await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable,ct);
        var accounts=await db.Accounts.Where(a=>a.Connection.IsDemo && a.Connection.Provider=="product-demo").ToListAsync(ct);
        var roles=accounts.ToDictionary(a=>a.Id,a=>a.ProviderAccountId);
        var transfers=await db.Transfers.ToListAsync(ct);
        var rows=await db.Transactions.Where(x=>x.Current && roles.Keys.Contains(x.AccountId)).ToListAsync(ct);
        var byId=rows.ToDictionary(x=>x.Id);
        foreach(var account in accounts)
        {
            Check.That(ProductDemoProvider.Roles.Contains(account.ProviderAccountId),"INVALID_DEMO_ACCOUNT");
            await DatabaseLock.AcquireTransaction(db,$"Banking:connection:{account.ConnectionId}",ct);
            account.BankDetailsJson=BankDetails.Store(DemoBankDetails.Account(account.ProviderAccountId));
            var ordered=rows.Where(x=>x.AccountId==account.Id && x.Status=="BOOK" && x.BookingDate!=null && x.Currency=="DKK")
                .OrderBy(x=>x.BookingDate).ThenBy(x=>x.SourceKey,StringComparer.Ordinal).ToList();
            var latest=await db.Balances.Where(b=>b.AccountId==account.Id && b.Currency=="DKK" && (b.Type=="ITBD" || b.Type=="CLBD")).OrderByDescending(b=>b.ObservedAt).FirstOrDefaultAsync(ct);
            if(latest is null)continue;
            var balance=latest.Amount-ordered.Sum(x=>x.Amount);
            foreach(var row in ordered)
            {
                balance+=row.Amount;
                var pair=transfers.FirstOrDefault(m=>m.IncomingId==row.Id || m.OutgoingId==row.Id);
                var otherId=pair is null ? (Guid?)null : pair.OutgoingId==row.Id ? pair.IncomingId : pair.OutgoingId;
                var other=otherId is { } id && byId.TryGetValue(id,out var otherRow) ? roles.GetValueOrDefault(otherRow.AccountId) : null;
                row.BankDetailsJson=BankDetails.Store(DemoBankDetails.Transaction(row.Description,row.Amount,account.ProviderAccountId,balance,other));
            }
            account.BankDetailsImportedAt=clock.GetUtcNow();
        }
        await db.SaveChangesAsync(ct);await transaction.CommitAsync(ct);
    }
    public async Task CleanDisplayNames(CancellationToken ct)
    {
        Check.That(workspace.Mode == "Demo", "DEMO_ONLY");
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var accounts = db.Accounts.Where(x => x.Connection.IsDemo && x.Connection.Provider == "product-demo");
        foreach (var account in await accounts.Where(x => x.Name.StartsWith("Demo ")).ToListAsync(ct))
            account.Name = ProductDemoProvider.DisplayName(account.Name);
        foreach (var row in await db.Transactions.Where(x => accounts.Select(a => a.Id).Contains(x.AccountId) && x.Description.StartsWith("Demo ")).ToListAsync(ct))
            row.Description = ProductDemoProvider.DisplayName(row.Description);
        // Only generated entry names are updated; manual names and all amounts/IDs remain unchanged.
        foreach (var entry in await db.BudgetEntries.Where(x => x.Source == "Transactions" && x.Name.StartsWith("Demo ")).ToListAsync(ct))
            entry.Name = ProductDemoProvider.DisplayName(entry.Name);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
    }

    public async Task Initialize(CancellationToken ct)
    {
        Check.That(workspace.Mode == "Demo", "DEMO_ONLY");
        await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
        await DatabaseLock.AcquireTransaction(db, "Banking:new-connection", ct);
        if (await db.Connections.AnyAsync(ct) || await db.Categories.AnyAsync(ct)) throw new ApiFailure(409, "DEMO_REQUIRES_EMPTY_DATABASE");
        var provider = new ProductDemoProvider(clock); var session = await provider.Complete(ProductDemoProvider.SessionId, ct);
        var now = clock.GetUtcNow();
        var connection = new Connection { Provider = provider.Name, Bank = "Familiens demobank", Country = "DK", IsDemo = true,
            Session = vault.Protect(session.Id), ValidUntil = session.ValidUntil };
        db.Connections.Add(connection);
        foreach (var source in session.Accounts)
        {
            var account = new Account { ConnectionId = connection.Id, ProviderAccountId = source.Id, IdentityHash = Vault.Hash(source.Identity), Name = source.Name, Currency = source.Currency,
                IsSavings = source.Id is "savings" or "car" or "summerhouse" };
            db.Accounts.Add(account); db.Jobs.Add(ConnectionService.NewJob(account.Id, now, true));
        }
        foreach (var definition in new[] { ("Groceries", "groceries", 3000m), ("Housing", "housing", 7800m),
            ("Transport", "transport", 800m), ("Dining", "restaurant", 1200m), ("Subscriptions", "subscription", 300m),
            ("Utilities", "utilities", 1000m), ("Insurance", "insurance", 700m), ("Shopping", "shopping", 1800m) })
        {
            var category = new Category { Name = DemoLanguage.Translate(definition.Item1) }; db.Categories.Add(category);
            db.Rules.Add(new CategoryRule { Contains = DemoLanguage.TranslateRule(definition.Item2), CategoryId = category.Id });
            // Initialization does not seed goals or budgets; explicit owner-approved Demo enrichment is separate.
        }
        await db.SaveChangesAsync(ct);
        await DemoFinancialExamples.Ensure(db, workspace, DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime), ct);
        await transaction.CommitAsync(ct);
    }
}
