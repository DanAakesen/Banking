using Banking.Api;
using Banking.Api.Security;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using System.Net;
using System.Net.Http.Headers;

namespace Banking.Tests;

public class LocalAdvisorTests
{
    [Theory]
    [InlineData(false, "https://banking.example", "Demo", 401)]
    [InlineData(true, "https://evil.example", "Demo", 403)]
    [InlineData(true, "https://banking.example", "Live", 403)]
    public async Task Cloud_advisor_retains_session_origin_and_workspace_boundaries(bool signedIn,string origin,string mode,int expected)
    {
        var env=new Env("Production");
        var config=new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> {
            ["Advisor:Enabled"]="true",["Cloud:Origin"]="https://banking.example"
        }).Build();
        var sessions=new BrowserSessions(TimeProvider.System,new Env("Development"),config,new EphemeralDataProtectionProvider());
        var context=new DefaultHttpContext();context.Request.Path="/advisor/api/memory";context.Request.Method="POST";
        context.Request.Scheme="http";context.Request.Host=new HostString("banking.example");
        context.Request.Headers["X-Forwarded-Proto"]="https";context.Request.Headers.Origin=origin;context.Request.Headers["X-Banking-Mode"]=mode;
        if(signedIn)context.Request.Headers.Cookie=BrowserSessions.Cookie+"="+sessions.Create("Demo");
        await new LocalAdvisorProxy(_=>Task.CompletedTask,new RejectingClientFactory()).InvokeAsync(context,env,config,sessions);
        Assert.Equal(expected,context.Response.StatusCode);
    }
    private sealed class Env(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "Banking";
        public string ContentRootPath { get; set; } = "";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
    [Theory]
    [InlineData("Production", true, true, "https://localhost:5443", 404)]
    [InlineData("Development", false, true, "https://localhost:5443", 404)]
    [InlineData("Development", true, false, "https://localhost:5443", 401)]
    [InlineData("Development", true, true, "https://untrusted.example", 403)]
    public async Task Local_advisor_requires_explicit_local_mode_session_and_origin(string environment, bool enabled, bool signedIn, string origin, int expected)
    {
        var env = new Env(environment);
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> { ["Local:AdvisorEnabled"] = enabled.ToString() }).Build();
        var sessions = new BrowserSessions(TimeProvider.System, new Env("Development"), config, new EphemeralDataProtectionProvider());
        var context = new DefaultHttpContext();
        context.Request.Path = "/advisor/api/advisor";
        context.Request.Method = "POST";
        context.Request.Scheme = "https";
        context.Request.Host = new HostString("localhost",5443);
        context.Request.Headers.Origin = origin;
        if(signedIn)context.Request.Headers.Cookie = BrowserSessions.Cookie + "=" + sessions.Create("Demo");
        var forwarded = false;
        await new LocalAdvisorProxy(_ => { forwarded = true; return Task.CompletedTask; },new RejectingClientFactory()).InvokeAsync(context,env,config,sessions);
        Assert.Equal(expected,context.Response.StatusCode);
        Assert.False(forwarded);
    }

    [Fact]
    public async Task Demo_session_cannot_forward_a_live_goal_request()
    {
        var env = new Env("Development");
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> { ["Local:AdvisorEnabled"] = "true" }).Build();
        var sessions = new BrowserSessions(TimeProvider.System, env, config, new EphemeralDataProtectionProvider());
        var context = new DefaultHttpContext();
        context.Request.Path = "/advisor/api/advisor";
        context.Request.Method = "POST"; context.Request.Scheme = "https";
        context.Request.Host = new HostString("localhost",5443);
        context.Request.Headers.Origin = "https://localhost:5443";
        context.Request.Headers["X-Banking-Mode"] = "Live";
        context.Request.Headers.Cookie = BrowserSessions.Cookie + "=" + sessions.Create("Demo");
        await new LocalAdvisorProxy(_ => Task.CompletedTask,new RejectingClientFactory()).InvokeAsync(context,env,config,sessions);
        Assert.Equal(403,context.Response.StatusCode);
    }

    [Fact]
    public async Task Cloud_renderer_identity_is_derived_from_the_authenticated_cookie_and_query_mode()
    {
        var env = new Env("Production");
        var config = CloudConfig();
        var sessions = Sessions(config);
        var session = sessions.Create("Demo");
        HttpRequestMessage? forwarded = null;
        using var handler = new CaptureHandler(request => forwarded = request);
        var context = CloudRenderRequest(session,"Demo");
        context.Request.Headers["X-Banking-Session"] = "forged-session";
        context.Request.Headers["X-Banking-Scope"] = "owner-live";
        context.Request.Headers["X-Banking-Mode"] = "Demo";

        await new LocalAdvisorProxy(_ => Task.CompletedTask,new StubClientFactory(handler)).InvokeAsync(context,env,config,sessions);

        Assert.Equal(200,context.Response.StatusCode);
        Assert.NotNull(forwarded);
        Assert.Equal("http://127.0.0.1:5451/artifact/" + new string('a',64) + "?mode=Demo",forwarded!.RequestUri!.AbsoluteUri);
        Assert.Equal(session,Header(forwarded,"X-Banking-Session"));
        Assert.Equal("Demo",Header(forwarded,"X-Banking-Mode"));
        Assert.Equal(Vault.Hash(session).ToLowerInvariant(),Header(forwarded,"X-Banking-Scope"));
    }

    [Fact]
    public async Task Cloud_renderer_allows_owner_live_artifact_with_owner_scope()
    {
        var env = new Env("Production");
        var config = CloudConfig();
        var sessions = Sessions(config);
        var session = sessions.Create("Owner");
        HttpRequestMessage? forwarded = null;
        using var handler = new CaptureHandler(request => forwarded = request);
        var context = CloudRenderRequest(session,"Live");

        await new LocalAdvisorProxy(_ => Task.CompletedTask,new StubClientFactory(handler)).InvokeAsync(context,env,config,sessions);

        Assert.Equal(200,context.Response.StatusCode);
        Assert.NotNull(forwarded);
        Assert.Equal(session,Header(forwarded!,"X-Banking-Session"));
        Assert.Equal("Live",Header(forwarded,"X-Banking-Mode"));
        Assert.Equal("owner-live",Header(forwarded,"X-Banking-Scope"));
    }

    [Theory]
    [InlineData(null, "Demo", 401)]
    [InlineData("Demo", "Live", 403)]
    [InlineData("Demo", "Unknown", 403)]
    public async Task Cloud_renderer_rejects_missing_or_mismatched_workspace_identity(string? role,string mode,int expected)
    {
        var env = new Env("Production");
        var config = CloudConfig();
        var sessions = Sessions(config);
        var session = role is null ? null : sessions.Create(role);
        var context = CloudRenderRequest(session,mode);

        await new LocalAdvisorProxy(_ => Task.CompletedTask,new RejectingClientFactory()).InvokeAsync(context,env,config,sessions);

        Assert.Equal(expected,context.Response.StatusCode);
    }

    [Fact]
    public async Task Cloud_renderer_rejects_conflicting_client_mode_header()
    {
        var env = new Env("Production");
        var config = CloudConfig();
        var sessions = Sessions(config);
        var context = CloudRenderRequest(sessions.Create("Owner"),"Live");
        context.Request.Headers["X-Banking-Mode"] = "Demo";

        await new LocalAdvisorProxy(_ => Task.CompletedTask,new RejectingClientFactory()).InvokeAsync(context,env,config,sessions);

        Assert.Equal(403,context.Response.StatusCode);
    }

    private static IConfiguration CloudConfig() => new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> {
        ["Advisor:Enabled"]="true",["Cloud:Origin"]="https://banking.example"
    }).Build();
    private static BrowserSessions Sessions(IConfiguration config) => new(TimeProvider.System,new Env("Development"),config,new EphemeralDataProtectionProvider());
    private static DefaultHttpContext CloudRenderRequest(string? session,string mode)
    {
        var context = new DefaultHttpContext();
        context.Request.Path = "/advisor-render/artifact/" + new string('a',64);
        context.Request.QueryString = new QueryString("?mode=" + mode);
        context.Request.Method = "GET";
        context.Request.Scheme = "http";
        context.Request.Host = new HostString("banking.example");
        context.Request.Headers["X-Forwarded-Proto"] = "https";
        if (session is not null) context.Request.Headers.Cookie = BrowserSessions.Cookie + "=" + session;
        return context;
    }
    private static string? Header(HttpRequestMessage request,string name) => request.Headers.TryGetValues(name,out var values) ? values.Single() : null;

    private sealed class RejectingClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => throw new InvalidOperationException("The rejected request must not reach the advisor renderer.");
    }
    private sealed class StubClientFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler,disposeHandler:false);
    }
    private sealed class CaptureHandler(Action<HttpRequestMessage> capture) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken cancellationToken)
        {
            capture(request);
            var response = new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("<html>private artifact</html>") };
            response.Headers.TryAddWithoutValidation("Content-Security-Policy","frame-ancestors 'self'");
            response.Headers.CacheControl = new CacheControlHeaderValue { NoStore = true };
            return Task.FromResult(response);
        }
    }
}
