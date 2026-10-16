using System.Data;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Banking.Api.Data;
using Banking.Api.Providers;
using Banking.Api.Security;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace Banking.Api.Services;

public sealed record EmployeeStockReview(DateOnly ReportAsOf, bool ConfirmProfile,
    decimal? CurrentHeldShares, DateOnly? HoldingAsOf, bool ConfirmHoldings,
    bool Archived, DateOnly? EmploymentEndedOn,
    decimal? PriceUsd, DateOnly? PriceAsOf, string? PriceSource,
    decimal? DkkPerUsd, DateOnly? FxAsOf, string? FxSource,
    bool IncludeInWealth, string WealthCurrency, Guid? WealthRecordId, string? WealthVersion,
    bool ConfirmNoDuplicateMapping);
public sealed record EmployeeStockApproval(string Version, EmployeeStockReview Review, bool Confirm, bool AcknowledgeWarnings, Guid? SupersedesId = null);
public sealed record EmployeeStockAccepted(EmployeeStockReport Report, EmployeeStockReview Review,
    string Issuer = "Microsoft", string Symbol = "MSFT", string Custodian = "Fidelity", string Currency = "USD",
    string ProfileSource = "Owner-selected profile; not extracted from workbook");
public sealed record EmployeeStockReceiptAction(string Version);
public sealed record EmployeeStockReuse(string Version, Guid SnapshotId, bool Confirm);

