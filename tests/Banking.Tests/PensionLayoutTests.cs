using System.Text.Json;
using Banking.Api.Providers;

namespace Banking.Tests;

public partial class PensionPdfTests
{
    static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);
    [Fact]
    public async Task ColumnLayoutJoinsLogoOnlySummaryAndComponentsWithoutLeakingReferencesOrFutureDates()
    {
        var bytes = ColumnPensionPdf.Create(criticalLayout: "left");
        var report = await new PensionPdfReader().Read(bytes, default);
        Assert.Equal("pensionsinfo-text-3", report.ParserVersion);
        Assert.Equal(46, report.Pages); Assert.Null(report.ReportAsOf); Assert.Null(report.ReportDateSource);
        Assert.DoesNotContain(report.Warnings, w => w.Code is "CAPITAL_COLUMNS_REQUIRE_REVIEW" or "AGREEMENT_LINK_REQUIRES_REVIEW" or "SCENARIO_ROW_REQUIRES_REVIEW" or "SCENARIO_COLUMNS_REQUIRE_REVIEW");
        var a = Assert.Single(report.Agreements);
        Assert.Equal("PFA", a.Provider); Assert.Equal(927000, a.Balance.Value);
        Assert.Equal(new DateOnly(2024, 4, 12), a.AsOf); Assert.Equal(4, a.DateSource!.Page);
        Assert.Equal(4, a.Balance.Source.Page); Assert.Equal(a.AsOf, a.Balance.Source.AsOf);
        Assert.Equal(132000, a.AnnualContribution.Value); Assert.Equal("DKK/year", a.AnnualContribution.Source.Unit);
        Assert.Equal(a.AsOf, a.AnnualContribution.Source.AsOf);
        Assert.Equal(3, a.Components.Length); Assert.Equal(2, a.Components.Count(c => c.Type == "Ratepension"));
        Assert.Equal(new decimal?[] { 704000, 61000, 161000 }, a.Components.Select(c => c.Balance.Value));
        Assert.All(a.Components, c => { Assert.Equal(42, c.Balance.Source.Page); Assert.Equal(a.AsOf, c.Balance.Source.AsOf); });
        Assert.Contains(report.Warnings, w => w.Code == "REPORTED_COMPONENT_TOTAL_DIFFERENCE");
        Assert.True(report.BeforeTax && report.TodaysMoney);
        Assert.Equal(126000, Assert.Single(report.Insurance, i => i.Type == "CriticalIllness").Amount.Value);
        var json = JsonSerializer.Serialize(report, Web);
        Assert.DoesNotContain(ColumnPensionPdf.Reference, json); Assert.DoesNotContain("2054", json);
        Assert.DoesNotContain("fictional column", json); Assert.DoesNotContain("protectedOriginal", json);
        var folder = Path.GetFullPath("../../../../../artifacts/pension-history", AppContext.BaseDirectory);
        Directory.CreateDirectory(folder); await File.WriteAllTextAsync(Path.Combine(folder, "report-columns.json"), json);
    }
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void MultilineScenarioTablesKeepRightAlignedRangesBlanksZeroTermsAndReportedTotals(bool wrapped)
    {
        var report = PensionReportParser.Parse(ColumnPensionPdf.Create(wrapped: wrapped));
        Assert.Equal(132000, Assert.Single(report.Agreements).AnnualContribution.Value);
        Assert.Equal(11, report.Scenarios.Length);
        foreach (var scenario in report.Scenarios)
        {
            Assert.NotEmpty(scenario.Payouts);
            Assert.All(scenario.Payouts, p => { Assert.Equal("DKK/year", p.Amount.Source.Unit); Assert.Equal("Reported", p.Amount.Source.Status); Assert.Equal(20 + (scenario.StartAge - 65) * 2, p.Amount.Source.Page); });
            Assert.All(scenario.Payouts.Where(p => p.Type == "Total"), p => Assert.Equal("Total", p.Provider));
            foreach (var range in scenario.Payouts.GroupBy(p => (p.FromAge, p.ToAge)))
            {
                Assert.Equal(range.Where(p => p.Type != "Total").Sum(p => p.Amount.Value), Assert.Single(range, p => p.Type == "Total").Amount.Value);
                Assert.InRange(range.Count(p => p.Type == "PublicPension"), 0, 1);
            }
            Assert.Contains(scenario.Payouts, p => p.ToAge is null && p.Type == "Total");
            Assert.All(scenario.Payouts.Where(p => p.Type == "Ratepension"), p => { Assert.Equal(15, p.DurationYears); Assert.Equal("S", p.TaxMarker); Assert.Equal("PFA", p.Provider); });
            Assert.All(scenario.Payouts.Where(p => p.Type == "ATP"), p => Assert.Equal(70, p.MinimumAge));
        }
        var first = report.Scenarios.Single(s => s.StartAge == 65);
        Assert.DoesNotContain(first.Payouts, p => p.Type == "PublicPension" && p.FromAge == 65);
        Assert.Contains(first.Payouts, p => p.Type == "Ratepension" && p.FromAge == 82 && p.ToAge == null && p.Amount.Value == 0);
        Assert.Contains(first.Payouts, p => p.Type == "Total" && p.FromAge == 80 && p.ToAge == 81);
        var seventy = report.Scenarios.Single(s => s.StartAge == 70);
        Assert.Equal(536000, Assert.Single(seventy.Payouts, p => p.Type == "Total" && p.FromAge == 70 && p.ToAge == 84).Amount.Value);
        Assert.Equal(258000, Assert.Single(seventy.Payouts, p => p.Type == "Total" && p.FromAge == 85 && p.ToAge == null).Amount.Value);
        Assert.Contains(report.Scenarios.Single(s => s.StartAge == 71).Payouts, p => p.Type == "PublicPension" && p.FromAge == 70 && p.ToAge == 70);
        Assert.DoesNotContain(report.Scenarios.Single(s => s.StartAge == 71).Payouts, p => p.Type == "Ratepension" && p.FromAge == 70);
    }
    [Fact]
    public void EntirelyBlankComponentRowsDoNotStealThePreviousRowsTypeProviderOrTerms()
    {
        var report = PensionReportParser.Parse(ColumnPensionPdf.Create(blankComponent: true));
        foreach (var scenario in report.Scenarios)
        {
            Assert.Equal(1, scenario.Payouts.Where(p => p.Type == "Ratepension").GroupBy(p => p.FromAge).Max(g => g.Count()));
            foreach (var range in scenario.Payouts.GroupBy(p => (p.FromAge, p.ToAge)))
                Assert.Equal(range.Where(p => p.Type != "Total").Sum(p => p.Amount.Value), Assert.Single(range, p => p.Type == "Total").Amount.Value);
        }
    }
    [Fact]
    public void InsuranceUsesSectionAndProviderBlocksExcludesTotalsAndDoesNotDuplicateConditionalCells()
    {
        var report = PensionReportParser.Parse(ColumnPensionPdf.Create());
        Assert.Equal(5, report.Insurance.Length);
        var death = report.Insurance.Where(i => i.Type == "Death").ToArray();
        Assert.Equal(new decimal?[] { 58000, 438000, 142000 }, death.Select(i => i.Amount.Value));
        Assert.Equal("ATP", death[0].Provider); Assert.All(death, i => { Assert.Equal("DKK", i.Amount.Source.Unit); Assert.Equal(5, i.Amount.Source.Page); });
        var work = Assert.Single(report.Insurance, i => i.Type == "WorkCapacity");
        Assert.Equal(188000, work.Amount.Value); Assert.Equal("DKK/year", work.Amount.Source.Unit);
        Assert.Equal(94000, Assert.Single(report.Insurance, i => i.Type == "CriticalIllness").Amount.Value);
        Assert.Contains(report.Warnings, w => w.Code == "CHILD_BENEFIT_REQUIRES_ORIGINAL_REVIEW" && w.Page == 6);
        Assert.Contains(report.Warnings, w => w.Code == "INSURANCE_TERMS_REQUIRE_ORIGINAL_REVIEW");
        Assert.Equal(927000, Assert.Single(report.Agreements).Balance.Value);
        var conditional = PensionReportParser.Parse(ColumnPensionPdf.Create(conditional: true));
        Assert.Null(Assert.Single(conditional.Insurance, i => i.Type == "WorkCapacity").Amount.Value);
        Assert.Contains(conditional.Warnings, w => w.Code == "INSURANCE_CONDITIONS_REQUIRE_ORIGINAL_REVIEW");
    }
    [Theory]
    [InlineData("left")]
    [InlineData("bare")]
    public void LeftInsuranceHeaderAnchorsOneProviderObservationWithoutCountingSubtotalFinalTotalOrNotes(string layout)
    {
        var report = PensionReportParser.Parse(ColumnPensionPdf.Create(criticalLayout: layout));
        var cover = Assert.Single(report.Insurance, i => i.Type == "CriticalIllness");
        Assert.Equal("PFA", cover.Provider); Assert.Equal(126000, cover.Amount.Value);
        Assert.Equal(8, cover.Amount.Source.Page); Assert.Equal("DKK", cover.Amount.Source.Unit);
        Assert.Equal("Reported", cover.Amount.Source.Status); Assert.Equal("Insurance source observation", cover.Amount.Source.Section);
        Assert.Equal(5, report.Insurance.Length); Assert.Equal(927000, Assert.Single(report.Agreements).Balance.Value);
        Assert.DoesNotContain(report.Warnings, w => w.Code == "INSURANCE_COLUMNS_REQUIRE_REVIEW" && w.Page == 8);
        Assert.DoesNotContain(ColumnPensionPdf.Reference, JsonSerializer.Serialize(report, Web));
    }
    [Theory]
    [InlineData("missing")]
    [InlineData("ambiguous")]
    [InlineData("notes")]
    [InlineData("misaligned")]
    [InlineData("multipleCells")]
    public void LeftInsuranceHeaderDoesNotGuessGeometryFromMissingAmbiguousOrUnalignedMoney(string layout)
    {
        var report = PensionReportParser.Parse(ColumnPensionPdf.Create(criticalLayout: layout));
        Assert.DoesNotContain(report.Insurance, i => i.Type == "CriticalIllness");
        Assert.Contains(report.Warnings, w => w.Code == "INSURANCE_COLUMNS_REQUIRE_REVIEW" && w.Page == 8);
        Assert.Equal(927000, Assert.Single(report.Agreements).Balance.Value);
    }
    [Fact]
    public void MissingSavingDatesNeverUseFuturePayoutOrContributionDatesAndAmbiguousReferencesNeverAllocateContribution()
    {
        var unknown = Assert.Single(PensionReportParser.Parse(ColumnPensionPdf.Create(missingSavingsDate: true)).Agreements);
        Assert.Null(unknown.AsOf); Assert.Null(unknown.Balance.Source.AsOf); Assert.All(unknown.Components, c => Assert.Null(c.Balance.Source.AsOf));
        Assert.Equal(new DateOnly(2024, 4, 12), unknown.AnnualContribution.Source.AsOf);
        var ambiguous = PensionReportParser.Parse(ColumnPensionPdf.Create(ambiguous: true));
        Assert.Equal(2, ambiguous.Agreements.Length); Assert.All(ambiguous.Agreements, a => Assert.Null(a.AnnualContribution.Value));
        var providerTotal = Assert.Single(ambiguous.Agreements, a => a.Provider == "PFA");
        Assert.Equal(927000, providerTotal.Balance.Value); Assert.Equal(3, providerTotal.Balance.Source.Page);
        Assert.Null(Assert.Single(ambiguous.Agreements, a => a.Provider == "Velliv").Balance.Value);
        Assert.Contains(ambiguous.Warnings, w => w.Code == "AGREEMENT_LINK_REQUIRES_REVIEW" && w.Page == 4);
    }
}
