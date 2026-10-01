using System.Net;
using System.Reflection;
using System.Text.Json;
using Banking.Api;
using Banking.Api.Data;
using Banking.Api.Providers;
using Banking.Api.Security;
using Banking.Api.Services;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

var builder = WebApplication.CreateBuilder(args);
if (builder.Environment.IsDevelopment())
{
    builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: false);
    builder.Configuration.AddCommandLine(args); // Explicit maintenance destinations must override local defaults.
}
var cloud = CloudHosting.Enabled(builder.Environment);
if (!cloud && !builder.Environment.IsDevelopment() && !builder.Environment.IsEnvironment("Testing"))
    throw new InvalidOperationException("Unsupported hosting environment.");
var urls = builder.Configuration["urls"] ?? "http://127.0.0.1:5080";
foreach (var url in cloud ? Array.Empty<string>() : urls.Split(';'))
{
    if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) ||
        !(uri.Host == "localhost" || IPAddress.TryParse(uri.Host, out var ip) && IPAddress.IsLoopback(ip)))
        throw new InvalidOperationException("Only loopback listeners are allowed.");
}
if (!cloud) builder.WebHost.UseUrls(urls);
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 65536);
builder.Logging.ClearProviders().AddConsole().AddFilter((category, _) => category?.StartsWith("Banking.Api", StringComparison.Ordinal) == true);
builder.Services.AddSingleton(TimeProvider.System);
if (cloud) builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = 429;
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
        context.Request.Path.StartsWithSegments("/api")
            ? RateLimitPartition.GetFixedWindowLimiter("api", _ => new FixedWindowRateLimiterOptions { PermitLimit = 600, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 })
            : RateLimitPartition.GetNoLimiter("assets"));
});
if (cloud) CloudHosting.ConfigureProtection(builder.Services, builder.Configuration);
else
{
    if (!OperatingSystem.IsWindows()) throw new InvalidOperationException("The local host requires Windows DPAPI.");
    LocalStorage.ProtectDirectories();
    var keyDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Banking", "keys");
    builder.Services.AddDataProtection().SetApplicationName("Banking.Local.v1")
        .PersistKeysToFileSystem(new DirectoryInfo(keyDirectory)).ProtectKeysWithDpapi();
}
builder.Services.AddScoped<Workspace>();
builder.Services.AddSingleton<WorkspaceCatalog>();
builder.Services.AddScoped<Vault>();
builder.Services.AddSingleton<LocalToken>();
builder.Services.AddSingleton<BrowserSessions>();
builder.Services.AddSingleton<OwnerPassword>();
builder.Services.AddDbContext<BankingDb>((services, o) => o.UseSqlServer(
    services.GetRequiredService<WorkspaceCatalog>().Connection(services.GetRequiredService<Workspace>().Bind()),
    sql => sql.UseCompatibilityLevel(150)).EnableSensitiveDataLogging(false));
var liveEnabled = builder.Configuration.GetValue<bool>("EnableBanking:Enabled");
if (builder.Environment.IsDevelopment()) builder.Services.AddSingleton<IBankProvider, ProductDemoProvider>();
builder.Services.AddSingleton<IBankProvider, SimulatorProvider>();
if (!builder.Environment.IsDevelopment()) builder.Services.AddSingleton<IBankProvider, ProductDemoProvider>();
if (liveEnabled)
{
    if (!builder.Configuration.GetValue<bool>("EnableBanking:LiveAccessApproved") || (!cloud && !builder.Configuration.GetValue<bool>("Local:RealDataProtectionVerified")))
        throw new InvalidOperationException("Live access requires separate approval and verified local data protection.");
    builder.Services.AddHttpClient<EnableBankingProvider>(c => c.Timeout = TimeSpan.FromSeconds(30))
        .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
}
builder.Services.AddScoped<ProviderRegistry>(s =>
{
    var workspace = s.GetRequiredService<Workspace>();
    var catalog = s.GetRequiredService<WorkspaceCatalog>();
    if (workspace.Bind() == "Live" && !catalog.TestLive)
        return new ProviderRegistry([s.GetRequiredService<EnableBankingProvider>()]);
    return new ProviderRegistry(s.GetServices<IBankProvider>().Where(x => x.IsDemo));
});
builder.Services.AddScoped<ConnectionService>();
builder.Services.AddScoped<SyncService>();
builder.Services.AddScoped<JobService>();
builder.Services.AddScoped<FinanceService>();
builder.Services.AddScoped<GoalService>();
builder.Services.AddScoped<LoanService>();
builder.Services.AddScoped<WealthService>();
builder.Services.AddScoped<ResearchService>();
builder.Services.AddMemoryCache();
builder.Services.AddHttpClient<IMarketDataProvider, SaxoMarketDataProvider>(c => c.Timeout = TimeSpan.FromSeconds(20)).AddHttpMessageHandler<SaxoBudgetHandler>()
    .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
