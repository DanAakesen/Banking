using System.Data;
using System.Text.Json;
using System.Text.Json.Serialization;
using Banking.Api.Data;
using Banking.Api.Security;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.DataProtection;
using System.Text.Json.Serialization.Metadata;

namespace Banking.Api.Services;

// Local recovery archive, encrypted to this Windows user and Data Protection key ring.
// Not a portable/off-device disaster recovery format. No HTTP export endpoint.
public sealed class BackupService(BankingDb db, Vault vault, Workspace workspace, IDataProtectionProvider protection)
{
    private static readonly JsonSerializerOptions Json = new() { ReferenceHandler = ReferenceHandler.IgnoreCycles,
        TypeInfoResolver = new DefaultJsonTypeInfoResolver { Modifiers = { info => {
            if (info.Type == typeof(WealthRecord)) {
                var property = info.CreateJsonPropertyInfo(typeof(string), nameof(WealthRecord.PensionSourceKey));
                property.Get = row => ((WealthRecord)row).PensionSourceKey;
                property.Set = (row, value) => ((WealthRecord)row).PensionSourceKey = (string?)value;
                info.Properties.Remove(info.Properties.First(p => p.Name == nameof(WealthRecord.PensionSourceKey)));
                info.Properties.Add(property);
            }
        } } } };
    IDataProtector PensionProtection => protection.CreateProtector("Banking.Pension.Original.v1", workspace.Mode, workspace.DemoScope);
    private static readonly Type[] Types = [typeof(Connection), typeof(Account), typeof(Category), typeof(CategoryRule), typeof(Budget),
        typeof(BankTransaction), typeof(BalanceSnapshot), typeof(ClassificationChange), typeof(TransferMatch), typeof(SyncJob), typeof(ImportItem), typeof(AccountAlias), typeof(Goal), typeof(ReviewAction), typeof(BudgetPlan), typeof(BudgetEntry), typeof(LoanRecord), typeof(WealthRecord), typeof(ResearchItem), typeof(PensionDocument), typeof(PensionUpload), typeof(PensionSnapshot)];
    public async Task Export(string file, CancellationToken ct, string? passphrase = null)
    {
        if (File.Exists(file)) throw new ApiFailure(409, "BACKUP_ALREADY_EXISTS");
        var tables = new Dictionary<string, JsonElement>();
        await using (var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct))
        {
            foreach (var type in Types)
            {
                var query = (IQueryable)typeof(DbContext).GetMethod(nameof(DbContext.Set), Type.EmptyTypes)!.MakeGenericMethod(type).Invoke(db, null)!;
                // Detach each table after serialization to avoid navigation fix-up duplicating data in the archive.
                var records = query.Cast<object>().ToList();
                if (passphrase is not null)
                {
                    foreach (var record in records)
                    {
                        // A portable recovery restores financial history, not reusable bank credentials or stale authorizations.
                        if (record is Connection connection) { connection.Session = ""; connection.Status = "ReconnectRequired"; connection.RetryNotBefore = null; }
                        if (record is Account account) { account.ProviderAccountId = ""; account.Accessible = false; }
                        // Outer portable archive encrypts these bytes; re-protect with destination keys on restore.
                        if (record is PensionDocument document) document.ProtectedOriginal = PensionProtection.Unprotect(document.ProtectedOriginal);
                        if (record is SyncJob job)
                        {
                            job.Cursor = null;
                            if (job.Status is "Queued" or "Running") { job.Status = "Cancelled"; job.ErrorCode = "PORTABLE_RESTORE_REQUIRES_RECONNECT"; }
                        }
                    }
                }
                tables[type.Name] = JsonSerializer.SerializeToElement(records, Json);
                db.ChangeTracker.Clear();
            }
            await transaction.CommitAsync(ct);
        }
        var json = JsonSerializer.Serialize(new Archive(2, DateTimeOffset.UtcNow, tables, workspace.Mode, passphrase is not null), Json);
        Check.That(json.Length <= 96 * 1024 * 1024, "ARCHIVE_TOO_LARGE");
        var archive = passphrase is null ? vault.Protect(json) : PortableArchive.Encrypt(json, passphrase);
        await using var output = new FileStream(file, FileMode.CreateNew, FileAccess.Write, FileShare.None);
        await using var writer = new StreamWriter(output); await writer.WriteAsync(archive.AsMemory(), ct);
    }
    public async Task Restore(string file, CancellationToken ct, string? passphrase = null)
    {
        var connection = new SqlConnectionStringBuilder(db.Database.GetConnectionString());
        if (!connection.DataSource.StartsWith("(localdb)\\", StringComparison.OrdinalIgnoreCase) || !connection.InitialCatalog.StartsWith("Banking_Restore_", StringComparison.Ordinal))
            throw new ApiFailure(400, "RESTORE_REQUIRES_SEPARATE_LOCAL_DATABASE");
        Check.That(new FileInfo(file).Length <= 256 * 1024 * 1024, "ARCHIVE_TOO_LARGE");
        var encrypted = await File.ReadAllTextAsync(file, ct);
        var plaintext = passphrase is null ? vault.Reveal(encrypted) : PortableArchive.Decrypt(encrypted, passphrase);
        var archive = JsonSerializer.Deserialize<Archive>(plaintext, Json)
            ?? throw new ApiFailure(400, "INVALID_ARCHIVE");
        Check.That(archive.Format is 1 or 2, "UNSUPPORTED_ARCHIVE");
        // Archives created before identity aliases were introduced remain recoverable.
        archive.Tables.TryAdd(nameof(AccountAlias), JsonSerializer.SerializeToElement(Array.Empty<AccountAlias>(), Json));
        archive.Tables.TryAdd(nameof(Goal), JsonSerializer.SerializeToElement(Array.Empty<Goal>(), Json));
        archive.Tables.TryAdd(nameof(ReviewAction), JsonSerializer.SerializeToElement(Array.Empty<ReviewAction>(), Json));
        archive.Tables.TryAdd(nameof(BudgetPlan), JsonSerializer.SerializeToElement(Array.Empty<BudgetPlan>(), Json));
        archive.Tables.TryAdd(nameof(BudgetEntry), JsonSerializer.SerializeToElement(Array.Empty<BudgetEntry>(), Json));
        archive.Tables.TryAdd(nameof(LoanRecord), JsonSerializer.SerializeToElement(Array.Empty<LoanRecord>(), Json));
        archive.Tables.TryAdd(nameof(WealthRecord), JsonSerializer.SerializeToElement(Array.Empty<WealthRecord>(), Json));
        archive.Tables.TryAdd(nameof(ResearchItem), JsonSerializer.SerializeToElement(Array.Empty<ResearchItem>(), Json));
        archive.Tables.TryAdd(nameof(PensionDocument), JsonSerializer.SerializeToElement(Array.Empty<PensionDocument>(), Json));
        archive.Tables.TryAdd(nameof(PensionUpload), JsonSerializer.SerializeToElement(Array.Empty<PensionUpload>(), Json));
        archive.Tables.TryAdd(nameof(PensionSnapshot), JsonSerializer.SerializeToElement(Array.Empty<PensionSnapshot>(), Json));
        Check.That(archive.Tables.Count == Types.Length, "UNSUPPORTED_ARCHIVE");
        Check.That(archive.Mode == workspace.Mode && archive.Portable == (passphrase is not null), "ARCHIVE_MODE_MISMATCH");
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        foreach (var type in Types)
        {
            var query = (IQueryable)typeof(DbContext).GetMethod(nameof(DbContext.Set), Type.EmptyTypes)!.MakeGenericMethod(type).Invoke(db, null)!;
            if (query.Cast<object>().Any()) throw new ApiFailure(409, "RESTORE_DATABASE_NOT_EMPTY");
        }
        foreach (var type in Types)
        {
            Check.That(archive.Tables.ContainsKey(type.Name), "INCOMPLETE_ARCHIVE");
            var records = (System.Collections.IEnumerable)archive.Tables[type.Name].Deserialize(type.MakeArrayType(), Json)!;
            foreach (Entity record in records)
            {
                record.Version = [];
                if (passphrase is not null && record is PensionDocument document) document.ProtectedOriginal = PensionProtection.Protect(document.ProtectedOriginal);
                if (record is SyncJob { Status: "Running" } job) job.Status = "Queued";
                db.Add(record);
            }
        }
        await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct);
    }
    private sealed record Archive(int Format, DateTimeOffset CreatedAt, Dictionary<string, JsonElement> Tables, string Mode = "Demo", bool Portable = false);
}
