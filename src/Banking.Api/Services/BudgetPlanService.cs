using System.Data;
using System.Text.Json;
using Banking.Api.Data;
using Banking.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace Banking.Api.Services;

public sealed record BudgetEntryInput(Guid Id, string Name, string Type, bool IsSavings, decimal Amount, int IntervalMonths,
    string Source = "Manual", DateOnly? HistoryFrom = null, DateOnly? HistoryTo = null, Guid? CategoryId = null, Guid? SavingsAccountId = null);
public sealed record BudgetPlanInput(Guid Id, string Name, string Currency, BudgetEntryInput[] Entries, Guid RequestId, string? Version = null);
public sealed record BudgetActivation(string Version, Guid? ExpectedActiveId, bool Active = true);
public sealed record BudgetTotals(decimal Income, decimal Expenses, decimal Savings, decimal Available);
public sealed record AdvisorBudgetEntryInput(Guid RequestId, string Version, string Name, string Type, decimal Amount, int IntervalMonths,
    Guid? CategoryId = null, Guid? SavingsAccountId = null);

public sealed partial class BudgetPlanService(BankingDb db, TimeProvider clock)
{
    public async Task<object> AddAdvisorEntry(Guid id, AdvisorBudgetEntryInput input, CancellationToken ct)
    {
        Check.Text(input.Name, 120);
        Check.That(input.Type is "Income" or "Expense" or "Savings", "INVALID_BUDGET_ENTRY");
        var plan = await db.BudgetPlans.AsNoTracking().Include(p => p.Entries).SingleOrDefaultAsync(p => p.Id == id, ct)
            ?? throw new ApiFailure(404, "BUDGET_PLAN_NOT_FOUND");
        var added = new BudgetEntryInput(input.RequestId, input.Name.Trim(), input.Type == "Income" ? "Income" : "Expense", input.Type == "Savings",
            input.Amount, input.IntervalMonths, CategoryId: input.CategoryId, SavingsAccountId: input.SavingsAccountId);
        var existing = plan.Entries.OrderBy(e => e.Position).Select(e => new BudgetEntryInput(e.Id, e.Name, e.Type, e.IsSavings, e.Amount,
            e.IntervalMonths, e.Source, e.HistoryFrom, e.HistoryTo, e.CategoryId, e.SavingsAccountId)).ToArray();
        if (existing.SingleOrDefault(e => e.Id == input.RequestId) is { } prior)
        {
            if (prior != added) throw new ApiFailure(409, "BUDGET_REQUEST_REUSED");
            return new { status = "created", budgetId = id, entryId = prior.Id, alreadyCreated = true, budget = View(plan) };
        }
        var result = await Save(new BudgetPlanInput(id, plan.Name, plan.Currency, [..existing, added], input.RequestId, input.Version), ct);
        return new { status = "created", budgetId = id, entryId = input.RequestId, alreadyCreated = false, budget = result };
    }

