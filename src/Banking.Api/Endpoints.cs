using Banking.Api.Data;
using Banking.Api.Providers;
using Banking.Api.Services;
using Banking.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace Banking.Api;

public sealed record CategoryInput(string Name);
public sealed record RenameCategoryInput(string Name, string Version);
public sealed record RuleInput(string Contains, Guid CategoryId, int Priority = 0, bool Active = true, string? Version = null);
public sealed record ClassifyInput(Guid? CategoryId, string Version, bool Manual = true);
public sealed record BudgetInput(Guid CategoryId, DateOnly From, DateOnly To, string Currency, decimal Limit, string? Version = null);
public sealed record TransferInput(Guid OutgoingId, Guid IncomingId);
public sealed record VersionInput(string Version);
public sealed record AccountPreferencesInput(string? CustomName, bool IsSavings, string Version);

public static class Endpoints
{
    public static void MapBankingApi(this WebApplication app)
    {
        app.MapGet("/api/mode", (Workspace workspace, WorkspaceCatalog catalog, HttpContext context) => new { mode = workspace.Mode,
            displayName = workspace.Mode == "Live" ? "Dan" : "Demo", availableModes = context.Items["OwnerAccess"] is true ? catalog.Modes : ["Demo"],
            accounts = (context.Items["OwnerAccess"] is true ? catalog.Modes : ["Demo"]).Select(mode => new { mode, displayName = mode == "Live" ? "Dan" : "Demo" }) });
        app.MapGet("/api/banks", async (string? provider, ProviderRegistry registry, CancellationToken ct) =>
        {
            var selected = registry.Get(provider);
            return (await selected.Banks(ct)).Select(x => new { x.Name, x.Country, x.MaximumConsentSeconds, x.IsDemo, provider = selected.Name });
        });
        app.MapPost("/api/connections/authorize", (ConnectRequest input, ConnectionService service, CancellationToken ct) => service.Start(input, ct));
        app.MapGet("/api/authorizations/recoverable", (BankingDb db, CancellationToken ct) => db.Authorizations.AsNoTracking()
            .Where(x => x.PendingSession != null && x.CompletedConnectionId == null)
            .OrderByDescending(x => x.UsedAt).Select(x => new { x.Id, x.Provider, x.Bank, x.Country, x.UsedAt }).Take(100).ToListAsync(ct));
        app.MapPost("/api/authorizations/{id:guid}/retry", async (Guid id, ConnectionService service, CancellationToken ct) =>
            new { connectionId = await service.RetryCompletion(id, ct), status = "import_scheduled" });
        app.MapGet("/api/auth/callback", Callback);
        app.MapGet("/api/auth/callback/live", Callback);
        app.MapGet("/api/connections", (BankingDb db, CancellationToken ct) => db.Connections.AsNoTracking().Select(x =>
            new { x.Id, x.Provider, x.Bank, x.Country, x.ValidUntil, x.Status, x.LastSuccess, x.ErrorCode, x.IsDemo, x.RetryNotBefore, x.Version }).Take(100).ToListAsync(ct));
        app.MapPost("/api/connections/{id:guid}/disconnect", (Guid id, VersionInput input, ConnectionService service, CancellationToken ct) => service.Disconnect(id, input.Version, ct));
        app.MapPost("/api/connections/{id:guid}/sync", async (Guid id, ConnectionService service, CancellationToken ct) =>
        { await service.Queue(id, ct); return Results.Accepted(value: new { status = "scheduled_if_eligible" }); });
        app.MapGet("/api/accounts", (BankingDb db, CancellationToken ct) => db.Accounts.AsNoTracking().Select(x => new
        { x.Id, x.ConnectionId, name = x.CustomName ?? x.Name, providerName = x.Name, x.CustomName, x.IsSavings, x.Currency,
            x.Accessible, x.LastSuccess, x.EarliestTransaction, x.InitialImportCompleted, x.Connection.IsDemo, x.Version }).Take(100).ToListAsync(ct));
        app.MapPut("/api/accounts/{id:guid}/preferences", async (Guid id, AccountPreferencesInput input, BankingDb db, CancellationToken ct) =>
        {
            var account = await db.Accounts.FindAsync([id], ct) ?? throw new ApiFailure(404, "ACCOUNT_NOT_FOUND");
            SetVersion(db, account, input.Version);
            account.CustomName = string.IsNullOrWhiteSpace(input.CustomName) ? null : Check.Text(input.CustomName, 200);
            account.IsSavings = input.IsSavings;
            db.Entry(account).Property(x => x.IsSavings).IsModified = true;
            await db.SaveChangesAsync(ct);
            return new { account.Id, name = account.CustomName ?? account.Name, account.CustomName, account.IsSavings, account.Version };
        });
        app.MapGet("/api/accounts/{id:guid}/balances", async (Guid id, int? limit, BankingDb db, CancellationToken ct) =>
        {
            Check.That((limit ?? 20) is > 0 and <= 200, "INVALID_LIMIT");
            return await db.Balances.AsNoTracking().Where(x => x.AccountId == id).OrderByDescending(x => x.ObservedAt).Take(limit ?? 20)
                .Select(x => new { x.Id, x.AccountId, x.Amount, x.Currency, x.Type, x.BankTime, x.ObservedAt }).ToListAsync(ct);
        });
        app.MapGet("/api/accounts/{id:guid}/bank-details", async (Guid id, BankingDb db, CancellationToken ct) =>
        {
            var account = await db.Accounts.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new ApiFailure(404,"ACCOUNT_NOT_FOUND");
            return new { details = BankDetails.PublicAccount(account), account.BankDetailsImportedAt };
        });
        app.MapGet("/api/accounts/{id:guid}/balance-history", async (Guid id, DateOnly from, DateOnly to, BankingDb db, CancellationToken ct) =>
        {
            Check.Dates(from,to);
            var account = await db.Accounts.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new ApiFailure(404,"ACCOUNT_NOT_FOUND");
            var rows = await db.Transactions.AsNoTracking().Where(x => x.AccountId == id && x.Current && x.Status == "BOOK"
                && x.Currency == account.Currency && x.BookingDate >= from && x.BookingDate <= to).Take(100001).ToListAsync(ct);
            Check.That(rows.Count <= 100000,"HISTORY_LIMIT");
            var points = rows.GroupBy(x => x.BookingDate!.Value).OrderBy(x => x.Key)
                .Select(g => new { date = g.Key, balance = BankDetails.ClosingBalance(g.ToList(),account.Currency) }).ToList();
            return new { accountId = id, account.Currency, from, to, points, source = "BankBookedBalance",
                knownDays = points.Count(x => x.balance != null), unavailableDays = points.Count(x => x.balance == null),
                account.BankDetailsImportedAt, account.LastSuccess };
        });
        app.MapGet("/api/transactions/{id:guid}", async (Guid id, BankingDb db, CancellationToken ct) =>
        {
            var row = await db.Transactions.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && x.Current,ct)
                ?? throw new ApiFailure(404,"TRANSACTION_NOT_FOUND");
            return new { row.Id, row.AccountId, row.Description, row.Amount, row.Currency, row.BookingDate, row.ValueDate,
                row.Status, row.CategoryId, row.Classification, row.ObservedAt, details = BankDetails.PublicTransaction(row) };
        });
        app.MapGet("/api/transactions", async (Guid? accountId, DateOnly? from, DateOnly? to, string? currency, Guid? categoryId,
            string? search, string? status, int? offset, int? limit, BankingDb db, CancellationToken ct) =>
        {
            Check.That((offset ?? 0) is >= 0 and <= 100000 && (limit ?? 50) is > 0 and <= 200, "INVALID_PAGE");
            if (from is { } f && to is { } t) Check.Dates(f, t);
            if (currency is not null) Check.Currency(currency);
            if (search is not null) Check.Text(search, 200);
            if (status is not null) Check.That(status is "BOOK" or "PDNG" or "CNCL" or "HOLD" or "OTHR" or "RJCT" or "SCHD", "INVALID_STATUS");
            var query = db.Transactions.AsNoTracking().Where(x => x.Current);
            if (accountId is not null) query = query.Where(x => x.AccountId == accountId);
            if (from is not null) query = query.Where(x => x.BookingDate >= from);
            if (to is not null) query = query.Where(x => x.BookingDate <= to);
            if (currency is not null) query = query.Where(x => x.Currency == currency);
            if (categoryId is not null) query = query.Where(x => x.CategoryId == categoryId);
            if (search is not null) query = query.Where(x => x.Description.Contains(search));
            if (status is not null) query = query.Where(x => x.Status == status);
            var total = await query.CountAsync(ct);
            var items = await query.OrderByDescending(x => x.BookingDate).ThenBy(x => x.Id).Skip(offset ?? 0).Take(limit ?? 50).Select(x => new
            { x.Id, x.AccountId, x.Amount, x.Currency, x.BookingDate, x.ValueDate, x.Description, x.Status, x.CategoryId, x.Classification,
                x.Version, x.ObservedAt, x.Account.Connection.IsDemo,
                isInternalTransfer = db.Transfers.Any(t => t.OutgoingId == x.Id || t.IncomingId == x.Id) }).ToListAsync(ct);
            return new { total, offset = offset ?? 0, items };
        });
        app.MapGet("/api/categories", (BankingDb db, CancellationToken ct) => db.Categories.AsNoTracking().OrderBy(x => x.Name).Take(500).ToListAsync(ct));
        app.MapPost("/api/categories", async (CategoryInput input, BankingDb db, CancellationToken ct) =>
        {
            Check.That(await db.Categories.CountAsync(ct) < 500, "CATEGORY_LIMIT");
            var item = new Category { Name = Check.Text(input.Name) }; db.Categories.Add(item); await db.SaveChangesAsync(ct);
            return Results.Created($"/api/categories/{item.Id}", new { item.Id, item.Name, item.Version });
        });
        app.MapPut("/api/transactions/{id:guid}/category", async (Guid id, ClassifyInput input, BankingDb db, TimeProvider clock, CancellationToken ct) =>
        {
            var item = await db.Transactions.FindAsync([id], ct) ?? throw new ApiFailure(404, "TRANSACTION_NOT_FOUND");
            SetVersion(db, item, input.Version);
            if (input.CategoryId is { } category) await RequireCategory(db, category, ct);
            var previous = item.CategoryId;
            if (input.Manual) { item.CategoryId = input.CategoryId; item.Classification = "Manual"; }
            else FinanceService.ApplyRule(item, await db.Rules.Where(x => x.Active).OrderByDescending(x => x.Priority).ThenBy(x => x.Id).ToListAsync(ct));
            db.ClassificationChanges.Add(new ClassificationChange { TransactionId = id, PreviousCategoryId = previous, CategoryId = item.CategoryId, ChangedAt = clock.GetUtcNow() });
            // Force concurrency validation even when submitting the same category again.
            db.Entry(item).Property(x => x.Classification).IsModified = true;
            await db.SaveChangesAsync(ct);
            return new { item.Id, item.CategoryId, item.Classification, item.Version };
        });
        app.MapPut("/api/categories/{id:guid}", async (Guid id, RenameCategoryInput input, BankingDb db, CancellationToken ct) =>
        {
            var item = await db.Categories.FindAsync([id], ct) ?? throw new ApiFailure(404, "CATEGORY_NOT_FOUND");
            SetVersion(db, item, input.Version); item.Name = Check.Text(input.Name); db.Entry(item).Property(x => x.Name).IsModified = true;
            await db.SaveChangesAsync(ct); return new { item.Id, item.Name, item.Version };
        });
        app.MapDelete("/api/categories/{id:guid}", async (Guid id, string version, BankingDb db, CancellationToken ct) =>
        {
            var item = await db.Categories.FindAsync([id], ct) ?? throw new ApiFailure(404, "CATEGORY_NOT_FOUND"); SetVersion(db, item, version);
            if (await db.Transactions.AnyAsync(x => x.CategoryId == id, ct) || await db.Rules.AnyAsync(x => x.CategoryId == id, ct)
                || await db.BudgetEntries.AnyAsync(x => x.CategoryId == id, ct)
                || await db.Budgets.AnyAsync(x => x.CategoryId == id, ct) || await db.ClassificationChanges.AnyAsync(x => x.CategoryId == id || x.PreviousCategoryId == id, ct))
                throw new ApiFailure(409, "CATEGORY_IN_USE");
            db.Categories.Remove(item); await db.SaveChangesAsync(ct); return Results.NoContent();
        });
        app.MapGet("/api/rules", (BankingDb db, CancellationToken ct) => db.Rules.AsNoTracking().OrderByDescending(x => x.Priority).Select(x =>
            new { x.Id, x.Contains, x.CategoryId, x.Priority, x.Active, x.Version }).Take(500).ToListAsync(ct));
        app.MapPost("/api/rules", async (RuleInput input, BankingDb db, CancellationToken ct) =>
        {
            await RequireCategory(db, input.CategoryId, ct); Check.That(await db.Rules.CountAsync(ct) < 500, "RULE_LIMIT");
            var item = new CategoryRule { Contains = Check.Text(input.Contains, 200), CategoryId = input.CategoryId, Priority = input.Priority, Active = input.Active };
            db.Rules.Add(item); await db.SaveChangesAsync(ct); return Results.Created($"/api/rules/{item.Id}", new { item.Id, item.Version });
        });
        app.MapPut("/api/rules/{id:guid}", async (Guid id, RuleInput input, BankingDb db, CancellationToken ct) =>
        {
            var item = await db.Rules.FindAsync([id], ct) ?? throw new ApiFailure(404, "RULE_NOT_FOUND"); SetVersion(db, item, input.Version);
            await RequireCategory(db, input.CategoryId, ct); item.Contains = Check.Text(input.Contains, 200);
            item.CategoryId = input.CategoryId; item.Priority = input.Priority; item.Active = input.Active;
            db.Entry(item).Property(x => x.Active).IsModified = true;
            await db.SaveChangesAsync(ct); return new { item.Id, item.Version };
        });
        app.MapPost("/api/rules/apply", async (FinanceService service, CancellationToken ct) => { await service.Reclassify(ct); return Results.NoContent(); });
        app.MapDelete("/api/rules/{id:guid}", async (Guid id, string version, BankingDb db, CancellationToken ct) =>
        {
            var item = await db.Rules.FindAsync([id], ct) ?? throw new ApiFailure(404, "RULE_NOT_FOUND"); SetVersion(db, item, version);
            db.Rules.Remove(item); await db.SaveChangesAsync(ct); return Results.NoContent();
        });
        app.MapGet("/api/budgets", (BankingDb db, CancellationToken ct) => db.Budgets.AsNoTracking().Select(x =>
            new { x.Id, x.CategoryId, x.From, x.To, x.Currency, x.Limit, x.Version }).Take(500).ToListAsync(ct));
        app.MapPost("/api/budgets", async (BudgetInput input, BankingDb db, CancellationToken ct) =>
        {
            await ValidateBudget(input, db, ct); Check.That(await db.Budgets.CountAsync(ct) < 500, "BUDGET_LIMIT");
            var item = new Budget { CategoryId = input.CategoryId, From = input.From, To = input.To, Currency = input.Currency, Limit = input.Limit };
            db.Budgets.Add(item); await db.SaveChangesAsync(ct); return Results.Created($"/api/budgets/{item.Id}", new { item.Id, item.Version });
        });
        app.MapPut("/api/budgets/{id:guid}", async (Guid id, BudgetInput input, BankingDb db, CancellationToken ct) =>
        {
            var item = await db.Budgets.FindAsync([id], ct) ?? throw new ApiFailure(404, "BUDGET_NOT_FOUND"); SetVersion(db, item, input.Version);
            await ValidateBudget(input, db, ct); item.CategoryId = input.CategoryId; item.From = input.From; item.To = input.To;
            item.Currency = input.Currency; item.Limit = input.Limit; db.Entry(item).Property(x => x.Limit).IsModified = true;
            await db.SaveChangesAsync(ct); return new { item.Id, item.Version };
        });
        app.MapGet("/api/budgets/{id:guid}/status", (Guid id, FinanceService service, CancellationToken ct) => service.BudgetStatus(id, ct));
        app.MapDelete("/api/budgets/{id:guid}", async (Guid id, string version, BankingDb db, CancellationToken ct) =>
        {
            var item = await db.Budgets.FindAsync([id], ct) ?? throw new ApiFailure(404, "BUDGET_NOT_FOUND"); SetVersion(db, item, version);
            db.Budgets.Remove(item); await db.SaveChangesAsync(ct); return Results.NoContent();
        });
        app.MapGet("/api/summary", (DateOnly from, DateOnly to, string currency, FinanceService service, CancellationToken ct) => service.Summary(from, to, currency, ct));
        app.MapPost("/api/transfer-matches", async (TransferInput input, BankingDb db, CancellationToken ct) =>
        {
            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
            var outgoing = await db.Transactions.FindAsync([input.OutgoingId], ct) ?? throw new ApiFailure(404, "TRANSACTION_NOT_FOUND");
            var incoming = await db.Transactions.FindAsync([input.IncomingId], ct) ?? throw new ApiFailure(404, "TRANSACTION_NOT_FOUND");
            Check.That(outgoing.AccountId != incoming.AccountId && outgoing.Current && incoming.Current && outgoing.Status == "BOOK" && incoming.Status == "BOOK"
                && outgoing.Currency == incoming.Currency && outgoing.Amount < 0 && outgoing.Amount == -incoming.Amount, "INVALID_TRANSFER_MATCH");
            var item = new TransferMatch { OutgoingId = outgoing.Id, IncomingId = incoming.Id }; db.Transfers.Add(item); await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            return Results.Created($"/api/transfer-matches/{item.Id}", new { item.Id });
        });
        app.MapGet("/api/transfer-matches", async (int? offset, BankingDb db, CancellationToken ct) =>
        { Check.That((offset ?? 0) is >= 0 and <= 100000, "INVALID_PAGE"); return await db.Transfers.AsNoTracking().OrderBy(x => x.Id).Skip(offset ?? 0).Take(200).Select(x => new
            {
                x.Id, x.OutgoingId, x.IncomingId, x.Version,
                outgoing = db.Transactions.Where(t => t.Id == x.OutgoingId).Select(t => new { t.Description, t.BookingDate, t.AccountId, t.Amount, t.Currency }).FirstOrDefault(),
                incoming = db.Transactions.Where(t => t.Id == x.IncomingId).Select(t => new { t.Description, t.BookingDate, t.AccountId, t.Amount, t.Currency }).FirstOrDefault()
            }).ToListAsync(ct); });
        app.MapDelete("/api/transfer-matches/{id:guid}", async (Guid id, BankingDb db, CancellationToken ct) =>
        { var item = await db.Transfers.FindAsync([id], ct) ?? throw new ApiFailure(404, "MATCH_NOT_FOUND"); db.Transfers.Remove(item); await db.SaveChangesAsync(ct); return Results.NoContent(); });
        app.MapGet("/api/jobs", (Guid? accountId, BankingDb db, CancellationToken ct) => db.Jobs.AsNoTracking().Where(x => accountId == null || x.AccountId == accountId)
            .OrderByDescending(x => x.CreatedAt).Select(x => new { x.Id, x.AccountId, x.Status, x.FullHistory, x.Pages, x.Items, x.Attempts, x.CreatedAt,
                x.NextAttempt, x.CompletedAt, x.ErrorCode, x.LastAttemptAt, x.Version }).Take(100).ToListAsync(ct));
        app.MapPost("/api/jobs/{id:guid}/retry", (Guid id, RetryInput input, JobService jobs, CancellationToken ct) => jobs.Retry(id, input, ct));
    }
    private static async Task<IResult> Callback(string state, string? code, string? error, ConnectionService service, CancellationToken ct)
    {
        if (error is not null)
        {
            Check.That(code is null, "INVALID_CALLBACK"); await service.CancelAuthorization(state, ct);
            return Results.Ok(new { status = "authorization_cancelled", error = "BANK_AUTHORIZATION_NOT_COMPLETED" });
        }
        Check.That(code is not null, "INVALID_CALLBACK");
        return Results.Ok(new { connectionId = await service.Complete(state, code!, ct), status = "import_queued" });
    }
    private static void SetVersion(BankingDb db, Entity item, string? version)
    {
        if (string.IsNullOrWhiteSpace(version)) throw new ApiFailure(428, "VERSION_REQUIRED");
        var bytes = Convert.FromBase64String(version); Check.That(bytes.Length == 8, "INVALID_VERSION");
        db.Entry(item).Property(x => x.Version).OriginalValue = bytes;
    }
    private static async Task RequireCategory(BankingDb db, Guid id, CancellationToken ct)
    { Check.That(await db.Categories.AnyAsync(x => x.Id == id, ct), "CATEGORY_NOT_FOUND"); }
    private static async Task ValidateBudget(BudgetInput input, BankingDb db, CancellationToken ct)
    { await RequireCategory(db, input.CategoryId, ct); Check.Dates(input.From, input.To); Check.Currency(input.Currency); Check.Money(input.Limit); Check.That(input.Limit > 0, "INVALID_BUDGET"); }
}
