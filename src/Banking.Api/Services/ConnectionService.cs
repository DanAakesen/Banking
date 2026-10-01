using System.Data;
using System.Security.Cryptography;
using System.Text.Json;
using Banking.Api.Data;
using Banking.Api.Providers;
using Banking.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace Banking.Api.Services;

public sealed record ConnectRequest(string Provider, string Bank, string Country, Guid? ReconnectId = null);
public sealed class ConnectionService(BankingDb db, ProviderRegistry providers, Vault vault, IConfiguration config, TimeProvider time, Workspace workspace, IHostEnvironment environment)
{
    public static Uri CallbackUri(string mode, IConfiguration config, IHostEnvironment environment)
    {
        Check.That(mode is "Demo" or "Live", "INVALID_MODE");
        if (mode == "Live")
            return new Uri(config["Cloud:LiveCallbackUrl"] ?? config["Local:LiveCallbackUrl"] ?? "https://localhost:5443/api/auth/callback/live");
        if (CloudHosting.Enabled(environment))
            return new Uri(CloudHosting.Origin(config) + "/api/auth/callback");
        return new Uri(config["Local:DemoCallbackUrl"] ?? "http://127.0.0.1:5080/api/auth/callback");
    }

    public async Task<object> Start(ConnectRequest request, CancellationToken ct)
    {
        Check.Text(request.Provider, 80); Check.Text(request.Bank, 200); Check.Text(request.Country, 2);
        var provider = providers.Get(request.Provider);
        var bank = (await provider.Banks(ct)).SingleOrDefault(x => x.Name == request.Bank && x.Country == request.Country)
            ?? throw new ApiFailure(400, "BANK_NOT_AVAILABLE");
        if (request.ReconnectId is { } id)
        {
            var connection = await db.Connections.FindAsync([id], ct) ?? throw new ApiFailure(404, "CONNECTION_NOT_FOUND");
            Check.That(connection.Provider == provider.Name && connection.Bank == bank.Name && connection.Country == bank.Country, "RECONNECT_BANK_MISMATCH");
        }
        else if (await db.Connections.AnyAsync(x => x.Provider == provider.Name && x.Bank == bank.Name && x.Country == bank.Country, ct))
            throw new ApiFailure(409, "USE_RECONNECT_FOR_EXISTING_BANK");
        var now = time.GetUtcNow();
        var state = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        var attempt = new AuthorizationAttempt { StateHash = Vault.Hash(state), Provider = provider.Name, Bank = bank.Name,
            Country = bank.Country, ReconnectId = request.ReconnectId, ExpiresAt = now.AddMinutes(10) };
        var callback = CallbackUri(workspace.Mode, config, environment);
        // Stay below the provider's upper bound despite clock skew and rounding at the boundary.
        var consentSeconds = Math.Min(bank.MaximumConsentSeconds, 180 * 86400);
        Check.That(consentSeconds > 0, "INVALID_BANK_CONSENT_LIMIT");
        var margin = Math.Min(300, consentSeconds / 100);
        var until = DateTimeOffset.FromUnixTimeSeconds(now.ToUnixTimeSeconds() + consentSeconds - margin);
        var url = await provider.Authorize(bank.Name, bank.Country, state, callback, until, ct);
        db.Authorizations.Add(attempt);
        await db.SaveChangesAsync(ct);
        return new { authorizationUrl = url, expiresAt = attempt.ExpiresAt, isDemo = provider.IsDemo };
    }

