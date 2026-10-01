using System.Collections.Concurrent;
using System.Diagnostics.Metrics;
using Banking.Api.Services;
using Banking.Api.Security;

namespace Banking.Api.Providers;

// Shared by all Saxo data/order clients in this single-instance application.
// No automatic retries, especially after an uncertain write. Never log URLs, keys or payloads.
public sealed class SaxoRequestBudget(TimeProvider clock,ILogger<SaxoRequestBudget>? log=null)
{
    sealed class Window { public DateTimeOffset Start,Until; public int Count; public string? Error; }
    readonly ConcurrentDictionary<string,Window> windows=new();
    // Market-data entitlement is granted per instrument/venue, so a 403 on one quote or chart pauses only that
    // instrument. Authentication (401), throttling and provider outages still pause the whole service group.
    readonly ConcurrentDictionary<string,(DateTimeOffset Until,string Error)> instrumentCooldowns=new();
    static readonly Meter Meter=new("Banking.Saxo");
    static readonly Counter<long> Outcomes=Meter.CreateCounter<long>("saxo.provider.responses");
    public static string? InstrumentScope(Uri uri)
    {
        var path=uri.AbsolutePath.Split("openapi/",StringSplitOptions.None).Last();
        if(!path.StartsWith("chart/",StringComparison.Ordinal)&&!path.StartsWith("trade/v1/infoprices",StringComparison.Ordinal))return null;
        var query=Microsoft.AspNetCore.WebUtilities.QueryHelpers.ParseQuery(uri.Query);
        return query.TryGetValue("Uic",out var uic)&&uic.Count==1?query["AssetType"].ToString()+":"+uic.ToString():null;
    }
    public async Task<HttpResponseMessage> Send(HttpRequestMessage request,Func<Task<HttpResponseMessage>> send,CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        var uri=request.RequestUri!;
        var market=uri.AbsolutePath.StartsWith("/sim/",StringComparison.Ordinal)?"SIM":"LIVE";
        var path=uri.AbsolutePath.Split("openapi/",StringSplitOptions.None).Last();
        var group=path.Split('/')[0];
        // Authentication generation changes release a previous authentication cooldown.
        var identity=Vault.Hash(request.Headers.Authorization?.Parameter??"");
        var key=market+":"+group+":"+identity;
        var scope=InstrumentScope(uri) is {} instrument?key+":"+instrument:null;
        var now=clock.GetUtcNow();
        foreach(var old in windows.Where(x=>x.Value.Start<now.AddMinutes(-10)&&x.Value.Until<now))windows.TryRemove(old.Key,out _);
        foreach(var old in instrumentCooldowns.Where(x=>x.Value.Until<now))instrumentCooldowns.TryRemove(old.Key,out _);
        if(scope is not null&&instrumentCooldowns.TryGetValue(scope,out var paused)&&paused.Until>now)throw new ApiFailure(503,paused.Error);
        var window=windows.GetOrAdd(key,_=>new Window());
        lock(window) {
            if(window.Until>now)throw new ApiFailure(503,window.Error??"SAXO_RATE_LIMITED");
            if(window.Start.AddMinutes(1)<=now){window.Start=now;window.Count=0;}
            if(++window.Count>90)throw new ApiFailure(503,"SAXO_RATE_LIMITED");
        }
        var response=await send();
        var status=(int)response.StatusCode;
        if(status>=400)log?.LogWarning("saxo_provider_failure environment={Environment} group={Group} status={Status}",market,group,status);
        Outcomes.Add(1,new KeyValuePair<string,object?>("environment",market),new("group",group),new("status",status));
        if(status==403&&scope is not null){instrumentCooldowns[scope]=(now.AddSeconds(300),"SAXO_PERMISSION_REQUIRED");return response;}
        lock(window) {
            var reset=RetrySeconds(response,now);
            if(status is 401 or 403 or 429 || status>=500) {
                window.Error=status==401?"SAXO_SIGN_IN_REQUIRED":status==403?"SAXO_PERMISSION_REQUIRED":status==429?"SAXO_RATE_LIMITED":"SAXO_PROVIDER_UNAVAILABLE";
                window.Until=now.AddSeconds(status is 401 or 403?300:status==429?Math.Max(1,reset):15);
            } else if(response.Headers.Any(h=>h.Key.StartsWith("X-RateLimit-",StringComparison.OrdinalIgnoreCase)&&h.Key.EndsWith("-Remaining",StringComparison.OrdinalIgnoreCase)&&h.Value.Contains("0"))) {
                window.Error="SAXO_RATE_LIMITED";window.Until=now.AddSeconds(Math.Max(1,reset));
            }
        }
        return response;
    }
    public static double RetrySeconds(HttpResponseMessage response,DateTimeOffset now)
    {
        var seconds=response.Headers.RetryAfter?.Delta?.TotalSeconds??(response.Headers.RetryAfter?.Date-now)?.TotalSeconds;
        var resets=response.Headers.Where(h=>h.Key.StartsWith("X-RateLimit-",StringComparison.OrdinalIgnoreCase)&&h.Key.EndsWith("-Reset",StringComparison.OrdinalIgnoreCase)).SelectMany(h=>h.Value).Select(s=>double.TryParse(s,System.Globalization.NumberStyles.Float,System.Globalization.CultureInfo.InvariantCulture,out var n)?n:0);
        return Math.Clamp(Math.Max(seconds??0,resets.DefaultIfEmpty(0).Max()) is var delay&&delay>0?delay:60,1,3600);
    }
}

public sealed class SaxoBudgetHandler(SaxoRequestBudget budget):DelegatingHandler
{
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken ct)=>budget.Send(request,()=>base.SendAsync(request,ct),ct);
}
