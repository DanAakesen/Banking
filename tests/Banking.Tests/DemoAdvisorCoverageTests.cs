using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Banking.Api.Data;
using Banking.Api.Security;
using Banking.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static Banking.Tests.BackendTests;

namespace Banking.Tests;

public sealed class DemoAdvisorCoverageTests
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static async Task<JsonElement> Context(IServiceProvider services) => JsonSerializer.SerializeToElement(
        await services.GetRequiredService<AdvisorDataService>().Read(null, null, "DKK", default), Json);

    [Fact]
    public async Task Distinct_demo_browser_sessions_share_records_and_conflict_on_stale_versions()
    {
        await using var app = new BackendFactory();
        using var visitorA = Browser(app); using var visitorB = Browser(app);
        try
        {
            var cookieA = Cookie(await visitorA.PostAsJsonAsync("/api/browser/demo", new { }));
            var cookieB = Cookie(await visitorB.PostAsJsonAsync("/api/browser/demo", new { }));
            Assert.NotEqual(cookieA, cookieB);
            SetCookie(visitorA, cookieA); SetCookie(visitorB, cookieB);

            var input = new WealthInput("Shared visitor record", "Synthetic test", "Investment", 1000, "DKK", new(2026, 1, 1), "Synthetic fixture");
            var created = await Read(await visitorA.PostAsJsonAsync("/api/wealth", input));
            var id = created.GetProperty("id").GetGuid();
            var version = created.GetProperty("version").GetString();

            var visibleToB = (await Read(await visitorB.GetAsync("/api/wealth"))).EnumerateArray().Single(x => x.GetProperty("id").GetGuid() == id);
            Assert.Equal(version, visibleToB.GetProperty("version").GetString());
            Assert.Equal(1000m, visibleToB.GetProperty("value").GetDecimal());

            var updateA = await visitorA.PutAsJsonAsync($"/api/wealth/{id}", input with { Value = 1250, Version = version });
            Assert.Equal(HttpStatusCode.OK, updateA.StatusCode);
            var staleB = await visitorB.PutAsJsonAsync($"/api/wealth/{id}", input with { Value = 900, Version = version });
            Assert.Equal(HttpStatusCode.Conflict, staleB.StatusCode);

            var persisted = (await Read(await visitorB.GetAsync("/api/wealth"))).EnumerateArray().Single(x => x.GetProperty("id").GetGuid() == id);
            Assert.Equal(1250m, persisted.GetProperty("value").GetDecimal());
        }
        finally { await app.Cleanup(); }
    }

    private static HttpClient Browser(BackendFactory app)
    {
        var client = app.CreateClient(new() { BaseAddress = new Uri("https://localhost"), HandleCookies = false });
        client.DefaultRequestHeaders.Add("Origin", "https://localhost");
        client.DefaultRequestHeaders.Add("X-Banking-Client", "web");
        return client;
    }
    private static string Cookie(HttpResponseMessage response) => response.Headers.GetValues("Set-Cookie").Single().Split(';')[0];
    private static void SetCookie(HttpClient client, string cookie)
    { client.DefaultRequestHeaders.Remove("Cookie"); client.DefaultRequestHeaders.Add("Cookie", cookie); }

    [Fact]
    public async Task Demo_financial_edits_are_shared_while_owner_records_remain_private()
    {
        await using var app = new BackendFactory(secondWorkspace: true); using var client = app.AuthClient();
        try
        {
            await app.InScope(async s =>
            {
                var db = s.GetRequiredService<BankingDb>();
                db.Connections.Add(new Connection { IsDemo = true });
                await db.SaveChangesAsync();
                await s.GetRequiredService<DemoService>().EnrichFinancialExamples(default);
                await s.GetRequiredService<DemoService>().EnrichFinancialExamples(default);
                Assert.Equal(2, await db.WealthRecords.CountAsync());
                var original = await Context(s);
                Assert.Equal(125000, original.GetProperty("wealth").GetProperty("investments").GetDecimal());
                Assert.Equal(60000, original.GetProperty("wealth").GetProperty("debt").GetDecimal());
                Assert.Equal(510000, original.GetProperty("wealth").GetProperty("pension").GetDecimal());
                Assert.Equal(2, original.GetProperty("watchlist").GetArrayLength());
            });
            Guid editedId = default;
            await app.InScope(async s =>
            {
                var db = s.GetRequiredService<BankingDb>();
                var edited = await db.WealthRecords.FirstAsync(x => x.Kind == "Investment");
                Assert.Equal("", edited.DemoScope);
                edited.Value = 12345; editedId = edited.Id;
                (await db.ResearchItems.FirstAsync()).Notes = "Shared Demo watchlist note";
                await db.SaveChangesAsync(); db.ChangeTracker.Clear();
                db.Loans.RemoveRange(await db.Loans.ToListAsync()); await db.SaveChangesAsync();
            });
            await app.InScope(async s =>
            {
                var db = s.GetRequiredService<BankingDb>();
                Assert.Equal(12345, (await db.WealthRecords.SingleAsync(x => x.Id == editedId)).Value);
                Assert.Contains("Shared Demo watchlist note", (await Context(s)).ToString());
                Assert.Empty((await Context(s)).GetProperty("loans").EnumerateArray());
            });
            await app.InScope(async s =>
            {
                var context = await Context(s);
                Assert.Equal("Live", context.GetProperty("mode").GetString());
                Assert.Empty(context.GetProperty("statements").EnumerateArray());
                Assert.Empty(context.GetProperty("loans").EnumerateArray());
                await Assert.ThrowsAsync<ApiFailure>(() => s.GetRequiredService<DemoService>().EnrichFinancialExamples(default));
                var db = s.GetRequiredService<BankingDb>();
                db.WealthRecords.Add(new WealthRecord { Name = "Owner only", Provider = "Test", Value = 42, AsOf = new(2026, 1, 1) });
                await db.SaveChangesAsync();
                Assert.Equal("Owner only", (await Context(s)).GetProperty("statements")[0].GetProperty("name").GetString());
            }, "Live");
        }
        finally { await app.Cleanup(); }
    }

    [Fact]
    public async Task Demo_reads_do_not_seed_missing_financial_examples()
    {
        await using var app = new BackendFactory(); using var client = app.AuthClient();
        try
        {
            await app.InScope(async s =>
            {
                var db = s.GetRequiredService<BankingDb>();
                db.Connections.Add(new Connection { IsDemo = true }); await db.SaveChangesAsync();
                Assert.Empty((await Context(s)).GetProperty("statements").EnumerateArray());
                Assert.Empty((await Context(s)).GetProperty("loans").EnumerateArray());
                await s.GetRequiredService<DemoService>().EnrichFinancialExamples(default);
                Assert.Equal(2, await db.WealthRecords.CountAsync()); Assert.Single(await db.Loans.ToListAsync());
                db.Loans.RemoveRange(await db.Loans.ToListAsync());
                db.WealthRecords.RemoveRange(await db.WealthRecords.ToListAsync());
                await db.SaveChangesAsync(); db.ChangeTracker.Clear();
                Assert.Empty((await Context(s)).GetProperty("statements").EnumerateArray());
                Assert.Empty((await Context(s)).GetProperty("loans").EnumerateArray());
            });
        }
        finally { await app.Cleanup(); }
    }

    [Fact]
    public async Task Canonical_queries_ignore_legacy_session_rows_and_reject_cross_scope_writes()
    {
        await using var app = new BackendFactory();
        try
        {
            using var serviceScope = app.Services.CreateScope();
            var options = serviceScope.ServiceProvider.GetRequiredService<DbContextOptions<BankingDb>>();

            var legacy = new Workspace { DemoScope = new string('A', 64) };
            Guid id;
            await using (var legacyDb = new BankingDb(options, legacy))
            {
                var record = new WealthRecord { Name = "Retained legacy copy", Provider = "Synthetic fixture", Kind = "Investment", Value = 400, Currency = "DKK", AsOf = new(2026, 1, 1) };
                legacyDb.WealthRecords.Add(record);
                await legacyDb.SaveChangesAsync();
                id = record.Id;
                Assert.Equal(legacy.DemoScope, record.DemoScope);
            }

            var canonical = new Workspace();
            await using (var canonicalDb = new BankingDb(options, canonical))
            {
                Assert.Empty(await canonicalDb.WealthRecords.ToListAsync());
                var retained = await canonicalDb.WealthRecords.IgnoreQueryFilters().SingleAsync(x => x.Id == id);
                retained.Value = 999;
                await Assert.ThrowsAsync<InvalidOperationException>(() => canonicalDb.SaveChangesAsync());
            }

            await using (var legacyRead = new BankingDb(options, legacy))
                Assert.Equal(400m, (await legacyRead.WealthRecords.SingleAsync(x => x.Id == id)).Value);
        }
        finally { await app.Cleanup(); }
    }
}
