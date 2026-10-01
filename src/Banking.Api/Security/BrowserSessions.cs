using System.Collections.Concurrent;
using System.Security.Cryptography;
using Banking.Api.Services;
using Microsoft.AspNetCore.DataProtection;
using System.Text.Json;

namespace Banking.Api.Security;

public sealed class BrowserSessions
{
    private readonly TimeProvider clock;
    private readonly IDataProtector protector;
    private readonly string? path;
    private readonly object persistenceGate = new();
    private sealed record SavedSession(string Hash, string Role, DateTimeOffset Until);
    public BrowserSessions(TimeProvider clock, IHostEnvironment environment, IConfiguration config, IDataProtectionProvider protection)
    {
        this.clock = clock; protector = protection.CreateProtector("Banking.Cloud.Sessions.v1");
        if (!CloudHosting.Enabled(environment)) return;
        path = Path.Combine(config["Cloud:StateDirectory"] ?? "/home/Banking", "sessions.protected");
        if (File.Exists(path))
            foreach (var session in JsonSerializer.Deserialize<SavedSession[]>(protector.Unprotect(File.ReadAllText(path))) ?? [])
                if (session.Until > clock.GetUtcNow() && session.Role is "Owner" or "Demo") active[session.Hash] = (session.Role, session.Until);
    }
    public const string Cookie = "__Host-Banking.Local";
    private readonly ConcurrentDictionary<string, DateTimeOffset> tickets = new();
    private readonly ConcurrentDictionary<string, (string Role, DateTimeOffset Until)> active = new();
    public string Issue()
    {
        foreach (var entry in tickets.Where(x => x.Value < clock.GetUtcNow())) tickets.TryRemove(entry.Key, out _);
        Check.That(tickets.Count < 30, "BROWSER_TICKET_LIMIT");
        var ticket = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        tickets[Vault.Hash(ticket)] = clock.GetUtcNow().AddMinutes(2); return ticket;
    }
    public string Consume(string? ticket)
    {
        Check.That(ticket is { Length: 64 }, "INVALID_BROWSER_TICKET");
        if (!tickets.TryRemove(Vault.Hash(ticket!), out var until) || until < clock.GetUtcNow())
            throw new ApiFailure(401, "BROWSER_TICKET_EXPIRED");
        return Create("Owner");
    }
    public string Create(string role)
    {
        Check.That(role is "Owner" or "Demo", "INVALID_SESSION_ROLE");
        foreach (var entry in active.Where(x => x.Value.Until <= clock.GetUtcNow())) active.TryRemove(entry.Key, out _);
        if (active.Count >= 1000) throw new ApiFailure(429, "BROWSER_SESSION_LIMIT");
        var session = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        active[Vault.Hash(session)] = (role, clock.GetUtcNow().AddHours(8));
        Persist();
        return session;
    }
    public string? Role(string? session) => session is { Length: 64 } && active.TryGetValue(Vault.Hash(session), out var value)
        && value.Until > clock.GetUtcNow() ? value.Role : null;
    public bool Valid(string? session) => Role(session) is not null;
    public void Revoke(string? session) { if (session is not null) active.TryRemove(Vault.Hash(session), out _); Persist(); }
    public void RevokeOwners() { foreach (var entry in active.Where(x => x.Value.Role == "Owner")) active.TryRemove(entry.Key, out _); Persist(); }
    private void Persist()
    {
        if (path is null) return;
        lock (persistenceGate)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.WriteAllText(path + ".tmp", protector.Protect(JsonSerializer.Serialize(active.Select(x => new SavedSession(x.Key, x.Value.Role, x.Value.Until)))));
            File.Move(path + ".tmp", path, true);
        }
    }
    public static CookieOptions Options => new() { HttpOnly = true, Secure = true, SameSite = SameSiteMode.Strict, Path = "/", MaxAge = TimeSpan.FromHours(8), IsEssential = true };
}
public sealed record BrowserTicketInput(string Ticket);
