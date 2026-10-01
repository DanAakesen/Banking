using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Banking.Api.Data;
using Banking.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static Banking.Tests.BackendTests;

namespace Banking.Tests;

public sealed class BudgetPlanTests
{
    [Fact]
    public async Task Advisor_append_preserves_existing_entries_replays_safely_and_uses_form_validation()
    {
        await using var app = new BackendFactory(secondWorkspace:true); using var client=app.AuthClient();
        try {
            var input=Plan(Entry("Salary",30000,type:"Income"),Entry("Rent",8000),Entry("Savings",4000,savings:true));
            var saved=await Read(await Save(client,input));
            var request=new AdvisorBudgetEntryInput(Guid.NewGuid(),Version(saved),"Internet","Expense",1200m,3);
            async Task Add(AdvisorBudgetEntryInput entry) => await app.InScope(async scope => { await scope.GetRequiredService<BudgetPlanService>().AddAdvisorEntry(input.Id,entry,CancellationToken.None); });
            await Add(request);await Add(request);
            var plans=await Read(await client.GetAsync("/api/budget-plans"));var plan=Assert.Single(plans.GetProperty("plans").EnumerateArray());
            Assert.Equal(4,plan.GetProperty("entries").GetArrayLength());
            Assert.Equal(8400,plan.GetProperty("monthly").GetProperty("expenses").GetDecimal());
            Assert.Equal(17600,plan.GetProperty("monthly").GetProperty("available").GetDecimal());
            foreach(var original in input.Entries)Assert.Contains(plan.GetProperty("entries").EnumerateArray(),e=>e.GetProperty("id").GetGuid()==original.Id&&e.GetProperty("amount").GetDecimal()==original.Amount);
            await Assert.ThrowsAsync<ApiFailure>(()=>Add(request with {Amount=999}));
            await Assert.ThrowsAsync<ApiFailure>(()=>Add(request with {RequestId=Guid.NewGuid(),Version=Version(plan),IntervalMonths=2}));
            await Assert.ThrowsAsync<DbUpdateConcurrencyException>(()=>Add(request with {RequestId=Guid.NewGuid(),Name="Stale write"}));
            var after=await Read(await client.GetAsync("/api/budget-plans"));Assert.Equal(4,after.GetProperty("plans")[0].GetProperty("entries").GetArrayLength());
        } finally { await app.Cleanup(); }
    }

    private static BudgetEntryInput Entry(string name, decimal amount, int interval = 1, string type = "Expense", bool savings = false) =>
        new(Guid.NewGuid(), name, type, savings, amount, interval);
    private static BudgetPlanInput Plan(params BudgetEntryInput[] entries) => new(Guid.NewGuid(), "Everyday", "DKK", entries, Guid.NewGuid());
    private static Task<HttpResponseMessage> Save(HttpClient c, BudgetPlanInput p) => c.PostAsJsonAsync("/api/budget-plans", p);
    private static string Version(JsonElement p) => p.GetProperty("version").GetString()!;

