using System.Diagnostics;
using System.Text.Json;
using Banking.Api.Services;

namespace Banking.Api.Providers;

public interface IPensionPdfReader
{
    Task<PensionReport> Read(byte[] bytes, CancellationToken ct);
}

// The web process never parses untrusted PDF object graphs. A single child has a hard
// GC heap cap, bounded output, no application configuration/credentials and is killed
// (including descendants) on timeout, disconnect or working-set excess.
public sealed class PensionPdfReader : IPensionPdfReader
{
    static readonly SemaphoreSlim Slot = new(1);
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
        var started = false;
        try
        {
            started = process.Start(); Check.That(started, "PENSION_PREVIEW_UNAVAILABLE");
            var output = BoundedOutput(process.StandardOutput, timeout.Token);
            // Never log child stderr. Parsing exceptions can contain private source text.
            var errors = BoundedOutput(process.StandardError, timeout.Token);
            await process.StandardInput.BaseStream.WriteAsync(bytes, timeout.Token);
            process.StandardInput.Close();
            while (!process.HasExited)
            {
                timeout.Token.ThrowIfCancellationRequested(); process.Refresh();
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
            return JsonSerializer.Deserialize<PensionReport>(json) ?? throw new ApiFailure(400, "INVALID_PENSION_PDF");
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested) { throw new ApiFailure(400, "PENSION_PDF_TIME_LIMIT"); }
        catch (JsonException) { throw new ApiFailure(400, "INVALID_PENSION_PDF"); }
        catch (System.ComponentModel.Win32Exception) { throw new ApiFailure(503, "PENSION_PREVIEW_UNAVAILABLE"); }
        finally
        {
            if (started && !process.HasExited) process.Kill(entireProcessTree: true);
            Slot.Release();
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
        try
        {
            using var bytes = new MemoryStream(); var buffer = new byte[8192]; int count;
            var input = Console.OpenStandardInput();
            while ((count = await input.ReadAsync(buffer)) > 0)
            { Check.That(bytes.Length + count <= PensionReportParser.MaxBytes, "PENSION_FILE_TOO_LARGE"); await bytes.WriteAsync(buffer.AsMemory(0, count)); }
            Console.Out.Write(JsonSerializer.Serialize(PensionReportParser.Parse(bytes.ToArray())));
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
