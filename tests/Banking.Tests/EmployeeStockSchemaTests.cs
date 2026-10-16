using System.Text.Json;
using Banking.Api.Data;
using Banking.Api.Services;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;

namespace Banking.Tests;

public sealed class EmployeeStockSchemaTests
{
    [Fact]
    public void ExactAdditiveMigrationMatchesModelAndDoesNotTouchFinancialValues()
    {
        using var db=new BankingDb(new DbContextOptionsBuilder<BankingDb>().UseSqlServer("Server=fixture.invalid;Database=Fixture;Encrypt=true").Options);
        Assert.Equal(PensionSchemaGate.StockMigration,db.Database.GetMigrations().Last());Assert.False(db.Database.HasPendingModelChanges());
        var sql=db.GetService<IMigrator>().GenerateScript(PensionSchemaGate.Migration,PensionSchemaGate.StockMigration,MigrationsSqlGenerationOptions.Idempotent);
        foreach(var table in new[]{"EmployeeStockDocuments","EmployeeStockUploads","EmployeeStockSnapshots"})Assert.Contains("CREATE TABLE ["+table+"]",sql);
        Assert.Contains("ALTER TABLE [WealthRecords] ADD [StockSourceKey]",sql);Assert.Contains("[StockSourceKey] IS NOT NULL",sql);
        foreach(var forbidden in new[]{"DROP TABLE","DELETE FROM","UPDATE [WealthRecords]","ALTER ROLE","GRANT ","INSERT INTO [WealthRecords]"})Assert.DoesNotContain(forbidden,sql);
    }
    [Theory]
    [InlineData("Demo")][InlineData("Live")]
    public async Task ExactStockTargetRequiresBothPlansBeforeAnyApply(string unexpected)
    {
        var file=Path.GetTempFileName();var protection=new EphemeralDataProtectionProvider();using var services=new ServiceCollection().AddSingleton<IDataProtectionProvider>(protection).BuildServiceProvider();
        try{
            var calls=new List<string>();File.WriteAllText(file,protection.CreateProtector("Banking.Cloud.Migration.v1").Protect("synthetic-token"));
            await Assert.ThrowsAsync<InvalidOperationException>(()=>CloudImport.Schema(services,file,(_,scope)=>{calls.Add("inspect:"+scope);return Task.FromResult(scope==unexpected?new[]{PensionSchemaGate.Migration}:new[]{PensionSchemaGate.StockMigration});},(_,scope)=>{calls.Add("apply:"+scope);return Task.CompletedTask;},PensionSchemaGate.StockMigration));
            Assert.Equal(new[]{"inspect:Demo","inspect:Live"},calls);Assert.False(File.Exists(file));
        }finally{File.Delete(file);}
    }
    [Fact]
    public async Task StockOnlyTargetAppliesOnlyExpectedPendingScopeAndRejectsUnknownBeforeTokenRead()
    {
        var file=Path.GetTempFileName();var protection=new EphemeralDataProtectionProvider();using var services=new ServiceCollection().AddSingleton<IDataProtectionProvider>(protection).BuildServiceProvider();
        try{
            var calls=new List<string>();File.WriteAllText(file,protection.CreateProtector("Banking.Cloud.Migration.v1").Protect("synthetic-token"));
            await CloudImport.Schema(services,file,(_,scope)=>{calls.Add("inspect:"+scope);return Task.FromResult(scope=="Live"?new[]{PensionSchemaGate.StockMigration}:Array.Empty<string>());},(_,scope)=>{calls.Add("apply:"+scope);return Task.CompletedTask;},PensionSchemaGate.StockMigration);
            Assert.Equal(new[]{"inspect:Demo","inspect:Live","apply:Live"},calls);Assert.False(File.Exists(file));
            File.WriteAllText(file,"not-a-valid-ciphertext");calls.Clear();
            await Assert.ThrowsAsync<InvalidOperationException>(()=>CloudImport.Schema(services,file,(_,_)=>throw new Exception("must not inspect"),(_,_)=>throw new Exception("must not apply"),"UNKNOWN"));
            Assert.Empty(calls);Assert.False(File.Exists(file));
        }finally{File.Delete(file);}
    }
    [Fact]
    public void SensitiveStorageAndPrivateMappingAreExcludedFromNormalJson()
    {
        var options=new JsonSerializerOptions(JsonSerializerDefaults.Web);
        Assert.DoesNotContain("protectedOriginal",JsonSerializer.Serialize(new EmployeeStockDocument{ProtectedOriginal=[1,2,3]},options));
        Assert.DoesNotContain("previewJson",JsonSerializer.Serialize(new EmployeeStockUpload{PreviewJson="SECRET"},options));
        Assert.DoesNotContain("sourceIdentityKey",JsonSerializer.Serialize(new EmployeeStockSnapshot{SourceIdentityKey="SECRET"},options));
        Assert.DoesNotContain("dataJson",JsonSerializer.Serialize(new EmployeeStockSnapshot{DataJson="SECRET"},options));
        Assert.DoesNotContain("stockSourceKey",JsonSerializer.Serialize(new WealthRecord{StockSourceKey="SECRET"},options));
    }
    [Fact]
    public async Task EncryptedRecoveryArchiveRetainsStockOriginalReviewHistoryAndPrivateMapping()
    {
        await using var f=new PensionHistoryTests.Fixture();await f.Init();
        var bytes=SyntheticStockWorkbook.Create();var document=new EmployeeStockDocument{Hash=new string('a',64),ByteLength=bytes.Length,ProtectedOriginal=f.Protection.CreateProtector("Banking.EmployeeStock.Original.v1","Live","").Protect(bytes)};
        var upload=new EmployeeStockUpload{DocumentId=document.Id,Status="Approved",PreviewJson="synthetic-preview",SourceIdentityKey="synthetic-identity"};
        var snapshot=new EmployeeStockSnapshot{DocumentId=document.Id,UploadId=upload.Id,DataJson="synthetic-accepted",SourceIdentityKey="synthetic-identity",AsOf=new DateOnly(2026,10,1)};
        var wealth=new WealthRecord{Name="Synthetic external shares",Provider="Fictional custodian",StockSourceKey="synthetic-map"};
        f.Db.AddRange(document,upload,snapshot,wealth);await f.Db.SaveChangesAsync();
        var path=Path.Combine(Path.GetTempPath(),Guid.NewGuid()+".protected");
        try{
            var backup=new BackupService(f.Db,new Banking.Api.Security.Vault(f.Protection,f.Workspace),f.Workspace,f.Protection);
            await backup.Export(path,default,"Synthetic recovery passphrase only");var encrypted=await File.ReadAllTextAsync(path);
            Assert.DoesNotContain("synthetic-preview",encrypted);Assert.DoesNotContain("synthetic-map",encrypted);
            using var archive=JsonDocument.Parse(Banking.Api.Security.PortableArchive.Decrypt(encrypted,"Synthetic recovery passphrase only"));
            var tables=archive.RootElement.GetProperty("Tables");
            Assert.Equal(bytes,tables.GetProperty(nameof(EmployeeStockDocument))[0].GetProperty("ProtectedOriginal").GetBytesFromBase64());
            Assert.Equal("synthetic-identity",tables.GetProperty(nameof(EmployeeStockSnapshot))[0].GetProperty("SourceIdentityKey").GetString());
            Assert.Equal("synthetic-preview",tables.GetProperty(nameof(EmployeeStockUpload))[0].GetProperty("PreviewJson").GetString());
            Assert.Equal("synthetic-accepted",tables.GetProperty(nameof(EmployeeStockSnapshot))[0].GetProperty("DataJson").GetString());
            Assert.Equal("synthetic-map",tables.GetProperty(nameof(WealthRecord))[0].GetProperty("StockSourceKey").GetString());
        }finally{File.Delete(path);}
    }
}
