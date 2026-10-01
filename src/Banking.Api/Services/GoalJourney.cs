using Banking.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Banking.Api.Services;

public sealed record GoalPhotoInput(string? DataUrl, string Version);

public sealed partial class GoalService
{
    internal static int DueCount(DateOnly start, DateOnly through, int day)
    {
        var first = new DateOnly(start.Year, start.Month, day);
        if (first < start) first = first.AddMonths(1);
        if (through < first) return 0;
        return (through.Year - first.Year) * 12 + through.Month - first.Month + (through.Day >= day ? 1 : 0);
    }

    internal static DateOnly? Forecast(decimal balance, decimal target, decimal monthly, DateOnly today, int day)
    {
        if (balance >= target) return today;
        if (monthly <= 0) return null;
        var next = new DateOnly(today.Year, today.Month, day);
        if (next <= today) next = next.AddMonths(1);
        var payments = decimal.Ceiling((target - balance) / monthly);
        var available = (9999 - next.Year) * 12 + 12 - next.Month;
        return payments - 1 > available ? null : next.AddMonths((int)payments - 1);
    }

    public async Task<object> Journey(Guid id, CancellationToken ct)
    {
        await using var snapshot = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
        var goal = await db.Goals.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new ApiFailure(404, "GOAL_NOT_FOUND");
        var account = await db.Accounts.AsNoTracking().SingleOrDefaultAsync(x => x.Id == goal.AccountId, ct);
        var balance = await db.Balances.AsNoTracking().Where(x => x.AccountId == goal.AccountId && (x.Type == "ITBD" || x.Type == "CLBD"))
            .OrderByDescending(x => x.ObservedAt).ThenByDescending(x => x.BankTime).ThenBy(x => x.Id).FirstOrDefaultAsync(ct);
        var now = clock.GetUtcNow();
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(now, "Europe/Copenhagen").DateTime);
        var from = new DateOnly(today.Year, today.Month, 1).AddMonths(-2);
        if (goal.PlanStart is { } start && start > from && start <= today) from = start;
        var rows = await db.Transactions.AsNoTracking().Where(x => x.AccountId == goal.AccountId && x.Current && x.Status == "BOOK"
            && x.BookingDate >= from && x.BookingDate <= today).OrderByDescending(x => x.BookingDate).ThenBy(x => x.Id).ToListAsync(ct);
        var historyComplete = account?.InitialImportCompleted is not null && account.EarliestTransaction <= from;
        var dedicated = goal.Scope == "Account" && goal.AccountId.HasValue && !await db.Goals.AnyAsync(x => x.Id != goal.Id && x.AccountId == goal.AccountId, ct);
        var fresh = dedicated && account?.Accessible == true && balance is not null && balance.Currency == goal.Currency
            && account.Currency == goal.Currency && (balance.BankTime ?? balance.ObservedAt) >= now.AddHours(-24)
            && rows.All(x => x.Currency == goal.Currency);
        var hasPlan = goal.MonthlyContribution is > 0 && goal.PlanStart <= today && goal.StartingBalance.HasValue;
        decimal? expected = hasPlan ? Math.Min(goal.Target, goal.StartingBalance!.Value + DueCount(goal.PlanStart!.Value, today, goal.ContributionDay) * goal.MonthlyContribution!.Value) : null;
        decimal? shortfall = fresh && expected.HasValue ? Math.Max(0, expected.Value - balance!.Amount) : null;
        var forecast = fresh && hasPlan ? Forecast(balance!.Amount, goal.Target, goal.MonthlyContribution!.Value, today, goal.ContributionDay) : null;
        var withoutShortfall = fresh && hasPlan ? Forecast(balance!.Amount + shortfall!.Value, goal.Target, goal.MonthlyContribution!.Value, today, goal.ContributionDay) : null;
        int? delayMonths = forecast.HasValue && withoutShortfall.HasValue ? (forecast.Value.Year - withoutShortfall.Value.Year) * 12 + forecast.Value.Month - withoutShortfall.Value.Month : null;
        var firstMonth = new DateOnly(from.Year, from.Month, 1);
        var months = Enumerable.Range(0, (today.Year - firstMonth.Year) * 12 + today.Month - firstMonth.Month + 1).Select(i =>
        {
            var month = firstMonth.AddMonths(i); var due = month.AddDays(goal.ContributionDay - 1);
            var booked = rows.Where(x => x.BookingDate!.Value.Year == month.Year && x.BookingDate.Value.Month == month.Month).ToArray();
            decimal? deposits = historyComplete ? booked.Where(x => x.Amount > 0).Sum(x => x.Amount) : null;
            decimal? withdrawals = historyComplete ? -booked.Where(x => x.Amount < 0).Sum(x => x.Amount) : null;
            decimal? planned = hasPlan && due >= goal.PlanStart && due <= today ? goal.MonthlyContribution : null;
            var net = deposits - withdrawals;
            return new { month, due, deposits, withdrawals, net, planned, shortfall = planned.HasValue && net.HasValue ? Math.Max(0, planned.Value - net.Value) : (decimal?)null,
                status = !historyComplete ? "Unknown" : !planned.HasValue ? "NotDue" : net >= planned ? "Received" : net <= 0 ? "Missing" : "Partial" };
        }).ToArray();
        var credits = rows.Where(x => x.Amount > 0).Sum(x => x.Amount); var debits = -rows.Where(x => x.Amount < 0).Sum(x => x.Amount);
        await snapshot.CommitAsync(ct);
        return new { goalId = id, accountName = account?.Name, from, to = today, historyComplete, fresh, hasPlan, expectedBalance = expected,
            shortfall, forecastDate = forecast, withoutShortfallDate = withoutShortfall, delayMonths, months,
            openingBalance = fresh && historyComplete ? balance!.Amount - credits + debits : (decimal?)null,
            deposits = historyComplete ? credits : (decimal?)null, withdrawals = historyComplete ? debits : (decimal?)null,
            closingBalance = balance?.Amount, balanceObservedAt = balance?.BankTime ?? balance?.ObservedAt,
            transactions = rows.Take(30).Select(x => new { x.Id, x.BookingDate, x.Description, x.Amount, x.Currency }),
            transactionCount = rows.Count, forecastMethod = "Future monthly contributions; no interest, returns or additional withdrawals. Opening balance reconstructed from booked balance and recorded transactions." };
    }

    public async Task<object> Photo(Guid id, CancellationToken ct)
    {
        var goal = await db.Goals.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new ApiFailure(404, "GOAL_NOT_FOUND");
        return new { dataUrl = goal.PhotoDataUrl };
    }

    public async Task<object> SavePhoto(Guid id, GoalPhotoInput input, CancellationToken ct)
    {
        // Only a small browser-normalized JPEG is accepted. No remote URLs, SVG, filenames or EXIF are needed.
        if (input.DataUrl is { } data)
        {
            Check.That(data.Length <= 60000 && data.StartsWith("data:image/jpeg;base64,", StringComparison.Ordinal), "INVALID_GOAL_PHOTO");
            byte[] bytes;
            try { bytes = Convert.FromBase64String(data[23..]); } catch (FormatException) { throw new ApiFailure(400, "INVALID_GOAL_PHOTO"); }
            Check.That(bytes.Length is >= 4 and <= 44000 && bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[^2] == 0xff && bytes[^1] == 0xd9, "INVALID_GOAL_PHOTO");
        }
        var goal = await db.Goals.FindAsync([id], ct) ?? throw new ApiFailure(404, "GOAL_NOT_FOUND");
        Version(db, goal, input.Version); goal.PhotoDataUrl = input.DataUrl; goal.UpdatedAt = clock.GetUtcNow();
        db.Entry(goal).Property(x => x.UpdatedAt).IsModified = true;
        await db.SaveChangesAsync(ct); return View(goal);
    }
}
