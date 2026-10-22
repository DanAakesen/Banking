using System.Net.Http.Json;
using Banking.Api.Data;
using Banking.Api.Providers;
using Banking.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static Banking.Tests.BackendTests;

namespace Banking.Tests;

public sealed class ProductDemoTests
{
    [Fact]
    public async Task Product_demo_imports_reconciles_edits_and_reconnects_without_touching_live_workspace()
    {
        await using var app = new BackendFactory(secondWorkspace: true); using var client = app.AuthClient();
        try
        {
            await app.InScope(s => s.GetRequiredService<DemoService>().Initialize(default));
            for (var tick = 0; tick < 12; tick++)
            {
                // Drive deferred pagination in this disposable fixture without a wall-clock sleep.
                await app.InScope(async s => await s.GetRequiredService<BankingDb>().Jobs
                    .Where(j => j.Status == "Running" || j.Status == "Queued")
                    .ExecuteUpdateAsync(x => x.SetProperty(j => j.NextAttempt, DateTimeOffset.UtcNow)));
                await app.Tick();
            }
            Guid connectionId = default; var beforeCount = 0;
            await app.InScope(async s =>
            {
                var db = s.GetRequiredService<BankingDb>();
                connectionId = (await db.Connections.SingleAsync()).Id;
                Assert.Equal(5, await db.Accounts.CountAsync(x => x.InitialImportCompleted != null));
                Assert.Equal(10, await db.Balances.CountAsync()); Assert.Equal(0, await db.Budgets.CountAsync());
                Assert.Equal(0, await db.Goals.CountAsync());
                beforeCount = await db.Transactions.CountAsync(); Assert.True(beforeCount > 1500);
                Assert.True(await db.Transactions.AnyAsync(x => x.Description == "Partners løn"));
                Assert.True(await db.Transactions.AnyAsync(x => x.Description == "Skolefritidsordning"));
                Assert.False(await db.Transactions.AnyAsync(x => x.Description.StartsWith("Demo ")));
                Assert.False(await db.Accounts.AnyAsync(x => x.Name.StartsWith("Demo ")));
                var legacy = await db.Transactions.FirstAsync(x => x.SourceKey.StartsWith("F:") && x.Status == "BOOK");
                var originalKey = legacy.SourceKey;
                var originalDescription = legacy.Description;
                legacy.Description = "Demo " + legacy.Description.ToLowerInvariant();
                await db.SaveChangesAsync();
                await s.GetRequiredService<DemoService>().CleanDisplayNames(default);
                await s.GetRequiredService<DemoService>().CleanDisplayNames(default);
                Assert.Equal(originalDescription, legacy.Description);
                Assert.Equal(originalKey, legacy.SourceKey);
                legacy.Description = "Groceries";
                var originalAmount = legacy.Amount;
                var custom = await db.Accounts.FirstAsync(); custom.CustomName = "My own unchanged name";
                await db.SaveChangesAsync();
                await s.GetRequiredService<DemoService>().LocalizeDanish(default);
                await s.GetRequiredService<DemoService>().LocalizeDanish(default);
                Assert.Equal("Dagligvarer", legacy.Description);
                Assert.Equal(originalAmount, legacy.Amount);
                Assert.Equal(originalKey, legacy.SourceKey);
                Assert.Equal("My own unchanged name", custom.CustomName);
                Assert.Contains(await db.Rules.Select(x => x.Contains).ToListAsync(), x => x == "pendlerkort");

                Assert.Equal(beforeCount, await db.Transactions.CountAsync());
                Assert.True(await db.Transactions.AnyAsync(x => x.Status == "PDNG" && x.BookingDate == null));
                Assert.True(await db.Transactions.AnyAsync(x => x.Classification == "Rule"));
                foreach (var account in await db.Accounts.ToListAsync())
                {
                    var opening = account.ProviderAccountId == "savings" ? 22000m : account.ProviderAccountId == "bills" ? 6000m : account.ProviderAccountId == "everyday" ? 12000m : 0m;
                    var sum = await db.Transactions.Where(x => x.AccountId == account.Id && x.Status == "BOOK").SumAsync(x => x.Amount);
                    Assert.Equal(opening + sum, (await db.Balances.SingleAsync(x => x.AccountId == account.Id && x.Type == "ITBD")).Amount);
                }
                await Assert.ThrowsAsync<ApiFailure>(() => s.GetRequiredService<DemoService>().Initialize(default));
            });
            var row = (await Read(await client.GetAsync("/api/transactions?search=dagligvarer&limit=1"))).GetProperty("items")[0];
            var category = (await Read(await client.GetAsync("/api/categories")))[0];
            await Read(await client.PutAsJsonAsync($"/api/transactions/{row.GetProperty("id")}/category", new {
                categoryId = category.GetProperty("id").GetGuid(), version = row.GetProperty("version").GetString() }));
            var auth = await Read(await client.PostAsJsonAsync("/api/connections/authorize", new {
                provider = "product-demo", bank = "Familiens demobank", country = "DK", reconnectId = connectionId }));
            await Read(await client.GetAsync(new Uri(auth.GetProperty("authorizationUrl").GetString()!).PathAndQuery));
            for (var tick = 0; tick < 12; tick++)
            {
                // Drive deferred pagination in this disposable fixture without a wall-clock sleep.
                await app.InScope(async s => await s.GetRequiredService<BankingDb>().Jobs
                    .Where(j => j.Status == "Running" || j.Status == "Queued")
                    .ExecuteUpdateAsync(x => x.SetProperty(j => j.NextAttempt, DateTimeOffset.UtcNow)));
                await app.Tick();
            }
            await app.InScope(async s =>
            {
                var db = s.GetRequiredService<BankingDb>(); Assert.Equal(beforeCount, await db.Transactions.CountAsync());
                Assert.Equal(1, await db.Transactions.CountAsync(x => x.Classification == "Manual"));
                Assert.Equal(5, await db.Accounts.CountAsync());
            });
            await app.InScope(async s =>
            {
                await Assert.ThrowsAsync<ApiFailure>(() => s.GetRequiredService<DemoService>().Initialize(default));
                Assert.Empty(await s.GetRequiredService<BankingDb>().Accounts.ToListAsync());
            }, "Live");
            await app.InScope(async s => await Assert.ThrowsAsync<ApiFailure>(() =>
                s.GetRequiredService<DemoService>().CleanDisplayNames(default)), "Live");
            await app.InScope(async s => await Assert.ThrowsAsync<ApiFailure>(() =>
                s.GetRequiredService<DemoService>().LocalizeDanish(default)), "Live");
        }
        finally { await app.Cleanup(); }
    }

