using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Banking.Api.Data;
using Banking.Api.Providers;
using Banking.Api.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Banking.Tests;

public sealed class BackendFactory(string? database = null, FaultProvider? provider = null, string environment = "Testing", bool secondWorkspace = false, bool freshProtection = false, bool attachedDatabase = false) : WebApplicationFactory<Program>
{
    public string Database { get; } = database ?? "Banking_Test_" + Guid.NewGuid().ToString("N");
    public string SecondDatabase { get; } = "Banking_Test_" + Guid.NewGuid().ToString("N");
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        var connectionString = new Microsoft.Data.SqlClient.SqlConnectionStringBuilder { DataSource = "(localdb)\\Banking", InitialCatalog = Database, IntegratedSecurity = true, TrustServerCertificate = true };
        if (attachedDatabase) connectionString.AttachDBFilename = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Banking", "data", Database + ".mdf");
        builder.UseEnvironment(environment);
        builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:Banking"] = connectionString.ConnectionString,
            ["Local:Token"] = "synthetic-test-token", ["Local:DisableWorker"] = "true", ["EnableBanking:Enabled"] = "false"
            , ["Testing:SecondWorkspace"] = secondWorkspace.ToString(),
            ["ConnectionStrings:BankingLive"] = $"Server=(localdb)\\Banking;Database={SecondDatabase};Integrated Security=true;TrustServerCertificate=true"
        }));
        if (provider is not null) builder.ConfigureServices(s => { s.RemoveAll<IBankProvider>(); s.AddSingleton<IBankProvider>(provider); });
        if (freshProtection) builder.ConfigureServices(s => { s.RemoveAll<Microsoft.AspNetCore.DataProtection.IDataProtectionProvider>();
            s.AddSingleton<Microsoft.AspNetCore.DataProtection.IDataProtectionProvider>(new Microsoft.AspNetCore.DataProtection.EphemeralDataProtectionProvider()); });
    }
    public HttpClient AuthClient()
    {
        var client = CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("http://localhost"), AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "synthetic-test-token");
        return client;
    }
    public async Task InScope(Func<IServiceProvider, Task> action, string mode = "Demo")
    { using var scope = Services.CreateScope(); scope.ServiceProvider.GetRequiredService<Banking.Api.Security.Workspace>().Select(mode); await action(scope.ServiceProvider); }
    public async Task Tick() => await InScope(async s => { await s.GetRequiredService<SyncService>().Tick(default); });
    public async Task Cleanup()
    {
        // Only the GUID-named disposable database created by this fixture can be removed.
        Assert.True((Database.StartsWith("Banking_Test_", StringComparison.Ordinal) || Database.StartsWith("Banking_Restore_", StringComparison.Ordinal))
            && Guid.TryParseExact(Database[(Database.LastIndexOf('_') + 1)..], "N", out _));
        await InScope(async s => await s.GetRequiredService<BankingDb>().Database.EnsureDeletedAsync());
        if (secondWorkspace)
        {
            Assert.True(SecondDatabase.StartsWith("Banking_Test_", StringComparison.Ordinal) && Guid.TryParseExact(SecondDatabase[13..], "N", out _));
            await InScope(async s => await s.GetRequiredService<BankingDb>().Database.EnsureDeletedAsync(), "Live");
        }
    }
}

