using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Serialization;
using Banking.Api.Services;

namespace Banking.Api.Providers;

public interface IPensionPdfReader
{
    Task<PensionReport> Read(byte[] bytes, CancellationToken ct);
}

// The web process never parses untrusted PDF object graphs. A single child has a hard
// GC heap cap, bounded output, no application configuration/credentials and is killed
// (including descendants) on timeout, disconnect or working-set excess.
public sealed class PensionPdfReader(ILogger<PensionPdfReader>? logger = null) : IPensionPdfReader
{
    static readonly SemaphoreSlim Slot = new(1);
    // Internal IPC only: null members and computed Confidence are reconstructed by the parent.
    // Keep the full API/review model and the existing wire output cap unchanged.
    static readonly JsonSerializerOptions Wire = new() {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull, IgnoreReadOnlyProperties = true
    };
    static readonly JsonSerializerOptions ProgressWire = new() {
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow, RespectRequiredConstructorParameters = true
    };
    public const int Seconds = 20;
    public async Task<PensionReport> Read(byte[] bytes, CancellationToken ct)
    {
        Check.That(bytes.Length <= PensionReportParser.MaxBytes, "PENSION_FILE_TOO_LARGE");
        Check.That(await Slot.WaitAsync(0, ct), "PENSION_PREVIEW_BUSY");
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(Seconds));
        var start = new ProcessStartInfo("dotnet") { RedirectStandardInput = true, RedirectStandardOutput = true,
            RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true };
        start.ArgumentList.Add(typeof(PensionPdfReader).Assembly.Location);
        start.ArgumentList.Add("--pension-pdf-worker");
        var dotnetRoot = Environment.GetEnvironmentVariable("DOTNET_ROOT");
        var searchPath = Environment.GetEnvironmentVariable("PATH");
        start.Environment.Clear();
        if (dotnetRoot is not null) start.Environment["DOTNET_ROOT"] = dotnetRoot;
        if (searchPath is not null) start.Environment["PATH"] = searchPath;
        start.Environment["DOTNET_GCHeapHardLimit"] = "10000000"; // 256 MiB, hexadecimal.
        start.Environment["DOTNET_EnableDiagnostics"] = "0";
        using var process = new Process { StartInfo = start };
        var started = false; var completed = false; var clock = Stopwatch.StartNew();
        var progress = new PdfProgress("Starting", 0, 0, 0);
        try
        {
            started = process.Start(); Check.That(started, "PENSION_PREVIEW_UNAVAILABLE");
            var output = BoundedOutput(process.StandardOutput, timeout.Token);
            // Only fixed-stage numeric diagnostics may cross this boundary; never forward raw stderr.
            var errors = ReadProgress(process.StandardError, value => progress = value, timeout.Token);
            await process.StandardInput.BaseStream.WriteAsync(bytes, timeout.Token);
            process.StandardInput.Close();
            while (!process.HasExited)
            {
                timeout.Token.ThrowIfCancellationRequested(); process.Refresh();
                // A bounded reader may fail while the child is blocked on its now-undrained pipe.
                // Observe that failure immediately rather than waiting for exit and reporting a timeout.
                if (output.IsFaulted) await output;
                if (errors.IsFaulted) await errors;
                Check.That(process.WorkingSet64 <= 384L * 1024 * 1024, "PENSION_PDF_RESOURCE_LIMIT");
                await Task.Delay(50, timeout.Token);
            }
            var json = await output; await errors;
            if (process.ExitCode != 0)
            {
                var error = JsonSerializer.Deserialize<WorkerError>(json);
                throw new ApiFailure(400, error?.Code is "PENSION_PDF_ENCRYPTED" or "PENSION_PDF_PAGE_LIMIT"
                    or "PENSION_PDF_TEXT_LIMIT" or "PENSION_PDF_SCANNED_OR_EMPTY" or "PENSIONSINFO_PDF_REQUIRED"
                    ? error.Code : "INVALID_PENSION_PDF");
            }
            var report = JsonSerializer.Deserialize<PensionReport>(json) ?? throw new ApiFailure(400, "INVALID_PENSION_PDF");
            completed = true; return report;
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested) { throw new ApiFailure(400, "PENSION_PDF_TIME_LIMIT"); }
        catch (JsonException) { throw new ApiFailure(400, "INVALID_PENSION_PDF"); }
        catch (System.ComponentModel.Win32Exception) { throw new ApiFailure(503, "PENSION_PREVIEW_UNAVAILABLE"); }
        finally
        {
            if (started && !process.HasExited) process.Kill(entireProcessTree: true);
            Slot.Release();
            logger?.LogInformation("Pension PDF worker {Outcome}: stage {Stage}; elapsedMs {ElapsedMs}; pages {Pages}; letters {Letters}; workerElapsedMs {WorkerElapsedMs}",
                completed ? "Completed" : ct.IsCancellationRequested ? "Cancelled" : "Failed",
                progress.Stage, clock.ElapsedMilliseconds, progress.Pages, progress.Letters, progress.ElapsedMs);
        }
    }
    internal sealed record PdfProgress(string Stage, int Pages, int Letters, long ElapsedMs);
    internal static PdfProgress? DecodeProgress(string line)
    {
        if (line.Length > 1024) return null;
        try
        {
            var value = JsonSerializer.Deserialize<PdfProgress>(line, ProgressWire);
            return value is { Pages: >= 0 and <= PensionReportParser.MaxPages, Letters: >= 0 and <= 600_000, ElapsedMs: >= 0 and <= Seconds * 1000 }
                && value.Stage is "ReadingInput" or "Opening" or "ReadingPage" or "ReadingWords" or "Extracting" or "Serializing"
                ? value : null;
        }
        catch (JsonException) { return null; }
    }
    static async Task ReadProgress(StreamReader reader, Action<PdfProgress> update, CancellationToken ct)
    {
        var line = new System.Text.StringBuilder(); var buffer = new char[4096]; var total = 0; int count;
        while ((count = await reader.ReadAsync(buffer.AsMemory(), ct)) > 0)
        {
            total += count; Check.That(total <= 512_000, "PENSION_PDF_OUTPUT_LIMIT");
            foreach (var character in buffer.AsSpan(0, count))
            {
                if (character == '\n') { if (DecodeProgress(line.ToString()) is { } value) update(value); line.Clear(); }
                else if (line.Length <= 1024) line.Append(character);
            }
        }
    }
    static async Task<string> BoundedOutput(StreamReader reader, CancellationToken ct)
    {
        var text = new System.Text.StringBuilder(); var buffer = new char[4096]; int count;
        while ((count = await reader.ReadAsync(buffer.AsMemory(), ct)) > 0)
        { Check.That(text.Length + count <= 512_000, "PENSION_PDF_OUTPUT_LIMIT"); text.Append(buffer, 0, count); }
        return text.ToString();
    }
    sealed record WorkerError(string Code);
    public static async Task<int> Run()
    {
        var clock = Stopwatch.StartNew();
        var lastLetters = 0;
        void Progress(string stage, int pages, int letters) {
            lastLetters = letters;
            Console.Error.WriteLine(JsonSerializer.Serialize(new PdfProgress(stage, pages, letters, clock.ElapsedMilliseconds)));
        }
        try
        {
            Progress("ReadingInput", 0, 0);
            using var bytes = new MemoryStream(); var buffer = new byte[8192]; int count;
            var input = Console.OpenStandardInput();
            while ((count = await input.ReadAsync(buffer)) > 0)
            { Check.That(bytes.Length + count <= PensionReportParser.MaxBytes, "PENSION_FILE_TOO_LARGE"); await bytes.WriteAsync(buffer.AsMemory(0, count)); }
            var report = PensionReportParser.Parse(bytes.ToArray(), default, Progress);
            Progress("Serializing", report.Pages, lastLetters);
            Console.Out.Write(JsonSerializer.Serialize(report, Wire));
            return 0;
        }
        catch (Exception error)
        {
            var code = error is ApiFailure f ? f.Code : error.GetType().Name.Contains("Encrypt", StringComparison.Ordinal) ? "PENSION_PDF_ENCRYPTED" : "INVALID_PENSION_PDF";
            Console.Out.Write(JsonSerializer.Serialize(new WorkerError(code)));
            return 2;
        }
    }
}
