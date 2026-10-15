using System.Diagnostics;
using System.Text.Json;

// Linux-only test fixture for Kudu's actual ProcessStartInfo.Arguments + starter.sh boundary.
// No application host, Azure, credentials or SQL. Input/output are synthetic test commands only.
if (!OperatingSystem.IsLinux()) throw new PlatformNotSupportedException("Linux SCM transport fixture required.");
using var input = JsonDocument.Parse(await Console.In.ReadToEndAsync());
var wrapper = Path.Combine(Path.GetTempPath(), "banking-scm-test-" + Guid.NewGuid().ToString("N"));
try
{
    var argvOnly = input.RootElement.TryGetProperty("argvOnly", out var flag) && flag.GetBoolean();
    await File.WriteAllTextAsync(wrapper, argvOnly
        ? "#!/usr/bin/env python3\nimport json,sys\nprint(json.dumps(sys.argv[1:]))\n"
        : "#!/usr/bin/env bash\nexec \"$@\"\n");
    File.SetUnixFileMode(wrapper, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
    using var process = new Process { StartInfo = new ProcessStartInfo(wrapper) {
        // Intentionally Arguments, NOT ArgumentList: this reproduces the server's parser.
        Arguments = input.RootElement.GetProperty("command").GetString(),
        WorkingDirectory = input.RootElement.GetProperty("dir").GetString(),
        UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true
    } };
    process.Start();
    var output = process.StandardOutput.ReadToEndAsync();
    var error = process.StandardError.ReadToEndAsync();
    using var limit = new CancellationTokenSource(TimeSpan.FromSeconds(15));
    try { await process.WaitForExitAsync(limit.Token); }
    catch (OperationCanceledException) { process.Kill(entireProcessTree: true); throw; }
    Console.Write(JsonSerializer.Serialize(new { process.ExitCode, Output = await output, Error = await error }));
}
finally { File.Delete(wrapper); }
