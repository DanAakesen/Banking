using System.Net;
using System.Text.Json;
using Banking.Api.Providers;
using Banking.Api.Services;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;

namespace Banking.Tests;

public sealed class SaxoSessionTests
{
    const string Origin = "https://banking-test.azurewebsites.net";
    sealed class Host(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "Banking.Tests";
        public string ContentRootPath { get; set; } = "";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
    sealed class Clock : TimeProvider
    {
        public DateTimeOffset Now = DateTimeOffset.UtcNow;
        public override DateTimeOffset GetUtcNow() => Now;
    }
    sealed class Exchange : HttpMessageHandler, IHttpClientFactory
    {
        public int Calls;
        public string? LastHost;
        public int ExpiresIn=120,RefreshExpiresIn=3600;
        // Test hook: may answer a token request itself (for example a rejected, already-rotated refresh token).
        public Func<string,HttpResponseMessage?>? Override;
        public HttpClient CreateClient(string name) => new(this, false);
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Calls++; LastHost=request.RequestUri!.Host;
            if(Override?.Invoke(await request.Content!.ReadAsStringAsync(ct)) is {} custom)return custom;
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(
                JsonSerializer.Serialize(new { access_token="synthetic-access-"+Calls,refresh_token="synthetic-refresh-"+Calls,expires_in=ExpiresIn,refresh_token_expires_in=RefreshExpiresIn })) };
        }
    }
    sealed class Fixture : IDisposable
    {
        public readonly string DirectoryPath=Path.Combine(Path.GetTempPath(),"Banking-Saxo-Test-"+Guid.NewGuid().ToString("N"));
        public readonly Clock Clock=new();
        public readonly Exchange Exchange=new();
        public readonly IDataProtectionProvider Protection=new EphemeralDataProtectionProvider();
        public IConfiguration Config { get; }
        public Fixture()
        {
            Config=new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> {
                ["Cloud:Origin"]=Origin,["Cloud:StateDirectory"]=DirectoryPath,
                ["Saxo:SIM:AppKey"]="synthetic-app",["Saxo:SIM:AppSecret"]="synthetic-secret",
                ["Saxo:SIM:RedirectUri"]=Origin+"/api/saxo/auth/callback"
            }).Build();
        }
        public SaxoLocalSession Session(string environment="Production") => new(new Host(environment),Exchange,Clock,Config,Protection);
        public void Dispose()
        {
            Exchange.Dispose();
            // Only this fixture's uniquely generated temporary directory is removed.
            if(Directory.Exists(DirectoryPath))Directory.Delete(DirectoryPath,true);
        }
    }
    static string State(object start)
    {
        var uri=new Uri(JsonSerializer.SerializeToElement(start).GetProperty("authorizationUrl").GetString()!);
        return uri.Query.TrimStart('?').Split('&').Single(x=>x.StartsWith("state="))[6..];
    }

    [Fact]
    public async Task Cloud_exchange_persists_encrypted_session_and_refreshes_after_restart()
    {
        using var f=new Fixture(); var session=f.Session();
        var state=State(session.Start());
        await session.Complete(state,"synthetic-code",default);
        Assert.Equal("sim.logonvalidation.net",f.Exchange.LastHost);
        Assert.Equal(Origin+"/#/markets",session.ReturnUrl);
        var stored=File.ReadAllBytes(Path.Combine(f.DirectoryPath,"saxo-sim.protected"));
        Assert.DoesNotContain("synthetic-access",System.Text.Encoding.UTF8.GetString(stored));
        Assert.Equal("synthetic-access-1",await f.Session().Token(default));
        f.Clock.Now=f.Clock.Now.AddMinutes(2);
        Assert.Equal("synthetic-access-2",await f.Session().Token(default));
        Assert.Equal(2,f.Exchange.Calls);
        Assert.Null(f.Session().Read("LIVE"));
        await Assert.ThrowsAsync<ApiFailure>(()=>session.Complete(state,"replay",default));
        Assert.Equal(2,f.Exchange.Calls);
    }

    [Fact]
    public async Task Changed_registration_cannot_reuse_another_apps_tokens()
    {
        using var f=new Fixture();var session=f.Session();
        await session.Complete(State(session.Start()),"synthetic-code",default);
        f.Config["Saxo:SIM:AppKey"]="different-app";
        Assert.Null(await f.Session().Token(default));
        Assert.Equal(1,f.Exchange.Calls);
    }

    [Fact]
    public void Callback_must_match_host_configuration_and_local_return_stays_local()
    {
        using var f=new Fixture();
        f.Config["Saxo:SIM:RedirectUri"]="https://untrusted.example/callback";
        Assert.Equal("SAXO_CALLBACK_REGISTRATION_REQUIRED",Assert.Throws<ApiFailure>(()=>f.Session().Start()).Code);
        Assert.Equal(0,f.Exchange.Calls);
        Assert.Equal("https://localhost:5443/api/saxo/auth/callback",f.Session("Development").RequiredCallback);
        Assert.Equal("https://localhost:5443/#/markets",f.Session("Development").ReturnUrl);
    }

    [Fact]
    public async Task Expired_oauth_state_never_reaches_the_token_service()
    {
        using var f=new Fixture();var session=f.Session();var state=State(session.Start());
        f.Clock.Now=f.Clock.Now.AddMinutes(11);
        Assert.Equal("SAXO_STATE_EXPIRED",(await Assert.ThrowsAsync<ApiFailure>(()=>session.Complete(state,"synthetic",default))).Code);
        Assert.Equal(0,f.Exchange.Calls);
    }

    [Fact]
    public async Task Without_activity_a_sign_in_lapses_after_the_refresh_token_lifetime()
    {
        using var f=new Fixture();f.Exchange.ExpiresIn=1200;var session=f.Session();
        await session.Complete(State(session.Start()),"synthetic-code",default);
        f.Clock.Now=f.Clock.Now.AddMinutes(61);
        Assert.Null(await f.Session().Token(default));
        Assert.Equal("expired",await f.Session().KeepAlive("SIM",TimeSpan.FromMinutes(7),default));
        Assert.Equal(1,f.Exchange.Calls);
    }

    [Fact]
    public async Task Keeper_refreshes_before_expiry_so_an_idle_sign_in_survives_a_day()
    {
        using var f=new Fixture();f.Exchange.ExpiresIn=1200;var session=f.Session();
        await session.Complete(State(session.Start()),"synthetic-code",default);
        var keeper=new SaxoSessionKeeper(f.Session(),f.Config,Microsoft.Extensions.Logging.Abstractions.NullLogger<SaxoSessionKeeper>.Instance);
        var window=SaxoSessionKeeper.Interval(f.Config)+TimeSpan.FromMinutes(2);
        // Fresh tokens are left alone: no token call while the access token outlives the next check.
        await keeper.Tick(window,default);Assert.Equal(1,f.Exchange.Calls);
        for(var minute=5;minute<=24*60;minute+=5){f.Clock.Now=f.Clock.Now.AddMinutes(5);await keeper.Tick(window,default);}
        Assert.StartsWith("synthetic-access-",await f.Session().Token(default));
        Assert.False(f.Session().Disconnected("SIM"));
        // One refresh when the 20-minute access token is within the check window (every 15 minutes here), never every check.
        Assert.InRange(f.Exchange.Calls,90,100);
    }

    [Fact]
    public async Task A_refresh_token_rotated_by_another_process_does_not_discard_the_sign_in()
    {
        using var f=new Fixture();f.Exchange.ExpiresIn=1200;var session=f.Session();
        await session.Complete(State(session.Start()),"synthetic-code",default);
        f.Clock.Now=f.Clock.Now.AddMinutes(21);
        // While this process refreshes with the old token, another one has already rotated it and saved the result.
        f.Exchange.Override=body=>{
            if(!body.Contains("refresh_token=synthetic-refresh-1"))return null;
            var redirect=Origin+"/api/saxo/auth/callback";
            var rotated=new SaxoLocalCredentials("synthetic-app","synthetic-secret",redirect,redirect,"rotated-access","rotated-refresh",f.Clock.Now.AddMinutes(20),f.Clock.Now.AddMinutes(60));
            File.WriteAllBytes(Path.Combine(f.DirectoryPath,"saxo-sim.protected"),f.Protection.CreateProtector("Banking.Saxo.Session.v1","SIM").Protect(JsonSerializer.SerializeToUtf8Bytes(rotated)));
            return new HttpResponseMessage(HttpStatusCode.BadRequest){Content=new StringContent("""{"error":"invalid_grant"}""")};
        };
        Assert.Equal("rotated-access",await f.Session().Token(default));
        Assert.False(f.Session().Disconnected("SIM"));
    }

    [Fact]
    public async Task A_rejected_refresh_token_without_a_newer_session_requires_sign_in()
    {
        using var f=new Fixture();f.Exchange.ExpiresIn=1200;var session=f.Session();
        await session.Complete(State(session.Start()),"synthetic-code",default);
        f.Clock.Now=f.Clock.Now.AddMinutes(21);
        f.Exchange.Override=_=>new HttpResponseMessage(HttpStatusCode.BadRequest){Content=new StringContent("""{"error":"invalid_grant"}""")};
        Assert.Equal("SAXO_SIGN_IN_REQUIRED",(await Assert.ThrowsAsync<ApiFailure>(()=>f.Session().Token(default))).Code);
        Assert.True(f.Session().Disconnected("SIM"));
        Assert.Equal("none",await f.Session().KeepAlive("SIM",TimeSpan.FromMinutes(7),default));
    }
}