    [Theory]
    [InlineData(2026, 10, 22)]
    [InlineData(2027, 3, 9)]
    [InlineData(2028, 1, 31)]
    public async Task Product_demo_history_follows_the_clock_and_keeps_every_period_filter_populated(int year, int month, int day)
    {
        var today = new DateOnly(year, month, day);
        var provider = new ProductDemoProvider(new FixedClock(new DateTimeOffset(year, month, day, 12, 0, 0, TimeSpan.Zero)));
        var session = await provider.Complete(ProductDemoProvider.SessionId, default);
        Assert.Equal(new DateTimeOffset(year, month, day, 12, 0, 0, TimeSpan.Zero) + ProductDemoProvider.ConsentValidity, session.ValidUntil);
        var rows = new List<SourceTransaction>(); string? cursor = null;
        do
        {
            var page = await provider.Transactions(ProductDemoProvider.SessionId, "everyday", true, null, today, cursor, default);
            rows.AddRange(page.Items); cursor = page.Cursor;
        } while (cursor is not null);
        var booked = rows.Where(x => x.Status == "BOOK").ToList();
        Assert.All(booked, x => Assert.True(x.BookingDate <= today));
        Assert.Contains(booked, x => x.BookingDate >= today.AddDays(-7));
        Assert.True(booked.Count(x => x.BookingDate >= today.AddDays(-30)) >= 20);
        Assert.Contains(booked, x => x.BookingDate <= today.AddYears(-1));
        var pending = Assert.Single(rows, x => x.Status == "PDNG");
        Assert.Null(pending.BookingDate); Assert.Equal(today, pending.ValueDate);
        var balances = await provider.Balances(ProductDemoProvider.SessionId, "everyday", default);
        Assert.Equal(12000m + booked.Sum(x => x.Amount), balances.Single(x => x.Type == "ITBD").Amount);
        Assert.All(balances, x => Assert.Equal(new DateTimeOffset(year, month, day, 12, 0, 0, TimeSpan.Zero), x.BankTime));
    }

