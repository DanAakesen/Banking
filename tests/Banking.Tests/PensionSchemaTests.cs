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
        var migrations=db.Database.GetMigrations().ToArray();Assert.Contains(PensionSchemaGate.Migration,migrations);
        var sql=db.GetService<IMigrator>().GenerateScript(migrations[Array.IndexOf(migrations,PensionSchemaGate.Migration)-1],PensionSchemaGate.Migration,MigrationsSqlGenerationOptions.Idempotent);
        foreach(var table in new[]{"PensionDocuments","PensionUploads","PensionSnapshots"})Assert.Contains("CREATE TABLE ["+table+"]",sql);
        Assert.Contains("ALTER TABLE [WealthRecords] ADD [PensionSourceKey]",sql);
        Assert.DoesNotContain("DROP TABLE",sql);Assert.DoesNotContain("UPDATE [WealthRecords]",sql);Assert.DoesNotContain("DELETE FROM",sql);
    }
    [Fact]
    public async Task GateFailsClosedWithoutCloudConfiguration() => Assert.Equal(101,await PensionSchemaGate.Run(new ConfigurationBuilder().Build()));

    const string PrivateFailure = "PRIVATE_SCHEMA_ERROR;Password=synthetic-secret;User=private-person";
    sealed class Fixture : IDisposable
    {
        public readonly CancellationTokenSource Timeout = new();
        public readonly StringWriter Output = new();
        public readonly List<string> Calls = [];
        public readonly List<CancellationToken> Tokens = [];
        public string? FailedScope, Category;
        public bool ReturnAfterCancel, CancelAtFinalDispose;
        public Task<int> Run()
        {
            if (FailedScope == "Demo" && Category == "configuration-cancelled") Timeout.Cancel();
            var settings = new Dictionary<string, string?>();
            foreach (var scope in new[] { "Demo", "Live" })
                settings["ConnectionStrings:" + (scope == "Demo" ? "Banking" : "BankingLive")] =
                    scope == FailedScope && Category == "configuration-invalid" ? PrivateFailure :
                    "Server=fixture.database.windows.net;Database=" + (scope == "Demo" ? "Banking_Demo" : "Banking_Live_Dan")
                    + ";Authentication=ActiveDirectoryManagedIdentity;Encrypt=True;TrustServerCertificate=False";
            return PensionSchemaGate.Run(new ConfigurationBuilder().AddInMemoryCollection(settings).Build(), connection =>
            {
                var scope = connection.Contains("Banking_Live_Dan", StringComparison.Ordinal) ? "Live" : "Demo";
                Calls.Add(scope + ":create"); return new Probe(this, scope);
            }, Timeout.Token, Output);
        }
        sealed class Probe(Fixture f, string scope) : PensionSchemaGate.IProbe
        {
            public Task Open(CancellationToken ct)
            {
                f.Calls.Add(scope + ":open"); f.Tokens.Add(ct);
                if (scope == f.FailedScope && f.Category == "connection-unavailable") throw new InvalidOperationException(PrivateFailure);
                if (scope == f.FailedScope && f.Category == "connection-cancelled") { f.Timeout.Cancel(); throw new OperationCanceledException(PrivateFailure, ct); }
                return Task.CompletedTask;
            }
            public Task<bool> HasSchema(CancellationToken ct)
            {
                f.Calls.Add(scope + ":query"); f.Tokens.Add(ct);
                if (scope == f.FailedScope && f.Category == "query-unavailable") throw new InvalidOperationException(PrivateFailure);
                if (scope == f.FailedScope && f.Category == "query-cancelled")
                {
                    f.Timeout.Cancel();
                    if (!f.ReturnAfterCancel) throw new OperationCanceledException(PrivateFailure, ct);
                }
                return Task.FromResult(!(scope == f.FailedScope && f.Category == "schema-missing"));
            }
            public ValueTask DisposeAsync()
            {
                f.Calls.Add(scope + ":dispose");
                if (scope == "Live" && f.CancelAtFinalDispose) f.Timeout.Cancel();
                // Expiry between scopes must be attributed to Live configuration, not a successful full gate.
                if (scope == "Demo" && f.FailedScope == "Live" && f.Category == "configuration-cancelled") f.Timeout.Cancel();
                return ValueTask.CompletedTask;
            }
        }
        public void Dispose() { Timeout.Dispose(); Output.Dispose(); }
    }
    [Theory]
    [InlineData("Demo", "configuration-invalid", "configuration", "configuration-invalid", 101)]
    [InlineData("Demo", "connection-unavailable", "connection", "connection-unavailable", 102)]
    [InlineData("Demo", "schema-missing", "query", "schema-missing", 103)]
    [InlineData("Demo", "query-unavailable", "query", "query-unavailable", 104)]
    [InlineData("Demo", "configuration-cancelled", "configuration", "deadline-cancelled", 105)]
    [InlineData("Demo", "connection-cancelled", "connection", "deadline-cancelled", 106)]
    [InlineData("Demo", "query-cancelled", "query", "deadline-cancelled", 107)]
    [InlineData("Live", "configuration-invalid", "configuration", "configuration-invalid", 111)]
    [InlineData("Live", "connection-unavailable", "connection", "connection-unavailable", 112)]
    [InlineData("Live", "schema-missing", "query", "schema-missing", 113)]
    [InlineData("Live", "query-unavailable", "query", "query-unavailable", 114)]
    [InlineData("Live", "configuration-cancelled", "configuration", "deadline-cancelled", 115)]
    [InlineData("Live", "connection-cancelled", "connection", "deadline-cancelled", 116)]
    [InlineData("Live", "query-cancelled", "query", "deadline-cancelled", 117)]
    public async Task GateReturnsOnlyFixedScopeStageCategoryAndNeverPrivateExceptions(string scope, string fault, string stage, string category, int code)
    {
        using var f = new Fixture { FailedScope = scope, Category = fault };
        Assert.Equal(code, await f.Run());
        Assert.Equal($"PENSION_SCHEMA_FAILED:{scope}:{stage}:{category}" + Environment.NewLine, f.Output.ToString());
        Assert.DoesNotContain(PrivateFailure, f.Output.ToString()); Assert.DoesNotContain("Banking_Live_Dan", f.Output.ToString());
        Assert.DoesNotContain("PENSION_SCHEMA_VERIFIED", f.Output.ToString());
        if (scope == "Demo") Assert.DoesNotContain(f.Calls, c => c.StartsWith("Live:", StringComparison.Ordinal));
        else Assert.Contains("Demo:query", f.Calls);
        if (fault.StartsWith("configuration", StringComparison.Ordinal)) Assert.DoesNotContain(scope + ":create", f.Calls);
        if (fault.StartsWith("connection", StringComparison.Ordinal)) Assert.DoesNotContain(scope + ":query", f.Calls);
        Assert.All(f.Tokens, token => Assert.Equal(f.Timeout.Token, token));
    }
    [Fact]
    public async Task SuccessRequiresBothScopesWithTheSameSharedDeadlineTokenAndOneMetadataQueryEach()
    {
        using var f = new Fixture(); Assert.Equal(0, await f.Run());
        Assert.Equal(new[] { "Demo:create", "Demo:open", "Demo:query", "Demo:dispose", "Live:create", "Live:open", "Live:query", "Live:dispose" }, f.Calls);
        Assert.Equal("PENSION_SCHEMA_VERIFIED:Demo,Live" + Environment.NewLine, f.Output.ToString());
        Assert.Equal(4, f.Tokens.Count); Assert.All(f.Tokens, token => Assert.Equal(f.Timeout.Token, token));
    }
    [Theory]
    [InlineData("Demo", 107)]
    [InlineData("Live", 117)]
    public async Task QueryReturningSuccessAfterCancellationStillCannotPass(string scope, int expected)
    {
        using var f = new Fixture { FailedScope = scope, Category = "query-cancelled", ReturnAfterCancel = true };
        Assert.Equal(expected, await f.Run()); Assert.DoesNotContain("VERIFIED", f.Output.ToString());
    }
    [Fact]
    public async Task ExpiryDuringFinalConnectionCleanupCannotReturnSuccess()
    {
        using var f = new Fixture { CancelAtFinalDispose = true };
        Assert.Equal(117, await f.Run());
        Assert.Equal("PENSION_SCHEMA_FAILED:Live:query:deadline-cancelled" + Environment.NewLine, f.Output.ToString());
        Assert.Contains("Live:query", f.Calls); Assert.Contains("Live:dispose", f.Calls);
    }
}
