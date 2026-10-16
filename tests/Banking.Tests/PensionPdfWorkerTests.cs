using System.Diagnostics;
using System.Text.Json;
using Banking.Api.Providers;
using Banking.Api.Services;
using Microsoft.Extensions.Logging;

namespace Banking.Tests;

// Same test class keeps real child-process tests serialized around the single production parser slot.
public partial class PensionPdfTests
{
    sealed class CapturedLogger : ILogger<PensionPdfReader>
    {
        public readonly List<string> Messages = [];
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel level) => true;
        public void Log<TState>(LogLevel level, EventId id, TState state, Exception? error, Func<TState, Exception?, string> format)
            => Messages.Add(format(state, error));
    }
    [Theory]
    [InlineData(46)]
    [InlineData(80)]
    public async Task DenseMultiFontTablesCompleteInsideTheExistingWorkerBudget(int pages)
    {
        var bytes = DensePensionPdf.Create(pages);
        var expected = PensionReportParser.Parse(bytes);
        var actual = await new PensionPdfReader().Read(bytes, default);
        Assert.Equal(pages, actual.Pages);
        Assert.Equal(275000, Assert.Single(actual.Agreements).Balance.Value);
        Assert.Equal(JsonSerializer.Serialize(expected), JsonSerializer.Serialize(actual));
    }
    [Theory]
    [InlineData(46)]
    [InlineData(80)]
    public async Task Type3GlyphProgramsAndMissingDescriptorBboxPreserveSourceText(int pages)
    {
        var bytes = Type3PensionPdf.Create(pages);
        Assert.InRange(bytes.Length, 1_000_000, PensionReportParser.MaxBytes);
        var expected = PensionReportParser.Parse(bytes);
        var logger = new CapturedLogger();
        var actual = await new PensionPdfReader(logger).Read(bytes, default);
        Assert.Equal(pages, actual.Pages);
        Assert.Equal(275000, Assert.Single(actual.Agreements).Balance.Value);
        Assert.Equal(new DateOnly(2026, 9, 30), actual.ReportAsOf);
        Assert.Equal(JsonSerializer.Serialize(expected), JsonSerializer.Serialize(actual));
        var log = Assert.Single(logger.Messages);
        Assert.Contains("Completed: stage Serializing", log);
        Assert.DoesNotContain("PFA", log); Assert.DoesNotContain("275000", log);
        Assert.DoesNotContain("Synthetic", log); Assert.DoesNotContain(PensionReportParser.Key("private-fixture"), log);
    }
    [Fact]
    public async Task CompactWorkerWirePreservesFactsAndUnknownsWithoutRaisingTheOutputCap()
    {
        var bytes = PensionOutputPdf.Create(50);
        var expected = PensionReportParser.Parse(bytes);
        var fullJson = JsonSerializer.Serialize(expected);
        Assert.True(fullJson.Length > 512_000); // The old wire format deadlocks this ordinary-sized input.
        var actual = await new PensionPdfReader().Read(bytes, default);
        Assert.Equal(fullJson, JsonSerializer.Serialize(actual));
        Assert.Equal(46, actual.Pages); Assert.Equal(11, actual.Scenarios.Length);
        var agreement = Assert.Single(actual.Agreements);
        Assert.Equal(275000, agreement.Balance.Value); Assert.Equal(18000, agreement.AnnualContribution.Value);
        Assert.Equal(3, agreement.Components.Length); Assert.Equal(3, actual.Insurance.Length);
        Assert.True(actual.BeforeTax && actual.TodaysMoney);
        Assert.Equal(1650, actual.Scenarios.Sum(s => s.Payouts.Length));
        Assert.All(actual.Scenarios.SelectMany(s => s.Payouts), p => {
            Assert.Null(p.DurationYears); Assert.Null(p.MinimumAge); Assert.Null(p.TaxMarker);
            Assert.Equal("Matched source pattern; review required", p.Amount.Source.Confidence);
        });
    }
    [Fact]
    public async Task ExcessiveOutputIsClassifiedBeforePipeDeadlockAndReleasesTheParserSlot()
    {
        var logger = new CapturedLogger(); var clock = Stopwatch.StartNew();
        var failure = await Assert.ThrowsAsync<ApiFailure>(() => new PensionPdfReader(logger).Read(PensionOutputPdf.Create(80), default));
        Assert.Equal("PENSION_PDF_OUTPUT_LIMIT", failure.Code);
        Assert.True(clock.Elapsed < TimeSpan.FromSeconds(PensionPdfReader.Seconds));
        Assert.Contains("Failed: stage Serializing", Assert.Single(logger.Messages));
        // Reuse the production slot after the failed child was killed, without restarting the web app.
        var report = await new PensionPdfReader().Read(SyntheticPensionReport.Create("earlier"), default);
        Assert.Equal(401000, Assert.Single(report.Agreements).Balance.Value);
    }
    [Fact]
    public void DiagnosticDecoderAllowsOnlyFixedStagesAndBoundedNumericCounts()
    {
        Assert.NotNull(PensionPdfReader.DecodeProgress("{\"Stage\":\"ReadingWords\",\"Pages\":46,\"Letters\":30000,\"ElapsedMs\":1234}"));
        foreach (var line in new[] { "PRIVATE_RAW_TEXT", "{}",
            "{\"Stage\":\"PRIVATE_RAW_TEXT\",\"Pages\":1,\"Letters\":1,\"ElapsedMs\":1}",
            "{\"Stage\":\"Opening\",\"Pages\":81,\"Letters\":1,\"ElapsedMs\":1}",
            "{\"Stage\":\"Opening\",\"Pages\":0,\"Letters\":600001,\"ElapsedMs\":1}",
            "{\"Stage\":\"Opening\",\"Pages\":0,\"Letters\":0,\"ElapsedMs\":20001}",
            "{\"Stage\":\"Opening\",\"Pages\":0,\"Letters\":0,\"ElapsedMs\":1,\"FileHash\":\"PRIVATE_RAW_TEXT\"}",
            "{\"Stage\":\"Opening\",\"Pages\":\"PRIVATE_RAW_TEXT\",\"Letters\":0,\"ElapsedMs\":1}", new string('X',1025) })
            Assert.Null(PensionPdfReader.DecodeProgress(line));
    }
    [Fact]
    public async Task BusyAndCancellationKeepSingleWorkerAndReleaseSlotAfterKill()
    {
        var bytes = Type3PensionPdf.Create(80); using var cancel = new CancellationTokenSource();
        var logger = new CapturedLogger();
        var pending = new PensionPdfReader(logger).Read(bytes, cancel.Token);
        Assert.Equal("PENSION_PREVIEW_BUSY", (await Assert.ThrowsAsync<ApiFailure>(
            () => new PensionPdfReader().Read(bytes, default))).Code);
        cancel.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => pending);
        Assert.Contains("Cancelled", Assert.Single(logger.Messages));
        Assert.Equal(46, (await new PensionPdfReader().Read(SyntheticPensionReport.Create("earlier"), default)).Pages);
    }
}