    [Fact]
    public async Task Demo_connection_validity_rolls_forward_so_synthetic_history_never_freezes()
    {
        await using var app = new BackendFactory(secondWorkspace: true);
        try
        {
            var now = DateTimeOffset.UtcNow; var renewed = now + ProductDemoProvider.ConsentValidity;
            await app.InScope(async s =>
            {
                var db = s.GetRequiredService<BankingDb>();
                db.Connections.AddRange(
                    new Connection { Provider = "product-demo", Bank = "Expiring", IsDemo = true, ValidUntil = now.AddDays(10) },
                    new Connection { Provider = "product-demo", Bank = "Just lapsed", IsDemo = true, ValidUntil = now.AddMinutes(-5) },
                    new Connection { Provider = "product-demo", Bank = "Fresh", IsDemo = true, ValidUntil = now.AddDays(100) },
                    new Connection { Provider = "product-demo", Bank = "Disconnected", IsDemo = true, Status = "Disconnected", ValidUntil = now.AddDays(1) },
                    new Connection { Provider = "enable-banking", Bank = "Other provider", IsDemo = true, ValidUntil = now.AddDays(10) });
                await db.SaveChangesAsync();
                await SyncWorker.RenewDemoConsent(db, now, default);
                db.ChangeTracker.Clear();
                var rows = await db.Connections.AsNoTracking().ToDictionaryAsync(x => x.Bank);
                Assert.InRange((rows["Expiring"].ValidUntil - renewed).Duration(), TimeSpan.Zero, TimeSpan.FromSeconds(1));
                Assert.InRange((rows["Just lapsed"].ValidUntil - renewed).Duration(), TimeSpan.Zero, TimeSpan.FromSeconds(1));
                Assert.InRange((rows["Fresh"].ValidUntil - now.AddDays(100)).Duration(), TimeSpan.Zero, TimeSpan.FromSeconds(1));
                Assert.InRange((rows["Disconnected"].ValidUntil - now.AddDays(1)).Duration(), TimeSpan.Zero, TimeSpan.FromSeconds(1));
                Assert.InRange((rows["Other provider"].ValidUntil - now.AddDays(10)).Duration(), TimeSpan.Zero, TimeSpan.FromSeconds(1));
            });
            await app.InScope(async s =>
            {
                var db = s.GetRequiredService<BankingDb>();
                db.Connections.Add(new Connection { Provider = "enable-banking", Bank = "Private bank", IsDemo = false, ValidUntil = now.AddDays(5) });
                await db.SaveChangesAsync();
                await SyncWorker.RenewDemoConsent(db, now, default);
                db.ChangeTracker.Clear();
                Assert.InRange((await db.Connections.AsNoTracking().SingleAsync()).ValidUntil - now.AddDays(5), TimeSpan.FromSeconds(-1), TimeSpan.FromSeconds(1));
            }, "Live");
        }
        finally { await app.Cleanup(); }
    }

    private sealed class FixedClock(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}