    public async Task CancelAuthorization(string state, CancellationToken ct)
    {
        Check.That(state is { Length: 64 }, "INVALID_CALLBACK");
        var hash = Vault.Hash(state); var now = time.GetUtcNow();
        var claimed = await db.Authorizations.Where(x => x.StateHash == hash && x.UsedAt == null && x.ExpiresAt > now)
            .ExecuteUpdateAsync(x => x.SetProperty(a => a.UsedAt, now), ct);
        if (claimed != 1) throw new ApiFailure(400, "INVALID_OR_USED_STATE");
    }
    public async Task<Guid> Complete(string state, string code, CancellationToken ct)
    {
        Check.That(state is { Length: 64 } && code is { Length: > 0 and <= 4096 }, "INVALID_CALLBACK");
        var now = time.GetUtcNow();
        var hash = Vault.Hash(state);
        var attempt = await db.Authorizations.SingleOrDefaultAsync(x => x.StateHash == hash, ct);
        if (attempt is null || attempt.UsedAt is not null || attempt.ExpiresAt <= now) throw new ApiFailure(400, "INVALID_OR_USED_STATE");
        // Atomic consume before remote exchange: a network failure requires a new authorization, not replay.
        var claimed = await db.Authorizations.Where(x => x.Id == attempt.Id && x.UsedAt == null && x.ExpiresAt > now)
            .ExecuteUpdateAsync(x => x.SetProperty(a => a.UsedAt, now), ct);
        if (claimed != 1) throw new ApiFailure(400, "INVALID_OR_USED_STATE");
        var provider = providers.Get(attempt.Provider);
        var session = await provider.Complete(code, ct);
        // Preserve a successful remote exchange before local validation/reconciliation can fail.
        var checkpoint = vault.Protect(JsonSerializer.Serialize(session));
        await db.Authorizations.Where(x => x.Id == attempt.Id).ExecuteUpdateAsync(x => x.SetProperty(a => a.PendingSession, checkpoint), ct);
        return await RetryCompletion(attempt.Id, ct);
    }
    public async Task<Guid> RetryCompletion(Guid attemptId, CancellationToken ct)
    {
        var now = time.GetUtcNow();
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await DatabaseLock.AcquireTransaction(db, $"Banking:authorization:{attemptId}", ct);
        var attempt = await db.Authorizations.SingleOrDefaultAsync(x => x.Id == attemptId, ct)
            ?? throw new ApiFailure(404, "AUTHORIZATION_NOT_FOUND");
        await db.Entry(attempt).ReloadAsync(ct);
        if (attempt.CompletedConnectionId is { } completed) return completed;
        if (attempt.UsedAt is null || attempt.PendingSession is null) throw new ApiFailure(409, "NO_RECOVERABLE_SESSION");
        var session = JsonSerializer.Deserialize<BankSession>(vault.Reveal(attempt.PendingSession))
            ?? throw new ProviderFailure("INVALID_PROVIDER_SESSION");
        var provider = providers.Get(attempt.Provider);
        if (session.Accounts.Count == 0) throw new ProviderFailure("NO_LINKED_ACCOUNTS");
        if (session.Accounts.Count > 100 || string.IsNullOrWhiteSpace(session.Id) || session.ValidUntil <= now || session.Accounts.Any(x => string.IsNullOrWhiteSpace(x.Identity) || string.IsNullOrWhiteSpace(x.Id)))
            throw new ProviderFailure("INVALID_PROVIDER_SESSION");
        if (session.Accounts.Select(x => x.Identity).Distinct(StringComparer.Ordinal).Count() != session.Accounts.Count)
            throw new ProviderFailure("AMBIGUOUS_ACCOUNT_IDENTITY");
        if (session.Accounts.Select(x => x.Id).Distinct(StringComparer.Ordinal).Count() != session.Accounts.Count)
            throw new ProviderFailure("AMBIGUOUS_ACCOUNT_IDENTITY");
        var identitySets = session.Accounts.Select(source => (source.IdentityAliases ?? []).Append(source.Identity)
            .Where(x => !string.IsNullOrWhiteSpace(x)).Select(Vault.Hash).ToHashSet(StringComparer.Ordinal)).ToList();
        Check.That(identitySets.All(x => x.Count <= 20), "TOO_MANY_ACCOUNT_IDENTITIES");
        // Alternative hashes are not necessarily unique: ignore those shared across this consent's accounts.
        var shared = identitySets.SelectMany(x => x).GroupBy(x => x, StringComparer.Ordinal)
            .Where(x => x.Count() > 1).Select(x => x.Key).ToHashSet(StringComparer.Ordinal);
        if (session.Accounts.Any(x => shared.Contains(Vault.Hash(x.Identity))))
            throw new ProviderFailure("AMBIGUOUS_ACCOUNT_IDENTITY");
        Connection connection;
        if (attempt.ReconnectId is { } id)
        {
            await DatabaseLock.AcquireTransaction(db, $"Banking:connection:{id}", ct);
            connection = await db.Connections.FindAsync([id], ct) ?? throw new ApiFailure(404, "CONNECTION_NOT_FOUND");
            await db.Jobs.Where(x => x.Account.ConnectionId == id && (x.Status == "Running" || x.Status == "Queued"))
                .ExecuteUpdateAsync(x => x.SetProperty(j => j.Status, "Cancelled").SetProperty(j => j.CompletedAt, now)
                    .SetProperty(j => j.ErrorCode, "SESSION_REPLACED"), ct);
        }
        else
        {
            await DatabaseLock.AcquireTransaction(db, "Banking:new-connection", ct);
            if (await db.Connections.AnyAsync(x => x.Provider == provider.Name && x.Bank == attempt.Bank && x.Country == attempt.Country, ct))
                throw new ApiFailure(409, "USE_RECONNECT_FOR_EXISTING_BANK");
            connection = new Connection { Provider = provider.Name, Bank = attempt.Bank, Country = attempt.Country, IsDemo = provider.IsDemo };
            db.Connections.Add(connection);
        }
        connection.Session = vault.Protect(session.Id);
        connection.ValidUntil = session.ValidUntil;
        connection.Status = "Active";
        connection.ErrorCode = null;
        connection.RetryNotBefore = null;
        var accounts = await db.Accounts.Where(x => x.ConnectionId == connection.Id).ToListAsync(ct);
        var aliases = await db.AccountAliases.Where(x => x.ConnectionId == connection.Id).ToListAsync(ct);
        if (accounts.Any(x => shared.Contains(x.IdentityHash))) throw new ProviderFailure("AMBIGUOUS_ACCOUNT_IDENTITY");
        foreach (var alias in aliases.Where(x => shared.Contains(x.IdentityHash)).ToList())
        { aliases.Remove(alias); db.AccountAliases.Remove(alias); }
        var seenAccountIds = new HashSet<Guid>();
        foreach (var account in accounts) account.Accessible = false;
        foreach (var source in session.Accounts)
        {
            var identity = Vault.Hash(source.Identity);
            var identities = (source.IdentityAliases ?? []).Append(source.Identity).Where(x => !string.IsNullOrWhiteSpace(x))
                .Select(Vault.Hash).Where(x => !shared.Contains(x)).ToHashSet(StringComparer.Ordinal);
            var candidates = accounts.Where(x => identities.Contains(x.IdentityHash) || aliases.Any(a => a.AccountId == x.Id && identities.Contains(a.IdentityHash))).ToList();
            if (candidates.Count > 1) throw new ProviderFailure("AMBIGUOUS_ACCOUNT_IDENTITY");
            var account = candidates.SingleOrDefault();
            if (account is null)
            {
                account = new Account { ConnectionId = connection.Id, IdentityHash = identity };
                accounts.Add(account);
                db.Accounts.Add(account);
            }
            if (!seenAccountIds.Add(account.Id)) throw new ProviderFailure("AMBIGUOUS_ACCOUNT_IDENTITY");
            if (account.Currency != "XXX" && account.Currency != source.Currency) throw new ProviderFailure("ACCOUNT_CURRENCY_CHANGED");
            foreach (var alias in identities)
            {
                if (aliases.Any(x => x.IdentityHash == alias && x.AccountId != account.Id)) throw new ProviderFailure("AMBIGUOUS_ACCOUNT_IDENTITY");
                if (aliases.Any(x => x.IdentityHash == alias)) continue;
                var row = new AccountAlias { AccountId = account.Id, ConnectionId = connection.Id, IdentityHash = alias };
                aliases.Add(row); db.AccountAliases.Add(row);
            }
            account.Name = Check.Text(source.Name, 200);
            account.Currency = Check.Currency(source.Currency);
            account.ProviderAccountId = source.Id;
            if (source.Details is not null) account.BankDetailsJson = BankDetails.Store(source.Details);
            account.Accessible = true;
            db.Jobs.Add(NewJob(account.Id, now, true));
        }
        attempt.CompletedConnectionId = connection.Id;
        attempt.PendingSession = null;
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return connection.Id;
    }
    public async Task<Guid> RecoverAuthorizedSession(AuthorizedSession recovered, CancellationToken ct)
    {
        // Operator-only repair for a successful exchange made before checkpoints existed.
        Check.That(workspace.Mode == "Live", "LIVE_RECOVERY_ONLY");
        var candidates = await db.Authorizations.Where(x => x.Provider == "enable-banking" && x.Bank == recovered.Bank && x.Country == recovered.Country
            && x.UsedAt != null && x.ExpiresAt >= recovered.CreatedAt && x.ExpiresAt.AddMinutes(-11) <= recovered.CreatedAt
            && x.CompletedConnectionId == null && x.PendingSession == null).ToListAsync(ct);
        if (candidates.Count != 1) throw new ApiFailure(409, "RECOVERY_AUTHORIZATION_AMBIGUOUS");
        // One minute of cross-system clock tolerance; still require exactly one matching consumed attempt.
        var attempt = candidates[0];
        if (attempt.UsedAt!.Value.AddMinutes(1) < recovered.CreatedAt || recovered.Session.ValidUntil <= time.GetUtcNow())
            throw new ApiFailure(409, "RECOVERY_SESSION_MISMATCH");
        var checkpoint = vault.Protect(JsonSerializer.Serialize(recovered.Session));
        var saved = await db.Authorizations.Where(x => x.Id == attempt.Id && x.PendingSession == null && x.CompletedConnectionId == null)
            .ExecuteUpdateAsync(x => x.SetProperty(a => a.PendingSession, checkpoint), ct);
        if (saved != 1) throw new ApiFailure(409, "RECOVERY_ALREADY_CLAIMED");
        return await RetryCompletion(attempt.Id, ct);
    }
    public async Task<object> Disconnect(Guid id, string version, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await DatabaseLock.AcquireTransaction(db, $"Banking:connection:{id}", ct);
        var connection = await db.Connections.FindAsync([id], ct) ?? throw new ApiFailure(404, "CONNECTION_NOT_FOUND");
        if (string.IsNullOrWhiteSpace(version)) throw new ApiFailure(428, "VERSION_REQUIRED");
        if (!connection.Version.SequenceEqual(Convert.FromBase64String(version))) throw new ApiFailure(409, "VERSION_CONFLICT");
        var now = time.GetUtcNow(); connection.Status = "Disconnected"; connection.ErrorCode = null;
        await db.Jobs.Where(x => x.Account.ConnectionId == id && (x.Status == "Queued" || x.Status == "Running"))
            .ExecuteUpdateAsync(x => x.SetProperty(j => j.Status, "Cancelled").SetProperty(j => j.CompletedAt, now).SetProperty(j => j.ErrorCode, "DISCONNECTED"), ct);
        var closed = false;
        if (connection.Session.Length > 0)
        {
            try { await providers.Get(connection.Provider).CloseSession(vault.Reveal(connection.Session), ct); closed = true; }
            catch (ProviderFailure failure) when (failure.Code == "CONSENT_EXPIRED") { closed = true; }
            catch (Exception) { connection.ErrorCode = "REMOTE_DISCONNECT_PENDING"; }
        }
        else closed = true;
        if (closed) connection.Session = "";
        await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct);
        return new { connection.Id, connection.Status, bankSessionClosed = closed, connection.ErrorCode, connection.Version };
    }
    public static SyncJob NewJob(Guid accountId, DateTimeOffset now, bool full) => new()
    {
        AccountId = accountId, CreatedAt = now, NextAttempt = now, FullHistory = full,
        From = full ? null : DateOnly.FromDateTime(now.UtcDateTime).AddDays(-30), To = DateOnly.FromDateTime(now.UtcDateTime)
    };
    public async Task Queue(Guid connectionId, CancellationToken ct)
    {
        var connection = await db.Connections.FindAsync([connectionId], ct) ?? throw new ApiFailure(404, "CONNECTION_NOT_FOUND");
        var now = time.GetUtcNow();
        if (connection.ValidUntil <= now || connection.Status != "Active") throw new ApiFailure(409, "RECONNECT_REQUIRED");
        if (connection.RetryNotBefore > now) return;
        var accounts = await db.Accounts.Where(x => x.ConnectionId == connectionId && x.Accessible).ToListAsync(ct);
        foreach (var account in accounts)
        {
            var latest = await db.Jobs.Where(x => x.AccountId == account.Id).OrderByDescending(x => x.CreatedAt).FirstOrDefaultAsync(ct);
            if (latest is { Status: "Failed" }) continue; // Requires a deliberate retry/restart, not an endless scheduler loop.
            if (await db.Jobs.AnyAsync(x => x.AccountId == account.Id && (x.Status == "Queued" || x.Status == "Running"), ct)) continue;
            // A manual request does not bypass the background quota.
            var hours = config.GetValue<double?>($"Sync:Intervals:{connection.Provider}:{connection.Country}:{connection.Bank}") ?? 6;
            Check.That(double.IsFinite(hours) && hours is >= 6 and <= 720, "INVALID_SYNC_INTERVAL");
            var cutoff = now.AddHours(-hours);
            var lastAttempt=await db.Jobs.Where(x=>x.AccountId==account.Id).MaxAsync(x=>(DateTimeOffset?)(x.LastAttemptAt ?? x.CreatedAt),ct);
            if(lastAttempt > cutoff)
            {
                if(connection.Provider == "enable-banking" && account.BankDetailsImportedAt is null)
                {
                    var enrichment=NewJob(account.Id,now,true);
                    enrichment.NextAttempt=lastAttempt.Value.AddHours(hours);
                    db.Jobs.Add(enrichment);
                }
                continue;
            }
            // One quota-respecting full pass enriches existing Live history without changing its identity.
            db.Jobs.Add(NewJob(account.Id, now, account.InitialImportCompleted is null
                || connection.Provider == "enable-banking" && account.BankDetailsImportedAt is null));
        }
        await db.SaveChangesAsync(ct);
    }
}
