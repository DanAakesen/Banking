using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Banking.Api.Data;
using Banking.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static Banking.Tests.BackendTests;

namespace Banking.Tests;

public sealed class GoalJourneyTests
{
    [Fact]
    public async Task Returned_contribution_reconciles_and_delays_forecast_without_counting_pending()
    {
        await using var app = new BackendFactory(secondWorkspace: true); using var client = app.AuthClient();
        using var live = app.AuthClient(); live.DefaultRequestHeaders.Add("X-Banking-Mode", "Live");
        try
        {
            var now = DateTimeOffset.UtcNow; var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(now, "Europe/Copenhagen").DateTime);
            var start = new DateOnly(today.Year, today.Month, 1).AddMonths(-2); var accountId = Guid.NewGuid();
            await app.InScope(async scope =>
            {
                var db = scope.GetRequiredService<BankingDb>(); var connection = new Connection { IsDemo = true, ValidUntil = now.AddDays(20) }; db.Connections.Add(connection);
                db.Accounts.Add(new() { Id = accountId, ConnectionId = connection.Id, IdentityHash = "journey", Currency = "DKK", Name = "Dedicated goal account", EarliestTransaction = start.AddYears(-1), InitialImportCompleted = now, LastSuccess = now });
                for (var i = 0; i < 3; i++) db.Transactions.Add(new() { AccountId = accountId, SourceKey = "deposit" + i, Currency = "DKK", Amount = 1000, BookingDate = start.AddMonths(i), ObservedAt = now, Description = "Contribution" });
                db.Transactions.Add(new() { AccountId = accountId, SourceKey = "returned", Currency = "DKK", Amount = -1000, BookingDate = start.AddMonths(1).AddDays(1), ObservedAt = now, Description = "Contribution returned" });
                db.Transactions.Add(new() { AccountId = accountId, SourceKey = "pending", Currency = "DKK", Amount = 9000, Status = "PDNG", BookingDate = today, ObservedAt = now });
                db.Balances.Add(new() { AccountId = accountId, Currency = "DKK", Amount = 7000, Type = "ITBD", ObservedAt = now }); await db.SaveChangesAsync();
            });
            var input = new GoalInput("Car", "Synthetic goal", 12000, "DKK", "Account", accountId, start.AddMonths(7), PlanStart: start, StartingBalance: 5000, MonthlyContribution: 1000);
            var goal = await Read(await client.PostAsJsonAsync("/api/goals", input)); var id = goal.GetProperty("id").GetGuid();
            var journey = await Read(await client.GetAsync($"/api/goals/{id}/journey"));
            Assert.Equal(5000, journey.GetProperty("openingBalance").GetDecimal());
            Assert.Equal(3000, journey.GetProperty("deposits").GetDecimal());
            Assert.Equal(1000, journey.GetProperty("withdrawals").GetDecimal());
            Assert.Equal(7000, journey.GetProperty("closingBalance").GetDecimal());
            Assert.Equal(1000, journey.GetProperty("shortfall").GetDecimal());
            Assert.Equal(1, journey.GetProperty("delayMonths").GetInt32());
            Assert.Equal("Missing", journey.GetProperty("months")[1].GetProperty("status").GetString());
            Assert.Equal(4, journey.GetProperty("transactionCount").GetInt32());
            Assert.Equal("BehindPlan", (await Read(await client.GetAsync($"/api/goals/{id}/progress"))).GetProperty("status").GetString());
            Assert.Equal(HttpStatusCode.NotFound, (await live.GetAsync($"/api/goals/{id}/journey")).StatusCode);

            // An actual catch-up restores the plan. Upcoming/pending entries cannot do this.
            await app.InScope(async scope => { var db = scope.GetRequiredService<BankingDb>(); db.Transactions.Add(new() { AccountId = accountId, SourceKey = "catch-up", Currency = "DKK", Amount = 1000, BookingDate = today, ObservedAt = now }); db.Balances.Add(new() { AccountId = accountId, Currency = "DKK", Amount = 8000, Type = "ITBD", ObservedAt = now.AddSeconds(1) }); await db.SaveChangesAsync(); });
            Assert.Equal("OnTrack", (await Read(await client.GetAsync($"/api/goals/{id}/progress"))).GetProperty("status").GetString());
            Assert.Equal(0, (await Read(await client.GetAsync($"/api/goals/{id}/journey"))).GetProperty("delayMonths").GetInt32());
            await app.InScope(async scope => { var db = scope.GetRequiredService<BankingDb>(); var account = await db.Accounts.FindAsync(accountId); account!.InitialImportCompleted = null; await db.Balances.Where(x => x.AccountId == accountId).ExecuteUpdateAsync(s => s.SetProperty(x => x.ObservedAt, now.AddDays(-3))); await db.SaveChangesAsync(); });
            var unknown = await Read(await client.GetAsync($"/api/goals/{id}/journey"));
            Assert.False(unknown.GetProperty("historyComplete").GetBoolean());
            Assert.Equal(JsonValueKind.Null, unknown.GetProperty("openingBalance").ValueKind);
            Assert.Equal(JsonValueKind.Null, unknown.GetProperty("forecastDate").ValueKind);
        }
        finally { await app.Cleanup(); }
    }

    [Fact]
    public async Task Goal_photos_are_scoped_versioned_and_reject_remote_or_active_content()
    {
        await using var app = new BackendFactory(secondWorkspace: true); using var client = app.AuthClient(); using var live = app.AuthClient(); live.DefaultRequestHeaders.Add("X-Banking-Mode", "Live");
        try
        {
            Guid id = Guid.Empty;
            await app.InScope(async scope => { var db = scope.GetRequiredService<BankingDb>(); var goal = new Goal { Name = "Photo fixture", Description = "Fixture", Target = 1000, Currency = "DKK" }; db.Goals.Add(goal); await db.SaveChangesAsync(); id = goal.Id; });
            var goal = (await Read(await client.GetAsync("/api/goals")))[0]; var version = goal.GetProperty("version").GetString()!;
            foreach (var bad in new[] { "https://example.com/photo.jpg", "data:image/svg+xml;base64,PHN2Zy8+", "data:image/jpeg;base64,eA==", "data:image/jpeg;base64,!" })
                Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/goals/{id}/photo", new GoalPhotoInput(bad, version))).StatusCode);
            // Transport validation fixture: JPEG start/end markers, never served as executable content.
            var data = "data:image/jpeg;base64," + Convert.ToBase64String(new byte[] { 255, 216, 255, 217 });
            var saved = await Read(await client.PutAsJsonAsync($"/api/goals/{id}/photo", new GoalPhotoInput(data, version)));
            Assert.True(saved.GetProperty("hasPhoto").GetBoolean());
            Assert.False(saved.TryGetProperty("photoDataUrl", out _));
            Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync($"/api/goals/{id}/photo", new GoalPhotoInput(null, version))).StatusCode);
            Assert.Equal(data, (await Read(await client.GetAsync($"/api/goals/{id}/photo"))).GetProperty("dataUrl").GetString());
            Assert.Equal(HttpStatusCode.NotFound, (await live.GetAsync($"/api/goals/{id}/photo")).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await live.PutAsJsonAsync($"/api/goals/{id}/photo", new GoalPhotoInput(null, version))).StatusCode);
            var removed = await Read(await client.PutAsJsonAsync($"/api/goals/{id}/photo", new GoalPhotoInput(null, saved.GetProperty("version").GetString()!)));
            Assert.False(removed.GetProperty("hasPhoto").GetBoolean());
        }
        finally { await app.Cleanup(); }
    }
}
