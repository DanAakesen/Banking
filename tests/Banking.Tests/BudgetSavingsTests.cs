using System.Net;
using System.Net.Http.Json;
using Banking.Api.Data;
using Banking.Api.Services;
using Microsoft.Extensions.DependencyInjection;
using static Banking.Tests.BackendTests;

namespace Banking.Tests;

public sealed class BudgetSavingsTests
{
    [Fact]
    public async Task Savings_measure_net_matched_account_contributions_without_double_counting()
    {
        await using var app = new BackendFactory(secondWorkspace: true);
        using var client = app.AuthClient();
        var month = new DateOnly(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1).AddMonths(-1);
        var a = Guid.NewGuid(); var b = Guid.NewGuid(); var c = Guid.NewGuid(); var category = Guid.NewGuid();
        try
        {
            await app.InScope(async s =>
            {
                var db = s.GetRequiredService<BankingDb>();
                var connection = new Connection { IsDemo = true, Bank = "Fixture", ValidUntil = DateTimeOffset.UtcNow.AddDays(30) };
                db.Connections.Add(connection); db.Categories.Add(new() { Id = category, Name = "Salary" });
                foreach (var id in new[] { a, b, c }) db.Accounts.Add(new() { Id = id, ConnectionId = connection.Id, IdentityHash = id.ToString(), Name = "Fixture", Currency = "DKK", Accessible = true, InitialImportCompleted = DateTimeOffset.UtcNow, EarliestTransaction = month.AddYears(-1), LastSuccess = DateTimeOffset.UtcNow });
                BankTransaction Tx(Guid account, decimal amount, string status = "BOOK") => new() { AccountId = account, SourceKey = Guid.NewGuid().ToString(), Description = "Fixture", Currency = "DKK", Amount = amount, BookingDate = month.AddDays(3), ObservedAt = DateTimeOffset.UtcNow, Status = status };
                void Transfer(Guid from, Guid to, decimal amount) { var debit = Tx(from, -amount); var credit = Tx(to, amount); db.Transactions.AddRange(debit, credit); db.Transfers.Add(new() { OutgoingId = debit.Id, IncomingId = credit.Id }); }
                Transfer(a, b, 3000); Transfer(b, a, 500); Transfer(b, c, 700); Transfer(a, c, 1500);
                var salary = Tx(a, 10000); salary.CategoryId = category;
                db.Transactions.AddRange(salary, Tx(a, -2000), Tx(b, 400, "PDNG"));
                await db.SaveChangesAsync();
            });
            BudgetEntryInput Entry(string name, decimal amount, Guid? account = null) => new(Guid.NewGuid(), name, "Expense", true, amount, 1, SavingsAccountId: account);
            var input = new BudgetPlanInput(Guid.NewGuid(), "Savings test", "DKK", [Entry("Holiday", 2000, b), Entry("Car", 2000, c), new(Guid.NewGuid(), "Salary", "Income", false, 10000, 1, CategoryId: category), new(Guid.NewGuid(), "Partner salary", "Income", false, 1000, 1, CategoryId: category)], Guid.NewGuid());
            var saved = await Read(await client.PostAsJsonAsync("/api/budget-plans", input));
            Assert.Equal(b, saved.GetProperty("entries")[0].GetProperty("savingsAccountId").GetGuid());
            var progress = await Read(await client.GetAsync($"/api/budget-plans/{input.Id}/progress?month={month:yyyy-MM-dd}"));
            Assert.Equal(4000, progress.GetProperty("actualSavings").GetDecimal());
            Assert.Equal(10000, progress.GetProperty("actualIncome").GetDecimal());
            Assert.Equal(2000, progress.GetProperty("actualExpenses").GetDecimal());
            Assert.Equal(4000, progress.GetProperty("actualAvailable").GetDecimal());
            var actuals = progress.GetProperty("entryActuals").EnumerateArray().ToDictionary(x => x.GetProperty("id").GetGuid());
            Assert.Equal(1800, actuals[input.Entries[0].Id].GetProperty("actual").GetDecimal());
            Assert.Equal(2200, actuals[input.Entries[1].Id].GetProperty("actual").GetDecimal());
            Assert.True(actuals[input.Entries[2].Id].GetProperty("sharedCategory").GetBoolean());
            Assert.Equal(System.Text.Json.JsonValueKind.Null, actuals[input.Entries[2].Id].GetProperty("actual").ValueKind);
            Assert.True(progress.GetProperty("completeMonth").GetBoolean());
            async Task<HttpResponseMessage> Save(params BudgetEntryInput[] entries) => await client.PostAsJsonAsync("/api/budget-plans", new BudgetPlanInput(Guid.NewGuid(), "Validation", "DKK", entries, Guid.NewGuid()));
            Assert.Equal(HttpStatusCode.BadRequest, (await Save(Entry("Duplicate", 1, b), Entry("Again", 1, b))).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await Save(Entry("Unknown", 1, Guid.NewGuid()))).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await Save(Entry("Ordinary", 1, b) with { IsSavings = false })).StatusCode);
            using var live = app.AuthClient(); live.DefaultRequestHeaders.Add("X-Banking-Mode", "Live");
            Assert.Equal(HttpStatusCode.BadRequest, (await live.PostAsJsonAsync("/api/budget-plans", new BudgetPlanInput(Guid.NewGuid(), "Cross workspace", "DKK", [Entry("Hidden", 1, b)], Guid.NewGuid()))).StatusCode);
            var unlinked = await Read(await Save(Entry("Unlinked", 100)));
            var unknown = await Read(await client.GetAsync($"/api/budget-plans/{unlinked.GetProperty("id").GetGuid()}/progress?month={month:yyyy-MM-dd}"));
            Assert.Equal(System.Text.Json.JsonValueKind.Null, unknown.GetProperty("actualSavings").ValueKind);
            Assert.Equal(System.Text.Json.JsonValueKind.Null, unknown.GetProperty("actualAvailable").ValueKind);
        }
        finally { await app.Cleanup(); }
    }
}
