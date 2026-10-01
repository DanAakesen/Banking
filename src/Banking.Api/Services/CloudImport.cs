using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using Banking.Api.Data;
using Banking.Api.Security;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace Banking.Api.Services;

// CLI-only deployment operation. Not an HTTP endpoint. Inputs are encrypted and uploaded through authenticated SCM.
public static class CloudImport
{
    public static readonly Type[] Types = [typeof(Connection),typeof(Account),typeof(AccountAlias),typeof(Category),typeof(CategoryRule),
        typeof(BankTransaction),typeof(BalanceSnapshot),typeof(Budget),typeof(BudgetPlan),typeof(BudgetEntry),typeof(Goal),
        typeof(ClassificationChange),typeof(TransferMatch),typeof(ReviewAction),typeof(SyncJob),typeof(ImportItem)];
    public sealed record Transfer(Dictionary<string,Dictionary<string,JsonElement>> Workspaces);
    public static async Task Schema(IServiceProvider services, IConfiguration config)
    {
        const string tokenFile = "/home/Banking/deployment/operator.protected";
        var protector=services.GetRequiredService<IDataProtectionProvider>().CreateProtector("Banking.Cloud.Migration.v1");
        var token=protector.Unprotect(await File.ReadAllTextAsync(tokenFile));
        try {
            foreach(var mode in new[]{"Demo","Live"}) {
                var raw=CloudHosting.ValidateConnection(config.GetConnectionString(mode=="Demo"?"Banking":"BankingLive")!,mode);
                var cs=new SqlConnectionStringBuilder(raw){Authentication=SqlAuthenticationMethod.NotSpecified};
                await using var sql=new SqlConnection(cs.ConnectionString){AccessToken=token};
                var workspace=new Workspace();workspace.Select(mode);
                await using var db=new BankingDb(new DbContextOptionsBuilder<BankingDb>().UseSqlServer(sql).Options,workspace);
                var pending=(await db.Database.GetPendingMigrationsAsync()).Count();
                await db.Database.MigrateAsync();
                Console.WriteLine(mode+": applied "+pending+" schema migrations; existing records preserved.");
            }
        } finally {File.Delete(tokenFile);}
    }
    public static async Task Run(IServiceProvider services, IConfiguration config)
    {
        var root = "/home/Banking/deployment";
        var file = Path.Combine(root,"transfer.protected"); var tokenFile=Path.Combine(root,"operator.protected");
        var protector=services.GetRequiredService<IDataProtectionProvider>().CreateProtector("Banking.Cloud.Migration.v1");
        var token=protector.Unprotect(await File.ReadAllTextAsync(tokenFile));
        var archive=JsonSerializer.Deserialize<Transfer>(protector.Unprotect(await File.ReadAllTextAsync(file)))
            ?? throw new InvalidOperationException("Invalid migration archive.");
        if (archive.Workspaces.Count!=2 || !archive.Workspaces.ContainsKey("Demo") || !archive.Workspaces.ContainsKey("Live"))
            throw new InvalidOperationException("Invalid migration workspaces.");
        var runtimeId=Guid.Parse(config["Maintenance:RuntimeClientId"]!);
        foreach(var mode in new[]{"Demo","Live"})
        {
            var workspace=new Workspace(); workspace.Select(mode);
            var raw=config.GetConnectionString(mode=="Demo"?"Banking":"BankingLive")!;
            _=CloudHosting.ValidateConnection(raw,mode);
            var connectionString=new SqlConnectionStringBuilder(raw) {Authentication=SqlAuthenticationMethod.NotSpecified};
            await using var sql=new SqlConnection(connectionString.ConnectionString) {AccessToken=token};
            await using var db=new BankingDb(new DbContextOptionsBuilder<BankingDb>().UseSqlServer(sql).Options,workspace);
            await db.Database.MigrateAsync();
            var tables=archive.Workspaces[mode];
            if(tables.Count!=Types.Length) throw new InvalidOperationException("Incomplete migration archive.");
            var alreadyPresent=Query(db,typeof(Connection)).Cast<object>().Any();
            if(!alreadyPresent)
            {
                foreach(var type in Types) if(Query(db,type).Cast<object>().Any()) throw new InvalidOperationException("Partial target rejected.");
                await using var transaction=await db.Database.BeginTransactionAsync();
                foreach(var type in Types)
                {
                    foreach(Entity entity in (System.Collections.IEnumerable)tables[type.Name].Deserialize(type.MakeArrayType())!)
                    {
                        if(entity.DemoScope!="") throw new InvalidOperationException("Session copy in canonical migration.");
                        if(entity is Connection c && c.IsDemo!=(mode=="Demo")) throw new InvalidOperationException("Workspace mismatch.");
                        entity.Version=[]; db.Add(entity);
                    }
                    await db.SaveChangesAsync(); db.ChangeTracker.Clear();
                }
                await transaction.CommitAsync();
            }
            foreach(var type in Types)
            {
                var rows=Query(db,type).Cast<object>().ToArray();
                var actual=JsonSerializer.SerializeToElement(rows,new JsonSerializerOptions {ReferenceHandler=ReferenceHandler.IgnoreCycles});
                if(CanonicalHash(tables[type.Name])!=CanonicalHash(actual)) throw new InvalidOperationException("Reconciliation failed for "+type.Name);
                db.ChangeTracker.Clear();
            }
            await sql.OpenAsync();
            await using var grant=sql.CreateCommand();
            grant.CommandText="IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name='BankingRuntime') CREATE USER [BankingRuntime] WITH SID=0x"
                +Convert.ToHexString(runtimeId.ToByteArray())+", TYPE=E; ALTER ROLE db_datareader ADD MEMBER [BankingRuntime]; ALTER ROLE db_datawriter ADD MEMBER [BankingRuntime];";
            await grant.ExecuteNonQueryAsync();
            Console.WriteLine(JsonSerializer.Serialize(new{mode,reconciled=true,transactions=await db.Transactions.CountAsync(),accounts=await db.Accounts.CountAsync(),runtimePermissions="data-only"}));
        }
        File.Delete(tokenFile); File.Delete(file);
        Console.WriteLine("Cloud import verified; temporary transfer and operator token removed.");
    }
    public static string CanonicalHash(JsonElement rows)
    {
        var array=JsonNode.Parse(rows.GetRawText())!.AsArray();
        foreach(var row in array) row!.AsObject().Remove("Version");
        var canonical=new JsonArray(array.OrderBy(x=>x!["Id"]!.GetValue<string>()).Select(x=>x!.DeepClone()).ToArray());
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(canonical.ToJsonString())));
    }
    private static IQueryable Query(BankingDb db,Type type)=>(IQueryable)typeof(DbContext).GetMethod(nameof(DbContext.Set),Type.EmptyTypes)!.MakeGenericMethod(type).Invoke(db,null)!;

    public static async Task Grant(IServiceProvider services,IConfiguration config)
    {
        var tokenFile="/home/Banking/deployment/operator.protected";
        var protector=services.GetRequiredService<IDataProtectionProvider>().CreateProtector("Banking.Cloud.Migration.v1");
        var token=protector.Unprotect(await File.ReadAllTextAsync(tokenFile));
        // SQL's explicit SID form expects the service principal's CLIENT ID, not its object ID.
        var sid=Convert.ToHexString(Guid.Parse(config["Maintenance:RuntimeClientId"]!).ToByteArray());
        foreach(var mode in new[]{"Demo","Live"})
        {
            var raw=CloudHosting.ValidateConnection(config.GetConnectionString(mode=="Demo"?"Banking":"BankingLive")!,mode);
            var cs=new SqlConnectionStringBuilder(raw){Authentication=SqlAuthenticationMethod.NotSpecified};
            await using var sql=new SqlConnection(cs.ConnectionString){AccessToken=token};
            await sql.OpenAsync();
            await using var command=sql.CreateCommand();
            command.CommandText="IF EXISTS(SELECT 1 FROM sys.database_principals WHERE name='BankingRuntime' AND sid<>0x"+sid+") DROP USER [BankingRuntime]; "
                +"IF NOT EXISTS(SELECT 1 FROM sys.database_principals WHERE name='BankingRuntime') CREATE USER [BankingRuntime] WITH SID=0x"+sid+", TYPE=E; "
                +"GRANT CONNECT TO [BankingRuntime]; ALTER ROLE db_datareader ADD MEMBER [BankingRuntime]; ALTER ROLE db_datawriter ADD MEMBER [BankingRuntime];";
            await command.ExecuteNonQueryAsync();
            Console.WriteLine(mode+": runtime client identity configured with data-only permissions.");
        }
        File.Delete(tokenFile);
    }
}
