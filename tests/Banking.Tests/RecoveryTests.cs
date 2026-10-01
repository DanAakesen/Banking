using System.Net;
using System.Net.Http.Json;
using Banking.Api.Data;
using Banking.Api.Security;
using Banking.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static Banking.Tests.BackendTests;

namespace Banking.Tests;

public sealed class RecoveryTests
{
    [Fact]
    public async Task Operator_recovery_requires_one_consumed_bank_attempt_and_tolerates_small_clock_difference()
    {
        var provider = new FaultProvider { ProviderName = "enable-banking" };
        await using var app = new BackendFactory(provider: provider, secondWorkspace: true); using var client = app.AuthClient();
        try
        {
            await app.InScope(async s =>
            {
                var db = s.GetRequiredService<BankingDb>(); var now = DateTimeOffset.UtcNow;
                var session = await provider.Complete("demo-dkk", default);
                var recovered = new Banking.Api.Providers.AuthorizedSession("Demo Bank", "DK", now.AddSeconds(-2), session);
                var service = s.GetRequiredService<ConnectionService>();
                await Assert.ThrowsAsync<ApiFailure>(() => service.RecoverAuthorizedSession(recovered, default));
                db.Authorizations.Add(new AuthorizationAttempt { StateHash = Vault.Hash("synthetic-recovery-1"), Provider = provider.Name,
                    Bank = "Demo Bank", Country = "DK", ExpiresAt = now.AddMinutes(10) });
                await db.SaveChangesAsync();
                await Assert.ThrowsAsync<ApiFailure>(() => service.RecoverAuthorizedSession(recovered, default));
                (await db.Authorizations.SingleAsync()).UsedAt = now;
                await db.SaveChangesAsync();
                await Assert.ThrowsAsync<ApiFailure>(() => service.RecoverAuthorizedSession(recovered with { Country = "SE" }, default));
                var duplicate = new AuthorizationAttempt { StateHash = Vault.Hash("synthetic-recovery-2"), Provider = provider.Name,
                    Bank = "Demo Bank", Country = "DK", ExpiresAt = now.AddMinutes(10), UsedAt = now };
                db.Authorizations.Add(duplicate); await db.SaveChangesAsync();
                await Assert.ThrowsAsync<ApiFailure>(() => service.RecoverAuthorizedSession(recovered, default));
                db.Authorizations.Remove(duplicate); await db.SaveChangesAsync();
                var id = await service.RecoverAuthorizedSession(recovered, default);
                Assert.Equal(id, (await db.Connections.SingleAsync()).Id); Assert.Equal(2, await db.Accounts.CountAsync());
            }, "Live");
        }
        finally { await app.Cleanup(); }
    }
    [Fact]
    public async Task Shared_alternative_hash_does_not_merge_distinct_accounts_and_reconnect_preserves_history()
    {
        var provider = new FaultProvider { SharedAccountAlias = true };
        await using var app = new BackendFactory(provider: provider); using var client = app.AuthClient();
        try
        {
            var connection = await Connect(client); await app.Tick(); await app.Tick();
            var before = (await Read(await client.GetAsync("/api/accounts"))).EnumerateArray().Select(x => x.GetProperty("id").GetGuid()).Order().ToList();
            Assert.Equal(2, before.Count);
            var transactions = (await Read(await client.GetAsync("/api/transactions"))).GetProperty("total").GetInt32();
            provider.RotateAccountIdentity = true;
            Assert.Equal(connection, await Connect(client, reconnect: connection)); await app.Tick(); await app.Tick();
            Assert.Equal(before, (await Read(await client.GetAsync("/api/accounts"))).EnumerateArray().Select(x => x.GetProperty("id").GetGuid()).Order().ToList());
            Assert.Equal(transactions, (await Read(await client.GetAsync("/api/transactions"))).GetProperty("total").GetInt32());
            await app.InScope(async s => Assert.False(await s.GetRequiredService<BankingDb>().AccountAliases
                .AnyAsync(x => x.IdentityHash == Vault.Hash("synthetic-shared-nonidentifying-alias"))));
        }
        finally { await app.Cleanup(); }
    }

