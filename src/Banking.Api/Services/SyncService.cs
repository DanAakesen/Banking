using System.Data;
using System.Text.Json;
using Banking.Api.Data;
using Banking.Api.Providers;
using Banking.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace Banking.Api.Services;

public sealed class SyncService(BankingDb db, ProviderRegistry providers, Vault vault, TimeProvider clock, ILogger<SyncService> log)
{
    public async Task<bool> Tick(CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var jobId = await db.Jobs.Where(x => (x.Status == "Queued" || x.Status == "Running") && x.NextAttempt <= now)
            .OrderBy(x => x.CreatedAt).Select(x => (Guid?)x.Id).FirstOrDefaultAsync(ct);
        if (jobId is null) return false;
        var connectionId = await db.Jobs.Where(x => x.Id == jobId).Select(x => x.Account.ConnectionId).SingleAsync(ct);
        await db.Database.OpenConnectionAsync(ct);
        var locked = false;
        try
        {
            await using var command = db.Database.GetDbConnection().CreateCommand();
            command.CommandText = "DECLARE @result int; EXEC @result = sp_getapplock @Resource=@resource, @LockMode='Exclusive', @LockOwner='Session', @LockTimeout=0; SELECT @result;";
            var resource = command.CreateParameter(); resource.ParameterName = "@resource"; resource.Value = $"Banking:connection:{connectionId}";
            command.Parameters.Add(resource);
            locked = Convert.ToInt32(await command.ExecuteScalarAsync(ct)) >= 0;
            if (!locked) return false;
            var job = await db.Jobs.Include(x => x.Account).ThenInclude(x => x.Connection).SingleAsync(x => x.Id == jobId, ct);
            if (job.Status is not ("Queued" or "Running") || job.NextAttempt > now) return false;
            try
            {
                if (!job.Account.Accessible || job.Account.Connection.ValidUntil <= now || job.Account.Connection.Status != "Active")
                    throw new ProviderFailure("CONSENT_EXPIRED");
                if (job.Account.Connection.RetryNotBefore is { } notBefore && notBefore > now)
                {
                    job.NextAttempt = notBefore; await db.SaveChangesAsync(ct); return true;
                }
                var provider = providers.Get(job.Account.Connection.Provider);
                var session = vault.Reveal(job.Account.Connection.Session);
                job.Status = "Running";
                job.LastAttemptAt = now;
                await db.SaveChangesAsync(ct);
                if (job.Account.BankDetailsImportedAt is null && job.Pages == 0)
                {
                    job.Account.BankDetailsJson = BankDetails.Store(await provider.AccountDetails(session, job.Account.ProviderAccountId, ct));
                    await db.SaveChangesAsync(ct);
                }
                if (job.FetchCompleted)
                {
                    await Finish(job, await provider.Balances(session, job.Account.ProviderAccountId, ct), ct);
                    return true;
                }
                // Bounded work per tick. Cursor and staged rows commit together after each page.
                for (var pageIndex = 0; pageIndex < 8; pageIndex++)
                {
                    if (job.Pages >= 10000 || job.Items >= 100000) throw new ProviderFailure("IMPORT_REVIEW_REQUIRED");
                    var cursor = job.Cursor is null ? null : vault.Reveal(job.Cursor);
                    var page = await provider.Transactions(session, job.Account.ProviderAccountId, job.FullHistory, job.From, job.To, cursor, ct);
                    if (job.Items + page.Items.Count > 100000) throw new ProviderFailure("IMPORT_REVIEW_REQUIRED");
                    if (page.Cursor is not null && page.Cursor == cursor) throw new ProviderFailure("NON_ADVANCING_CURSOR");
                    await using (var transaction = await db.Database.BeginTransactionAsync(ct))
                    {
                        foreach (var item in page.Items)
                        {
                            Validate(item);
                            var payload=JsonSerializer.Serialize(item);
                            Check.That(payload.Length <= 16000,"SOURCE_FIELD_TOO_LONG");
                            db.ImportItems.Add(new ImportItem { JobId = job.Id, Ordinal = job.Items++, Payload = payload });
                        }
                        job.Cursor = page.Cursor is null ? null : vault.Protect(page.Cursor);
                        job.FetchCompleted = page.Cursor is null;
                        job.Pages++;
                        await db.SaveChangesAsync(ct);
                        await transaction.CommitAsync(ct);
                    }
                    if (page.Cursor is null)
                    {
                        var balances = await provider.Balances(session, job.Account.ProviderAccountId, ct);
                        await Finish(job, balances, ct);
                        log.LogInformation("import_completed job={JobId} pages={Pages} items={Items}", job.Id, job.Pages, job.Items);
                        return true;
                    }
                }
                job.NextAttempt = clock.GetUtcNow().AddSeconds(1);
                await db.SaveChangesAsync(ct);
                return true;
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
            catch (Exception error)
            {
                // Discard uncommitted entity changes before recording sanitized failure state.
                db.ChangeTracker.Clear();
                job = await db.Jobs.Include(x => x.Account).ThenInclude(x => x.Connection).SingleAsync(x => x.Id == jobId, ct);
                if (job.Status is not ("Running" or "Queued")) return true;
                var code = error switch { ProviderFailure failure => failure.Code, ApiFailure failure => failure.Code, _ => "SYNC_FAILED" };
                var retry = error switch { ProviderFailure providerError => providerError.RetryAfter, ApiFailure => null, _ => (TimeSpan?)TimeSpan.FromMinutes(15) };
                if (!job.Account.Connection.IsDemo && retry is { } shortDelay && shortDelay < TimeSpan.FromHours(6)) retry = TimeSpan.FromHours(6);
                job.Attempts++;
                job.ErrorCode = code;
                job.Account.Connection.ErrorCode = code;
                if (code == "CONSENT_EXPIRED") job.Account.Connection.Status = "ReconnectRequired";
                if (code == "RATE_LIMITED") job.Account.Connection.RetryNotBefore = clock.GetUtcNow() + (retry ?? TimeSpan.FromHours(6));
                if (retry is not null && job.Attempts < 5)
                {
                    job.Status = "Queued";
                    job.NextAttempt = clock.GetUtcNow() + retry.Value;
                }
                else { job.Status = "Failed"; job.CompletedAt = clock.GetUtcNow(); }
                await db.SaveChangesAsync(ct);
                log.LogWarning("import_failed job={JobId} code={Code}", job.Id, code);
                return true;
            }
        }
        finally
        {
            if (locked)
            {
                await using var release = db.Database.GetDbConnection().CreateCommand();
                release.CommandText = "EXEC sp_releaseapplock @Resource=@resource, @LockOwner='Session'";
                var resource = release.CreateParameter(); resource.ParameterName = "@resource"; resource.Value = $"Banking:connection:{connectionId}";
                release.Parameters.Add(resource);
                await release.ExecuteNonQueryAsync(CancellationToken.None);
            }
            await db.Database.CloseConnectionAsync();
        }
    }

    private async Task Finish(SyncJob job, IReadOnlyList<SourceBalance> balances, CancellationToken ct)
    {
        var items = await db.ImportItems.Where(x => x.JobId == job.Id).OrderBy(x => x.Ordinal).ToListAsync(ct);
        var sources = items.Select(x => JsonSerializer.Deserialize<SourceTransaction>(x.Payload)!).ToList();
        if (sources.Where(x => !string.IsNullOrEmpty(x.Reference)).GroupBy(x => x.Reference).Any(x => x.Count() > 1))
            throw new ProviderFailure("AMBIGUOUS_ENTRY_REFERENCE");
        var now = clock.GetUtcNow();
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        var existing = await db.Transactions.Where(x => x.AccountId == job.AccountId).ToListAsync(ct);
        var byKey = existing.ToDictionary(x => x.SourceKey);
        var occurrences = new Dictionary<string, int>();
        var rules = await db.Rules.Where(x => x.Active).OrderByDescending(x => x.Priority).ThenBy(x => x.Id).ToListAsync(ct);
        // A vanished booked entry with no stable reference may be a correction. Never silently add its replacement and count both.
        var availableDates = sources.Where(x => x.BookingDate is not null).Select(x => x.BookingDate!.Value).ToList();
        var lowerBound = job.From ?? (availableDates.Count > 0 ? availableDates.Min() : (DateOnly?)null);
        var expectedKeys = new HashSet<string>(StringComparer.Ordinal);
        var counted = new Dictionary<string, int>();
        foreach (var source in sources.Where(x => string.IsNullOrEmpty(x.Reference)))
        {
            var fingerprint = BankDetails.Fingerprint(source);
            var occurrence = counted.GetValueOrDefault(fingerprint) + 1; counted[fingerprint] = occurrence;
            expectedKeys.Add($"F:{fingerprint}:{occurrence}");
        }
        if (existing.Any(x => x.Current && x.Status == "BOOK" && x.SourceKey.StartsWith("F:", StringComparison.Ordinal)
            && x.BookingDate >= lowerBound && x.BookingDate <= job.To && !expectedKeys.Contains(x.SourceKey)))
            throw new ProviderFailure("RECONCILIATION_REQUIRED");
        foreach (var pending in existing.Where(x => x.Status != "BOOK")) pending.Current = false;
        foreach (var source in sources)
        {
            string key;
            if (!string.IsNullOrEmpty(source.Reference)) key = "R:" + Vault.Hash(source.Reference);
            else
            {
                var fingerprint = BankDetails.Fingerprint(source);
                var ordinal = occurrences.GetValueOrDefault(fingerprint) + 1;
                occurrences[fingerprint] = ordinal;
                key = $"F:{fingerprint}:{ordinal}";
            }
            if (!byKey.TryGetValue(key, out var row))
            {
                row = new BankTransaction { AccountId = job.AccountId, SourceKey = key };
                db.Transactions.Add(row); byKey[key] = row;
            }
            row.EntryReference = source.Reference;
            row.Amount = source.Amount; row.Currency = source.Currency;
            row.BookingDate = source.BookingDate; row.ValueDate = source.ValueDate;
            row.Description = job.Account.Connection.Provider == "product-demo"
                ? ProductDemoProvider.DisplayName(source.Description) : source.Description;
            row.Status = source.Status;
            // Providers without a metadata object do not erase an earlier observation.
            if (source.Details is not null) row.BankDetailsJson = BankDetails.Store(source.Details);
            row.Current = true; row.ObservedAt = now;
            if (row.Classification != "Manual") FinanceService.ApplyRule(row, rules);
        }
        foreach (var balance in balances)
        {
            Check.Money(balance.Amount); Check.Currency(balance.Currency); Check.Text(balance.Type, 40);
            db.Balances.Add(new BalanceSnapshot { AccountId = job.AccountId, JobId = job.Id, Amount = balance.Amount,
                Currency = balance.Currency, Type = balance.Type, BankTime = balance.BankTime, ObservedAt = now });
        }
        job.Status = "Completed"; job.CompletedAt = now; job.ErrorCode = null;
        job.Account.LastSuccess = now;
        if (job.FullHistory)
        {
            job.Account.InitialImportCompleted = now;
            job.Account.BankDetailsImportedAt = now;
        }
        var dates = byKey.Values.Where(x => x.BookingDate is not null).Select(x => x.BookingDate!.Value).ToList();
        job.Account.EarliestTransaction = dates.Count > 0 ? dates.Min() : null;
        var siblingDates = await db.Accounts.Where(x => x.ConnectionId == job.Account.ConnectionId && x.Accessible && x.Id != job.AccountId)
            .Select(x => x.LastSuccess).ToListAsync(ct);
        if (siblingDates.All(x => x is not null))
        {
            job.Account.Connection.LastSuccess = siblingDates.Count == 0 ? now : siblingDates.Min();
            job.Account.Connection.ErrorCode = null;
        }
        db.ImportItems.RemoveRange(items);
        await db.SaveChangesAsync(ct);
        // A bank correction must not leave an obsolete transfer exclusion in reports.
        var invalidMatches = await (from match in db.Transfers
            join outgoing in db.Transactions on match.OutgoingId equals outgoing.Id
            join incoming in db.Transactions on match.IncomingId equals incoming.Id
            where (outgoing.AccountId == job.AccountId || incoming.AccountId == job.AccountId)
                && (!outgoing.Current || !incoming.Current || outgoing.Status != "BOOK" || incoming.Status != "BOOK"
                    || outgoing.Currency != incoming.Currency || outgoing.Amount >= 0 || outgoing.Amount != -incoming.Amount)
            select match).ToListAsync(ct);
        db.Transfers.RemoveRange(invalidMatches);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
    }
    private static void Validate(SourceTransaction item)
    {
        Check.Money(item.Amount); Check.Currency(item.Currency);
        Check.That(item.Description.Length <= 2000 && (item.Reference?.Length ?? 0) <= 2000, "SOURCE_FIELD_TOO_LONG");
        Check.That(item.Status is "BOOK" or "PDNG" or "CNCL" or "HOLD" or "OTHR" or "RJCT" or "SCHD", "INVALID_SOURCE_STATUS");
        BankDetails.Store(item.Details);
        if (item.Details?.BalanceAfter is { } amount) Check.Money(amount);
        if (item.Details?.BalanceCurrency is { } currency) Check.Currency(currency);
    }
}

public sealed class SyncWorker(IServiceScopeFactory scopes, IConfiguration config, WorkspaceCatalog catalog, TimeProvider clock, ILogger<SyncWorker> log, IHostEnvironment environment) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (config.GetValue<bool>("Local:DisableWorker")) return;
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(Math.Clamp(config.GetValue<int?>("Sync:PollSeconds") ?? 2, 2, 300)));
        while (!stoppingToken.IsCancellationRequested)
        {
            foreach (var mode in catalog.Modes)
            {
                try
                {
                    using var scope = scopes.CreateScope();
                    scope.ServiceProvider.GetRequiredService<Workspace>().Select(mode);
                    var db = scope.ServiceProvider.GetRequiredService<BankingDb>();
                    var now = clock.GetUtcNow();
                    await db.Connections.Where(x => x.Status == "Active" && x.ValidUntil <= now)
                        .ExecuteUpdateAsync(x => x.SetProperty(c => c.Status, "ReconnectRequired"), stoppingToken);
                    var connections = await db.Connections.Where(x => x.Status == "Active" && x.ValidUntil > now).Select(x => x.Id).ToListAsync(stoppingToken);
                    var service = scope.ServiceProvider.GetRequiredService<ConnectionService>();
                    foreach (var connection in connections)
                    {
                        try { await service.Queue(connection, stoppingToken); }
                        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { throw; }
                        catch (Exception) { log.LogWarning("scheduling_failed connection={ConnectionId}", connection); }
                        db.ChangeTracker.Clear();
                    }
                    // Refresh entities after scheduling; a concurrent callback may have replaced the session.
                    await scope.ServiceProvider.GetRequiredService<SyncService>().Tick(stoppingToken);
                    if (CloudHosting.Enabled(environment) && mode == "Live")
                    {
                        // Private operator health snapshot: no names, identifiers, amounts or bank payloads.
                        var successes = await db.Accounts.Where(x => x.Accessible).Select(x => x.LastSuccess).ToListAsync(stoppingToken);
                        var jobs = await db.Jobs.Where(x => x.Status == "Queued" || x.Status == "Running" || x.Status == "Failed")
                            .Select(x => new { x.Status, x.NextAttempt, x.ErrorCode }).ToListAsync(stoppingToken);
                        var state = new { checkedAt = clock.GetUtcNow(), activeConnections = connections.Count,
                            allAccountsSynced = successes.Count > 0 && successes.All(x => x != null),
                            oldestAccountSync = successes.Count > 0 ? successes.Min() : null,
                            latestAccountSync = successes.Count > 0 ? successes.Max() : null, jobs };
                        var directory = config["Cloud:StateDirectory"] ?? "/home/Banking";
                        Directory.CreateDirectory(directory);
                        var path = Path.Combine(directory,"sync-health.json");
                        await File.WriteAllTextAsync(path+".tmp",JsonSerializer.Serialize(state),stoppingToken);
                        File.Move(path+".tmp",path,true);
                    }
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
                catch (Exception) { log.LogWarning("worker_iteration_failed mode={Mode}", mode); }
            }
            if (!await timer.WaitForNextTickAsync(stoppingToken)) break;
        }
    }
}
