using System.Data;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Banking.Api.Data;
using Banking.Api.Security;
using Banking.Api.Services;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

// Operator-only migration utility. Never published with the web app; outputs only verification counts/status.
const string subscription = "0ac7d719-89bc-4100-be87-a79d33e953a7";
if (!OperatingSystem.IsWindows()) throw new InvalidOperationException("Run this operator utility as the Windows owner.");
var root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Banking", "cloud");
Directory.CreateDirectory(root);
var configPath = Path.Combine(root, "settings.dpapi");
var localRoot = Directory.GetCurrentDirectory();
var local = new ConfigurationBuilder().AddJsonFile(Path.Combine(localRoot,"src/Banking.Api/appsettings.Local.json")).Build();
var services = new ServiceCollection();
services.AddDataProtection().SetApplicationName("Banking.Local.v1")
    .PersistKeysToFileSystem(new DirectoryInfo(Path.Combine(Path.GetDirectoryName(root)!,"keys"))).ProtectKeysWithDpapi();
using var sourceServices = services.BuildServiceProvider();
var sourceProtection = sourceServices.GetRequiredService<IDataProtectionProvider>();
var settings = File.Exists(configPath) ? JsonSerializer.Deserialize<Dictionary<string,string>>(Encoding.UTF8.GetString(
    ProtectedData.Unprotect(File.ReadAllBytes(configPath),null,DataProtectionScope.CurrentUser)))! : new Dictionary<string,string>();
var command = args.FirstOrDefault() ?? "";
if (command == "prepare")
{
    if (settings.Count != 0) { Console.WriteLine("Protected deployment configuration already exists."); return; }
    var host = args[1]; var server = args[2];
    if (!host.EndsWith(".azurewebsites.net") || !server.EndsWith(".database.windows.net")) throw new InvalidOperationException("Invalid deployment endpoints.");
    using var rsa = RSA.Create(3072);
    var request = new CertificateRequest("CN=Banking production data protection",rsa,HashAlgorithmName.SHA256,RSASignaturePadding.Pkcs1);
    using var certificate = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1),DateTimeOffset.UtcNow.AddYears(5));
    var liveWorkspace = new Workspace(); liveWorkspace.Select("Live");
    settings = new()
    {
        ["ASPNETCORE_ENVIRONMENT"]="Production", ["Cloud__Origin"]="https://"+host,
        ["Cloud__ProtectionCertificate"]=Convert.ToBase64String(certificate.Export(X509ContentType.Pfx)),
        ["Cloud__OwnerPasswordHash"]=sourceProtection.CreateProtector("Banking.Local.OwnerPassword.v1").Unprotect(
            File.ReadAllText(Path.Combine(Path.GetDirectoryName(root)!,"owner-password.protected"))),
        ["Cloud__LiveCallbackUrl"]="https://"+host+"/api/auth/callback/live",
        ["EnableBanking__PrivateKey"]=new Vault(sourceProtection,liveWorkspace).Reveal(File.ReadAllText(local["EnableBanking:ProtectedKeyFile"]!)),
        ["EnableBanking__ApplicationId"]=local["EnableBanking:ApplicationId"]!,
        ["EnableBanking__Enabled"]="true", ["EnableBanking__LiveAccessApproved"]="true",
        ["ConnectionStrings__Banking"]=$"Server={server};Database=Banking_Demo;Authentication=Active Directory Managed Identity;Encrypt=True;TrustServerCertificate=False",
        ["ConnectionStrings__BankingLive"]=$"Server={server};Database=Banking_Live_Dan;Authentication=Active Directory Managed Identity;Encrypt=True;TrustServerCertificate=False",
        ["Sync__PollSeconds"]="60", ["Local__DisableWorker"]="true",
        ["WEBSITE_HTTPLOGGING_RETENTION_DAYS"]="1", ["SCM_DO_BUILD_DURING_DEPLOYMENT"]="false"
    };
    File.WriteAllBytes(configPath, ProtectedData.Protect(JsonSerializer.SerializeToUtf8Bytes(settings),null,DataProtectionScope.CurrentUser));
    Console.WriteLine("Deployment secrets prepared in the protected owner directory. Worker disabled until cutover verification."); return;
}
if (settings.Count == 0) throw new InvalidOperationException("Prepare configuration first.");
var cloudConfig = new ConfigurationBuilder().AddInMemoryCollection(settings.Select(x=>KeyValuePair.Create<string,string?>(x.Key.Replace("__",":"),x.Value))
    .Append(KeyValuePair.Create<string,string?>("Cloud:KeyDirectory",Path.Combine(root,"keys")))).Build();
