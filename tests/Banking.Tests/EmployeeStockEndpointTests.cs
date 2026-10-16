using System.Net;
using System.Text.Json;
using Banking.Api;
using Banking.Api.Security;
using Banking.Api.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.EntityFrameworkCore;

namespace Banking.Tests;

public sealed partial class EmployeeStockEndpointTests
{
    sealed class Env : Microsoft.Extensions.Hosting.IHostEnvironment
    {
        public string EnvironmentName{get;set;}="Testing";public string ApplicationName{get;set;}="Fixture";public string ContentRootPath{get;set;}="";
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider{get;set;}=new Microsoft.Extensions.FileProviders.NullFileProvider();
    }
    sealed class Host : IAsyncDisposable
    {
        public WebApplication App=null!;public BrowserSessions Sessions=null!;
        Microsoft.Data.Sqlite.SqliteConnection? keeper;
        public async Task Init(bool retained=false)
        {
            var b=WebApplication.CreateBuilder(new WebApplicationOptions{EnvironmentName="Production"});b.WebHost.UseTestServer();
            b.Configuration.AddInMemoryCollection(new Dictionary<string,string?>{["Cloud:Origin"]="https://banking.fixture",["EnableBanking:Enabled"]="true"});
            b.Services.AddSingleton<IDataProtectionProvider>(new EphemeralDataProtectionProvider());
            b.Services.AddSingleton(s=>new BrowserSessions(TimeProvider.System,new Env(),b.Configuration,s.GetRequiredService<IDataProtectionProvider>()));
            b.Services.AddSingleton<LocalToken>();b.Services.AddSingleton<WorkspaceCatalog>();b.Services.AddScoped<Workspace>();
            if(retained){
                keeper=new Microsoft.Data.Sqlite.SqliteConnection("Data Source=stock-http-"+Guid.NewGuid()+";Mode=Memory;Cache=Shared;Pooling=False");await keeper.OpenAsync();
                b.Services.AddScoped(s=>new Banking.Api.Data.BankingDb(PensionHistoryTests.Options(keeper.ConnectionString),s.GetRequiredService<Workspace>()));
                b.Services.AddScoped<EmployeeStockImportService>();b.Services.AddSingleton<TimeProvider>(new PensionHistoryTests.Clock());
                await using var db=new Banking.Api.Data.BankingDb(PensionHistoryTests.Options(keeper));await db.Database.EnsureCreatedAsync();
            }
            // Default preview fixture has deliberately no BankingDb, repository, provider or advisor. Preview must work without them.
            App=b.Build();App.Use(async(ctx,next)=>{try{await next();}catch(ApiFailure f){ctx.Response.StatusCode=f.Status;await ctx.Response.WriteAsJsonAsync(new{error=f.Code,details=f.Details});}catch(DbUpdateConcurrencyException){ctx.Response.StatusCode=409;await ctx.Response.WriteAsJsonAsync(new{error="VERSION_CONFLICT"});}});
            App.UseMiddleware<LocalAccessMiddleware>();App.UseMiddleware<WorkspaceMiddleware>();App.MapEmployeeStockApi();
            await App.StartAsync();Sessions=App.Services.GetRequiredService<BrowserSessions>();
        }
        public HttpClient Client(string? role="Owner",string mode="Live",bool origin=true)
        {
            var c=App.GetTestClient();c.BaseAddress=new("https://banking.fixture");c.DefaultRequestHeaders.Add("X-Banking-Mode",mode);c.DefaultRequestHeaders.Add("X-Banking-Client","web");
            if(origin)c.DefaultRequestHeaders.Add("Origin","https://banking.fixture");if(role is not null)c.DefaultRequestHeaders.Add("Cookie",BrowserSessions.Cookie+"="+Sessions.Create(role));return c;
        }
        public async ValueTask DisposeAsync(){await App.DisposeAsync();if(keeper is not null)await keeper.DisposeAsync();}
    }
    static ByteArrayContent Workbook(byte[]? bytes=null,string? type=null)
    {var c=new ByteArrayContent(bytes??SyntheticStockWorkbook.Create());c.Headers.ContentType=new(type??EmployeeStockEndpoints.MediaType);return c;}
    [Fact]
    public async Task OwnerPreviewIsPrivateMinimizedAndRequiresNoDatabaseOrFinancialWrites()
    {
        await using var h=new Host();await h.Init();using var c=h.Client();
        var response=await c.PostAsync("/api/employee-stocks/preview",Workbook());Assert.Equal(HttpStatusCode.OK,response.StatusCode);
        Assert.Contains("no-store",response.Headers.CacheControl!.ToString());Assert.Contains("private",response.Headers.CacheControl.ToString());
        var json=await response.Content.ReadAsStringAsync();using var doc=JsonDocument.Parse(json);
        Assert.Equal(2,doc.RootElement.GetProperty("grants").GetArrayLength());Assert.Equal(JsonValueKind.Null,doc.RootElement.GetProperty("currentHeldShares").ValueKind);
        foreach(var name in new[]{"FictionalFamily","FictionalGiven","00004123","00007321","Fictional Custodian","awardId","awardeeId","original","fileHash"})Assert.DoesNotContain(name,json);
        Assert.Equal(HttpStatusCode.MethodNotAllowed,(await c.GetAsync("/api/employee-stocks/preview")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await c.PostAsync("/api/employee-stocks/approve",Workbook())).StatusCode);
    }
    [Theory]
    [InlineData(null,"Live",true,401)][InlineData("Demo","Demo",true,403)][InlineData("Demo","Live",true,403)]
    [InlineData("Owner","Demo",true,403)][InlineData("Owner","Live",false,403)]
    public async Task AnonymousDemoForgedLiveAndCrossOriginCannotPreview(string? role,string mode,bool origin,int expected)
    {await using var h=new Host();await h.Init();using var c=h.Client(role,mode,origin);Assert.Equal(expected,(int)(await c.PostAsync("/api/employee-stocks/preview",Workbook())).StatusCode);}
    [Theory]
    [InlineData("application/json")][InlineData("application/zip")][InlineData("application/octet-stream")]
    public async Task MimeBoundaryIsExplicit(string mime)
    {await using var h=new Host();await h.Init();using var c=h.Client();var r=await c.PostAsync("/api/employee-stocks/preview",Workbook(type:mime));Assert.Equal(HttpStatusCode.BadRequest,r.StatusCode);Assert.Contains("STOCK_FILE_TYPE",await r.Content.ReadAsStringAsync());}
    [Fact]
    public async Task FailedInputNeverReturnsPrivateSourceOrStackAndValidRetryWorks()
    {
        await using var h=new Host();await h.Init();using var c=h.Client();
        var r=await c.PostAsync("/api/employee-stocks/preview",Workbook(SyntheticStockWorkbook.Create(rows=>rows[2][0][0]="SECRET_PERSON")));
        var error=await r.Content.ReadAsStringAsync();using var parsed=JsonDocument.Parse(error);Assert.Equal("STOCK_MIXED_AWARDEES",parsed.RootElement.GetProperty("error").GetString());Assert.DoesNotContain("SECRET",error);Assert.Equal(JsonValueKind.Null,parsed.RootElement.GetProperty("details").ValueKind);
        Assert.Equal(HttpStatusCode.OK,(await c.PostAsync("/api/employee-stocks/preview",Workbook())).StatusCode);
    }
    [Fact]
    public async Task ByteSignatureAndDeclaredSizeAreCheckedAtPrivateBoundary()
    {
        await using var h=new Host();await h.Init();using var c=h.Client();
        var wrong=await c.PostAsync("/api/employee-stocks/preview",Workbook([1,2,3,4]));Assert.Equal(HttpStatusCode.BadRequest,wrong.StatusCode);
        Assert.Contains("STOCK_FILE_TYPE",await wrong.Content.ReadAsStringAsync());
        var large=Workbook([80,75,3,4]);large.Headers.ContentLength=Banking.Api.Providers.EmployeeStockWorkbook.MaxBytes+1L;
        var rejected=await c.PostAsync("/api/employee-stocks/preview",large);Assert.Equal(HttpStatusCode.BadRequest,rejected.StatusCode);
        Assert.Contains("STOCK_FILE_TOO_LARGE",await rejected.Content.ReadAsStringAsync());
    }
}
