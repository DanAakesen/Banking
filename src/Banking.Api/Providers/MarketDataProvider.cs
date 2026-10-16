using System.Globalization;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.RegularExpressions;
using Banking.Api.Services;
using Banking.Api.Security;
using Microsoft.Extensions.Caching.Memory;

namespace Banking.Api.Providers;

public sealed record MarketInstrument(string Symbol, string Name, string Exchange, string Kind, int Uic = 0);
public sealed record MarketBar(long Time, decimal Open, decimal High, decimal Low, decimal Close, decimal? Volume);
// One failed provider operation. Codes are Banking codes; ProviderCode is Saxo's own ErrorCode only when it
// matches a short identifier pattern. Messages, bodies, tokens and account data are never carried.
// Fields lists at most five sanitized request-parameter names from a rejected request's ModelState, never their messages.
public sealed record MarketDiagnostic(string Operation, string Code, int? Status = null, string? ProviderCode = null, bool Cooldown = false,
    string[]? Fields = null);
// Per-response accounting of Saxo chart samples: counts only, never prices, times or account data.
// Received = Kept + OutsidePeriod + Dropped.Total. MissingIntervals (intraday ranges only) counts horizon slots with no
// sample between the first and last sample of each UTC day, including real exchange breaks; nothing is filled in.
public sealed record MarketSampleDrops(int MissingTime = 0, int FutureTime = 0, int MissingPrice = 0, int QuoteOnly = 0,
    int NonPositivePrice = 0, int InconsistentRange = 0, int DuplicateTime = 0)
{
    public int Total => MissingTime + FutureTime + MissingPrice + QuoteOnly + NonPositivePrice + InconsistentRange + DuplicateTime;
}
public sealed record MarketSampleSummary(int Received, int Kept, int OutsidePeriod, MarketSampleDrops Dropped, int? MissingIntervals);
public sealed record MarketFailureDetails(string Source, MarketDiagnostic[] Diagnostics);
// History and quote are independent parts. HistoryStatus: available, empty, stale, denied, unavailable.
// QuoteStatus: available, stale, denied, unavailable, mismatch. A historical close never fills a missing quote.
public sealed record MarketSnapshot(string Symbol, string Name, string Currency, string Exchange, string Range, string Interval,
    string Source, string PriceBasis, DateTimeOffset RetrievedAt, DateTimeOffset? QuoteTime, decimal? Price,
    decimal? PreviousClose, string Delay, MarketBar[] Bars, bool Stale = false, string? Warning = null,
    decimal? ChartDelayMinutes = null, decimal? QuoteDelayMinutes = null,
    string HistoryStatus = "available", string QuoteStatus = "available", DateTimeOffset? HistoryRetrievedAt = null,
    string? AssetType = null, MarketDiagnostic[]? Diagnostics = null, MarketSampleSummary? HistorySamples = null, string? MarketState = null);
public interface IMarketDataProvider
{
    Task<MarketInstrument[]> Search(string query, CancellationToken ct);
    Task<MarketSnapshot> Chart(string symbol, string range, CancellationToken ct);
    Task<EmployeeShareMarket> EmployeeShares(CancellationToken ct);
}

