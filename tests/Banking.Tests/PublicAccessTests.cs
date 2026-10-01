using System.Net;
using System.Net.Http.Json;
using Banking.Api.Security;
using Microsoft.Extensions.DependencyInjection;
using static Banking.Tests.BackendTests;

namespace Banking.Tests;

public sealed class PublicAccessTests
{
    [Fact]
    public async Task Saxo_market_data_routes_allow_authenticated_demo_but_keep_provider_kill_switch()
    {
        await using var app = new BackendFactory(secondWorkspace:true);
        using var demo = Browser(app);
        using var anonymous = Browser(app);
        using var owner = app.AuthClient();
        owner.DefaultRequestHeaders.Add("X-Banking-Mode","Live");
        try
        {
            SetCookie(demo, Cookie(await demo.PostAsJsonAsync("/api/browser/demo", new { })));
            foreach(var path in new[]{"/api/markets/search?q=Microsoft","/api/markets/chart?symbol=MSFT&range=1mo"})
            {
                Assert.Equal(HttpStatusCode.Unauthorized,(await anonymous.GetAsync(path)).StatusCode);
                var shared=await demo.GetAsync(path);
                Assert.Equal(HttpStatusCode.ServiceUnavailable,shared.StatusCode);
                Assert.Contains("SAXO_LIVE_READ_DISABLED",await shared.Content.ReadAsStringAsync());
                var disabled=await owner.GetAsync(path);
                Assert.Equal(HttpStatusCode.ServiceUnavailable,disabled.StatusCode);
                Assert.Contains("SAXO_LIVE_READ_DISABLED",await disabled.Content.ReadAsStringAsync());
            }
        }
        finally { await app.Cleanup(); }
    }

    [Fact]
    public async Task Saxo_order_routes_reject_live_and_require_confirmation_before_broker_access()
    {
        await using var app = new BackendFactory(secondWorkspace:true);
        using var owner = app.AuthClient();
        owner.DefaultRequestHeaders.Add("X-Banking-Mode","Live");
        try
        {
            var id=Guid.NewGuid();
            foreach(var path in new[]{"instruments?q=Test","ticket?uic=6041","orders/"+id+"?"})
            {
                var response=await owner.GetAsync("/api/investments/saxo/"+path+"&environment=LIVE");
                Assert.Equal(HttpStatusCode.Forbidden,response.StatusCode);
                Assert.Contains("SAXO_ORDERS_SIM_ONLY",await response.Content.ReadAsStringAsync());
            }
            var input=new {uic=6041,accountKey="synthetic",side="Buy",quantity=1,limitPrice=100};
            var preview=await owner.PostAsJsonAsync("/api/investments/saxo/orders/precheck?environment=LIVE",input);
            Assert.Equal(HttpStatusCode.Forbidden,preview.StatusCode);
            Assert.Contains("SAXO_ORDERS_SIM_ONLY",await preview.Content.ReadAsStringAsync());
            var liveSubmit=await owner.PostAsJsonAsync("/api/investments/saxo/orders?environment=LIVE",new{ticketId=id,confirm=true});
            Assert.Equal(HttpStatusCode.Forbidden,liveSubmit.StatusCode);
            foreach(object body in new object[]{new{ticketId=id},new{ticketId=id,confirm=false}})
            {
                var denied=await owner.PostAsJsonAsync("/api/investments/saxo/orders?environment=SIM",body);
                Assert.Equal(HttpStatusCode.BadRequest,denied.StatusCode);
                Assert.Contains("SAXO_CONFIRMATION_REQUIRED",await denied.Content.ReadAsStringAsync());
            }
            var status=await Read(await owner.GetAsync("/api/investments/saxo/status?environment=LIVE"));
            Assert.False(status.GetProperty("trading").GetProperty("allowed").GetBoolean());
            Assert.True(status.GetProperty("trading").GetProperty("confirmationRequired").GetBoolean());
        }
        finally { await app.Cleanup(); }
    }

