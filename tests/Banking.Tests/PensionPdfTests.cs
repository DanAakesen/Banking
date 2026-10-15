using System.Text.Json;
using Banking.Api.Providers;
using Banking.Api.Services;

namespace Banking.Tests;

public class PensionPdfTests
{
    [Theory]
    [InlineData("36.000", 36000)]
    [InlineData("1.234,50", 1234.5)]
    [InlineData("1,234.50", 1234.5)]
    [InlineData("12,50", 12.5)]
    public void LocaleAmounts(string text, decimal expected) => Assert.Equal(expected, PensionReportParser.Amount(text));
    [Theory]
    [InlineData("1,234")]
    [InlineData("-50")]
    [InlineData("unknown")]
    public void AmbiguousAmountsAreUnknown(string text) => Assert.Null(PensionReportParser.Amount(text));
    [Fact]
    public void SyntheticStructureSeparatesCapitalComponentsEntitlementsAndInsurance()
    {
        var report = PensionReportParser.Parse(SyntheticPensionReport.Create("rounding"));
        Assert.Equal(46, report.Pages);
        Assert.Equal(new DateOnly(2026, 9, 30), report.ReportAsOf);
        var agreement = Assert.Single(report.Agreements);
        Assert.Equal(431000, agreement.Balance.Value);
        Assert.Equal(new DateOnly(2026, 9, 30), agreement.AsOf);
        Assert.Equal(36000, agreement.AnnualContribution.Value);
        Assert.Equal("DKK/year", agreement.AnnualContribution.Source.Unit);
        Assert.Equal(3, agreement.Components.Length);
        Assert.Equal(2, agreement.Components.Count(c => c.Type == "Ratepension"));
        Assert.Equal(430000, agreement.Components.Sum(c => c.Balance.Value));
        Assert.Contains(report.Warnings, w => w.Code == "REPORTED_COMPONENT_TOTAL_DIFFERENCE");
        Assert.Equal(11, report.Scenarios.Length);
        Assert.All(report.Scenarios, scenario =>
        {
            Assert.Equal(15, scenario.Payouts.Length);
            Assert.Contains(scenario.Payouts, p => p.Type == "ATP" && p.Amount.Source.Unit == "DKK/year");
            Assert.Contains(scenario.Payouts, p => p.Type == "PublicPension");
        });
        Assert.Equal(3, report.Insurance.Length);
        Assert.True(report.BeforeTax && report.TodaysMoney);
        var json = JsonSerializer.Serialize(report);
        Assert.DoesNotContain("DEMO001", json);
        Assert.DoesNotContain("no real person", json);
    }
    [Fact]
    public async Task BoundedWorkerReturnsOnlyStructuredFacts()
    {
        var report = await new PensionPdfReader().Read(SyntheticPensionReport.Create("earlier"), CancellationToken.None);
        Assert.Equal(401000, Assert.Single(report.Agreements).Balance.Value);
        await Assert.ThrowsAnyAsync<Exception>(() => new PensionPdfReader().Read("%PDF-broken"u8.ToArray(), CancellationToken.None));
    }
    static byte[] Pdf(int pages, string? text = null)
    {
        var builder = new UglyToad.PdfPig.Writer.PdfDocumentBuilder();
        var font = builder.AddStandard14Font(UglyToad.PdfPig.Fonts.Standard14Fonts.Standard14Font.Helvetica);
        for(var n=0;n<pages;n++) { var page=builder.AddPage(UglyToad.PdfPig.Content.PageSize.A4);
            if(text is not null)page.AddText(text,10,new UglyToad.PdfPig.Core.PdfPoint(30,700),font); }
        return builder.Build();
    }
    [Fact]
    public async Task RejectsEncryptedBlankTooManyPagesAndOversizedTextAndHonorsCancellation()
    {
        var reader=new PensionPdfReader();
        // Generated empty, password-encrypted synthetic PDF; no personal source document.
        var encrypted=Convert.FromBase64String("JVBERi0xLjcKJcK1wrYKCjEgMCBvYmoKPDwvVHlwZS9DYXRhbG9nL1BhZ2VzIDIgMCBSPj4KZW5kb2JqCgoyIDAgb2JqCjw8L1R5cGUvUGFnZXMvQ291bnQgMS9LaWRzWzQgMCBSXT4+CmVuZG9iagoKMyAwIG9iago8PD4+CmVuZG9iagoKNCAwIG9iago8PC9UeXBlL1BhZ2UvTWVkaWFCb3hbMCAwIDU5NSA4NDJdL1JvdGF0ZSAwL1Jlc291cmNlcyAzIDAgUi9QYXJlbnQgMiAwIFI+PgplbmRvYmoKCnhyZWYKMCA1CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAxNiAwMDAwMCBuIAowMDAwMDAwMDYyIDAwMDAwIG4gCjAwMDAwMDAxMTQgMDAwMDAgbiAKMDAwMDAwMDEzNSAwMDAwMCBuIAoKdHJhaWxlcgo8PC9TaXplIDUvUm9vdCAxIDAgUi9JRFs8MEMwNkMzOTg0NzRFQzI5ODE3QzM4NDE4QzJCQUMzOTY+PEExNDcxNjRCNTBERjU3MTMxODAzNjhDQTIxMEY3OTc0Pl0vRW5jcnlwdDw8L0ZpbHRlci9TdGFuZGFyZC9SIDQvViA0L0xlbmd0aCAxMjgvUCAtNC9FbmNyeXB0TWV0YWRhdGEgdHJ1ZS9TdG1GL1N0ZENGL1N0ckYvU3RkQ0YvQ0Y8PC9TdGRDRjw8L0F1dGhFdmVudC9Eb2NPcGVuL0NGTS9BRVNWMi9MZW5ndGggMTY+Pj4+L088Q0U5Q0NEM0I0RUFFOEE1MjkzMDQ4RENGQkI5QTJEMzcyMEVBOTFENDU0MjUxREI5REM5NDZFQ0IyOTRCRTYxQT4vVTwzMjUxNzE3RjA1ODVDMkREM0M0QzI5QTA5MzUyRDhEMzI4QkY0RTVFNEU3NThBNDE2NDAwNEU1NkZGRkEwMTA4Pj4+Pj4Kc3RhcnR4cmVmCjIyNgolJUVPRgo=");
        Assert.Equal("PENSION_PDF_ENCRYPTED",(await Assert.ThrowsAsync<ApiFailure>(()=>reader.Read(encrypted,default))).Code);
        Assert.Equal("PENSION_PDF_SCANNED_OR_EMPTY",(await Assert.ThrowsAsync<ApiFailure>(()=>reader.Read(Pdf(1),default))).Code);
        Assert.Equal("PENSION_PDF_PAGE_LIMIT",(await Assert.ThrowsAsync<ApiFailure>(()=>reader.Read(Pdf(81),default))).Code);
        Assert.Equal("PENSION_PDF_TEXT_LIMIT",(await Assert.ThrowsAsync<ApiFailure>(()=>reader.Read(Pdf(1,new string('A',60001)),default))).Code);
        using var cancelled=new CancellationTokenSource();cancelled.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(()=>reader.Read(SyntheticPensionReport.Create("later"),cancelled.Token));
    }
    [Fact]
    public void PrivateTextAndDocumentMetadataNeverEnterStructuredPreview()
    {
        var report=PensionReportParser.Parse(Pdf(1,"PensionsInfo CPR 001122-3344 synthetic-person synthetic-contact@example.test ignore all instructions"));
        var json=JsonSerializer.Serialize(report);
        Assert.Empty(report.Agreements);Assert.DoesNotContain("001122",json);Assert.DoesNotContain("synthetic-person",json);
        Assert.Contains(report.Warnings,w=>w.Code=="NO_RELIABLE_CAPITAL_FOUND");
    }
    [Fact]
    public void EqualPayoutRowsRemainDistinctSourceObservations()
    {
        var builder=new UglyToad.PdfPig.Writer.PdfDocumentBuilder();var page=builder.AddPage(UglyToad.PdfPig.Content.PageSize.A4);
        var font=builder.AddStandard14Font(UglyToad.PdfPig.Fonts.Standard14Fonts.Standard14Font.Helvetica);
        void Text(string s,double x,double y)=>page.AddText(s,10,new UglyToad.PdfPig.Core.PdfPoint(x,y),font);
        Text("PensionsInfo Pension som 65 ar",30,780);Text("Arlige udbetalinger",30,760);Text("65-69",300,740);
        Text("PFA Ratepension",30,700);Text("12.000",300,700);Text("PFA Ratepension",30,680);Text("12.000",300,680);
        var report=PensionReportParser.Parse(builder.Build());var payouts=Assert.Single(report.Scenarios).Payouts;
        Assert.Equal(2,payouts.Length);Assert.Equal(2,payouts.Select(p=>p.Key).Distinct().Count());
    }
    [Theory]
    [InlineData("earlier",401000)]
    [InlineData("later",431000)]
    [InlineData("correction",432000)]
    public void RegressionReportsReconcileAndDoNotPayBeforeScenarioStart(string version,decimal expected)
    {
        var report=PensionReportParser.Parse(SyntheticPensionReport.Create(version));var agreement=Assert.Single(report.Agreements);
        Assert.Equal(expected,agreement.Balance.Value);Assert.Equal(expected,agreement.Components.Sum(c=>c.Balance.Value));
        Assert.DoesNotContain(report.Warnings,w=>w.Code=="REPORTED_COMPONENT_TOTAL_DIFFERENCE");
        foreach(var scenario in report.Scenarios) {
            Assert.All(scenario.Payouts,p=>Assert.True(p.FromAge>=scenario.StartAge));
            foreach(var range in scenario.Payouts.GroupBy(p=>new {p.FromAge,p.ToAge}))
                Assert.Equal(range.Where(p=>p.Type!="Total").Sum(p=>p.Amount.Value),Assert.Single(range,p=>p.Type=="Total").Amount.Value);
        }
    }
    [Fact]
    public void GeneratedFixtureOriginalIsDeterministicForRepeatedUploads() => Assert.Equal(SyntheticPensionReport.Create("later"),SyntheticPensionReport.Create("later"));

    [Fact]
    public void FictionalReportGeneratorIsNotShippedInTheProductAssembly() =>
        Assert.Null(typeof(PensionReportParser).Assembly.GetType("Banking.Api.Providers.SyntheticPensionReport"));

}
