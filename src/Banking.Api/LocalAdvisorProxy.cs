using System.Net;
using Banking.Api.Security;

namespace Banking.Api;

// Local-only adapter. The session is sent only to the fixed loopback companion,
// which uses it to read the authenticated goal endpoint, never to OpenAI.
public sealed class LocalAdvisorProxy(RequestDelegate next, IHttpClientFactory clients)
{
    public async Task InvokeAsync(HttpContext context, IHostEnvironment env, IConfiguration config, BrowserSessions sessions)
    {
        var render = context.Request.Path.StartsWithSegments("/advisor-render", out var remainder);
        if (!render && !context.Request.Path.StartsWithSegments("/advisor", out remainder)) { await next(context); return; }
        var cloud = CloudHosting.Enabled(env);
        if (cloud && context.Request.Headers["X-Forwarded-Proto"] == "https") context.Request.Scheme = "https";
        if (!(cloud ? config.GetValue<bool>("Advisor:Enabled") : env.IsDevelopment() && config.GetValue<bool>("Local:AdvisorEnabled"))) { context.Response.StatusCode = 404; return; }
        var publicOrigin = cloud ? CloudHosting.Origin(config) : "https://localhost:5443";
        if (!context.Request.IsHttps || "https://" + context.Request.Host != publicOrigin
            || (!cloud && context.Connection.RemoteIpAddress is {} remote && !IPAddress.IsLoopback(remote))) { context.Response.StatusCode = 403; return; }
        if (!sessions.Valid(context.Request.Cookies[BrowserSessions.Cookie])) { context.Response.StatusCode = 401; return; }
        var mode = context.Request.Headers["X-Banking-Mode"].ToString();
        if (render)
        {
            var renderMode = context.Request.Query["mode"].ToString();
            if (!string.IsNullOrEmpty(renderMode))
            {
                if (renderMode is not ("Demo" or "Live") || (!string.IsNullOrEmpty(mode) && mode != renderMode)) { context.Response.StatusCode = 403; return; }
                mode = renderMode;
            }
        }
        if (string.IsNullOrEmpty(mode)) mode = "Demo";
        if (mode is not ("Demo" or "Live") || (mode == "Live" && sessions.Role(context.Request.Cookies[BrowserSessions.Cookie]) != "Owner")) { context.Response.StatusCode = 403; return; }
        var origin = context.Request.Headers.Origin.ToString();
        if ((!string.IsNullOrEmpty(origin) && origin != publicOrigin) || (context.Request.Method != "GET" && (context.Request.Method != "POST" || origin != publicOrigin))) { context.Response.StatusCode = 403; return; }
        var path = remainder.HasValue ? remainder.Value! : "/";
        if (path.Contains("..") || path.Contains('\\') || path.StartsWith("//")) { context.Response.StatusCode = 400; return; }
        if (render && (context.Request.Method != "GET" || !System.Text.RegularExpressions.Regex.IsMatch(path, "^/artifact/[a-f0-9]{64}$"))) { context.Response.StatusCode = 404; return; }
        using var request = new HttpRequestMessage(new HttpMethod(context.Request.Method), (render ? "http://127.0.0.1:5451" : "http://127.0.0.1:5450") + path + context.Request.QueryString);
        if (path.StartsWith("/api/", StringComparison.Ordinal) || (cloud && render)) {
            request.Headers.Add("X-Banking-Session", context.Request.Cookies[BrowserSessions.Cookie]);
            request.Headers.Add("X-Banking-Mode", mode);
            if (cloud) request.Headers.Add("X-Banking-Scope", mode == "Live" ? "owner-live" : Vault.Hash(context.Request.Cookies[BrowserSessions.Cookie]!).ToLowerInvariant());
            foreach (var header in new[] { "X-Banking-From", "X-Banking-To", "X-Banking-Currency" })
                if (context.Request.Headers.TryGetValue(header, out var value)) request.Headers.TryAddWithoutValidation(header, value.ToString());
        }
        if (context.Request.Method == "POST") {
            request.Content = new StreamContent(context.Request.Body);
            request.Content.Headers.TryAddWithoutValidation("Content-Type", context.Request.ContentType);
            request.Headers.TryAddWithoutValidation("Origin", publicOrigin);
        }
        var cookie = context.Request.Cookies["banking_advisor_demo"];
        if (cookie is { Length: 64 } && cookie.All(Uri.IsHexDigit)) request.Headers.TryAddWithoutValidation("Cookie", "banking_advisor_demo=" + cookie);
        try {
            using var client = clients.CreateClient("LocalAdvisorProxy");
            using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, context.RequestAborted);
            context.Response.StatusCode = (int)response.StatusCode;
            foreach (var name in new[] { "Content-Security-Policy", "Cache-Control", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy" })
                if (response.Headers.TryGetValues(name, out var values)) context.Response.Headers[name] = values.ToArray();
            if (response.Headers.TryGetValues("Set-Cookie", out var cookies)) foreach (var value in cookies)
                context.Response.Headers.Append("Set-Cookie", value.Replace("Path=/api", "Path=/advisor/api").Replace("Path=/;", "Path=/advisor/;") + "; Secure");
            context.Response.ContentType = response.Content.Headers.ContentType?.ToString();
            await response.Content.CopyToAsync(context.Response.Body, context.RequestAborted);
        } catch (HttpRequestException) {
            context.Response.StatusCode = 503;
            await context.Response.WriteAsync(cloud
                ? "The advisor service is temporarily unavailable. Retry shortly."
                : "The local advisor is offline. Start scripts/Start-OverviewAdvisor.ps1 and refresh.");
        }
    }
}