// Market research always uses Saxo LIVE. Trading/account environment is deliberately
// absent from this contract. Authorization is checked before every cache lookup.
public sealed partial class SaxoMarketDataProvider(HttpClient http, IMemoryCache cache, TimeProvider clock,
    SaxoLocalSession session, IConfiguration config, Workspace workspace, IHostEnvironment host,
    ILogger<SaxoMarketDataProvider>? log = null) : IMarketDataProvider
{
    public const string SignIn="SAXO_MARKET_SIGN_IN_REQUIRED", NoAccess="SAXO_MARKET_DATA_NO_ACCESS", Unavailable="SAXO_MARKET_DATA_UNAVAILABLE",
        RateLimited="SAXO_RATE_LIMITED", Rejected="SAXO_MARKET_REQUEST_REJECTED", Mismatch="SAXO_MARKET_DATA_MISMATCH", ListingRequired="SAXO_MARKET_LISTING_REQUIRED";
    const string StaleWarning="Refresh failed. Showing the last Saxo snapshot.";
    [GeneratedRegex("^[A-Za-z0-9][A-Za-z0-9.:^=_-]{0,23}$")]
    private static partial Regex SymbolPattern();
    [GeneratedRegex("^[A-Za-z][A-Za-z0-9_.-]{0,63}$")]
    private static partial Regex ProviderCodePattern();
    // Saxo chart/v3 horizons (minutes) include 1, 5, 15, 1440 and 10080; Count is at most 1,200 samples per request.
    // 1d uses 1-minute samples: 600 covers a full NASDAQ (390), Copenhagen (480) or XETRA (510) session. 1h is the
    // last 60 minutes of returned samples; its 120-sample request still covers that hour when some minutes have no trades.
    public static readonly IReadOnlyDictionary<string, (int Horizon, int Count, string Interval)> Periods =
        new Dictionary<string, (int, int, string)> { ["1h"]=(1,120,"1m"), ["1d"]=(1,600,"1m"), ["5d"]=(15,1200,"15m"),
            ["1mo"]=(1440,40,"1d"), ["3mo"]=(1440,110,"1d"), ["6mo"]=(1440,210,"1d"),
            ["ytd"]=(1440,380,"1d"), ["1y"]=(1440,380,"1d"), ["5y"]=(10080,270,"1wk") };
    // Short ranges are polled while visible; this server freshness is shared by every client of the market projection.
    public static TimeSpan Freshness(string range)=>range is "1h" or "1d"?TimeSpan.FromSeconds(15):TimeSpan.FromSeconds(30);
    static readonly Dictionary<string,string> Aliases = new(StringComparer.OrdinalIgnoreCase) {
        ["MSFT"]="MSFT:xnas", ["AAPL"]="AAPL:xnas", ["NVDA"]="NVDA:xnas", ["AMZN"]="AMZN:xnas",
        ["GOOGL"]="GOOGL:xnas", ["META"]="META:xnas", ["TSLA"]="TSLA:xnas",
        ["SIE.DE"]="SIE:xetr", ["VWS.CO"]="VWS:xcse", ["GMAB.CO"]="GMAB:xcse",
        ["NOVO-B.CO"]="NOVOb:xcse", ["MAERSK-B.CO"]="MAERSKb:xcse", ["MAERSK-A.CO"]="MAERSKa:xcse" };
    async Task<(string Token,string Identity)> Access(CancellationToken ct)
    {
        SaxoAccess.RequireResearchAccess(workspace,host);
        if(config.GetValue<bool?>("Saxo:ReadEnabled")==false || !config.GetValue<bool>("Saxo:LIVE:ReadEnabled"))
            throw new ApiFailure(503,"SAXO_LIVE_READ_DISABLED");
        var token=await session.Token(ct,"LIVE");
        if(string.IsNullOrWhiteSpace(token))throw new ApiFailure(503,SignIn);
        ct.ThrowIfCancellationRequested();
        return (token,Vault.Hash(session.CacheIdentity("LIVE")+":"+token));
    }
    public async Task<MarketInstrument[]> Search(string query,CancellationToken ct)
    {
        Check.That(!string.IsNullOrWhiteSpace(query)&&query.Length<=80,"INVALID_MARKET_SEARCH");
        var access=await Access(ct);
        try{return await Search(query.Trim(),access.Token,access.Identity,ct);}
        catch(ApiFailure ex) when(ex.Details is MarketDiagnostic d){throw Fail(ex.Status,d);}
    }
    async Task<MarketInstrument[]> Search(string query,string token,string identity,CancellationToken ct)
    {
        var key="saxo-market-search:"+identity+":"+query.ToUpperInvariant();
        if(cache.TryGetValue<MarketInstrument[]>(key,out var saved))return saved!;
        var json=await Get("search","ref/v1/instruments?AssetTypes=Stock,Etf&$top=100&Keywords="+Uri.EscapeDataString(query),token,identity,ct);
        var rows=Child(json,"Data");
        if(rows.ValueKind!=JsonValueKind.Array)throw new ApiFailure(502,Unavailable,Record(new("search",Unavailable,200,null),null,null));
        var result=rows.EnumerateArray().Where(x=>Text(x,"AssetType") is "Stock" or "Etf" && ValidUic(x) && SymbolPattern().IsMatch(Text(x,"Symbol")??""))
            .Select(x=>new MarketInstrument(Text(x,"Symbol")!,Text(x,"Description")??Text(x,"Symbol")!,Text(x,"ExchangeId")??"Unknown",Text(x,"AssetType")!,(int)Number(x,"Identifier")!))
            .DistinctBy(x=>(x.Symbol.ToUpperInvariant(),x.Kind,x.Uic)).Take(100).ToArray();
        cache.Set(key,result,TimeSpan.FromMinutes(15));return result;
    }
    // Exact LIVE listing: the venue-qualified symbol must match one search result. Never guess between venues.
    async Task<MarketInstrument> Resolve(string target,string token,string identity,CancellationToken ct)
    {
        var found=await Search(target.Split(':')[0],token,identity,ct);
        var matches=found.Where(x=>x.Symbol.Equals(target,StringComparison.OrdinalIgnoreCase)).ToArray();
        if(matches.Length==0&&!target.Contains(':'))matches=found.Where(x=>x.Symbol.Split(':')[0].Equals(target,StringComparison.OrdinalIgnoreCase)).ToArray();
        if(matches.Length!=1)throw new ApiFailure(422,ListingRequired);
        return matches[0];
    }
    public async Task<MarketSnapshot> Chart(string symbol,string range,CancellationToken ct)=>ForAudience(await ChartFor(symbol,range,ct));
    // The one place where who may see which market data is decided, after the shared cache (Demo and owner share it).
    // Today every Saxo quote is delayed (15 min) and Dan authorized the delayed projection for Demo, so this passes it through.
    // Open item (docs/saxo-market-data.md): real-time exchange data needs a paid subscription plus an upgraded API session,
    // and under a non-professional subscription is usually personal use only. Apply an owner-only rule here before that.
    MarketSnapshot ForAudience(MarketSnapshot snapshot)=>snapshot;
    async Task<MarketSnapshot> ChartFor(string symbol,string range,CancellationToken ct)
    {
        Check.That(SymbolPattern().IsMatch(symbol),"INVALID_MARKET_SYMBOL");
        Check.That(Periods.ContainsKey(range),"INVALID_MARKET_RANGE");
        var access=await Access(ct); // Never return another identity's or a disconnected session's cache.
        var target=Aliases.GetValueOrDefault(symbol,symbol);
        var key="saxo-market-chart:"+access.Identity+":"+target.ToUpperInvariant()+":"+range;
        cache.TryGetValue<MarketSnapshot>(key,out var saved);
        if(saved is not null&&clock.GetUtcNow()-saved.RetrievedAt<Freshness(range))return saved;
        MarketInstrument instrument;
        try{instrument=await Resolve(target,access.Token,access.Identity,ct);}
        catch(ApiFailure ex) when(ex.Details is MarketDiagnostic d)
        {
            if(d.Code is SignIn or NoAccess or Rejected){cache.Remove(key);throw Fail(ex.Status,d);}
            if(saved is not null)return AsStale(saved,[d]);
            throw Fail(502,d);
        }
        catch(ApiFailure ex) when(ex.Code==ListingRequired){cache.Remove(key);throw;}
        catch(Exception ex) when(!ct.IsCancellationRequested&&(ex is HttpRequestException or JsonException or TaskCanceledException))
        {
            var d=Record(new("search",Unavailable),null,null);
            if(saved is not null)return AsStale(saved,[d]);
            throw Fail(502,d);
        }
        var args="AssetType="+instrument.Kind+"&Uic="+instrument.Uic;var period=Periods[range];
        // History and quote are requested independently: one failing must not discard the other.
        // Saxo defines Mode only together with Time; without both, chart/v3 returns the latest samples up to now.
        var history=await Attempt("history","chart/v3/charts?"+args+"&Horizon="+period.Horizon+"&Count="+period.Count+"&FieldGroups=ChartInfo,Data,DisplayAndFormat",access,ct);
        if(history.Failure?.Code==SignIn){cache.Remove(key);throw Fail(502,history.Failure);}
        var quote=await Attempt("quote","trade/v1/infoprices?"+args+"&FieldGroups=Quote,PriceInfoDetails,DisplayAndFormat",access,ct);
        if(quote.Failure?.Code==SignIn){cache.Remove(key);throw Fail(502,quote.Failure);}
        if(history.Json is null&&quote.Json is null)
        {
            MarketDiagnostic[] failures=[history.Failure!,quote.Failure!];
            // Denial removes cached data so later transient errors cannot resurrect it.
            if(failures.Any(x=>x.Code==NoAccess)){cache.Remove(key);throw new ApiFailure(502,NoAccess,new MarketFailureDetails("Saxo LIVE",failures));}
            if(saved is not null)return AsStale(saved,failures);
            throw new ApiFailure(502,failures.Any(x=>x.Code==RateLimited)?RateLimited:failures.All(x=>x.Code==Rejected)?Rejected:Unavailable,new MarketFailureDetails("Saxo LIVE",failures));
        }
        try
        {
            var result=Compose(history.Json,quote.Json,instrument,range,clock.GetUtcNow(),history.Failure,quote.Failure,saved);
            if(history.Json is not null&&result.HistorySamples is {} s&&(s.Dropped.Total>0||s.MissingIntervals>0))
                log?.Log(s.Dropped.Total>0?LogLevel.Information:LogLevel.Debug,
                    "saxo_market_samples range={Range} received={Received} kept={Kept} outside_period={Outside} dropped={Dropped} missing_intervals={Missing}",
                    range,s.Received,s.Kept,s.OutsidePeriod,s.Dropped.Total>0?string.Join(',',new[]{("missing_time",s.Dropped.MissingTime),("future_time",s.Dropped.FutureTime),
                        ("missing_price",s.Dropped.MissingPrice),("quote_only",s.Dropped.QuoteOnly),("non_positive",s.Dropped.NonPositivePrice),
                        ("inconsistent_range",s.Dropped.InconsistentRange),("duplicate_time",s.Dropped.DuplicateTime)}.Where(x=>x.Item2>0).Select(x=>x.Item1+":"+x.Item2)):"none",
                    s.MissingIntervals?.ToString(CultureInfo.InvariantCulture)??"n/a");
            cache.Set(key,result,TimeSpan.FromHours(24));return result;
        }
        catch(ApiFailure ex) when(ex.Code==Mismatch){cache.Remove(key);throw new ApiFailure(502,Mismatch,new MarketFailureDetails("Saxo LIVE",[new("history",Mismatch)]));}
    }
    static MarketSnapshot AsStale(MarketSnapshot saved,MarketDiagnostic[] failures)=>saved with {Stale=true,Warning=StaleWarning,
        HistoryStatus=saved.HistoryStatus is "available" or "stale"?"stale":saved.HistoryStatus,
        QuoteStatus=saved.QuoteStatus is "available" or "stale"?"stale":saved.QuoteStatus,
        HistoryRetrievedAt=saved.HistoryRetrievedAt??(saved.Bars.Length>0?saved.RetrievedAt:null),Diagnostics=failures};
    async Task<(JsonElement? Json,MarketDiagnostic? Failure)> Attempt(string operation,string path,(string Token,string Identity) access,CancellationToken ct)
    {
        try{return (await Get(operation,path,access.Token,access.Identity,ct),null);}
        catch(ApiFailure ex) when(ex.Details is MarketDiagnostic d){return (null,d);}
        catch(Exception ex) when(!ct.IsCancellationRequested&&(ex is HttpRequestException or JsonException or TaskCanceledException))
        {return (null,Record(new(operation,Unavailable),null,null));}
    }
    static ApiFailure Fail(int status,MarketDiagnostic d)=>new(status,d.Code,new MarketFailureDetails("Saxo LIVE",[d]));
    async Task<JsonElement> Get(string operation,string path,string token,string identity,CancellationToken ct)
    {
        using var request=new HttpRequestMessage(HttpMethod.Get,"https://gateway.saxobank.com/openapi/"+path);
        request.Headers.Authorization=new AuthenticationHeaderValue("Bearer",token);
        var memo="saxo-market-diagnostic:"+identity+":"+operation+":"+Instrument(path);
        HttpResponseMessage response;
        try {response=await http.SendAsync(request,HttpCompletionOption.ResponseHeadersRead,ct);}
        catch(ApiFailure ex) when(ex.Code is "SAXO_SIGN_IN_REQUIRED" or "SAXO_PERMISSION_REQUIRED" or "SAXO_PROVIDER_UNAVAILABLE" or "SAXO_RATE_LIMITED")
        {
            // A request-budget cooldown keeps the semantics and provider code of the response that started it.
            var code=ex.Code switch {"SAXO_SIGN_IN_REQUIRED"=>SignIn,"SAXO_PERMISSION_REQUIRED"=>NoAccess,"SAXO_RATE_LIMITED"=>RateLimited,_=>Unavailable};
            var earlier=cache.TryGetValue<MarketDiagnostic>(memo,out var m)&&m!.Code==code?m:null;
            throw new ApiFailure(502,code,Record(new(operation,code,earlier?.Status,earlier?.ProviderCode,true),null,null));
        }
        using(response)
        {
            var status=(int)response.StatusCode;
            if(!response.IsSuccessStatusCode)
            {
                var (provider,fields)=await ProviderError(response,ct);
                // Only explicit provider evidence turns a non-403 response into an access denial.
                var code=status switch {401=>SignIn,403=>NoAccess,429=>RateLimited,400 or 404 or 422=>Rejected,_=>Unavailable};
                if(code is Rejected or Unavailable&&provider?.Contains("Access",StringComparison.OrdinalIgnoreCase)==true)code=NoAccess;
                throw new ApiFailure(502,code,Record(new(operation,code,status,provider,false,code==Rejected?fields:null),memo,status));
            }
            await response.Content.LoadIntoBufferAsync(4_000_000,ct);
            var json=JsonSerializer.Deserialize<JsonElement>(await response.Content.ReadAsStringAsync(ct));
            if(Text(json,"ErrorCode") is {Length:>0} error && error!="None")
            {
                var provider=Sanitize(error);var code=error.Contains("Access",StringComparison.OrdinalIgnoreCase)?NoAccess:Unavailable;
                throw new ApiFailure(502,code,Record(new(operation,code,status,provider),memo,status));
            }
            return json;
        }
    }
    MarketDiagnostic Record(MarketDiagnostic d,string? memo,int? status)
    {
        if(memo is not null&&d.Code is NoAccess or SignIn or RateLimited)cache.Set(memo,d,TimeSpan.FromMinutes(10));
        // Cooldown repeats are expected while polling; only the originating failure is a warning.
        log?.Log(d.Cooldown?LogLevel.Debug:LogLevel.Warning,"saxo_market_failure operation={Operation} status={Status} code={Code} provider_code={ProviderCode} fields={Fields} cooldown={Cooldown}",
            d.Operation,d.Status,d.Code,d.ProviderCode??"none",d.Fields is {Length:>0}?string.Join(',',d.Fields):"none",d.Cooldown);
        return d;
    }
    static string Instrument(string path){var q=path.IndexOf('?');if(q<0)return "";var p=Microsoft.AspNetCore.WebUtilities.QueryHelpers.ParseQuery(path[q..]);return p.TryGetValue("Uic",out var u)?p["AssetType"].ToString()+":"+u.ToString():"";}
    static string? Sanitize(string? code)=>code is not null&&ProviderCodePattern().IsMatch(code)?code:null;
    static async Task<(string? Code,string[]? Fields)> ProviderError(HttpResponseMessage response,CancellationToken ct)
    {
        try
        {
            await response.Content.LoadIntoBufferAsync(64_000,ct);
            var json=JsonSerializer.Deserialize<JsonElement>(await response.Content.ReadAsStringAsync(ct));
            var model=Child(json,"ModelState");
            var fields=model.ValueKind==JsonValueKind.Object
                ?model.EnumerateObject().Select(x=>Sanitize(x.Name)).OfType<string>().Distinct(StringComparer.OrdinalIgnoreCase).Take(5).ToArray():[];
            return (Sanitize(Text(json,"ErrorCode")),fields.Length>0?fields:null);
        }
        catch(Exception ex) when(ex is JsonException or HttpRequestException or InvalidOperationException or NotSupportedException){return (null,null);}
    }
    static bool ValidUic(JsonElement row)=>Number(row,"Identifier") is {} n && n>0 && n<=int.MaxValue && n==decimal.Truncate(n);
    static JsonElement Child(JsonElement e,string key)=>e.ValueKind==JsonValueKind.Object&&e.TryGetProperty(key,out var x)?x:default;
    static string? Text(JsonElement e,string key)=>Child(e,key) is {ValueKind:JsonValueKind.String} x?x.GetString():null;
    static decimal? Number(JsonElement e,string key)=>Child(e,key) is {ValueKind:JsonValueKind.Number} x&&x.TryGetDecimal(out var n)?n:null;
    static DateTimeOffset? Time(JsonElement e,string key)=>DateTimeOffset.TryParse(Text(e,key),CultureInfo.InvariantCulture,DateTimeStyles.AssumeUniversal,out var t)?t:null;
    public static MarketSnapshot Map(JsonElement json,JsonElement quote,MarketInstrument instrument,string range,DateTimeOffset retrieved,string? warning=null)=>
        Compose(json,quote,instrument,range,retrieved,null,warning is null?null:new("quote",warning));
    // Keeps every well-formed trade sample exactly as Saxo sent it and counts each rejected one by reason.
    // Malformed samples are omitted, never repaired, and gaps are never filled.
    static (MarketBar[] Bars,MarketSampleSummary Summary)? Bars(JsonElement json,string range,DateTimeOffset retrieved)
    {
        var bars=new SortedDictionary<long,MarketBar>();var rows=Child(json,"Data");
        if(rows.ValueKind!=JsonValueKind.Array)return null;
        int received=0,missingTime=0,future=0,missingPrice=0,quoteOnly=0,nonPositive=0,inconsistent=0,duplicate=0;
        foreach(var row in rows.EnumerateArray()) {
            received++;
            var o=Number(row,"Open");var h=Number(row,"High");var l=Number(row,"Low");var c=Number(row,"Close");var t=Time(row,"Time");
            if(t is null){missingTime++;continue;}
            if(t>retrieved){future++;continue;}
            if(o is null||h is null||l is null||c is null)
            {
                // Bid/ask samples are quotes, not trades; mixing them into a trade series would misrepresent the chart.
                if(new[]{"OpenBid","HighBid","LowBid","CloseBid","OpenAsk","HighAsk","LowAsk","CloseAsk"}.Any(k=>Number(row,k) is not null))quoteOnly++;
                else missingPrice++;
                continue;
            }
            if(o<=0||h<=0||l<=0||c<=0){nonPositive++;continue;}
            if(h<Math.Max(o.Value,c.Value)||l>Math.Min(o.Value,c.Value)){inconsistent++;continue;}
            var key=t.Value.ToUnixTimeSeconds();if(bars.ContainsKey(key))duplicate++;
            var v=Number(row,"Volume");bars[key]=new(key,o.Value,h.Value,l.Value,c.Value,v>=0?v:null);
        }
        var ordered=bars.Values.ToArray();MarketBar[] kept;int? missing=null;
        static DateTime Day(long time)=>DateTimeOffset.FromUnixTimeSeconds(time).UtcDateTime.Date;
        // Intraday ranges use actual returned trading dates, so weekends do not empty the chart.
        if(range is "1h" or "1d" or "5d") {
            if(range=="1h") {
                // The latest hour of returned samples, which after the close is the last hour of that session.
                var end=ordered.Length>0?ordered[^1].Time:0;
                kept=ordered.Where(x=>x.Time>end-3600).ToArray();
            }
            else {
                var dates=ordered.Select(x=>Day(x.Time)).Distinct().TakeLast(range=="1d"?1:5).ToHashSet();
                kept=ordered.Where(x=>dates.Contains(Day(x.Time))).ToArray();
            }
            long step=Periods[range].Horizon*60L;missing=0;
            for(var i=1;i<kept.Length;i++)
                if(Day(kept[i].Time)==Day(kept[i-1].Time)&&kept[i].Time-kept[i-1].Time>step)missing+=(int)((kept[i].Time-kept[i-1].Time)/step-1);
        }
        else {
            var start=range switch {"1mo"=>retrieved.AddMonths(-1),"3mo"=>retrieved.AddMonths(-3),"6mo"=>retrieved.AddMonths(-6),"ytd"=>new DateTimeOffset(retrieved.Year,1,1,0,0,0,TimeSpan.Zero),"1y"=>retrieved.AddYears(-1),_=>retrieved.AddYears(-5)};
            kept=ordered.Where(x=>x.Time>=new DateTimeOffset(start.Date,TimeSpan.Zero).ToUnixTimeSeconds()).ToArray();
        }
        return (kept,new(received,kept.Length,ordered.Length-kept.Length,new(missingTime,future,missingPrice,quoteOnly,nonPositive,inconsistent,duplicate),missing));
    }
    public static MarketSnapshot Compose(JsonElement? history,JsonElement? quote,MarketInstrument instrument,string range,DateTimeOffset retrieved,
        MarketDiagnostic? historyFailure=null,MarketDiagnostic? quoteFailure=null,MarketSnapshot? previous=null)
    {
        var diagnostics=new List<MarketDiagnostic>();
        MarketBar[] bars=[];string historyStatus;DateTimeOffset? historyAt=null;string? currency=null,exchange=null;decimal? chartDelay=null;MarketSampleSummary? samples=null;
        static decimal? DelayMinutes(JsonElement e)=>Number(e,"DelayedByMinutes") is {} n&&n>=0?n:null;
        if(history is {} h)
        {
            var parsed=Bars(h,range,retrieved);var chartInfo=Child(h,"ChartInfo");
            currency=Text(Child(h,"DisplayAndFormat"),"Currency");exchange=Text(chartInfo,"ExchangeId");chartDelay=DelayMinutes(chartInfo);
            if((parsed is {Bars.Length:>0}&&string.IsNullOrWhiteSpace(currency)) ||
                (exchange is {Length:>0}&&instrument.Exchange!="Unknown"&&!exchange.Equals(instrument.Exchange,StringComparison.OrdinalIgnoreCase)))
                throw new ApiFailure(502,Mismatch);
            if(parsed is null){historyStatus="unavailable";diagnostics.Add(new("history",Unavailable,200));chartDelay=null;}
            else{bars=parsed.Value.Bars;samples=parsed.Value.Summary;historyStatus=bars.Length>0?"available":"empty";historyAt=retrieved;}
        }
        else
        {
            if(historyFailure is not null)diagnostics.Add(historyFailure);
            // Only a transient history failure may reuse earlier bars, and only explicitly as stale.
            if(historyFailure?.Code is not NoAccess&&previous is {HistoryStatus:"available" or "stale"}&&previous.Bars.Length>0)
            {bars=previous.Bars;historyStatus="stale";historyAt=previous.HistoryRetrievedAt??previous.RetrievedAt;currency=previous.Currency;chartDelay=previous.ChartDelayMinutes;samples=previous.HistorySamples;}
            else historyStatus=historyFailure?.Code==NoAccess?"denied":"unavailable";
        }
        decimal? price=null,previousClose=null,quoteDelay=null;DateTimeOffset? time=null;string quoteStatus;string? warning=null;
        if(quote is {} q)
        {
            var info=Child(q,"PriceInfoDetails");var body=Child(q,"Quote");var quoteCurrency=Text(Child(q,"DisplayAndFormat"),"Currency");
            quoteDelay=DelayMinutes(body);
            var denied=new[]{Text(body,"PriceTypeAsk"),Text(body,"PriceTypeBid"),Text(q,"ErrorCode")}.Any(x=>x?.Contains("NoAccess",StringComparison.OrdinalIgnoreCase)==true);
            // A quote is displayable only in a verified currency that agrees with the chart's, if any.
            var mismatched=quoteCurrency is {Length:>0}&&currency is {Length:>0}&&!currency.Equals(quoteCurrency,StringComparison.OrdinalIgnoreCase)
                || string.IsNullOrWhiteSpace(quoteCurrency)&&string.IsNullOrWhiteSpace(currency);
            if(denied){quoteStatus="denied";warning=NoAccess;diagnostics.Add(new("quote",NoAccess,200,"NoAccess"));}
            else if(mismatched){quoteStatus="mismatch";warning=Mismatch;}
            else
            {
                price=Number(info,"LastTraded");time=Time(q,"LastUpdated");
                // LastUpdated is the provider snapshot time, not the trade execution timestamp.
                if(price<=0||time is null||time>retrieved)price=null;
                if(price is null)time=null;
                previousClose=Number(info,"LastClose") is {} c&&c>0?c:null;
                quoteStatus=price is null?"unavailable":"available";
                if(price is null)warning="SAXO_MARKET_QUOTE_UNAVAILABLE";
            }
            currency??=quoteCurrency;
        }
        else
        {
            if(quoteFailure is not null)diagnostics.Add(quoteFailure);
            quoteStatus=quoteFailure?.Code==NoAccess?"denied":"unavailable";
            warning=quoteFailure?.Code==NoAccess?NoAccess:quoteFailure?.Code is {} code&&code!=Unavailable?code:"SAXO_MARKET_QUOTE_UNAVAILABLE";
        }
        warning??=historyStatus switch {"denied"=>"SAXO_MARKET_HISTORY_NO_ACCESS","unavailable"=>"SAXO_MARKET_HISTORY_UNAVAILABLE","stale"=>"SAXO_MARKET_HISTORY_STALE",_=>null};
        // Zero is only "no reported delay": Saxo real-time needs a paid subscription and an upgraded session (docs/saxo-market-data.md).
        static string Delay(decimal? minutes)=>minutes is null?"delay unknown":minutes>0?$"delayed {minutes.Value.ToString(CultureInfo.InvariantCulture)} min":"no reported delay";
        var delayText="Chart: "+Delay(chartDelay)+"; quote: "+Delay(quoteDelay)+". Not an execution quote.";
        return new(instrument.Symbol,instrument.Name,currency??"Unknown",exchange??instrument.Exchange,range,Periods[range].Interval,"Saxo LIVE",
            "Last traded price; quote time is Saxo snapshot update time",retrieved,time,price,previousClose,delayText,bars,historyStatus=="stale",warning,
            chartDelay,quoteDelay,historyStatus,quoteStatus,historyAt,instrument.Kind,diagnostics.Count>0?diagnostics.ToArray():null,samples,quote is {} stateQuote?State(Child(stateQuote,"Quote")):null);
    }
}
