using System.Net;
using System.Text.Json;
using Banking.Api.Providers;
using Banking.Api.Services;
using Banking.Api.Security;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;

namespace Banking.Tests;

public sealed class SaxoSignInTests
{
    [Fact]
    public async Task Callback_returns_to_the_originating_page_and_state_is_single_use()
    {
        using var fixture=new Fixture();var session=fixture.Session;
        string Start(string? destination=null)
        {
            var response=JsonSerializer.SerializeToElement(session.Start("SIM",destination));
            var url=new Uri(response.GetProperty("authorizationUrl").GetString()!);
            Assert.Equal("sim.logonvalidation.net",url.Host);
            Assert.Equal("https://banking-test.azurewebsites.net/api/saxo/auth/callback",QueryHelpers.ParseQuery(url.Query)["redirect_uri"]);
            return QueryHelpers.ParseQuery(url.Query)["state"].ToString();
        }
        var local=Start("https://localhost:5444/#/investments");
        var azure=Start("https://banking-test.azurewebsites.net/#/investments");
        var markets=Start();
        Assert.Equal("https://banking-test.azurewebsites.net/#/investments",await session.Complete(azure,"synthetic-code",default));
        Assert.Equal("https://localhost:5444/#/investments",await session.Complete(local,"synthetic-code",default));
        Assert.Equal("https://banking-test.azurewebsites.net/#/markets",await session.Complete(markets,"synthetic-code",default));
        await Assert.ThrowsAsync<ApiFailure>(()=>session.Complete(local,"synthetic-code",default));
        Assert.Equal(3,fixture.Handler.Calls);
    }

    [Theory]
    [InlineData("https://evil.example/#/investments")]
    [InlineData("//evil.example/#/investments")]
    [InlineData("https://banking-test.azurewebsites.net.evil.example/#/investments")]
    [InlineData("https://banking-test.azurewebsites.net/#/investments?next=https://evil.example")]
    [InlineData("https://localhost:5443/#/investments")]
    [InlineData("http://localhost:5444/#/investments")]
    [InlineData("https://localhost:5444/api/browser/logout")]
    public void Unapproved_return_destinations_are_rejected_before_authorization(string destination)
    {
        using var fixture=new Fixture();
        Assert.Throws<ApiFailure>(()=>fixture.Session.Start("SIM",destination));
        Assert.Equal(0,fixture.Handler.Calls);
    }

    [Theory]
    [InlineData("SIM", "Demo")]
    [InlineData("LIVE", "Live")]
    public async Task Bound_callback_requires_original_session_proof_and_live_owner(string market,string mode)
    {
        using var fixture=new Fixture();var session=fixture.Session;
        var start=JsonSerializer.SerializeToElement(session.Start(market,"https://localhost:5444/#/investments","owner-session"));
        var state=QueryHelpers.ParseQuery(new Uri(start.GetProperty("authorizationUrl").GetString()!).Query)["state"].ToString();
        var proof=start.GetProperty("completionProof").GetString()!;
        var url=await session.Complete(state,"synthetic-code",default);
        Assert.StartsWith("https://localhost:5444/?saxoComplete=",url);Assert.EndsWith("#/investments",url);
        Assert.DoesNotContain("synthetic-code",url);Assert.Equal(0,fixture.Handler.Calls);
        var other=new Workspace{SessionScope="other-session",OwnerAuthenticated=true};other.Select(mode);
        Assert.Equal("SAXO_AUTH_SESSION_MISMATCH",(await Assert.ThrowsAsync<ApiFailure>(()=>session.Finish(state,proof,other,default))).Code);
        var owner=new Workspace{SessionScope="owner-session",OwnerAuthenticated=true};owner.Select(mode);
        await Assert.ThrowsAsync<ApiFailure>(()=>session.Finish(state,"wrong-proof",owner,default));
        if(market=="LIVE"){
            owner.OwnerAuthenticated=false;
            await Assert.ThrowsAsync<ApiFailure>(()=>session.Finish(state,proof,owner,default));
            owner.OwnerAuthenticated=true;
        }
        Assert.Equal(market,await session.Finish(state,proof,owner,default));Assert.Equal(1,fixture.Handler.Calls);
        await Assert.ThrowsAsync<ApiFailure>(()=>session.Finish(state,proof,owner,default));
        var identity=session.CacheIdentity(market);await session.Disconnect(market,default);
        Assert.Null(await session.Token(default,market));Assert.NotEqual(identity,session.CacheIdentity(market));
        Assert.True(session.Disconnected(market));
    }

    [Fact]
    public void Live_auth_cannot_start_without_a_session_binding()
    {
        using var fixture=new Fixture();Assert.Throws<ApiFailure>(()=>fixture.Session.Start("LIVE"));
    }

    [Fact]
    public async Task Cancelled_authorization_returns_safely_without_exchanging_or_reusing_the_code()
    {
        using var fixture=new Fixture();
        var start=JsonSerializer.SerializeToElement(fixture.Session.Start("LIVE","https://localhost:5444/#/investments","session"));
        var state=QueryHelpers.ParseQuery(new Uri(start.GetProperty("authorizationUrl").GetString()!).Query)["state"].ToString();
        Assert.Equal("https://localhost:5444/?saxoError=cancelled#/investments",fixture.Session.Cancel(state));
        await Assert.ThrowsAsync<ApiFailure>(()=>fixture.Session.Complete(state,"synthetic-code",default));
        Assert.Equal(0,fixture.Handler.Calls);
    }

