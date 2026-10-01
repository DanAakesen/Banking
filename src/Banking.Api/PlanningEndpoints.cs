using Banking.Api.Security;
using Banking.Api.Services;

namespace Banking.Api;

public static class PlanningEndpoints
{
    static string SaxoEnvironment(string? environment, Workspace workspace, IHostEnvironment host)
    {
        var market = Banking.Api.Providers.SaxoLocalSession.EnvironmentName(environment ?? "SIM");
        Banking.Api.Security.SaxoAccess.RequireMarketAccess(workspace, host, market);
        return market;
    }

    public static void MapPlanningApi(this WebApplication app)
    {
        app.MapGet("/api/investments/saxo/portfolio", (string? environment,Banking.Api.Providers.SaxoReadClient client,Banking.Api.Providers.SaxoOrders orders,Workspace w,IHostEnvironment host,CancellationToken ct)=>{
            var market=SaxoEnvironment(environment,w,host);
            return Banking.Api.Providers.SaxoPortfolio.Read(()=>client.Read(ct,market),()=>client.Activity(ct,market),ct,market);});
        app.MapGet("/api/investments/saxo/instruments", async (string q,string? environment,Banking.Api.Providers.SaxoOrders orders,Workspace w,IHostEnvironment host,CancellationToken ct)=>{
            _=SaxoEnvironment(environment,w,host);Banking.Api.Providers.SaxoOrders.RequireSim(environment);return await orders.Search(q,ct);});
        app.MapGet("/api/investments/saxo/ticket", async (int uic,string? environment,Banking.Api.Providers.SaxoOrders orders,Workspace w,IHostEnvironment host,CancellationToken ct)=>{
            _=SaxoEnvironment(environment,w,host);Banking.Api.Providers.SaxoOrders.RequireSim(environment);return await orders.Ticket(uic,ct);});
        app.MapPost("/api/investments/saxo/orders/precheck", async (Banking.Api.Providers.SaxoOrderInput input,string? environment,Banking.Api.Providers.SaxoOrders orders,Workspace w,IHostEnvironment host,CancellationToken ct)=>{
            _=SaxoEnvironment(environment,w,host);Banking.Api.Providers.SaxoOrders.RequireSim(environment);return await orders.Preview(input,w,ct);});
        app.MapPost("/api/investments/saxo/orders", async (Banking.Api.Providers.SaxoOrderConfirmation input,string? environment,Banking.Api.Providers.SaxoOrders orders,Workspace w,IHostEnvironment host,CancellationToken ct)=>{
            _=SaxoEnvironment(environment,w,host);Banking.Api.Providers.SaxoOrders.RequireSim(environment);return await orders.Submit(input.TicketId,w,ct,input.Confirm);});
        app.MapGet("/api/investments/saxo/orders", async (string? environment,Banking.Api.Providers.SaxoReadClient client,Banking.Api.Providers.SaxoOrders orders,Workspace w,IHostEnvironment host,CancellationToken ct)=>{
            var market=SaxoEnvironment(environment,w,host);return market=="LIVE"?await client.Activity(ct,market):await orders.Orders(w,ct);});
        app.MapGet("/api/investments/saxo/orders/{id:guid}", (Guid id,string? environment,Banking.Api.Providers.SaxoOrders orders,Workspace w,IHostEnvironment host)=>{
            _=SaxoEnvironment(environment,w,host);Banking.Api.Providers.SaxoOrders.RequireSim(environment);return orders.Receipt(id,w);});
        app.MapGet("/api/markets/search", (string q, Banking.Api.Providers.IMarketDataProvider provider, CancellationToken ct) => provider.Search(q, ct));
        app.MapGet("/api/markets/chart", (string symbol, string range, Banking.Api.Providers.IMarketDataProvider provider, CancellationToken ct) => provider.Chart(symbol, range, ct));
        app.MapGet("/api/research", (ResearchService service,CancellationToken ct)=>service.List(ct));
        app.MapPost("/api/research",(ResearchInput input,ResearchService service,CancellationToken ct)=>service.Save(null,input,ct));
        app.MapPut("/api/research/{id:guid}",(Guid id,ResearchInput input,ResearchService service,CancellationToken ct)=>service.Save(id,input,ct));
        app.MapDelete("/api/research/{id:guid}",async(Guid id,string version,ResearchService service,CancellationToken ct)=>{await service.Delete(id,version,ct);return Results.NoContent();});
        app.MapPost("/api/pension/statement-preview", (System.Text.Json.JsonElement input) => Banking.Api.Providers.PensionStatement.Preview(input));
        app.MapGet("/api/wealth", (WealthService service, CancellationToken ct) => service.List(ct));
        app.MapGet("/api/wealth/overview", (string currency, WealthService service, CancellationToken ct) => service.Overview(currency, ct));
        app.MapGet("/api/wealth/summary", (string currency, WealthService service, CancellationToken ct) => service.Summary(currency, ct));
        app.MapPost("/api/wealth", (WealthInput input, WealthService service, CancellationToken ct) => service.Save(null, input, ct));
        app.MapPut("/api/wealth/{id:guid}", (Guid id, WealthInput input, WealthService service, CancellationToken ct) => service.Save(id, input, ct));
        app.MapDelete("/api/wealth/{id:guid}", async (Guid id, string version, WealthService service, CancellationToken ct) =>
        { await service.Delete(id, version, ct); return Results.NoContent(); });
        app.MapGet("/api/investments/saxo/status", (string? environment, Banking.Api.Providers.SaxoReadClient client, Banking.Api.Providers.SaxoLocalSession session, Banking.Api.Providers.SaxoOrders orders, Workspace workspace,IHostEnvironment host) =>
        {
            var market=SaxoEnvironment(environment,workspace,host);
            var configured=client.IsConfigured(market);
            return Results.Ok((object)new { configured, environment = market, liveEnabled = workspace.Mode == "Live", readEnabled=client.ReadEnabled(market),
                setup = session.Status(market), reason = configured ? "READ_READY" : "ACCESS_REQUIRED",
                trading = new { environment = "SIM", enabled = orders.TradingEnabled,
                    allowed = market == "SIM" && orders.TradingEnabled,
                    ownerRequired = false, confirmationRequired = true } });
        });
        app.MapPost("/api/investments/saxo/connect", (string? environment, string? returnUrl, Banking.Api.Providers.SaxoLocalSession session, Workspace workspace,IHostEnvironment host) =>
        { var market=SaxoEnvironment(environment,workspace,host);
            if(string.IsNullOrWhiteSpace(workspace.SessionScope))throw new ApiFailure(401,"SAXO_SESSION_REQUIRED");
            return session.Start(market,returnUrl,workspace.SessionScope); });
        app.MapGet("/api/saxo/auth/callback", async (string state, string? code, string? error, Banking.Api.Providers.SaxoLocalSession session, CancellationToken ct) =>
        { return Results.Redirect(error is not null?session.Cancel(state):await session.Complete(state,code??"",ct)); });
        app.MapPost("/api/investments/saxo/connect/complete", async (SaxoCompletion input, Banking.Api.Providers.SaxoLocalSession session,Workspace workspace,CancellationToken ct)=>
            new {environment=await session.Finish(input.State,input.Proof,workspace,ct),connected=true});
        app.MapPost("/api/investments/saxo/disconnect", async (string? environment,Banking.Api.Providers.SaxoLocalSession session,Workspace workspace,IHostEnvironment host,CancellationToken ct)=> {
            var market=SaxoEnvironment(environment,workspace,host);
            if(!workspace.OwnerAuthenticated)throw new ApiFailure(403,"SAXO_PRIVATE_ACCESS_REQUIRED");
            await session.Disconnect(market,ct);return Results.NoContent();
        });
        app.MapPost("/api/investments/saxo/preview", (string? environment, Banking.Api.Providers.SaxoReadClient client, Workspace workspace,IHostEnvironment host, CancellationToken ct) =>
        { return client.Read(ct,SaxoEnvironment(environment,workspace,host)); });
        app.MapGet("/api/loans", (LoanService service, CancellationToken ct) => service.List(ct));
        app.MapPost("/api/loans/preview", (LoanInput input) => LoanService.Project(input));
        app.MapPost("/api/loans", (LoanInput input, LoanService service, CancellationToken ct) => service.Save(null, input, ct));
        app.MapPut("/api/loans/{id:guid}", (Guid id, LoanInput input, LoanService service, CancellationToken ct) => service.Save(id, input, ct));
        app.MapDelete("/api/loans/{id:guid}", async (Guid id, string version, LoanService service, CancellationToken ct) =>
        { await service.Delete(id, version, ct); return Results.NoContent(); });
        app.MapGet("/api/budget-plans", (BudgetPlanService service, CancellationToken ct) => service.List(ct));
        app.MapGet("/api/budget-plans/{id:guid}/progress", (Guid id, DateOnly? month, BudgetPlanService service, CancellationToken ct) => service.Progress(id, month, ct));
        app.MapGet("/api/budget-plans/active", (BudgetPlanService service, CancellationToken ct) => service.Active(ct));
        app.MapGet("/api/budget-plans/suggestions", (string currency, int? months, BudgetPlanService service, CancellationToken ct) => service.Suggestions(currency, months ?? 3, ct));
        app.MapPost("/api/budget-plans", (BudgetPlanInput input, BudgetPlanService service, CancellationToken ct) => service.Save(input, ct));
        app.MapPost("/api/budget-plans/{id:guid}/activation", (Guid id, BudgetActivation input, BudgetPlanService service, CancellationToken ct) => service.Activate(id, input, ct));
        app.MapDelete("/api/budget-plans/{id:guid}", async (Guid id, string version, BudgetPlanService service, CancellationToken ct) =>
        { await service.Delete(id, version, ct); return Results.NoContent(); });
        app.MapGet("/api/review", (Guid? accountId, string? kind, string? sort, int? offset, ReviewService service, CancellationToken ct) =>
            service.Queue(accountId, kind ?? "All", sort ?? "newest", offset ?? 0, ct));
        app.MapGet("/api/review/history", (int? offset, ReviewService service, CancellationToken ct) => service.History(offset ?? 0, ct));
        app.MapPost("/api/review/actions", (ReviewInput input, ReviewService service, CancellationToken ct) => service.Apply(input, ct));
        app.MapPost("/api/review/actions/{id:guid}/undo", (Guid id, ReviewUndo input, ReviewService service, CancellationToken ct) => service.Undo(id, input.Version, ct));
        app.MapGet("/api/goals", (GoalService service, CancellationToken ct) => service.List(ct));
        app.MapPost("/api/goals", async (GoalInput input, GoalService service, CancellationToken ct) =>
            Results.Json(await service.Save(null, input, ct), statusCode: 201));
        app.MapPut("/api/goals/{id:guid}", (Guid id, GoalInput input, GoalService service, CancellationToken ct) => service.Save(id, input, ct));
        app.MapDelete("/api/goals/{id:guid}", async (Guid id, string version, GoalService service, CancellationToken ct) =>
        { await service.Delete(id, version, ct); return Results.NoContent(); });
        app.MapGet("/api/goals/{id:guid}/progress", (Guid id, GoalService service, CancellationToken ct) => service.Progress(id, ct));
        app.MapGet("/api/goals/{id:guid}/journey", (Guid id, GoalService service, CancellationToken ct) => service.Journey(id, ct));
        app.MapGet("/api/goals/{id:guid}/photo", (Guid id, GoalService service, CancellationToken ct) => service.Photo(id, ct));
        app.MapPut("/api/goals/{id:guid}/photo", (Guid id, GoalPhotoInput input, GoalService service, CancellationToken ct) => service.SavePhoto(id, input, ct));
        app.MapGet("/api/budget-suggestions", (DateOnly month, string currency, int? months, PlanningService service, CancellationToken ct) =>
            service.BudgetSuggestions(month, currency, months ?? 3, ct));
        app.MapGet("/api/trends", (DateOnly from, DateOnly to, string currency, PlanningService service, CancellationToken ct) => service.Trends(from, to, currency, ct));
        app.MapGet("/api/account-insights", (DateOnly from, DateOnly to, string currency, Guid? accountId, PlanningService service, CancellationToken ct) =>
            service.AccountInsights(from, to, currency, accountId, ct));
        app.MapGet("/api/cash-flow", (DateOnly from, DateOnly to, string currency, Guid? accountId, PlanningService service, CancellationToken ct) =>
            service.CashFlow(from, to, currency, accountId, ct));
        app.MapGet("/api/upcoming-estimates", (DateOnly from, int? days, string currency, Guid? accountId, PlanningService service, CancellationToken ct) =>
            service.Upcoming(from, days ?? 30, currency, ct, accountId));
        // Deliberately no model SDK/client, conversation persistence, prompt endpoint or outbound calls.
        app.MapGet("/api/advisor/status", (Workspace workspace) => new { status = "not_connected", mode = workspace.Mode,
            displayName = workspace.Mode == "Live" ? "Dan" : "Demo", placeholder = true, canChat = false,
            externalDataSharingEnabled = false, messageKey = "advisor.notConnected" });
    }
}

public sealed record SaxoCompletion(string State,string Proof);