public sealed class EmployeeStockImportService(BankingDb db, Workspace workspace, TimeProvider clock, IDataProtectionProvider protection)
{
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    static readonly SemaphoreSlim Writers = new(1, 1);
    const string Mapping = "microsoft-employee-stock-v1";
    IDataProtector Protector => protection.CreateProtector("Banking.EmployeeStock.Original.v1", workspace.Mode, workspace.DemoScope);
    void Owner() { if (workspace.Mode != "Live" || !workspace.OwnerAuthenticated) throw new ApiFailure(403, "OWNER_REQUIRED_FOR_PRIVATE_UPLOAD"); }
    DateOnly Today => DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(clock.GetUtcNow(), "Europe/Copenhagen").DateTime);
    async Task<T> Write<T>(string resource, Func<Task<T>> action, CancellationToken ct)
    {
        await Writers.WaitAsync(ct);
        try {
            await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
            if (db.Database.IsSqlServer()) await DatabaseLock.AcquireTransaction(db, "employee-stock:" + workspace.DemoScope + ":" + resource, ct);
            var result = await action(); await transaction.CommitAsync(ct); return result;
        } finally { Writers.Release(); }
    }
    public async Task<object> Upload(byte[] bytes, CancellationToken ct)
    {
        Owner();Check.That(bytes.Length is > 3 and <= EmployeeStockWorkbook.MaxBytes, "STOCK_FILE_TOO_LARGE");
        Check.That(bytes[0] == 'P' && bytes[1] == 'K' && bytes[2] == 3 && bytes[3] == 4, "STOCK_FILE_TYPE");
        var hash=Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
        var upload=await Write("upload:"+hash,async()=>{
            var document=await db.EmployeeStockDocuments.SingleOrDefaultAsync(d=>d.Hash==hash,ct);
            if(document is null){document=new(){Hash=hash,ByteLength=bytes.Length,ProtectedOriginal=Protector.Protect(bytes)};db.EmployeeStockDocuments.Add(document);}
            var receipt=new EmployeeStockUpload{DocumentId=document.Id,UploadedAt=clock.GetUtcNow()};db.EmployeeStockUploads.Add(receipt);
            await db.SaveChangesAsync(ct);return receipt;
        },ct);
        return await Parse(upload.Id,Convert.ToBase64String(upload.Version),ct);
    }
    async Task<EmployeeStockUpload> Find(Guid id,CancellationToken ct)=>await db.EmployeeStockUploads.SingleOrDefaultAsync(u=>u.Id==id,ct)??throw new ApiFailure(404,"STOCK_UPLOAD_NOT_FOUND");
    static void Pending(EmployeeStockUpload upload) => Check.That(upload.Status is "Uploaded" or "NeedsReview" or "Unsupported", "STOCK_RECEIPT_FINAL");
    public async Task<object> Parse(Guid id,string version,CancellationToken ct)
    {
        Owner();var upload=await Find(id,ct);Pending(upload);GoalService.Version(db,upload,version);
        var document=await db.EmployeeStockDocuments.AsNoTracking().SingleAsync(d=>d.Id==upload.DocumentId,ct);var bytes=Protector.Unprotect(document.ProtectedOriginal);
        EmployeeStockWorkbook.Extraction? extracted=null;string? error=null;
        try{extracted=EmployeeStockWorkbook.ParsePrivate(bytes,ct);}catch(ApiFailure f){error=f.Code;}finally{Array.Clear(bytes);}
        await Write("receipt:"+id,async()=>{
            await db.Entry(upload).ReloadAsync(ct);Pending(upload);GoalService.Version(db,upload,version);
            upload.PreviewJson=extracted is null?"":JsonSerializer.Serialize(extracted.Report,Json);upload.SourceIdentityKey=extracted?.IdentityKey;
            upload.ParserVersion=EmployeeStockWorkbook.Version;upload.Status=extracted is null?"Unsupported":"NeedsReview";upload.ErrorCode=error;
            db.Entry(upload).Property(x=>x.ParserVersion).IsModified=true;await db.SaveChangesAsync(ct);return true;
        },ct);
        return await Detail(id,ct);
    }
    public async Task<object> Detail(Guid id,CancellationToken ct)
    {
        Owner();var upload=await Find(id,ct);var document=await db.EmployeeStockDocuments.AsNoTracking().SingleAsync(d=>d.Id==upload.DocumentId,ct);
        var snapshot=upload.SnapshotId.HasValue?await db.EmployeeStockSnapshots.AsNoTracking().SingleAsync(s=>s.Id==upload.SnapshotId,ct):null;
        var accepted=snapshot is null?null:JsonSerializer.Deserialize<EmployeeStockAccepted>(snapshot.DataJson,Json);
        var report=accepted?.Report??(upload.PreviewJson.Length==0?null:JsonSerializer.Deserialize<EmployeeStockReport>(upload.PreviewJson,Json));
        var existing=await db.EmployeeStockSnapshots.AsNoTracking().Where(s=>s.DocumentId==document.Id).OrderByDescending(s=>s.ApprovedAt).Select(s=>new{s.Id,s.AsOf,s.ApprovedAt}).FirstOrDefaultAsync(ct);
        var products=await db.WealthRecords.AsNoTracking().Where(w=>w.Kind=="Investment").Take(100).ToArrayAsync(ct);
        return new{upload.Id,upload.UploadedAt,upload.Status,upload.ErrorCode,upload.Version,upload.ParserVersion,document.ByteLength,
            mediaType=EmployeeStockEndpoints.MediaType,report,accepted,upload.SnapshotId,existingApproval=existing,products,
            suggestedProductId=products.SingleOrDefault(p=>p.StockSourceKey==Mapping)?.Id,financialSaved=snapshot is not null};
    }
    public async Task<(byte[] Bytes,string Type)> Original(Guid id,CancellationToken ct)
    {
        Owner();var upload=await Find(id,ct);var document=await db.EmployeeStockDocuments.AsNoTracking().SingleAsync(d=>d.Id==upload.DocumentId,ct);
        return (Protector.Unprotect(document.ProtectedOriginal),EmployeeStockEndpoints.MediaType);
    }
    public async Task<object> Snapshot(Guid id,CancellationToken ct)
    {
        Owner();var row=await db.EmployeeStockSnapshots.AsNoTracking().SingleOrDefaultAsync(s=>s.Id==id,ct)??throw new ApiFailure(404,"STOCK_SNAPSHOT_NOT_FOUND");
        return new{row.Id,row.UploadId,row.AsOf,row.ApprovedAt,row.SupersedesId,accepted=JsonSerializer.Deserialize<EmployeeStockAccepted>(row.DataJson,Json)};
    }
    IQueryable<EmployeeStockSnapshot> Canonical()=>db.EmployeeStockSnapshots.AsNoTracking().Where(s=>!db.EmployeeStockSnapshots.Any(n=>n.SupersedesId==s.Id));
    public async Task<object> History(int offset,CancellationToken ct)
    {
        Owner();Check.That(offset is >=0 and <=100000,"INVALID_OFFSET");
        var items=await (from u in db.EmployeeStockUploads.AsNoTracking() join d in db.EmployeeStockDocuments.AsNoTracking() on u.DocumentId equals d.Id orderby u.UploadedAt descending,u.Id
            select new{u.Id,u.UploadedAt,u.Status,u.ErrorCode,u.ParserVersion,u.SnapshotId,d.ByteLength}).Skip(offset).Take(50).ToArrayAsync(ct);
        var snapshots=await Canonical().OrderByDescending(s=>s.AsOf).ThenByDescending(s=>s.ApprovedAt).Take(201).ToArrayAsync(ct);
        var development=snapshots.Take(200).Select(s=>{var data=JsonSerializer.Deserialize<EmployeeStockAccepted>(s.DataJson,Json)!;
            return new{s.Id,s.AsOf,s.ApprovedAt,currentHeldShares=data.Review.CurrentHeldShares,holdingAsOf=data.Review.HoldingAsOf,
                reportedPastVested=data.Report.Grants.Sum(g=>g.Vested),reportedUnvested=data.Report.Grants.Sum(g=>g.Unvested),
                returns=(decimal?)null,source="Approved dated report; no interpolation or inferred returns"};});
        var latest=snapshots.FirstOrDefault();
        return new{total=await db.EmployeeStockUploads.CountAsync(ct),offset,items,development,developmentHasMore=snapshots.Length>200,
            current=latest is null?null:new{id=latest.Id,uploadId=latest.UploadId,asOf=latest.AsOf,approvedAt=latest.ApprovedAt,accepted=JsonSerializer.Deserialize<EmployeeStockAccepted>(latest.DataJson,Json)}};
    }
    public async Task<object> Reject(Guid id,string version,CancellationToken ct)
    {
        Owner();return await Write("receipt:"+id,async()=>{var upload=await Find(id,ct);Pending(upload);GoalService.Version(db,upload,version);upload.Status="Rejected";await db.SaveChangesAsync(ct);return new{upload.Id,upload.Status,financialSaved=false};},ct);
    }
    public async Task<object> Reuse(Guid id,EmployeeStockReuse input,CancellationToken ct)
    {
        Owner();Check.That(input.Confirm,"STOCK_CONFIRMATION_REQUIRED");return await Write("profile",async()=>{
            var upload=await Find(id,ct);Pending(upload);GoalService.Version(db,upload,input.Version);
            var snapshot=await db.EmployeeStockSnapshots.AsNoTracking().SingleOrDefaultAsync(s=>s.Id==input.SnapshotId&&s.DocumentId==upload.DocumentId,ct)??throw new ApiFailure(404,"STOCK_SNAPSHOT_NOT_FOUND");
            upload.SnapshotId=snapshot.Id;upload.Status="Approved";await db.SaveChangesAsync(ct);return new{snapshotId=snapshot.Id,duplicate=true,wealthUpdated=false};
        },ct);
    }
    public async Task<object> Approve(Guid id,EmployeeStockApproval input,CancellationToken ct)
    {
        Owner();Check.That(input.Confirm&&input.AcknowledgeWarnings,"STOCK_CONFIRMATION_REQUIRED");Validate(input.Review,Today);
        return await Write("profile",async()=>{
            var upload=await Find(id,ct);Pending(upload);GoalService.Version(db,upload,input.Version);
            Check.That(upload.Status=="NeedsReview"&&upload.PreviewJson.Length>0&&upload.SourceIdentityKey is{Length:64},"STOCK_PREVIEW_REQUIRED");
            var report=JsonSerializer.Deserialize<EmployeeStockReport>(upload.PreviewJson,Json)!;
            var data=new EmployeeStockAccepted(report,input.Review);var json=JsonSerializer.Serialize(data,Json);
            var reviewHash=Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(json))).ToLowerInvariant();
            var duplicate=await db.EmployeeStockSnapshots.AsNoTracking().SingleOrDefaultAsync(s=>s.DocumentId==upload.DocumentId&&s.ReviewHash==reviewHash,ct);
            if(duplicate is not null){upload.Status="Approved";upload.SnapshotId=duplicate.Id;await db.SaveChangesAsync(ct);return new{snapshotId=duplicate.Id,duplicate=true,wealthUpdated=false};}
            var latest=await Canonical().OrderByDescending(s=>s.AsOf).ThenByDescending(s=>s.ApprovedAt).FirstOrDefaultAsync(ct);
            Check.That(latest is null||latest.SourceIdentityKey==upload.SourceIdentityKey,"STOCK_SOURCE_IDENTITY_CHANGED_REVIEW");
            var prior=await Canonical().SingleOrDefaultAsync(s=>s.AsOf==input.Review.ReportAsOf,ct);
            if(prior is not null&&input.SupersedesId!=prior.Id)throw new ApiFailure(409,"STOCK_CORRECTION_CONFIRMATION_REQUIRED",new{supersedesId=prior.Id,prior.ApprovedAt});
            Check.That(input.SupersedesId is null||prior?.Id==input.SupersedesId,"STOCK_CORRECTION_CHANGED");
            Guid? wealthId=null;
            if(input.Review.IncludeInWealth){Check.That(latest is null||input.Review.ReportAsOf>=latest.AsOf,"STOCK_HISTORICAL_REPORT_NO_WEALTH_UPDATE");wealthId=await MapWealth(input.Review,ct);}
            var snapshot=new EmployeeStockSnapshot{UploadId=upload.Id,DocumentId=upload.DocumentId,AsOf=input.Review.ReportAsOf,ApprovedAt=clock.GetUtcNow(),
                SourceIdentityKey=upload.SourceIdentityKey!,ReviewHash=reviewHash,DataJson=json,SupersedesId=prior?.Id,WealthRecordId=wealthId};
            db.EmployeeStockSnapshots.Add(snapshot);upload.Status="Approved";upload.SnapshotId=snapshot.Id;
            await db.SaveChangesAsync(ct);return new{snapshotId=snapshot.Id,duplicate=false,wealthUpdated=wealthId.HasValue};
        },ct);
    }
    async Task<Guid> MapWealth(EmployeeStockReview review,CancellationToken ct)
    {
        var mapped=await db.WealthRecords.SingleOrDefaultAsync(w=>w.StockSourceKey==Mapping,ct);
        Check.That(mapped is null||mapped.Id==review.WealthRecordId,"STOCK_EXISTING_MAPPING_REQUIRED");
        var row=review.WealthRecordId.HasValue?await db.WealthRecords.SingleOrDefaultAsync(w=>w.Id==review.WealthRecordId,ct)??throw new ApiFailure(404,"VALUATION_NOT_FOUND"):new WealthRecord();
        Check.That(row.Kind=="Investment"&&row.PensionSourceKey is null&&row.StockSourceKey is null or Mapping,"STOCK_INVALID_PRODUCT_MAPPING");
        if(review.WealthRecordId.HasValue)GoalService.Version(db,row,review.WealthVersion);
        else{
            Check.That(!await db.WealthRecords.AnyAsync(w=>w.Kind=="Investment"&&(w.Name.ToUpper().Contains("MICROSOFT")||w.Name.ToUpper().Contains("MSFT")),ct),"STOCK_POSSIBLE_DUPLICATE_MAP_EXISTING");
            Check.That(await db.WealthRecords.CountAsync(ct)<100,"VALUATION_LIMIT");db.WealthRecords.Add(row);
        }
        var value=review.CurrentHeldShares==0?0:review.CurrentHeldShares!.Value*review.PriceUsd!.Value*(review.WealthCurrency=="DKK"?review.DkkPerUsd!.Value:1);
        Check.That(value is >=0 and <=100000000,"INVALID_WEALTH_VALUE");
        row.StockSourceKey=Mapping;row.Name="Microsoft employee shares";row.Provider="Fidelity";row.Kind="Investment";row.Value=decimal.Round(value,2);row.Currency=review.WealthCurrency;
        row.AsOf=review.HoldingAsOf!.Value;row.SourceNote="Owner-confirmed current holdings and dated reviewed valuation. Conditional shares excluded.";
        row.AnnualPension=null;row.RetirementAge=null;return row.Id;
    }
    internal static void Validate(EmployeeStockReview r,DateOnly today)
    {
        bool Date(DateOnly? d)=>d.HasValue&&d.Value.Year>=1900&&d<=today;
        Check.That(r.ConfirmProfile&&Date(r.ReportAsOf),"STOCK_REVIEW_PROFILE_AND_DATE_REQUIRED");
        Check.That(r.CurrentHeldShares is null or >=0 and <=1000000000&&(!r.CurrentHeldShares.HasValue||decimal.Round(r.CurrentHeldShares.Value,8)==r.CurrentHeldShares),"STOCK_HOLDINGS_INVALID");
        Check.That(r.CurrentHeldShares.HasValue?r.ConfirmHoldings&&Date(r.HoldingAsOf):!r.ConfirmHoldings&&r.HoldingAsOf is null,"STOCK_HOLDING_DECLARATION_REQUIRED");
        Check.That(r.EmploymentEndedOn is null||r.Archived&&Date(r.EmploymentEndedOn),"STOCK_EMPLOYMENT_DATE_INVALID");
        Check.That(r.PriceUsd is null or >0 and <=1000000&&r.DkkPerUsd is null or >0 and <=10000,"STOCK_VALUATION_INVALID");
        Check.That(r.PriceUsd.HasValue?Date(r.PriceAsOf)&&!string.IsNullOrWhiteSpace(r.PriceSource):r.PriceAsOf is null&&string.IsNullOrEmpty(r.PriceSource),"STOCK_PRICE_PROVENANCE_REQUIRED");
        Check.That(r.DkkPerUsd.HasValue?Date(r.FxAsOf)&&!string.IsNullOrWhiteSpace(r.FxSource):r.FxAsOf is null&&string.IsNullOrEmpty(r.FxSource),"STOCK_FX_PROVENANCE_REQUIRED");
        if(r.PriceSource is not null)Check.Text(r.PriceSource,120);if(r.FxSource is not null)Check.Text(r.FxSource,120);
        Check.That(r.WealthCurrency is "USD" or "DKK","STOCK_WEALTH_CURRENCY_INVALID");
        if(r.IncludeInWealth)Check.That(r.ConfirmNoDuplicateMapping&&r.CurrentHeldShares.HasValue&&(r.CurrentHeldShares==0||r.PriceUsd.HasValue&&(r.WealthCurrency=="USD"||r.DkkPerUsd.HasValue)),"STOCK_WEALTH_REVIEW_REQUIRED");
        else Check.That(r.WealthRecordId is null&&r.WealthVersion is null,"STOCK_UNUSED_PRODUCT_MAPPING");
    }
    public async Task<object?> AdvisorContext(CancellationToken ct)
    {
        Owner();var current=await Canonical().OrderByDescending(s=>s.AsOf).ThenByDescending(s=>s.ApprovedAt).FirstOrDefaultAsync(ct);if(current is null)return null;
        var accepted=JsonSerializer.Deserialize<EmployeeStockAccepted>(current.DataJson,Json)!;
        return new{source="Approved owner-reviewed employee-share snapshot",current.AsOf,current.ApprovedAt,issuer="Microsoft",currency="USD",
            currentHeldShares=accepted.Review.CurrentHeldShares,holdingAsOf=accepted.Review.HoldingAsOf,
            conditionalUnvestedShares=accepted.Report.Grants.Sum(g=>g.Unvested),archived=accepted.Review.Archived,
            definition="Past vesting is historical, not current ownership. Conditional awards never enter wealth. No future vesting or returns inferred by clock; no trading or transfers."};
    }
}
