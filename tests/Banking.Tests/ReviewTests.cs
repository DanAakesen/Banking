using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Banking.Api.Data;
using Banking.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static Banking.Tests.BackendTests;

namespace Banking.Tests;

public sealed class ReviewTests
{
    private static BankTransaction Tx(Guid account, string text, decimal amount, int day = 2, string currency = "DKK") => new()
    { AccountId = account, SourceKey = Guid.NewGuid().ToString("N"), Description = text, Amount = amount, Currency = currency,
        BookingDate = new(2026, 9, day), ObservedAt = DateTimeOffset.UtcNow };
    private static async Task<(Guid A, Guid B, Guid Category)> Seed(BackendFactory app)
    {
        Guid a = default, b = default, c = default;
        await app.InScope(async s => { var db = s.GetRequiredService<BankingDb>();
            var connection = new Connection { Bank = "Review test bank", IsDemo = true, ValidUntil = DateTimeOffset.UtcNow.AddMonths(1) }; db.Connections.Add(connection);
            var first = new Account { ConnectionId = connection.Id, IdentityHash = "a", Name = "Everyday", Currency = "DKK" };
            var second = new Account { ConnectionId = connection.Id, IdentityHash = "b", Name = "Savings", Currency = "DKK" };
            db.Accounts.AddRange(first, second); var cat = new Category { Name = "Groceries" }; db.Categories.Add(cat);
            db.Transactions.AddRange(Tx(first.Id, "Savings transfer", -3000), Tx(second.Id, "From everyday", 3000),
                Tx(first.Id, "Groceries one", -431, 4), Tx(first.Id, "Groceries two", -58, 3));
            await db.SaveChangesAsync(); a = first.Id; b = second.Id; c = cat.Id;
        }); return(a, b, c);
    }
    private static ReviewRef Ref(JsonElement x) => new(x.GetProperty("key").GetString()!, x.GetProperty("signature").GetString()!);
    private static async Task<JsonElement> Queue(HttpClient client, string query = "") => await Read(await client.GetAsync("/api/review" + query));
    private static async Task<HttpResponseMessage> Undo(HttpClient client, JsonElement x) => await client.PostAsJsonAsync("/api/review/actions/" + x.GetProperty("id").GetGuid() + "/undo", new ReviewUndo(x.GetProperty("version").GetString()!));

