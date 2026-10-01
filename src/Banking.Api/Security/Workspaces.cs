using Banking.Api.Services;
using Microsoft.Data.SqlClient;

namespace Banking.Api.Security;

public sealed class Workspace
{
    public string DemoScope { get; set; } = "";
    public string Mode { get; private set; } = "Demo";
    public bool OwnerAuthenticated { get; set; }
    public string SessionScope { get; set; } = "";
    private bool selected;
    public void Select(string mode)
    {
        Check.That(mode is "Demo" or "Live", "INVALID_MODE");
        if (selected && Mode != mode) throw new ApiFailure(409, "WORKSPACE_ALREADY_BOUND");
        Mode = mode; selected = true;
    }
    public string Bind() { selected = true; return Mode; }
}

public sealed class WorkspaceCatalog(IConfiguration config, IHostEnvironment environment)
{
    public bool LiveEnabled => config.GetValue<bool>("EnableBanking:Enabled");
    public bool TestLive => environment.IsEnvironment("Testing") && config.GetValue<bool>("Testing:SecondWorkspace");
    public string[] Modes => LiveEnabled || TestLive ? ["Demo", "Live"] : ["Demo"];
    public void Require(string mode)
    { if (!Modes.Contains(mode, StringComparer.Ordinal)) throw new ApiFailure(409, "LIVE_NOT_CONFIGURED"); }
    public string Connection(string mode)
    {
        Require(mode);
        var value = mode == "Demo"
            ? config.GetConnectionString("Banking") ?? "Server=(localdb)\\Banking;Database=Banking_Local;Integrated Security=true;TrustServerCertificate=true"
            : config.GetConnectionString("BankingLive") ?? throw new InvalidOperationException("Live database must be configured separately.");
        var parsed = new SqlConnectionStringBuilder(value);
        if (CloudHosting.Enabled(environment)) return CloudHosting.ValidateConnection(value, mode);
        if (!parsed.DataSource.StartsWith("(localdb)\\", StringComparison.OrdinalIgnoreCase) || !parsed.InitialCatalog.StartsWith("Banking_", StringComparison.Ordinal))
            throw new InvalidOperationException("Only a Banking_ database on LocalDB is allowed.");
        if (mode == "Live")
        {
            var restoringLive = config["Maintenance:Action"] == "restore" && config["Maintenance:Mode"] == "Live"
                && parsed.InitialCatalog.StartsWith("Banking_Restore_Live_", StringComparison.Ordinal);
            if (!TestLive && !restoringLive && !parsed.InitialCatalog.StartsWith("Banking_Live_", StringComparison.Ordinal))
                throw new InvalidOperationException("Live data requires a separate Banking_Live_ database.");
            var demo = new SqlConnectionStringBuilder(Connection("Demo"));
            if (parsed.DataSource.Equals(demo.DataSource, StringComparison.OrdinalIgnoreCase) && parsed.InitialCatalog.Equals(demo.InitialCatalog, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("Demo and Live cannot share a database.");
            if (!TestLive)
            {
                var dataRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Banking", "data");
                if (string.IsNullOrEmpty(parsed.AttachDBFilename)) parsed.AttachDBFilename = Path.Combine(dataRoot, parsed.InitialCatalog + ".mdf");
                if (!Path.GetFullPath(parsed.AttachDBFilename).StartsWith(Path.GetFullPath(dataRoot) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                    throw new InvalidOperationException("Live database files must stay in Banking's protected data directory.");
            }
        }
        if (!parsed.IntegratedSecurity) throw new InvalidOperationException("LocalDB requires Windows Integrated Security.");
        return parsed.ConnectionString;
    }
}

public sealed class WorkspaceMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, Workspace workspace, WorkspaceCatalog catalog, IHostEnvironment environment)
    {
        // Callbacks select their original workspace from a fixed registered route, never from a mutable UI preference.
        var callback = context.Request.Path == "/api/auth/callback" || context.Request.Path == "/api/auth/callback/live";
        var mode = callback ? context.Request.Path.Value!.EndsWith("/live", StringComparison.Ordinal) ? "Live" : "Demo"
            : context.Request.Headers.TryGetValue("X-Banking-Mode", out var header) ? header.ToString() : "Demo";
        workspace.Select(mode); catalog.Require(mode);
        workspace.OwnerAuthenticated = context.Items["OwnerAccess"] is true;
        if (context.Request.Cookies[BrowserSessions.Cookie] is { Length: > 0 } cookie)
            workspace.SessionScope = Vault.Hash(cookie).ToLowerInvariant();
        if (CloudHosting.Enabled(environment) && mode == "Demo")
            workspace.DemoScope = ""; // The production Demo database's empty scope is the persistent shared synthetic dataset.
        context.Response.Headers["X-Banking-Mode"] = mode;
        context.Response.Headers.Append("Vary", "X-Banking-Mode");
        await next(context);
    }
}
