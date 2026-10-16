using Banking.Api.Services;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;

namespace Banking.Api.Providers;

public sealed record EmployeeShareFx(string Source, string Symbol, string BaseCurrency, string QuoteCurrency,
    string Basis, decimal? DkkPerUsd, DateTimeOffset? ObservedAt, DateTimeOffset RetrievedAt,
    decimal? DelayMinutes, string Status, string? MarketState = null, string? QuoteQuality = null, string? SourceTimeStatus = null);
public sealed record EmployeeShareMarket(MarketSnapshot? Stock, EmployeeShareFx Fx, DateTimeOffset RetrievedAt = default);

public sealed partial class SaxoMarketDataProvider
{
    static readonly SemaphoreSlim EmployeeMarketGate=new(1,1);
    // Fixed public-market projection only. Access/token generation is checked before shared cache use.
    public async Task<EmployeeShareMarket> EmployeeShares(CancellationToken ct)
    {
        var access=await Access(ct);
        var key="saxo-employee-shares:"+access.Identity;
        if(cache.TryGetValue<EmployeeShareMarket>(key,out var fresh)&&fresh is not null&&clock.GetUtcNow()-fresh.RetrievedAt<TimeSpan.FromSeconds(60))return fresh;
        await EmployeeMarketGate.WaitAsync(ct);
        try
        {
            cache.TryGetValue<EmployeeShareMarket>(key,out var saved);
            if(saved is not null&&clock.GetUtcNow()-saved.RetrievedAt<TimeSpan.FromSeconds(60))return saved;
            using var deadline=CancellationTokenSource.CreateLinkedTokenSource(ct);deadline.CancelAfter(TimeSpan.FromSeconds(15));
            var stockTask=EmployeePrice(access,saved?.Stock,deadline.Token);
            var fxTask=EmployeeFx(access,saved?.Fx,deadline.Token);
            await Task.WhenAll(stockTask,fxTask);
            ct.ThrowIfCancellationRequested();
            var value=new EmployeeShareMarket(await stockTask,await fxTask,clock.GetUtcNow());
            cache.Set(key,value,TimeSpan.FromHours(24));return value;
        }
        finally{EmployeeMarketGate.Release();}
    }
    async Task<MarketSnapshot?> EmployeePrice((string Token,string Identity) access,MarketSnapshot? saved,CancellationToken ct)
    {
        try
        {
            // Share already fetched 1D market quotes, without requesting any historical chart here.
            if(cache.TryGetValue<MarketSnapshot>("saxo-market-chart:"+access.Identity+":MSFT:XNAS:1d",out var chart)
                &&chart is not null&&clock.GetUtcNow()-chart.RetrievedAt<Freshness("1d")&&chart.QuoteStatus=="available")return chart;
            var instrument=await Resolve("MSFT:xnas",access.Token,access.Identity,ct);
            if(instrument.Kind!="Stock")throw new ApiFailure(502,Mismatch);
            var quote=await Get("quote","trade/v1/infoprices?AssetType=Stock&Uic="+instrument.Uic+"&FieldGroups=Quote,PriceInfoDetails,DisplayAndFormat",access.Token,access.Identity,ct);
            var result=Compose(null,quote,instrument,"1d",clock.GetUtcNow(),null,null,null);
            return result with{MarketState=State(Child(quote,"Quote"))};
        }
        catch(ApiFailure ex) when(ex.Code!= "INVALID_MARKET_SYMBOL")
        {
            var denial=ex.Code is SignIn or NoAccess or Rejected or Mismatch or ListingRequired;
            if(denial)cache.Remove("saxo-market-chart:"+access.Identity+":MSFT:XNAS:1d");
            return !denial&&saved is not null?saved with{Stale=true,QuoteStatus="stale"}:null;
        }
        catch(Exception ex) when(ex is HttpRequestException or JsonException or OperationCanceledException)
        {return saved is null?null:saved with{Stale=true,QuoteStatus="stale"};}
    }
    async Task<EmployeeShareFx> EmployeeFx((string Token,string Identity) access,EmployeeShareFx? saved,CancellationToken ct)
    {
        var now=clock.GetUtcNow();
        EmployeeShareFx Missing(string status)=>new("Saxo LIVE","USDDKK","USD","DKK","provider-mid",null,null,now,null,status);
        try
        {
            var key="saxo-usddkk-listing:"+access.Identity;
            if(!cache.TryGetValue<int>(key,out var uic))
            {
                var json=await Get("fx-search","ref/v1/instruments?AssetTypes=FxSpot&Keywords=USDDKK&$top=100",access.Token,access.Identity,ct);
                var data=Child(json,"Data");
                if(data.ValueKind!=JsonValueKind.Array)return Missing("mismatch");
                var matches=data.EnumerateArray().Where(x=>Text(x,"Symbol")=="USDDKK"&&Text(x,"AssetType")=="FxSpot"&&ValidUic(x)).ToArray();
                if(matches.Length!=1)return Missing("mismatch");
                uic=(int)Number(matches[0],"Identifier")!;cache.Set(key,uic,TimeSpan.FromMinutes(15));
            }
            var body=await Get("fx-quote","trade/v1/infoprices?AssetType=FxSpot&Uic="+uic+"&FieldGroups=Quote,DisplayAndFormat",access.Token,access.Identity,ct);
            return MapEmployeeFx(body,uic,clock.GetUtcNow());
        }
        catch(ApiFailure ex)
        {
            if(ex.Code is SignIn or NoAccess or Rejected)return Missing(ex.Code==NoAccess?"denied":"unavailable");
            return saved?.DkkPerUsd is not null?saved with{Status="stale"}:Missing("unavailable");
        }
        catch(Exception ex) when(ex is HttpRequestException or JsonException or OperationCanceledException)
        {return saved?.DkkPerUsd is not null?saved with{Status="stale"}:Missing("unavailable");}
    }
    static string? State(JsonElement quote)=>Text(quote,"MarketState") is "Open" or "Closed" or "PreMarket" or "PostMarket" ? Text(quote,"MarketState"):null;
    public static EmployeeShareFx MapEmployeeFx(JsonElement body,int uic,DateTimeOffset now)
    {
        var q=Child(body,"Quote");var mid=Number(q,"Mid");var observed=Time(body,"LastUpdated");
        var rawTime=Child(body,"LastUpdated");
        var timeNotReported=rawTime.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null||(rawTime.ValueKind==JsonValueKind.String&&(string.IsNullOrWhiteSpace(rawTime.GetString())||observed==DateTimeOffset.MinValue));
        var validTime=timeNotReported||observed is not null&&observed<=now.AddMinutes(1)&&observed>=now.AddDays(-7);
        if(timeNotReported)observed=null;
        var delay=Number(q,"DelayedByMinutes")??Number(body,"DelayedByMinutes");
        var quality=new[]{Text(q,"PriceTypeBid"),Text(q,"PriceTypeAsk")};
        var bid=Number(q,"Bid");var ask=Number(q,"Ask");
        var valid=Text(body,"AssetType")=="FxSpot"&&Number(body,"Uic")==uic&&Text(Child(body,"DisplayAndFormat"),"Symbol")=="USDDKK"
            &&Text(Child(body,"DisplayAndFormat"),"Currency")=="DKK"&&mid is >0 and <=10000
            &&validTime
            &&(bid is null||bid>0&&bid<=mid)&&(ask is null||ask>=mid)
            &&(delay is null or >=0 and <=1440)&&quality.All(x=>x is "Tradable" or "Indicative" or "OldIndicative");
        return new("Saxo LIVE","USDDKK","USD","DKK","provider-mid",valid?mid:null,valid?observed:null,now,delay,valid?"available":"mismatch",State(q),quality.Contains("OldIndicative")?"OldIndicative":quality.Contains("Indicative")?"Indicative":"Tradable",timeNotReported?"not-reported":"reported");
    }
}
