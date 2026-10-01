using Banking.Api.Data;
using Banking.Api.Security;
using Banking.Api.Services;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.FileProviders;
using Microsoft.AspNetCore.Http;

namespace Banking.Tests;

public sealed class CloudTests
{
    [Fact]
    public async Task Shared_demo_data_keeps_independent_browser_order_scopes()
    {
        var env=new EnvironmentStub();var config=new ConfigurationBuilder().Build();
        var middleware=new WorkspaceMiddleware(_=>Task.CompletedTask);
        async Task<Workspace> Bind(string cookie)
        {
            var context=new DefaultHttpContext();context.Request.Headers.Cookie=BrowserSessions.Cookie+"="+cookie;
            var workspace=new Workspace();await middleware.InvokeAsync(context,workspace,new WorkspaceCatalog(config,env),env);return workspace;
        }
        var a=await Bind("synthetic-session-a");var b=await Bind("synthetic-session-b");var again=await Bind("synthetic-session-a");
        Assert.Equal("",a.DemoScope);Assert.Equal(a.DemoScope,b.DemoScope);
        Assert.NotEmpty(a.SessionScope);Assert.NotEqual(a.SessionScope,b.SessionScope);Assert.Equal(a.SessionScope,again.SessionScope);
        Assert.DoesNotContain("synthetic-session",a.SessionScope);
    }
    private sealed class EnvironmentStub : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Production";
        public string ApplicationName { get; set; } = "Banking";
        public string ContentRootPath { get; set; } = "";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
    [Fact]
    public void CloudSqlRejectsPasswordLocalAndSharedDatabase()
    {
        var valid = "Server=test.database.windows.net;Database=Banking_Live_Dan;Authentication=Active Directory Managed Identity;Encrypt=True;TrustServerCertificate=False";
        Assert.NotEmpty(CloudHosting.ValidateConnection(valid,"Live"));
        Assert.Throws<InvalidOperationException>(()=>CloudHosting.ValidateConnection(valid,"Demo"));
        Assert.Throws<InvalidOperationException>(()=>CloudHosting.ValidateConnection(valid.Replace("TrustServerCertificate=False","TrustServerCertificate=True"),"Live"));
        Assert.Throws<InvalidOperationException>(()=>CloudHosting.ValidateConnection(valid.Replace("Active Directory Managed Identity","Sql Password")+";User ID=sa;Password=synthetic", "Live"));
    }
    [Fact]
    public void HostedSessionsSurviveRestartAndRevocation()
    {
        var directory=Path.Combine(Path.GetTempPath(),"Banking_Test_"+Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        try
        {
            var config=new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> { ["Cloud:StateDirectory"]=directory }).Build();
            var protection=new EphemeralDataProtectionProvider();
            var first=new BrowserSessions(TimeProvider.System,new EnvironmentStub(),config,protection);
            var owner=first.Create("Owner"); var demo=first.Create("Demo");
            var second=new BrowserSessions(TimeProvider.System,new EnvironmentStub(),config,protection);
            Assert.Equal("Owner",second.Role(owner)); Assert.Equal("Demo",second.Role(demo));
            second.Revoke(owner);
            var third=new BrowserSessions(TimeProvider.System,new EnvironmentStub(),config,protection);
            Assert.Null(third.Role(owner)); Assert.Equal("Demo",third.Role(demo));
            Assert.DoesNotContain(owner,File.ReadAllText(Path.Combine(directory,"sessions.protected")));
        }
        finally { foreach(var file in Directory.GetFiles(directory)) File.Delete(file); Directory.Delete(directory); }
    }
    [Fact]
    public async Task ProductionAccessRejectsCapabilityAndForgedIdentityAndCrossWorkspace()
    {
        var directory=Path.Combine(Path.GetTempPath(),"Banking_Test_"+Guid.NewGuid().ToString("N")); Directory.CreateDirectory(directory);
        try
        {
            var env=new EnvironmentStub();
            var config=new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> {
                ["Cloud:Origin"]="https://banking-test.azurewebsites.net", ["Cloud:StateDirectory"]=directory, ["Local:Token"]="synthetic-local-token" }).Build();
            var sessions=new BrowserSessions(TimeProvider.System,env,config,new EphemeralDataProtectionProvider());
            var demo=sessions.Create("Demo"); var owner=sessions.Create("Owner"); var token=new LocalToken(config,env);
            async Task<int> Request(string path,string? cookie=null,string mode="Live",string? host=null,string? origin=null)
            {
                var ctx=new DefaultHttpContext(); ctx.Request.Host=new HostString(host??"banking-test.azurewebsites.net");
                ctx.Request.Scheme="https"; ctx.Request.Method="GET";ctx.Request.Path=path;
                ctx.Request.Headers["X-Banking-Client"]="web";ctx.Request.Headers["X-Banking-Mode"]=mode;
                ctx.Request.Headers.Authorization="Bearer synthetic-local-token";
                ctx.Request.Headers["X-MS-CLIENT-PRINCIPAL-NAME"]="Dan@novaro.dk";
                if(cookie is not null)ctx.Request.Headers.Cookie=BrowserSessions.Cookie+"="+cookie;
                if(origin is not null)ctx.Request.Headers.Origin=origin;
                var middleware=new LocalAccessMiddleware(c=>{c.Response.StatusCode=204;return Task.CompletedTask;});
                await middleware.InvokeAsync(ctx,token,sessions,env,config);return ctx.Response.StatusCode;
            }
            Assert.Equal(401,await Request("/api/accounts"));
            Assert.Equal(403,await Request("/api/accounts",demo));
            Assert.Equal(204,await Request("/api/accounts",demo,"Demo"));
            Assert.Equal(204,await Request("/api/accounts",owner));
            Assert.Equal(204,await Request("/api/runtime-info"));
            Assert.Equal(204,await Request("/api/investments/saxo/status",demo,"Demo"));
            Assert.Equal(204,await Request("/api/investments/saxo/connect",demo,"Demo"));
            Assert.Equal(204,await Request("/api/investments/saxo/preview",demo,"Demo"));
            Assert.Equal(404,await Request("/api/browser/ticket",owner));
            Assert.Equal(404,await Request("/api/browser/password",owner));
            Assert.Equal(403,await Request("/api/accounts",owner,origin:"https://untrusted.example"));
            Assert.Equal(403,await Request("/api/accounts",owner,host:"untrusted.example"));
        }
        finally {foreach(var file in Directory.GetFiles(directory))File.Delete(file);Directory.Delete(directory);}
    }
    [Fact]
    public async Task ProductionDemo_uses_the_canonical_shared_scope_ignoring_session_hints()
    {
        var env=new EnvironmentStub();
        var config=new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> {
            ["Cloud:Origin"]="https://banking-test.azurewebsites.net" }).Build();
        var catalog=new WorkspaceCatalog(config,env);
        var workspace=new Workspace { DemoScope=new string('A',64) };
        var context=new DefaultHttpContext(); context.Request.Headers["X-Banking-Mode"]="Demo";
        context.Request.Headers["X-Banking-Scope"]=new string('B',64);
        context.Items["DemoScope"]=new string('C',64);
        context.Items["OwnerAccess"]=false;
        await new WorkspaceMiddleware(_=>Task.CompletedTask).InvokeAsync(context,workspace,catalog,env);
        Assert.Equal("",workspace.DemoScope);
        Assert.False(workspace.OwnerAuthenticated);
        Assert.Equal("Demo",workspace.Mode);

        var ownerWorkspace=new Workspace { DemoScope=new string('D',64) };
        var ownerContext=new DefaultHttpContext(); ownerContext.Request.Headers["X-Banking-Mode"]="Demo";
        ownerContext.Items["OwnerAccess"]=true;
        await new WorkspaceMiddleware(_=>Task.CompletedTask).InvokeAsync(ownerContext,ownerWorkspace,catalog,env);
        Assert.Equal("",ownerWorkspace.DemoScope);
        Assert.True(ownerWorkspace.OwnerAuthenticated);
    }

    [Fact]
    public async Task Production_shared_scope_guard_rejects_a_legacy_session_scope()
    {
        var env = new EnvironmentStub();
        var workspace = new Workspace();
        var context = new DefaultHttpContext();
        var nextCalled = false;
        var guard = new SharedDemoScopeMiddleware(_ => { nextCalled = true; return Task.CompletedTask; });
        await guard.InvokeAsync(context, workspace, env);
        Assert.True(nextCalled);
        nextCalled = false;
        workspace.DemoScope = new string('A', 64);
        await Assert.ThrowsAsync<InvalidOperationException>(() => guard.InvokeAsync(context, workspace, env));
        Assert.False(nextCalled);
    }

    [Fact]
    public void Saxo_demo_sim_is_allowed_but_live_requires_the_private_owner_workspace()
    {
        var env = new EnvironmentStub();
        var demo = new Workspace();
        SaxoAccess.RequireMarketAccess(demo, env, "SIM");
        var demoLive = Assert.Throws<ApiFailure>(() => SaxoAccess.RequireMarketAccess(demo, env, "LIVE"));
        Assert.Equal("SAXO_LIVE_OWNER_REQUIRED", demoLive.Code);

        var live = new Workspace(); live.Select("Live");
        var anonymousLive = Assert.Throws<ApiFailure>(() => SaxoAccess.RequireMarketAccess(live, env, "LIVE"));
        Assert.Equal("SAXO_PRIVATE_ACCESS_REQUIRED", anonymousLive.Code);
        live.OwnerAuthenticated = true;
        SaxoAccess.RequireMarketAccess(live, env, "LIVE");
    }

    [Fact]
    public void Hosted_demo_callback_uses_the_fixed_cloud_origin()
    {
        var env = new EnvironmentStub();
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Cloud:Origin"] = "https://banking-test.azurewebsites.net",
            ["Local:DemoCallbackUrl"] = "http://127.0.0.1:5080/api/auth/callback",
            ["Cloud:LiveCallbackUrl"] = "https://banking-test.azurewebsites.net/api/auth/callback/live"
        }).Build();
        Assert.Equal("https://banking-test.azurewebsites.net/api/auth/callback", ConnectionService.CallbackUri("Demo", config, env).AbsoluteUri);
        Assert.Equal("https://banking-test.azurewebsites.net/api/auth/callback/live", ConnectionService.CallbackUri("Live", config, env).AbsoluteUri);

        var local = new EnvironmentStub { EnvironmentName = "Development" };
        Assert.Equal("http://127.0.0.1:5080/api/auth/callback", ConnectionService.CallbackUri("Demo", config, local).AbsoluteUri);
    }
}
