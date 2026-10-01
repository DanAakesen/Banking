using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;
using Banking.Api.Services;

namespace Banking.Api.Security;

// A single local owner credential. Testing hosts always use an in-memory store.
public sealed class OwnerPassword
{
    private readonly object gate = new();
    private readonly PasswordHasher<string> hasher = new(Options.Create(new PasswordHasherOptions { IterationCount = 210000 }));
    private readonly IDataProtector protector;
    private readonly string? path;
    private readonly TimeProvider clock;
    private string? hash;
    private int failures;
    private DateTimeOffset window;
    private readonly string? throttlePath;
    private readonly bool cloud;
    public OwnerPassword(IDataProtectionProvider protection, IHostEnvironment environment, TimeProvider clock, IConfiguration config)
    {
        this.clock = clock;
        protector = protection.CreateProtector("Banking.Local.OwnerPassword.v1");
        cloud = CloudHosting.Enabled(environment);
        if (cloud)
        {
            hash = config["Cloud:OwnerPasswordHash"] ?? throw new InvalidOperationException("Owner password must be provisioned before deployment.");
            throttlePath = Path.Combine(config["Cloud:StateDirectory"] ?? "/home/Banking", "sign-in.protected");
            if (File.Exists(throttlePath))
            {
                var state = System.Text.Json.JsonSerializer.Deserialize<Throttle>(protector.Unprotect(File.ReadAllText(throttlePath)))!;
                failures = state.Failures; window = state.Window;
            }
            return;
        }
        if (!environment.IsEnvironment("Testing"))
        {
            path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Banking", "owner-password.protected");
            if (File.Exists(path)) hash = protector.Unprotect(File.ReadAllText(path));
        }
    }
    public bool Configured { get { lock (gate) return hash is not null; } }
    public void Setup(string? password)
    {
        if (cloud) throw new ApiFailure(403, "OWNER_SETUP_DISABLED");
        lock (gate)
        {
            if (hash is not null) throw new ApiFailure(409, "PASSWORD_ALREADY_CONFIGURED");
            Check.That(password is { Length: >= 8 and <= 128 }, "PASSWORD_LENGTH");
            var value = hasher.HashPassword("Dan", password!);
            if (path is not null)
            {
                using var file = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None);
                using var writer = new StreamWriter(file); writer.Write(protector.Protect(value));
            }
            hash = value;
        }
    }
    public void Verify(string? password)
    {
        lock (gate)
        {
            var now = clock.GetUtcNow();
            if (now >= window) { failures = 0; window = now.AddMinutes(15); }
            if (failures >= 5) throw new ApiFailure(429, "SIGN_IN_RATE_LIMIT");
            failures++;
            PersistThrottle();
            if (hash is null || password is not { Length: >= 1 and <= 128 }
                || hasher.VerifyHashedPassword("Dan", hash, password) == PasswordVerificationResult.Failed)
                throw new ApiFailure(401, "SIGN_IN_FAILED");
            failures = 0;
            PersistThrottle();
        }
    }
    private sealed record Throttle(int Failures, DateTimeOffset Window);
    private void PersistThrottle()
    {
        if (throttlePath is null) return;
        Directory.CreateDirectory(Path.GetDirectoryName(throttlePath)!);
        var temp = throttlePath + ".tmp";
        File.WriteAllText(temp, protector.Protect(System.Text.Json.JsonSerializer.Serialize(new Throttle(failures, window))));
        File.Move(temp, throttlePath, true);
    }
}
public sealed record OwnerPasswordInput(string Password);