public sealed class FaultProvider : IBankProvider
{
    private readonly SimulatorProvider inner = new();
    public string? ProviderName { get; set; }
    public string Name => ProviderName ?? inner.Name;
    public bool IsDemo => true;
    public bool FailBalanceOnce { get; set; }
    public bool FailPageOnce { get; set; }
    public bool BookReservation { get; set; }
    public bool RewriteCoffee { get; set; }
    public bool EnrichDetails { get; set; }
    public bool NoAccounts { get; set; }
    public bool RotateAccountIdentity { get; set; }
    public bool SharedAccountAlias { get; set; }
    public bool ConflictingPrimaryAlias { get; set; }
    public int Exchanges { get; private set; }
    public int Calls { get; private set; }
    public DateTimeOffset RequestedConsentUntil { get; private set; }
    public Task<IReadOnlyList<BankInfo>> Banks(CancellationToken ct) => inner.Banks(ct);
    public Task<string> Authorize(string b, string c, string s, Uri r, DateTimeOffset u, CancellationToken ct)
    { RequestedConsentUntil = u; return inner.Authorize(b, c, s, r, u, ct); }
    public async Task<BankSession> Complete(string code, CancellationToken ct)
    {
        Exchanges++;
        var session = await inner.Complete(code, ct);
        if (NoAccounts) return session with { Accounts = [] };
        if (ConflictingPrimaryAlias) return session with { Accounts = session.Accounts.Select(x => x with { IdentityAliases = [session.Accounts[0].Identity] }).ToList() };
        if (RotateAccountIdentity) session = session with { Accounts = session.Accounts.Select(x => x with { Identity = x.Identity + "-alternate", IdentityAliases = [x.Identity] }).ToList() };
        if (SharedAccountAlias) session = session with { Accounts = session.Accounts.Select(x => x with { IdentityAliases = (x.IdentityAliases ?? []).Append("synthetic-shared-nonidentifying-alias").ToList() }).ToList() };
        return session;
    }
    public Task CloseSession(string session, CancellationToken ct) => inner.CloseSession(session, ct);
    public async Task<TransactionPage> Transactions(string s, string a, bool f, DateOnly? d, DateOnly t, string? c, CancellationToken ct)
    {
        Calls++;
        if (FailPageOnce && c == "2") { FailPageOnce = false; throw new ProviderFailure("RATE_LIMITED", TimeSpan.FromHours(6)); }
        var page = await inner.Transactions(s, a, f, d, t, c, ct);
        return page with { Items = page.Items.Select(x => x.Description == "Demo reservation"
            ? x with { Reference = "stable-reservation", Status = BookReservation ? "BOOK" : "PDNG", BookingDate = BookReservation ? t : null, Amount = BookReservation ? -100 : -99 }
            : RewriteCoffee && x.Description == "Demo coffee" ? x with { Amount = -27m } : x)
            .Select(x=>EnrichDetails ? x with { Details=DemoBankDetails.Transaction(x.Description,x.Amount,"everyday",1000m) } : x).ToList() };
    }
    public Task<IReadOnlyList<SourceBalance>> Balances(string s, string a, CancellationToken ct)
    {
        if (FailBalanceOnce) { FailBalanceOnce = false; throw new ProviderFailure("PROVIDER_UNAVAILABLE", TimeSpan.FromMinutes(15)); }
        return inner.Balances(s, a, ct);
    }
}