    [Fact]
    public async Task Category_progress_groups_allowances_excludes_transfers_and_preserves_workspace_isolation()
    {
        await using var app = new BackendFactory(secondWorkspace:true); using var c = app.AuthClient();
        using var live = app.AuthClient(); live.DefaultRequestHeaders.Add("X-Banking-Mode", "Live");
        try
        {
            var category = Guid.NewGuid();
            var month = new DateOnly(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1).AddMonths(-1);
            await app.InScope(async s =>
            {
                var db = s.GetRequiredService<BankingDb>();
                db.Categories.Add(new Category { Id = category, Name = "Food" });
                var connection = new Connection { IsDemo = true, Bank = "Fixture", ValidUntil = DateTimeOffset.UtcNow.AddDays(30) }; db.Connections.Add(connection);
                var account = new Account { ConnectionId = connection.Id, IdentityHash = "one", Name = "One", Currency = "DKK", Accessible = true, InitialImportCompleted = DateTimeOffset.UtcNow, EarliestTransaction = month.AddYears(-1), LastSuccess = DateTimeOffset.UtcNow };
                var other = new Account { ConnectionId = connection.Id, IdentityHash = "two", Name = "Two", Currency = "DKK", Accessible = true, InitialImportCompleted = DateTimeOffset.UtcNow, EarliestTransaction = month.AddYears(-1), LastSuccess = DateTimeOffset.UtcNow };
                db.Accounts.AddRange(account, other);
                BankTransaction Tx(decimal amount) => new() { AccountId = account.Id, SourceKey = Guid.NewGuid().ToString(), Description = "Food", Currency = "DKK", Amount = amount, CategoryId = category, BookingDate = month.AddDays(3), ObservedAt = DateTimeOffset.UtcNow };
                var outgoing = Tx(-500); var incoming = Tx(500); incoming.AccountId = other.Id;
                var pending = Tx(-900); pending.Status = "PDNG";
                var foreign = Tx(-1000); foreign.Currency = "EUR";
                var old = Tx(-2000); old.BookingDate = month.AddDays(-1);
                var actual = Tx(-700);
                db.Transactions.AddRange(actual, pending, foreign, old, outgoing, incoming);
                db.Transfers.Add(new() { OutgoingId = outgoing.Id, IncomingId = incoming.Id });
                await db.SaveChangesAsync();
            });
            var input = Plan(Entry("Weekly shop", 300) with { CategoryId = category }, Entry("Quarterly extras", 900,3) with { CategoryId = category }, Entry("Savings",100,savings:true));
            var saved = await Read(await Save(c,input));
            Assert.Equal(category,saved.GetProperty("entries")[0].GetProperty("categoryId").GetGuid());
            var result = await Read(await c.GetAsync($"/api/budget-plans/{input.Id}/progress?month={month:yyyy-MM-dd}"));
            var group = Assert.Single(result.GetProperty("groups").EnumerateArray());
            Assert.Equal(600,group.GetProperty("planned").GetDecimal());
            Assert.Equal(700,group.GetProperty("actual").GetDecimal());
            Assert.Equal(-100,group.GetProperty("remaining").GetDecimal());
            Assert.Equal("Over budget",group.GetProperty("status").GetString());
            Assert.Equal(0,result.GetProperty("actualIncome").GetDecimal());
            Assert.Equal(0,result.GetProperty("unmappedEntries").GetInt32());
            Assert.True(result.GetProperty("sufficientHistory").GetBoolean());
            Assert.Equal(HttpStatusCode.NotFound,(await live.GetAsync($"/api/budget-plans/{input.Id}/progress")).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest,(await Save(c,Plan(Entry("Invalid",1) with {CategoryId=Guid.NewGuid()}))).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest,(await Save(c,Plan(Entry("Savings category",1,savings:true) with {CategoryId=category}))).StatusCode);
            await app.InScope(async s => await s.GetRequiredService<BankingDb>().Transactions.Where(x=>x.Description=="Food" && x.Amount==-700).ExecuteUpdateAsync(x=>x.SetProperty(r=>r.CategoryId,(Guid?)null)));
            result = await Read(await c.GetAsync($"/api/budget-plans/{input.Id}/progress?month={month:yyyy-MM-dd}"));
            Assert.Contains(result.GetProperty("groups").EnumerateArray(), g=>g.GetProperty("status").GetString()=="Unbudgeted" && g.GetProperty("actual").GetDecimal()==700);
        }
        finally { await app.Cleanup(); }
    }

