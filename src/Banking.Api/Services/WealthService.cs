using Banking.Api.Data;
using Banking.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace Banking.Api.Services;

public sealed class WealthRecord : Entity
{
    public string Name { get; set; } = "";
    public string Provider { get; set; } = "";
    public string Kind { get; set; } = "Investment";
    public decimal Value { get; set; }
    public string Currency { get; set; } = "DKK";
    public DateOnly AsOf { get; set; }
    public string SourceNote { get; set; } = "";
    public decimal? AnnualPension { get; set; }
    public int? RetirementAge { get; set; }
    [System.Text.Json.Serialization.JsonIgnore] public string? PensionSourceKey { get; set; }
    [System.Text.Json.Serialization.JsonIgnore] public string? StockSourceKey { get; set; }
    [System.ComponentModel.DataAnnotations.Schema.NotMapped] public string? ManagedBy => StockSourceKey is null ? null : "EmployeeStockImport";
}
public sealed record WealthInput(string Name, string Provider, string Kind, decimal Value, string Currency, DateOnly AsOf,
    string SourceNote, decimal? AnnualPension = null, int? RetirementAge = null, string? Version = null);

public sealed class WealthService(BankingDb db, TimeProvider clock, Workspace workspace, PensionImportService pensionHistory)
{
    public Task<WealthRecord[]> List(CancellationToken ct)=>db.WealthRecords.AsNoTracking().OrderBy(x=>x.Name).Take(100).ToArrayAsync(ct);
    public async Task<object> Overview(string currency, CancellationToken ct)
    {
        Check.Currency(currency);
        var records = await List(ct);
        // Explicit synthetic visualization data only in Demo. No provider performance claims.
        if (workspace.Mode != "Demo") return new { records, visuals = (object?)null };
        var investments = records.Where(x => x.Kind == "Investment" && x.Currency == currency).ToArray();
        var pensions = records.Where(x => x.Kind == "Pension" && x.Currency == currency).ToArray();
        var end = investments.Length > 0 ? investments.Min(x => x.AsOf) : DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime);
        var value = investments.Sum(x => x.Value);
        decimal[] factors = [1m/1.068m,.942m,.937m,.951m,.948m,.957m,.965m,.958m,.969m,.976m,.972m,.981m,.978m,.989m,.986m,.993m,1m];
        var history = investments.Length == 0 ? [] : factors.Select((factor, i) => new { date = end.AddDays(-180 + (int)Math.Round(i * 180d / (factors.Length - 1))), value = Math.Round(value * factor, 2) }).ToArray();
        var pension = pensions.Sum(x => x.Value);
        var contributions = Math.Round(pension * .635294117647m, 2);
        return new { records, visuals = (object)new { synthetic = true, currency,
            metricTrendFactors = new decimal[][] {
                [.68m,.72m,.70m,.78m,.76m,.81m,.88m,.84m,.91m,.94m,1.02m,1m],
                [.87m,.89m,.88m,.90m,.91m,.92m,.91m,.95m,.96m,.95m,.98m,1m],
                [.79m,.80m,.83m,.83m,.86m,.88m,.88m,.91m,.94m,.94m,.97m,1m],
                [.83m,.85m,.85m,.89m,.88m,.92m,.93m,.93m,.96m,.95m,.99m,1m],
                [.78m,.83m,.81m,.86m,.91m,.87m,.94m,.92m,.98m,.96m,1.02m,1m],
                [1.35m,1.30m,1.34m,1.23m,1.21m,1.17m,1.18m,1.12m,1.09m,1.12m,1.04m,1m],
                [1.18m,1.08m,1.12m,1.02m,.98m,1.04m,.91m,.93m,.88m,.96m,.95m,1m]
            },
            investment = new { history, changePercent = investments.Length > 0 && value > 0 ? (decimal?)6.8m : null },
            pension = pensions.Length > 0 && !await db.PensionSnapshots.AnyAsync(ct) ? new { contributions, returns = pension - contributions } : null,
            basis = "Fictional Demo history and pension breakdown, reconciled to current Demo statements. Not provider-supplied performance." } };
    }
    public static void Validate(WealthInput input, TimeProvider clock)
    {
        Check.Text(input.Name,120);Check.Text(input.Provider,120);Check.Text(input.SourceNote,500);Check.Currency(input.Currency);
        Check.That(input.Kind is "Investment" or "Pension","INVALID_WEALTH_KIND");
        Check.That(input.Value is >=0 and <=100_000_000 && Math.Round(input.Value,2)==input.Value,"INVALID_WEALTH_VALUE");
        Check.That(input.AsOf.Year>=1900&&input.AsOf<=DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(clock.GetUtcNow(),"Europe/Copenhagen").DateTime),"INVALID_VALUATION_DATE");
        Check.That(input.AnnualPension is null or >=0 and <=10_000_000,"INVALID_PENSION_INCOME");
        Check.That(input.RetirementAge is null or >=40 and <=100,"INVALID_RETIREMENT_AGE");
        Check.That(input.Kind=="Pension"||input.AnnualPension is null&&input.RetirementAge is null,"INVALID_INVESTMENT_PROJECTION");
        Check.That(input.AnnualPension.HasValue==input.RetirementAge.HasValue,"INCOMPLETE_PENSION_PROJECTION");
    }
    public async Task<WealthRecord> Save(Guid? id,WealthInput input,CancellationToken ct)
    {
        Validate(input, clock);
        await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
        var row=id.HasValue?await db.WealthRecords.SingleOrDefaultAsync(x=>x.Id==id,ct)??throw new ApiFailure(404,"VALUATION_NOT_FOUND"):new WealthRecord();
        if(row.StockSourceKey is not null)throw new ApiFailure(409,"EMPLOYEE_STOCK_REVIEW_REQUIRED");
        // One current snapshot per named product, updated in place rather than summed across dates.
        if(await db.WealthRecords.AnyAsync(x=>x.Provider==input.Provider.Trim()&&x.Name==input.Name.Trim()&&x.Kind==input.Kind&&x.Id!=row.Id,ct))
            throw new ApiFailure(409,"VALUATION_ALREADY_EXISTS_EDIT_IT");
        if(id.HasValue)GoalService.Version(db,row,input.Version);else{Check.That(await db.WealthRecords.CountAsync(ct)<100,"VALUATION_LIMIT");db.WealthRecords.Add(row);}
        row.Name=input.Name.Trim();row.Provider=input.Provider.Trim();row.Kind=input.Kind;row.Value=input.Value;row.Currency=input.Currency;
        row.AsOf=input.AsOf;row.SourceNote=input.SourceNote.Trim();row.AnnualPension=input.AnnualPension;row.RetirementAge=input.RetirementAge;
        if (row.Kind == "Pension") await pensionHistory.RecordManual(row, ct);
        await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct);return row;
    }
    public async Task Delete(Guid id,string version,CancellationToken ct)
    {
        var row=await db.WealthRecords.SingleOrDefaultAsync(x=>x.Id==id,ct)??throw new ApiFailure(404,"VALUATION_NOT_FOUND");
        if(row.StockSourceKey is not null)throw new ApiFailure(409,"EMPLOYEE_STOCK_REVIEW_REQUIRED");
        GoalService.Version(db,row,version);db.WealthRecords.Remove(row);await db.SaveChangesAsync(ct);
    }
    public async Task<object> Summary(string currency,CancellationToken ct)
    {
        Check.Currency(currency);
        var rows=await db.WealthRecords.AsNoTracking().Where(x=>x.Currency==currency).ToListAsync(ct);
        var loans=await db.Loans.AsNoTracking().Where(x=>x.Currency==currency&&!x.IsScenario).ToListAsync(ct);
        var accounts=await db.Accounts.AsNoTracking().Where(x=>x.Currency==currency).Select(a=>new {a.Id,a.Accessible,
            balance=db.Balances.Where(b=>b.AccountId==a.Id&&b.Currency==currency&&(b.Type=="ITBD"||b.Type=="CLBD"))
                .OrderByDescending(b=>b.ObservedAt).ThenByDescending(b=>b.Id).Select(b=>new{b.Amount,b.ObservedAt,b.BankTime}).FirstOrDefault() }).ToArrayAsync(ct);
        decimal? cash=accounts.Length>0&&accounts.All(x=>x.balance!=null&&x.Accessible)?accounts.Sum(x=>x.balance!.Amount):null;
        var investments=rows.Where(x=>x.Kind=="Investment").Sum(x=>x.Value);var pension=rows.Where(x=>x.Kind=="Pension").Sum(x=>x.Value);var debt=loans.Sum(x=>x.Principal);
        return new {currency,bankCash=cash,investments,pension,debt,recordedNetWealth=cash+investments+pension-debt,
            excludingPension=cash+investments-debt,accounts,valuations=rows.Select(x=>new{x.Id,x.AsOf,x.Kind}),loans=loans.Select(x=>new{x.Id,x.BalanceDate}),
            generatedAt=clock.GetUtcNow(),basis="Recorded assets only, not complete net worth. Booked bank balances plus manually recorded non-cash investments plus pension minus actual loan balances. Scenarios, SIM and foreign currencies excluded. Pension is not available cash. Different observation dates are not rolled forward."};
    }
}
