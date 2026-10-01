using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Banking.Api.Data;
using Banking.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static Banking.Tests.BackendTests;

namespace Banking.Tests;

public sealed class PlanningTests
{
    private static async Task<(Guid Account, Guid Other, Guid Category)> Seed(BackendFactory app)
    {
        Guid first = default, second = default, categoryId = default;
        await app.InScope(async s =>
        {
            var db = s.GetRequiredService<BankingDb>(); var now = DateTimeOffset.UtcNow;
            var connection = new Connection { Bank = "Synthetic planning bank", IsDemo = true, ValidUntil = now.AddMonths(1) };
            db.Connections.Add(connection);
            var a = new Account { ConnectionId = connection.Id, IdentityHash = "first", Name = "Synthetic savings", Currency = "DKK",
                EarliestTransaction = new(2024, 1, 1), InitialImportCompleted = now, LastSuccess = now };
            var b = new Account { ConnectionId = connection.Id, IdentityHash = "second", Name = "Synthetic everyday", Currency = "DKK",
                EarliestTransaction = new(2024, 1, 1), InitialImportCompleted = now, LastSuccess = now };
            var category = new Category { Name = "Synthetic groceries" };
            db.Accounts.AddRange(a, b); db.Categories.Add(category);
            db.Balances.AddRange(new BalanceSnapshot { AccountId = a.Id, Amount = 400, Currency = "DKK", Type = "ITBD", ObservedAt = now },
                new BalanceSnapshot { AccountId = a.Id, Amount = 350, Currency = "DKK", Type = "ITAV", ObservedAt = now },
                new BalanceSnapshot { AccountId = b.Id, Amount = 600, Currency = "DKK", Type = "ITBD", ObservedAt = now });
            await db.SaveChangesAsync(); first = a.Id; second = b.Id; categoryId = category.Id;
        });
        return (first, second, categoryId);
    }
    private static GoalInput Input(Guid? account = null) => new("Synthetic trip", "A family holiday with time outdoors", 2000, "DKK",
        "Account", account, Notes: "Flexible dates", References: [new("https://example.com/trip", "Trip idea")]);
    private static BankTransaction Entry(Guid account, Guid? category, DateOnly date, decimal amount, string description = "Synthetic purchase", string status = "BOOK") =>
        new() { AccountId = account, CategoryId = category, SourceKey = Guid.NewGuid().ToString("N"), Currency = "DKK",
            BookingDate = date, Amount = amount, Description = description, Status = status, ObservedAt = DateTimeOffset.UtcNow };

    [Fact]
    public async Task Concurrent_goals_cannot_claim_the_same_account()
    {
        await using var app = new BackendFactory(); using var one = app.AuthClient(); using var two = app.AuthClient();
        try
        {
            var seed = await Seed(app);
            var results = await Task.WhenAll(one.PostAsJsonAsync("/api/goals", Input(seed.Account)), two.PostAsJsonAsync("/api/goals", Input(seed.Account) with { Name = "Other goal" }));
            Assert.Single(results, r => r.StatusCode == HttpStatusCode.Created);
            Assert.Single(results, r => r.StatusCode == HttpStatusCode.Conflict);
            Assert.Single((await Read(await one.GetAsync("/api/goals"))).EnumerateArray());
        }
        finally { await app.Cleanup(); }
    }

