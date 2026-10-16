using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Banking.Api;
using Banking.Api.Data;
using Banking.Api.Providers;
using Banking.Api.Security;
using Banking.Api.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using static Banking.Tests.PensionHistoryTests;

namespace Banking.Tests;

public sealed partial class PensionEndpointTests
{
    sealed class Host : IAsyncDisposable
    {
        public WebApplication App = null!;
        // Keep each isolated in-memory database alive, but never share its connection
        // object between concurrent request contexts (including EF function registration).
        readonly SqliteConnection demo = Keeper(), live = Keeper();
        static SqliteConnection Keeper() => new(new SqliteConnectionStringBuilder {
            DataSource = "pension-endpoint-" + Guid.NewGuid().ToString("N"), Mode = SqliteOpenMode.Memory,
            Cache = SqliteCacheMode.Shared, Pooling = false
        }.ToString());
        public BrowserSessions Sessions = null!;
        public async Task Init(IPensionPdfReader? reader = null)
        {
            await demo.OpenAsync(); await live.OpenAsync();
            var b = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Production" });
            b.Configuration.AddInMemoryCollection(new Dictionary<string,string?> { ["Cloud:Origin"] = "https://banking.fixture", ["EnableBanking:Enabled"] = "true" });
            b.WebHost.UseTestServer();
            b.Services.AddSingleton<TimeProvider>(new Clock());
            b.Services.AddSingleton<IDataProtectionProvider>(new EphemeralDataProtectionProvider());
            // In-memory fixture sessions only, not an App Service file or real owner credential.
            b.Services.AddSingleton(s => Sessions = new BrowserSessions(new Clock(), new TestEnv(), b.Configuration, s.GetRequiredService<IDataProtectionProvider>()));
            b.Services.AddSingleton<LocalToken>(); b.Services.AddSingleton<WorkspaceCatalog>(); b.Services.AddScoped<Workspace>();
            b.Services.AddScoped(s => new BankingDb(Options((s.GetRequiredService<Workspace>().Mode == "Live" ? live : demo).ConnectionString), s.GetRequiredService<Workspace>()));
            b.Services.AddSingleton<IPensionPdfReader>(reader ?? new Reader()); b.Services.AddScoped<PensionImportService>(); b.Services.AddScoped<WealthService>();
            App = b.Build();
            App.Use(async (ctx,next) => { try { await next(); } catch (ApiFailure f) {ctx.Response.StatusCode=f.Status;await ctx.Response.WriteAsJsonAsync(new {error=f.Code,details=f.Details});} catch(DbUpdateConcurrencyException) {ctx.Response.StatusCode=409;await ctx.Response.WriteAsJsonAsync(new {error="VERSION_CONFLICT"});} });
            App.UseMiddleware<LocalAccessMiddleware>(); App.UseMiddleware<WorkspaceMiddleware>(); App.MapPensionApi();
            App.MapGet("/api/wealth",(WealthService service,CancellationToken ct)=>service.List(ct));
            App.MapGet("/api/wealth/summary",(WealthService service,CancellationToken ct)=>service.Summary("DKK",ct));
            App.MapGet("/api/wealth/overview",(WealthService service,CancellationToken ct)=>service.Overview("DKK",ct));
            foreach(var conn in new[]{demo,live}) { await using var db=new BankingDb(Options(conn)); await db.Database.EnsureCreatedAsync(); }
            await App.StartAsync();
            Sessions=App.Services.GetRequiredService<BrowserSessions>();
        }
        public HttpClient Client(string? role="Owner",string mode="Live")
        {
            var client=App.GetTestClient();client.BaseAddress=new("https://banking.fixture");
            client.DefaultRequestHeaders.Add("X-Banking-Client","web"); client.DefaultRequestHeaders.Add("X-Banking-Mode",mode);
            client.DefaultRequestHeaders.Add("Origin","https://banking.fixture");
            if(role is not null)client.DefaultRequestHeaders.Add("Cookie",BrowserSessions.Cookie+"="+Sessions.Create(role));return client;
        }
        public async Task<int> WealthCount() {await using var db=new BankingDb(Options(live));return await db.WealthRecords.CountAsync();}
        public async Task<int> DocumentCount() {await using var db=new BankingDb(Options(live));return await db.PensionDocuments.CountAsync();}
        public async ValueTask DisposeAsync(){await App.DisposeAsync();await demo.DisposeAsync();await live.DisposeAsync();}
    }
    sealed class TestEnv : Microsoft.Extensions.Hosting.IHostEnvironment
    {
        public string EnvironmentName{get;set;}="Testing";public string ApplicationName{get;set;}="Fixture";public string ContentRootPath{get;set;}="";
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider{get;set;}=new Microsoft.Extensions.FileProviders.NullFileProvider();
    }
    static ByteArrayContent Pdf(byte[]? bytes=null){var content=new ByteArrayContent(bytes??SyntheticPensionReport.Create("later"));content.Headers.ContentType=new("application/pdf");return content;}
    [Fact]
    public async Task OwnerCanExplicitlyApproveAndReloadFullScenarioPayload()
    {
        await using var host=new Host();await host.Init();using var owner=host.Client();
        var uploaded=await owner.PostAsync("/api/pension/uploads",Pdf());uploaded.EnsureSuccessStatusCode();
        var receipt=await uploaded.Content.ReadFromJsonAsync<JsonElement>();var id=receipt.GetProperty("id").GetGuid();
        var report=receipt.GetProperty("report").Deserialize<PensionReport>(Json)!;
        var input=new PensionApproval(receipt.GetProperty("version").GetString()!,report.ReportAsOf!.Value,report,
            report.Agreements.Select(a=>new PensionTarget(a.Key,null,null)).ToArray(),true,true);
        var saved=await owner.PostAsJsonAsync($"/api/pension/uploads/{id}/approve",input);saved.EnsureSuccessStatusCode();
        Assert.Equal(1,await host.WealthCount());
        var detail=await owner.GetFromJsonAsync<JsonElement>($"/api/pension/uploads/{id}");Assert.True(detail.GetProperty("financialSaved").GetBoolean());
        var snapshot=await owner.GetFromJsonAsync<JsonElement>("/api/pension/snapshots/"+detail.GetProperty("snapshotId").GetString());
        Assert.Equal(11,snapshot.GetProperty("accepted").GetProperty("report").GetProperty("scenarios").GetArrayLength());
        var snapshotId=detail.GetProperty("snapshotId").GetString();
        using var visitor=host.Client("Demo","Demo");using var anonymous=host.Client(null);using var forged=host.Client("Demo","Live");
        foreach(var client in new[]{visitor,anonymous,forged}) {
            var expected=client==anonymous?HttpStatusCode.Unauthorized:client==visitor?HttpStatusCode.NotFound:HttpStatusCode.Forbidden;
            foreach(var route in new[]{$"pension/uploads/{id}",$"pension/uploads/{id}/original",$"pension/snapshots/{snapshotId}"})
                Assert.Equal(expected,(await client.GetAsync("/api/"+route)).StatusCode);
            Assert.Equal(expected,(await client.PostAsJsonAsync($"/api/pension/uploads/{id}/approve",input)).StatusCode);
            Assert.Equal(expected,(await client.PostAsJsonAsync($"/api/pension/uploads/{id}/parse",new {version=receipt.GetProperty("version").GetString()})).StatusCode);
            Assert.Equal(expected,(await client.PostAsJsonAsync($"/api/pension/uploads/{id}/link",new{version=receipt.GetProperty("version").GetString(),snapshotId,confirm=true})).StatusCode);
        }
        Assert.Empty((await visitor.GetFromJsonAsync<JsonElement>("/api/pension/uploads")).GetProperty("items").EnumerateArray());
        Assert.DoesNotContain("protectedOriginal",detail.GetRawText());Assert.DoesNotContain("previewJson",detail.GetRawText());
        Assert.Equal(HttpStatusCode.Unauthorized,(await anonymous.GetAsync("/api/pension/uploads")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await forged.GetAsync("/api/pension/uploads")).StatusCode);
    }
    [Fact]
    public async Task ExistingReviewRetryKeepsOriginalAndReceiptAndRejectsStaleOrForeignRequests()
    {
        await using var host = new Host(); await host.Init(); using var owner = host.Client();
        var bytes = ColumnPensionPdf.Create();
        var uploaded = await owner.PostAsync("/api/pension/uploads", Pdf(bytes)); uploaded.EnsureSuccessStatusCode();
        var receipt = await uploaded.Content.ReadFromJsonAsync<JsonElement>(); var id = receipt.GetProperty("id").GetGuid();
        var version = receipt.GetProperty("version").GetString();
        var parsed = await owner.PostAsJsonAsync($"/api/pension/uploads/{id}/parse", new { version }); parsed.EnsureSuccessStatusCode();
        var retried = await parsed.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(id, retried.GetProperty("id").GetGuid()); Assert.NotEqual(version, retried.GetProperty("version").GetString());
        Assert.Equal("NeedsReview", retried.GetProperty("status").GetString()); Assert.False(retried.GetProperty("financialSaved").GetBoolean());
        Assert.False(retried.TryGetProperty("protectedOriginal", out _)); Assert.False(retried.TryGetProperty("previewJson", out _));
        Assert.Equal(HttpStatusCode.Conflict, (await owner.PostAsJsonAsync($"/api/pension/uploads/{id}/parse", new { version })).StatusCode);
        using var demo = host.Client("Demo", "Demo"); using var anonymous = host.Client(null); using var forged = host.Client("Demo", "Live");
        foreach (var client in new[] { demo, anonymous, forged })
        {
            var expected = client == anonymous ? HttpStatusCode.Unauthorized : client == demo ? HttpStatusCode.NotFound : HttpStatusCode.Forbidden;
            Assert.Equal(expected, (await client.PostAsJsonAsync($"/api/pension/uploads/{id}/parse", new { version = retried.GetProperty("version").GetString() })).StatusCode);
            Assert.Equal(expected, (await client.GetAsync($"/api/pension/uploads/{id}/original")).StatusCode);
        }
        Assert.Equal(bytes, await owner.GetByteArrayAsync($"/api/pension/uploads/{id}/original"));
        var history = await owner.GetFromJsonAsync<JsonElement>("/api/pension/uploads"); Assert.Equal(1, history.GetProperty("total").GetInt32());
        Assert.Equal(0, history.GetProperty("development").GetArrayLength()); Assert.Equal(0, await host.WealthCount()); Assert.Equal(1, await host.DocumentCount());
    }
    [Fact]
    public async Task SimultaneousIdenticalUploadsRetainTwoReceiptsAndOneContentRecord()
    {
        for (var pair = 0; pair < 5; pair++)
        {
            var reader = new OverlappingReader();
            await using var host=new Host();await host.Init(reader);using var owner=host.Client();var bytes=SyntheticPensionReport.Create("later");
            var results=await Task.WhenAll(owner.PostAsync("/api/pension/uploads",Pdf(bytes)),owner.PostAsync("/api/pension/uploads",Pdf(bytes)));
            Assert.All(results,r=>r.EnsureSuccessStatusCode()); Assert.Equal(2,reader.Arrivals);
            var a=await results[0].Content.ReadFromJsonAsync<JsonElement>();var b=await results[1].Content.ReadFromJsonAsync<JsonElement>();
            Assert.NotEqual(a.GetProperty("id").GetGuid(),b.GetProperty("id").GetGuid());Assert.Equal(a.GetProperty("hash").GetString(),b.GetProperty("hash").GetString());
            Assert.Equal("NeedsReview",a.GetProperty("status").GetString());Assert.Equal("NeedsReview",b.GetProperty("status").GetString());
            foreach (var receipt in new[] { a, b })
            {
                Assert.False(receipt.GetProperty("financialSaved").GetBoolean());
                Assert.Equal(bytes, await owner.GetByteArrayAsync($"/api/pension/uploads/{receipt.GetProperty("id").GetGuid()}/original"));
            }
            var history=await owner.GetFromJsonAsync<JsonElement>("/api/pension/uploads");Assert.Equal(2,history.GetProperty("total").GetInt32());Assert.Equal(0,await host.WealthCount());
            Assert.Equal(1,await host.DocumentCount());
        }
    }
    sealed class OverlappingReader : IPensionPdfReader
    {
        readonly TaskCompletionSource both = new(TaskCreationOptions.RunContinuationsAsynchronously);
        int arrivals;
        public int Arrivals => Volatile.Read(ref arrivals);
        public async Task<PensionReport> Read(byte[] bytes, CancellationToken ct)
        {
            if (Interlocked.Increment(ref arrivals) == 2) both.TrySetResult();
            // Both HTTP requests must reach parsing before either completes. A request-wide
            // lock/serialized submission would time out, rather than hiding the regression.
            await both.Task.WaitAsync(TimeSpan.FromSeconds(10), ct);
            return await new Reader().Read(bytes, ct);
        }
    }
    [Fact]
    public async Task SyntheticOwnerFixtureExercisesHistoryWithoutRealFileAcceptance()
    {
        await using var host=new Host();await host.Init();using var owner=host.Client();using var visitor=host.Client("Demo","Demo");
        Guid? product=null;string? productVersion=null;
        foreach(var variant in new[]{"earlier","later"}) {
            var response=await owner.PostAsync("/api/pension/uploads",Pdf(SyntheticPensionReport.Create(variant)));response.EnsureSuccessStatusCode();
            var receipt=await response.Content.ReadFromJsonAsync<JsonElement>();var report=receipt.GetProperty("report").Deserialize<PensionReport>(Json)!;
            if(Environment.GetEnvironmentVariable("BANKING_PENSION_BROWSER_FIXTURE_DIR") is {Length:>0} fixtures) {
                Directory.CreateDirectory(fixtures);
                await File.WriteAllTextAsync(Path.Combine(fixtures,"report-"+variant+".json"),JsonSerializer.Serialize(report,Json));
            }
            var original=await owner.GetAsync("/api/pension/uploads/"+receipt.GetProperty("id").GetString()+"/original");original.EnsureSuccessStatusCode();Assert.Equal("application/pdf",original.Content.Headers.ContentType!.MediaType);
            var input=new PensionApproval(receipt.GetProperty("version").GetString()!,report.ReportAsOf!.Value,report,[new(report.Agreements[0].Key,product,productVersion)],true,true);
            var approved=await owner.PostAsJsonAsync("/api/pension/uploads/"+receipt.GetProperty("id").GetString()+"/approve",input);approved.EnsureSuccessStatusCode();
            var records=await owner.GetFromJsonAsync<JsonElement>("/api/wealth");var row=Assert.Single(records.EnumerateArray());product=row.GetProperty("id").GetGuid();productVersion=row.GetProperty("version").GetString();
            Assert.Equal(11,report.Scenarios.Length);Assert.Equal(3,report.Insurance.Length);Assert.Equal(3,Assert.Single(report.Agreements).Components.Length);
            Assert.True(report.BeforeTax&&report.TodaysMoney);
        }
        var history=await owner.GetFromJsonAsync<JsonElement>("/api/pension/uploads");Assert.Equal(2,history.GetProperty("total").GetInt32());Assert.Equal(2,history.GetProperty("development").GetArrayLength());
        if(Environment.GetEnvironmentVariable("BANKING_PENSION_BROWSER_FIXTURE_DIR") is {Length:>0} fixtureFolder)
            await File.WriteAllTextAsync(Path.Combine(fixtureFolder,"report-correction.json"),JsonSerializer.Serialize(PensionReportParser.Parse(SyntheticPensionReport.Create("correction")),Json));
        var summary=await owner.GetFromJsonAsync<JsonElement>("/api/wealth/summary");Assert.Equal(431000,summary.GetProperty("pension").GetDecimal());
        Assert.Empty((await visitor.GetFromJsonAsync<JsonElement>("/api/pension/uploads")).GetProperty("items").EnumerateArray());Assert.Equal(1,await host.WealthCount());
    }
    [Fact]
    public async Task OwnerPreviewRetainsPrivateOriginalButDemoAndAnonymousCannotReadIt()
    {
        await using var host=new Host();await host.Init();using var owner=host.Client();
        var response=await owner.PostAsync("/api/pension/uploads",Pdf());response.EnsureSuccessStatusCode();
        var receipt=await response.Content.ReadFromJsonAsync<JsonElement>();var id=receipt.GetProperty("id").GetGuid();
        Assert.Equal(0,await host.WealthCount());
        var original=await owner.GetAsync($"/api/pension/uploads/{id}/original");original.EnsureSuccessStatusCode();
        Assert.Contains("no-store",original.Headers.CacheControl!.ToString());Assert.Equal("attachment",original.Content.Headers.ContentDisposition!.DispositionType);
        Assert.True((await original.Content.ReadAsByteArrayAsync()).AsSpan().StartsWith("%PDF"u8));
        using var visitor=host.Client("Demo","Demo");Assert.Equal(HttpStatusCode.NotFound,(await visitor.GetAsync($"/api/pension/uploads/{id}/original")).StatusCode);
        using var forged=host.Client("Demo","Live");Assert.Equal(HttpStatusCode.Forbidden,(await forged.GetAsync($"/api/pension/uploads/{id}")).StatusCode);
        using var anonymous=host.Client(null);Assert.Equal(HttpStatusCode.Unauthorized,(await anonymous.GetAsync($"/api/pension/uploads/{id}/original")).StatusCode);
        owner.DefaultRequestHeaders.Remove("Origin");owner.DefaultRequestHeaders.Add("Origin","https://evil.example");
        Assert.Equal(HttpStatusCode.Forbidden,(await owner.PostAsync("/api/pension/uploads",Pdf())).StatusCode);
    }
    [Fact]
    public async Task DemoCannotUploadPrivateReportsOrGenerateSamplesInLive()
    {
        await using var host=new Host();await host.Init();using var demo=host.Client("Demo","Demo");
        Assert.Equal(HttpStatusCode.Forbidden,(await demo.PostAsync("/api/pension/uploads",Pdf())).StatusCode);
        using var owner = host.Client();
        Assert.Equal(HttpStatusCode.Forbidden,(await owner.PostAsJsonAsync("/api/pension/uploads/demo",new{version="later"})).StatusCode);
        Assert.Empty((await demo.GetFromJsonAsync<JsonElement>("/api/pension/uploads")).GetProperty("items").EnumerateArray());
        Assert.Equal(0,await host.WealthCount());
    }
    [Fact]
    public async Task InvalidHeaderMimeSizeAndUnsupportedReportHaveVisibleSafeOutcomes()
    {
        await using var host=new Host();await host.Init();using var owner=host.Client();
        Assert.Equal(HttpStatusCode.BadRequest,(await owner.PostAsync("/api/pension/uploads",Pdf("not pdf"u8.ToArray()))).StatusCode);
        using var mime=Pdf();mime.Headers.ContentType=new("text/plain");Assert.Equal(HttpStatusCode.BadRequest,(await owner.PostAsync("/api/pension/uploads",mime)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,(await owner.PostAsync("/api/pension/uploads",Pdf(new byte[PensionReportParser.MaxBytes+1]))).StatusCode);
        // Valid PDF header but malformed body: receipt/original remain available for manual review.
        var response=await owner.PostAsync("/api/pension/uploads",Pdf("%PDF-broken"u8.ToArray()));
        response.EnsureSuccessStatusCode();var receipt=await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Unsupported",receipt.GetProperty("status").GetString());
        Assert.Equal("INVALID_PENSION_PDF",receipt.GetProperty("errorCode").GetString());
        Assert.Equal(HttpStatusCode.OK,(await owner.GetAsync("/api/pension/uploads/"+receipt.GetProperty("id").GetString()+"/original")).StatusCode);
        Assert.Equal(0,await host.WealthCount());
    }
}