    [Fact]
    public async Task Demo_allows_saxo_sim_but_blocks_live_on_every_broker_endpoint()
    {
        await using var app = new BackendFactory(secondWorkspace: true);
        using var browser = Browser(app);
        using var owner = app.AuthClient();
        owner.DefaultRequestHeaders.Add("X-Banking-Mode", "Live");
        try
        {
            SetCookie(browser, Cookie(await browser.PostAsJsonAsync("/api/browser/demo", new { })));
            foreach (var suffix in new[] { "", "?environment=SIM" })
            {
                var status = await Read(await browser.GetAsync("/api/investments/saxo/status" + suffix));
                Assert.Equal("SIM", status.GetProperty("environment").GetString());
                Assert.False(status.GetProperty("liveEnabled").GetBoolean());
                Assert.Equal("ACCESS_REQUIRED", status.GetProperty("reason").GetString());
                Assert.True(status.GetProperty("trading").GetProperty("allowed").GetBoolean());
                Assert.False(status.GetProperty("trading").GetProperty("ownerRequired").GetBoolean());
                foreach (var action in new[] { "connect", "preview" })
                {
                    // Testing has no provider credentials: reaching setup, rather than authorization,
                    // proves SIM is allowed without making an external request or using local secrets.
                    var response = await browser.PostAsJsonAsync("/api/investments/saxo/" + action + suffix, new { });
                    Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
                    Assert.Contains("SAXO_ACCESS_REQUIRED", await response.Content.ReadAsStringAsync());
                }
            }
            var portfolio=await Read(await browser.GetAsync("/api/investments/saxo/portfolio?environment=SIM"));
            Assert.Equal("Unavailable",portfolio.GetProperty("status").GetString());
            Assert.Equal(System.Text.Json.JsonValueKind.Null,portfolio.GetProperty("portfolio").ValueKind);
            Assert.Equal(System.Text.Json.JsonValueKind.Null,portfolio.GetProperty("orders").ValueKind);
            Assert.Equal(HttpStatusCode.Forbidden,(await browser.GetAsync("/api/investments/saxo/portfolio?environment=LIVE")).StatusCode);
            foreach(var path in new[]{"orders","orders/"+Guid.NewGuid(),"instruments?q=MSFT","ticket?uic=123"})
                Assert.Equal(HttpStatusCode.Forbidden,(await browser.GetAsync("/api/investments/saxo/"+path+(path.Contains('?')?"&":"?")+"environment=LIVE")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden,(await browser.PostAsJsonAsync("/api/investments/saxo/disconnect?environment=LIVE",new{})).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest,(await browser.GetAsync("/api/investments/saxo/portfolio?environment=invalid")).StatusCode);
            var invalidDraft=await browser.PostAsJsonAsync("/api/investments/saxo/orders/precheck?environment=SIM",new{uic=0,accountKey="",side="Buy",quantity=0,limitPrice=0});
            Assert.Equal(HttpStatusCode.BadRequest,invalidDraft.StatusCode);
            Assert.Contains("INVALID_ORDER",await invalidDraft.Content.ReadAsStringAsync());
            var unconfirmed=await browser.PostAsJsonAsync("/api/investments/saxo/orders?environment=SIM",new{ticketId=Guid.Empty,confirm=false});
            Assert.Equal(HttpStatusCode.BadRequest,unconfirmed.StatusCode);
            Assert.Contains("SAXO_CONFIRMATION_REQUIRED",await unconfirmed.Content.ReadAsStringAsync());
            var liveOrder=await browser.PostAsJsonAsync("/api/investments/saxo/orders?environment=LIVE",new{ticketId=Guid.Empty,confirm=true});
            Assert.Equal(HttpStatusCode.Forbidden,liveOrder.StatusCode);
            Assert.Contains("SAXO_LIVE_OWNER_REQUIRED",await liveOrder.Content.ReadAsStringAsync());
            foreach (var action in new[] { "status", "connect", "preview" })
            {
                async Task<HttpResponseMessage> Request(HttpClient client, string market) => action == "status"
                    ? await client.GetAsync($"/api/investments/saxo/{action}?environment={market}")
                    : await client.PostAsJsonAsync($"/api/investments/saxo/{action}?environment={market}", new { });
                var denied = await Request(browser, "LIVE");
                Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
                Assert.Contains("SAXO_LIVE_OWNER_REQUIRED", await denied.Content.ReadAsStringAsync());
                Assert.Equal(HttpStatusCode.BadRequest, (await Request(browser, "invalid")).StatusCode);
                Assert.Equal(action == "status" ? HttpStatusCode.OK : action == "connect" ? HttpStatusCode.Unauthorized : HttpStatusCode.ServiceUnavailable,
                    (await Request(owner, "LIVE")).StatusCode);
            }
            browser.DefaultRequestHeaders.Add("X-Banking-Mode", "Live");
            Assert.Equal(HttpStatusCode.Forbidden, (await browser.GetAsync("/api/investments/saxo/status?environment=LIVE")).StatusCode);
        }
        finally { await app.Cleanup(); }
    }

    [Fact]
    public async Task Overview_assets_are_public_but_do_not_expand_private_access()
    {
        await using var app = new BackendFactory(); using var browser = Browser(app);
        try
        {
            foreach (var path in new[] { "/advisor-glass.js", "/vendor/liquid-glass/liquid-glass.js", "/loading-ui.js", "/loading.css", "/overview.js", "/overview.css", "/assets/overview-morning.webp", "/assets/overview-afternoon.webp", "/assets/overview-evening.webp" })
            {
                var response = await browser.GetAsync(path);
                Assert.Equal(HttpStatusCode.OK, response.StatusCode);
                Assert.Contains("script-src 'self'", response.Headers.GetValues("Content-Security-Policy").Single());
                var policy = response.Headers.GetValues("Content-Security-Policy").Single();
                Assert.Contains("style-src 'self' 'sha256-UjmwW5hqkbmZat2z0a4MIudqMdHHunQ57o+t2nldQPQ='", policy);
                Assert.DoesNotContain("unsafe-inline", policy);
                Assert.DoesNotContain("unsafe-eval", policy);
                Assert.Equal(HttpStatusCode.Unauthorized, (await browser.PostAsync(path, null)).StatusCode);
            }
            foreach (var path in new[] { "/vendor/liquid-glass/private.json", "/assets/private.json", "/appsettings.Local.json", "/api/accounts", "/api/transactions" })
                Assert.Equal(HttpStatusCode.Unauthorized, (await browser.GetAsync(path)).StatusCode);
        }
        finally { await app.Cleanup(); }
    }

    private static HttpClient Browser(BackendFactory app)
    {
        var client = app.CreateClient(new() { BaseAddress = new Uri("https://localhost"), HandleCookies = false });
        client.DefaultRequestHeaders.Add("Origin", "https://localhost");
        client.DefaultRequestHeaders.Add("X-Banking-Client", "web");
        return client;
    }
    private static string Cookie(HttpResponseMessage response) => response.Headers.GetValues("Set-Cookie").Single().Split(';')[0];
    private static void SetCookie(HttpClient client, string cookie)
    { client.DefaultRequestHeaders.Remove("Cookie"); client.DefaultRequestHeaders.Add("Cookie", cookie); }

    [Fact]
    public async Task Runtime_info_is_public_and_exposes_only_the_small_additive_contract()
    {
        await using var app = new BackendFactory(); using var browser = Browser(app);
        try
        {
            var response = await browser.GetAsync("/api/runtime-info");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var info = await Read(response);
            Assert.Equal(1, info.GetProperty("apiContractVersion").GetInt32());
            Assert.Equal("local", info.GetProperty("backend").GetString());
            Assert.True(info.GetProperty("sharedDemo").GetBoolean());
            var features = info.GetProperty("features");
            Assert.True(features.GetProperty("sharedDemoFinancialData").GetBoolean());
            Assert.False(features.GetProperty("relativeAdvisorRenderer").GetBoolean());
            Assert.DoesNotContain("ConnectionStrings", info.GetRawText(), StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("secret", info.GetRawText(), StringComparison.OrdinalIgnoreCase);
        }
        finally { await app.Cleanup(); }
    }

    [Fact]
    public async Task Anonymous_demo_cannot_escalate_to_live_or_set_owner_password()
    {
        await using var app = new BackendFactory(secondWorkspace: true); using var browser = Browser(app);
        try
        {
            Assert.Equal(HttpStatusCode.Unauthorized, (await browser.GetAsync("/api/accounts")).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await browser.PostAsJsonAsync("/api/browser/password", new { password = "untrusted-test-password" })).StatusCode);
            var result = await browser.PostAsJsonAsync("/api/browser/demo", new { });
            Assert.Equal(HttpStatusCode.OK, result.StatusCode); SetCookie(browser, Cookie(result));
            Assert.Equal(HttpStatusCode.OK, (await browser.GetAsync("/api/accounts")).StatusCode);
            var mode = await Read(await browser.GetAsync("/api/mode"));
            Assert.Equal(1, mode.GetProperty("availableModes").GetArrayLength());
            Assert.Equal("Demo", mode.GetProperty("availableModes")[0].GetString());
            Assert.Equal(HttpStatusCode.Forbidden, (await browser.PostAsJsonAsync("/api/browser/password", new { password = "untrusted-test-password" })).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await browser.PostAsync("/api/browser/ticket", null)).StatusCode);
            browser.DefaultRequestHeaders.Add("X-Banking-Mode", "Live");
            foreach (var path in new[] { "/api/accounts", "/api/transactions", "/api/connections", "/api/goals", "/api/budget-plans" })
                Assert.Equal(HttpStatusCode.Forbidden, (await browser.GetAsync(path)).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await browser.PostAsJsonAsync("/api/connections/authorize", new { provider = "enable-banking", bank = "Danske Bank", country = "DK" })).StatusCode);
            browser.DefaultRequestHeaders.Remove("X-Banking-Mode");
            browser.DefaultRequestHeaders.Remove("Origin");
            Assert.Equal(HttpStatusCode.Forbidden, (await browser.PostAsJsonAsync("/api/browser/demo", new { })).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await browser.PostAsJsonAsync("/api/categories", new { name = "Blocked" })).StatusCode);
        }
        finally { await app.Cleanup(); }
    }

    [Theory]
    [InlineData(8)]
    [InlineData(128)]
    public async Task Owner_setup_password_sign_in_and_logout_revoke_access(int passwordLength)
    {
        await using var app = new BackendFactory(secondWorkspace: true); using var owner = app.AuthClient(); using var browser = Browser(app);
        try
        {
            var password = new string('T', passwordLength); // Disposable test-host credential only.
            var ticket = (await Read(await owner.PostAsync("/api/browser/ticket", null))).GetProperty("ticket").GetString();
            var exchange = await browser.PostAsJsonAsync("/api/browser/session", new { ticket });
            var originalCookie = Cookie(exchange); SetCookie(browser, originalCookie);
            Assert.Equal(HttpStatusCode.BadRequest, (await browser.PostAsJsonAsync("/api/browser/password", new { password = "1234567" })).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await browser.PostAsJsonAsync("/api/browser/password", new { password = new string('T', 129) })).StatusCode);
            var setup = await browser.PostAsJsonAsync("/api/browser/password", new { password });
            Assert.Equal(HttpStatusCode.OK, setup.StatusCode); var ownerCookie = Cookie(setup);
            Assert.Equal(HttpStatusCode.Unauthorized, (await browser.GetAsync("/api/accounts")).StatusCode);
            SetCookie(browser, ownerCookie);
            Assert.Equal(HttpStatusCode.Conflict, (await browser.PostAsJsonAsync("/api/browser/password", new { password })).StatusCode);
            browser.DefaultRequestHeaders.Add("X-Banking-Mode", "Live");
            Assert.Equal(HttpStatusCode.OK, (await browser.GetAsync("/api/accounts")).StatusCode);
            Assert.Equal(HttpStatusCode.NoContent, (await browser.PostAsync("/api/browser/logout", null)).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await browser.GetAsync("/api/accounts")).StatusCode);
            browser.DefaultRequestHeaders.Remove("X-Banking-Mode");
            Assert.Equal(HttpStatusCode.Unauthorized, (await browser.PostAsJsonAsync("/api/browser/sign-in", new { password = "wrong" })).StatusCode);
            var login = await browser.PostAsJsonAsync("/api/browser/sign-in", new { password });
            Assert.Equal(HttpStatusCode.OK, login.StatusCode); SetCookie(browser, Cookie(login));
            Assert.Equal("Owner", (await Read(await browser.GetAsync("/api/browser/status"))).GetProperty("role").GetString());
            var demo = await browser.PostAsJsonAsync("/api/browser/demo", new { }); SetCookie(browser, Cookie(login));
            Assert.Equal(HttpStatusCode.Unauthorized, (await browser.GetAsync("/api/accounts")).StatusCode);
            SetCookie(browser, Cookie(demo));
            Assert.Equal("Demo", (await Read(await browser.GetAsync("/api/browser/status"))).GetProperty("role").GetString());
            for (var i = 0; i < 5; i++) Assert.Equal(HttpStatusCode.Unauthorized, (await browser.PostAsJsonAsync("/api/browser/sign-in", new { password = "wrong" })).StatusCode);
            Assert.Equal(HttpStatusCode.TooManyRequests, (await browser.PostAsJsonAsync("/api/browser/sign-in", new { password })).StatusCode);
            Assert.True(app.Services.GetRequiredService<OwnerPassword>().Configured);
        }
        finally { await app.Cleanup(); }
    }
}
