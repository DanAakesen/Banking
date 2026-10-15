using Banking.Api.Security;
using Microsoft.Data.SqlClient;

namespace Banking.Api.Services;

// Release-only, metadata-only check. Never starts the web app, reads financial rows or performs DDL.
public static class PensionSchemaGate
{
    public const string Migration = "20261015000000_PensionUploadHistory";
    public static async Task<int> Run(IConfiguration config)
    {
        try
        {
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(45));
            foreach (var mode in new[] { "Demo", "Live" })
            {
                var connection = CloudHosting.ValidateConnection(config.GetConnectionString(mode == "Demo" ? "Banking" : "BankingLive")!, mode);
                await using var sql = new SqlConnection(connection);
                await sql.OpenAsync(timeout.Token);
                await using var command = sql.CreateCommand(); command.CommandTimeout = 15;
                command.CommandText = "SELECT CASE WHEN OBJECT_ID(N'dbo.PensionDocuments',N'U') IS NOT NULL "
                    + "AND OBJECT_ID(N'dbo.PensionUploads',N'U') IS NOT NULL AND OBJECT_ID(N'dbo.PensionSnapshots',N'U') IS NOT NULL "
                    + "AND COL_LENGTH(N'dbo.WealthRecords',N'PensionSourceKey') IS NOT NULL "
                    + "AND EXISTS(SELECT 1 FROM dbo.__EFMigrationsHistory WHERE MigrationId=@migration) THEN 1 ELSE 0 END";
                command.Parameters.AddWithValue("@migration", Migration);
                if (Convert.ToInt32(await command.ExecuteScalarAsync(timeout.Token)) != 1)
                { Console.WriteLine("PENSION_SCHEMA_REQUIRED:" + mode); return 2; }
            }
            Console.WriteLine("PENSION_SCHEMA_VERIFIED:Demo,Live"); return 0;
        }
        catch { Console.WriteLine("PENSION_SCHEMA_VERIFICATION_UNAVAILABLE"); return 2; }
    }
}
