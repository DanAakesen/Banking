using System.Text.Json;
using Banking.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Banking.Api.Services;

public sealed record GoalReference(string Url, string? Label = null);
public sealed record GoalInput(string Name, string Description, decimal Target, string Currency, string Scope,
    Guid? AccountId = null, DateOnly? Deadline = null, string? Notes = null, GoalReference[]? References = null,
    DateOnly? PlanStart = null, decimal? StartingBalance = null, string? Version = null,
    decimal? MonthlyContribution = null, int ContributionDay = 1);

public sealed partial class GoalService(BankingDb db, TimeProvider clock)
{
    public async Task<object> AdvisorContext(CancellationToken ct)
    {
        var goals = await db.Goals.AsNoTracking().OrderBy(x => x.CreatedAt).ThenBy(x => x.Id).Take(100).ToListAsync(ct);
        var details = new List<object>();
        foreach (var goal in goals)
            details.Add(new { goal = View(goal), progress = await Progress(goal.Id, ct), journey = await Journey(goal.Id, ct) });
        return new { generatedAt = clock.GetUtcNow(), goals = details, total = await db.Goals.CountAsync(ct),
            coverage = "Goal definitions, notes, links, plans, current booked progress and the same recent contribution journey shown in Banking. Photos are represented by hasPhoto; journey transactions are limited to 30 within its stated period. Unknown or stale values must not be inferred." };
    }

    public async Task<object> List(CancellationToken ct) => (await db.Goals.AsNoTracking().OrderBy(x => x.CreatedAt).ThenBy(x => x.Id)
        .Take(100).ToListAsync(ct)).Select(View).ToArray();