    [Fact]
    public async Task Conflicting_primary_alias_is_rejected_and_successful_exchange_remains_encrypted_for_retry()
    {
        var provider = new FaultProvider { ConflictingPrimaryAlias = true };
        await using var app = new BackendFactory(provider: provider); using var client = app.AuthClient();
        try
        {
            var auth = await Read(await client.PostAsJsonAsync("/api/connections/authorize", new { provider = "simulator", bank = "Demo Bank", country = "DK" }));
            var callback = new Uri(auth.GetProperty("authorizationUrl").GetString()!);
            Assert.Equal(HttpStatusCode.BadGateway, (await client.GetAsync(callback.PathAndQuery)).StatusCode);
            var attempts = await Read(await client.GetAsync("/api/authorizations/recoverable"));
            var attemptId = attempts[0].GetProperty("id").GetGuid();
            Assert.Equal(HttpStatusCode.BadGateway, (await client.PostAsync($"/api/authorizations/{attemptId}/retry", null)).StatusCode);
            Assert.Equal(1, provider.Exchanges);
            Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync(callback.PathAndQuery)).StatusCode);
            await app.InScope(async s =>
            {
                var db = s.GetRequiredService<BankingDb>(); var attempt = await db.Authorizations.SingleAsync();
                Assert.NotNull(attempt.PendingSession); Assert.DoesNotContain("Demo", attempt.PendingSession);
                Assert.Empty(await db.Accounts.ToListAsync()); Assert.Empty(await db.Connections.ToListAsync());
                // Model a corrected, durably saved provider result after the original local failure.
                var vault = s.GetRequiredService<Vault>();
                var session = System.Text.Json.JsonSerializer.Deserialize<Banking.Api.Providers.BankSession>(vault.Reveal(attempt.PendingSession))!;
                attempt.PendingSession = vault.Protect(System.Text.Json.JsonSerializer.Serialize(session with {
                    Accounts = session.Accounts.Select(x => x with { IdentityAliases = [] }).ToList() }));
                await db.SaveChangesAsync();
            });
            var first = await Read(await client.PostAsync($"/api/authorizations/{attemptId}/retry", null));
            var second = await Read(await client.PostAsync($"/api/authorizations/{attemptId}/retry", null));
            Assert.Equal(first.GetProperty("connectionId").GetGuid(), second.GetProperty("connectionId").GetGuid());
            Assert.Equal(1, provider.Exchanges);
            await app.InScope(async s =>
            {
                var db = s.GetRequiredService<BankingDb>(); Assert.Null((await db.Authorizations.SingleAsync()).PendingSession);
                Assert.Equal(2, await db.Jobs.CountAsync());
            });
        }
        finally { await app.Cleanup(); }
    }

    [Fact]
    public async Task Authorization_leaves_margin_below_bank_consent_limit_and_tests_exclude_live_settings()
    {
        var provider = new FaultProvider(); await using var app = new BackendFactory(provider: provider); using var client = app.AuthClient();
        try
        {
            Assert.False(app.Services.GetRequiredService<WorkspaceCatalog>().LiveEnabled);
            var before = DateTimeOffset.UtcNow;
            await Connect(client);
            var after = DateTimeOffset.UtcNow;
            Assert.InRange(provider.RequestedConsentUntil, before.AddDays(180).AddMinutes(-5).AddSeconds(-1), after.AddDays(180).AddMinutes(-5));
            Assert.Equal(0, provider.RequestedConsentUntil.Ticks % TimeSpan.TicksPerSecond);
        }
        finally { await app.Cleanup(); }
    }
    [Fact]
    public async Task Attached_database_keeps_both_data_and_transaction_log_in_protected_storage()
    {
        await using var app = new BackendFactory(attachedDatabase: true); using var client = app.AuthClient();
        try
        {
            await app.InScope(async s =>
            {
                var db = s.GetRequiredService<BankingDb>(); await db.Database.OpenConnectionAsync();
                await using var command = db.Database.GetDbConnection().CreateCommand(); command.CommandText = "SELECT physical_name FROM sys.database_files";
                await using var reader = await command.ExecuteReaderAsync(); var count = 0;
                var root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Banking", "data") + Path.DirectorySeparatorChar;
                while (await reader.ReadAsync()) { Assert.StartsWith(root, reader.GetString(0), StringComparison.OrdinalIgnoreCase); count++; }
                Assert.True(count >= 2);
            });
        }
        finally { await app.Cleanup(); }
    }
    [Fact]
    public async Task Alternate_bank_identity_retains_accounts_and_manual_categories()
    {
        var provider = new FaultProvider(); await using var app = new BackendFactory(provider: provider); using var client = app.AuthClient();
        try
        {
            var connection = await Connect(client); await app.Tick(); await app.Tick();
            var before = (await Read(await client.GetAsync("/api/accounts"))).EnumerateArray().Select(x => x.GetProperty("id").GetGuid()).Order().ToList();
            var row = (await Read(await client.GetAsync("/api/transactions?search=grocery"))).GetProperty("items")[0];
            var category = await Read(await client.PostAsJsonAsync("/api/categories", new { name = "Identity test" }));
            var catId = category.GetProperty("id").GetGuid();
            await Read(await client.PutAsJsonAsync($"/api/transactions/{row.GetProperty("id")}/category", new { categoryId = catId, version = row.GetProperty("version").GetString() }));
            provider.RotateAccountIdentity = true;
            await Connect(client, reconnect: connection); await app.Tick(); await app.Tick();
            var after = (await Read(await client.GetAsync("/api/accounts"))).EnumerateArray().Select(x => x.GetProperty("id").GetGuid()).Order().ToList();
            Assert.Equal(before, after); Assert.Equal(1, (await Read(await client.GetAsync($"/api/transactions?categoryId={catId}"))).GetProperty("total").GetInt32());
        }
        finally { await app.Cleanup(); }
    }

    [Fact]
    public async Task Finance_edit_lifecycle_and_large_rule_batches_preserve_manual_choices()
    {
        await using var app = new BackendFactory(); using var client = app.AuthClient();
        try
        {
            await Connect(client); await app.Tick(); await app.Tick();
            var category = await Read(await client.PostAsJsonAsync("/api/categories", new { name = "Batch" }));
            var catId = category.GetProperty("id").GetGuid();
            var renamed = await Read(await client.PutAsJsonAsync($"/api/categories/{catId}", new { name = "Batch renamed", version = category.GetProperty("version").GetString() }));
            Assert.Equal("Batch renamed", renamed.GetProperty("name").GetString());
            var rule = await Read(await client.PostAsJsonAsync("/api/rules", new { contains = "Batch fixture", categoryId = catId }));
            await app.InScope(async s =>
            {
                var db = s.GetRequiredService<BankingDb>(); var account = await db.Accounts.FirstAsync();
                for (var n = 0; n < 610; n++) db.Transactions.Add(new BankTransaction { AccountId = account.Id, SourceKey = "batch-" + n,
                    Amount = -1.2345m, Currency = "DKK", BookingDate = DateOnly.FromDateTime(DateTime.UtcNow), Description = "Batch fixture", Classification = n == 0 ? "Manual" : "Unclassified" });
                await db.SaveChangesAsync();
            });
            Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsync("/api/rules/apply", null)).StatusCode);
            Assert.Equal(609, (await Read(await client.GetAsync($"/api/transactions?categoryId={catId}"))).GetProperty("total").GetInt32());
            Assert.Equal(HttpStatusCode.Conflict, (await client.DeleteAsync($"/api/categories/{catId}?version={Uri.EscapeDataString(renamed.GetProperty("version").GetString()!)}")).StatusCode);
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var budget = await Read(await client.PostAsJsonAsync("/api/budgets", new { categoryId = catId, from = today, to = today, currency = "DKK", limit = 1000m }));
            Assert.Equal(751.8105m, (await Read(await client.GetAsync($"/api/budgets/{budget.GetProperty("id")}/status"))).GetProperty("spent").GetDecimal());
            var updated = await Read(await client.PutAsJsonAsync($"/api/budgets/{budget.GetProperty("id")}", new { categoryId = catId, from = today, to = today, currency = "DKK", limit = 1500m, version = budget.GetProperty("version").GetString() }));
            Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/budgets/{budget.GetProperty("id")}?version={Uri.EscapeDataString(updated.GetProperty("version").GetString()!)}")).StatusCode);
            Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/rules/{rule.GetProperty("id")}?version={Uri.EscapeDataString(rule.GetProperty("version").GetString()!)}")).StatusCode);
        }
        finally { await app.Cleanup(); }
    }

    [Fact]
    public async Task Concurrent_import_is_excluded_while_connection_operation_owns_the_lock()
    {
        var provider = new FaultProvider(); await using var app = new BackendFactory(provider: provider); using var client = app.AuthClient();
        try
        {
            var id = await Connect(client);
            await app.InScope(async s =>
            {
                var db = s.GetRequiredService<BankingDb>(); await using var transaction = await db.Database.BeginTransactionAsync();
                await DatabaseLock.AcquireTransaction(db, $"Banking:connection:{id}", default);
                await app.Tick(); Assert.Equal(0, provider.Calls);
                await transaction.RollbackAsync();
            });
            await app.Tick(); Assert.True(provider.Calls > 0);
        }
        finally { await app.Cleanup(); }
    }
    [Fact]
    public async Task Reconnect_cancels_old_waiting_jobs_and_disconnect_keeps_imported_history()
    {
        await using var app = new BackendFactory(); using var client = app.AuthClient();
        try
        {
            var id = await Connect(client);
            await app.InScope(async s =>
            {
                var db = s.GetRequiredService<BankingDb>();
                await db.Connections.ExecuteUpdateAsync(x => x.SetProperty(c => c.ValidUntil, DateTimeOffset.UtcNow.AddHours(-1)));
                await db.Jobs.ExecuteUpdateAsync(x => x.SetProperty(j => j.NextAttempt, DateTimeOffset.UtcNow.AddHours(6)));
            });
            Assert.Equal(id, await Connect(client, reconnect: id)); await app.Tick(); await app.Tick();
            await app.InScope(async s =>
            {
                var db = s.GetRequiredService<BankingDb>(); Assert.Equal(2, await db.Jobs.CountAsync(x => x.Status == "Cancelled"));
                Assert.Equal(2, await db.Jobs.CountAsync(x => x.Status == "Completed"));
            });
            var connection = (await Read(await client.GetAsync("/api/connections")))[0];
            var disconnected = await Read(await client.PostAsJsonAsync($"/api/connections/{id}/disconnect", new { version = connection.GetProperty("version").GetString() }));
            Assert.True(disconnected.GetProperty("bankSessionClosed").GetBoolean()); Assert.Equal("Disconnected", disconnected.GetProperty("status").GetString());
            Assert.Equal(9, (await Read(await client.GetAsync("/api/transactions"))).GetProperty("total").GetInt32());
            Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsync($"/api/connections/{id}/sync", null)).StatusCode);
        }
        finally { await app.Cleanup(); }
    }

    [Fact]
    public async Task Cancelled_authorization_consumes_state_without_creating_a_connection()
    {
        await using var app = new BackendFactory(); using var client = app.AuthClient();
        try
        {
            var start = await Read(await client.PostAsJsonAsync("/api/connections/authorize", new { provider = "simulator", bank = "Demo Bank", country = "DK" }));
            var callback = new Uri(start.GetProperty("authorizationUrl").GetString()!);
            var cancelled = callback.PathAndQuery.Replace("code=demo-dkk", "error=access_denied&error_description=private-marker", StringComparison.Ordinal);
            var response = await Read(await client.GetAsync(cancelled)); Assert.Equal("authorization_cancelled", response.GetProperty("status").GetString());
            Assert.DoesNotContain("private-marker", response.GetRawText());
            Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync(callback.PathAndQuery)).StatusCode);
            Assert.Empty((await Read(await client.GetAsync("/api/connections"))).EnumerateArray());
        }
        finally { await app.Cleanup(); }
    }

    [Fact]
    public async Task Unlinked_account_is_actionable_without_publishing_empty_bank_data()
    {
        await using var app = new BackendFactory(provider: new FaultProvider { NoAccounts = true }); using var client = app.AuthClient();
        try
        {
            var start = await Read(await client.PostAsJsonAsync("/api/connections/authorize", new { provider = "simulator", bank = "Demo Bank", country = "DK" }));
            var response = await client.GetAsync(new Uri(start.GetProperty("authorizationUrl").GetString()!).PathAndQuery);
            Assert.Equal(HttpStatusCode.BadGateway, response.StatusCode); Assert.Contains("NO_LINKED_ACCOUNTS", await response.Content.ReadAsStringAsync());
            Assert.Empty((await Read(await client.GetAsync("/api/connections"))).EnumerateArray());
        }
        finally { await app.Cleanup(); }
    }

    [Fact]
    public async Task Changed_reference_less_bookings_require_review_and_do_not_double_count()
    {
        var provider = new FaultProvider(); await using var app = new BackendFactory(provider: provider); using var client = app.AuthClient();
        try
        {
            await Connect(client); await app.Tick(); await app.Tick();
            var coffee = (await Read(await client.GetAsync("/api/transactions?search=coffee"))).GetProperty("items")[0];
            provider.RewriteCoffee = true; await Resync(app, coffee.GetProperty("accountId").GetGuid());
            var jobs = (await Read(await client.GetAsync("/api/jobs"))).EnumerateArray().ToList();
            var failed = Assert.Single(jobs, x => x.GetProperty("status").GetString() == "Failed");
            Assert.Equal("RECONCILIATION_REQUIRED", failed.GetProperty("errorCode").GetString());
            var rows = (await Read(await client.GetAsync("/api/transactions?search=coffee"))).GetProperty("items").EnumerateArray().ToList();
            Assert.Equal(2, rows.Count); Assert.All(rows, row => Assert.Equal(-25m, row.GetProperty("amount").GetDecimal()));
            // Explicit restart fetches a new snapshot; it cannot silently bypass reconciliation protections.
            provider.RewriteCoffee = false;
            var restart = await Read(await client.PostAsJsonAsync($"/api/jobs/{failed.GetProperty("id")}/retry", new { version = failed.GetProperty("version").GetString(), restart = true }));
            Assert.NotEqual(failed.GetProperty("id").GetGuid(), restart.GetProperty("id").GetGuid()); await app.Tick();
            Assert.Equal(9, (await Read(await client.GetAsync("/api/transactions"))).GetProperty("total").GetInt32());
        }
        finally { await app.Cleanup(); }
    }

    [Fact]
    public async Task Portable_recovery_works_with_a_different_key_ring_and_requires_reconnection()
    {
        await using var source = new BackendFactory(freshProtection: true); using var client = source.AuthClient();
        await using var target = new BackendFactory("Banking_Restore_" + Guid.NewGuid().ToString("N"), freshProtection: true); using var restoredClient = target.AuthClient();
        var file = Path.Combine(Path.GetTempPath(), "Banking-portable-" + Guid.NewGuid().ToString("N") + ".banking");
        const string password = "Synthetic passphrase used only in automated tests";
        try
        {
            await Connect(client); await source.Tick(); await source.Tick();
            var category = await Read(await client.PostAsJsonAsync("/api/categories", new { name = "Portable category" }));
            await source.InScope(s => s.GetRequiredService<BackupService>().Export(file, default, password));
            Assert.DoesNotContain("Portable category", await File.ReadAllTextAsync(file));
            await Assert.ThrowsAsync<ApiFailure>(() => target.InScope(s => s.GetRequiredService<BackupService>().Restore(file, default, "Wrong passphrase for synthetic test")));
            await target.InScope(s => s.GetRequiredService<BackupService>().Restore(file, default, password));
            Assert.Equal(9, (await Read(await restoredClient.GetAsync("/api/transactions"))).GetProperty("total").GetInt32());
            Assert.Equal(category.GetProperty("id").GetGuid(), (await Read(await restoredClient.GetAsync("/api/categories")))[0].GetProperty("id").GetGuid());
            await target.InScope(async s =>
            {
                var db = s.GetRequiredService<BankingDb>(); Assert.All(await db.Connections.ToListAsync(), x => { Assert.Empty(x.Session); Assert.Equal("ReconnectRequired", x.Status); });
                Assert.All(await db.Accounts.ToListAsync(), x => { Assert.False(x.Accessible); Assert.Empty(x.ProviderAccountId); });
                Assert.Empty(await db.Authorizations.ToListAsync());
            });
            // Exporting must not have disconnected or mutated the source database.
            Assert.Equal("Active", (await Read(await client.GetAsync("/api/connections")))[0].GetProperty("status").GetString());
        }
        finally { File.Delete(file); await target.Cleanup(); await source.Cleanup(); }
    }

    [Fact]
    public void Portable_archive_detects_tampering_and_uses_randomized_encryption()
    {
        const string password = "Synthetic portable archive passphrase";
        var first = PortableArchive.Encrypt("synthetic-value", password);
        var second = PortableArchive.Encrypt("synthetic-value", password); Assert.NotEqual(first, second);
        var envelope = System.Text.Json.Nodes.JsonNode.Parse(first)!;
        var ciphertext = Convert.FromBase64String(envelope["Ciphertext"]!.GetValue<string>()); ciphertext[0] ^= 1;
        envelope["Ciphertext"] = Convert.ToBase64String(ciphertext);
        Assert.Throws<ApiFailure>(() => PortableArchive.Decrypt(envelope.ToJsonString(), password));
    }
}
