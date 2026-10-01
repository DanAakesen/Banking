using System.Data;
using Banking.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Banking.Api.Services;

public sealed partial class BudgetPlanService
{
    public async Task<object> Progress(Guid id, DateOnly? month, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(clock.GetUtcNow(), "Europe/Copenhagen").DateTime);
        var from = month ?? new DateOnly(today.Year, today.Month, 1);
        Check.That(from.Day == 1 && from.Year >= 2000 && from <= today, "INVALID_BUDGET_MONTH");
        var monthEnd = from.AddMonths(1).AddDays(-1);
        var to = monthEnd < today ? monthEnd : today;
        await using var snapshot = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        var plan = await db.BudgetPlans.AsNoTracking().Include(p => p.Entries).SingleOrDefaultAsync(p => p.Id == id, ct)
            ?? throw new ApiFailure(404, "BUDGET_PLAN_NOT_FOUND");
        var categories = await db.Categories.AsNoTracking().ToDictionaryAsync(c => c.Id, c => c.Name, ct);
        var accounts = await db.Accounts.AsNoTracking().Where(a => a.Currency == plan.Currency).Take(101).ToListAsync(ct);
        Check.That(accounts.Count <= 100, "ACCOUNT_LIMIT");
        var rows = await db.Transactions.AsNoTracking().Where(x => x.Current && x.Status == "BOOK" && x.Currency == plan.Currency
            && x.BookingDate >= from && x.BookingDate <= to && x.Amount != 0
            && !db.Transfers.Any(t => t.OutgoingId == x.Id || t.IncomingId == x.Id)).Take(50001).ToListAsync(ct);
        Check.That(rows.Count <= 50000, "BUDGET_HISTORY_LIMIT");
        var undated = await db.Transactions.CountAsync(x => x.Current && x.Status == "BOOK" && x.Currency == plan.Currency && x.BookingDate == null, ct);
        var mapped = plan.Entries.Where(e => !e.IsSavings && e.CategoryId.HasValue).ToArray();
        var keys = mapped.Select(e => (e.CategoryId, e.Type)).Concat(rows.Select(r => (r.CategoryId, Type: r.Amount > 0 ? "Income" : "Expense"))).Distinct();
        var groups = keys.Select(key =>
        {
            var entries = mapped.Where(e => e.CategoryId == key.CategoryId && e.Type == key.Type).ToArray();
            var planned = entries.Sum(e => e.Amount / e.IntervalMonths);
            var actual = rows.Where(r => r.CategoryId == key.CategoryId && (r.Amount > 0 ? "Income" : "Expense") == key.Type).Sum(r => Math.Abs(r.Amount));
            return new { categoryId = key.CategoryId, name = key.CategoryId.HasValue ? categories[key.CategoryId.Value] : "Uncategorized",
                type = key.Type, planned, actual, remaining = planned - actual, budgeted = entries.Length > 0,
                percent = planned > 0 ? (decimal?)(actual / planned * 100) : null,
                status = entries.Length == 0 ? "Unbudgeted" : key.Type == "Expense" ? (actual > planned ? "Over budget" : "Remaining") : (actual >= planned ? "Reached" : "Still to receive") };
        }).OrderBy(g => g.type == "Income" ? 0 : 1).ThenByDescending(g => g.planned).ToArray();
        var sufficientHistory = accounts.Count > 0 && undated == 0 && accounts.All(a => a.Accessible && a.InitialImportCompleted != null && a.EarliestTransaction <= from);
        var oldestSync = accounts.Count == 0 ? (DateTimeOffset?)null : accounts.Min(a => a.LastSuccess);
        var savingsEntries = plan.Entries.Where(e => e.IsSavings).ToArray();
        var savingsIds = savingsEntries.Where(e => e.SavingsAccountId.HasValue).Select(e => e.SavingsAccountId!.Value).ToArray();
        // Count the linked account side only. Movements between linked savings accounts cancel in the total.
        var savingsRows = await db.Transactions.AsNoTracking().Where(x => x.Current && x.Status == "BOOK" && x.Currency == plan.Currency
            && savingsIds.Contains(x.AccountId) && x.BookingDate >= from && x.BookingDate <= to
            && db.Transfers.Any(t => t.OutgoingId == x.Id || t.IncomingId == x.Id)).Take(50001).ToListAsync(ct);
        Check.That(savingsRows.Count <= 50000, "BUDGET_HISTORY_LIMIT");
        var unmappedSavings = savingsEntries.Count(e => !e.SavingsAccountId.HasValue);
        decimal? actualSavings = unmappedSavings == 0 ? savingsRows.Sum(x => x.Amount) : null;
        var actualIncome = rows.Where(r => r.Amount > 0).Sum(r => r.Amount);
        var actualExpenses = rows.Where(r => r.Amount < 0).Sum(r => -r.Amount);
        var entryActuals = plan.Entries.Select(e =>
        {
            var group = groups.SingleOrDefault(g => g.categoryId == e.CategoryId && g.type == e.Type);
            var shared = !e.IsSavings && mapped.Count(m => m.CategoryId == e.CategoryId && m.Type == e.Type) > 1;
            decimal? actual = e.IsSavings ? e.SavingsAccountId.HasValue ? savingsRows.Where(r => r.AccountId == e.SavingsAccountId).Sum(r => r.Amount) : null
                : e.CategoryId.HasValue && !shared ? group?.actual ?? 0 : null;
            if (shared)
            {
                var siblings = mapped.Where(m => m.CategoryId == e.CategoryId && m.Type == e.Type).ToArray();
                var categoryRows = rows.Where(r => r.CategoryId == e.CategoryId && (r.Amount > 0 ? "Income" : "Expense") == e.Type).ToArray();
                // Only partition when every description has exactly one matching entry. Never assign a category total to multiple rows.
                if (categoryRows.All(r => siblings.Count(m => string.Equals(m.Name.Trim(), r.Description.Trim(), StringComparison.OrdinalIgnoreCase)) == 1))
                    actual = categoryRows.Where(r => string.Equals(e.Name.Trim(), r.Description.Trim(), StringComparison.OrdinalIgnoreCase)).Sum(r => Math.Abs(r.Amount));
            }
            return new { e.Id, actual, sharedCategory = shared };
        }).ToArray();
        await snapshot.CommitAsync(ct);
        return new { plan.Id, plan.Currency, from, to, monthlyPlan = Totals(plan.Entries), groups,
            actualIncome, actualExpenses, actualSavings, actualAvailable = actualIncome - actualExpenses - actualSavings,
            unmappedSavings, entryActuals, completeMonth = to == monthEnd,
            unmappedEntries = plan.Entries.Count(e => !e.IsSavings && e.CategoryId == null), sufficientHistory, excludedUndated = undated,
            oldestSync, stale = oldestSync is null || oldestSync < clock.GetUtcNow().AddHours(-24),
            basis = "booked_month_to_date_vs_full_month_allowance_internal_transfers_excluded",
            savingsBasis = "net_matched_transfers_on_explicit_linked_accounts_goals_still_use_balances" };
    }
}
