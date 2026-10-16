using System.Text.Json;
using Banking.Api.Data;
using Banking.Api.Security;
using Banking.Api.Services;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace Banking.Tests;

public sealed class EmployeeStockHistoryTests
{
    static readonly JsonSerializerOptions Json=new(JsonSerializerDefaults.Web);
    static JsonElement E(object value)=>JsonSerializer.SerializeToElement(value,Json);
    static EmployeeStockImportService Service(PensionHistoryTests.Fixture f)=>new(f.Db,f.Workspace,new PensionHistoryTests.Clock(),f.Protection);
    internal static EmployeeStockReview Review(decimal? held=0,bool wealth=false)=>new(new(2026,10,1),true,held,held.HasValue?new(2026,10,1):null,held.HasValue,false,null,
        null,null,null,null,null,null,wealth,"DKK",null,null,wealth);
    static EmployeeStockApproval Approval(JsonElement receipt,EmployeeStockReview? review=null,Guid? prior=null)=>new(receipt.GetProperty("version").GetString()!,review??Review(),true,true,prior);
    static async Task<JsonElement> Upload(PensionHistoryTests.Fixture f,byte[]? bytes=null)=>E(await Service(f).Upload(bytes??SyntheticStockWorkbook.Create(),default));
    [Fact]
    public async Task EachUploadRetainsEncryptedOriginalAndReceiptButPreviewNeverCreatesFinancialState()
    {
        await using var f=new PensionHistoryTests.Fixture();await f.Init();var bytes=SyntheticStockWorkbook.Create();var one=await Upload(f,bytes);var two=await Upload(f,bytes);
        Assert.NotEqual(one.GetProperty("id").GetGuid(),two.GetProperty("id").GetGuid());Assert.Equal(2,await f.Db.EmployeeStockUploads.CountAsync());Assert.Equal(1,await f.Db.EmployeeStockDocuments.CountAsync());
        Assert.Empty(await f.Db.EmployeeStockSnapshots.ToArrayAsync());Assert.Empty(await f.Db.WealthRecords.ToArrayAsync());
        var document=await f.Db.EmployeeStockDocuments.SingleAsync();Assert.NotEqual(bytes,document.ProtectedOriginal);Assert.Equal(bytes,(await Service(f).Original(one.GetProperty("id").GetGuid(),default)).Bytes);
        var json=one.GetRawText();foreach(var name in new[]{"protectedOriginal","previewJson","dataJson","sourceIdentityKey","hash","FictionalFamily","00007321","00004123"})Assert.DoesNotContain(name,json);
    }
    [Fact]
    public async Task ApprovedZeroHoldingPreservesPastVestingAndNeverAddsConditionalSharesToWealth()
    {
        await using var f=new PensionHistoryTests.Fixture();await f.Init();f.Db.WealthRecords.Add(new(){Name="Existing pension",Provider="Fictional pension",Kind="Pension",Value=123000});await f.Db.SaveChangesAsync();
        var receipt=await Upload(f);var saved=E(await Service(f).Approve(receipt.GetProperty("id").GetGuid(),Approval(receipt),default));
        Assert.False(saved.GetProperty("wealthUpdated").GetBoolean());Assert.Single(await f.Db.WealthRecords.ToArrayAsync());Assert.Equal(123000,(await f.Db.WealthRecords.SingleAsync()).Value);
        var history=E(await Service(f).History(0,default));Assert.Equal(1,history.GetProperty("development").GetArrayLength());
        var accepted=history.GetProperty("current").GetProperty("accepted");Assert.Equal(0,accepted.GetProperty("review").GetProperty("currentHeldShares").GetDecimal());
        Assert.Equal(10.125m,accepted.GetProperty("report").GetProperty("grants")[0].GetProperty("vested").GetDecimal());
        Assert.Equal(JsonValueKind.Null,accepted.GetProperty("report").GetProperty("currentHeldShares").ValueKind);
        var advisor=E((await Service(f).AdvisorContext(default))!);Assert.Equal(0,advisor.GetProperty("currentHeldShares").GetDecimal());Assert.Equal(90.375m,advisor.GetProperty("conditionalUnvestedShares").GetDecimal());
        foreach(var raw in new[]{"grants","schedules","transactions","original","hash","sourceIdentityKey","00007321"})Assert.DoesNotContain('"'+raw+'"',advisor.GetRawText());
    }
    [Fact]
    public async Task MissingHoldingsAndValuationDoNotBlockUsefulApprovedHistory()
    {
        await using var f=new PensionHistoryTests.Fixture();await f.Init();var receipt=await Upload(f);
        await Service(f).Approve(receipt.GetProperty("id").GetGuid(),Approval(receipt,Review(null)),default);
        var history=E(await Service(f).History(0,default));Assert.Equal(JsonValueKind.Null,history.GetProperty("current").GetProperty("accepted").GetProperty("review").GetProperty("currentHeldShares").ValueKind);
        Assert.Empty(await f.Db.WealthRecords.ToArrayAsync());
    }
    [Fact]
    public async Task IdenticalReportAndReviewLinkCanonicalSnapshotButKeepBothUploadReceipts()
    {
        await using var f=new PensionHistoryTests.Fixture();await f.Init();var one=await Upload(f);var two=await Upload(f);
        var saved=E(await Service(f).Approve(one.GetProperty("id").GetGuid(),Approval(one),default));var duplicate=E(await Service(f).Approve(two.GetProperty("id").GetGuid(),Approval(two),default));
        Assert.True(duplicate.GetProperty("duplicate").GetBoolean());Assert.Equal(saved.GetProperty("snapshotId").GetGuid(),duplicate.GetProperty("snapshotId").GetGuid());
        Assert.Equal(2,await f.Db.EmployeeStockUploads.CountAsync());Assert.Equal(1,await f.Db.EmployeeStockSnapshots.CountAsync());Assert.Equal(1,E(await Service(f).History(0,default)).GetProperty("development").GetArrayLength());
    }
    [Fact]
    public async Task SameDateCorrectionRequiresExplicitSupersessionAndPreservesPreviousVersion()
    {
        await using var f=new PensionHistoryTests.Fixture();await f.Init();var one=await Upload(f);var original=E(await Service(f).Approve(one.GetProperty("id").GetGuid(),Approval(one),default));
        var two=await Upload(f,SyntheticStockWorkbook.Create(rows=>rows[2][0][5]=219.75m));
        var error=await Assert.ThrowsAsync<ApiFailure>(()=>Service(f).Approve(two.GetProperty("id").GetGuid(),Approval(two,Review(null)),default));Assert.Equal("STOCK_CORRECTION_CONFIRMATION_REQUIRED",error.Code);
        await Service(f).Approve(two.GetProperty("id").GetGuid(),Approval(two,Review(null),original.GetProperty("snapshotId").GetGuid()),default);
        Assert.Equal(2,await f.Db.EmployeeStockSnapshots.CountAsync());Assert.Equal(1,E(await Service(f).History(0,default)).GetProperty("development").GetArrayLength());
        var previous=E(await Service(f).Snapshot(original.GetProperty("snapshotId").GetGuid(),default));Assert.Equal(0,previous.GetProperty("accepted").GetProperty("review").GetProperty("currentHeldShares").GetDecimal());
    }
    [Fact]
    public async Task NewDatedReportCreatesRealHistoryPointAndArchiveNeverRewritesPastVesting()
    {
        await using var f=new PensionHistoryTests.Fixture();await f.Init();var one=await Upload(f);await Service(f).Approve(one.GetProperty("id").GetGuid(),Approval(one),default);
        var two=await Upload(f);var review=Review() with{ReportAsOf=new(2026,10,15),HoldingAsOf=new(2026,10,15),Archived=true};
        await Service(f).Approve(two.GetProperty("id").GetGuid(),Approval(two,review),default);
        var h=E(await Service(f).History(0,default));Assert.Equal(2,h.GetProperty("development").GetArrayLength());Assert.True(h.GetProperty("current").GetProperty("accepted").GetProperty("review").GetProperty("archived").GetBoolean());
        Assert.Equal(JsonValueKind.Null,h.GetProperty("current").GetProperty("accepted").GetProperty("review").GetProperty("employmentEndedOn").ValueKind);
        Assert.Equal(10.125m,h.GetProperty("current").GetProperty("accepted").GetProperty("report").GetProperty("grants")[0].GetProperty("vested").GetDecimal());
        Assert.Equal(JsonValueKind.Null,h.GetProperty("development")[0].GetProperty("returns").ValueKind);
    }
    [Fact]
    public async Task DifferentSingleAwardeeInLaterFileRequiresReviewInsteadOfReplacingOwnerState()
    {
        await using var f=new PensionHistoryTests.Fixture();await f.Init();var one=await Upload(f);await Service(f).Approve(one.GetProperty("id").GetGuid(),Approval(one),default);
        var two=await Upload(f,SyntheticStockWorkbook.Create(rows=>{foreach(var sheet in rows)foreach(var row in sheet)row[0]="00009999";}));
        var error=await Assert.ThrowsAsync<ApiFailure>(()=>Service(f).Approve(two.GetProperty("id").GetGuid(),Approval(two,Review() with{ReportAsOf=new(2026,10,15)}),default));Assert.Equal("STOCK_SOURCE_IDENTITY_CHANGED_REVIEW",error.Code);
        Assert.Equal(1,await f.Db.EmployeeStockSnapshots.CountAsync());Assert.Empty(await f.Db.WealthRecords.ToArrayAsync());
    }
    [Fact]
    public async Task FailedAndRejectedUploadsRetainOriginalAndFinalStatesCannotBeRetriedOrApproved()
    {
        await using var f=new PensionHistoryTests.Fixture();await f.Init();var receipt=await Upload(f,SyntheticStockWorkbook.Create(rows=>rows[0][0][4]="not-a-date"));Assert.Equal("Unsupported",receipt.GetProperty("status").GetString());
        var retry=E(await Service(f).Parse(receipt.GetProperty("id").GetGuid(),receipt.GetProperty("version").GetString()!,default));Assert.Equal(1,await f.Db.EmployeeStockUploads.CountAsync());
        await Service(f).Reject(retry.GetProperty("id").GetGuid(),retry.GetProperty("version").GetString()!,default);
        Assert.Equal("STOCK_RECEIPT_FINAL",(await Assert.ThrowsAsync<ApiFailure>(()=>Service(f).Parse(retry.GetProperty("id").GetGuid(),retry.GetProperty("version").GetString()!,default))).Code);
        Assert.NotEmpty((await Service(f).Original(retry.GetProperty("id").GetGuid(),default)).Bytes);
    }
    [Fact]
    public async Task ApprovedReceiptAndImmutableSourcesCannotBeReparsedOrChanged()
    {
        await using var f=new PensionHistoryTests.Fixture();await f.Init();var receipt=await Upload(f);await Service(f).Approve(receipt.GetProperty("id").GetGuid(),Approval(receipt),default);
        Assert.Equal("STOCK_RECEIPT_FINAL",(await Assert.ThrowsAsync<ApiFailure>(()=>Service(f).Parse(receipt.GetProperty("id").GetGuid(),receipt.GetProperty("version").GetString()!,default))).Code);
        var original=await f.Db.EmployeeStockDocuments.SingleAsync();original.ByteLength++;
        await Assert.ThrowsAsync<InvalidOperationException>(()=>f.Db.SaveChangesAsync());
    }
    [Fact]
    public async Task ScopeAndOwnerChecksProtectHistorySnapshotAndOriginal()
    {
        await using var f=new PensionHistoryTests.Fixture();await f.Init();var receipt=await Upload(f);var saved=E(await Service(f).Approve(receipt.GetProperty("id").GetGuid(),Approval(receipt),default));
        f.Workspace.DemoScope="different-scope";f.Db.ChangeTracker.Clear();
        Assert.Equal("STOCK_UPLOAD_NOT_FOUND",(await Assert.ThrowsAsync<ApiFailure>(()=>Service(f).Original(receipt.GetProperty("id").GetGuid(),default))).Code);
        Assert.Equal("STOCK_SNAPSHOT_NOT_FOUND",(await Assert.ThrowsAsync<ApiFailure>(()=>Service(f).Snapshot(saved.GetProperty("snapshotId").GetGuid(),default))).Code);
        Assert.Empty(E(await Service(f).History(0,default)).GetProperty("items").EnumerateArray());
        f.Workspace.OwnerAuthenticated=false;Assert.Equal(403,(await Assert.ThrowsAsync<ApiFailure>(()=>Service(f).History(0,default))).Status);
    }
    [Fact]
    public async Task ExplicitConfirmedHoldingMapsOneCurrentProductAndNeverCountsConditionalAwards()
    {
        await using var f=new PensionHistoryTests.Fixture();await f.Init();var one=await Upload(f);
        var review=Review(7,true) with{WealthCurrency="USD",PriceUsd=100,PriceAsOf=new(2026,10,1),PriceSource="Synthetic reviewed quote"};
        await Service(f).Approve(one.GetProperty("id").GetGuid(),Approval(one,review),default);var row=await f.Db.WealthRecords.SingleAsync();Assert.Equal(700,row.Value);
        var two=await Upload(f);var next=Review(0,true) with{ReportAsOf=new(2026,10,15),HoldingAsOf=new(2026,10,15),WealthRecordId=row.Id,WealthVersion=Convert.ToBase64String(row.Version)};
        await Service(f).Approve(two.GetProperty("id").GetGuid(),Approval(two,next),default);Assert.Single(await f.Db.WealthRecords.ToArrayAsync());Assert.Equal(0,row.Value);
        Assert.Equal(2,await f.Db.EmployeeStockSnapshots.CountAsync());Assert.DoesNotContain("stockSourceKey",JsonSerializer.Serialize(row,Json));
    }
    [Fact]
    public async Task DatedDkkPerUsdApprovalConvertsOnlyConfirmedHeldSharesAndUpdatesOneMappedProduct()
    {
        await using var f=new PensionHistoryTests.Fixture();await f.Init();var one=await Upload(f);
        var review=Review(12.5m,true) with{PriceUsd=200,PriceAsOf=new(2026,10,1),PriceSource="Synthetic USD per share quote",
            DkkPerUsd=6.25m,FxAsOf=new(2026,10,2),FxSource="Synthetic DKK per one USD rate"};
        var saved=E(await Service(f).Approve(one.GetProperty("id").GetGuid(),Approval(one,review),default));
        f.Db.ChangeTracker.Clear();var row=await f.Db.WealthRecords.SingleAsync();var productId=row.Id;
        Assert.True(saved.GetProperty("wealthUpdated").GetBoolean());Assert.Equal("DKK",row.Currency);
        Assert.Equal(15625m,row.Value); // 12.5 owner-declared shares * 200 USD/share * 6.25 DKK/USD
        var snapshot=E(await Service(f).Snapshot(saved.GetProperty("snapshotId").GetGuid(),default)).GetProperty("accepted").GetProperty("review");
        Assert.Equal(6.25m,snapshot.GetProperty("dkkPerUsd").GetDecimal());Assert.Equal("2026-10-02",snapshot.GetProperty("fxAsOf").GetString());
        Assert.Equal(200,snapshot.GetProperty("priceUsd").GetDecimal());Assert.Equal("2026-10-01",snapshot.GetProperty("priceAsOf").GetString());
        var two=await Upload(f);var next=review with{ReportAsOf=new(2026,10,15),HoldingAsOf=new(2026,10,15),CurrentHeldShares=10,
            PriceUsd=240,PriceAsOf=new(2026,10,14),DkkPerUsd=6.5m,FxAsOf=new(2026,10,14),
            WealthRecordId=productId,WealthVersion=Convert.ToBase64String(row.Version)};
        await Service(f).Approve(two.GetProperty("id").GetGuid(),Approval(two,next),default);
        f.Db.ChangeTracker.Clear();row=await f.Db.WealthRecords.SingleAsync();Assert.Equal(productId,row.Id);Assert.Equal(15600m,row.Value);
        Assert.Equal(2,await f.Db.EmployeeStockSnapshots.CountAsync());
        Assert.Equal(2,E(await Service(f).History(0,default)).GetProperty("development").GetArrayLength());
    }
    [Fact]
    public void ReviewRequiresDatedDeclarationAndFiniteBoundedValuationProvenance()
    {
        var today=new DateOnly(2026,10,15);
        foreach(var bad in new[]{Review() with{ConfirmHoldings=false},Review() with{HoldingAsOf=null},Review() with{ReportAsOf=new(2027,1,1)},Review() with{PriceUsd=100},Review() with{DkkPerUsd=10001},Review() with{EmploymentEndedOn=new(2026,10,1)},Review(1,true)})
            Assert.Throws<ApiFailure>(()=>EmployeeStockImportService.Validate(bad,today));
        EmployeeStockImportService.Validate(Review(null),today);EmployeeStockImportService.Validate(Review(0,true),today);
    }
    [Fact]
    public async Task ExportsRealSyntheticRetainedDtosForResponsiveBrowserChecksWhenRequested()
    {
        var path=Environment.GetEnvironmentVariable("STOCK_HISTORY_BROWSER_FIXTURE");if(string.IsNullOrEmpty(path))return;Directory.CreateDirectory(path);
        await using var f=new PensionHistoryTests.Fixture();await f.Init();
        var earlierBytes=SyntheticStockWorkbook.Create();var laterBytes=SyntheticStockWorkbook.Create(rows=>rows[2][0][5]=227.5m);
        var earlier=await Upload(f,earlierBytes);await Service(f).Approve(earlier.GetProperty("id").GetGuid(),Approval(earlier),default);
        var earlierApproved=E(await Service(f).Detail(earlier.GetProperty("id").GetGuid(),default));var earlierHistory=E(await Service(f).History(0,default));
        var later=await Upload(f,laterBytes);await Service(f).Approve(later.GetProperty("id").GetGuid(),Approval(later,Review() with{ReportAsOf=new(2026,10,15),HoldingAsOf=new(2026,10,15),Archived=true}),default);
        var laterApproved=E(await Service(f).Detail(later.GetProperty("id").GetGuid(),default));var history=E(await Service(f).History(0,default));
        foreach(var (name,value) in new[]{("earlier-upload",earlier),("later-upload",later),("earlier-approved",earlierApproved),("later-approved",laterApproved),("earlier-history",earlierHistory),("history",history)})File.WriteAllText(Path.Combine(path,name+".json"),value.GetRawText());
        var correctionBytes=SyntheticStockWorkbook.Create(rows=>{rows[2][0][5]=235m;rows[2][0][11]=(decimal)rows[2][0][4]!*235m;});
        var correction=await Upload(f,correctionBytes);var priorId=laterApproved.GetProperty("snapshotId").GetGuid();
        var prior=E(await Service(f).Snapshot(priorId,default));
        await Service(f).Approve(correction.GetProperty("id").GetGuid(),Approval(correction,Review(null) with{ReportAsOf=new(2026,10,15),Archived=true},priorId),default);
        var correctionApproved=E(await Service(f).Detail(correction.GetProperty("id").GetGuid(),default));var correctedHistory=E(await Service(f).History(0,default));
        var duplicate=await Upload(f,earlierBytes);await Service(f).Reuse(duplicate.GetProperty("id").GetGuid(),new(duplicate.GetProperty("version").GetString()!,earlierApproved.GetProperty("snapshotId").GetGuid(),true),default);
        var duplicateApproved=E(await Service(f).Detail(duplicate.GetProperty("id").GetGuid(),default));var duplicateHistory=E(await Service(f).History(0,default));
        foreach(var (name,value) in new[]{("correction-upload",correction),("correction-approved",correctionApproved),("corrected-history",correctedHistory),("later-snapshot",prior),("duplicate-upload",duplicate),("duplicate-approved",duplicateApproved),("duplicate-history",duplicateHistory)})File.WriteAllText(Path.Combine(path,name+".json"),value.GetRawText());
        File.WriteAllBytes(Path.Combine(path,"correction.xlsx"),correctionBytes);
        File.WriteAllBytes(Path.Combine(path,"earlier.xlsx"),earlierBytes);File.WriteAllBytes(Path.Combine(path,"later.xlsx"),laterBytes);
    }
    [Fact]
    public async Task OldReportCanAddHistoryButCannotOverwriteCurrentMappedWealth()
    {
        await using var f=new PensionHistoryTests.Fixture();await f.Init();var one=await Upload(f);
        var latest=Review(7,true) with{ReportAsOf=new(2026,10,15),HoldingAsOf=new(2026,10,15),WealthCurrency="USD",PriceUsd=100,PriceAsOf=new(2026,10,15),PriceSource="Synthetic reviewed quote"};
        await Service(f).Approve(one.GetProperty("id").GetGuid(),Approval(one,latest),default);var product=await f.Db.WealthRecords.SingleAsync();var two=await Upload(f);
        var older=latest with{ReportAsOf=new(2026,10,1),HoldingAsOf=new(2026,10,1),WealthRecordId=product.Id,WealthVersion=Convert.ToBase64String(product.Version)};
        Assert.Equal("STOCK_HISTORICAL_REPORT_NO_WEALTH_UPDATE",(await Assert.ThrowsAsync<ApiFailure>(()=>Service(f).Approve(two.GetProperty("id").GetGuid(),Approval(two,older),default))).Code);
        await Service(f).Approve(two.GetProperty("id").GetGuid(),Approval(two,Review()),default);
        Assert.Equal(700,product.Value);Assert.Equal("2026-10-15",E(await Service(f).History(0,default)).GetProperty("current").GetProperty("asOf").GetString());
    }
    [Fact]
    public async Task MappingReviewBlocksDuplicateManualMicrosoftAndMappedProductManualOverwrite()
    {
        await using var f=new PensionHistoryTests.Fixture();await f.Init();var manual=new WealthRecord{Name="microsoft manual statement",Provider="Fictional custody",Value=50,Currency="USD",AsOf=new(2026,10,1)};
        f.Db.WealthRecords.Add(manual);await f.Db.SaveChangesAsync();var receipt=await Upload(f);
        var review=Review(7,true) with{WealthCurrency="USD",PriceUsd=100,PriceAsOf=new(2026,10,1),PriceSource="Synthetic reviewed quote"};
        Assert.Equal("STOCK_POSSIBLE_DUPLICATE_MAP_EXISTING",(await Assert.ThrowsAsync<ApiFailure>(()=>Service(f).Approve(receipt.GetProperty("id").GetGuid(),Approval(receipt,review),default))).Code);
        review=review with{WealthRecordId=manual.Id,WealthVersion=Convert.ToBase64String(manual.Version)};await Service(f).Approve(receipt.GetProperty("id").GetGuid(),Approval(receipt,review),default);
        Assert.Single(await f.Db.WealthRecords.ToArrayAsync());Assert.Equal(700,manual.Value);
        var wealth=new WealthService(f.Db,new PensionHistoryTests.Clock(),f.Workspace,f.Service);
        Assert.Equal("EMPLOYEE_STOCK_REVIEW_REQUIRED",(await Assert.ThrowsAsync<ApiFailure>(()=>wealth.Save(manual.Id,new("Manual change","Fidelity","Investment",500,"USD",new(2026,10,1),"Synthetic note",Version:Convert.ToBase64String(manual.Version)),default))).Code);
        Assert.Equal("EMPLOYEE_STOCK_REVIEW_REQUIRED",(await Assert.ThrowsAsync<ApiFailure>(()=>wealth.Delete(manual.Id,Convert.ToBase64String(manual.Version),default))).Code);
        Assert.Equal(700,manual.Value);Assert.Equal("EmployeeStockImport",manual.ManagedBy);
    }
}
