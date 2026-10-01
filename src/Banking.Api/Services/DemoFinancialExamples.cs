using Banking.Api.Data;
using Banking.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace Banking.Api.Services;

// Provider-neutral synthetic statements, not a simulated PFA/Saxo API contract.
// Only called at initialization or by an explicit maintenance action.
public static class DemoFinancialExamples
{
    public static async Task Ensure(BankingDb db, Workspace workspace, DateOnly today, CancellationToken ct)
    {
        Check.That(workspace.Mode == "Demo", "DEMO_ONLY");
        Check.That(await db.Connections.AnyAsync(ct) && !await db.Connections.AnyAsync(x => !x.IsDemo, ct), "SYNTHETIC_CONNECTION_REQUIRED");
        if (!await db.Loans.AnyAsync(x => !x.IsScenario, ct))
            db.Loans.Add(new LoanRecord { Name = "Eksempel på boligforbedringslån", Principal = 60000,
                AnnualRate = 4, Months = 60, BalanceDate = today, Currency = "DKK", IsScenario = false });
        // Owner-approved statement example for the 360 view; never a Saxo holding/order.
        if (!await db.WealthRecords.AnyAsync(x => x.Kind == "Investment", ct))
            db.WealthRecords.Add(new WealthRecord { Name = "Demo investment portfolio", Provider = "Fictional investment statement", Kind = "Investment",
                Value = 125000, Currency = "DKK", AsOf = today,
                SourceNote = "Synthetic non-cash investment statement for Demo. Not a Saxo account, position or trading balance." });
        if (!await db.WealthRecords.AnyAsync(x => x.Kind == "Pension", ct))
            db.WealthRecords.Add(new WealthRecord { Name = "Pensionseksempel", Provider = "Fiktiv pensionsudbyder", Kind = "Pension",
                Value = 510000, Currency = "DKK", AsOf = today,
                SourceNote = "Fiktiv pensionsformue til Demo. Ingen forbindelse til PFA/Pensure, forsikringsvilkår eller udbetalingsprognose." });
        if (!await db.ResearchItems.AnyAsync(ct))
            db.ResearchItems.AddRange(
                new ResearchItem { Name = "Microsoft", Symbol = "MSFT", Notes = "Eksempel på en analyseinteresse, ikke en beholdning.", UpdatedAt = DateTimeOffset.UtcNow },
                new ResearchItem { Name = "Novo Nordisk", Symbol = "NOVO-B.CO", Notes = "Eksempel på en analyseinteresse, ikke en beholdning.", UpdatedAt = DateTimeOffset.UtcNow });
        await db.SaveChangesAsync(ct);
    }
}
