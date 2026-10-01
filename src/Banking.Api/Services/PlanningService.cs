using Banking.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Banking.Api.Services;

public sealed class PlanningService(BankingDb db, TimeProvider clock)
{
    private IQueryable<BankTransaction> Booked(string currency, DateOnly from, DateOnly to, Guid? accountId = null) => db.Transactions.AsNoTracking()
        .Where(x => x.Current && x.Status == "BOOK" && x.Currency == currency && x.BookingDate >= from && x.BookingDate <= to
            && (accountId == null || x.AccountId == accountId)
            && !db.Transfers.Any(t => t.OutgoingId == x.Id || t.IncomingId == x.Id));

    private async Task<Coverage> History(string currency, DateOnly from, CancellationToken ct, Guid? accountId = null)
    {
        var accounts = await db.Accounts.AsNoTracking().Where(x => x.Currency == currency && (accountId == null || x.Id == accountId))
            .Select(x => new { x.Id, x.EarliestTransaction, x.InitialImportCompleted, x.LastSuccess, x.Accessible }).Take(101).ToListAsync(ct);
        Check.That(accounts.Count <= 100, "ACCOUNT_LIMIT");
        var incomplete = accounts.Where(x => x.InitialImportCompleted is null || x.EarliestTransaction is null || x.EarliestTransaction > from || !x.Accessible).Select(x => x.Id).ToArray();
        return new Coverage(accounts.Count > 0 && incomplete.Length == 0, accounts.Count, incomplete,
            accounts.Count == 0 ? null : accounts.Min(x => x.EarliestTransaction),
            accounts.Count == 0 ? null : accounts.Min(x => x.LastSuccess));
    }
    private sealed record Coverage(bool SufficientHistory, int AccountCount, Guid[] IncompleteAccountIds,
        DateOnly? EarliestObservedTransaction, DateTimeOffset? OldestAccountSync);