    [Theory]
    [InlineData(400)]
    [InlineData(401)]
    [InlineData(429)]
    public async Task Failed_refresh_does_not_repeat_across_concurrent_readers(int status)
    {
        using var fixture=new Fixture();fixture.Handler.ExpiresIn=1;
        var start=JsonSerializer.SerializeToElement(fixture.Session.Start("SIM"));
        var state=QueryHelpers.ParseQuery(new Uri(start.GetProperty("authorizationUrl").GetString()!).Query)["state"].ToString();
        await fixture.Session.Complete(state,"synthetic-code",default);
        fixture.Handler.Status=(HttpStatusCode)status;
        await Task.WhenAll(Enumerable.Range(0,10).Select(async _=>{
            try {Assert.Null(await fixture.Session.Token(default));}catch(ApiFailure ex){Assert.Contains(ex.Code,new[]{"SAXO_SIGN_IN_REQUIRED","SAXO_RATE_LIMITED"});}
        }));
        Assert.Equal(2,fixture.Handler.Calls);
        Assert.Equal(status!=429,fixture.Session.Disconnected("SIM"));
    }

    [Fact]
    public async Task Concurrent_refresh_is_single_and_disconnect_invalidates_pending_authorization()
    {
        using var fixture=new Fixture();fixture.Handler.ExpiresIn=1;
        var start=JsonSerializer.SerializeToElement(fixture.Session.Start("SIM"));
        var state=QueryHelpers.ParseQuery(new Uri(start.GetProperty("authorizationUrl").GetString()!).Query)["state"].ToString();
        await fixture.Session.Complete(state,"synthetic-code",default);fixture.Handler.ExpiresIn=3600;
        var tokens=await Task.WhenAll(Enumerable.Range(0,10).Select(_=>fixture.Session.Token(default)));
        Assert.All(tokens,value=>Assert.Equal("synthetic-access",value));Assert.Equal(2,fixture.Handler.Calls);
        var bound=JsonSerializer.SerializeToElement(fixture.Session.Start("LIVE",null,"owner"));
        var liveState=QueryHelpers.ParseQuery(new Uri(bound.GetProperty("authorizationUrl").GetString()!).Query)["state"].ToString();
        await fixture.Session.Complete(liveState,"synthetic-code",default);
        await fixture.Session.Disconnect("LIVE",default);
        var owner=new Workspace{SessionScope="owner",OwnerAuthenticated=true};owner.Select("Live");
        await Assert.ThrowsAsync<ApiFailure>(()=>fixture.Session.Finish(liveState,bound.GetProperty("completionProof").GetString()!,owner,default));
        Assert.Equal(2,fixture.Handler.Calls);
    }

    sealed class Fixture:IDisposable
    {
        readonly string directory=Path.Combine(Path.GetTempPath(),"Banking-SaxoSignIn-"+Guid.NewGuid());
        public TokenHandler Handler {get;}=new();
        public SaxoLocalSession Session {get;}
        public Fixture()
        {
            var config=new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> {
                ["Cloud:Origin"]="https://banking-test.azurewebsites.net",["Cloud:StateDirectory"]=directory,
                ["Saxo:LIVE:AppKey"]="live-synthetic-key",["Saxo:LIVE:AppSecret"]="live-synthetic-secret",
                ["Saxo:LIVE:RedirectUri"]="https://banking-test.azurewebsites.net/api/saxo/auth/callback",
                ["Saxo:SIM:AppKey"]="synthetic-key",["Saxo:SIM:AppSecret"]="synthetic-secret",
                ["Saxo:SIM:RedirectUri"]="https://banking-test.azurewebsites.net/api/saxo/auth/callback"
            }).Build();
            Session=new SaxoLocalSession(new EnvironmentStub(),new Clients(Handler),TimeProvider.System,config,new EphemeralDataProtectionProvider());
        }
        public void Dispose(){Handler.Dispose();if(Directory.Exists(directory))Directory.Delete(directory,true);}
    }
    sealed class Clients(TokenHandler handler):IHttpClientFactory {public HttpClient CreateClient(string name)=>new(handler,false);}
    sealed class TokenHandler:HttpMessageHandler
    {
        public int Calls;
        public int ExpiresIn=3600;
        public HttpStatusCode Status=HttpStatusCode.OK;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken ct)
        {
            Calls++;Assert.Contains(request.RequestUri!.AbsoluteUri,new[]{"https://sim.logonvalidation.net/token","https://live.logonvalidation.net/token"});
            return Task.FromResult(new HttpResponseMessage(Status){Content=new StringContent(JsonSerializer.Serialize(new{access_token="synthetic-access",refresh_token="synthetic-refresh",expires_in=ExpiresIn,refresh_token_expires_in=7200}))});
        }
    }
    sealed class EnvironmentStub:IHostEnvironment
    {
        public string EnvironmentName {get;set;}="Production";
        public string ApplicationName {get;set;}="Banking.Tests";
        public string ContentRootPath {get;set;}="";
        public IFileProvider ContentRootFileProvider {get;set;}=new NullFileProvider();
    }
}
