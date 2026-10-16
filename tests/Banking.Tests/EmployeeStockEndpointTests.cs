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

namespace Banking.Tests;

public sealed class EmployeeStockEndpointTests
{
    sealed class Env : Microsoft.Extensions.Hosting.IHostEnvironment
    {
        public string EnvironmentName{get;set;}="Testing";public string ApplicationName{get;set;}="Fixture";public string ContentRootPath{get;set;}="";
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider{get;set;}=new Microsoft.Extensions.FileProviders.NullFileProvider();
    }
    sealed class Host : IAsyncDisposable
    {
        public WebApplication App=null!;public BrowserSessions Sessions=null!;
        public async Task Init()
        {
            var b=WebApplication.CreateBuilder(new WebApplicationOptions{EnvironmentName="Production"});b.WebHost.UseTestServer();
            b.Configuration.AddInMemoryCollection(new Dictionary<string,string?>{["Cloud:Origin"]="https://banking.fixture",["EnableBanking:Enabled"]="true"});
            b.Services.AddSingleton<IDataProtectionProvider>(new EphemeralDataProtectionProvider());
            b.Services.AddSingleton(s=>new BrowserSessions(TimeProvider.System,new Env(),b.Configuration,s.GetRequiredService<IDataProtectionProvider>()));
            b.Services.AddSingleton<LocalToken>();b.Services.AddSingleton<WorkspaceCatalog>();b.Services.AddScoped<Workspace>();
            // Deliberately no BankingDb, repository, provider or advisor. Preview must work without them.
            App=b.Build();App.Use(async(ctx,next)=>{try{await next();}catch(ApiFailure f){ctx.Response.StatusCode=f.Status;await ctx.Response.WriteAsJsonAsync(new{error=f.Code});}});
            App.UseMiddleware<LocalAccessMiddleware>();App.UseMiddleware<WorkspaceMiddleware>();App.MapEmployeeStockApi();
            await App.StartAsync();Sessions=App.Services.GetRequiredService<BrowserSessions>();
        }
        public HttpClient Client(string? role="Owner",string mode="Live",bool origin=true)
        {
            var c=App.GetTestClient();c.BaseAddress=new("https://banking.fixture");c.DefaultRequestHeaders.Add("X-Banking-Mode",mode);c.DefaultRequestHeaders.Add("X-Banking-Client","web");
            if(origin)c.DefaultRequestHeaders.Add("Origin","https://banking.fixture");if(role is not null)c.DefaultRequestHeaders.Add("Cookie",BrowserSessions.Cookie+"="+Sessions.Create(role));return c;
        }
        public ValueTask DisposeAsync()=>App.DisposeAsync();
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
        Assert.Equal("{\"error\":\"STOCK_MIXED_AWARDEES\"}",await r.Content.ReadAsStringAsync());
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
