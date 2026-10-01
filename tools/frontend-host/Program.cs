using System.Net;
using System.Net.Http.Headers;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.StaticFiles;

namespace Banking.FrontendHost;

internal static class Program
{
    public static async Task Main(string[] args)
    {
        var port = FrontendHostOptions.ReadPort(args);
        var repoRoot = FrontendHostOptions.FindRepositoryRoot(AppContext.BaseDirectory);
        var options = FrontendHostOptions.Create(repoRoot, port);
        var builder = WebApplication.CreateBuilder(args);
        FrontendHostApplication.ConfigureListener(builder, options);
        var app = FrontendHostApplication.Build(builder, options);
        app.Logger.LogInformation("Local Banking frontend transport listening on {Origin}; API target is fixed to {ApiOrigin}.", options.LocalOrigin, ProductionApi.Origin);
        await app.RunAsync();
    }
}

internal sealed record FrontendHostOptions(
    int Port,
    string RepositoryRoot,
    string MainAssetsRoot,
    string AdvisorAssetsRoot,
    bool ConfigureHttpsListener,
    Func<HttpMessageHandler> UpstreamHandlerFactory)
{
    public string LocalOrigin => $"https://localhost:{Port}";

    public static FrontendHostOptions Create(string repoRoot, int port) => new(
        port,
        repoRoot,
        Path.Combine(repoRoot, "src", "Banking.Api", "wwwroot"),
        Path.Combine(repoRoot, "prototypes", "advisor", "public"),
        true,
        static () => new SocketsHttpHandler
        {
            AllowAutoRedirect = false,
            UseCookies = false,
            AutomaticDecompression = DecompressionMethods.None,
            ConnectTimeout = TimeSpan.FromSeconds(10)
        });

    public static int ReadPort(string[] args)
    {
        var port = 5443;
        for (var index = 0; index < args.Length; index++)
        {
            if (args[index] == "--port" && index + 1 < args.Length && int.TryParse(args[index + 1], out var parsed))
            {
                port = parsed;
                index++;
                continue;
            }
            if (args[index].StartsWith("--port=", StringComparison.Ordinal) && int.TryParse(args[index][7..], out parsed))
            {
                port = parsed;
                continue;
            }
            throw new InvalidOperationException("Only --port 5443 or --port 5444 is supported. The upstream API cannot be changed from the command line.");
        }

        if (port is not (5443 or 5444))
            throw new InvalidOperationException("The frontend host supports only loopback ports 5443 and 5444.");
        return port;
    }

    public static string FindRepositoryRoot(string startPath)
    {
        for (var current = new DirectoryInfo(startPath); current is not null; current = current.Parent)
        {
            if (File.Exists(Path.Combine(current.FullName, "Banking.sln"))
                && Directory.Exists(Path.Combine(current.FullName, "src", "Banking.Api", "wwwroot"))
                && Directory.Exists(Path.Combine(current.FullName, "prototypes", "advisor", "public")))
                return current.FullName;
        }
        throw new InvalidOperationException("Could not locate the Banking repository assets. Run scripts/Start-Frontend.ps1 from a complete Banking checkout.");
    }
}

internal static class ProductionApi
{
    // Fixed by the confirmed shared-production-backend decision. Never read from a setting or request.
    public static readonly Uri Origin = new("https://banking-dan-0ac7d719.azurewebsites.net");
}

internal static class FrontendHostApplication
{
    private const string MainContentSecurityPolicy = "default-src 'self'; script-src 'self'; style-src 'self' 'sha256-UjmwW5hqkbmZat2z0a4MIudqMdHHunQ57o+t2nldQPQ='; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; frame-src 'self' https://www.tradingview-widget.com";
    private const string AdvisorContentSecurityPolicy = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; media-src 'self' blob:; connect-src 'self'; frame-src 'self'; base-uri 'none'; object-src 'none'; form-action 'none'; frame-ancestors 'self'";
    private const string DevSessionCookie = "__Host-Banking.FrontendProxy";
    private const string ApiSessionCookie = "__Host-Banking.Local";
    private const string DevAdvisorCookie = "banking_frontend_advisor";
    private const string ApiAdvisorCookie = "banking_advisor_demo";
    private static readonly HashSet<string> UnsafeMethods = new(StringComparer.OrdinalIgnoreCase) { "POST", "PUT", "DELETE" };

