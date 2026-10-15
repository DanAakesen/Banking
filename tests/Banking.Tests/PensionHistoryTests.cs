using System.Text.Json;
using Banking.Api.Data;
using Banking.Api.Providers;
using Banking.Api.Security;
using Banking.Api.Services;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Banking.Tests;

// Relational test fixture only. Never launches the business host or connects to real SQL.
public sealed class PensionHistoryTests
{
    internal static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    internal sealed class Clock : TimeProvider { public override DateTimeOffset GetUtcNow() => new(2026, 10, 15, 12, 0, 0, TimeSpan.Zero); }
    internal sealed class Reader : IPensionPdfReader
    { public Task<PensionReport> Read(byte[] bytes, CancellationToken ct) {
        try { return Task.FromResult(PensionReportParser.Parse(bytes, ct)); }
        catch(ApiFailure) { throw; } catch { throw new ApiFailure(400,"INVALID_PENSION_PDF"); }
    } }
    internal sealed class Model(ModelCustomizerDependencies deps) : ModelCustomizer(deps)
    {
        public override void Customize(ModelBuilder model, DbContext context)
        {
            base.Customize(model, context);
            foreach (var entity in model.Model.GetEntityTypes()) foreach (var property in entity.GetProperties())
            {
                if (property.Name == "Version") { property.ValueGenerated = Microsoft.EntityFrameworkCore.Metadata.ValueGenerated.Never; }
                if (property.GetColumnType() == "nvarchar(max)") property.SetColumnType("TEXT");
                if (property.GetColumnType() == "varbinary(max)") property.SetColumnType("BLOB");
                if (property.ClrType == typeof(DateTimeOffset)) property.SetValueConverter(new ValueConverter<DateTimeOffset, long>(v => v.UtcTicks, v => new DateTimeOffset(v, TimeSpan.Zero)));
            }
        }
    }
    internal sealed class Versions : SaveChangesInterceptor
    {
        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData data, InterceptionResult<int> result, CancellationToken ct = default)
        {
            foreach (var entry in data.Context!.ChangeTracker.Entries<Entity>().Where(e => e.State is EntityState.Added or EntityState.Modified))
                entry.Entity.Version = Guid.NewGuid().ToByteArray()[..8];
            return ValueTask.FromResult(result);
        }
    }
    internal static DbContextOptions<BankingDb> Options(SqliteConnection connection) => new DbContextOptionsBuilder<BankingDb>()
        .UseSqlite(connection).ReplaceService<IModelCustomizer, Model>().AddInterceptors(new Versions()).Options;
    internal sealed class Fixture : IAsyncDisposable
    {
        public readonly SqliteConnection Connection = new("Data Source=:memory:");
        public readonly IDataProtectionProvider Protection = new EphemeralDataProtectionProvider();
        public readonly Workspace Workspace = new() { OwnerAuthenticated = true };
        public BankingDb Db = null!;
        public PensionImportService Service => new(Db, Workspace, new Clock(), Protection, new Reader());
        public async Task Init(string mode = "Live", string scope = "") { Workspace.Select(mode); Workspace.DemoScope = scope; await Connection.OpenAsync(); Db = new(Options(Connection), Workspace); await Db.Database.EnsureCreatedAsync(); }
        public async Task<JsonElement> Upload(string sample = "later") => Element(await Service.Upload(SyntheticPensionReport.Create(sample), "application/pdf", Workspace.Mode == "Demo", default));
        public PensionApproval Approval(JsonElement receipt, Guid? supersedes = null)
        {
            var report = receipt.GetProperty("report").Deserialize<PensionReport>(Json)!;
            var products = Db.WealthRecords.ToArray();
            return new(receipt.GetProperty("version").GetString()!, report.ReportAsOf!.Value, report,
                report.Agreements.Select(a => { var row = products.FirstOrDefault(w => w.PensionSourceKey == a.Key); return new PensionTarget(a.Key, row?.Id, row is null ? null : Convert.ToBase64String(row.Version)); }).ToArray(), true, true, supersedes);
        }
        public async ValueTask DisposeAsync() { await Db.DisposeAsync(); await Connection.DisposeAsync(); }
    }
    internal static JsonElement Element(object value) => JsonSerializer.SerializeToElement(value, Json);
    [Fact]
    public async Task UploadRetainsEncryptedOriginalWithoutFinancialSaveAndReloads()
    {
        await using var f = new Fixture(); await f.Init(); var upload = await f.Upload();
        Assert.Empty(await f.Db.WealthRecords.ToArrayAsync()); Assert.Empty(await f.Db.PensionSnapshots.ToArrayAsync());
        Assert.Equal("NeedsReview", upload.GetProperty("status").GetString());
        var document = await f.Db.PensionDocuments.SingleAsync();
        Assert.False(document.ProtectedOriginal.AsSpan().StartsWith("%PDF"u8));
        f.Db.ChangeTracker.Clear();
        var original = await f.Service.Original(upload.GetProperty("id").GetGuid(), default);
        Assert.True(original.Bytes.AsSpan().StartsWith("%PDF"u8));
        Assert.False(upload.TryGetProperty("protectedOriginal",out _));
        Assert.False(upload.TryGetProperty("previewJson",out _));
        Assert.DoesNotContain("protectedOriginal",upload.GetRawText());
    }
    [Fact]
    public async Task ReuploadLinksCanonicalSnapshotAndDoesNotDoubleCountCurrentCapital()
    {
        await using var f = new Fixture(); await f.Init();
        var bytes = SyntheticPensionReport.Create("later");
        var first = Element(await f.Service.Upload(bytes, "application/pdf", false, default));
        await f.Service.Approve(first.GetProperty("id").GetGuid(), f.Approval(first), default);
        f.Db.ChangeTracker.Clear();
        var second = Element(await f.Service.Upload(bytes, "application/pdf", false, default));
        var saved = Element(await f.Service.Approve(second.GetProperty("id").GetGuid(), f.Approval(second), default));
        Assert.True(saved.GetProperty("duplicate").GetBoolean());
        Assert.Equal(2, await f.Db.PensionUploads.CountAsync()); Assert.Equal(1, await f.Db.PensionDocuments.CountAsync());
        Assert.Equal(1, await f.Db.PensionSnapshots.CountAsync());
        Assert.Equal(431000, (await f.Db.WealthRecords.SingleAsync()).Value);
        var history = Element(await f.Service.History(0, default)); Assert.Single(history.GetProperty("development").EnumerateArray());
    }
    [Fact]
    public async Task SameDateCorrectionIsExplicitAndHistoryPreservedAndOlderReportDoesNotRollBackCurrent()
    {
        await using var f = new Fixture(); await f.Init(); var first = await f.Upload();
        var saved = Element(await f.Service.Approve(first.GetProperty("id").GetGuid(), f.Approval(first), default));
        var id = saved.GetProperty("snapshotId").GetGuid(); f.Db.ChangeTracker.Clear();
        var correction = await f.Upload("correction");
        var error = await Assert.ThrowsAsync<ApiFailure>(() => f.Service.Approve(correction.GetProperty("id").GetGuid(), f.Approval(correction), default));
        Assert.Equal("PENSION_CORRECTION_CONFIRMATION_REQUIRED", error.Code); f.Db.ChangeTracker.Clear();
        await f.Service.Approve(correction.GetProperty("id").GetGuid(), f.Approval(correction, id), default); f.Db.ChangeTracker.Clear();
        var earlier = await f.Upload("earlier"); await f.Service.Approve(earlier.GetProperty("id").GetGuid(), f.Approval(earlier), default);
        Assert.Equal(432000, (await f.Db.WealthRecords.SingleAsync()).Value);
        Assert.Equal(3, await f.Db.PensionSnapshots.CountAsync());
        var prior = Element(await f.Service.Snapshot(id, default));
        Assert.Equal(431000, prior.GetProperty("accepted").GetProperty("report").GetProperty("agreements")[0].GetProperty("balance").GetProperty("value").GetDecimal());
        var history = Element(await f.Service.History(0, default)); Assert.Equal(2, history.GetProperty("development").GetArrayLength());
        Assert.All(history.GetProperty("development").EnumerateArray(), row => Assert.Equal(JsonValueKind.Null, row.GetProperty("returns").ValueKind));
    }
    [Fact]
    public async Task ConfirmationConcurrencyAndServerOwnedProvenanceAreEnforced()
    {
        await using var f = new Fixture(); await f.Init(); var receipt = await f.Upload(); var id = receipt.GetProperty("id").GetGuid(); var approval = f.Approval(receipt);
        await Assert.ThrowsAsync<ApiFailure>(() => f.Service.Approve(id, approval with { Confirm = false }, default));
        await Assert.ThrowsAsync<DbUpdateConcurrencyException>(() => f.Service.Approve(id, approval with { Version = Convert.ToBase64String(new byte[8]) }, default));
        f.Db.ChangeTracker.Clear();
        var report = approval.Reviewed; var agreement = report.Agreements[0];
        var changed = report with { Agreements = [agreement with { Balance = new(432100, new(99, "forged source", "EUR")) }] };
        await f.Service.Approve(id, approval with { Reviewed = changed }, default); f.Db.ChangeTracker.Clear();
        var accepted = (await f.Db.PensionSnapshots.SingleAsync()).DataJson;
        Assert.DoesNotContain("forged source", accepted); Assert.Contains("UserEdited", accepted);
        Assert.Equal(432100, (await f.Db.WealthRecords.SingleAsync()).Value);
    }
    [Fact]
    public async Task ScopeAndOwnerChecksProtectOriginalAndNoVisitorPrivateFilesInSharedDemo()
    {
        await using var f = new Fixture(); await f.Init("Demo", "one"); var receipt = await f.Upload();
        var id = receipt.GetProperty("id").GetGuid();
        await Assert.ThrowsAsync<ApiFailure>(() => f.Service.Upload(SyntheticPensionReport.Create("later"), "application/pdf", false, default));
        var other = new Workspace { DemoScope = "two", OwnerAuthenticated = true }; other.Select("Demo");
        await using var db = new BankingDb(Options(f.Connection), other);
        var service = new PensionImportService(db, other, new Clock(), f.Protection, new Reader());
        Assert.Equal("PENSION_UPLOAD_NOT_FOUND", (await Assert.ThrowsAsync<ApiFailure>(() => service.Original(id, default))).Code);
        other.Select("Demo");
        var live = new Workspace(); live.Select("Live");
        var denied = new PensionImportService(db, live, new Clock(), f.Protection, new Reader());
        Assert.Equal(403, (await Assert.ThrowsAsync<ApiFailure>(() => denied.History(0, default))).Status);
    }
    [Fact]
    public async Task ManualSaveCreatesDatedReceiptWithoutInventingPriorHistory()
    {
        await using var f = new Fixture(); await f.Init();
        var wealth = new WealthService(f.Db, new Clock(), f.Workspace, f.Service);
        var row = await wealth.Save(null, new("Manual pension", "PFA", "Pension", 100, "DKK", new(2025, 1, 1), "Statement page 1"), default);
        await wealth.Save(row.Id, new("Manual pension", "PFA", "Pension", 120, "DKK", new(2026, 1, 1), "Statement page 1", Version: Convert.ToBase64String(row.Version)), default);
        Assert.Equal(2, await f.Db.PensionUploads.CountAsync()); Assert.Equal(2, await f.Db.PensionSnapshots.CountAsync());
        Assert.Equal(120, (await f.Db.WealthRecords.SingleAsync()).Value);
    }
    [Fact]
    public async Task DuplicateOriginalCanLinkToPriorEditedSnapshotWithoutReplayingFinancialValues()
    {
        await using var f=new Fixture();await f.Init();var bytes=SyntheticPensionReport.Create("later");
        var first=Element(await f.Service.Upload(bytes,"application/pdf",false,default));var input=f.Approval(first);
        var agreement=input.Reviewed.Agreements[0];
        var edited=input.Reviewed with { Agreements=[agreement with { Balance=agreement.Balance with {Value=432100} }] };
        var saved=Element(await f.Service.Approve(first.GetProperty("id").GetGuid(),input with {Reviewed=edited},default));
        f.Db.ChangeTracker.Clear();var row=await f.Db.WealthRecords.SingleAsync();var version=row.Version.ToArray();
        var second=Element(await f.Service.Upload(bytes,"application/pdf",false,default));
        await f.Service.Reuse(second.GetProperty("id").GetGuid(),new(second.GetProperty("version").GetString()!,saved.GetProperty("snapshotId").GetGuid(),true),default);
        Assert.Equal(1,await f.Db.PensionSnapshots.CountAsync());Assert.Equal(2,await f.Db.PensionUploads.CountAsync());
        Assert.Equal(version,row.Version);Assert.Equal(432100,row.Value);
        f.Db.PensionSnapshots.Single().DataJson="attempt to overwrite history";
        await Assert.ThrowsAsync<InvalidOperationException>(()=>f.Db.SaveChangesAsync());
    }
    [Fact]
    public async Task JsonOriginalIsRetainedButPrivateMetadataDoesNotEnterAcceptedModel()
    {
        await using var f=new Fixture();await f.Init();
        var bytes=System.Text.Encoding.UTF8.GetBytes("""{"CPR":"001122-3344","Contacts":["synthetic-private-contact"],"PensionProviders":[{"PensionProviderName":"PFA","CurrencyCode":"EUR","Schemes":[{"ReferenceNumber":"SYNTHETIC-123456789","SavedValue":1234.5,"SavedValueDate":"2026-09-30"}]}]}""");
        var upload=Element(await f.Service.Upload(bytes,"application/json",false,default));
        await f.Service.Approve(upload.GetProperty("id").GetGuid(),f.Approval(upload),default);
        var snapshot=await f.Db.PensionSnapshots.SingleAsync();Assert.DoesNotContain("001122",snapshot.DataJson);Assert.DoesNotContain("synthetic-private-contact",snapshot.DataJson);Assert.DoesNotContain("123456789",snapshot.DataJson);
        Assert.Equal("EUR",(await f.Db.WealthRecords.SingleAsync()).Currency);
        var original=await f.Service.Original(upload.GetProperty("id").GetGuid(),default);Assert.Equal(bytes,original.Bytes);
    }
    [Fact]
    public async Task RecoveryArchiveContainsOriginalAndSnapshotsInsideOuterEncryption()
    {
        await using var f=new Fixture();await f.Init();var upload=await f.Upload();await f.Service.Approve(upload.GetProperty("id").GetGuid(),f.Approval(upload),default);
        var path=Path.Combine(Path.GetTempPath(),"pension-backup-"+Guid.NewGuid()+".protected");
        try {
            var backup=new BackupService(f.Db,new Vault(f.Protection,f.Workspace),f.Workspace,f.Protection);
            await backup.Export(path,default,"Synthetic passphrase for this isolated fixture only");
            var encrypted=await File.ReadAllTextAsync(path);Assert.DoesNotContain("PensionDocuments",encrypted);
            var archive=JsonDocument.Parse(PortableArchive.Decrypt(encrypted,"Synthetic passphrase for this isolated fixture only"));
            var tables=archive.RootElement.GetProperty("Tables");
            Assert.Single(tables.GetProperty("PensionSnapshot").EnumerateArray());
            var original=tables.GetProperty("PensionDocument")[0].GetProperty("ProtectedOriginal").GetBytesFromBase64();Assert.True(original.AsSpan().StartsWith("%PDF"u8));
            Assert.False(string.IsNullOrEmpty(tables.GetProperty("WealthRecord")[0].GetProperty("PensionSourceKey").GetString()));
        }finally{File.Delete(path);}
    }
    [Fact]
    public async Task PdfMappingPreservesManualProductIdAndRequiresConfirmationForSameDateCorrection()
    {
        await using var f=new Fixture();await f.Init();
        var row=await new WealthService(f.Db,new Clock(),f.Workspace,f.Service).Save(null,new("Existing product","Demo Pension","Pension",400000,"DKK",new(2026,9,30),"Manual page"),default);
        var prior=await f.Db.PensionSnapshots.SingleAsync();var upload=await f.Upload();var input=f.Approval(upload);
        input=input with {Products=[new(input.Reviewed.Agreements[0].Key,row.Id,Convert.ToBase64String(row.Version))]};
        Assert.Equal("PENSION_CORRECTION_CONFIRMATION_REQUIRED",(await Assert.ThrowsAsync<ApiFailure>(()=>f.Service.Approve(upload.GetProperty("id").GetGuid(),input,default))).Code);
        f.Db.ChangeTracker.Clear();
        await f.Service.Approve(upload.GetProperty("id").GetGuid(),input with {SupersedesId=prior.Id},default);
        Assert.Equal(row.Id,(await f.Db.WealthRecords.SingleAsync()).Id);Assert.Equal(2,await f.Db.PensionSnapshots.CountAsync());
    }
    [Fact]
    public async Task ChangedDuplicateMappingIsRejectedAndNullReviewMembersAreClientErrors()
    {
        await using var f=new Fixture();await f.Init();var bytes=SyntheticPensionReport.Create("later");
        var first=Element(await f.Service.Upload(bytes,"application/pdf",false,default));var input=f.Approval(first);
        await f.Service.Approve(first.GetProperty("id").GetGuid(),input,default);f.Db.ChangeTracker.Clear();
        var second=Element(await f.Service.Upload(bytes,"application/pdf",false,default));input=f.Approval(second);
        foreach(var bad in new[]{input with {Products=null!},input with {Reviewed=null!},input with {Reviewed=input.Reviewed with {Agreements=null!}}}) {
            Assert.Equal(400,(await Assert.ThrowsAsync<ApiFailure>(()=>f.Service.Approve(second.GetProperty("id").GetGuid(),bad,default))).Status);
        }
        var changed=input with {Products=[new(input.Products[0].Key,Guid.NewGuid(),input.Products[0].Version)]};
        Assert.Equal("PENSION_DUPLICATE_MAPPING_MISMATCH",(await Assert.ThrowsAsync<ApiFailure>(()=>f.Service.Approve(second.GetProperty("id").GetGuid(),changed,default))).Code);
        Assert.Equal(1,await f.Db.PensionSnapshots.CountAsync());Assert.Equal(431000,(await f.Db.WealthRecords.SingleAsync()).Value);
    }
}
