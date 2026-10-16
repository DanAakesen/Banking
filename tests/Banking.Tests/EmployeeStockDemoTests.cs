using System.Text.Json;
using System.IO.Compression;
using System.Xml.Linq;
using Banking.Api.Data;
using Banking.Api.Providers;
using Banking.Api.Security;
using Banking.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace Banking.Tests;

public sealed class EmployeeStockDemoTests
{
    static readonly JsonSerializerOptions Json=new(JsonSerializerDefaults.Web);
    static JsonElement E(object value)=>JsonSerializer.SerializeToElement(value,Json);
    static EmployeeStockImportService Raw(PensionHistoryTests.Fixture f)=>new(f.Db,f.Workspace,new PensionHistoryTests.Clock(),f.Protection);
    internal static EmployeeStockReview Review(string variant,Guid? target=null,string? version=null){var (day,held,price,rate)=DemoEmployeeStockWorkbook.Values(variant);return new(day,true,held,day,true,false,null,price,day,DemoEmployeeStockWorkbook.Source,rate,day,DemoEmployeeStockWorkbook.Source,true,"DKK",target,version,true);}
    static async Task<EmployeeStockImportService> Demo(PensionHistoryTests.Fixture f)=>await Raw(f).ForSyntheticDemo(default);
    static async Task Seed(PensionHistoryTests.Fixture f){await f.Init("Demo");f.Db.Connections.Add(new(){Provider="product-demo",IsDemo=true});await f.Db.SaveChangesAsync();}
    [Theory]
    [InlineData("earlier",190,90,0)][InlineData("middle",168,100,12)][InlineData("later",152,110,18)]
    public void ThreeSheetOriginalHasDeterministicReconciledSourceFactsAndVariableSchedules(string variant,int unvested,int hireVested,int annualVested)
    {
        var bytes=DemoEmployeeStockWorkbook.Create(variant);Assert.Equal(bytes,DemoEmployeeStockWorkbook.Create(variant));var r=EmployeeStockWorkbook.Parse(bytes);
        using var zip=new ZipArchive(new MemoryStream(bytes));XNamespace rel="http://schemas.openxmlformats.org/package/2006/relationships";
        using var relStream=zip.GetEntry("xl/_rels/workbook.xml.rels")!.Open();var relationships=XDocument.Load(relStream).Root!;
        var shared=Assert.Single(relationships.Elements(rel+"Relationship"),x=>(string?)x.Attribute("Type")=="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings");
        Assert.Equal("sharedStrings.xml",(string?)shared.Attribute("Target"));Assert.NotNull(zip.GetEntry("xl/"+(string?)shared.Attribute("Target")));
        Assert.Equal(relationships.Elements().Count(),relationships.Elements().Select(x=>(string?)x.Attribute("Id")).Distinct().Count());
        Assert.Equal(2,r.Grants.Length);Assert.Equal(36,r.Schedules.Length);Assert.Equal(160,r.Grants[0].Awarded);Assert.Equal(120,r.Grants[1].Awarded);Assert.Equal(hireVested,r.Grants[0].Vested);Assert.Equal(annualVested,r.Grants[1].Vested);Assert.Equal(unvested,r.Grants.Sum(g=>g.Unvested));
        Assert.All(r.Grants,g=>{Assert.Equal(g.Awarded,g.Vested+g.Unvested);Assert.Equal(g.Awarded,r.Schedules.Where(s=>s.GrantKey==g.Key).Sum(s=>s.Shares));});
        Assert.Equal(r.Grants.Sum(g=>g.Vested),r.Transactions.Sum(t=>t.Quantity));Assert.All(r.Transactions,t=>Assert.Equal(t.Quantity,t.NetShares+t.SharesForTaxes));
        Assert.Contains(r.Transactions,t=>t.Date==new DateOnly(2024,12,2));Assert.Contains(r.Transactions,t=>t.Date==new DateOnly(2026,3,2));
        Assert.DoesNotContain(r.Warnings,w=>w.Code.Contains("RECONCIL")||w.Code.Contains("UNSUPPORTED"));Assert.Null(r.ReportAsOf);Assert.Null(r.CurrentHeldShares);Assert.Null(r.CurrentPrice);
    }
    [Fact]
    public async Task ThreeApprovedReportsUseSameImportContractAndOneCurrentProductWithProtectedHistoryAndOriginals()
    {
        await using var f=new PensionHistoryTests.Fixture();await Seed(f);f.Db.WealthRecords.Add(new(){Name="Existing unrelated pension",Kind="Pension",Value=431000});await f.Db.SaveChangesAsync();
        var path=Environment.GetEnvironmentVariable("STOCK_DEMO_BROWSER_FIXTURE");if(path is not null)Directory.CreateDirectory(path);
        var service=await Demo(f);Guid? target=null;JsonElement latest=default;
        foreach(var variant in new[]{"earlier","middle","later"}){
            var receipt=E(await service.UploadDemo(variant,default));Assert.True(receipt.GetProperty("synthetic").GetBoolean());Assert.Equal("NeedsReview",receipt.GetProperty("status").GetString());var id=receipt.GetProperty("id").GetGuid();
            Assert.Equal(DemoEmployeeStockWorkbook.Create(variant),(await service.Original(id,default)).Bytes);
            var row=target.HasValue?await f.Db.WealthRecords.SingleAsync(w=>w.Id==target):null;var review=Review(variant,row?.Id,row is null?null:Convert.ToBase64String(row.Version));
            await service.Approve(id,new(receipt.GetProperty("version").GetString()!,review,true,true),default);latest=E(await service.Detail(id,default));target=(await f.Db.WealthRecords.SingleAsync(w=>w.Kind=="Investment")).Id;
            if(path is not null){File.WriteAllText(Path.Combine(path,variant+"-approved.json"),latest.GetRawText());File.WriteAllBytes(Path.Combine(path,variant+".xlsx"),DemoEmployeeStockWorkbook.Create(variant));}
        }
        f.Db.ChangeTracker.Clear();service=await Demo(f);var history=E(await service.History(0,default));Assert.Equal(3,history.GetProperty("development").GetArrayLength());Assert.All(history.GetProperty("development").EnumerateArray(),d=>Assert.Equal(JsonValueKind.Null,d.GetProperty("returns").ValueKind));
        var current=await f.Db.WealthRecords.SingleAsync(w=>w.Kind=="Investment");Assert.Equal(122825m,current.Value);Assert.Equal("DKK",current.Currency);Assert.Equal(431000,(await f.Db.WealthRecords.SingleAsync(w=>w.Kind=="Pension")).Value);
        Assert.Equal(3,await f.Db.EmployeeStockDocuments.CountAsync());Assert.All(await f.Db.EmployeeStockDocuments.ToArrayAsync(),d=>Assert.True(d.Synthetic));
        foreach(var forbidden in new[]{"protectedOriginal","sourceIdentityKey","previewJson","dataJson","stockSourceKey","00008888","00009001","Eksempel"})Assert.DoesNotContain(forbidden,latest.GetRawText());
        // Repeated exact original keeps a receipt but links the canonical point, without remapping wealth.
        var duplicate=E(await service.UploadDemo("later",default));await service.Reuse(duplicate.GetProperty("id").GetGuid(),new(duplicate.GetProperty("version").GetString()!,latest.GetProperty("snapshotId").GetGuid(),true),default);
        Assert.Equal(4,await f.Db.EmployeeStockUploads.CountAsync());Assert.Equal(3,await f.Db.EmployeeStockSnapshots.CountAsync());Assert.Equal(current.Id,(await f.Db.WealthRecords.SingleAsync(w=>w.Kind=="Investment")).Id);Assert.Equal(current.Value,(await f.Db.WealthRecords.SingleAsync(w=>w.Kind=="Investment")).Value);
        if(path is not null)File.WriteAllText(Path.Combine(path,"history.json"),history.GetRawText());
        await Assert.ThrowsAsync<ApiFailure>(()=>service.AdvisorContext(default));
    }
    [Fact]
    public async Task DatedPositiveHoldingsAndUnknownValuationRemainUsefulWithoutAnyWealthMapping()
    {
        await using var f=new PensionHistoryTests.Fixture();await Seed(f);var service=await Demo(f);
        var path=Environment.GetEnvironmentVariable("STOCK_DEMO_BROWSER_FIXTURE");if(path is not null)Directory.CreateDirectory(path);
        foreach(var (name,day,held,price,rate) in new[]{("unmapped-known",1,12.5m,(decimal?)200m,(decimal?)6.25m),("unmapped-unknown",2,12.5m,null,null),("unmapped-zero",3,0m,null,null)}){
            var receipt=E(await service.UploadDemo("later",default));var date=new DateOnly(2026,10,day);
            var review=Review("later") with{ReportAsOf=date,HoldingAsOf=date,CurrentHeldShares=held,PriceUsd=price,PriceAsOf=price.HasValue?date:null,PriceSource=price.HasValue?DemoEmployeeStockWorkbook.Source:null,DkkPerUsd=rate,FxAsOf=rate.HasValue?date:null,FxSource=rate.HasValue?DemoEmployeeStockWorkbook.Source:null,IncludeInWealth=false,ConfirmNoDuplicateMapping=false};
            var id=receipt.GetProperty("id").GetGuid();await service.Approve(id,new(receipt.GetProperty("version").GetString()!,review,true,true),default);var detail=E(await service.Detail(id,default));
            Assert.False(detail.GetProperty("accepted").GetProperty("review").GetProperty("includeInWealth").GetBoolean());Assert.Empty(await f.Db.WealthRecords.ToArrayAsync());
            if(path is not null)File.WriteAllText(Path.Combine(path,name+".json"),detail.GetRawText());
        }
        Assert.Equal(3,E(await service.History(0,default)).GetProperty("development").GetArrayLength());
    }
    [Fact]
    public async Task DemoCannotReadPrivateDocumentEvenIfIdIsKnownAndLiveCannotReadSyntheticDocument()
    {
        await using var f=new PensionHistoryTests.Fixture();await f.Init();var owner=Raw(f);var privateReceipt=E(await owner.Upload(SyntheticStockWorkbook.Create(),default));var id=privateReceipt.GetProperty("id").GetGuid();
        var saved=E(await owner.Approve(id,new(privateReceipt.GetProperty("version").GetString()!,EmployeeStockHistoryTests.Review(),true,true),default));var snapshot=saved.GetProperty("snapshotId").GetGuid();
        var workspace=new Workspace();workspace.Select("Demo");await using var db=new BankingDb(PensionHistoryTests.Options(f.Connection),workspace);db.Connections.Add(new(){Provider="product-demo",IsDemo=true});await db.SaveChangesAsync();
        var demo=await new EmployeeStockImportService(db,workspace,new PensionHistoryTests.Clock(),f.Protection).ForSyntheticDemo(default);
        foreach(var call in new Func<Task<object>>[]{()=>demo.Detail(id,default),()=>demo.Snapshot(snapshot,default),async()=>{await demo.Original(id,default);return new{};},()=>demo.Reuse(id,new(privateReceipt.GetProperty("version").GetString()!,snapshot,true),default),()=>demo.Approve(id,new(privateReceipt.GetProperty("version").GetString()!,Review("later"),true,true),default)})Assert.Equal(404,(await Assert.ThrowsAsync<ApiFailure>(call)).Status);
        Assert.Equal(0,E(await demo.History(0,default)).GetProperty("total").GetInt32());
        var synthetic=E(await demo.UploadDemo("later",default));Assert.Equal(404,(await Assert.ThrowsAsync<ApiFailure>(()=>owner.Detail(synthetic.GetProperty("id").GetGuid(),default))).Status);
        await Assert.ThrowsAsync<ApiFailure>(()=>demo.Upload(SyntheticStockWorkbook.Create(),default));
    }
    [Fact]
    public async Task OnlyProductDemoWorkspaceMayOpenTheGeneratedSampleService()
    {
        await using var f=new PensionHistoryTests.Fixture();await f.Init();await Assert.ThrowsAsync<ApiFailure>(()=>Raw(f).ForSyntheticDemo(default));
        await using var d=new PensionHistoryTests.Fixture();await d.Init("Demo");await Assert.ThrowsAsync<ApiFailure>(()=>Raw(d).ForSyntheticDemo(default));
        d.Db.Connections.Add(new(){Provider="other",IsDemo=true});await d.Db.SaveChangesAsync();await Assert.ThrowsAsync<ApiFailure>(()=>Raw(d).ForSyntheticDemo(default));
    }
}
