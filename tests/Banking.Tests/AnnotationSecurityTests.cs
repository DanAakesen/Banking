using Banking.Api.Providers;
using Banking.Api.Security;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;

namespace Banking.Tests;

public sealed class AnnotationSecurityTests
{
    private sealed class Env(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "Banking";
        public string ContentRootPath { get; set; } = "";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Exact_annotation_styles_preserve_private_workspace_boundary(bool forgedLiveMode)
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> {
            ["Cloud:Origin"] = "https://banking.example"
        }).Build();
        var env = new Env("Production");
        var sessions = new BrowserSessions(TimeProvider.System, new Env("Development"), config, new EphemeralDataProtectionProvider());
        var context = new DefaultHttpContext();
        context.Request.Scheme = "https";
        context.Request.Host = new HostString("banking.example");
        context.Request.Method = "GET";
        context.Request.Path = forgedLiveMode ? "/api/accounts" : "/";
        context.Request.Headers["X-Banking-Client"] = "web";
        context.Request.Headers["X-Banking-Mode"] = forgedLiveMode ? "Live" : "Demo";
        context.Request.Headers.Cookie = BrowserSessions.Cookie + "=" + sessions.Create("Demo");
        var forwarded = false;
        await new LocalAccessMiddleware(_ => { forwarded = true; return Task.CompletedTask; })
            .InvokeAsync(context, new LocalToken(config, env), sessions, env, config);
        Assert.Equal(forgedLiveMode ? 403 : 200, context.Response.StatusCode);
        Assert.Equal(!forgedLiveMode, forwarded);
        var policy = context.Response.Headers.ContentSecurityPolicy.ToString();
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

    [Fact]
    public async Task Synthetic_bill_transfers_identify_bill_account_without_changing_ledger()
    {
        var provider = new ProductDemoProvider(TimeProvider.System);
        string? cursor = null;
        var count = 0;
        do
        {
            var page = await provider.Transactions(ProductDemoProvider.SessionId, "everyday", true, null,
                DateOnly.FromDateTime(DateTime.UtcNow), cursor, CancellationToken.None);
            foreach (var row in page.Items.Where(x => x.Description.Contains("bills transfer")))
            {
                Assert.Equal(DemoBankDetails.Identifier("bills"), row.Details?.CreditorAccount);
                Assert.True(row.Amount is -10500m or -11000m);
                count++;
            }
            cursor = page.Cursor;
        } while (cursor is not null);
        Assert.True(count > 2);
    }
}