    private static readonly IReadOnlyDictionary<string, string> MainAssets = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["/"] = "index.html", ["/index.html"] = "index.html", ["/app.js"] = "app.js",
        ["/auth-ui.js"] = "auth-ui.js", ["/budget-ui.js"] = "budget-ui.js", ["/charts.js"] = "charts.js",
        ["/visuals.css"] = "visuals.css", ["/i18n.js"] = "i18n.js", ["/styles.css"] = "styles.css",
        ["/favicon.svg"] = "favicon.svg", ["/advisor-glass.js"] = "advisor-glass.js",
        ["/vendor/liquid-glass/liquid-glass.js"] = "vendor/liquid-glass/liquid-glass.js",
        ["/vendor/lightweight-charts-5.2.0.js"] = "vendor/lightweight-charts-5.2.0.js",
        ["/loans-ui.js"] = "loans-ui.js", ["/ai-workspace-ui.js"] = "ai-workspace-ui.js",
        ["/ai-workspace.css"] = "ai-workspace.css", ["/wealth.css"] = "wealth.css", ["/wealth-ui.js"] = "wealth-ui.js", ["/saxo-session.js"] = "saxo-session.js",
        ["/voice-companion.css"] = "voice-companion.css", ["/overview-advisor.js"] = "overview-advisor.js",
        ["/loading-ui.js"] = "loading-ui.js", ["/loading.css"] = "loading.css", ["/goals-ui.js"] = "goals-ui.js",
        ["/goals.css"] = "goals.css", ["/overview.js"] = "overview.js", ["/overview.css"] = "overview.css",
        ["/bank-details-ui.js"] = "bank-details-ui.js", ["/accounts-ui.js"] = "accounts-ui.js",
        ["/accounts.css"] = "accounts.css", ["/budget.css"] = "budget.css", ["/markets-ui.js"] = "markets-ui.js",
        ["/markets.css"] = "markets.css", ["/assets/goal-car.webp"] = "assets/goal-car.webp",
        ["/assets/goal-summer-house.webp"] = "assets/goal-summer-house.webp",
        ["/assets/overview-morning.webp"] = "assets/overview-morning.webp",
        ["/assets/overview-afternoon.webp"] = "assets/overview-afternoon.webp",
        ["/assets/overview-evening.webp"] = "assets/overview-evening.webp"
    };

    private static readonly IReadOnlyDictionary<string, string> AdvisorAssets = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["/advisor/"] = "index.html", ["/advisor/index.html"] = "index.html", ["/advisor/app.js"] = "app.js",
        ["/advisor/conversations.js"] = "conversations.js", ["/advisor/voice.js"] = "voice.js",
        ["/advisor/voice-transcript.js"] = "voice-transcript.js", ["/advisor/i18n.js"] = "i18n.js",
        ["/advisor/styles.css"] = "styles.css", ["/advisor/overview-effects.js"] = "overview-effects.js",
        ["/advisor/overview-effects.css"] = "overview-effects.css",
        ["/advisor/icons/arrow-up-right.svg"] = "icons/arrow-up-right.svg", ["/advisor/icons/arrow-up.svg"] = "icons/arrow-up.svg",
        ["/advisor/icons/arrows-maximize.svg"] = "icons/arrows-maximize.svg", ["/advisor/icons/arrows-minimize.svg"] = "icons/arrows-minimize.svg",
        ["/advisor/icons/grid-dots.svg"] = "icons/grid-dots.svg", ["/advisor/icons/grip-vertical.svg"] = "icons/grip-vertical.svg",
        ["/advisor/icons/layout-sidebar-left-expand.svg"] = "icons/layout-sidebar-left-expand.svg",
        ["/advisor/icons/message-circle.svg"] = "icons/message-circle.svg", ["/advisor/icons/microphone.svg"] = "icons/microphone.svg",
        ["/advisor/icons/plus.svg"] = "icons/plus.svg", ["/advisor/icons/send.svg"] = "icons/send.svg",
        ["/advisor/icons/settings.svg"] = "icons/settings.svg", ["/advisor/icons/waveform.svg"] = "icons/waveform.svg"
    };

    public static void ConfigureListener(WebApplicationBuilder builder, FrontendHostOptions options)
    {
        if (!options.ConfigureHttpsListener)
            return;
        builder.WebHost.ConfigureKestrel(server =>
        {
            server.AddServerHeader = false;
            server.ListenLocalhost(options.Port, listen => listen.UseHttps());
        });
    }

    public static WebApplication Build(WebApplicationBuilder builder, FrontendHostOptions options)
    {
        if (!Directory.Exists(options.MainAssetsRoot) || !Directory.Exists(options.AdvisorAssetsRoot))
            throw new InvalidOperationException("The local Banking or advisor frontend asset directory is missing.");

        builder.Logging.AddFilter("Microsoft.AspNetCore.Hosting.Diagnostics", LogLevel.Warning);
        builder.Logging.AddFilter("System.Net.Http.HttpClient", LogLevel.Warning);
        builder.Services.AddSingleton(options);
        builder.Services.AddHttpClient("fixed-production-api", client =>
        {
            client.BaseAddress = ProductionApi.Origin;
            client.Timeout = Timeout.InfiniteTimeSpan;
        }).ConfigurePrimaryHttpMessageHandler(options.UpstreamHandlerFactory);

        var app = builder.Build();
        app.Use(async (context, next) =>
        {
            if (!RequestBoundary.TryValidate(context, options, out var rejection))
            {
                context.Response.StatusCode = rejection;
                return;
            }
            await next(context);
        });

        app.MapGet("/__frontend/health", () => Results.Json(new { status = "running", mode = "frontend-transport", upstream = ProductionApi.Origin.Host }));
        app.MapMethods("/health", ["GET", "HEAD"], context => ProxyAsync(context, options));
        app.MapMethods("/legal/privacy", ["GET", "HEAD"], context => ProxyAsync(context, options));
        app.MapMethods("/legal/terms", ["GET", "HEAD"], context => ProxyAsync(context, options));
        app.MapMethods("/api/{**path}", ["GET", "HEAD", "POST", "PUT", "DELETE"], context => ProxyAsync(context, options));
        app.MapMethods("/advisor/api/{**path}", ["GET", "HEAD", "POST", "PUT", "DELETE"], context => ProxyAsync(context, options));
        app.MapMethods("/advisor-render/artifact/{id}", ["GET", "HEAD"], context => ProxyAsync(context, options));
        app.MapMethods("/advisor/theme.css", ["GET", "HEAD"], context => ServeAdvisorThemeAsync(context, options));
        app.MapMethods("/advisor/scene.webp", ["GET", "HEAD"], context => ServeStaticAsync(context, options.MainAssetsRoot, "assets/overview-evening.webp", true));

        foreach (var (url, relativePath) in MainAssets)
            app.MapMethods(url, ["GET", "HEAD"], context => ServeStaticAsync(context, options.MainAssetsRoot, relativePath, false));
        foreach (var (url, relativePath) in AdvisorAssets)
            app.MapMethods(url, ["GET", "HEAD"], context => ServeStaticAsync(context, options.AdvisorAssetsRoot, relativePath, true));

        app.MapFallback(context =>
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            return Task.CompletedTask;
        });
        return app;
    }

    private static async Task ServeStaticAsync(HttpContext context, string root, string relativePath, bool advisor)
    {
        var fullPath = Path.GetFullPath(Path.Combine(root, relativePath.Replace('/', Path.DirectorySeparatorChar)));
        var rootPath = Path.GetFullPath(root) + Path.DirectorySeparatorChar;
        if (!fullPath.StartsWith(rootPath, StringComparison.OrdinalIgnoreCase) || !File.Exists(fullPath))
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }

        if (!ContentTypes.TryGetContentType(fullPath, out var contentType))
        {
            context.Response.StatusCode = StatusCodes.Status415UnsupportedMediaType;
            return;
        }

        context.Response.ContentType = contentType;
        context.Response.Headers.CacheControl = "no-cache";
        context.Response.Headers["X-Content-Type-Options"] = "nosniff";
        context.Response.Headers["Referrer-Policy"] = "no-referrer";
        if (Path.GetExtension(fullPath).Equals(".html", StringComparison.OrdinalIgnoreCase))
            context.Response.Headers["Content-Security-Policy"] = advisor ? AdvisorContentSecurityPolicy : MainContentSecurityPolicy;
        var file = new FileInfo(fullPath);
        context.Response.ContentLength = file.Length;
        if (HttpMethods.IsHead(context.Request.Method))
            return;
        await using var stream = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, FileOptions.Asynchronous | FileOptions.SequentialScan);
        await stream.CopyToAsync(context.Response.Body, context.RequestAborted);
    }

    private static async Task ServeAdvisorThemeAsync(HttpContext context, FrontendHostOptions options)
    {
        var file = Path.Combine(options.MainAssetsRoot, "styles.css");
        if (!File.Exists(file))
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }
        var lines = await File.ReadAllLinesAsync(file, context.RequestAborted);
        context.Response.ContentType = "text/css; charset=utf-8";
        context.Response.Headers.CacheControl = "no-cache";
        context.Response.Headers["X-Content-Type-Options"] = "nosniff";
        context.Response.Headers["Referrer-Policy"] = "no-referrer";
        if (!HttpMethods.IsHead(context.Request.Method))
            await context.Response.WriteAsync(string.Join(Environment.NewLine, lines.Take(5)), context.RequestAborted);
    }

    private static async Task ProxyAsync(HttpContext context, FrontendHostOptions options)
    {
        var path = context.Request.Path.Value ?? "/";
        if (!RequestBoundary.IsCanonicalPath(path) || !ProxyRoute.IsAllowed(path, context.Request.Method))
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }

        var upstream = context.RequestServices.GetRequiredService<IHttpClientFactory>().CreateClient("fixed-production-api");
        var target = ProductionApi.Origin.GetLeftPart(UriPartial.Authority) + path + context.Request.QueryString;
        using var request = new HttpRequestMessage(new HttpMethod(context.Request.Method), target);
        CopyAllowedRequestHeaders(context, request, path, options.Port);
        if (HasBody(context.Request.Method))
        {
            request.Content = new StreamContent(context.Request.Body);
            if (!string.IsNullOrWhiteSpace(context.Request.ContentType))
                request.Content.Headers.ContentType = MediaTypeHeaderValue.Parse(context.Request.ContentType);
            if (context.Request.ContentLength is long length)
                request.Content.Headers.ContentLength = length;
        }

        try
        {
            using var response = await upstream.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, context.RequestAborted);
            context.Response.StatusCode = (int)response.StatusCode;
            CopyResponseHeaders(response, context.Response, options, path);
            if (HttpMethods.IsHead(context.Request.Method) || response.Content is null)
                return;
            await response.Content.CopyToAsync(context.Response.Body, context.RequestAborted);
        }
        catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
        {
            // Client disconnects cancel the upstream request and response stream.
        }
        catch (OperationCanceledException)
        {
            if (context.Response.HasStarted)
                return;
            context.Response.Clear();
            context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
            context.Response.ContentType = "application/json; charset=utf-8";
            await context.Response.WriteAsync("{\"error\":\"PRODUCTION_API_UNAVAILABLE\",\"message\":\"The deployed Banking service is unavailable. This frontend has no local data fallback.\"}", context.RequestAborted);
        }
        catch (HttpRequestException)
        {
            if (context.Response.HasStarted)
                return;
            context.Response.Clear();
            context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
            context.Response.ContentType = "application/json; charset=utf-8";
            await context.Response.WriteAsync("{\"error\":\"PRODUCTION_API_UNAVAILABLE\",\"message\":\"The deployed Banking service is unavailable. This frontend has no local data fallback.\"}", context.RequestAborted);
        }
    }

    private static void CopyAllowedRequestHeaders(HttpContext context, HttpRequestMessage request, string path, int port)
    {
        var inbound = context.Request.Headers;
        foreach (var name in new[] { "Accept", "Accept-Language", "Cache-Control", "Pragma", "If-None-Match", "If-Modified-Since", "If-Match", "If-Unmodified-Since", "Range", "If-Range", "Last-Event-ID" })
            if (inbound.TryGetValue(name, out var value)) request.Headers.TryAddWithoutValidation(name, value.ToArray());

        if (inbound.TryGetValue("X-Banking-Client", out var client) && client.Count == 1 && client[0] == "web")
            request.Headers.TryAddWithoutValidation("X-Banking-Client", "web");
        if (inbound.TryGetValue("X-Banking-Mode", out var mode) && mode.Count == 1 && mode[0] is "Demo" or "Live")
            request.Headers.TryAddWithoutValidation("X-Banking-Mode", mode[0]);
        foreach (var name in new[] { "X-Banking-From", "X-Banking-To", "X-Banking-Currency" })
            if (inbound.TryGetValue(name, out var value) && value.Count == 1 && value[0]?.Length <= 32)
                request.Headers.TryAddWithoutValidation(name, value[0]);

        var cookies = CookieBoundary.BuildUpstreamCookie(context.Request.Headers.Cookie, path, port);
        if (cookies is not null)
            request.Headers.TryAddWithoutValidation("Cookie", cookies);
        if (inbound.ContainsKey("Origin"))
            request.Headers.TryAddWithoutValidation("Origin", ProductionApi.Origin.GetLeftPart(UriPartial.Authority));
    }

    private static void CopyResponseHeaders(HttpResponseMessage response, HttpResponse target, FrontendHostOptions options, string requestPath)
    {
        foreach (var header in new[] { "Cache-Control", "ETag", "Last-Modified", "Retry-After", "WWW-Authenticate", "X-Banking-Mode", "Vary", "Content-Security-Policy", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy", "Content-Disposition", "Content-Range", "Accept-Ranges", "Content-Encoding", "Content-Language" })
        {
            if (response.Headers.TryGetValues(header, out var values)) target.Headers[header] = values.ToArray();
            else if (response.Content?.Headers.TryGetValues(header, out values) == true) target.Headers[header] = values.ToArray();
        }

        if (response.Content?.Headers.ContentType is { } contentType)
            target.ContentType = contentType.ToString();
        if (response.Content?.Headers.ContentLength is long length)
            target.ContentLength = length;
        if (response.Headers.TryGetValues("Set-Cookie", out var setCookies))
        {
            foreach (var cookie in setCookies)
            {
                if (CookieBoundary.TryMapDownstreamCookie(cookie, options.Port, out var mapped))
                    target.Headers.Append("Set-Cookie", mapped);
            }
        }

        if (response.Headers.Location is { } location && TryMapLocation(location, options.LocalOrigin, out var mappedLocation))
            target.Headers.Location = mappedLocation;

        target.Headers["X-Content-Type-Options"] = "nosniff";
        target.Headers["Referrer-Policy"] = "no-referrer";
        if (requestPath.StartsWith("/advisor-render/", StringComparison.Ordinal))
            target.Headers["Cache-Control"] = "no-store";
    }

    private static bool TryMapLocation(Uri location, string localOrigin, out string mapped)
    {
        mapped = string.Empty;
        if (!location.IsAbsoluteUri)
        {
            var relative = location.OriginalString;
            if (relative.StartsWith('/')
                && !relative.StartsWith("//", StringComparison.Ordinal)
                && !relative.Contains('\\')
                && !relative.Any(char.IsControl)
                && Uri.TryCreate(new Uri(localOrigin, UriKind.Absolute), relative, out var resolved)
                && string.Equals(resolved.GetLeftPart(UriPartial.Authority), localOrigin, StringComparison.OrdinalIgnoreCase))
            {
                mapped = relative;
                return true;
            }
            return false;
        }
        if (!string.Equals(location.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) || !string.IsNullOrEmpty(location.UserInfo))
            return false;
        if (string.Equals(location.GetLeftPart(UriPartial.Authority), ProductionApi.Origin.GetLeftPart(UriPartial.Authority), StringComparison.OrdinalIgnoreCase))
        {
            mapped = localOrigin + location.PathAndQuery + location.Fragment;
            return true;
        }
        return false;
    }

    private static bool HasBody(string method) => UnsafeMethods.Contains(method);

    private static class ContentTypes
    {
        private static readonly FileExtensionContentTypeProvider Provider = new();
        public static bool TryGetContentType(string path, out string contentType)
        {
            if (Provider.TryGetContentType(path, out var value))
            {
                contentType = value;
                return true;
            }
            contentType = string.Empty;
            return false;
        }
    }
}

internal static class ProxyRoute
{
    public static bool IsAllowed(string path, string method)
    {
        var methodAllowed = method is "GET" or "HEAD" or "POST" or "PUT" or "DELETE";
        if (!methodAllowed)
            return false;
        if (path is "/health" or "/legal/privacy" or "/legal/terms")
            return method is "GET" or "HEAD";
        if (path.StartsWith("/api/", StringComparison.Ordinal) || path.StartsWith("/advisor/api/", StringComparison.Ordinal))
            return true;
        if (path.StartsWith("/advisor-render/artifact/", StringComparison.Ordinal) && method is "GET" or "HEAD")
        {
            var id = path["/advisor-render/artifact/".Length..];
            return id.Length == 64 && id.All(character => character is >= '0' and <= '9' or >= 'a' and <= 'f');
        }
        return false;
    }
}

internal static class RequestBoundary
{
    private static readonly HashSet<string> UnsafeMethods = new(StringComparer.OrdinalIgnoreCase) { "POST", "PUT", "DELETE" };

    public static bool TryValidate(HttpContext context, FrontendHostOptions options, out int rejectionStatus)
    {
        rejectionStatus = StatusCodes.Status403Forbidden;
        if (!context.Request.IsHttps
            || !string.Equals(context.Request.Host.Host, "localhost", StringComparison.OrdinalIgnoreCase)
            || context.Request.Host.Port != options.Port)
            return false;

        var remote = context.Connection.RemoteIpAddress;
        if (remote is not null && !IPAddress.IsLoopback(remote))
            return false;

        var origin = context.Request.Headers.Origin;
        if (origin.Count > 1 || (origin.Count == 1 && !string.Equals(origin[0], options.LocalOrigin, StringComparison.OrdinalIgnoreCase)))
            return false;

        var fetchSite = context.Request.Headers["Sec-Fetch-Site"];
        if (fetchSite.Count > 1)
            return false;
        if (fetchSite.Count == 1)
        {
            var site = fetchSite[0];
            if (site == "cross-site")
            {
                var safeTopLevelNavigation = context.Request.Method is "GET" or "HEAD"
                    && context.Request.Headers["Sec-Fetch-Mode"] == "navigate"
                    && context.Request.Headers["Sec-Fetch-Dest"] == "document"
                    && origin.Count == 0;
                if (!safeTopLevelNavigation)
                    return false;
            }
            else if (site is not ("same-origin" or "none"))
                return false;
            if (UnsafeMethods.Contains(context.Request.Method) && site != "same-origin")
                return false;
        }

        if (UnsafeMethods.Contains(context.Request.Method) && (origin.Count != 1 || !string.Equals(origin[0], options.LocalOrigin, StringComparison.OrdinalIgnoreCase)))
            return false;

        var rawTarget = context.Features.Get<IHttpRequestFeature>()?.RawTarget;
        var rawPath = string.IsNullOrEmpty(rawTarget) ? null : rawTarget.Split('?', 2)[0];
        if ((rawPath is not null && !IsCanonicalPath(rawPath)) || !IsCanonicalPath(context.Request.Path.Value ?? "/"))
        {
            rejectionStatus = StatusCodes.Status400BadRequest;
            return false;
        }
        return true;
    }

    public static bool IsCanonicalPath(string path)
    {
        if (path.Length == 0 || path[0] != '/' || path.StartsWith("//", StringComparison.Ordinal) || path.Contains('%') || path.Contains('\\') || path.Contains('\0'))
            return false;
        foreach (var segment in path.Split('/'))
            if (segment is "." or "..")
                return false;
        return true;
    }
}

internal static class CookieBoundary
{
    public static string? BuildUpstreamCookie(string? rawCookie, string requestPath, int port)
    {
        if (string.IsNullOrWhiteSpace(rawCookie))
            return null;
        var parsed = ParseRequestCookies(rawCookie);
        var isApi = requestPath.StartsWith("/api/", StringComparison.Ordinal) || requestPath.StartsWith("/advisor/api/", StringComparison.Ordinal) || requestPath.StartsWith("/advisor-render/", StringComparison.Ordinal);
        if (!isApi)
            return null;

        var output = new List<string>(2);
        if (parsed.TryGetValue(FrontendSessionCookieName(port), out var session) && IsOpaqueHex(session))
            output.Add($"{ApiSessionCookie}={session}");
        if (requestPath.StartsWith("/advisor/api/", StringComparison.Ordinal)
            && parsed.TryGetValue(DevAdvisorCookieName(port), out var advisor) && IsOpaqueHex(advisor))
            output.Add($"{ApiAdvisorCookie}={advisor}");
        return output.Count == 0 ? null : string.Join("; ", output);
    }

    public static bool TryMapDownstreamCookie(string rawCookie, int port, out string mapped)
    {
        mapped = string.Empty;
        var parts = rawCookie.Split(';', StringSplitOptions.TrimEntries);
        if (parts.Length == 0)
            return false;
        var separator = parts[0].IndexOf('=');
        if (separator <= 0)
            return false;
        var name = parts[0][..separator].Trim();
        var value = parts[0][(separator + 1)..].Trim();
        if (name is not (ApiSessionCookie or ApiAdvisorCookie))
            return false;
        if (value.Length > 0 && !IsOpaqueHex(value))
            return false;

        var attributes = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        var flags = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var part in parts.Skip(1))
        {
            if (string.IsNullOrEmpty(part)) continue;
            var equals = part.IndexOf('=');
            if (equals < 0) flags.Add(part.Trim());
            else attributes[part[..equals].Trim()] = part[(equals + 1)..].Trim();
        }
        if (attributes.ContainsKey("Domain"))
            return false;
        if (!flags.Contains("Secure") || !flags.Contains("HttpOnly") || !string.Equals(attributes.GetValueOrDefault("SameSite"), "Strict", StringComparison.OrdinalIgnoreCase))
            return false;

        string localName;
        string expectedPath;
        if (name == ApiSessionCookie)
        {
            localName = FrontendSessionCookieName(port);
            expectedPath = "/";
        }
        else
        {
            localName = DevAdvisorCookieName(port);
            expectedPath = attributes.GetValueOrDefault("Path") ?? string.Empty;
            if (expectedPath is not ("/advisor/api" or "/advisor/"))
                return false;
        }
        if (!string.Equals(attributes.GetValueOrDefault("Path"), expectedPath, StringComparison.Ordinal))
            return false;

        var expiry = attributes.TryGetValue("Max-Age", out var age) ? $"; Max-Age={age}" : string.Empty;
        var expires = attributes.TryGetValue("Expires", out var date) ? $"; Expires={date}" : string.Empty;
        var path = name == ApiSessionCookie ? "/" : expectedPath;
        mapped = $"{localName}={value}; Path={path}; Secure; HttpOnly; SameSite=Strict{expiry}{expires}";
        return true;
    }

    private static Dictionary<string, string> ParseRequestCookies(string rawCookie)
    {
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var part in rawCookie.Split(';', StringSplitOptions.TrimEntries))
        {
            if (part.Length == 0) continue;
            var equals = part.IndexOf('=');
            if (equals <= 0) continue;
            var name = part[..equals].Trim();
            var value = part[(equals + 1)..].Trim();
            if (name.Length == 0 || result.ContainsKey(name))
                return new Dictionary<string, string>(StringComparer.Ordinal);
            result[name] = value;
        }
        return result;
    }

    private static bool IsOpaqueHex(string value) => value.Length == 64 && value.All(Uri.IsHexDigit);

    private const string ApiSessionCookie = "__Host-Banking.Local";
    private const string ApiAdvisorCookie = "banking_advisor_demo";
    public static string FrontendSessionCookieName(int port) => $"__Host-Banking.FrontendProxy.{port}";
    public static string DevAdvisorCookieName(int port) => $"banking_frontend_advisor_{port}";
}