    [Fact]
    public async Task Goals_roundtrip_balance_basis_concurrency_and_workspace_isolation()
    {
        await using var app = new BackendFactory(secondWorkspace: true); using var demo = app.AuthClient(); using var live = app.AuthClient();
        live.DefaultRequestHeaders.Add("X-Banking-Mode", "Live");
        try
        {
            var seed = await Seed(app);
            Assert.Empty((await Read(await demo.GetAsync("/api/goals"))).EnumerateArray());
            var input = Input(seed.Account);
            var goal = await Read(await demo.PostAsJsonAsync("/api/goals", input)); var id = goal.GetProperty("id").GetGuid();
            Assert.Equal("Trip idea", goal.GetProperty("references")[0].GetProperty("label").GetString());
            var progress = await Read(await demo.GetAsync($"/api/goals/{id}/progress"));
            Assert.Equal(400, progress.GetProperty("measuredBalance").GetDecimal()); // Does not add ITAV.
            Assert.Equal(20, progress.GetProperty("completionPercent").GetDecimal());
            Assert.Equal("Unknown", progress.GetProperty("status").GetString());
            Assert.Equal("NO_ACTIVE_PLAN", progress.GetProperty("reason").GetString());
            Assert.Equal(HttpStatusCode.Conflict, (await demo.PostAsJsonAsync("/api/goals", input)).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await demo.PostAsJsonAsync("/api/goals", input with { Scope = "AllAccounts", AccountId = null })).StatusCode);
            var edit = input with { AccountId = seed.Other, Version = goal.GetProperty("version").GetString(), Notes = "Edited on mobile" };
            var updated = await Read(await demo.PutAsJsonAsync($"/api/goals/{id}", edit));
            Assert.Equal(HttpStatusCode.Conflict, (await demo.PutAsJsonAsync($"/api/goals/{id}", edit)).StatusCode);
            Assert.Equal(600, (await Read(await demo.GetAsync($"/api/goals/{id}/progress"))).GetProperty("measuredBalance").GetDecimal());
            Assert.Empty((await Read(await live.GetAsync("/api/goals"))).EnumerateArray());
            Assert.Equal(HttpStatusCode.NotFound, (await live.GetAsync($"/api/goals/{id}/progress")).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await live.PostAsJsonAsync("/api/goals", input)).StatusCode);
            var saved = (await Read(await demo.GetAsync("/api/goals")))[0];
            Assert.Equal("Edited on mobile", saved.GetProperty("notes").GetString());
            Assert.Equal(HttpStatusCode.NoContent, (await demo.DeleteAsync($"/api/goals/{id}?version={Uri.EscapeDataString(updated.GetProperty("version").GetString()!)}")).StatusCode);
        }
        finally { await app.Cleanup(); }
    }

    [Fact]
    public async Task Goal_validation_missing_stale_mixed_currency_and_explicit_plan()
    {
        await using var app = new BackendFactory(); using var client = app.AuthClient();
        try
        {
            var seed = await Seed(app);
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/goals", Input(seed.Account) with { References = [new("javascript:alert(1)")] })).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/goals", Input(seed.Account) with { Description = "" })).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/goals", Input(seed.Account) with { PlanStart = new(2026, 1, 1) })).StatusCode);
            var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(DateTimeOffset.UtcNow, "Europe/Copenhagen").DateTime);
            var goal = await Read(await client.PostAsJsonAsync("/api/goals", Input(seed.Other) with { Target = 1200, PlanStart = today.AddDays(-10), StartingBalance = 0, Deadline = today.AddDays(10) }));
            var path = $"/api/goals/{goal.GetProperty("id")}/progress";
            Assert.Equal("OnTrack", (await Read(await client.GetAsync(path))).GetProperty("status").GetString());
            await app.InScope(async s => { var db = s.GetRequiredService<BankingDb>(); (await db.Balances.SingleAsync(x => x.AccountId == seed.Other)).Amount = 500; await db.SaveChangesAsync(); });
            Assert.Equal("AtRisk", (await Read(await client.GetAsync(path))).GetProperty("status").GetString());
            await app.InScope(async s => { var db = s.GetRequiredService<BankingDb>(); (await db.Balances.SingleAsync(x => x.AccountId == seed.Other)).Amount = -400; await db.SaveChangesAsync(); });
            Assert.Equal("BehindPlan", (await Read(await client.GetAsync(path))).GetProperty("status").GetString());
            await app.InScope(async s => { var db = s.GetRequiredService<BankingDb>(); (await db.Balances.SingleAsync(x => x.AccountId == seed.Other)).ObservedAt = DateTimeOffset.UtcNow.AddDays(-3); await db.SaveChangesAsync(); });
            Assert.Equal("STALE_BALANCE", (await Read(await client.GetAsync(path))).GetProperty("reason").GetString());
            await app.InScope(async s => { var db = s.GetRequiredService<BankingDb>(); (await db.Accounts.FindAsync(seed.Other))!.Currency = "EUR"; await db.SaveChangesAsync(); });
            var mixed = await Read(await client.GetAsync(path));
            Assert.Equal("MIXED_CURRENCY_REQUIRES_CONVERSION", mixed.GetProperty("reason").GetString());
            Assert.Equal(JsonValueKind.Null, mixed.GetProperty("measuredBalance").ValueKind);
            await app.InScope(async s => { var db = s.GetRequiredService<BankingDb>(); (await db.Accounts.FindAsync(seed.Other))!.Currency = "DKK";
                db.Balances.Remove(await db.Balances.SingleAsync(x => x.AccountId == seed.Other)); await db.SaveChangesAsync(); });
            Assert.Equal("MISSING_BOOKED_BALANCE", (await Read(await client.GetAsync(path))).GetProperty("reason").GetString());
        }
        finally { await app.Cleanup(); }
    }

    [Fact]
    public async Task Budget_previews_are_read_only_exclude_transfers_reservations_and_explain_credits()
    {
        await using var app = new BackendFactory(secondWorkspace: true); using var client = app.AuthClient(); using var live = app.AuthClient();
        live.DefaultRequestHeaders.Add("X-Banking-Mode", "Live");
        try
        {
            var seed = await Seed(app);
            await app.InScope(async s =>
            {
                var db = s.GetRequiredService<BankingDb>();
                db.Transactions.AddRange(Entry(seed.Account, seed.Category, new(2026, 1, 10), -120),
                    Entry(seed.Account, seed.Category, new(2026, 2, 10), -180), Entry(seed.Account, seed.Category, new(2026, 3, 10), -300),
                    Entry(seed.Account, seed.Category, new(2026, 3, 12), 30), Entry(seed.Account, seed.Category, new(2026, 3, 15), -900, status: "PDNG"));
                var outgoing = Entry(seed.Account, seed.Category, new(2026, 2, 5), -500);
                var incoming = Entry(seed.Other, seed.Category, new(2026, 2, 5), 500);
                db.Transactions.AddRange(outgoing, incoming); db.Transfers.Add(new TransferMatch { OutgoingId = outgoing.Id, IncomingId = incoming.Id });
                await db.SaveChangesAsync();
            });
            const string path = "/api/budget-suggestions?month=2026-04-01&currency=DKK&months=3";
            var preview = await Read(await client.GetAsync(path));
            Assert.True(preview.GetProperty("previewOnly").GetBoolean());
            Assert.Equal(200, preview.GetProperty("suggestions")[0].GetProperty("proposedMonthlyLimit").GetDecimal());
            Assert.Equal(30, preview.GetProperty("categorizedCreditsNotNetted").GetDecimal());
            Assert.Empty((await Read(await client.GetAsync("/api/budgets"))).EnumerateArray());
            await Read(await client.PostAsJsonAsync("/api/budgets", new { categoryId = seed.Category, from = "2026-04-01", to = "2026-04-30", currency = "DKK", limit = 175 }));
            Assert.True((await Read(await client.GetAsync(path))).GetProperty("suggestions")[0].GetProperty("hasExistingBudget").GetBoolean());
            Assert.Equal(175, (await Read(await client.GetAsync("/api/budgets")))[0].GetProperty("limit").GetDecimal());
            Assert.Empty((await Read(await live.GetAsync(path))).GetProperty("suggestions").EnumerateArray());
            await app.InScope(async s => { var db = s.GetRequiredService<BankingDb>(); (await db.Accounts.FindAsync(seed.Account))!.EarliestTransaction = new(2026, 3, 1); await db.SaveChangesAsync(); });
            Assert.Equal(JsonValueKind.Null, (await Read(await client.GetAsync(path))).GetProperty("suggestions")[0].GetProperty("proposedMonthlyLimit").ValueKind);
        }
        finally { await app.Cleanup(); }
    }

    [Fact]
    public async Task Cash_flow_chart_reconciles_scope_gaps_and_signed_cumulative_totals()
    {
        await using var app = new BackendFactory(secondWorkspace: true); using var client = app.AuthClient(); using var live = app.AuthClient();
        live.DefaultRequestHeaders.Add("X-Banking-Mode", "Live");
        try
        {
            var seed = await Seed(app);
            await app.InScope(async s =>
            {
                var db = s.GetRequiredService<BankingDb>();
                db.Transactions.AddRange(Entry(seed.Account, seed.Category, new(2026, 6, 1), -200),
                    Entry(seed.Account, null, new(2026, 6, 3), 500), Entry(seed.Other, null, new(2026, 6, 3), -50),
                    Entry(seed.Account, null, new(2026, 6, 2), -90, status: "PDNG"));
                var undated = Entry(seed.Account, null, new(2026, 6, 1), -70); undated.BookingDate = null; db.Transactions.Add(undated);
                var euro = Entry(seed.Account, null, new(2026, 6, 1), -600); euro.Currency = "EUR"; db.Transactions.Add(euro);
                var outgoing = Entry(seed.Account, null, new(2026, 6, 2), -300); var incoming = Entry(seed.Other, null, new(2026, 6, 2), 300);
                db.Transactions.AddRange(outgoing, incoming); db.Transfers.Add(new TransferMatch { OutgoingId = outgoing.Id, IncomingId = incoming.Id });
                await db.SaveChangesAsync();
            });
            const string query = "?from=2026-06-01&to=2026-06-04&currency=DKK";
            var result = await Read(await client.GetAsync("/api/cash-flow" + query));
            var points = result.GetProperty("points").EnumerateArray().ToArray();
            Assert.Equal(4, points.Length); Assert.Equal(-200, points[0].GetProperty("cumulativeNet").GetDecimal());
            Assert.Equal(0, points[1].GetProperty("count").GetInt32()); Assert.Equal(250, points[3].GetProperty("cumulativeNet").GetDecimal());
            var insight = await Read(await client.GetAsync("/api/account-insights" + query));
            foreach (var key in new[] { "income", "spending", "net" })
                Assert.Equal(insight.GetProperty(key).GetDecimal(), points.Sum(x => x.GetProperty(key).GetDecimal()));
            Assert.Equal(1, result.GetProperty("excludedUndatedBookedCount").GetInt32());
            var scoped = await Read(await client.GetAsync("/api/cash-flow" + query + "&accountId=" + seed.Account));
            Assert.Equal(300, scoped.GetProperty("net").GetDecimal());
            Assert.Empty((await Read(await live.GetAsync("/api/cash-flow" + query))).GetProperty("points").EnumerateArray());
            Assert.Equal(HttpStatusCode.NotFound, (await live.GetAsync("/api/cash-flow" + query + "&accountId=" + seed.Account)).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/cash-flow?from=2020-01-01&to=2040-01-01&currency=DKK")).StatusCode);
        }
        finally { await app.Cleanup(); }
    }

    [Fact]
    public async Task Trends_use_equal_periods_and_do_not_invent_zero_baseline_percentages()
    {
        await using var app = new BackendFactory(); using var client = app.AuthClient();
        try
        {
            var seed = await Seed(app);
            await app.InScope(async s => { var db = s.GetRequiredService<BankingDb>();
                db.Transactions.AddRange(Entry(seed.Account, seed.Category, new(2026, 6, 1), -200), Entry(seed.Account, seed.Category, new(2026, 6, 2), 500)); await db.SaveChangesAsync(); });
            var result = await Read(await client.GetAsync("/api/trends?from=2026-06-01&to=2026-06-07&currency=DKK"));
            Assert.Equal("2026-05-25", result.GetProperty("previousFrom").GetString());
            Assert.Equal(300, result.GetProperty("current").GetProperty("net").GetDecimal());
            Assert.Equal(JsonValueKind.Null, result.GetProperty("change").GetProperty("income").GetProperty("percent").ValueKind);
        }
        finally { await app.Cleanup(); }
    }

    [Fact]
    public async Task Account_insights_reconcile_full_history_and_scope_transfers_balances_and_currency()
    {
        await using var app = new BackendFactory(secondWorkspace: true); using var client = app.AuthClient(); using var live = app.AuthClient();
        live.DefaultRequestHeaders.Add("X-Banking-Mode", "Live");
        try
        {
            var seed = await Seed(app);
            await app.InScope(async s =>
            {
                var db = s.GetRequiredService<BankingDb>();
                // More entries than a visible ledger page: insights must aggregate all of them.
                for (var day = 1; day <= 25; day++) db.Transactions.Add(Entry(seed.Account, seed.Category, new(2026, 6, day), -10));
                db.Transactions.AddRange(Entry(seed.Account, null, new(2026, 6, 1), 1000), Entry(seed.Other, null, new(2026, 6, 2), -50),
                    Entry(seed.Account, seed.Category, new(2026, 6, 3), -90, status: "PDNG"),
                    Entry(seed.Account, seed.Category, new(2026, 5, 1), -80));
                var euro = Entry(seed.Account, seed.Category, new(2026, 6, 1), -900); euro.Currency = "EUR"; db.Transactions.Add(euro);
                var undated = Entry(seed.Account, null, new(2026, 6, 1), -75); undated.BookingDate = null; db.Transactions.Add(undated);
                var outgoing = Entry(seed.Account, null, new(2026, 6, 4), -200);
                var incoming = Entry(seed.Other, null, new(2026, 6, 4), 200);
                db.Transactions.AddRange(outgoing, incoming); db.Transfers.Add(new TransferMatch { OutgoingId = outgoing.Id, IncomingId = incoming.Id });
                db.Balances.Add(new BalanceSnapshot { AccountId = seed.Account, Amount = 9999, Currency = "DKK", Type = "ITAV", ObservedAt = DateTimeOffset.UtcNow.AddDays(-10) });
                await db.SaveChangesAsync();
            });
            const string path = "/api/account-insights?from=2026-06-01&to=2026-06-30&currency=DKK";
            var all = await Read(await client.GetAsync(path));
            Assert.Equal(1000, all.GetProperty("income").GetDecimal()); Assert.Equal(300, all.GetProperty("spending").GetDecimal());
            Assert.Equal(700, all.GetProperty("net").GetDecimal());
            Assert.Equal(300, all.GetProperty("categories").EnumerateArray().Sum(x => x.GetProperty("amount").GetDecimal()));
            Assert.Equal(1, all.GetProperty("excludedUndatedBookedCount").GetInt32());
            Assert.Equal(JsonValueKind.Null, all.GetProperty("availableBalance").ValueKind); // Other account has booked only.
            var one = await Read(await client.GetAsync(path + "&accountId=" + seed.Account));
            Assert.Equal(250, one.GetProperty("spending").GetDecimal()); Assert.Equal(350, one.GetProperty("availableBalance").GetDecimal());
            Assert.Equal(75, one.GetProperty("retentionPercent").GetDecimal());
            var other = await Read(await client.GetAsync(path + "&accountId=" + seed.Other));
            Assert.Equal(0, other.GetProperty("income").GetDecimal()); Assert.Equal(50, other.GetProperty("spending").GetDecimal());
            Assert.Equal(JsonValueKind.Null, other.GetProperty("retentionPercent").ValueKind);
            var rows = await Read(await client.GetAsync("/api/transactions?from=2026-06-04&to=2026-06-04"));
            Assert.Equal(2, rows.GetProperty("items").EnumerateArray().Count(x => x.GetProperty("isInternalTransfer").GetBoolean()));
            Assert.Equal(0, (await Read(await live.GetAsync(path))).GetProperty("coverage").GetProperty("accountCount").GetInt32());
            Assert.Equal(HttpStatusCode.NotFound, (await live.GetAsync(path + "&accountId=" + seed.Account)).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync(path.Replace("2026-06-30", "2026-05-01"))).StatusCode);
        }
        finally { await app.Cleanup(); }
    }

    [Fact]
    public async Task Upcoming_requires_regular_patterns_and_advisor_is_explicitly_disconnected()
    {
        await using var app = new BackendFactory(); using var client = app.AuthClient();
        try
        {
            var seed = await Seed(app);
            await app.InScope(async s => { var db = s.GetRequiredService<BankingDb>();
                for (var month = 1; month <= 3; month++) db.Transactions.Add(Entry(seed.Account, seed.Category, new(2026, month, 10), -100, "Synthetic internet"));
                db.Transactions.Add(Entry(seed.Account, seed.Category, new(2026, 3, 1), -200, "One-off purchase")); await db.SaveChangesAsync(); });
            var result = await Read(await client.GetAsync("/api/upcoming-estimates?from=2026-04-01&days=30&currency=DKK"));
            Assert.False(result.GetProperty("isBankScheduledPayment").GetBoolean());
            var estimate = Assert.Single(result.GetProperty("estimates").EnumerateArray());
            Assert.Equal("2026-04-10", estimate.GetProperty("expectedDate").GetString()); Assert.Equal(100, estimate.GetProperty("amount").GetDecimal());
            Assert.Empty((await Read(await client.GetAsync("/api/upcoming-estimates?from=2026-04-01&days=30&currency=DKK&accountId=" + seed.Other))).GetProperty("estimates").EnumerateArray());
            Assert.Single((await Read(await client.GetAsync("/api/upcoming-estimates?from=2026-04-01&days=30&currency=DKK&accountId=" + seed.Account))).GetProperty("estimates").EnumerateArray());
            Assert.Empty((await Read(await client.GetAsync("/api/upcoming-estimates?from=2026-05-01&days=30&currency=DKK"))).GetProperty("estimates").EnumerateArray());
            var advisor = await Read(await client.GetAsync("/api/advisor/status"));
            Assert.Equal("not_connected", advisor.GetProperty("status").GetString());
            Assert.False(advisor.GetProperty("canChat").GetBoolean()); Assert.False(advisor.GetProperty("externalDataSharingEnabled").GetBoolean());
            Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync("/api/advisor/chat", new { message = "Test" })).StatusCode);
            using var unauthenticated = app.CreateClient();
            Assert.Equal(HttpStatusCode.Unauthorized, (await unauthenticated.GetAsync("/api/goals")).StatusCode);
        }
        finally { await app.Cleanup(); }
    }

    [Fact]
    public async Task Goal_details_survive_encrypted_restore_to_separate_database()
    {
        await using var app = new BackendFactory(); using var client = app.AuthClient();
        await using var restored = new BackendFactory("Banking_Restore_" + Guid.NewGuid().ToString("N"));
        var file = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N") + ".bankup");
        try
        {
            var seed = await Seed(app);
            await Read(await client.PostAsJsonAsync("/api/goals", Input(seed.Account)));
            await app.InScope(s => s.GetRequiredService<BackupService>().Export(file, default));
            using var restoredClient = restored.AuthClient();
            await restored.InScope(s => s.GetRequiredService<BackupService>().Restore(file, default));
            var result = (await Read(await restoredClient.GetAsync("/api/goals")))[0];
            Assert.Equal("A family holiday with time outdoors", result.GetProperty("description").GetString());
            Assert.Equal("https://example.com/trip", result.GetProperty("references")[0].GetProperty("url").GetString());
        }
        finally { await app.Cleanup(); await restored.Cleanup(); if (File.Exists(file)) File.Delete(file); }
    }
}

