using System.Net;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.DataProtection;

namespace Banking.Api.Security;

public sealed class Vault(IDataProtectionProvider provider, Workspace? workspace = null)
{
    private readonly IDataProtector protector = provider.CreateProtector("Banking.Local.Secrets.v1" + (workspace?.Bind() == "Live" ? ".Live" : ""));
    public string Protect(string value) => protector.Protect(value);
    public string Reveal(string value) => protector.Unprotect(value);
    public static string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
}

public sealed class LocalToken
{
    private readonly string token;
    public LocalToken(IConfiguration configuration, IHostEnvironment environment)
    {
        if (CloudHosting.Enabled(environment)) { token = Convert.ToHexString(RandomNumberGenerator.GetBytes(64)); return; }
        var injected = configuration["Local:Token"];
        if (!string.IsNullOrEmpty(injected)) { token = injected; return; }
        if (!OperatingSystem.IsWindows()) throw new InvalidOperationException("Local secret storage requires Windows.");
        var directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Banking");
        Directory.CreateDirectory(directory);
        var path = Path.Combine(directory, "api-token.dpapi");
        if (!File.Exists(path))
        {
            var generated = Encoding.UTF8.GetBytes(Convert.ToHexString(RandomNumberGenerator.GetBytes(32)));
            using var stream = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None);
            stream.Write(ProtectedData.Protect(generated, null, DataProtectionScope.CurrentUser));
        }
        token = Encoding.UTF8.GetString(ProtectedData.Unprotect(File.ReadAllBytes(path), null, DataProtectionScope.CurrentUser));
    }
    public bool Valid(string supplied) => CryptographicOperations.FixedTimeEquals(
        SHA256.HashData(Encoding.UTF8.GetBytes(supplied)), SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}

public sealed class LocalAccessMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, LocalToken token, BrowserSessions sessions, IHostEnvironment environment, IConfiguration config)
    {
        var cloud = CloudHosting.Enabled(environment);
        var host = context.Request.Host.Host;
        var allowedHost = cloud ? string.Equals(host, new Uri(CloudHosting.Origin(config)).Host, StringComparison.OrdinalIgnoreCase)
            : host.Equals("localhost", StringComparison.OrdinalIgnoreCase) || host is "127.0.0.1" or "::1" or "[::1]";
        var remote = context.Connection.RemoteIpAddress;
        if (!allowedHost || (!cloud && remote is not null && !IPAddress.IsLoopback(remote)))
        { context.Response.StatusCode = 403; return; }
        // App Service terminates TLS and supplies this header. HTTPS-only is also enforced at the service edge.
        if (cloud && context.Request.Headers["X-Forwarded-Proto"] == "https") context.Request.Scheme = "https";
        if (cloud && context.Request.Path != "/health" && !context.Request.IsHttps)
        { context.Response.StatusCode = 403; return; }
        if (cloud && context.Request.Path.Value is "/api/browser/ticket" or "/api/browser/session" or "/api/browser/password")
        { context.Response.StatusCode = 404; return; }
        var origin = context.Request.Headers.Origin.ToString();
        var sameOrigin = string.Equals(origin, $"{context.Request.Scheme}://{context.Request.Host}", StringComparison.OrdinalIgnoreCase);
        if (!string.IsNullOrEmpty(origin) && !sameOrigin)
        { context.Response.StatusCode = 403; return; }
        context.Response.Headers.CacheControl = "no-store";
        context.Response.Headers["X-Content-Type-Options"] = "nosniff";
        context.Response.Headers["Referrer-Policy"] = "no-referrer";
        var artifactOrigin = !cloud && config.GetValue<bool>("Local:AdvisorEnabled") ? " http://127.0.0.1:5451" : "";
        // Exact Codex annotation overlay stylesheet (2026-09-18). No general inline-style allowance.
        // If Codex changes its CSS, verify the new stylesheet before updating this hash.
        context.Response.Headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'sha256-UjmwW5hqkbmZat2z0a4MIudqMdHHunQ57o+t2nldQPQ='; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; frame-src 'self' https://www.tradingview-widget.com" + artifactOrigin;
        var publicAsset = HttpMethods.IsGet(context.Request.Method) && context.Request.Path.Value is "/markets-ui.js" or "/markets.css" or "/vendor/lightweight-charts-5.2.0.js" or "/" or "/index.html" or "/app.js" or "/auth-ui.js" or "/budget-ui.js" or "/charts.js" or "/visuals.css" or "/i18n.js" or "/styles.css" or "/favicon.svg"
            or "/advisor-glass.js" or "/vendor/liquid-glass/liquid-glass.js"
            or "/loans-ui.js" or "/ai-workspace-ui.js" or "/ai-workspace.css" or "/wealth.css" or "/saxo-session.js" or "/wealth-ui.js" or "/voice-companion.css" or "/overview-advisor.js" or "/loading-ui.js" or "/loading.css" or "/goals-ui.js" or "/goals.css" or "/assets/goal-car.webp" or "/assets/goal-summer-house.webp" or "/overview.js" or "/overview.css" or "/bank-details-ui.js" or "/accounts-ui.js" or "/accounts.css" or "/budget.css" or "/assets/overview-morning.webp" or "/assets/overview-afternoon.webp" or "/assets/overview-evening.webp";
        var exchange = HttpMethods.IsPost(context.Request.Method) && context.Request.Path.Value is "/api/browser/session" or "/api/browser/demo" or "/api/browser/sign-in";
        var authStatus = HttpMethods.IsGet(context.Request.Method) && context.Request.Path == "/api/browser/status";
        var runtimeInfo = HttpMethods.IsGet(context.Request.Method) && context.Request.Path == "/api/runtime-info";
        var auth = context.Request.Headers.Authorization.ToString();
        var bearer = !cloud && auth.StartsWith("Bearer ", StringComparison.Ordinal) && token.Valid(auth[7..]);
        var role = context.Request.IsHttps && context.Request.Headers["X-Banking-Client"] == "web"
            ? sessions.Role(context.Request.Cookies[BrowserSessions.Cookie]) : null;
        context.Items["OwnerAccess"] = bearer || role == "Owner";
        if ((exchange || authStatus) && (!context.Request.IsHttps || context.Request.Headers["X-Banking-Client"] != "web" || (exchange && !sameOrigin)))
        { context.Response.StatusCode = 403; return; }
        if (context.Request.Path != "/health" && context.Request.Path != "/api/auth/callback" && context.Request.Path != "/api/auth/callback/live"
            && context.Request.Path != "/api/saxo/auth/callback" && context.Request.Path != "/legal/privacy" && context.Request.Path != "/legal/terms" && !publicAsset && !exchange && !authStatus && !runtimeInfo)
        {
            var browser = role is not null;
            if (context.Request.Path == "/api/browser/ticket") browser = false;
            if (!bearer && !browser)
            { context.Response.StatusCode = 401; return; }
            if (!bearer && !HttpMethods.IsGet(context.Request.Method) && !sameOrigin)
            { context.Response.StatusCode = 403; return; }
            if (!bearer && role == "Demo" && (context.Request.Headers["X-Banking-Mode"].ToString() is not ("" or "Demo")
                || (context.Request.Path.StartsWithSegments("/api/browser") && context.Request.Path != "/api/browser/logout")))
            { context.Response.StatusCode = 403; return; }
        }
        await next(context);
    }
}