var cloudServices = new ServiceCollection(); CloudHosting.ConfigureProtection(cloudServices,cloudConfig);
using var targetServices = cloudServices.BuildServiceProvider();
var targetProtection = targetServices.GetRequiredService<IDataProtectionProvider>();
if (command == "keyring")
{
    _ = targetProtection.CreateProtector("migration-warmup").Protect("synthetic-keyring-check");
    Console.WriteLine("Certificate-protected production key ring initialized."); return;
}
if (command == "settings-file")
{
    var destination=Path.Combine(root,"settings.transient.json");
    File.WriteAllText(destination,JsonSerializer.Serialize(new {properties=settings}));
    Console.WriteLine("Transient settings file prepared in protected directory; remove immediately after upload."); return;
}
if (command == "refresh-operator")
{
    File.WriteAllText(Path.Combine(root,"operator.protected"),targetProtection.CreateProtector("Banking.Cloud.Migration.v1").Protect(await AccessToken("https://database.windows.net/")));
    Console.WriteLine("Encrypted short-lived operator token refreshed."); return;
}
if (command == "export-cloud")
{
    var tablesByMode=new Dictionary<string,Dictionary<string,JsonElement>>();
    foreach(var mode in new[]{"Demo","Live"})
    {
        var scope=new Workspace();scope.Select(mode);
        var connection=mode=="Demo" ? local.GetConnectionString("Banking") ?? "Server=(localdb)\\Banking;Database=Banking_Demo;Integrated Security=True;TrustServerCertificate=True" : local.GetConnectionString("BankingLive")!;
        await using var db=new BankingDb(new DbContextOptionsBuilder<BankingDb>().UseSqlServer(connection).Options,scope);
        var oldVault=new Vault(sourceProtection,scope);var newVault=new Vault(targetProtection,scope);
        var tables=new Dictionary<string,JsonElement>();
        await using var transaction=await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        foreach(var type in CloudImport.Types)
        {
            var rows=Query(db,type).Cast<Entity>().ToList();
            foreach(var row in rows)
            {
                row.Version=[];
                if(row is Connection c && c.Session.Length>0)c.Session=newVault.Protect(oldVault.Reveal(c.Session));
                if(row is SyncJob j) {if(j.Cursor is not null)j.Cursor=newVault.Protect(oldVault.Reveal(j.Cursor));if(j.Status=="Running")j.Status="Queued";}
            }
            var typed=Array.CreateInstance(type,rows.Count);for(var i=0;i<rows.Count;i++)typed.SetValue(rows[i],i);
            tables[type.Name]=JsonSerializer.SerializeToElement(typed,type.MakeArrayType(),new JsonSerializerOptions {ReferenceHandler=ReferenceHandler.IgnoreCycles});
            db.ChangeTracker.Clear();
        }
        await transaction.CommitAsync(); tablesByMode[mode]=tables;
    }
    var protector=targetProtection.CreateProtector("Banking.Cloud.Migration.v1");
    File.WriteAllText(Path.Combine(root,"transfer.protected"),protector.Protect(JsonSerializer.Serialize(new CloudImport.Transfer(tablesByMode))));
    File.WriteAllText(Path.Combine(root,"operator.protected"),protector.Protect(await AccessToken("https://database.windows.net/")));
    Console.WriteLine("Encrypted cloud transfer and short-lived operator token prepared. No source records modified.");return;
}
if (command is not ("rehearse" or "migrate" or "verify" or "grant")) throw new InvalidOperationException("Unknown operator action.");
var sqlToken = command == "rehearse" ? null : await AccessToken("https://database.windows.net/");
foreach(var mode in new[]{"Demo","Live"})
{
    var workspace=new Workspace(); workspace.Select(mode);
    var sourceConnection = new SqlConnection(mode=="Demo"
        ? local.GetConnectionString("Banking") ?? "Server=(localdb)\\Banking;Database=Banking_Demo;Integrated Security=True;TrustServerCertificate=True"
        : local.GetConnectionString("BankingLive") ?? throw new InvalidOperationException("Local Live database is not configured."));
    await using var source = new BankingDb(new DbContextOptionsBuilder<BankingDb>().UseSqlServer(sourceConnection).Options, workspace);
    // Additive migration after the encrypted pre-cutover backup; it preserves all existing source records.
    if (command is "rehearse" or "migrate") await source.Database.MigrateAsync();
    var targetName=command=="rehearse" ? "Banking_Restore_Cloud_"+mode+"_"+Guid.NewGuid().ToString("N") : mode=="Demo"?"Banking_Demo":"Banking_Live_Dan";
    var connection = command=="rehearse" ? new SqlConnection($"Server=(localdb)\\Banking;Database={targetName};Integrated Security=True;TrustServerCertificate=True")
        : new SqlConnection($"Server={new SqlConnectionStringBuilder(settings[mode=="Demo"?"ConnectionStrings__Banking":"ConnectionStrings__BankingLive"]).DataSource};Database={targetName};Encrypt=True;TrustServerCertificate=False") { AccessToken=sqlToken };
    await using var target=new BankingDb(new DbContextOptionsBuilder<BankingDb>().UseSqlServer(connection).Options,workspace);
    if (command == "grant")
    {
        var principal = Guid.Parse(args[1]);
        await connection.OpenAsync();
        await using var grant = connection.CreateCommand();
        // SID is an explicitly parsed GUID, never a SQL identifier or free-form user string.
        grant.CommandText = "IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'BankingRuntime') CREATE USER [BankingRuntime] WITH SID = 0x"
            + Convert.ToHexString(principal.ToByteArray()) + ", TYPE = E; ALTER ROLE [db_datareader] ADD MEMBER [BankingRuntime]; ALTER ROLE [db_datawriter] ADD MEMBER [BankingRuntime];";
        await grant.ExecuteNonQueryAsync();
        Console.WriteLine("Runtime data-only SQL permissions configured for " + mode); continue;
    }
    if (command!="verify") await target.Database.MigrateAsync();
    var types=new[]{typeof(Connection),typeof(Account),typeof(AccountAlias),typeof(Category),typeof(CategoryRule),typeof(BankTransaction),
        typeof(BalanceSnapshot),typeof(Budget),typeof(BudgetPlan),typeof(BudgetEntry),typeof(Goal),typeof(ClassificationChange),typeof(TransferMatch),
        typeof(ReviewAction),typeof(SyncJob),typeof(ImportItem)};
    var sourceVault=new Vault(sourceProtection,workspace); var destinationVault=new Vault(targetProtection,workspace);
    var options=new JsonSerializerOptions {ReferenceHandler=ReferenceHandler.IgnoreCycles};
    if (command!="verify")
    {
        foreach(var type in types) if (Query(target,type).Cast<object>().Any()) throw new InvalidOperationException("Migration target must be empty; no overwrite performed.");
        await using var sourceRead=await source.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        await using var transaction=await target.Database.BeginTransactionAsync();
        foreach(var type in types)
        {
            var json=JsonSerializer.Serialize(Query(source,type).Cast<object>().ToArray(),options); source.ChangeTracker.Clear();
            foreach(Entity entity in (System.Collections.IEnumerable)JsonSerializer.Deserialize(json,type.MakeArrayType(),options)!)
            {
                entity.Version=[];
                if(entity is Connection c && c.Session.Length>0) c.Session=destinationVault.Protect(sourceVault.Reveal(c.Session));
                if(entity is SyncJob j) { if(j.Cursor is not null) j.Cursor=destinationVault.Protect(sourceVault.Reveal(j.Cursor)); if(j.Status=="Running") j.Status="Queued"; }
                target.Add(entity);
            }
            await target.SaveChangesAsync(); target.ChangeTracker.Clear();
        }
        await transaction.CommitAsync(); await sourceRead.CommitAsync();
    }
    foreach(var type in types)
    {
        var sourceCount=Query(source,type).Cast<object>().Count(); var destinationCount=Query(target,type).Cast<object>().Count();
        if(sourceCount!=destinationCount) throw new InvalidOperationException("Row count reconciliation failed for "+type.Name);
    }
    var left=await source.Transactions.AsNoTracking().OrderBy(x=>x.Id).Select(x=>new{x.Id,x.AccountId,x.Amount,x.Currency,x.BookingDate,x.SourceKey,x.CategoryId,x.Classification}).ToListAsync();
    var right=await target.Transactions.AsNoTracking().OrderBy(x=>x.Id).Select(x=>new{x.Id,x.AccountId,x.Amount,x.Currency,x.BookingDate,x.SourceKey,x.CategoryId,x.Classification}).ToListAsync();
    if(JsonSerializer.Serialize(left)!=JsonSerializer.Serialize(right)) throw new InvalidOperationException("Transaction reconciliation failed.");
    foreach(var c in await target.Connections.ToListAsync()) if(c.Session.Length>0) _=destinationVault.Reveal(c.Session);
    Console.WriteLine(JsonSerializer.Serialize(new{mode,rowsVerified=true,transactions=left.Count,accounts=await target.Accounts.CountAsync(),goals=await target.Goals.CountAsync(),budgets=await target.BudgetPlans.CountAsync(),rehearsal=command=="rehearse"}));
    if(command=="rehearse")
    {
        if(!targetName.StartsWith("Banking_Restore_Cloud_")) throw new InvalidOperationException("Unexpected cleanup target.");
        await target.Database.EnsureDeletedAsync();
    }
}
static IQueryable Query(BankingDb db, Type type)=> (IQueryable)typeof(DbContext).GetMethod(nameof(DbContext.Set),Type.EmptyTypes)!.MakeGenericMethod(type).Invoke(db,null)!;
static async Task<string> AccessToken(string resource)
{
    var process=new Process {StartInfo=new ProcessStartInfo("cmd.exe") {RedirectStandardOutput=true,RedirectStandardError=true,UseShellExecute=false,CreateNoWindow=true}};
    process.StartInfo.ArgumentList.Add("/c"); process.StartInfo.ArgumentList.Add("az");
    foreach(var item in new[]{"account","get-access-token","--subscription",subscription,"--resource",resource,"-o","json"}) process.StartInfo.ArgumentList.Add(item);
    process.Start(); var output=await process.StandardOutput.ReadToEndAsync(); await process.WaitForExitAsync();
    if(process.ExitCode!=0) throw new InvalidOperationException("Azure SQL authentication failed; owner sign-in may be required.");
    return JsonDocument.Parse(output).RootElement.GetProperty("accessToken").GetString()!;
}
