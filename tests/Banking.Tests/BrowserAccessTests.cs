using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Banking.Api.Security;
using Microsoft.Extensions.DependencyInjection;
using static Banking.Tests.BackendTests;

namespace Banking.Tests;

public sealed class BrowserAccessTests
{
    [Fact]
    public async Task Browser_session_uses_single_use_ticket_secure_cookie_and_origin_boundary()
    {
        await using var app = new BackendFactory(); using var owner = app.AuthClient();
        using var browser = app.CreateClient(new() { BaseAddress = new Uri("https://localhost"), HandleCookies = false });
        try
        {
            Assert.Equal(HttpStatusCode.OK, (await browser.GetAsync("/")).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await browser.GetAsync("/api/accounts")).StatusCode);
            var ticket = (await Read(await owner.PostAsync("/api/browser/ticket", null))).GetProperty("ticket").GetString();
            Assert.Equal(HttpStatusCode.Forbidden, (await browser.PostAsJsonAsync("/api/browser/session", new { ticket })).StatusCode);
            browser.DefaultRequestHeaders.Add("Origin", "https://localhost"); browser.DefaultRequestHeaders.Add("X-Banking-Client", "web");
            var result = await browser.PostAsJsonAsync("/api/browser/session", new { ticket }); Assert.Equal(HttpStatusCode.OK, result.StatusCode);
            var cookie = result.Headers.GetValues("Set-Cookie").Single();
            Assert.Contains("secure", cookie); Assert.Contains("httponly", cookie); Assert.Contains("samesite=strict", cookie);
            Assert.DoesNotContain("synthetic-test-token", cookie);
            Assert.Equal(HttpStatusCode.Unauthorized, (await browser.PostAsJsonAsync("/api/browser/session", new { ticket })).StatusCode);
            browser.DefaultRequestHeaders.Add("Cookie", cookie.Split(';')[0]);
            Assert.Equal(HttpStatusCode.OK, (await browser.GetAsync("/api/accounts")).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await browser.PostAsync("/api/browser/ticket", null)).StatusCode);
            browser.DefaultRequestHeaders.Remove("X-Banking-Client");
            Assert.Equal(HttpStatusCode.Unauthorized, (await browser.GetAsync("/api/accounts")).StatusCode);
            browser.DefaultRequestHeaders.Add("X-Banking-Client", "web");
            browser.DefaultRequestHeaders.Remove("Origin"); browser.DefaultRequestHeaders.Add("Origin", "https://attacker.example");
            Assert.Equal(HttpStatusCode.Forbidden, (await browser.PostAsJsonAsync("/api/categories", new { name = "Blocked" })).StatusCode);
            using var scope=app.Services.CreateScope();
            Assert.False(scope.ServiceProvider.GetRequiredService<BrowserSessions>().Valid("tampered"));
        }
        finally { await app.Cleanup(); }
    }
}
