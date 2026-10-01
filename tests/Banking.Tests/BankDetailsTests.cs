using System.Net;
using System.Text.Json;
using Banking.Api.Data;
using Banking.Api.Providers;
using Banking.Api.Services;
using Banking.Api.Security;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static Banking.Tests.BackendTests;

namespace Banking.Tests;

public sealed class BankDetailsTests
{
    [Fact]
    public async Task Existing_live_history_enrichment_is_queued_once_after_the_normal_cooldown()
    {
        await using var app=new BackendFactory();using var client=app.AuthClient();
        try{await app.InScope(async s=>{
            var db=s.GetRequiredService<BankingDb>();var now=DateTimeOffset.UtcNow;
            var connection=new Connection {Provider="enable-banking",IsDemo=true,ValidUntil=now.AddDays(30)};
            var account=new Account {Connection=connection,IdentityHash="cooldown",Currency="DKK",InitialImportCompleted=now.AddDays(-1)};
            db.Accounts.Add(account);db.Jobs.Add(new SyncJob {Account=account,CreatedAt=now,LastAttemptAt=now,CompletedAt=now,Status="Completed"});await db.SaveChangesAsync();
            var service=s.GetRequiredService<ConnectionService>();await service.Queue(connection.Id,default);await service.Queue(connection.Id,default);
            var queued=await db.Jobs.SingleAsync(j=>j.Status=="Queued");Assert.True(queued.FullHistory);Assert.True(queued.NextAttempt>=now.AddHours(6));
        });}finally{await app.Cleanup();}
    }
    [Fact]
    public async Task Enrichment_resync_preserves_fallback_ids_manual_categories_and_transfer_matches()
    {
        var provider=new FaultProvider();await using var app=new BackendFactory(provider:provider);using var client=app.AuthClient();
        try
        {
            await Connect(client);await app.Tick();await app.Tick();
            List<Guid> ids=[];List<Guid> accountIds=[];Guid categoryId=default;
            await app.InScope(async s=>{var db=s.GetRequiredService<BankingDb>();var rows=await db.Transactions.ToListAsync();
                var category=new Category {Name="Manual choice"};db.Categories.Add(category);categoryId=category.Id;
                foreach(var row in rows){row.CategoryId=category.Id;row.Classification="Manual";}
                var outgoing=rows.FirstOrDefault(a=>a.Amount<0 && rows.Any(b=>b.AccountId!=a.AccountId && b.Amount==-a.Amount && b.Currency==a.Currency));
                if(outgoing is not null){var incoming=rows.First(b=>b.AccountId!=outgoing.AccountId && b.Amount==-outgoing.Amount && b.Currency==outgoing.Currency);db.Transfers.Add(new TransferMatch {OutgoingId=outgoing.Id,IncomingId=incoming.Id});}
                ids=rows.Select(x=>x.Id).Order().ToList();accountIds=await db.Accounts.Select(x=>x.Id).ToListAsync();await db.SaveChangesAsync();});
            provider.EnrichDetails=true;foreach(var account in accountIds)await Resync(app,account);
            await app.InScope(async s=>{var db=s.GetRequiredService<BankingDb>();var rows=await db.Transactions.ToListAsync();Assert.Equal(ids,rows.Select(x=>x.Id).Order().ToList());
                Assert.All(rows,x=>{Assert.Equal("Manual",x.Classification);Assert.Equal(categoryId,x.CategoryId);Assert.NotNull(x.BankDetailsJson);});
                Assert.DoesNotContain(await db.Jobs.ToListAsync(),x=>x.Status=="Failed");});
        }finally{await app.Cleanup();}
    }
    private static TransactionBankDetails Details(decimal? balance = 900, string? currency = "DKK", BankIdentifier? creditor = null) =>
        new("Synthetic shop", "Synthetic owner", creditor, null, "5411", "12", "32", "Card purchase", null, balance, currency);
    private static BankTransaction Row(decimal amount, decimal? after) => new() { Amount = amount, BankDetailsJson = BankDetails.Store(Details(after)) };

    [Fact]
    public void Adapter_masks_identifiers_and_metadata_never_changes_legacy_fallback_identity()
    {
        var json = JsonDocument.Parse("""{"transaction_amount":{"amount":"100.25","currency":"DKK"},"credit_debit_indicator":"DBIT","status":"BOOK","booking_date":"2026-09-01","remittance_information":["Synthetic shop"],"creditor":{"name":"Synthetic shop"},"creditor_account":{"iban":"DK5000400440116243"},"merchant_category_code":"5411","bank_transaction_code":{"code":"12","sub_code":"32","description":"Card purchase"},"balance_after_transaction":{"amount":"899.75","currency":"DKK"}}""");
        var parsed = EnableBankingProvider.ParseTransaction(json.RootElement);
        Assert.Equal(-100.25m,parsed.Amount); Assert.Equal(899.75m,parsed.Details!.BalanceAfter);
        Assert.Equal("•••• 6243",parsed.Details.CreditorAccount!.Masked);
        Assert.DoesNotContain("DK5000400440116243",JsonSerializer.Serialize(parsed));
        Assert.Equal(parsed.Details.CreditorAccount,EnableBankingProvider.Identifier("iban","dk50 0040 0440 1162 43"));
        var legacy = new { parsed.Reference, parsed.Amount, parsed.Currency, parsed.BookingDate, parsed.ValueDate, parsed.Description, parsed.Status };
        Assert.Equal(Vault.Hash(JsonSerializer.Serialize(legacy)),BankDetails.Fingerprint(parsed));
        Assert.Equal(BankDetails.Fingerprint(parsed),BankDetails.Fingerprint(parsed with { Details = null }));
    }