builder.Services.AddSingleton<SaxoLocalSession>();
builder.Services.AddSingleton<SaxoOrders>();
builder.Services.AddSingleton<SaxoReadCache>();
builder.Services.AddSingleton<SaxoRequestBudget>();
builder.Services.AddTransient<SaxoBudgetHandler>();
builder.Services.AddHttpClient("SaxoOrders", c => c.Timeout=TimeSpan.FromSeconds(25)).AddHttpMessageHandler<SaxoBudgetHandler>()
    .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
builder.Services.AddHttpClient("SaxoOAuth", c => c.Timeout=TimeSpan.FromSeconds(20))
    .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
builder.Services.AddHttpClient<SaxoReadClient>(c => c.Timeout = TimeSpan.FromSeconds(20)).AddHttpMessageHandler<SaxoBudgetHandler>()
    .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
builder.Services.AddScoped<AdvisorDataService>();
builder.Services.AddHttpClient("LocalAdvisorProxy", c => c.Timeout = TimeSpan.FromMinutes(3))
    .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { UseCookies = false, AllowAutoRedirect = false });
builder.Services.AddScoped<PlanningService>();
builder.Services.AddScoped<ReviewService>();
builder.Services.AddScoped<BudgetPlanService>();
builder.Services.AddScoped<BackupService>();
builder.Services.AddScoped<DemoService>();
builder.Services.AddHostedService<SyncWorker>();
builder.Services.AddHostedService<SaxoSessionKeeper>();
builder.Services.AddOpenApi();
var app = builder.Build();
if (cloud && builder.Configuration["Maintenance:Action"] is "cloud-import" or "cloud-grant" or "cloud-schema")
{
    try {
        if(builder.Configuration["Maintenance:Action"] == "cloud-schema") await CloudImport.Schema(app.Services,builder.Configuration);
        else if(builder.Configuration["Maintenance:Action"] == "cloud-grant") await CloudImport.Grant(app.Services,builder.Configuration);
        else await CloudImport.Run(app.Services, builder.Configuration);
    }
    catch (Exception error)
    {
        Console.Error.WriteLine(error is SqlException sqlError ? $"Cloud import failed: SQL {sqlError.Number}" : "Cloud import failed: " + error.GetType().Name);
        Environment.ExitCode = 1;
    }
    return;
}
if (builder.Configuration["Maintenance:Action"] == "prepare-key")
{
    using var keyScope = app.Services.CreateScope(); keyScope.ServiceProvider.GetRequiredService<Workspace>().Select("Live");
    Console.WriteLine(JsonSerializer.Serialize(LocalStorage.PrepareKey(keyScope.ServiceProvider.GetRequiredService<Vault>())));
    return;
}
if (builder.Configuration["Maintenance:Action"] == "verify-provider")
{
    // Application metadata needs neither bank consent nor a live database.
    using var providerScope = app.Services.CreateScope();
    providerScope.ServiceProvider.GetRequiredService<Workspace>().Select("Live");
    using var http = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(30) };
    var provider = new EnableBankingProvider(http, builder.Configuration, providerScope.ServiceProvider.GetRequiredService<Vault>());
    try { Console.WriteLine(JsonSerializer.Serialize(await provider.VerifyApplication(CancellationToken.None))); }
    catch (Exception) { Console.Error.WriteLine("Provider metadata verification failed; no bank data was requested."); Environment.ExitCode = 1; }
    return;
}
if (builder.Configuration["Maintenance:Action"] == "inspect-authorized-session")
{
    using var scope = app.Services.CreateScope();
    scope.ServiceProvider.GetRequiredService<Workspace>().Select("Live");
    var vault = scope.ServiceProvider.GetRequiredService<Vault>();
    try
    {
        var session = await scope.ServiceProvider.GetRequiredService<EnableBankingProvider>()
            .ReadAuthorizedSession(builder.Configuration["Maintenance:Session"] ?? "", CancellationToken.None);
        var path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Banking", "session-recovery.protected");
        await using (var file = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None))
        await using (var writer = new StreamWriter(file)) await writer.WriteAsync(vault.Protect(JsonSerializer.Serialize(session)));
        var accounts = session.Session.Accounts;
        Console.WriteLine(JsonSerializer.Serialize(new { accounts = accounts.Count,
            distinctPrimaryIdentities = accounts.Select(x => x.Identity).Distinct(StringComparer.Ordinal).Count(),
            aliasCounts = accounts.Select(x => x.IdentityAliases?.Count ?? 0),
            sharedAliasGroups = accounts.SelectMany(x => (x.IdentityAliases ?? []).Append(x.Identity).Distinct(StringComparer.Ordinal))
                .GroupBy(x => x, StringComparer.Ordinal).Where(x => x.Count() > 1).Select(x => x.Count()),
            protectedRecoverySaved = true }));
    }
    catch (Exception e) { Console.Error.WriteLine(e is ProviderFailure f ? f.Code : "SESSION_INSPECTION_FAILED"); Environment.ExitCode = 1; }
    return;
}
app.Use(async (context, next) =>
{
    try { await next(context); }
    catch (Exception error)
    {
        var (status, code) = error switch
        {
            ApiFailure e => (e.Status, e.Code), ProviderFailure e => (502, e.Code),
            DbUpdateConcurrencyException => (409, "VERSION_CONFLICT"), DbUpdateException => (409, "DATA_CONFLICT"),
            BadHttpRequestException => (400, "INVALID_REQUEST"), JsonException => (400, "INVALID_JSON"),
            FormatException => (400, "INVALID_FORMAT"), OperationCanceledException => (408, "REQUEST_CANCELLED"),
            _ => (500, "REQUEST_FAILED")
        };
        app.Logger.LogWarning("request_failed code={Code}", code);
        if (!context.Response.HasStarted)
        {
            context.Response.StatusCode = status;
            if (error is ApiFailure { Details: { } details })
                await context.Response.WriteAsJsonAsync(new { error = code, details, traceId = context.TraceIdentifier });
            else
                await context.Response.WriteAsJsonAsync(new { error = code, traceId = context.TraceIdentifier });
        }
    }
});
app.UseMiddleware<LocalAdvisorProxy>();
app.UseMiddleware<LocalAccessMiddleware>();
if (cloud) app.UseRateLimiter();
app.UseMiddleware<WorkspaceMiddleware>();
if (cloud) app.UseMiddleware<SharedDemoScopeMiddleware>();
app.UseDefaultFiles();
app.UseStaticFiles();
app.MapPost("/api/browser/ticket", (BrowserSessions sessions) => new { ticket = sessions.Issue(), expiresInSeconds = 120 });
app.MapPost("/api/browser/session", (BrowserTicketInput input, BrowserSessions sessions, HttpContext context) =>
{
    sessions.Revoke(context.Request.Cookies[BrowserSessions.Cookie]);
    context.Response.Cookies.Append(BrowserSessions.Cookie, sessions.Consume(input.Ticket), BrowserSessions.Options);
    return Results.Ok(new { status = "connected" });
});
app.MapGet("/api/browser/status", (BrowserSessions sessions, OwnerPassword password, HttpContext context) => new
{
    role = sessions.Role(context.Request.Cookies[BrowserSessions.Cookie]), passwordConfigured = password.Configured,
    localAdvisor = cloud ? app.Configuration.GetValue<bool>("Advisor:Enabled") : app.Environment.IsDevelopment() && app.Configuration.GetValue<bool>("Local:AdvisorEnabled")
});
app.MapPost("/api/browser/demo", (BrowserSessions sessions, HttpContext context) =>
{
    sessions.Revoke(context.Request.Cookies[BrowserSessions.Cookie]);
    context.Response.Cookies.Append(BrowserSessions.Cookie, sessions.Create("Demo"), BrowserSessions.Options);
    return Results.Ok(new { status = "connected", role = "Demo" });
});
app.MapPost("/api/browser/sign-in", (OwnerPasswordInput input, OwnerPassword password, BrowserSessions sessions, HttpContext context) =>
{
    password.Verify(input.Password);
    sessions.Revoke(context.Request.Cookies[BrowserSessions.Cookie]);
    context.Response.Cookies.Append(BrowserSessions.Cookie, sessions.Create("Owner"), BrowserSessions.Options);
    return Results.Ok(new { status = "connected", role = "Owner" });
});
app.MapPost("/api/browser/password", (OwnerPasswordInput input, OwnerPassword password, BrowserSessions sessions, HttpContext context) =>
{
    if (context.Items["OwnerAccess"] is not true) return Results.Unauthorized();
    password.Setup(input.Password);
    sessions.RevokeOwners();
    context.Response.Cookies.Append(BrowserSessions.Cookie, sessions.Create("Owner"), BrowserSessions.Options);
    return Results.Ok(new { status = "configured" });
});
app.MapPost("/api/browser/logout", (HttpContext context, BrowserSessions sessions) =>
{ sessions.Revoke(context.Request.Cookies[BrowserSessions.Cookie]); context.Response.Cookies.Delete(BrowserSessions.Cookie, BrowserSessions.Options); return Results.NoContent(); });
app.MapGet("/health", () => new { status = "running", environment = cloud ? "azure" : "local" });
var build = typeof(Program).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion;
app.MapGet("/api/runtime-info", () => Results.Ok(new
{
    apiContractVersion = 1,
    backend = cloud ? "azure" : "local",
    sharedDemo = true,
    features = new
    {
        sharedDemoFinancialData = true,
        relativeAdvisorRenderer = cloud && app.Configuration.GetValue<bool>("Advisor:Enabled")
    },
    build
}));
app.MapGet("/api/advisor-goals", async (GoalService goals, Workspace workspace, CancellationToken ct) =>
{
    if (!(cloud ? app.Configuration.GetValue<bool>("Advisor:Enabled") : app.Environment.IsDevelopment() && app.Configuration.GetValue<bool>("Local:AdvisorEnabled"))) return Results.NotFound();
    return Results.Ok(new { source = "Banking", mode = workspace.Mode, goalContext = await goals.AdvisorContext(ct) });
});
app.MapGet("/api/advisor-context", async (DateOnly? from, DateOnly? to, string? currency, AdvisorDataService data, CancellationToken ct) =>
{
    if (!(cloud ? app.Configuration.GetValue<bool>("Advisor:Enabled") : app.Environment.IsDevelopment() && app.Configuration.GetValue<bool>("Local:AdvisorEnabled"))) return Results.NotFound();
    return Results.Ok(await data.Read(from, to, currency, ct));
});
app.MapPost("/api/advisor-budgets/{id:guid}/entries", async (Guid id, AdvisorBudgetEntryInput input, BudgetPlanService budgets, CancellationToken ct) =>
{
    if (!(cloud ? app.Configuration.GetValue<bool>("Advisor:Enabled") : app.Environment.IsDevelopment() && app.Configuration.GetValue<bool>("Local:AdvisorEnabled"))) return Results.NotFound();
    return Results.Ok(await budgets.AddAdvisorEntry(id, input, ct));
});
app.MapGet("/legal/privacy", () => Results.Text(cloud ? LegalText.CloudPrivacy : LegalText.Privacy, "text/plain"));
app.MapGet("/legal/terms", () => Results.Text(cloud ? LegalText.CloudTerms : LegalText.Terms, "text/plain"));
if (!cloud) app.MapOpenApi();
app.MapBankingApi();
app.MapPlanningApi();
var catalog = app.Services.GetRequiredService<WorkspaceCatalog>();
var maintenance = builder.Configuration["Maintenance:Action"];
var selectedModes = maintenance is null ? catalog.Modes : [builder.Configuration["Maintenance:Mode"] ?? "Demo"];
foreach (var mode in selectedModes)
{
    using var scope = app.Services.CreateScope();
    scope.ServiceProvider.GetRequiredService<Workspace>().Select(mode);
    var db = scope.ServiceProvider.GetRequiredService<BankingDb>();
    var connection = new SqlConnectionStringBuilder(db.Database.GetConnectionString());
    if (!cloud && (!connection.DataSource.StartsWith("(localdb)\\", StringComparison.OrdinalIgnoreCase) || !connection.InitialCatalog.StartsWith("Banking_", StringComparison.Ordinal)))
        throw new InvalidOperationException("Only a Banking_ database on LocalDB is allowed.");
    if (!cloud) await db.Database.MigrateAsync();
    else
    {
        // EF's database-existence probe opens master. The runtime identity deliberately
        // has access only to these application databases, so read their history directly.
        var applied = await db.Database.SqlQueryRaw<string>("SELECT [MigrationId] AS [Value] FROM [__EFMigrationsHistory]").ToListAsync();
        if (db.Database.GetMigrations().Except(applied).Any())
            throw new InvalidOperationException("Apply production migrations with the deployment identity before starting.");
    }
    var expectedDemo = mode == "Demo" || catalog.TestLive;
    if (await db.Connections.AnyAsync(x => x.IsDemo != expectedDemo))
        throw new InvalidOperationException("Demo and live data must remain in separate databases.");
    if (!cloud && mode == "Demo" && maintenance is null)
        await scope.ServiceProvider.GetRequiredService<DemoService>().CleanDisplayNames(CancellationToken.None);
    _ = scope.ServiceProvider.GetRequiredService<LocalToken>();
    if (maintenance is not null)
    {
        if (maintenance == "cleanup-ui-test")
        {
            var name = connection.InitialCatalog;
            Check.That(builder.Environment.IsEnvironment("Testing") && name.StartsWith("Banking_Test_", StringComparison.Ordinal)
                && Guid.TryParseExact(name[13..], "N", out _), "CLEANUP_REQUIRES_DISPOSABLE_TEST_DATABASE");
            await db.Database.EnsureDeletedAsync();
            Console.WriteLine("Disposable UI test database removed.");
            return;
        }
        if (maintenance == "localize-demo-danish")
        {
            await scope.ServiceProvider.GetRequiredService<DemoService>().LocalizeDanish(CancellationToken.None);
            Console.WriteLine("Known synthetic text translated to Danish; IDs, amounts and Live data preserved.");
            return;
        }
        if (maintenance == "initialize-demo")
        {
            await scope.ServiceProvider.GetRequiredService<DemoService>().Initialize(CancellationToken.None);
            Console.WriteLine(JsonSerializer.Serialize(new { status = "demo_import_scheduled", whollySynthetic = true }));
            return;
        }
        if (maintenance == "enrich-demo-bank-details")
        {
            await scope.ServiceProvider.GetRequiredService<DemoService>().EnrichBankDetails(CancellationToken.None);
            Console.WriteLine("Synthetic bank details enriched; amounts, categories and matches preserved.");
            return;
        }
        if (maintenance == "enrich-demo-financial-examples")
        {
            await scope.ServiceProvider.GetRequiredService<DemoService>().EnrichFinancialExamples(CancellationToken.None);
            Console.WriteLine("Missing synthetic financial examples added. Existing records preserved; Live unchanged.");
            return;
        }
        if (maintenance == "bank-details-status")
        {
            var now=DateTimeOffset.UtcNow;
            var accountStatus=await db.Accounts.Where(x=>x.Accessible).Select(x=>new { enriched=x.BankDetailsImportedAt!=null,
                x.LastSuccess, x.Connection.RetryNotBefore }).ToListAsync();
            Console.WriteLine(JsonSerializer.Serialize(new { mode, accounts=accountStatus,
                currentTransactions=await db.Transactions.CountAsync(x=>x.Current),
                enrichedTransactions=await db.Transactions.CountAsync(x=>x.Current && x.BankDetailsJson!=null),
                jobs=await db.Jobs.Where(x=>x.Status=="Queued" || x.Status=="Running" || x.Status=="Failed")
                    .Select(x=>new {x.Status,x.ErrorCode,x.NextAttempt,x.Pages,x.FullHistory}).Take(20).ToListAsync() }));
            return;
        }
        if (maintenance == "recover-authorized-session")
        {
            Check.That(mode == "Live", "LIVE_RECOVERY_ONLY");
            var filePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Banking", "session-recovery.protected");
            var vault = scope.ServiceProvider.GetRequiredService<Vault>();
            try
            {
                var recovered = JsonSerializer.Deserialize<AuthorizedSession>(vault.Reveal(await File.ReadAllTextAsync(filePath)))
                    ?? throw new ProviderFailure("INVALID_PROVIDER_SESSION");
                await scope.ServiceProvider.GetRequiredService<ConnectionService>().RecoverAuthorizedSession(recovered, CancellationToken.None);
                File.Delete(filePath);
                Console.WriteLine(JsonSerializer.Serialize(new { status = "import_scheduled", recoveredWithoutNewConsent = true }));
            }
            catch (Exception e) { Console.Error.WriteLine(e is ProviderFailure f ? f.Code : e is ApiFailure a ? a.Code : "SESSION_RECOVERY_FAILED"); Environment.ExitCode = 1; }
            return;
        }
        var file = builder.Configuration["Maintenance:File"] ?? throw new InvalidOperationException("Maintenance file is required.");
        var backups = scope.ServiceProvider.GetRequiredService<BackupService>();
        var passphrase = builder.Configuration.GetValue<bool>("Maintenance:Portable") ? PortableArchive.ReadPassphrase(maintenance == "backup") : null;
        if (maintenance == "backup") await backups.Export(file, CancellationToken.None, passphrase);
        else if (maintenance == "restore")
        {
            await backups.Restore(file, CancellationToken.None, passphrase);
            Console.WriteLine(JsonSerializer.Serialize(new { restoredAccounts = await db.Accounts.CountAsync(),
                restoredTransactions = await db.Transactions.CountAsync(), restoredSnapshots = await db.Balances.CountAsync() }));
        }
        else throw new InvalidOperationException("Unknown maintenance action.");
        app.Logger.LogInformation("local_maintenance_completed action={Action}", maintenance);
        return;
    }
}
app.Logger.LogInformation("local_backend_ready");
app.Run();
public partial class Program;