    public async Task<object> BudgetSuggestions(DateOnly month, string currency, int months, CancellationToken ct)
    {
        Check.Currency(currency); Check.That(month.Day == 1 && month.Year >= 2 && month.Year < 9999 && months is >= 1 and <= 12, "INVALID_BUDGET_WINDOW");
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(clock.GetUtcNow(), "Europe/Copenhagen").DateTime);
        var thisMonth = new DateOnly(today.Year, today.Month, 1);
        // Future budgets may be previewed, but history must come only from completed months.
        var historyEndExclusive = month < thisMonth ? month : thisMonth;
        var from = historyEndExclusive.AddMonths(-months); var to = historyEndExclusive.AddDays(-1);
        await using var snapshot = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
        var coverage = await History(currency, from, ct);
        var query = Booked(currency, from, to);
        var groups = await query.Where(x => x.Amount < 0 && x.CategoryId != null).GroupBy(x => x.CategoryId)
            .Select(g => new { categoryId = g.Key!.Value, grossSpending = -g.Sum(x => x.Amount), transactionCount = g.Count() }).Take(500).ToListAsync(ct);
        var categories = await db.Categories.AsNoTracking().ToDictionaryAsync(x => x.Id, x => x.Name, ct);
        var unclassified = await query.Where(x => x.Amount < 0 && x.CategoryId == null).CountAsync(ct);
        var undated = await db.Transactions.CountAsync(x => x.Current && x.Status == "BOOK" && x.Currency == currency && x.BookingDate == null, ct);
        var credits = await query.Where(x => x.Amount > 0 && x.CategoryId != null).SumAsync(x => (decimal?)x.Amount, ct) ?? 0;
        var existing = await db.Budgets.AsNoTracking().Where(x => x.Currency == currency && x.From <= month.AddMonths(1).AddDays(-1) && x.To >= month)
            .Select(x => x.CategoryId).Distinct().ToListAsync(ct);
        await snapshot.CommitAsync(ct);
        // Read-only preview: the owner explicitly saves via the existing budget create/edit endpoints.
        return new { month, currency, historyFrom = from, historyTo = to, months, coverage,
            method = "mean-monthly-gross-booked-debits-v1", previewOnly = true, savesAutomatically = false,
            unclassifiedExpenseCount = unclassified, excludedUndatedBookedCount = undated, categorizedCreditsNotNetted = credits,
            irregularExpenses = "included_in_average", refunds = "credits_shown_separately_not_assumed_to_be_refunds",
            suggestions = groups.OrderBy(x => categories.GetValueOrDefault(x.categoryId)).Select(x => new {
                x.categoryId, categoryName = categories.GetValueOrDefault(x.categoryId), x.grossSpending, x.transactionCount,
                proposedMonthlyLimit = coverage.SufficientHistory && undated == 0 ? (decimal?)decimal.Round(x.grossSpending / months, 2, MidpointRounding.AwayFromZero) : null,
                hasExistingBudget = existing.Contains(x.categoryId) }), generatedAt = clock.GetUtcNow() };
    }

    public async Task<object> Trends(DateOnly from, DateOnly to, string currency, CancellationToken ct)
    {
        Check.Dates(from, to); Check.Currency(currency);
        var days = to.DayNumber - from.DayNumber + 1;
        Check.That(from.DayNumber >= days, "INVALID_COMPARISON_RANGE");
        var previousFrom = from.AddDays(-days); var previousTo = from.AddDays(-1);
        await using var snapshot = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
        var current = await Totals(currency, from, to, ct); var previous = await Totals(currency, previousFrom, previousTo, ct);
        var currentCoverage = await History(currency, from, ct); var previousCoverage = await History(currency, previousFrom, ct);
        var comparable = currentCoverage.SufficientHistory && previousCoverage.SufficientHistory;
        await snapshot.CommitAsync(ct);
        object Delta(decimal value, decimal baseline) => new { amount = comparable ? (decimal?)(value - baseline) : null,
            percent = comparable && baseline > 0 ? (decimal?)decimal.Round((value - baseline) / baseline * 100, 2) : null };
        return new { from, to, currency, previousFrom, previousTo, current, previous, currentCoverage, previousCoverage, comparable,
            change = new { income = Delta(current.Income, previous.Income), spending = Delta(current.Spending, previous.Spending), net = Delta(current.Net, previous.Net) },
            basis = "booked_credits_and_gross_debits_excluding_confirmed_internal_transfers", generatedAt = clock.GetUtcNow() };
    }
    private sealed record PeriodTotals(decimal Income, decimal Spending, decimal Net, int Count);
    private async Task<PeriodTotals> Totals(string currency, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var query = Booked(currency, from, to);
        var income = await query.Where(x => x.Amount > 0).SumAsync(x => (decimal?)x.Amount, ct) ?? 0;
        var spending = -(await query.Where(x => x.Amount < 0).SumAsync(x => (decimal?)x.Amount, ct) ?? 0);
        return new(income, spending, income - spending, await query.CountAsync(ct));
    }

    public async Task<object> AccountInsights(DateOnly from, DateOnly to, string currency, Guid? accountId, CancellationToken ct)
    {
        Check.Dates(from, to); Check.Currency(currency);
        if (accountId is not null && !await db.Accounts.AnyAsync(x => x.Id == accountId, ct))
            throw new ApiFailure(404, "ACCOUNT_NOT_FOUND");
        await using var snapshot = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
        var coverage = await History(currency, from, ct, accountId);
        var query = Booked(currency, from, to, accountId);
        var income = await query.Where(x => x.Amount > 0).SumAsync(x => (decimal?)x.Amount, ct) ?? 0;
        var groups = await query.Where(x => x.Amount < 0).GroupBy(x => x.CategoryId)
            .Select(g => new { categoryId = g.Key, amount = -g.Sum(x => x.Amount), count = g.Count() }).ToListAsync(ct);
        var spending = groups.Sum(x => x.amount);
        var undated = await db.Transactions.CountAsync(x => x.Current && x.Status == "BOOK" && x.Currency == currency
            && (accountId == null || x.AccountId == accountId) && x.BookingDate == null, ct);
        var balances = await db.Accounts.AsNoTracking().Where(x => x.Currency == currency && (accountId == null || x.Id == accountId))
            .Select(a => new { accountId = a.Id, a.IsSavings, available = db.Balances.Where(b => b.AccountId == a.Id && b.Currency == currency && (b.Type == "ITAV" || b.Type == "CLAV"))
                .OrderByDescending(b => b.ObservedAt).ThenByDescending(b => b.Id).Select(b => new { b.Amount, b.ObservedAt }).FirstOrDefault() }).ToListAsync(ct);
        var balance = balances.Count > 0 && balances.All(x => x.available != null) ? (decimal?)balances.Sum(x => x.available!.Amount) : null;
        var observedAt = balances.Count > 0 && balances.All(x => x.available != null) ? (DateTimeOffset?)balances.Min(x => x.available!.ObservedAt) : null;
        var savingsBalances = balances.Where(x => x.IsSavings).ToList();
        var savingsAccountIds = savingsBalances.Select(x => x.accountId).ToArray();
        // Net movement on the savings side, including transfers. Transfers between savings accounts cancel.
        // External savings credits/debits already affect income/expenses; subtracting their net movement
        // leaves the period's non-savings cash movement without counting either leg twice.
        var savings = await db.Transactions.Where(x => x.Current && x.Status == "BOOK" && x.Currency == currency
            && savingsAccountIds.Contains(x.AccountId) && x.BookingDate >= from && x.BookingDate <= to)
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0;
        decimal? totalSavings = savingsBalances.Count > 0 && savingsBalances.All(x => x.available != null)
            ? savingsBalances.Sum(x => x.available!.Amount) : null;
        var savingsObservedAt = totalSavings.HasValue ? (DateTimeOffset?)savingsBalances.Min(x => x.available!.ObservedAt) : null;
        await snapshot.CommitAsync(ct);
        return new { from, to, currency, accountId, coverage, income, spending, net = income - spending,
            retentionPercent = income > 0 ? (decimal?)decimal.Round((income - spending) / income * 100, 1) : null,
            savings, disposableAmount = coverage.AccountCount > 0 ? (decimal?)(income - spending - savings) : null,
            totalSavings, savingsAccountCount = savingsBalances.Count, savingsObservedAt,
            savingsBalanceStale = savingsObservedAt is null || savingsObservedAt < clock.GetUtcNow().AddDays(-1),
            categories = groups.OrderByDescending(x => x.amount).ThenBy(x => x.categoryId), excludedUndatedBookedCount = undated,
            availableBalance = balance, balanceObservedAt = observedAt, balanceStale = observedAt is null || observedAt < clock.GetUtcNow().AddDays(-1),
            basis = "booked_credits_and_gross_debits_excluding_confirmed_internal_transfers" };
    }

    public async Task<object> CashFlow(DateOnly from, DateOnly to, string currency, Guid? accountId, CancellationToken ct)
    {
        Check.Dates(from, to); Check.Currency(currency);
        if (accountId is not null && !await db.Accounts.AnyAsync(x => x.Id == accountId, ct))
            throw new ApiFailure(404, "ACCOUNT_NOT_FOUND");
        await using var snapshot = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
        var coverage = await History(currency, from, ct, accountId);
        var days = await Booked(currency, from, to, accountId).GroupBy(x => x.BookingDate!.Value)
            .Select(g => new { date = g.Key, income = g.Sum(x => x.Amount > 0 ? x.Amount : 0),
                spending = -g.Sum(x => x.Amount < 0 ? x.Amount : 0), count = g.Count() }).ToDictionaryAsync(x => x.date, ct);
        var undated = await db.Transactions.CountAsync(x => x.Current && x.Status == "BOOK" && x.Currency == currency
            && (accountId == null || x.AccountId == accountId) && x.BookingDate == null, ct);
        await snapshot.CommitAsync(ct);
        decimal cumulative = 0;
        // The date-range guard bounds this to 3,661 daily aggregates. No ledger-page sampling.
        var points = new List<object>();
        if (coverage.AccountCount > 0)
            for (var offset = 0; offset <= to.DayNumber - from.DayNumber; offset++)
            {
                var date = from.AddDays(offset); days.TryGetValue(date, out var day);
                var income = day?.income ?? 0; var spending = day?.spending ?? 0;
                cumulative += income - spending;
                points.Add(new { date, income, spending, net = income - spending, cumulativeNet = cumulative, count = day?.count ?? 0 });
            }
        return new { from, to, currency, accountId, coverage, points, excludedUndatedBookedCount = undated,
            income = days.Values.Sum(x => x.income), spending = days.Values.Sum(x => x.spending), net = cumulative,
            basis = "booked_cash_flow_not_account_balance_excluding_confirmed_internal_transfers" };
    }

    public async Task<object> Upcoming(DateOnly from, int days, string currency, CancellationToken ct, Guid? accountId = null)
    {
        Check.Currency(currency); Check.That(days is >= 1 and <= 90 && from.Year is >= 2 and <= 9998, "INVALID_FORECAST_RANGE");
        var to = from.AddDays(days - 1);
        if (accountId is not null && !await db.Accounts.AnyAsync(x => x.Id == accountId, ct))
            throw new ApiFailure(404, "ACCOUNT_NOT_FOUND");
        var rows = await Booked(currency, from.AddYears(-1), from.AddDays(-1), accountId).Where(x => x.Amount < 0)
            .Select(x => new { x.Id, x.AccountId, x.Description, x.BookingDate, x.Amount }).Take(20001).ToListAsync(ct);
        Check.That(rows.Count <= 20000, "FORECAST_HISTORY_LIMIT");
        var estimates = new List<object>();
        // Conservative v1: repeated exact descriptions, monthly dates and stable amounts only.
        foreach (var group in rows.GroupBy(x => new { x.AccountId, Description = x.Description.Trim().ToUpperInvariant() }))
        {
            if (string.IsNullOrWhiteSpace(group.Key.Description)) continue;
            var history = group.OrderByDescending(x => x.BookingDate).ThenBy(x => x.Id).Take(4).OrderBy(x => x.BookingDate).ToArray();
            if (history.Length < 3) continue;
            var regular = history.Zip(history.Skip(1)).All(pair => Math.Abs(pair.Second.BookingDate!.Value.DayNumber - pair.First.BookingDate!.Value.AddMonths(1).DayNumber) <= 3);
            var values = history.Select(x => -x.Amount).OrderBy(x => x).ToArray();
            var median = values.Length % 2 == 1 ? values[values.Length / 2] : (values[values.Length / 2 - 1] + values[values.Length / 2]) / 2;
            if (!regular || values.Any(x => Math.Abs(x - median) > median * .10m)) continue;
            var last = history[^1]; var due = last.BookingDate!.Value.AddMonths(1);
            // Do not advance an overdue series repeatedly to make a missing payment look current.
            if (due < from || due > to) continue;
            estimates.Add(new { accountId = group.Key.AccountId, description = last.Description, expectedDate = due,
                amount = decimal.Round(median, 2), currency, estimated = true, method = "monthly-exact-description-v1",
                sourceTransactionIds = history.Select(x => x.Id).ToArray(), lastObservedDate = last.BookingDate });
        }
        return new { from, to, currency, estimated = true, isBankScheduledPayment = false, estimates,
            scope = "next_occurrence_of_stable_monthly_patterns_only", generatedAt = clock.GetUtcNow() };
    }
}
