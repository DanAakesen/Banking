using Banking.Api.Security;

namespace Banking.Api.Services;

// Guard the shared production Demo invariant before any API handler runs. Financial
// records are kept in the canonical empty scope; advisor-private scopes are separate.
public sealed class SharedDemoScopeMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, Workspace workspace, IHostEnvironment environment)
    {
        if (CloudHosting.Enabled(environment) && workspace.Mode == "Demo" && workspace.DemoScope.Length != 0)
            throw new InvalidOperationException("Production Demo requests must use the canonical shared financial scope.");
        await next(context);
    }
}