    [Fact]
    public void Closing_balance_requires_complete_unique_chain_and_preserves_negative_balances()
    {
        Assert.Equal(700m,BankDetails.ClosingBalance([Row(-200,700),Row(-100,900)],"DKK"));
        Assert.Equal(-50m,BankDetails.ClosingBalance([Row(-950,-50),Row(-100,900)],"DKK"));
        Assert.Null(BankDetails.ClosingBalance([Row(-100,900),Row(-100,null)],"DKK"));
        Assert.Null(BankDetails.ClosingBalance([Row(-100,900),Row(-50,400)],"DKK"));
        Assert.Null(BankDetails.ClosingBalance([Row(-100,900),Row(100,1000)],"DKK"));
        Assert.Null(BankDetails.ClosingBalance([Row(-100,900)],"EUR"));
    }

    [Fact]
    public async Task Details_and_history_are_workspace_scoped_and_review_suggests_without_changing_manual_choices()
    {
        await using var app = new BackendFactory(secondWorkspace:true); using var client = app.AuthClient();using var live = app.AuthClient();live.DefaultRequestHeaders.Add("X-Banking-Mode","Live");
        Guid aId=default,txId=default,categoryId=default;
        try
        {
            await app.InScope(async s=>{
                var db=s.GetRequiredService<BankingDb>(); var connection=new Connection {IsDemo=true,ValidUntil=DateTimeOffset.UtcNow.AddDays(30)};
                var a=new Account {Connection=connection,IdentityHash="details-a",Currency="DKK",Name="Bank name",CustomName="My account",IsSavings=true,
                    BankDetailsJson=BankDetails.Store(new AccountBankDetails("Household","CACC",null,[EnableBankingProvider.Identifier("IBAN","DK5000400440116243")!]))};
                var cat=new Category {Name="Groceries"}; db.Categories.Add(cat);db.Accounts.Add(a);
                var tx=new BankTransaction {Account=a,SourceKey="test-details",Amount=-100,Currency="DKK",Description="Synthetic shop",BookingDate=new(2026,9,1),BankDetailsJson=BankDetails.Store(Details(900,"DKK",EnableBankingProvider.Identifier("IBAN","DK5000400440116243")))};
                db.Transactions.Add(tx);await db.SaveChangesAsync();aId=a.Id;txId=tx.Id;categoryId=cat.Id;
            });
            var txResponse=await client.GetAsync($"/api/transactions/{txId}");var text=await txResponse.Content.ReadAsStringAsync();Assert.Equal(HttpStatusCode.OK,txResponse.StatusCode);
            Assert.DoesNotContain("fingerprint",text,StringComparison.OrdinalIgnoreCase);Assert.DoesNotContain("DK5000400440116243",text);
            Assert.Equal(HttpStatusCode.NotFound,(await live.GetAsync($"/api/transactions/{txId}")).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound,(await live.GetAsync($"/api/accounts/{aId}/balance-history?from=2026-09-01&to=2026-09-10")).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound,(await live.GetAsync($"/api/accounts/{aId}/bank-details")).StatusCode);
            var history=await Read(await client.GetAsync($"/api/accounts/{aId}/balance-history?from=2026-09-01&to=2026-09-10"));Assert.Equal(900m,history.GetProperty("points")[0].GetProperty("balance").GetDecimal());
            var review=await Read(await client.GetAsync("/api/review"));Assert.Equal(categoryId,review.GetProperty("items")[0].GetProperty("suggestedCategoryId").GetGuid());
            await app.InScope(async s=>{var db=s.GetRequiredService<BankingDb>();var tx=await db.Transactions.SingleAsync();Assert.Null(tx.CategoryId);Assert.Equal("Unclassified",tx.Classification);var a=await db.Accounts.SingleAsync();Assert.Equal("My account",a.CustomName);Assert.True(a.IsSavings);});
        }finally{await app.Cleanup();}
    }

    [Fact]
    public void Transfer_evidence_rejects_known_conflicts_and_accepts_only_matching_identifiers()
    {
        var own=EnableBankingProvider.Identifier("IBAN","DK5000400440116243")!;var foreign=EnableBankingProvider.Identifier("IBAN","DK5000400440119999")!;
        var a=new Account();var b=new Account {BankDetailsJson=BankDetails.Store(new AccountBankDetails(null,null,null,[own]))};
        var outgoing=new BankTransaction {AccountId=a.Id,BankDetailsJson=BankDetails.Store(Details(creditor:own))};var incoming=new BankTransaction {AccountId=b.Id};
        var accounts=new Dictionary<Guid,Account> {{a.Id,a},{b.Id,b}};
        Assert.Equal("AccountIdentity",ReviewService.TransferEvidence(outgoing,incoming,accounts));
        outgoing.BankDetailsJson=BankDetails.Store(Details(creditor:foreign));Assert.Equal("Conflict",ReviewService.TransferEvidence(outgoing,incoming,accounts));
        outgoing.BankDetailsJson=null;Assert.Equal("AmountAndDate",ReviewService.TransferEvidence(outgoing,incoming,accounts));
    }
}
