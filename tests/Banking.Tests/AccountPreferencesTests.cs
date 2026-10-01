using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Banking.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static Banking.Tests.BackendTests;

namespace Banking.Tests;

public sealed class AccountPreferencesTests
{
    private static async Task<Guid[]> Seed(BackendFactory app)
    {
        Guid[] ids = [];
        await app.InScope(async s =>
        {
            var db = s.GetRequiredService<BankingDb>();
            var now = DateTimeOffset.UtcNow;
            var connection = new Connection { Bank = "Fictional bank", IsDemo = true, ValidUntil = now.AddMonths(1) };
            db.Connections.Add(connection);
            var accounts = Enumerable.Range(0, 3).Select(i => new Account { ConnectionId = connection.Id,
                IdentityHash = "account-" + i, Name = "Bank supplied name", Currency = "DKK", IsSavings = i > 0,
                EarliestTransaction = new(2026, 1, 1), InitialImportCompleted = now, LastSuccess = now }).ToArray();
            db.Accounts.AddRange(accounts); ids = accounts.Select(a => a.Id).ToArray();
            for (var i = 0; i < 3; i++)
                db.Balances.Add(new BalanceSnapshot { AccountId = ids[i], Amount = i == 2 ? 2500 : 4000,
                    Currency = "DKK", Type = "ITAV", ObservedAt = now });
            BankTransaction Row(int account, decimal amount, string status = "BOOK") => new() { AccountId = ids[account],
                SourceKey = Guid.NewGuid().ToString("N"), Currency = "DKK", Amount = amount, Status = status,
                BookingDate = new(2026, 9, 5), Description = "Fictional transaction", ObservedAt = now };
            void Pair(int from, int to, decimal amount)
            {
                var outgoing = Row(from, -amount); var incoming = Row(to, amount);
                db.Transactions.AddRange(outgoing, incoming);
                db.Transfers.Add(new TransferMatch { OutgoingId = outgoing.Id, IncomingId = incoming.Id });
            }
            db.Transactions.AddRange(Row(0, 10000), Row(0, -4000), Row(1, 100), Row(1, -50), Row(1, 999, "PDNG"));
            Pair(0, 1, 3000); Pair(1, 0, 500); Pair(1, 2, 200);
            var old = Row(1, 999); old.BookingDate = new(2026, 8, 1); db.Transactions.Add(old);
            await db.SaveChangesAsync();
        });
        return ids;
    }

    [Fact]
    public async Task Preferences_preserve_provider_name_and_enforce_version_validation_and_workspace()
    {
        await using var app = new BackendFactory(secondWorkspace: true);
        using var client = app.AuthClient(); using var live = app.AuthClient();
        live.DefaultRequestHeaders.Add("X-Banking-Mode", "Live");
        try
        {
            var ids = await Seed(app);
            var account = (await Read(await client.GetAsync("/api/accounts"))).EnumerateArray().Single(x => x.GetProperty("id").GetGuid() == ids[0]);
            var input = new { customName = "Household account", isSavings = true, version = account.GetProperty("version").GetString() };
            var path = $"/api/accounts/{ids[0]}/preferences";
            Assert.Equal(HttpStatusCode.Unauthorized, (await app.CreateClient().PutAsJsonAsync(path, input)).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await live.PutAsJsonAsync(path, input)).StatusCode);
            var saved = await Read(await client.PutAsJsonAsync(path, input));
            Assert.Equal("Household account", saved.GetProperty("name").GetString());
            Assert.True(saved.GetProperty("isSavings").GetBoolean());
            Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync(path, input)).StatusCode);
            await app.InScope(async s => { var db = s.GetRequiredService<BankingDb>();
                (await db.Accounts.FindAsync(ids[0]))!.Name = "Updated bank name"; await db.SaveChangesAsync(); });
            var reread = (await Read(await client.GetAsync("/api/accounts"))).EnumerateArray().Single(x => x.GetProperty("id").GetGuid() == ids[0]);
            Assert.Equal("Household account", reread.GetProperty("name").GetString());
            Assert.Equal("Updated bank name", reread.GetProperty("providerName").GetString());
            var version = reread.GetProperty("version").GetString();
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync(path, new { customName = new string('x', 201), isSavings = false, version })).StatusCode);
            var reset = await Read(await client.PutAsJsonAsync(path, new { customName = " ", isSavings = false, version }));
            Assert.Equal("Updated bank name", reset.GetProperty("name").GetString());
            Assert.False(reset.GetProperty("isSavings").GetBoolean());
        }
        finally { await app.Cleanup(); }
    }

    [Fact]
    public async Task Disposable_amount_counts_net_savings_once_and_preserves_missing_balance_and_currency_scope()
    {
        await using var app = new BackendFactory(); using var client = app.AuthClient();
        try
        {
            var ids = await Seed(app);
            const string path = "/api/account-insights?from=2026-09-01&to=2026-09-30&currency=DKK";
            var result = await Read(await client.GetAsync(path));
            Assert.Equal(10100, result.GetProperty("income").GetDecimal());
            Assert.Equal(4050, result.GetProperty("spending").GetDecimal());
            Assert.Equal(2550, result.GetProperty("savings").GetDecimal());
            Assert.Equal(3500, result.GetProperty("disposableAmount").GetDecimal());
            Assert.Equal(6500, result.GetProperty("totalSavings").GetDecimal());
            Assert.Equal(2, result.GetProperty("savingsAccountCount").GetInt32());
            var otherCurrency = await Read(await client.GetAsync(path.Replace("DKK", "EUR")));
            Assert.Equal(JsonValueKind.Null, otherCurrency.GetProperty("disposableAmount").ValueKind);
            Assert.Equal(JsonValueKind.Null, otherCurrency.GetProperty("totalSavings").ValueKind);
            await app.InScope(async s => { var db = s.GetRequiredService<BankingDb>();
                db.Balances.RemoveRange(await db.Balances.Where(b => b.AccountId == ids[2]).ToListAsync()); await db.SaveChangesAsync(); });
            Assert.Equal(JsonValueKind.Null, (await Read(await client.GetAsync(path))).GetProperty("totalSavings").ValueKind);
            await app.InScope(async s => { var db = s.GetRequiredService<BankingDb>();
                foreach (var a in await db.Accounts.ToListAsync()) a.IsSavings = false; await db.SaveChangesAsync(); });
            var unconfigured = await Read(await client.GetAsync(path));
            Assert.Equal(0, unconfigured.GetProperty("savingsAccountCount").GetInt32());
            Assert.Equal(0, unconfigured.GetProperty("savings").GetDecimal());
            Assert.Equal(6050, unconfigured.GetProperty("disposableAmount").GetDecimal());
            Assert.Equal(JsonValueKind.Null, unconfigured.GetProperty("totalSavings").ValueKind);
        }
        finally { await app.Cleanup(); }
    }
}
