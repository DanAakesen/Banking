using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Banking.Api.Providers;
using Banking.Api.Security;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Configuration;

namespace Banking.Tests;

public sealed class ProviderTests
{
    [Theory]
    [InlineData("AUTHORIZED", false, null)]
    [InlineData("CLOSED", false, "SESSION_NOT_AUTHORIZED")]
    [InlineData("AUTHORIZED", true, "SESSION_ACCOUNT_MISMATCH")]
    public async Task Session_recovery_checks_consent_and_detail_identity_without_exchanging_a_code(string status, bool mismatch, string? error)
    {
        using var rsa = RSA.Create(2048); var vault = new Vault(new EphemeralDataProtectionProvider()); var file = Path.GetTempFileName();
        await File.WriteAllTextAsync(file, vault.Protect(rsa.ExportPkcs8PrivateKeyPem()));
        var sessionId = Guid.NewGuid().ToString(); var accountId = Guid.NewGuid().ToString(); var calls = 0;
        using var handler = new Handler(request =>
        {
            calls++; Assert.Equal(HttpMethod.Get, request.Method);
            object payload;
            if (request.RequestUri!.AbsolutePath == $"/sessions/{sessionId}")
                payload = new { status, psu_type = "personal", access = new { valid_until = DateTimeOffset.UtcNow.AddDays(1) },
                    created = DateTimeOffset.UtcNow, aspsp = new { name = "Synthetic", country = "DK" }, accounts = new[] { accountId },
                    accounts_data = new[] { new { uid = accountId, identification_hash = "synthetic-primary" } } };
            else
            {
                Assert.Equal($"/accounts/{accountId}/details", request.RequestUri.AbsolutePath);
                payload = new { uid = accountId, identification_hash = mismatch ? "different-primary" : "synthetic-primary",
                    identification_hashes = new[] { "synthetic-alias" }, currency = "DKK", name = "Synthetic account" };
            }
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(payload)) });
        });
        using var http = new HttpClient(handler);
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> {
            ["EnableBanking:ApplicationId"] = Guid.NewGuid().ToString(), ["EnableBanking:ProtectedKeyFile"] = file }).Build();
        try
        {
            var provider = new EnableBankingProvider(http, config, vault);
            if (error is not null) Assert.Equal(error, (await Assert.ThrowsAsync<ProviderFailure>(() => provider.ReadAuthorizedSession(sessionId, default))).Code);
            else
            {
                var result = await provider.ReadAuthorizedSession(sessionId, default);
                Assert.Equal("Synthetic", result.Bank); Assert.Equal("DK", result.Country);
                Assert.Equal(sessionId, result.Session.Id); Assert.Equal("synthetic-alias", Assert.Single(result.Session.Accounts).IdentityAliases![0]);
            }
            Assert.Equal(status == "AUTHORIZED" ? 2 : 1, calls);
        }
        finally { File.Delete(file); }
    }
    [Fact]
    public async Task Application_preflight_and_session_closure_use_only_the_documented_AIS_paths()
    {
        using var rsa = RSA.Create(2048); var vault = new Vault(new EphemeralDataProtectionProvider()); var file = Path.GetTempFileName();
        await File.WriteAllTextAsync(file, vault.Protect(rsa.ExportPkcs8PrivateKeyPem()));
        var paths = new List<string>();
        using var handler = new Handler(request =>
        {
            paths.Add(request.Method + " " + request.RequestUri!.AbsolutePath);
            if (request.Method == HttpMethod.Get && request.RequestUri.AbsolutePath == "/application")
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("""{"environment":"PRODUCTION","active":true,"services":["AIS"],"redirect_urls":["https://localhost:5443/api/auth/callback/live"]}""") });
            Assert.Equal(HttpMethod.Delete, request.Method); Assert.Equal("/sessions/synthetic-session", request.RequestUri.AbsolutePath);
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NoContent));
        });
        using var http = new HttpClient(handler);
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["EnableBanking:ApplicationId"] = Guid.NewGuid().ToString(), ["EnableBanking:ProtectedKeyFile"] = file }).Build();
        try
        {
            var adapter = new EnableBankingProvider(http, config, vault);
            var result = JsonSerializer.SerializeToElement(await adapter.VerifyApplication(default)); Assert.True(result.GetProperty("ready").GetBoolean());
            Assert.False(result.GetProperty("liveBankVerified").GetBoolean());
            await adapter.CloseSession("synthetic-session", default);
            Assert.Equal(["GET /application", "DELETE /sessions/synthetic-session"], paths);
        }
        finally { File.Delete(file); }
    }
    private sealed class Handler(Func<HttpRequestMessage, Task<HttpResponseMessage>> respond) : HttpMessageHandler
    { protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) => respond(request); }
    private static byte[] Decode(string value) => Convert.FromBase64String(value.Replace('-', '+').Replace('_', '/') + new string('=', (4 - value.Length % 4) % 4));

    [Fact]
    public async Task Adapter_signs_AIS_requests_and_preserves_cursor_dates_amounts_and_missing_values()
    {
        using var rsa = RSA.Create(2048);
        var vault = new Vault(new EphemeralDataProtectionProvider()); var file = Path.GetTempFileName();
        await File.WriteAllTextAsync(file, vault.Protect(rsa.ExportRSAPrivateKeyPem()));
        var id = Guid.NewGuid().ToString(); var paths = new List<string>();
        using var handler = new Handler(async request =>
        {
            Assert.Equal("api.enablebanking.com", request.RequestUri!.Host); Assert.Equal("https", request.RequestUri.Scheme);
            Assert.DoesNotContain(request.Headers, x => x.Key.StartsWith("Psu-", StringComparison.OrdinalIgnoreCase));
            var jwt = request.Headers.Authorization!.Parameter!.Split('.'); Assert.Equal(3, jwt.Length);
            Assert.True(rsa.VerifyData(Encoding.ASCII.GetBytes(jwt[0] + "." + jwt[1]), Decode(jwt[2]), HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1));
            var claims = JsonDocument.Parse(Decode(jwt[1])).RootElement;
            Assert.Equal("enablebanking.com", claims.GetProperty("iss").GetString()); Assert.Equal("api.enablebanking.com", claims.GetProperty("aud").GetString());
            Assert.Equal(60, claims.GetProperty("exp").GetInt64() - claims.GetProperty("iat").GetInt64());
            Assert.Equal(id, JsonDocument.Parse(Decode(jwt[0])).RootElement.GetProperty("kid").GetString());
            var path = request.RequestUri.AbsolutePath; paths.Add(path);
            string json;
            if (path == "/auth")
            {
                Assert.Equal(HttpMethod.Post, request.Method);
                var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync()).RootElement;
                Assert.Equal("personal", body.GetProperty("psu_type").GetString()); Assert.True(body.GetProperty("access").GetProperty("transactions").GetBoolean());
                Assert.False(body.TryGetProperty("credentials", out _)); Assert.Equal("state-example", body.GetProperty("state").GetString());
                json = """{"url":"https://auth.enablebanking.com/ais/start?sessionid=synthetic"}""";
            }
            else if (path == "/sessions") json = """{"session_id":"synthetic-session","access":{"valid_until":"2030-01-01T00:00:00Z"},"accounts":[{"uid":"synthetic-account","identification_hash":"stable","currency":"EUR"}]}""";
            else if (path == "/aspsps") json = """{"aspsps":[{"name":"Synthetic bank","country":"DK","psu_types":["personal"],"maximum_consent_validity":86400},{"name":"Business only","country":"DK","psu_types":["business"],"maximum_consent_validity":3600}]}""";
            else if (path.EndsWith("/transactions", StringComparison.Ordinal))
            {
                Assert.Equal(HttpMethod.Get, request.Method);
                if (request.RequestUri.Query.Contains("longest", StringComparison.Ordinal)) { Assert.DoesNotContain("date_", request.RequestUri.Query); json = """{"transactions":[],"continuation_key":"a+b/c?="}"""; }
                else
                {
                    Assert.Contains("date_from=2026-01-01", request.RequestUri.Query); Assert.Contains("continuation_key=a%2Bb%2Fc%3F%3D", request.RequestUri.Query);
                    json = """{"transactions":[{"entry_reference":"ref","transaction_amount":{"amount":"123.4567","currency":"EUR"},"credit_debit_indicator":"DBIT","status":"BOOK","remittance_information":["Synthetic","purchase"]}],"continuation_key":null}""";
                }
            }
            else if (path.EndsWith("/balances", StringComparison.Ordinal)) json = """{"balances":[{"balance_amount":{"amount":"-14.50","currency":"EUR"},"balance_type":"CLBD"}]}""";
            else throw new InvalidOperationException("Unexpected outbound path.");
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(json) };
        });
        using var http = new HttpClient(handler);
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["EnableBanking:ApplicationId"] = id, ["EnableBanking:ProtectedKeyFile"] = file }).Build();
        var adapter = new EnableBankingProvider(http, config, vault);
        try
        {
            Assert.Single(await adapter.Banks(default));
            await adapter.Authorize("Synthetic bank", "DK", "state-example", new Uri("https://callback.example/api/auth/callback"), DateTimeOffset.UtcNow.AddDays(1), default);
            var session = await adapter.Complete("synthetic-code", default); Assert.Equal("Bank account", session.Accounts[0].Name);
            var page = await adapter.Transactions(session.Id, "synthetic-account", true, null, new DateOnly(2026, 1, 31), null, default);
            Assert.Empty(page.Items); Assert.NotNull(page.Cursor);
            var next = await adapter.Transactions(session.Id, "synthetic-account", false, new DateOnly(2026, 1, 1), new DateOnly(2026, 1, 31), page.Cursor, default);
            Assert.Null(next.Cursor); Assert.Null(next.Items[0].BookingDate); Assert.Equal(-123.4567m, next.Items[0].Amount);
            Assert.Equal("Synthetic purchase", next.Items[0].Description);
            var balance = Assert.Single(await adapter.Balances(session.Id, "synthetic-account", default));
            Assert.Equal(-14.50m, balance.Amount); Assert.Null(balance.BankTime); Assert.Equal("CLBD", balance.Type);
            Assert.Equal(6, paths.Count);
        }
        finally { File.Delete(file); }
    }

    [Theory]
    [InlineData(429, "ignored", "RATE_LIMITED")]
    [InlineData(400, "ASPSP_RATE_LIMIT_EXCEEDED", "RATE_LIMITED")]
    [InlineData(401, "EXPIRED_SESSION", "CONSENT_EXPIRED")]
    [InlineData(403, "REVOKED_SESSION", "CONSENT_EXPIRED")]
    [InlineData(403, "CLOSED_SESSION", "CONSENT_EXPIRED")]
    [InlineData(408, "ASPSP_TIMEOUT", "PROVIDER_UNAVAILABLE")]
    [InlineData(503, "private-error-details", "PROVIDER_UNAVAILABLE")]
    [InlineData(400, "WRONG_REQUEST_PARAMETERS", "PROVIDER_INVALID_PARAMETERS")]
    [InlineData(400, "REDIRECT_URI_NOT_ALLOWED", "PROVIDER_CALLBACK_NOT_ALLOWED")]
    [InlineData(400, "PSU_HEADER_NOT_PROVIDED", "PROVIDER_PSU_CONTEXT_REQUIRED")]
    [InlineData(403, "ACCESS_DENIED", "PROVIDER_ACCESS_DENIED")]
    public async Task Provider_errors_are_sanitized_with_expiry_and_retry_semantics(int status, string remoteCode, string expected)
    {
        using var rsa = RSA.Create(2048); var vault = new Vault(new EphemeralDataProtectionProvider()); var file = Path.GetTempFileName();
        await File.WriteAllTextAsync(file, vault.Protect(rsa.ExportRSAPrivateKeyPem()));
        using var handler = new Handler(_ =>
        {
            var response = new HttpResponseMessage((HttpStatusCode)status) { Content = new StringContent(JsonSerializer.Serialize(new { error = remoteCode, message = "synthetic-secret-must-not-leak" })) };
            response.Headers.RetryAfter = new RetryConditionHeaderValue(TimeSpan.FromHours(12)); return Task.FromResult(response);
        });
        using var http = new HttpClient(handler);
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["EnableBanking:ApplicationId"] = Guid.NewGuid().ToString(), ["EnableBanking:ProtectedKeyFile"] = file }).Build();
        try
        {
            var error = await Assert.ThrowsAsync<ProviderFailure>(() => new EnableBankingProvider(http, config, vault).Banks(default));
            Assert.Equal(expected, error.Code); Assert.Equal(expected, error.Message);
            if (status == 429) Assert.Equal(TimeSpan.FromHours(12), error.RetryAfter);
            if (expected == "CONSENT_EXPIRED") Assert.Null(error.RetryAfter);
        }
        finally { File.Delete(file); }
    }
}
