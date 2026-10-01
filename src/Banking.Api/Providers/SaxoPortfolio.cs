using System.Text.Json;
using Banking.Api.Services;

namespace Banking.Api.Providers;

// Read model only. Never merges working orders into owned assets or exposes review tickets.
public static class SaxoPortfolio
{
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public static async Task<object> Read(Func<Task<object>> portfolio,Func<Task<object>> activity,CancellationToken ct,string market="SIM")
    {
        SaxoLocalSession.EnvironmentName(market);
        async Task<(JsonElement? Data,string? Error)> TryRead(Func<Task<object>> read)
        {
            try{return (JsonSerializer.SerializeToElement(await read(),Json),null);}
            catch(ApiFailure ex) when(ex.Status>=500){return (null,ex.Code);}
            catch(HttpRequestException){return (null,"SAXO_READ_UNAVAILABLE");}
            catch(TaskCanceledException) when(!ct.IsCancellationRequested){return (null,"SAXO_READ_TIMEOUT");}
        }
        // Sequential reads avoid concurrent provider-token refreshes.
        var p=await TryRead(portfolio);ct.ThrowIfCancellationRequested();
        var a=await TryRead(activity);ct.ThrowIfCancellationRequested();
        static JsonElement? Field(JsonElement? data,string key)=>data is {ValueKind:JsonValueKind.Object} d&&d.TryGetProperty(key,out var v)?v:null;
        return new{schemaVersion=1,environment=market,simulation=market=="SIM",observedAt=DateTimeOffset.UtcNow,
            status=p.Data is null&&a.Data is null?"Unavailable":p.Error is not null||a.Error is not null||Field(a.Data,"historyError") is {ValueKind:JsonValueKind.String}?"Partial":"Ok",
            portfolio=p.Data,portfolioError=p.Error,orders=Field(a.Data,"orders"),ordersError=a.Error,
            activity=Field(a.Data,"history"),activityError=a.Error??Field(a.Data,"historyError")?.GetString(),
            ordersObservedAt=Field(a.Data,"observedAt"),ordersHasMore=Field(a.Data,"hasMore"),activityHasMore=Field(a.Data,"historyHasMore"),
            activityWindowDays=7,ordersPageLimit=100,activityPageLimit=100,
            performance=new{status="Unavailable",reason="SAXO_VERIFIED_PERFORMANCE_HISTORY_REQUIRED"}};
    }
}