    public static BudgetTotals Totals(IEnumerable<BudgetEntry> entries, bool annual = false)
    {
        decimal income = 0, expenses = 0, savings = 0;
        foreach (var e in entries)
        {
            var amount = annual ? e.Amount * (12 / e.IntervalMonths) : e.Amount / e.IntervalMonths;
            if (e.Type == "Income") income += amount;
            else if (e.IsSavings) savings += amount;
            else expenses += amount;
        }
        return new(income, expenses, savings, income - expenses - savings);
    }
    private static object View(BudgetPlan p) => new { p.Id, p.Name, p.Currency, p.IsActive, p.CreatedAt, p.UpdatedAt, p.Version,
        monthly = Totals(p.Entries), annual = Totals(p.Entries, true), hasIncome = p.Entries.Any(e => e.Type == "Income"),
        entries = p.Entries.OrderBy(e => e.Position).Select(e => new { e.Id, e.Name, e.Type, e.IsSavings, e.Amount, e.IntervalMonths,
            e.Source, e.HistoryFrom, e.HistoryTo, e.CategoryId, e.SavingsAccountId, monthlyEquivalent = e.Amount / e.IntervalMonths }) };
    public async Task<object> List(CancellationToken ct)
    {
        var plans = await db.BudgetPlans.AsNoTracking().Include(p => p.Entries).OrderBy(p => p.CreatedAt).ThenBy(p => p.Id).Take(101).ToListAsync(ct);
        Check.That(plans.Count <= 100, "BUDGET_PLAN_LIMIT");
        return new { plans = plans.Select(View), legacyCount = await db.Budgets.CountAsync(ct) };
    }
    public async Task<object> Active(CancellationToken ct)
    {
        var plan = await db.BudgetPlans.AsNoTracking().Include(p => p.Entries).SingleOrDefaultAsync(p => p.IsActive, ct);
        return new { plan = plan is null ? null : View(plan), basis = "planned_monthly_equivalents_not_actual_bank_cash_flow" };
    }
    public async Task<object> Save(BudgetPlanInput input, CancellationToken ct)
    {
        Check.That(input.Id != Guid.Empty && input.RequestId != Guid.Empty, "INVALID_BUDGET_ID");
        Check.Text(input.Name, 120); Check.Currency(input.Currency);
        Check.That(input.Entries is { Length: >= 1 and <= 200 } && input.Entries.All(e => e != null), "INVALID_BUDGET_ENTRIES");
        Check.That(input.Entries!.Select(e => e.Id).Distinct().Count() == input.Entries.Length, "DUPLICATE_BUDGET_ENTRY");
        foreach (var e in input.Entries)
        {
            Check.That(e.Id != Guid.Empty, "INVALID_BUDGET_ENTRY"); Check.Text(e.Name, 120); Check.Money(e.Amount);
            Check.That(e.Amount >= 0 && e.Type is "Income" or "Expense" && (!e.IsSavings || e.Type == "Expense")
                && e.IntervalMonths is 1 or 3 or 6 or 12, "INVALID_BUDGET_ENTRY");
            Check.That(e.Source is "Manual" or "Transactions", "INVALID_BUDGET_SOURCE");
            Check.That(e.Source == "Manual" ? e.HistoryFrom is null && e.HistoryTo is null
                : e.HistoryFrom is not null && e.HistoryTo is not null && e.HistoryFrom <= e.HistoryTo, "INVALID_BUDGET_SOURCE");
        }
        var hash = Vault.Hash(JsonSerializer.Serialize(input));
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        var plan = await db.BudgetPlans.Include(p => p.Entries).SingleOrDefaultAsync(p => p.Id == input.Id, ct);
        if (plan is not null && plan.LastRequestId == input.RequestId)
        {
            if (plan.LastRequestHash != hash) throw new ApiFailure(409, "BUDGET_REQUEST_REUSED");
            await transaction.CommitAsync(ct); return View(plan);
        }
        if (plan is null)
        {
            if (input.Version is not null) throw new ApiFailure(404, "BUDGET_PLAN_NOT_FOUND");
            Check.That(await db.BudgetPlans.CountAsync(ct) < 100, "BUDGET_PLAN_LIMIT");
            plan = new BudgetPlan { Id = input.Id, CreatedAt = clock.GetUtcNow() }; db.BudgetPlans.Add(plan);
        }
        else GoalService.Version(db, plan, input.Version);
        var categoryIds = input.Entries.Where(e => e.CategoryId.HasValue).Select(e => e.CategoryId!.Value).Distinct().ToArray();
        Check.That(await db.Categories.CountAsync(c => categoryIds.Contains(c.Id), ct) == categoryIds.Length, "CATEGORY_NOT_FOUND");
        Check.That(input.Entries.All(e => !e.IsSavings || e.CategoryId is null), "SAVINGS_USES_ACCOUNT_BALANCES");
        Check.That(input.Entries.All(e => e.IsSavings || e.SavingsAccountId is null), "SAVINGS_ACCOUNT_REQUIRES_SAVINGS_ENTRY");
        var savingsIds = input.Entries.Where(e => e.SavingsAccountId.HasValue).Select(e => e.SavingsAccountId!.Value).ToArray();
        Check.That(savingsIds.Distinct().Count() == savingsIds.Length, "SAVINGS_ACCOUNT_ALREADY_LINKED");
        Check.That(await db.Accounts.CountAsync(a => savingsIds.Contains(a.Id) && a.Currency == input.Currency, ct) == savingsIds.Length, "SAVINGS_ACCOUNT_NOT_FOUND_OR_CURRENCY_MISMATCH");
        var ids = input.Entries.Select(e => e.Id).ToArray();
        Check.That(!await db.BudgetEntries.AnyAsync(e => ids.Contains(e.Id) && e.BudgetPlanId != plan.Id, ct), "ENTRY_BELONGS_TO_ANOTHER_BUDGET");
        foreach (var entry in plan.Entries.Where(e => !ids.Contains(e.Id)).ToArray()) { db.BudgetEntries.Remove(entry); plan.Entries.Remove(entry); }
        for (var i = 0; i < input.Entries.Length; i++)
        {
            var source = input.Entries[i]; var entry = plan.Entries.SingleOrDefault(e => e.Id == source.Id);
            if (entry is null) { entry = new BudgetEntry { Id = source.Id, BudgetPlanId = plan.Id }; plan.Entries.Add(entry); db.BudgetEntries.Add(entry); }
            entry.Name = source.Name.Trim(); entry.Type = source.Type; entry.Amount = source.Amount; entry.IsSavings = source.IsSavings;
            entry.IntervalMonths = source.IntervalMonths; entry.Position = i; entry.Source = source.Source;
            entry.CategoryId = source.CategoryId;
            entry.SavingsAccountId = source.SavingsAccountId;
            entry.HistoryFrom = source.HistoryFrom; entry.HistoryTo = source.HistoryTo;
        }
        plan.Name = input.Name.Trim(); plan.Currency = input.Currency; plan.UpdatedAt = clock.GetUtcNow();
        plan.LastRequestId = input.RequestId; plan.LastRequestHash = hash;
        await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct); return View(plan);
    }
    public async Task<object> Activate(Guid id, BudgetActivation input, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        var plan = await db.BudgetPlans.Include(p => p.Entries).SingleOrDefaultAsync(p => p.Id == id, ct) ?? throw new ApiFailure(404, "BUDGET_PLAN_NOT_FOUND");
        GoalService.Version(db, plan, input.Version);
        var active = await db.BudgetPlans.SingleOrDefaultAsync(p => p.IsActive, ct);
        if (active?.Id != input.ExpectedActiveId) throw new ApiFailure(409, "ACTIVE_BUDGET_CHANGED");
        if (input.Active && active is not null && active.Id != id)
        { active.IsActive = false; active.UpdatedAt = clock.GetUtcNow(); await db.SaveChangesAsync(ct); }
        plan.IsActive = input.Active; plan.UpdatedAt = clock.GetUtcNow();
        await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct); return View(plan);
    }
    public async Task Delete(Guid id, string version, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        var plan = await db.BudgetPlans.Include(p => p.Entries).SingleOrDefaultAsync(p => p.Id == id, ct) ?? throw new ApiFailure(404, "BUDGET_PLAN_NOT_FOUND");
        GoalService.Version(db, plan, version);
        if (plan.IsActive) throw new ApiFailure(409, "DEACTIVATE_BUDGET_FIRST");
        db.BudgetEntries.RemoveRange(plan.Entries); db.BudgetPlans.Remove(plan);
        await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct);
    }
    public async Task<object> Suggestions(string currency, int months, CancellationToken ct)
    {
        Check.Currency(currency); Check.That(months is >= 1 and <= 12, "INVALID_BUDGET_WINDOW");
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(clock.GetUtcNow(), "Europe/Copenhagen").DateTime);
        var end = new DateOnly(today.Year, today.Month, 1); var from = end.AddMonths(-months); var to = end.AddDays(-1);
        await using var snapshot = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        var accounts = await db.Accounts.AsNoTracking().Where(a => a.Currency == currency).Take(101).ToListAsync(ct);
        Check.That(accounts.Count <= 100, "ACCOUNT_LIMIT");
        var rows = await db.Transactions.AsNoTracking().Where(x => x.Current && x.Status == "BOOK" && x.Currency == currency
            && x.BookingDate >= from && x.BookingDate <= to && x.Amount != 0
            && !db.Transfers.Any(t => t.OutgoingId == x.Id || t.IncomingId == x.Id)).Take(50001).ToListAsync(ct);
        Check.That(rows.Count <= 50000, "BUDGET_HISTORY_LIMIT");
        var undated = await db.Transactions.CountAsync(x => x.Current && x.Status == "BOOK" && x.Currency == currency && x.BookingDate == null, ct);
        var sufficient = accounts.Count > 0 && undated == 0 && accounts.All(a => a.Accessible && a.InitialImportCompleted != null && a.EarliestTransaction <= from);
        var groups = rows.GroupBy(x => new { Name = x.Description.Trim(), Type = x.Amount > 0 ? "Income" : "Expense" })
            .OrderByDescending(g => g.Sum(x => Math.Abs(x.Amount))).Take(201).ToArray();
        Check.That(groups.Length <= 200, "BUDGET_SUGGESTION_LIMIT");
        await snapshot.CommitAsync(ct);
        return new { currency, historyFrom = from, historyTo = to, months, sufficientHistory = sufficient, excludedUndated = undated,
            oldestAccountSync = accounts.Count == 0 ? (DateTimeOffset?)null : accounts.Min(a => a.LastSuccess),
            method = "mean-monthly-by-exact-description-and-sign-v1", previewOnly = true,
            suggestions = groups.Select(g => new { name = g.Key.Name.Length == 0 ? "Unnamed transaction" : g.Key.Name[..Math.Min(120, g.Key.Name.Length)],
                type = g.Key.Type, amount = sufficient ? (decimal?)decimal.Round(g.Sum(x => Math.Abs(x.Amount)) / months, 2, MidpointRounding.AwayFromZero) : null,
                intervalMonths = 1, isSavings = false, categoryId = g.Select(x => x.CategoryId).Distinct().Count() == 1 ? g.First().CategoryId : null, transactionCount = g.Count() }) };
    }
}
