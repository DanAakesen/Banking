using Banking.Api.Security;
using Microsoft.Data.SqlClient;

namespace Banking.Api.Services;

// Release-only, metadata-only check. Never starts the web app, reads financial rows or performs DDL.
public static class PensionSchemaGate
{
    public const string Migration = "20261015000000_PensionUploadHistory";
    public static async Task<int> Run(IConfiguration config)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(45));
        return await Run(config, connection => new SqlProbe(connection), timeout.Token, Console.Out);
    }

    internal interface IProbe : IAsyncDisposable
    {
        Task Open(CancellationToken ct);
        Task<bool> HasSchema(CancellationToken ct);
    }
    sealed class SqlProbe(string connection) : IProbe
    {
        readonly SqlConnection sql = new(connection);
        public Task Open(CancellationToken ct) => sql.OpenAsync(ct);
        public async Task<bool> HasSchema(CancellationToken ct)
        {
            await using var command = sql.CreateCommand(); command.CommandTimeout = 15;
            command.CommandText = "SELECT CASE WHEN OBJECT_ID(N'dbo.PensionDocuments',N'U') IS NOT NULL "
                + "AND OBJECT_ID(N'dbo.PensionUploads',N'U') IS NOT NULL AND OBJECT_ID(N'dbo.PensionSnapshots',N'U') IS NOT NULL "
                + "AND COL_LENGTH(N'dbo.WealthRecords',N'PensionSourceKey') IS NOT NULL "
                + "AND EXISTS(SELECT 1 FROM dbo.__EFMigrationsHistory WHERE MigrationId=@migration) THEN 1 ELSE 0 END";
            command.Parameters.AddWithValue("@migration", Migration);
            return Convert.ToInt32(await command.ExecuteScalarAsync(ct)) == 1;
        }
        public ValueTask DisposeAsync() => sql.DisposeAsync();
    }
    enum Stage { Configuration, Connection, Query }

    // Exit contract: Demo 101..107, Live 111..117. The release caller maps only these
    // fixed codes; raw provider/SQL/configuration exceptions never cross the boundary.
    internal static async Task<int> Run(IConfiguration config, Func<string, IProbe> create,
                                        CancellationToken ct, TextWriter output)
    {
        var scopes = new[] { "Demo", "Live" };
        for (var index = 0; index < scopes.Length; index++)
        {
            var mode = scopes[index]; var stage = Stage.Configuration;
            try
            {
                ct.ThrowIfCancellationRequested();
                var connection = CloudHosting.ValidateConnection(config.GetConnectionString(mode == "Demo" ? "Banking" : "BankingLive")!, mode);
                stage = Stage.Connection;
                await using var probe = create(connection);
                ct.ThrowIfCancellationRequested();
                await probe.Open(ct);
                stage = Stage.Query;
                ct.ThrowIfCancellationRequested();
                var found = await probe.HasSchema(ct);
                ct.ThrowIfCancellationRequested();
                if (!found) return Fail(3, "query", "schema-missing");
            }
            catch (Exception error)
            {
                var cancelled = error is OperationCanceledException || ct.IsCancellationRequested;
                var (suffix, label, category) = (stage, cancelled) switch
                {
                    (Stage.Configuration, false) => (1, "configuration", "configuration-invalid"),
                    (Stage.Connection, false) => (2, "connection", "connection-unavailable"),
                    (Stage.Query, false) => (4, "query", "query-unavailable"),
                    (Stage.Configuration, true) => (5, "configuration", "deadline-cancelled"),
                    (Stage.Connection, true) => (6, "connection", "deadline-cancelled"),
                    _ => (7, "query", "deadline-cancelled")
                };
                return Fail(suffix, label, category);
            }
            int Fail(int suffix, string label, string category)
            {
                output.WriteLine($"PENSION_SCHEMA_FAILED:{mode}:{label}:{category}");
                return 100 + index * 10 + suffix;
            }
        }
        if (ct.IsCancellationRequested)
        { output.WriteLine("PENSION_SCHEMA_FAILED:Live:query:deadline-cancelled"); return 117; }
        output.WriteLine("PENSION_SCHEMA_VERIFIED:Demo,Live"); return 0;
    }
}