public sealed class BackendTests
{
    [Fact]
    public async Task Mode_switching_isolates_reads_edits_callbacks_jobs_and_secret_scopes()
    {
        await using var app = new BackendFactory(secondWorkspace: true); using var demo = app.AuthClient(); using var live = app.AuthClient();
        live.DefaultRequestHeaders.Add("X-Banking-Mode", "Live");
        try
        {
            Assert.Equal("Demo", (await Read(await demo.GetAsync("/api/mode"))).GetProperty("mode").GetString());
            var liveMode = await live.GetAsync("/api/mode"); Assert.Equal("Live", liveMode.Headers.GetValues("X-Banking-Mode").Single());
            var liveCategory = await Read(await live.PostAsJsonAsync("/api/categories", new { name = "Live lane sentinel" }));
            Assert.Empty((await Read(await demo.GetAsync("/api/categories"))).EnumerateArray());
            await Read(await demo.PostAsJsonAsync("/api/categories", new { name = "Demo only" }));
            Assert.Equal("Live lane sentinel", (await Read(await live.GetAsync("/api/categories")))[0].GetProperty("name").GetString());
            // Both lanes use synthetic providers in this test only. Live production activation stays disabled.
            var start = await Read(await live.PostAsJsonAsync("/api/connections/authorize", new { provider = "simulator", bank = "Demo Bank", country = "DK" }));
            var callback = new Uri(start.GetProperty("authorizationUrl").GetString()!);
            Assert.Equal("/api/auth/callback/live", callback.AbsolutePath);
            Assert.Equal(HttpStatusCode.BadRequest, (await demo.GetAsync("/api/auth/callback" + callback.Query)).StatusCode);
            // A Demo-selected technical client cannot change the originating callback's Live scope.
            await Read(await demo.GetAsync(callback.PathAndQuery));
            Assert.Empty((await Read(await demo.GetAsync("/api/connections"))).EnumerateArray());
            Assert.Single((await Read(await live.GetAsync("/api/connections"))).EnumerateArray());
            await app.InScope(async s => { await s.GetRequiredService<SyncService>().Tick(default); }, "Live");
            await app.InScope(async s => { await s.GetRequiredService<SyncService>().Tick(default); }, "Live");
            Assert.Equal(9, (await Read(await live.GetAsync("/api/transactions"))).GetProperty("total").GetInt32());
            Assert.Equal(0, (await Read(await demo.GetAsync("/api/transactions"))).GetProperty("total").GetInt32());
            var liveTransaction = (await Read(await live.GetAsync("/api/transactions"))).GetProperty("items")[0];
            Assert.Equal(HttpStatusCode.NotFound, (await demo.PutAsJsonAsync($"/api/transactions/{liveTransaction.GetProperty("id")}/category",
                new { categoryId = liveCategory.GetProperty("id").GetGuid(), version = liveTransaction.GetProperty("version").GetString() })).StatusCode);
            string encrypted = "";
            await app.InScope(s => { encrypted = s.GetRequiredService<Banking.Api.Security.Vault>().Protect("synthetic-live-secret"); return Task.CompletedTask; }, "Live");
            await app.InScope(s =>
            {
                Assert.Throws<System.Security.Cryptography.CryptographicException>(() => s.GetRequiredService<Banking.Api.Security.Vault>().Reveal(encrypted));
                Assert.Throws<ApiFailure>(() => s.GetRequiredService<Banking.Api.Security.Workspace>().Select("Live")); return Task.CompletedTask;
            });
            using var invalid = new HttpRequestMessage(HttpMethod.Get, "/api/accounts"); invalid.Headers.Add("X-Banking-Mode", "anything-else");
            Assert.Equal(HttpStatusCode.BadRequest, (await demo.SendAsync(invalid)).StatusCode);
            var switched = await Task.WhenAll(demo.GetAsync("/api/categories"), live.GetAsync("/api/categories"));
            Assert.Equal("Demo only", (await Read(switched[0]))[0].GetProperty("name").GetString());
            Assert.Equal("Live lane sentinel", (await Read(switched[1]))[0].GetProperty("name").GetString());
        }
        finally { await app.Cleanup(); }
    }
    [Fact]
    public void Production_host_rejects_incomplete_local_configuration()
    {
        using var app = new BackendFactory(environment: "Production");
        var error = Assert.Throws<InvalidOperationException>(() => app.AuthClient());
        Assert.Contains("production HTTPS origin is required", error.Message);
    }
    internal static async Task<JsonElement> Read(HttpResponseMessage response)
    { var body = await response.Content.ReadAsStringAsync(); Assert.True(response.IsSuccessStatusCode, $"{response.StatusCode}: {body}"); return JsonDocument.Parse(body).RootElement.Clone(); }
    internal static async Task<Guid> Connect(HttpClient client, string bank = "Demo Bank", string country = "DK", Guid? reconnect = null)
    {
        var start = await Read(await client.PostAsJsonAsync("/api/connections/authorize", new { provider = "simulator", bank, country, reconnectId = reconnect }));
        var url = new Uri(start.GetProperty("authorizationUrl").GetString()!);
        var result = await Read(await client.GetAsync(url.PathAndQuery));
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync(url.PathAndQuery)).StatusCode);
        return result.GetProperty("connectionId").GetGuid();
    }
    internal static async Task Resync(BackendFactory app, Guid accountId, bool full = true)
    {
        await app.InScope(async s => { var db = s.GetRequiredService<BankingDb>(); db.Jobs.Add(ConnectionService.NewJob(accountId, DateTimeOffset.UtcNow, full)); await db.SaveChangesAsync(); });
        await app.Tick();
    }

    [Fact]
    public async Task Matched_transfer_details_are_independent_of_the_transaction_page()
    {
        await using var app = new BackendFactory(); using var client = app.AuthClient();
        try
        {
            await Connect(client); await app.Tick(); await app.Tick();
            var rows = (await Read(await client.GetAsync("/api/transactions"))).GetProperty("items").EnumerateArray().ToList();
            var outgoing = rows.Single(x => x.GetProperty("amount").GetDecimal() == -1000);
            var incoming = rows.Single(x => x.GetProperty("amount").GetDecimal() == 1000);
            await Read(await client.PostAsJsonAsync("/api/transfer-matches", new { outgoingId = outgoing.GetProperty("id").GetGuid(), incomingId = incoming.GetProperty("id").GetGuid() }));
            // A filtered transaction page contains neither side of this match.
            Assert.Equal(0, (await Read(await client.GetAsync("/api/transactions?search=no-such-transaction"))).GetProperty("total").GetInt32());
            var matches = await Read(await client.GetAsync("/api/transfer-matches"));
            var pair = matches[0];
            Assert.Equal(outgoing.GetProperty("description").GetString(), pair.GetProperty("outgoing").GetProperty("description").GetString());
            Assert.Equal(outgoing.GetProperty("accountId").GetGuid(), pair.GetProperty("outgoing").GetProperty("accountId").GetGuid());
            Assert.Equal(-1000m, pair.GetProperty("outgoing").GetProperty("amount").GetDecimal());
            Assert.Equal(1000m, pair.GetProperty("incoming").GetProperty("amount").GetDecimal());
            Assert.Equal(incoming.GetProperty("bookingDate").GetString(), pair.GetProperty("incoming").GetProperty("bookingDate").GetString());
            Assert.Equal(0, (await Read(await client.GetAsync("/api/transfer-matches?offset=200"))).GetArrayLength());
        }
        finally { await app.Cleanup(); }
    }

    [Fact]
    public async Task Complete_local_workflow_reconciles_money_preserves_corrections_and_restores_backup()
    {
        await using var app = new BackendFactory(); using var client = app.AuthClient();
        try
        {
            var connection = await Connect(client); await app.Tick(); await app.Tick();
            var rows = (await Read(await client.GetAsync("/api/transactions"))).GetProperty("items").EnumerateArray().ToList();
            Assert.Equal(9, rows.Count);
            Assert.Equal(2, rows.Count(x => x.GetProperty("description").GetString() == "Demo coffee"));
            var grocery = rows.Single(x => x.GetProperty("description").GetString() == "Demo grocery store");
            var account = grocery.GetProperty("accountId").GetGuid();
            var category = await Read(await client.PostAsJsonAsync("/api/categories", new { name = "Groceries" }));
            var catId = category.GetProperty("id").GetGuid();
            var classified = await Read(await client.PutAsJsonAsync($"/api/transactions/{grocery.GetProperty("id")}/category",
                new { categoryId = catId, version = grocery.GetProperty("version").GetString() }));
            Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync($"/api/transactions/{grocery.GetProperty("id")}/category",
                new { categoryId = catId, version = grocery.GetProperty("version").GetString() })).StatusCode);
            var ruleCat = (await Read(await client.PostAsJsonAsync("/api/categories", new { name = "Rule category" }))).GetProperty("id").GetGuid();
            await Read(await client.PostAsJsonAsync("/api/rules", new { contains = "Demo", categoryId = ruleCat, priority = 10 }));
            Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsync("/api/rules/apply", null)).StatusCode);
            await Resync(app, account, false);
            var fresh = await Read(await client.GetAsync($"/api/transactions?categoryId={catId}"));
            Assert.Equal(1, fresh.GetProperty("total").GetInt32());
            Assert.Equal("Manual", fresh.GetProperty("items")[0].GetProperty("classification").GetString());
            Assert.Equal(9, (await Read(await client.GetAsync("/api/transactions"))).GetProperty("total").GetInt32());
            var today = DateOnly.FromDateTime(DateTime.UtcNow); var from = today.AddDays(-30);
            var budget = await Read(await client.PostAsJsonAsync("/api/budgets", new { categoryId = catId, from, to = today, currency = "DKK", limit = 1000m }));
            var spending = await Read(await client.GetAsync($"/api/budgets/{budget.GetProperty("id")}/status"));
            Assert.Equal(425.50m, spending.GetProperty("spent").GetDecimal()); Assert.Equal(574.50m, spending.GetProperty("remaining").GetDecimal());
            await Read(await client.PostAsJsonAsync("/api/transfer-matches", new {
                outgoingId = rows.Single(x => x.GetProperty("amount").GetDecimal() == -1000).GetProperty("id").GetGuid(),
                incomingId = rows.Single(x => x.GetProperty("amount").GetDecimal() == 1000).GetProperty("id").GetGuid() }));
            var summaryPath = $"/api/summary?from={from:yyyy-MM-dd}&to={today:yyyy-MM-dd}&currency=DKK";
            var summary = await Read(await client.GetAsync(summaryPath));
            Assert.Equal(25000m, summary.GetProperty("income").GetDecimal()); Assert.Equal(8475.50m, summary.GetProperty("spending").GetDecimal());
            Assert.Equal(16524.50m, summary.GetProperty("net").GetDecimal());
            // Expired consent and reconnect keep local account and transaction identity.
            await app.InScope(async s => { var db = s.GetRequiredService<BankingDb>(); var c = await db.Connections.FindAsync(connection); c!.ValidUntil = DateTimeOffset.UtcNow.AddDays(-1); await db.SaveChangesAsync(); });
            Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsync($"/api/connections/{connection}/sync", null)).StatusCode);
            Assert.Equal(connection, await Connect(client, reconnect: connection)); await app.Tick(); await app.Tick();
            Assert.Equal(grocery.GetProperty("id").GetGuid(), (await Read(await client.GetAsync($"/api/transactions?categoryId={catId}"))).GetProperty("items")[0].GetProperty("id").GetGuid());
            // Synthetic second bank is isolated by currency, never added to the DKK total.
            await Connect(client, "Demo Euro Bank", "DE"); await app.Tick(); await app.Tick();
            Assert.Equal(18, (await Read(await client.GetAsync("/api/transactions"))).GetProperty("total").GetInt32());
            Assert.Equal(8475.50m, (await Read(await client.GetAsync(summaryPath))).GetProperty("spending").GetDecimal());
            var backup = Path.Combine(Path.GetTempPath(), $"banking-test-{Guid.NewGuid():N}.dpapi");
            await using var restored = new BackendFactory("Banking_Restore_" + Guid.NewGuid().ToString("N")); using var restoreClient = restored.AuthClient();
            try
            {
                await app.InScope(s => s.GetRequiredService<BackupService>().Export(backup, default));
                Assert.DoesNotContain("Demo", await File.ReadAllTextAsync(backup));
                await restored.InScope(s => s.GetRequiredService<BackupService>().Restore(backup, default));
                Assert.Equal(18, (await Read(await restoreClient.GetAsync("/api/transactions"))).GetProperty("total").GetInt32());
                Assert.Equal(8475.50m, (await Read(await restoreClient.GetAsync(summaryPath))).GetProperty("spending").GetDecimal());
                Assert.Equal(425.50m, (await Read(await restoreClient.GetAsync($"/api/budgets/{budget.GetProperty("id")}/status"))).GetProperty("spent").GetDecimal());
                await Assert.ThrowsAsync<ApiFailure>(() => restored.InScope(s => s.GetRequiredService<BackupService>().Restore(backup, default)));
            }
            finally { await restored.Cleanup(); File.Delete(backup); }
        }
        finally { await app.Cleanup(); }
    }

    [Fact]
    public async Task Rate_limit_checkpoint_and_terminal_page_resume_without_duplicates()
    {
        var provider = new FaultProvider { FailPageOnce = true, FailBalanceOnce = true };
        await using var app = new BackendFactory(provider: provider); using var client = app.AuthClient();
        try
        {
            await Connect(client);
            // Restrict this scenario to the main account so each Tick is deterministic.
            await app.InScope(async s => { var db = s.GetRequiredService<BankingDb>(); await db.Jobs.Where(x => x.Account.ProviderAccountId.EndsWith("savings")).ExecuteDeleteAsync(); });
            await app.Tick();
            await app.InScope(async s =>
            {
                var db = s.GetRequiredService<BankingDb>(); var job = await db.Jobs.SingleAsync();
                Assert.Equal("RATE_LIMITED", job.ErrorCode); Assert.Equal(2, job.Items); Assert.True(job.NextAttempt > DateTimeOffset.UtcNow.AddHours(5));
                Assert.Empty(await db.Transactions.ToListAsync()); job.NextAttempt = DateTimeOffset.UtcNow.AddSeconds(-1); await db.SaveChangesAsync();
                await db.Connections.ExecuteUpdateAsync(x => x.SetProperty(c => c.RetryNotBefore, (DateTimeOffset?)null));
            });
            await app.Tick();
            var callsAfterFetch = provider.Calls;
            // A fresh host against the same SQL database resumes the persisted terminal checkpoint.
            await using var restarted = new BackendFactory(app.Database, provider);
            using var restartedClient = restarted.AuthClient();
            await app.InScope(async s =>
            {
                var db = s.GetRequiredService<BankingDb>(); var job = await db.Jobs.SingleAsync();
                Assert.True(job.FetchCompleted); Assert.Equal(8, job.Items); Assert.Equal("PROVIDER_UNAVAILABLE", job.ErrorCode);
                job.NextAttempt = DateTimeOffset.UtcNow.AddSeconds(-1); await db.SaveChangesAsync();
            });
            await restarted.Tick(); Assert.Equal(callsAfterFetch, provider.Calls);
            await app.InScope(async s =>
            {
                var db = s.GetRequiredService<BankingDb>(); Assert.Equal(8, await db.Transactions.CountAsync()); Assert.Empty(await db.ImportItems.ToListAsync());
                Assert.Equal("Completed", (await db.Jobs.SingleAsync()).Status);
            });
            var pending = (await Read(await client.GetAsync("/api/transactions?status=PDNG"))).GetProperty("items")[0];
            provider.BookReservation = true; await Resync(app, pending.GetProperty("accountId").GetGuid());
            var booked = (await Read(await client.GetAsync("/api/transactions?search=reservation"))).GetProperty("items")[0];
            Assert.Equal(pending.GetProperty("id").GetGuid(), booked.GetProperty("id").GetGuid());
            Assert.Equal("BOOK", booked.GetProperty("status").GetString()); Assert.Equal(-100m, booked.GetProperty("amount").GetDecimal());
        }
        finally { await app.Cleanup(); }
    }

    [Fact]
    public async Task Access_validation_and_read_only_bank_boundary_fail_closed()
    {
        await using var app = new BackendFactory(); using var client = app.AuthClient(); using var anonymous = app.CreateClient();
        try
        {
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/accounts")).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/openapi/v1.json")).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync("/health")).StatusCode);
            using var foreignHost = new HttpRequestMessage(HttpMethod.Get, "/api/accounts"); foreignHost.Headers.Host = "attacker.example";
            Assert.Equal(HttpStatusCode.Forbidden, (await client.SendAsync(foreignHost)).StatusCode);
            using var origin = new HttpRequestMessage(HttpMethod.Get, "/api/accounts"); origin.Headers.Add("Origin", "https://attacker.example");
            Assert.Equal(HttpStatusCode.Forbidden, (await client.SendAsync(origin)).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/transactions?limit=10000")).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/categories", new { name = "" })).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync("/api/payments", new { amount = 1 })).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync("/api/transfers", new { amount = 1 })).StatusCode);
            Assert.Equal(HttpStatusCode.MethodNotAllowed, (await client.PostAsJsonAsync("/api/transactions", new { amount = 1 })).StatusCode);
            var unavailable = await client.GetAsync("/api/banks?provider=enable-banking"); Assert.Equal(HttpStatusCode.BadGateway, unavailable.StatusCode);
            Assert.Contains("PROVIDER_NOT_ENABLED", await unavailable.Content.ReadAsStringAsync());
            var openapi = await Read(await client.GetAsync("/openapi/v1.json")); Assert.True(openapi.GetProperty("paths").EnumerateObject().Count() >= 15);
        }
        finally { await app.Cleanup(); }
    }
}
