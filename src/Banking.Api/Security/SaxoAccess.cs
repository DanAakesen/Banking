using Banking.Api.Services;

namespace Banking.Api.Security;

public static class SaxoAccess
{
    // The confirmed product boundary allows the shared Demo workspace to use
    // Saxo SIM. LIVE brokerage/account access requires Dan's private workspace.
    public static void RequireMarketAccess(Workspace workspace, IHostEnvironment environment, string market)
    {
        if (market != "LIVE") return;
        if (workspace.Mode != "Live") throw new ApiFailure(403, "SAXO_LIVE_OWNER_REQUIRED");
        if (CloudHosting.Enabled(environment) && !workspace.OwnerAuthenticated)
            throw new ApiFailure(403, "SAXO_PRIVATE_ACCESS_REQUIRED");
    }

    // Authenticated Demo visitors may read the shared LIVE market feed only.
    // Never use this guard for brokerage, session/OAuth, account or order routes.
    public static void RequireResearchAccess(Workspace workspace, IHostEnvironment environment)
    {
        if (workspace.Mode == "Demo") return;
        RequireMarketAccess(workspace, environment, "LIVE");
    }
}
