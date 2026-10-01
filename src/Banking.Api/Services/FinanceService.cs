using Banking.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Banking.Api.Services;

public sealed class FinanceService(BankingDb db, TimeProvider clock)
{
    public static void ApplyRule(BankTransaction item, IEnumerable<CategoryRule> rules)
    {
        var match = rules.FirstOrDefault(x => item.Description.Contains(x.Contains, StringComparison.OrdinalIgnoreCase));
        item.CategoryId = match?.CategoryId;
        item.Classification = match is null ? "Unclassified" : "Rule";
    }
    public async Task Reclassify(CancellationToken ct)
    {
        var rules = await db.Rules.Where(x => x.Active).OrderByDescending(x => x.Priority).ThenBy(x => x.Id).ToListAsync(ct);
        // Bounded batches retain manual decisions and avoid unbounded request memory.
        Guid? after = null;
        while (true)
        {
            var query = db.Transactions.Where(x => x.Classification != "Manual");
            if (after is { } cursor) query = query.Where(x => x.Id.CompareTo(cursor) > 0);
            var items = await query.OrderBy(x => x.Id).Take(500).ToListAsync(ct);
            foreach (var item in items) ApplyRule(item, rules);
            await db.SaveChangesAsync(ct);
            foreach (var item in items) db.Entry(item).State = EntityState.Detached;
            if (items.Count < 500) return;
            after = items[^1].Id;
        }
    }
    public async Task<object> Summary(DateOnly from, DateOnly to, string currency, CancellationToken ct)
    {
        Check.Dates(from, to); Check.Currency(currency);
        await using var snapshot = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
        var query = db.Transactions.Where(x => x.Current && x.Status == "BOOK" && x.Currency == currency && x.BookingDate >= from && x.BookingDate <= to);
        var spendable = query.Where(x => !db.Transfers.Any(t => t.IncomingId == x.Id || t.OutgoingId == x.Id));
        var income = await spendable.Where(x => x.Amount > 0).SumAsync(x => (decimal?)x.Amount, ct) ?? 0;
        var spending = -(await spendable.Where(x => x.Amount < 0).SumAsync(x => (decimal?)x.Amount, ct) ?? 0);
        var grouped = await spendable.GroupBy(x => x.CategoryId).Select(g => new { categoryId = g.Key,
            income = g.Sum(x => x.Amount > 0 ? x.Amount : 0), spending = -g.Sum(x => x.Amount < 0 ? x.Amount : 0) }).ToListAsync(ct);
        var missingDates = await db.Transactions.CountAsync(x => x.Current && x.Status == "BOOK" && x.Currency == currency && x.BookingDate == null, ct);
        await snapshot.CommitAsync(ct);
        return new { from, to, currency, income, spending, net = income - spending, categories = grouped,
            excludedUndatedBookedTransactions = missingDates, generatedAt = clock.GetUtcNow() };
    }
    public async Task<object> BudgetStatus(Guid id, CancellationToken ct)
    {
        var budget = await db.Budgets.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new ApiFailure(404, "BUDGET_NOT_FOUND");
        var spent = -(await db.Transactions.Where(x => x.Current && x.Status == "BOOK" && x.Amount < 0 && x.Currency == budget.Currency
                && x.CategoryId == budget.CategoryId && x.BookingDate >= budget.From && x.BookingDate <= budget.To
                && !db.Transfers.Any(t => t.OutgoingId == x.Id || t.IncomingId == x.Id))
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0);
        return new { budget.Id, budget.CategoryId, budget.From, budget.To, budget.Currency, budget.Limit, spent, remaining = budget.Limit - spent };
    }
}
