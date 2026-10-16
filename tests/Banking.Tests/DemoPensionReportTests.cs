using System.Text.Json;
using Banking.Api.Providers;
using Banking.Api.Services;

namespace Banking.Tests;

public sealed class DemoPensionReportTests
{
    [Theory]
    [InlineData("earlier", 401000, 2025, 12, 31)]
    [InlineData("later", 431000, 2026, 9, 30)]
    [InlineData("correction", 432000, 2026, 9, 30)]
    public void IndependentReportsUseProvenColumnContractsAndReconcileEveryScenario(string variant, decimal capital, int year, int month, int day)
    {
        var bytes = DemoPensionReport.Create(variant);
        Assert.Equal(bytes, DemoPensionReport.Create(variant));
        var report = PensionReportParser.Parse(bytes);
        Assert.Equal(PensionReportParser.Version, report.ParserVersion); Assert.Equal(46, report.Pages);
        Assert.Equal(new DateOnly(year, month, day), report.ReportAsOf); Assert.Equal(1, report.ReportDateSource!.Page);
        var a = Assert.Single(report.Agreements);
        Assert.Equal("Demo Pension", a.Provider); Assert.Equal("DKK", a.Currency);
        Assert.Equal(report.ReportAsOf, a.AsOf); Assert.Equal(4, a.Balance.Source.Page);
        Assert.Equal(capital, a.Balance.Value); Assert.Equal(capital, a.Components.Sum(c => c.Balance.Value));
        Assert.Equal(new[] { "Ratepension", "Ratepension", "Lifetime" }, a.Components.Select(c => c.Type));
        Assert.All(a.Components, c => { Assert.Equal(42, c.Balance.Source.Page); Assert.Equal(a.AsOf, c.Balance.Source.AsOf); });
        Assert.Equal(36000, a.AnnualContribution.Value); Assert.Equal("DKK/year", a.AnnualContribution.Source.Unit);
        Assert.Equal(Enumerable.Range(65, 11), report.Scenarios.Select(s => s.StartAge));
        foreach (var scenario in report.Scenarios)
        {
            Assert.Contains(scenario.Payouts, p => p.Type == "ATP"); Assert.Contains(scenario.Payouts, p => p.Type == "PublicPension");
            Assert.Contains(scenario.Payouts, p => p.ToAge == null);
            foreach (var band in scenario.Payouts.GroupBy(p => (p.FromAge, p.ToAge)))
            {
                var total = Assert.Single(band, p => p.Type == "Total"); Assert.Equal("Total", total.Provider);
                Assert.Equal(band.Where(p => p.Type != "Total").Sum(p => p.Amount.Value), total.Amount.Value);
                if (band.Key.FromAge >= 67) Assert.Single(band, p => p.Type == "PublicPension");
            }
            Assert.All(scenario.Payouts, p => {
                Assert.Equal("DKK/year", p.Amount.Source.Unit); Assert.Equal(20 + (scenario.StartAge - 65) * 2, p.Amount.Source.Page);
                if (p.Provider == "Demo Pension") Assert.True(p.FromAge >= scenario.StartAge);
                if (p.Type == "Ratepension") { Assert.Equal(15, p.DurationYears); Assert.True(p.ToAge < scenario.StartAge + 15); }
                if (p.Type == "ATP") { Assert.Equal(70, p.MinimumAge); Assert.True(p.FromAge >= 70); }
            });
        }
        Assert.Equal(5, report.Insurance.Length); Assert.Equal(3, report.Insurance.Count(i => i.Type == "Death"));
        Assert.Equal(600000, report.Insurance.Where(i => i.Type == "Death").Sum(i => i.Amount.Value));
        var work = Assert.Single(report.Insurance, i => i.Type == "WorkCapacity");
        Assert.Equal(120000, work.Amount.Value); Assert.Equal("DKK/year", work.Amount.Source.Unit);
        Assert.Equal(100000, Assert.Single(report.Insurance, i => i.Type == "CriticalIllness").Amount.Value);
        Assert.True(report.BeforeTax && report.TodaysMoney);
        Assert.Contains(report.Warnings, w => w.Code == "NO_HOLDINGS_OR_RETURN_HISTORY");
        Assert.DoesNotContain(report.Warnings, w => w.Code is "REPORTED_COMPONENT_TOTAL_DIFFERENCE" or "INSURANCE_COLUMNS_REQUIRE_REVIEW" or "AGREEMENT_LINK_REQUIRES_REVIEW");
        Assert.DoesNotContain("99000123", JsonSerializer.Serialize(report));
    }
}

// Keep process tests in the existing serialized parser test class: the real boundary
// deliberately permits one child, including when multiple test classes run in parallel.
public partial class PensionPdfTests
{
    [Fact]
    public async Task FictionalOriginalUsesUnchangedBoundedLinuxWorker()
    {
        var report = await new PensionPdfReader().Read(DemoPensionReport.Create("later"), default);
        Assert.Equal(431000, Assert.Single(report.Agreements).Balance.Value); Assert.Equal(11, report.Scenarios.Length); Assert.Equal(5, report.Insurance.Length);
        Assert.Throws<ApiFailure>(() => DemoPensionReport.Create("private-file"));
    }
}
