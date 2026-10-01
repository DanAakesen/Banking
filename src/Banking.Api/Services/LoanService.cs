using Banking.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Banking.Api.Services;

public sealed record LoanInput(string Name, decimal Principal, decimal AnnualRate, int Months, DateOnly BalanceDate,
    string Currency = "DKK", decimal MonthlyFee = 0, decimal UpfrontFee = 0, bool IsScenario = true, string? Version = null);
public sealed record LoanPayment(int Month, DateOnly Date, decimal Opening, decimal Interest, decimal Principal, decimal Fee, decimal Payment, decimal Remaining);
public sealed record LoanProjection(decimal MonthlyPayment, decimal TotalInterest, decimal TotalFees, decimal TotalPaid, DateOnly PaidOff, LoanPayment[] Schedule);

public sealed class LoanRecord : Entity
{
    public string Name { get; set; } = "";
    public decimal Principal { get; set; }
    public decimal AnnualRate { get; set; }
    public int Months { get; set; }
    public DateOnly BalanceDate { get; set; }
    public string Currency { get; set; } = "DKK";
    public decimal MonthlyFee { get; set; }
    public decimal UpfrontFee { get; set; }
    public bool IsScenario { get; set; }
}

public sealed class LoanService(BankingDb db)
{
    public static LoanProjection Project(LoanInput input)
    {
        Check.Text(input.Name, 120); Check.Currency(input.Currency);
        Check.That(input.Principal is > 0 and <= 100_000_000, "INVALID_LOAN_PRINCIPAL");
        Check.That(input.AnnualRate is >= 0 and <= 30, "INVALID_LOAN_RATE");
        Check.That(input.Months is >= 1 and <= 600, "INVALID_LOAN_TERM");
        Check.That(input.MonthlyFee is >= 0 and <= 100_000 && input.UpfrontFee is >= 0 and <= 1_000_000, "INVALID_LOAN_FEE");
        Check.That(Math.Round(input.Principal, 2) == input.Principal && Math.Round(input.MonthlyFee, 2) == input.MonthlyFee
            && Math.Round(input.UpfrontFee, 2) == input.UpfrontFee && Math.Round(input.AnnualRate, 4) == input.AnnualRate, "INVALID_LOAN_PRECISION");
        Check.That(input.BalanceDate.Year is >= 1900 and <= 2100, "INVALID_LOAN_DATE");
        var monthlyRate = input.AnnualRate / 1200m;
        var payment = monthlyRate == 0 ? input.Principal / input.Months : input.Principal * monthlyRate /
            (1 - (decimal)Math.Pow(1 + (double)monthlyRate, -input.Months));
        static decimal Round(decimal value) => Math.Round(value, 2, MidpointRounding.AwayFromZero);
        payment = Round(payment);
        var remaining = Round(input.Principal);
        var schedule = new List<LoanPayment>();
        for (var month = 1; month <= input.Months; month++)
        {
            var opening = remaining; var interest = Round(opening * monthlyRate);
            var principal = month == input.Months ? remaining : Math.Min(remaining, Round(payment - interest));
            remaining = Round(remaining - principal);
            schedule.Add(new(month, input.BalanceDate.AddMonths(month), opening, interest, principal,
                Round(input.MonthlyFee), Round(principal + interest + input.MonthlyFee), remaining));
        }
        var rows = schedule.ToArray();
        return new(rows[0].Payment, rows.Sum(x => x.Interest), Round(input.UpfrontFee) + rows.Sum(x => x.Fee),
            Round(input.UpfrontFee) + rows.Sum(x => x.Payment), rows[^1].Date, rows);
    }

    public async Task<object> List(CancellationToken ct) => (await db.Loans.AsNoTracking().OrderBy(x => x.Name).Take(100).ToListAsync(ct)).Select(View).ToArray();
    public async Task<object> Save(Guid? id, LoanInput input, CancellationToken ct)
    {
        Project(input);
        var entity = id.HasValue ? await db.Loans.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new ApiFailure(404, "LOAN_NOT_FOUND") : new LoanRecord();
        if (id.HasValue) GoalService.Version(db, entity, input.Version);
        else { Check.That(await db.Loans.CountAsync(ct) < 100, "LOAN_LIMIT"); db.Loans.Add(entity); }
        entity.Name = input.Name.Trim(); entity.Principal = input.Principal; entity.AnnualRate = input.AnnualRate;
        entity.Months = input.Months; entity.BalanceDate = input.BalanceDate; entity.Currency = input.Currency;
        entity.MonthlyFee = input.MonthlyFee; entity.UpfrontFee = input.UpfrontFee; entity.IsScenario = input.IsScenario;
        await db.SaveChangesAsync(ct); return View(entity);
    }
    public async Task Delete(Guid id, string version, CancellationToken ct)
    {
        var entity = await db.Loans.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new ApiFailure(404, "LOAN_NOT_FOUND");
        GoalService.Version(db, entity, version); db.Loans.Remove(entity); await db.SaveChangesAsync(ct);
    }
    static object View(LoanRecord loan) => new { loan.Id, loan.Name, loan.Principal, loan.AnnualRate, loan.Months, loan.BalanceDate,
        loan.Currency, loan.MonthlyFee, loan.UpfrontFee, loan.IsScenario, loan.Version,
        projection = Project(new(loan.Name, loan.Principal, loan.AnnualRate, loan.Months, loan.BalanceDate, loan.Currency, loan.MonthlyFee, loan.UpfrontFee, loan.IsScenario)) };
}
