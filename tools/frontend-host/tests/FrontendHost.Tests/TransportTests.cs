using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Text;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Banking.FrontendHost;

namespace FrontendHost.Tests;

public sealed class TransportTests : IAsyncLifetime
{
    [Fact]
    public async Task EmployeeStockModuleAndBinaryPreviewUseSharedPrivateApiBoundary()
    {
        using var module=await client.GetAsync("/employee-stock-ui.js");Assert.Equal(HttpStatusCode.OK,module.StatusCode);
        Assert.Contains("mountEmployeeStockPreview",await module.Content.ReadAsStringAsync());
        upstream.Responder=request=>{
            Assert.Equal("/api/employee-stocks/preview",request.Uri.AbsolutePath);Assert.Equal("Live",request.GetValues("X-Banking-Mode").Single());
            var response=new HttpResponseMessage(HttpStatusCode.OK){Content=new StringContent("{}",Encoding.UTF8,"application/json")};
            response.Headers.CacheControl=new(){NoStore=true,Private=true};return response;
        };
        using var upload=new HttpRequestMessage(HttpMethod.Post,"/api/employee-stocks/preview"){Content=new ByteArrayContent([80,75,3,4,0,255])};
        upload.Content.Headers.ContentType=new("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        upload.Headers.Add("X-Banking-Client","web");upload.Headers.Add("X-Banking-Mode","Live");upload.Headers.Add("Origin",Origin);
        using var result=await client.SendAsync(upload);Assert.Equal(HttpStatusCode.OK,result.StatusCode);Assert.True(result.Headers.CacheControl!.NoStore);
    }
    [Fact]
    public async Task PensionModuleAndLargePdfUploadAndPrivateDownloadUseSharedApiBoundary()
    {
        using var module = await client.GetAsync("/pension-import-ui.js");
        Assert.Equal(HttpStatusCode.OK, module.StatusCode);
        Assert.Contains("mountPensionImports", await module.Content.ReadAsStringAsync());
        var pdf = "%PDF-" + new string('A', 100000);
        upstream.Responder = request => {
            if(request.Uri.AbsolutePath.EndsWith("/original",StringComparison.Ordinal)) {
                var response=new HttpResponseMessage(HttpStatusCode.OK) {Content=new StringContent(pdf,Encoding.ASCII,"application/pdf")};
                response.Headers.CacheControl=new CacheControlHeaderValue {NoStore=true,Private=true};
                response.Content.Headers.ContentDisposition=new ContentDispositionHeaderValue("attachment") {FileName="PensionsInfo-report.pdf"};
                response.Headers.Add("X-Banking-Mode","Live");return response;
            }
            Assert.Equal(pdf,request.Body);Assert.Equal("Live",request.GetValues("X-Banking-Mode").Single());
            return new HttpResponseMessage(HttpStatusCode.OK) {Content=new StringContent("{}",Encoding.UTF8,"application/json")};
        };
        using var upload=new HttpRequestMessage(HttpMethod.Post,"/api/pension/uploads") {Content=new StringContent(pdf,Encoding.ASCII,"application/pdf")};
        upload.Headers.Add("X-Banking-Client","web");upload.Headers.Add("X-Banking-Mode","Live");upload.Headers.Add("Origin",Origin);
        using var accepted=await client.SendAsync(upload);Assert.Equal(HttpStatusCode.OK,accepted.StatusCode);
        using var original=await client.GetAsync("/api/pension/uploads/00000000-0000-0000-0000-000000000001/original");
        Assert.Equal("application/pdf",original.Content.Headers.ContentType!.MediaType);
        Assert.Equal("attachment",original.Content.Headers.ContentDisposition!.DispositionType);
        Assert.True(original.Headers.CacheControl!.NoStore);Assert.True(original.Headers.CacheControl.Private);
        Assert.Equal(pdf,await original.Content.ReadAsStringAsync());
    }
    [Fact]
    public async Task Main_assets_allow_only_exact_old_and_current_annotation_styles()
    {
        using var response = await client.GetAsync("/");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var policy = response.Headers.GetValues("Content-Security-Policy").Single();
        foreach (var hash in new[] {
            "UjmwW5hqkbmZat2z0a4MIudqMdHHunQ57o+t2nldQPQ=",
            "WO55anZ1V8A0G22bY2t72RV4dI79SLI4VnYLgsEeWUc=",
            "OUoShR0c3lqWNHEaHdorwfYnp/0EJHI/7QhTEUtan9w=",
            "6ddE/BE/E7OfXOyznfBSKxo7Dfm3OMuxy0O5a2y6TqI=" })
            Assert.Contains("'sha256-" + hash + "'", policy);
        Assert.Contains("script-src 'self';", policy);
        Assert.Contains("frame-ancestors 'none';", policy);
        Assert.DoesNotContain("unsafe-", policy);
    }

    private const int Port = 5444;
    private const string Origin = "https://localhost:5444";
    private readonly CaptureHandler upstream = new();
    private WebApplication app = null!;
    private HttpClient client = null!;

    public async Task InitializeAsync()
    {
        var repoRoot = FrontendHostOptions.FindRepositoryRoot(AppContext.BaseDirectory);
        var baseOptions = FrontendHostOptions.Create(repoRoot, Port);
        var options = baseOptions with
        {
            ConfigureHttpsListener = false,
            UpstreamHandlerFactory = () => upstream
        };
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            ApplicationName = typeof(FrontendHostApplication).Assembly.FullName,
            EnvironmentName = "Testing",
            ContentRootPath = repoRoot
        });
        builder.WebHost.UseTestServer();
        app = FrontendHostApplication.Build(builder, options);
        await app.StartAsync();
        client = app.GetTestClient();
        client.BaseAddress = new Uri(Origin);
    }

    public async Task DisposeAsync()
    {
        client.Dispose();
        await app.DisposeAsync();
        upstream.Dispose();
    }

    [Fact]
    public async Task ApiRequestUsesFixedOriginAndForwardsOnlyApprovedContext()
    {
        upstream.Responder = request => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("{\"ok\":true}", Encoding.UTF8, "application/json")
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/runtime-info")
        {
            Content = new StringContent("{}", Encoding.UTF8, "application/json")
        };
        request.Headers.Add("Origin", Origin);
        request.Headers.Add("X-Banking-Client", "web");
        request.Headers.Add("X-Banking-Mode", "Demo");
        request.Headers.Add("X-Banking-Scope", "spoofed-scope");
        request.Headers.Add("X-Banking-Session", "spoofed-session");
        request.Headers.Add("X-Forwarded-Host", "attacker.example");
        request.Headers.TryAddWithoutValidation("Cookie", CookieBoundary.FrontendSessionCookieName(5444) + "=" + new string('A', 64)
            + "; " + CookieBoundary.FrontendSessionCookieName(5443) + "=" + new string('Z', 64)
            + "; __Host-Banking.Local=" + new string('B', 64) + "; ignored=secret");

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var sent = Assert.Single(upstream.Requests);
        Assert.Equal(new Uri(ProductionApi.Origin, "/api/runtime-info"), sent.Uri);
        Assert.Equal("https://banking-dan-0ac7d719.azurewebsites.net", sent.GetValues("Origin").Single());
        Assert.Equal("web", sent.GetValues("X-Banking-Client").Single());
        Assert.Equal("Demo", sent.GetValues("X-Banking-Mode").Single());
        Assert.Equal($"__Host-Banking.Local={new string('A', 64)}", sent.GetValues("Cookie").Single());
        Assert.DoesNotContain("X-Banking-Scope", sent.Headers.Keys);
        Assert.DoesNotContain("X-Banking-Session", sent.Headers.Keys);
        Assert.DoesNotContain("X-Forwarded-Host", sent.Headers.Keys);
        Assert.DoesNotContain("ignored", string.Join(";", sent.GetValues("Cookie")));
    }

    [Fact]
    public async Task AdvisorRequestsMapOnlyNamespacedCookiesAndForwardContext()
    {
        upstream.Responder = _ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("{}", Encoding.UTF8, "application/json")
        };
        using var request = new HttpRequestMessage(HttpMethod.Get, "/advisor/api/workspace?view=compact");
        request.Headers.Add("Origin", Origin);
        request.Headers.Add("X-Banking-Mode", "Demo");
        request.Headers.Add("X-Banking-Currency", "DKK");
        request.Headers.TryAddWithoutValidation("Cookie", CookieBoundary.FrontendSessionCookieName(5444) + "=" + new string('C', 64)
            + "; " + CookieBoundary.FrontendSessionCookieName(5443) + "=" + new string('E', 64)
            + "; " + CookieBoundary.DevAdvisorCookieName(5444) + "=" + new string('d', 64)
            + "; " + CookieBoundary.DevAdvisorCookieName(5443) + "=" + new string('f', 64)
            + "; __Host-Banking.Local=" + new string('E', 64)
            + "; banking_advisor_demo=" + new string('f', 64));

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var sent = Assert.Single(upstream.Requests);
        Assert.Equal(new Uri(ProductionApi.Origin, "/advisor/api/workspace?view=compact"), sent.Uri);
        Assert.Equal($"__Host-Banking.Local={new string('C', 64)}; banking_advisor_demo={new string('d', 64)}", sent.GetValues("Cookie").Single());
        Assert.Equal("DKK", sent.GetValues("X-Banking-Currency").Single());
    }

    [Fact]
    public async Task LoginCookiesAreNamespacedAndRetainHostOnlyProtection()
    {
        upstream.Responder = _ =>
        {
            var response = new HttpResponseMessage(HttpStatusCode.OK);
            response.Headers.TryAddWithoutValidation("Set-Cookie", "__Host-Banking.Local=" + new string('a', 64) + "; Path=/; Secure; HttpOnly; SameSite=Strict");
            response.Headers.TryAddWithoutValidation("Set-Cookie", "banking_advisor_demo=" + new string('b', 64) + "; Path=/advisor/api; Secure; HttpOnly; SameSite=Strict; Max-Age=2592000");
            response.Headers.TryAddWithoutValidation("Set-Cookie", "not-approved=token; Domain=azurewebsites.net; Path=/");
            return response;
        };
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/browser/sign-in")
        {
            Content = new StringContent("{}", Encoding.UTF8, "application/json")
        };
        request.Headers.Add("Origin", Origin);
        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var cookies = response.Headers.GetValues("Set-Cookie").ToArray();
        Assert.Contains(cookies, value => value == CookieBoundary.FrontendSessionCookieName(Port) + "=" + new string('a', 64) + "; Path=/; Secure; HttpOnly; SameSite=Strict");
        Assert.Contains(cookies, value => value == CookieBoundary.DevAdvisorCookieName(Port) + "=" + new string('b', 64) + "; Path=/advisor/api; Secure; HttpOnly; SameSite=Strict; Max-Age=2592000");
        Assert.DoesNotContain(cookies, value => value.Contains("Domain=", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(cookies, value => value.StartsWith("not-approved=", StringComparison.Ordinal));
    }

    [Fact]
    public async Task HostileOriginAndMissingPostOriginAreRejectedBeforeUpstream()
    {
        using var hostile = new HttpRequestMessage(HttpMethod.Post, "/api/runtime-info")
        {
            Content = new StringContent("{}", Encoding.UTF8, "application/json")
        };
        hostile.Headers.Add("Origin", "https://evil.example");
        using var hostileResponse = await client.SendAsync(hostile);
        Assert.Equal(HttpStatusCode.Forbidden, hostileResponse.StatusCode);

        using var missing = new HttpRequestMessage(HttpMethod.Post, "/api/runtime-info")
        {
            Content = new StringContent("{}", Encoding.UTF8, "application/json")
        };
        using var missingResponse = await client.SendAsync(missing);
        Assert.Equal(HttpStatusCode.Forbidden, missingResponse.StatusCode);
        Assert.Empty(upstream.Requests);
    }

    [Fact]
    public async Task CrossSiteSubresourcesAndUnexpectedHostAreRejectedButTopLevelReturnNavigationWorks()
    {
        using var crossSite = new HttpRequestMessage(HttpMethod.Get, "/api/runtime-info");
        crossSite.Headers.Add("Origin", Origin);
        crossSite.Headers.Add("Sec-Fetch-Site", "cross-site");
        using var crossResponse = await client.SendAsync(crossSite);
        Assert.Equal(HttpStatusCode.Forbidden, crossResponse.StatusCode);

        using var wrongHost = new HttpRequestMessage(HttpMethod.Get, "https://127.0.0.1:5444/api/runtime-info");
        using var hostResponse = await client.SendAsync(wrongHost);
        Assert.Equal(HttpStatusCode.Forbidden, hostResponse.StatusCode);
        Assert.Empty(upstream.Requests);

        using var navigation = new HttpRequestMessage(HttpMethod.Get, "/");
        navigation.Headers.Add("Sec-Fetch-Site", "cross-site");
        navigation.Headers.Add("Sec-Fetch-Mode", "navigate");
        navigation.Headers.Add("Sec-Fetch-Dest", "document");
        using var navigationResponse = await client.SendAsync(navigation);
        Assert.Equal(HttpStatusCode.OK, navigationResponse.StatusCode);
        Assert.Empty(upstream.Requests);
    }

    [Theory]
    [InlineData("/api/%2e%2e/index.html")]
    [InlineData("/api/foo/../index.html")]
    [InlineData("/api/foo%2fbar")]
    [InlineData("//banking.example/api/summary")]
    [InlineData("/api/foo\\bar")]
    public void NonCanonicalPathsAreRejected(string path)
    {
        Assert.False(RequestBoundary.IsCanonicalPath(path));
    }

    [Fact]
    public async Task MissingApiCannotFallThroughToFrontendIndex()
    {
        upstream.Responder = _ => new HttpResponseMessage(HttpStatusCode.NotFound)
        {
            Content = new StringContent("upstream-api-not-found", Encoding.UTF8, "text/plain")
        };

        using var response = await client.GetAsync("/api/missing");
        var body = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("upstream-api-not-found", body);
        Assert.Single(upstream.Requests);
        Assert.DoesNotContain("<!doctype html", body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task LocalAssetAllowlistServesChangedSourceButNotOtherRepositoryFiles()
    {
        using var asset = await client.GetAsync("/app.js");
        using var denied = await client.GetAsync("/assets/README.md");
        using var advisor = await client.GetAsync("/advisor/app.js");

        Assert.Equal(HttpStatusCode.OK, asset.StatusCode);
        Assert.Equal("no-cache", asset.Headers.CacheControl?.ToString());
        Assert.Equal(HttpStatusCode.NotFound, denied.StatusCode);
        Assert.Equal(HttpStatusCode.OK, advisor.StatusCode);
        using var theme = await client.GetAsync("/advisor/theme.css");
        using var scene = await client.GetAsync("/advisor/scene.webp");
        Assert.Equal(HttpStatusCode.OK, theme.StatusCode);
        Assert.StartsWith(":root", await theme.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        Assert.Equal(HttpStatusCode.OK, scene.StatusCode);
        Assert.Empty(upstream.Requests);
    }

    [Fact]
    public async Task LogoutDeletionClearsOnlyThePortScopedBrowserCookie()
    {
        upstream.Responder = _ =>
        {
            var response = new HttpResponseMessage(HttpStatusCode.NoContent);
            response.Headers.TryAddWithoutValidation("Set-Cookie", "__Host-Banking.Local=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0");
            return response;
        };
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/browser/logout")
        {
            Content = new StringContent("{}", Encoding.UTF8, "application/json")
        };
        request.Headers.Add("Origin", Origin);
        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(CookieBoundary.FrontendSessionCookieName(Port) + "=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0",
            Assert.Single(response.Headers.GetValues("Set-Cookie")));
    }

    [Fact]
    public async Task RendererRouteAcceptsOnlyOpaqueArtifactIdentifiersAndMapsAzureRedirectsLocally()
    {
        upstream.Responder = request =>
        {
            Assert.Equal(new Uri(ProductionApi.Origin, "/advisor-render/artifact/" + new string('a', 64)), request.Uri);
            var response = new HttpResponseMessage(HttpStatusCode.TemporaryRedirect);
            response.Headers.Location = new Uri(ProductionApi.Origin, "/advisor/");
            return response;
        };
        using var valid = await client.GetAsync("/advisor-render/artifact/" + new string('a', 64));
        using var invalid = await client.GetAsync("/advisor-render/artifact/%2f%2fexample.com");

        Assert.Equal(HttpStatusCode.TemporaryRedirect, valid.StatusCode);
        Assert.Equal(Origin + "/advisor/", valid.Headers.Location?.ToString());
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        Assert.Single(upstream.Requests);

        upstream.Responder = request =>
        {
            Assert.Equal(new Uri(ProductionApi.Origin, "/advisor-render/artifact/" + new string('b', 64) + "?mode=Demo"), request.Uri);
            var response = new HttpResponseMessage(HttpStatusCode.TemporaryRedirect);
            response.Headers.Location = new Uri("/advisor/", UriKind.Relative);
            return response;
        };
        using var relative = await client.GetAsync("/advisor-render/artifact/" + new string('b', 64) + "?mode=Demo");
        Assert.Equal(HttpStatusCode.TemporaryRedirect, relative.StatusCode);
        Assert.Equal("/advisor/", relative.Headers.Location?.ToString());
    }

    [Fact]
    public async Task UpstreamProviderAndUntrustedRedirectHostsAreNeverPassedThrough()
    {
        upstream.Responder = _ =>
        {
            var response = new HttpResponseMessage(HttpStatusCode.Found);
            response.Headers.Location = new Uri("https://sim.logonvalidation.net/authorize?state=fixture");
            return response;
        };
        using var providerResponse = await client.GetAsync("/api/investments/saxo/connect");
        Assert.Equal(HttpStatusCode.Found, providerResponse.StatusCode);
        Assert.Null(providerResponse.Headers.Location);

        upstream.Responder = _ =>
        {
            var response = new HttpResponseMessage(HttpStatusCode.Found);
            response.Headers.Location = new Uri("https://attacker.example/phishing");
            return response;
        };
        using var untrustedResponse = await client.GetAsync("/api/browser/sign-in");
        Assert.Equal(HttpStatusCode.Found, untrustedResponse.StatusCode);
        Assert.Null(untrustedResponse.Headers.Location);

        upstream.Responder = _ =>
        {
            var response = new HttpResponseMessage(HttpStatusCode.Found);
            response.Headers.Location = new Uri("/\\attacker.example", UriKind.Relative);
            return response;
        };
        using var backslashResponse = await client.GetAsync("/api/browser/sign-in");
        Assert.Equal(HttpStatusCode.Found, backslashResponse.StatusCode);
        Assert.Null(backslashResponse.Headers.Location);
        Assert.Equal(3, upstream.Requests.Count);
    }

    [Fact]
    public async Task UpstreamOutageIsExplicitAndHasNoLocalDataFallback()
    {
        upstream.Responder = _ => throw new HttpRequestException("secret upstream detail");
        using var response = await client.GetAsync("/api/summary");
        var body = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Contains("PRODUCTION_API_UNAVAILABLE", body, StringComparison.Ordinal);
        Assert.DoesNotContain("secret upstream detail", body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task ResponseBodyStreamsBeforeUpstreamCompletes()
    {
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var firstRead = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        upstream.Responder = _ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StreamContent(new GatedResponseStream(firstRead, release))
        };

        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/stream");
        request.Headers.Add("Origin", Origin);
        using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var content = await response.Content.ReadAsStreamAsync();
        var buffer = new byte[1];
        Assert.Equal(1, await content.ReadAsync(buffer));
        Assert.Equal((byte)'A', buffer[0]);
        Assert.False(release.Task.IsCompleted);
        release.SetResult();
        Assert.Equal(1, await content.ReadAsync(buffer));
        Assert.Equal((byte)'B', buffer[0]);
        Assert.Equal(0, await content.ReadAsync(buffer));
        Assert.True(firstRead.Task.IsCompleted);
    }

    [Fact]
    public async Task ClientCancellationCancelsTheUpstreamStreamingCopy()
    {
        var readAgain = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var cancelled = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        upstream.Responder = _ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StreamContent(new CancellationObservingStream(readAgain, cancelled))
        };
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/stream");
        request.Headers.Add("Origin", Origin);
        var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);
        var content = await response.Content.ReadAsStreamAsync();
        var first = new byte[1];
        Assert.Equal(1, await content.ReadAsync(first));
        await readAgain.Task.WaitAsync(TimeSpan.FromSeconds(3));
        response.Dispose();
        await cancelled.Task.WaitAsync(TimeSpan.FromSeconds(3));
    }

    private sealed class CaptureHandler : HttpMessageHandler
    {
        private readonly ConcurrentQueue<CapturedRequest> requests = new();
        public IReadOnlyCollection<CapturedRequest> Requests => requests.ToArray();
        public Func<CapturedRequest, HttpResponseMessage> Responder { get; set; } = _ => new HttpResponseMessage(HttpStatusCode.NotFound);

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var body = request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken);
            var captured = new CapturedRequest(
                request.RequestUri!,
                request.Headers.ToDictionary(x => x.Key, x => x.Value.ToArray(), StringComparer.OrdinalIgnoreCase),
                body);
            requests.Enqueue(captured);
            return Responder(captured);
        }
    }

    private sealed class GatedResponseStream(TaskCompletionSource firstRead, TaskCompletionSource release) : Stream
    {
        private int reads;
        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override void Flush() => throw new NotSupportedException();
        public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();

        public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
        {
            if (Interlocked.Increment(ref reads) == 1)
            {
                buffer.Span[0] = (byte)'A';
                firstRead.SetResult();
                return 1;
            }
            await release.Task.WaitAsync(cancellationToken);
            if (reads > 2)
                return 0;
            buffer.Span[0] = (byte)'B';
            Interlocked.Increment(ref reads);
            return 1;
        }
    }

    private sealed class CancellationObservingStream(TaskCompletionSource readAgain, TaskCompletionSource cancelled) : Stream
    {
        private int reads;
        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override void Flush() => throw new NotSupportedException();
        public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();

        public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
        {
            if (Interlocked.Increment(ref reads) == 1)
            {
                buffer.Span[0] = (byte)'A';
                return 1;
            }
            readAgain.TrySetResult();
            try
            {
                await Task.Delay(Timeout.Infinite, cancellationToken);
            }
            catch (OperationCanceledException)
            {
                cancelled.TrySetResult();
                throw;
            }
            return 0;
        }
    }

    private sealed record CapturedRequest(Uri Uri, IReadOnlyDictionary<string, string[]> Headers, string? Body)
    {
        public IEnumerable<string> GetValues(string name) => Headers.TryGetValue(name, out var values) ? values : [];
    }
}