    [Fact]
    public async Task Queue_pairs_once_filters_both_accounts_and_never_guesses_ambiguous_currency_or_dates()
    {
        await using var app = new BackendFactory(secondWorkspace: true); using var client = app.AuthClient(); using var live = app.AuthClient(); live.DefaultRequestHeaders.Add("X-Banking-Mode", "Live");
        try
        {
            var seed = await Seed(app); var q = await Queue(client);
            Assert.Equal(3, q.GetProperty("total").GetInt32()); Assert.Equal(2, q.GetProperty("counts").GetProperty("categories").GetInt32());
            Assert.Equal(1, q.GetProperty("counts").GetProperty("transfers").GetInt32());
            Assert.Equal("Groceries one", q.GetProperty("items")[0].GetProperty("transaction").GetProperty("description").GetString());
            var pair = Assert.Single((await Queue(client, "?accountId=" + seed.B)).GetProperty("items").EnumerateArray());
            Assert.Equal("Transfer", pair.GetProperty("kind").GetString());
            Assert.Equal(0, (await Queue(live)).GetProperty("total").GetInt32());
            Assert.Equal(HttpStatusCode.Conflict, (await live.PostAsJsonAsync("/api/review/actions", new ReviewInput("ConfirmTransfer", [Ref(pair)]))).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/review?kind=Invalid")).StatusCode);
            await app.InScope(async s => { var db = s.GetRequiredService<BankingDb>();
                db.Transactions.AddRange(Tx(seed.A, "Ambiguous payment", -3000), Tx(seed.A, "Cross-currency outgoing", -50), Tx(seed.B, "Cross-currency incoming", 50, currency:"EUR"),
                    Tx(seed.A, "Different date outgoing", -70, 3), Tx(seed.B, "Different date incoming", 70, 4));
                var pending = Tx(seed.A, "Pending purchase", -12); pending.Status = "PDNG"; db.Transactions.Add(pending); await db.SaveChangesAsync(); });
            Assert.Equal(0, (await Queue(client)).GetProperty("counts").GetProperty("transfers").GetInt32());
            Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/review/actions", new ReviewInput("ConfirmTransfer", [Ref(pair)]))).StatusCode);
        }
        finally { await app.Cleanup(); }
    }

    [Fact]
    public async Task Categorization_bulk_rule_undo_and_concurrency_are_atomic()
    {
        await using var app = new BackendFactory(); using var client = app.AuthClient();
        try
        {
            var seed = await Seed(app); var q = await Queue(client, "?kind=Category"); var refs = q.GetProperty("items").EnumerateArray().Select(Ref).ToArray();
            var saved = await Read(await client.PostAsJsonAsync("/api/review/actions", new ReviewInput("Categorize", refs, seed.Category)));
            Assert.Equal(0, (await Queue(client, "?kind=Category")).GetProperty("total").GetInt32());
            Assert.Equal(HttpStatusCode.OK, (await Undo(client, saved)).StatusCode);
            Assert.Equal(2, (await Queue(client, "?kind=Category")).GetProperty("total").GetInt32());
            Assert.Equal(HttpStatusCode.Conflict, (await Undo(client, saved)).StatusCode);
            q = await Queue(client, "?kind=Category"); var item = q.GetProperty("items")[0];
            saved = await Read(await client.PostAsJsonAsync("/api/review/actions", new ReviewInput("Categorize", [Ref(item)], seed.Category, "Groceries")));
            Assert.Single((await Read(await client.GetAsync("/api/rules"))).EnumerateArray());
            Assert.Equal(HttpStatusCode.OK, (await Undo(client, saved)).StatusCode);
            Assert.Empty((await Read(await client.GetAsync("/api/rules"))).EnumerateArray());
            q = await Queue(client, "?kind=Category"); refs = q.GetProperty("items").EnumerateArray().Select(Ref).ToArray();
            saved = await Read(await client.PostAsJsonAsync("/api/review/actions", new ReviewInput("Categorize", refs, seed.Category)));
            var changedId = q.GetProperty("items")[0].GetProperty("transaction").GetProperty("id").GetGuid();
            await app.InScope(async s => { var db = s.GetRequiredService<BankingDb>(); (await db.Transactions.FindAsync(changedId))!.Description = "Newer bank description"; await db.SaveChangesAsync(); });
            Assert.Equal(HttpStatusCode.Conflict, (await Undo(client, saved)).StatusCode);
            Assert.Equal(0, (await Queue(client, "?kind=Category")).GetProperty("total").GetInt32());
            Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/review/actions", new ReviewInput("Categorize", refs, seed.Category))).StatusCode);
        }
        finally { await app.Cleanup(); }
    }

    [Fact]
    public async Task Transfer_confirmation_changes_only_app_matching_and_undo_restores_totals()
    {
        await using var app = new BackendFactory(); using var client = app.AuthClient();
        try
        {
            await Seed(app); const string summary = "/api/account-insights?from=2026-09-01&to=2026-09-07&currency=DKK";
            var before = await Read(await client.GetAsync(summary)); var pair = (await Queue(client, "?kind=Transfer")).GetProperty("items")[0];
            var saved = await Read(await client.PostAsJsonAsync("/api/review/actions", new ReviewInput("ConfirmTransfer", [Ref(pair)])));
            var after = await Read(await client.GetAsync(summary)); Assert.Equal(3000, before.GetProperty("income").GetDecimal() - after.GetProperty("income").GetDecimal());
            Assert.Equal(3000, before.GetProperty("spending").GetDecimal() - after.GetProperty("spending").GetDecimal());
            Assert.Equal(before.GetProperty("net").GetDecimal(), after.GetProperty("net").GetDecimal());
            var bankRows = await Read(await client.GetAsync("/api/transactions")); Assert.Equal(4, bankRows.GetProperty("total").GetInt32());
            Assert.Equal(0, (await Queue(client, "?kind=Transfer")).GetProperty("total").GetInt32());
            Assert.Equal(HttpStatusCode.OK, (await Undo(client, saved)).StatusCode);
            Assert.Equal(before.GetProperty("spending").GetDecimal(), (await Read(await client.GetAsync(summary))).GetProperty("spending").GetDecimal());
        }
        finally { await app.Cleanup(); }
    }

    [Fact]
    public async Task Skip_expiry_dismissal_history_and_backup_are_durable()
    {
        await using var app = new BackendFactory(); using var client = app.AuthClient();
        await using var restored = new BackendFactory("Banking_Restore_" + Guid.NewGuid().ToString("N"));
        var archive = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N") + ".bankup");
        try
        {
            var seed = await Seed(app); var item = (await Queue(client, "?kind=Category")).GetProperty("items")[0];
            var saved = await Read(await client.PostAsJsonAsync("/api/review/actions", new ReviewInput("Skip", [Ref(item)])));
            Assert.Equal(1, (await Queue(client, "?kind=Category")).GetProperty("total").GetInt32());
            await app.InScope(async s => { var db = s.GetRequiredService<BankingDb>(); (await db.ReviewActions.FindAsync(saved.GetProperty("id").GetGuid()))!.SnoozeUntil = DateTimeOffset.UtcNow.AddSeconds(-1); await db.SaveChangesAsync(); });
            Assert.Equal(2, (await Queue(client, "?kind=Category")).GetProperty("total").GetInt32());
            var pair = (await Queue(client, "?kind=Transfer")).GetProperty("items")[0];
            saved = await Read(await client.PostAsJsonAsync("/api/review/actions", new ReviewInput("Dismiss", [Ref(pair)])));
            Assert.Equal(4, (await Queue(client, "?kind=Category")).GetProperty("total").GetInt32());
            // Categorising a dismissed pair must not bring the same transfer suggestion back.
            var cat = (await Queue(client, "?kind=Category")).GetProperty("items").EnumerateArray().First(x => x.GetProperty("transaction").GetProperty("amount").GetDecimal() == -3000);
            await Read(await client.PostAsJsonAsync("/api/review/actions", new ReviewInput("Categorize", [Ref(cat)], seed.Category)));
            Assert.Equal(0, (await Queue(client, "?kind=Transfer")).GetProperty("total").GetInt32());
            Assert.Equal(HttpStatusCode.OK, (await Undo(client, saved)).StatusCode);
            Assert.Equal(1, (await Queue(client, "?kind=Transfer")).GetProperty("total").GetInt32());
            await app.InScope(s => s.GetRequiredService<BackupService>().Export(archive, default)); using var restoredClient = restored.AuthClient();
            await restored.InScope(s => s.GetRequiredService<BackupService>().Restore(archive, default));
            Assert.Equal(3, (await Read(await restoredClient.GetAsync("/api/review/history"))).GetProperty("total").GetInt32());
        }
        finally { await app.Cleanup(); await restored.Cleanup(); if (File.Exists(archive)) File.Delete(archive); }
    }
}