    public async Task<object> Save(Guid? id, GoalInput input, CancellationToken ct)
    {
        Check.Text(input.Name, 120); Check.Text(input.Description, 2000); Check.Currency(input.Currency);
        Check.Money(input.Target); Check.That(input.Target > 0, "INVALID_GOAL_TARGET");
        Check.That(input.Scope == "Account", "DEDICATED_ACCOUNT_REQUIRED");
        Check.That(input.AccountId.HasValue, "INVALID_GOAL_ACCOUNT");
        await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
        await DatabaseLock.AcquireTransaction(db, "Banking:goal-account-assignment", ct);
        if (await db.Goals.AnyAsync(g => g.AccountId == input.AccountId && (!id.HasValue || g.Id != id.Value), ct))
            throw new ApiFailure(409, "ACCOUNT_ALREADY_HAS_GOAL");
        if (input.AccountId is { } accountId)
        {
            var account = await db.Accounts.AsNoTracking().SingleOrDefaultAsync(x => x.Id == accountId, ct);
            Check.That(account is not null, "ACCOUNT_NOT_FOUND");
            Check.That(account!.Currency == input.Currency, "GOAL_CURRENCY_MISMATCH");
        }
        Check.That((input.Notes?.Length ?? 0) <= 8000, "GOAL_NOTES_TOO_LONG");
        var references = input.References ?? [];
        Check.That(references.Length <= 10, "GOAL_LINK_LIMIT");
        foreach (var reference in references)
        {
            Check.That(reference is not null, "INVALID_GOAL_LINK");
            Check.That(reference!.Url is { Length: > 0 and <= 2000 } && Uri.TryCreate(reference.Url, UriKind.Absolute, out var uri)
                && uri.Scheme is "http" or "https" && string.IsNullOrEmpty(uri.UserInfo), "INVALID_GOAL_LINK");
            Check.That((reference.Label?.Length ?? 0) <= 120, "INVALID_GOAL_LINK_LABEL");
        }
        Check.That(input.PlanStart.HasValue == input.StartingBalance.HasValue, "INCOMPLETE_GOAL_PLAN");
        Check.That(input.ContributionDay is >= 1 and <= 28, "INVALID_CONTRIBUTION_DAY");
        if (input.MonthlyContribution is { } monthly)
        {
            Check.Money(monthly);
            Check.That(monthly > 0 && input.PlanStart.HasValue, "INVALID_MONTHLY_GOAL_PLAN");
        }
        if (input.PlanStart is { } start)
        {
            Check.That(input.Deadline is { } end && end > start, "INVALID_GOAL_PLAN");
            Check.Money(input.StartingBalance!.Value);
            Check.That(input.StartingBalance.Value < input.Target, "INVALID_GOAL_BASELINE");
        }
        Goal goal;
        if (id.HasValue)
        {
            goal = await db.Goals.FindAsync([id.Value], ct) ?? throw new ApiFailure(404, "GOAL_NOT_FOUND");
            Version(db, goal, input.Version);
        }
        else
        {
            Check.That(await db.Goals.CountAsync(ct) < 100, "GOAL_LIMIT");
            goal = new Goal { CreatedAt = clock.GetUtcNow() }; db.Goals.Add(goal);
        }
        goal.Name = input.Name.Trim(); goal.Description = input.Description.Trim(); goal.Notes = input.Notes?.Trim() ?? "";
        goal.Target = input.Target; goal.Currency = input.Currency; goal.Scope = input.Scope; goal.AccountId = input.AccountId;
        goal.Deadline = input.Deadline; goal.PlanStart = input.PlanStart; goal.StartingBalance = input.StartingBalance;
        goal.MonthlyContribution = input.MonthlyContribution; goal.ContributionDay = input.ContributionDay;
        goal.ReferencesJson = JsonSerializer.Serialize(references); goal.UpdatedAt = clock.GetUtcNow();
        if (id.HasValue) db.Entry(goal).Property(x => x.UpdatedAt).IsModified = true;
        await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct); return View(goal);
    }

    public async Task Delete(Guid id, string version, CancellationToken ct)
    {
        var goal = await db.Goals.FindAsync([id], ct) ?? throw new ApiFailure(404, "GOAL_NOT_FOUND");
        Version(db, goal, version); db.Goals.Remove(goal); await db.SaveChangesAsync(ct);
    }

    public async Task<object> Progress(Guid id, CancellationToken ct)
    {
        await using var snapshot = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
        var goal = await db.Goals.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new ApiFailure(404, "GOAL_NOT_FOUND");
        var dedicated = goal.Scope == "Account" && goal.AccountId.HasValue
            && !await db.Goals.AnyAsync(g => g.Id != id && g.AccountId == goal.AccountId, ct);
        var accounts = await db.Accounts.AsNoTracking().Where(x => x.Id == goal.AccountId)
            .OrderBy(x => x.Id).Take(101).ToListAsync(ct);
        Check.That(accounts.Count <= 100, "ACCOUNT_LIMIT");
        var ids = accounts.Select(x => x.Id).ToArray();
        // One latest booked snapshot per account; never combine available and booked balances.
        var balances = await db.Balances.AsNoTracking().Where(x => ids.Contains(x.AccountId) && (x.Type == "ITBD" || x.Type == "CLBD"))
            .GroupBy(x => x.AccountId).Select(g => g.OrderByDescending(x => x.ObservedAt).ThenByDescending(x => x.BankTime).ThenBy(x => x.Id).First())
            .ToListAsync(ct);
        var now = clock.GetUtcNow(); var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(now, "Europe/Copenhagen").DateTime);
        var missing = ids.Except(balances.Select(x => x.AccountId)).ToArray();
        var currencyMismatch = accounts.Any(x => x.Currency != goal.Currency) || balances.Any(x => x.Currency != goal.Currency);
        string? reason = !dedicated ? "DEDICATED_ACCOUNT_REQUIRED" : accounts.Count == 0 ? "NO_ACCOUNTS" : currencyMismatch ? "MIXED_CURRENCY_REQUIRES_CONVERSION"
            : missing.Length > 0 ? "MISSING_BOOKED_BALANCE" : accounts.Any(x => !x.Accessible) ? "ACCOUNT_UNAVAILABLE"
            : balances.Any(x => (x.BankTime ?? x.ObservedAt) < now.AddHours(-24)) ? "STALE_BALANCE" : null;
        decimal? measured = !dedicated || accounts.Count == 0 || currencyMismatch || missing.Length > 0 ? null : balances.Sum(x => x.Amount);
        decimal? percent = measured.HasValue ? decimal.Round(measured.Value / goal.Target * 100, 2) : null;
        decimal? expected = null; decimal? gap = null; decimal? riskAllowance = null;
        var status = "Unknown";
        if (reason is null && measured.HasValue)
        {
            if (measured >= goal.Target) status = "Reached";
            else if (goal.PlanStart is { } start && goal.Deadline is { } end && goal.StartingBalance is { } baseline && today >= start)
            {
                var days = end.DayNumber - start.DayNumber;
                if (goal.MonthlyContribution is { } monthly)
                {
                    expected = Math.Min(goal.Target, baseline + DueCount(start, today, goal.ContributionDay) * monthly);
                    gap = measured - expected;
                    var forecast = Forecast(measured.Value, goal.Target, monthly, today, goal.ContributionDay);
                    status = gap < 0 || forecast is null || forecast > end ? "BehindPlan" : "OnTrack";
                }
                else
                {
                expected = baseline + (goal.Target - baseline) * Math.Clamp(today.DayNumber - start.DayNumber, 0, days) / days;
                gap = measured - expected;
                // V1 planning convention: within seven days of the agreed linear pace is AtRisk.
                riskAllowance = (goal.Target - baseline) * Math.Min(7, days) / days;
                status = gap >= 0 ? "OnTrack" : today >= end || -gap > riskAllowance ? "BehindPlan" : "AtRisk";
                }
            }
            else reason = "NO_ACTIVE_PLAN";
        }
        await snapshot.CommitAsync(ct);
        return new { goalId = id, goal.Scope, goal.AccountId, goal.Target, goal.Currency, goal.Deadline, measuredBalance = measured,
            completionPercent = percent, status, reason, expectedBalance = expected, gap, riskAllowance,
            planMethod = goal.MonthlyContribution.HasValue ? "monthly-contributions-v1" : "linear-from-explicit-baseline-v1", balanceBasis = "booked", generatedAt = now,
            sources = balances.Select(x => new { x.AccountId, x.Type, x.Amount, x.Currency, x.ObservedAt, x.BankTime }),
            missingAccountIds = missing, accountExclusive = dedicated, bankFundsLocked = false };
    }

    private static object View(Goal goal) => new { goal.Id, goal.Name, goal.Description, goal.Notes,
        references = JsonSerializer.Deserialize<GoalReference[]>(goal.ReferencesJson), goal.Target, goal.Currency,
        goal.Scope, goal.AccountId, goal.Deadline, goal.PlanStart, goal.StartingBalance, goal.MonthlyContribution,
        goal.ContributionDay, hasPhoto = goal.PhotoDataUrl is not null, goal.CreatedAt, goal.UpdatedAt, goal.Version };
    internal static void Version(BankingDb db, Entity entity, string? version)
    {
        if (string.IsNullOrWhiteSpace(version)) throw new ApiFailure(428, "VERSION_REQUIRED");
        var bytes = Convert.FromBase64String(version); Check.That(bytes.Length == 8, "INVALID_VERSION");
        db.Entry(entity).Property(x => x.Version).OriginalValue = bytes;
    }
}