    [Fact]
    public async Task Recurrence_savings_and_negative_available_are_exact_and_isolated()
    {
        await using var app = new BackendFactory(secondWorkspace: true); using var client = app.AuthClient(); using var live = app.AuthClient(); live.DefaultRequestHeaders.Add("X-Banking-Mode", "Live");
        try
        {
            var input = Plan(Entry("Salary", 30000, type:"Income"), Entry("Housing",7800), Entry("Groceries",3000), Entry("Internet",1000,3),
                Entry("Insurance",4200,6), Entry("Subscriptions",1200,12), Entry("Transport",800), Entry("Savings",4000,savings:true));
            var p = await Read(await Save(client,input)); var totals = p.GetProperty("monthly");
            Assert.Equal(12733.33m, decimal.Round(totals.GetProperty("expenses").GetDecimal(),2));
            Assert.Equal(13266.67m, decimal.Round(totals.GetProperty("available").GetDecimal(),2));
            Assert.Equal(4000m,totals.GetProperty("savings").GetDecimal());
            Assert.Equal(159200m,p.GetProperty("annual").GetProperty("available").GetDecimal());
            Assert.False(p.GetProperty("isActive").GetBoolean());
            Assert.Equal(JsonValueKind.Null,(await Read(await client.GetAsync("/api/budget-plans/active"))).GetProperty("plan").ValueKind);
            Assert.Empty((await Read(await live.GetAsync("/api/budget-plans"))).GetProperty("plans").EnumerateArray());
            var edited=input with {RequestId=Guid.NewGuid(),Version=Version(p),Entries=[Entry("Expense only",1000,3)]};
            var deficit=await Read(await Save(client,edited));Assert.Equal(-333.33m,decimal.Round(deficit.GetProperty("monthly").GetProperty("available").GetDecimal(),2));
            Assert.Single(deficit.GetProperty("entries").EnumerateArray());
        }
        finally {await app.Cleanup();}
    }
    [Fact]
    public async Task Save_is_atomic_idempotent_and_rejects_stale_merge_and_invalid_types()
    {
        await using var app = new BackendFactory();using var c=app.AuthClient();
        try {
            var input=Plan(Entry("Manual internet",1000,3));var p=await Read(await Save(c,input));
            Assert.Equal(Version(p),Version(await Read(await Save(c,input))));
            Assert.Equal(HttpStatusCode.Conflict,(await Save(c,input with{Name="Different"})).StatusCode);
            var merged=input with {Version=Version(p),RequestId=Guid.NewGuid(),Entries=[input.Entries[0],Entry("Imported income",20000,type:"Income")]};
            var saved=await Read(await Save(c,merged));Assert.Equal(2,saved.GetProperty("entries").GetArrayLength());
            Assert.Equal(1000,saved.GetProperty("entries")[0].GetProperty("amount").GetDecimal());
            Assert.Equal(HttpStatusCode.Conflict,(await Save(c,merged with{RequestId=Guid.NewGuid(),Name="Stale"})).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest,(await Save(c,Plan(Entry("Impossible",1,type:"Income",savings:true)))).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest,(await Save(c,Plan(Entry("Invalid interval",1,2)))).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest,(await Save(c,Plan(Entry("Negative",-1)))).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest,(await Save(c,Plan())).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest,(await Save(c,Plan(merged.Entries[0]))).StatusCode);
            Assert.Single((await Read(await c.GetAsync("/api/budget-plans"))).GetProperty("plans").EnumerateArray());
        }finally{await app.Cleanup();}
    }
    [Fact]
    public async Task Activation_is_explicit_exclusive_versioned_and_scoped()
    {
        await using var app = new BackendFactory(secondWorkspace:true);using var c=app.AuthClient();using var live=app.AuthClient();live.DefaultRequestHeaders.Add("X-Banking-Mode","Live");
        try {
            var one=Plan(Entry("One",1));var two=Plan(Entry("Two",2));var p=await Read(await Save(c,one));var q=await Read(await Save(c,two));
            var active=await Read(await c.PostAsJsonAsync($"/api/budget-plans/{one.Id}/activation",new BudgetActivation(Version(p),null)));
            Assert.Equal(HttpStatusCode.Conflict,(await c.PostAsJsonAsync($"/api/budget-plans/{two.Id}/activation",new BudgetActivation(Version(q),null))).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound,(await live.PostAsJsonAsync($"/api/budget-plans/{one.Id}/activation",new BudgetActivation(Version(active),null))).StatusCode);
            Assert.Equal(HttpStatusCode.Conflict,(await c.DeleteAsync($"/api/budget-plans/{one.Id}?version={Uri.EscapeDataString(Version(active))}")).StatusCode);
            q=await Read(await c.PostAsJsonAsync($"/api/budget-plans/{two.Id}/activation",new BudgetActivation(Version(q),one.Id)));
            var all=(await Read(await c.GetAsync("/api/budget-plans"))).GetProperty("plans").EnumerateArray().ToArray();
            Assert.Single(all,x=>x.GetProperty("isActive").GetBoolean());
            Assert.Equal(two.Id,(await Read(await c.GetAsync("/api/budget-plans/active"))).GetProperty("plan").GetProperty("id").GetGuid());
            q=await Read(await c.PostAsJsonAsync($"/api/budget-plans/{two.Id}/activation",new BudgetActivation(Version(q),two.Id,false)));
            Assert.Equal(HttpStatusCode.NoContent,(await c.DeleteAsync($"/api/budget-plans/{two.Id}?version={Uri.EscapeDataString(Version(q))}")).StatusCode);
        }finally{await app.Cleanup();}
    }
    [Fact]
    public async Task Suggestions_include_credits_separately_exclude_transfers_and_never_write()
    {
        await using var app = new BackendFactory();using var c=app.AuthClient();
        try {
            var today=DateOnly.FromDateTime(DateTime.UtcNow);var start=new DateOnly(today.Year,today.Month,1);
            await app.InScope(async s=>{var db=s.GetRequiredService<BankingDb>();var connection=new Connection{IsDemo=true,Bank="Test",ValidUntil=DateTimeOffset.UtcNow.AddMonths(1)};db.Connections.Add(connection);
                var a=new Account{ConnectionId=connection.Id,IdentityHash="a",Name="Test",Currency="DKK",Accessible=true,InitialImportCompleted=DateTimeOffset.UtcNow,EarliestTransaction=start.AddYears(-1)};
                var b=new Account{ConnectionId=connection.Id,IdentityHash="b",Name="Savings",Currency="DKK",Accessible=true,InitialImportCompleted=DateTimeOffset.UtcNow,EarliestTransaction=start.AddYears(-1)};db.Accounts.AddRange(a,b);
                BankTransaction Tx(Guid account,string text,decimal amount)=>new(){AccountId=account,SourceKey=Guid.NewGuid().ToString(),Description=text,Amount=amount,Currency="DKK",BookingDate=start.AddDays(-5),ObservedAt=DateTimeOffset.UtcNow};
                var outgoing=Tx(a.Id,"Transfer",-3000);var incoming=Tx(b.Id,"Transfer",3000);
                db.Transactions.AddRange(outgoing,incoming,Tx(a.Id,"Internet",-1000),Tx(a.Id,"Salary",30000),Tx(a.Id,"Internet",100));
                db.Transfers.Add(new(){OutgoingId=outgoing.Id,IncomingId=incoming.Id});await db.SaveChangesAsync();});
            var preview=await Read(await c.GetAsync("/api/budget-plans/suggestions?currency=DKK&months=3"));Assert.True(preview.GetProperty("sufficientHistory").GetBoolean());
            var entries=preview.GetProperty("suggestions").EnumerateArray().ToArray();Assert.Equal(3,entries.Length);
            Assert.DoesNotContain(entries,x=>x.GetProperty("name").GetString()=="Transfer");
            Assert.Equal(333.33m,entries.Single(x=>x.GetProperty("type").GetString()=="Expense").GetProperty("amount").GetDecimal());
            Assert.Empty((await Read(await c.GetAsync("/api/budget-plans"))).GetProperty("plans").EnumerateArray());
            await app.InScope(async s=>{var db=s.GetRequiredService<BankingDb>();await db.Accounts.ExecuteUpdateAsync(x=>x.SetProperty(a=>a.Accessible,false));});
            preview=await Read(await c.GetAsync("/api/budget-plans/suggestions?currency=DKK&months=3"));Assert.False(preview.GetProperty("sufficientHistory").GetBoolean());
            Assert.All(preview.GetProperty("suggestions").EnumerateArray(),x=>Assert.Equal(JsonValueKind.Null,x.GetProperty("amount").ValueKind));
        }finally{await app.Cleanup();}
    }
    [Fact]
    public async Task Encrypted_restore_preserves_entries_and_active_plan()
    {
        await using var app=new BackendFactory();await using var restored=new BackendFactory("Banking_Restore_"+Guid.NewGuid().ToString("N"));using var c=app.AuthClient();using var r=restored.AuthClient();
        var file=Path.Combine(Path.GetTempPath(),"banking-test-"+Guid.NewGuid().ToString("N")+".bankup");
        try{var input=Plan(Entry("Savings",1200,12,savings:true));var p=await Read(await Save(c,input));await Read(await c.PostAsJsonAsync($"/api/budget-plans/{input.Id}/activation",new BudgetActivation(Version(p),null)));
            await app.InScope(s=>s.GetRequiredService<BackupService>().Export(file,default));Assert.DoesNotContain("Savings",await File.ReadAllTextAsync(file));
            await restored.InScope(s=>s.GetRequiredService<BackupService>().Restore(file,default));var active=(await Read(await r.GetAsync("/api/budget-plans/active"))).GetProperty("plan");
            Assert.Equal(input.Id,active.GetProperty("id").GetGuid());Assert.Equal(100,active.GetProperty("monthly").GetProperty("savings").GetDecimal());
        }finally{await app.Cleanup();await restored.Cleanup();File.Delete(file);}
    }
}
