using Banking.Api.Data;
using Banking.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.Configuration;

namespace Banking.Tests;

public sealed class PensionSchemaTests
{
    [Fact]
    public void MigrationIsAdditiveAndGateRequiresItsExactIdentity()
    {
        using var db=new BankingDb(new DbContextOptionsBuilder<BankingDb>().UseSqlServer("Server=fixture.invalid;Database=Fixture;Encrypt=true").Options);
        var migrations=db.Database.GetMigrations().ToArray();Assert.Equal(PensionSchemaGate.Migration,migrations[^1]);
        var sql=db.GetService<IMigrator>().GenerateScript(migrations[^2],migrations[^1],MigrationsSqlGenerationOptions.Idempotent);
        foreach(var table in new[]{"PensionDocuments","PensionUploads","PensionSnapshots"})Assert.Contains("CREATE TABLE ["+table+"]",sql);
        Assert.Contains("ALTER TABLE [WealthRecords] ADD [PensionSourceKey]",sql);
        Assert.DoesNotContain("DROP TABLE",sql);Assert.DoesNotContain("UPDATE [WealthRecords]",sql);Assert.DoesNotContain("DELETE FROM",sql);
    }
    [Fact]
    public async Task GateFailsClosedWithoutCloudConfiguration() => Assert.Equal(2,await PensionSchemaGate.Run(new ConfigurationBuilder().Build()));
}
