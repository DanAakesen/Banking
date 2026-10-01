using System.Net;
using System.Text.Json;
using Banking.Api.Providers;
using Banking.Api.Security;
using Banking.Api.Services;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;

namespace Banking.Tests;

public sealed class SaxoMarketDataTests
{
    const string Bars="""{"ChartInfo":{"ExchangeId":"xnas","DelayedByMinutes":15},"DisplayAndFormat":{"Currency":"USD"},"Data":[{"Time":"2026-09-25T14:00:00Z","Open":10,"High":13,"Low":9,"Close":12,"Volume":100},{"Time":"2026-09-25T14:05:00Z","Open":null,"High":15,"Low":10,"Close":13},{"Time":"2026-09-25T14:10:00Z","Open":20,"High":19,"Low":18,"Close":21},{"Time":"2026-09-25T14:00:00Z","Open":11,"High":14,"Low":10,"Close":13}]}""";
    const string Quote="""{"LastUpdated":"2026-09-28T14:00:00Z","PriceInfoDetails":{"LastTraded":14,"LastClose":13},"Quote":{"DelayedByMinutes":15,"PriceTypeBid":"OldIndicative","PriceTypeAsk":"OldIndicative"}}""";
    // The provider requests DisplayAndFormat, so a real info price carries its currency.
    static readonly string LiveQuote=Quote.Replace("{\"LastUpdated\"","{\"DisplayAndFormat\":{\"Currency\":\"USD\"},\"LastUpdated\"");
    static readonly DateTimeOffset Now=DateTimeOffset.Parse("2026-09-28T14:10:00Z");
    static JsonElement Json(string value)=>JsonSerializer.Deserialize<JsonElement>(value);
    static MarketSnapshot Map(string quote=Quote,string bars=Bars,string range="1mo")=>SaxoMarketDataProvider.Map(Json(bars),Json(quote),new("MSFT:xnas","Microsoft","xnas","Stock",123),range,Now);

    [Fact] public void Saxo_mapping_filters_invalid_bars_and_preserves_source_currency_delay_and_timestamp()
    {
        var result=Map();var bar=Assert.Single(result.Bars);
        Assert.Equal(13,bar.Close);Assert.Null(bar.Volume);Assert.Equal("USD",result.Currency);
        Assert.Equal("Saxo LIVE",result.Source);Assert.Equal(14,result.Price);Assert.Equal(13,result.PreviousClose);
        Assert.Equal(DateTimeOffset.Parse("2026-09-28T14:00:00Z"),result.QuoteTime);Assert.Contains("15",result.Delay);
        Assert.Equal(new MarketSampleSummary(4,1,0,new(MissingPrice:1,InconsistentRange:1,DuplicateTime:1),null),result.HistorySamples);
    }
    [Fact] public void Every_well_formed_sample_is_kept_unchanged_and_each_rejection_is_counted_by_reason()
    {
        const string rows="""
        {"ChartInfo":{"ExchangeId":"xnas"},"DisplayAndFormat":{"Currency":"USD"},"Data":[
         {"Time":"2026-09-21T00:00:00Z","Open":10,"High":11,"Low":9,"Close":10.5,"Volume":0},
         {"Time":"2026-09-22T00:00:00.0000000Z","Open":10,"High":10,"Low":10,"Close":10},
         {"Time":"2026-09-23T02:00:00+02:00","Open":10,"High":12,"Low":9,"Close":11,"Volume":5,"MarketTradingState":"Automated","CloseBid":10.9,"CloseAsk":11.1},
         {"Open":10,"High":11,"Low":9,"Close":10},{"Time":"not-a-time","Open":10,"High":11,"Low":9,"Close":10},5,
         {"Time":"2026-09-29T00:00:00Z","Open":10,"High":11,"Low":9,"Close":10},
         {"Time":"2026-09-24T00:00:00Z","Close":10,"Volume":0},
         {"Time":"2026-09-24T12:00:00Z","OpenBid":10,"HighBid":11,"LowBid":9,"CloseBid":10,"OpenAsk":10.1,"HighAsk":11.1,"LowAsk":9.1,"CloseAsk":10.1},
         {"Time":"2026-09-25T00:00:00Z","Open":10,"High":11,"Low":0,"Close":10},
         {"Time":"2026-09-25T12:00:00Z","Open":10,"High":10.5,"Low":9,"Close":11},
         {"Time":"2026-07-01T00:00:00Z","Open":10,"High":11,"Low":9,"Close":10}]}
        """;
        var result=Map(bars:rows);
        Assert.Equal([DateTimeOffset.Parse("2026-09-21T00:00:00Z"),DateTimeOffset.Parse("2026-09-22T00:00:00Z"),DateTimeOffset.Parse("2026-09-23T00:00:00Z")],
            result.Bars.Select(x=>DateTimeOffset.FromUnixTimeSeconds(x.Time)));
        Assert.Equal(new MarketBar(DateTimeOffset.Parse("2026-09-21T00:00:00Z").ToUnixTimeSeconds(),10,11,9,10.5m,0),result.Bars[0]);
        Assert.Equal(new MarketBar(DateTimeOffset.Parse("2026-09-22T00:00:00Z").ToUnixTimeSeconds(),10,10,10,10,null),result.Bars[1]);
        var s=result.HistorySamples!;
        Assert.Equal(new MarketSampleDrops(MissingTime:3,FutureTime:1,MissingPrice:1,QuoteOnly:1,NonPositivePrice:1,InconsistentRange:1),s.Dropped);
        Assert.Equal((12,3,1,8),(s.Received,s.Kept,s.OutsidePeriod,s.Dropped.Total));Assert.Equal(s.Received,s.Kept+s.OutsidePeriod+s.Dropped.Total);
    }
    static string IntradayDays(Func<DateTimeOffset,string?> gapSample)
    {
        var rows=new List<string>();
        foreach(var day in new[]{"2026-09-25","2026-09-28"})
            for(var t=DateTimeOffset.Parse(day+"T07:00:00Z");t<=DateTimeOffset.Parse(day+"T14:00:00Z");t=t.AddMinutes(15))
            {
                var inGap=day=="2026-09-28"&&t>=DateTimeOffset.Parse(day+"T11:00:00Z")&&t<=DateTimeOffset.Parse(day+"T13:15:00Z");
                var stamp=t.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'",System.Globalization.CultureInfo.InvariantCulture);
                if(!inGap)rows.Add($$"""{"Time":"{{stamp}}","Open":200,"High":201,"Low":199,"Close":200.5,"Volume":1000}""");
                else if(gapSample(t) is {} odd)rows.Add(odd.Replace("TIME",stamp));
            }
        return """{"ChartInfo":{"ExchangeId":"xnas"},"DisplayAndFormat":{"Currency":"USD"},"Data":["""+string.Join(',',rows)+"]}";
    }
    [Theory]
    [InlineData("absent",0,0,0)]
    [InlineData("close-only",10,0,0)]
    [InlineData("quote-only",0,10,0)]
    [InlineData("inconsistent",0,0,10)]
    public void An_intraday_block_without_usable_samples_stays_an_honest_counted_gap(string kind,int missingPrice,int quoteOnly,int inconsistent)
    {
        var json=IntradayDays(_=>kind switch {
            "close-only"=>"""{"Time":"TIME","Close":200,"Volume":0}""",
            "quote-only"=>"""{"Time":"TIME","OpenBid":200,"HighBid":201,"LowBid":199,"CloseBid":200,"OpenAsk":200.1,"HighAsk":201.1,"LowAsk":199.1,"CloseAsk":200.1}""",
            "inconsistent"=>"""{"Time":"TIME","Open":200,"High":199,"Low":198,"Close":200.5,"Volume":10}""",
            _=>null});
        var result=Map(bars:json,range:"5d");var s=result.HistorySamples!;
        Assert.Equal(29+19,result.Bars.Length);Assert.Equal(10,s.MissingIntervals);
        Assert.Equal(new MarketSampleDrops(MissingPrice:missingPrice,QuoteOnly:quoteOnly,InconsistentRange:inconsistent),s.Dropped);
        var gapStart=DateTimeOffset.Parse("2026-09-28T11:00:00Z").ToUnixTimeSeconds();var gapEnd=DateTimeOffset.Parse("2026-09-28T13:15:00Z").ToUnixTimeSeconds();
        Assert.DoesNotContain(result.Bars,x=>x.Time>=gapStart&&x.Time<=gapEnd);
        Assert.All(result.Bars,x=>Assert.Equal((200m,201m,199m,200.5m,1000m),(x.Open,x.High,x.Low,x.Close,x.Volume!.Value)));
        Assert.Equal("available",result.HistoryStatus);Assert.Null(result.Diagnostics);
    }
    [Fact] public void Complete_intraday_days_report_no_missing_intervals_and_daily_ranges_do_not_guess_calendars()
    {
        var full=Map(bars:IntradayDays(t=>$$"""{"Time":"TIME","Open":200,"High":201,"Low":199,"Close":200.5,"Volume":1000}"""),range:"5d");
        Assert.Equal(58,full.Bars.Length);Assert.Equal(0,full.HistorySamples!.MissingIntervals);Assert.Equal(0,full.HistorySamples.Dropped.Total);
        Assert.Null(Map(range:"1mo").HistorySamples!.MissingIntervals);
    }
    [Fact] public void Sample_summary_serializes_counts_only()
    {
        var result=Map();var json=JsonSerializer.SerializeToElement(result,new JsonSerializerOptions(JsonSerializerDefaults.Web)).GetProperty("historySamples");
        Assert.Equal(new[]{"dropped","kept","missingIntervals","outsidePeriod","received"},json.EnumerateObject().Select(x=>x.Name).Order());
        Assert.Equal(new[]{"duplicateTime","futureTime","inconsistentRange","missingPrice","missingTime","nonPositivePrice","quoteOnly","total"},json.GetProperty("dropped").EnumerateObject().Select(x=>x.Name).Order());
        Assert.All(json.GetProperty("dropped").EnumerateObject(),x=>Assert.Equal(JsonValueKind.Number,x.Value.ValueKind));
    }
    [Theory]
    [InlineData("{}")]
    [InlineData("{\"LastUpdated\":\"2026-09-28T14:00:00Z\",\"PriceInfoDetails\":{\"LastTraded\":0}}")]
    [InlineData("{\"PriceInfoDetails\":{\"LastTraded\":14}}")]
    [InlineData("{\"LastUpdated\":\"2026-09-28T14:00:00Z\",\"PriceInfoDetails\":{\"LastTraded\":14},\"Quote\":{\"PriceTypeAsk\":\"NoAccess\"}}")]
    public void Missing_unstamped_or_denied_quotes_never_become_zero_or_chart_close(string quote)
    {
        var result=Map(quote);Assert.Null(result.Price);Assert.Null(result.QuoteTime);Assert.NotEmpty(result.Bars);Assert.NotNull(result.Warning);
    }
    [Fact] public void Intraday_chart_keeps_last_trading_day_over_a_weekend()
    { Assert.Single(Map(range:"1d").Bars); }
    [Fact] public void Periods_use_documented_saxo_horizons_and_counts_and_one_minute_covers_a_full_session()
    {
        int[] horizons=[1,2,3,5,10,15,30,60,120,180,240,300,360,480,1440,10080,43200,129600,518400];
        Assert.All(SaxoMarketDataProvider.Periods.Values,p=>{Assert.Contains(p.Horizon,horizons);Assert.InRange(p.Count,1,1200);});
        Assert.Equal((1,"1m"),(SaxoMarketDataProvider.Periods["1h"].Horizon,SaxoMarketDataProvider.Periods["1h"].Interval));
        Assert.Equal((1,"1m"),(SaxoMarketDataProvider.Periods["1d"].Horizon,SaxoMarketDataProvider.Periods["1d"].Interval));
        // XETRA 09:00–17:30 (510 min) is the longest of the NASDAQ (390), Copenhagen (480) and XETRA sessions.
        Assert.True(SaxoMarketDataProvider.Periods["1d"].Count>=510);Assert.True(SaxoMarketDataProvider.Periods["1h"].Count>=60);
        Assert.Equal(TimeSpan.FromSeconds(15),SaxoMarketDataProvider.Freshness("1h"));Assert.Equal(TimeSpan.FromSeconds(15),SaxoMarketDataProvider.Freshness("1d"));
        Assert.Equal(TimeSpan.FromSeconds(30),SaxoMarketDataProvider.Freshness("5d"));Assert.Equal(TimeSpan.FromSeconds(30),SaxoMarketDataProvider.Freshness("1y"));
    }
    static string Minutes(string from,string to,params string[] skip)
    {
        var rows=new List<string>();
        for(var t=DateTimeOffset.Parse(from);t<=DateTimeOffset.Parse(to);t=t.AddMinutes(1))
        {
            var stamp=t.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'",System.Globalization.CultureInfo.InvariantCulture);
            if(!skip.Any(s=>stamp.Contains(s)))rows.Add($$"""{"Time":"{{stamp}}","Open":100,"High":101,"Low":99,"Close":100.5,"Volume":10}""");
        }
        return string.Join(',',rows);
    }
    static string MinuteChart(string rows)=>"""{"ChartInfo":{"ExchangeId":"xnas","DelayedByMinutes":15},"DisplayAndFormat":{"Currency":"USD"},"Data":["""+rows+"]}";
    [Fact] public void One_hour_is_the_latest_hour_of_one_minute_samples_and_counts_missing_minutes()
    {
        // Now is 14:10 UTC; the latest sample is 14:09, so the hour is 13:10–14:09. 13:40–13:44 have no samples.
        var json=MinuteChart(Minutes("2026-09-25T13:30:00Z","2026-09-25T20:00:00Z")+","+Minutes("2026-09-28T12:00:00Z","2026-09-28T14:09:00Z","T13:40","T13:41","T13:42","T13:43","T13:44"));
        var result=Map(bars:json,range:"1h");
        Assert.Equal(55,result.Bars.Length);Assert.Equal("1m",result.Interval);
        Assert.Equal(DateTimeOffset.Parse("2026-09-28T13:10:00Z").ToUnixTimeSeconds(),result.Bars[0].Time);
        Assert.Equal(DateTimeOffset.Parse("2026-09-28T14:09:00Z").ToUnixTimeSeconds(),result.Bars[^1].Time);
        Assert.Equal(5,result.HistorySamples!.MissingIntervals);Assert.Equal(0,result.HistorySamples.Dropped.Total);
        var day=Map(bars:json,range:"1d");
        Assert.Equal(130-5,day.Bars.Length);Assert.Equal(5,day.HistorySamples!.MissingIntervals);
        Assert.All(day.Bars,x=>Assert.Equal(new DateTime(2026,9,28),DateTimeOffset.FromUnixTimeSeconds(x.Time).UtcDateTime.Date));
    }
    [Fact] public void One_hour_after_the_close_is_the_last_hour_of_the_last_session()
    {
        var result=Map(bars:MinuteChart(Minutes("2026-09-25T13:30:00Z","2026-09-25T19:59:00Z")),range:"1h");
        Assert.Equal(60,result.Bars.Length);Assert.Equal(DateTimeOffset.Parse("2026-09-25T19:00:00Z").ToUnixTimeSeconds(),result.Bars[0].Time);
        Assert.Equal(0,result.HistorySamples!.MissingIntervals);
    }
    [Theory]
    [InlineData("\"DelayedByMinutes\":15","delayed 15 min",15)]
    [InlineData("\"DelayedByMinutes\":0","no reported delay",0)]
    [InlineData("\"DelayedByMinutes\":null","delay unknown",null)]
    [InlineData("\"NoDelayField\":1","delay unknown",null)]
    public void Delay_values_are_never_presented_as_real_time(string delay,string text,int? minutes)
    {
        var result=Map(LiveQuote.Replace("\"DelayedByMinutes\":15",delay),Bars.Replace("\"DelayedByMinutes\":15",delay));
        Assert.Equal(minutes,(int?)result.QuoteDelayMinutes);Assert.Equal(minutes,(int?)result.ChartDelayMinutes);
        Assert.Equal($"Chart: {text}; quote: {text}. Not an execution quote.",result.Delay);Assert.DoesNotContain("real-time",result.Delay);
    }
    [Theory]
    [InlineData(0)]
    [InlineData(7)]
    [InlineData(null)]
    public void Chart_and_quote_keep_independent_reported_delays(int? quoteMinutes)
    {
        var body=LiveQuote.Replace("\"DelayedByMinutes\":15",$"\"DelayedByMinutes\":{quoteMinutes?.ToString()??"null"}");
        var result=Map(body);
        Assert.Equal(15,result.ChartDelayMinutes);Assert.Equal((decimal?)quoteMinutes,result.QuoteDelayMinutes);
        Assert.Equal(Now,result.HistoryRetrievedAt);Assert.Equal(Now,result.RetrievedAt);
    }
    [Fact] public async Task Short_ranges_share_a_fifteen_second_projection_and_longer_ranges_thirty_seconds()
    {
        using var f=new Fixture();var p=f.Provider();var demo=f.Provider(new Workspace());
        await p.Chart("MSFT","1d",default);await p.Chart("MSFT","1mo",default);var count=f.Broker.Requests.Count;
        f.Clock.Now=f.Clock.Now.AddSeconds(14);await demo.Chart("MSFT","1d",default);await p.Chart("MSFT","1mo",default);
        Assert.Equal(count,f.Broker.Requests.Count);
        f.Clock.Now=f.Clock.Now.AddSeconds(2);await demo.Chart("MSFT","1d",default);await p.Chart("MSFT","1mo",default);
        Assert.Equal(count+2,f.Broker.Requests.Count);
        Assert.Contains(f.Broker.Requests.Skip(count),r=>r.Url.Contains("/chart/v3/charts?")&&r.Url.Contains("Horizon=1&"));
        f.Clock.Now=f.Clock.Now.AddSeconds(15);await p.Chart("MSFT","1mo",default);
        Assert.Equal(count+4,f.Broker.Requests.Count);
    }
    [Fact] public async Task All_ranges_use_only_live_saxo_GETs_and_validate_inputs()
    {
        using var f=new Fixture();var provider=f.Provider();
        await Assert.ThrowsAsync<ApiFailure>(()=>provider.Chart("https://evil.test","1mo",default));
        await Assert.ThrowsAsync<ApiFailure>(()=>provider.Chart("MSFT","forever",default));Assert.Empty(f.Broker.Requests);
        foreach(var range in SaxoMarketDataProvider.Periods.Keys)Assert.Equal("Saxo LIVE",(await provider.Chart("MSFT",range,default)).Source);
        Assert.All(f.Broker.Requests,r=>{Assert.Equal("GET",r.Method);Assert.StartsWith("https://gateway.saxobank.com/openapi/",r.Url);Assert.Equal("Bearer synthetic-LIVE",r.Auth);});
        Assert.Contains(f.Broker.Requests,r=>r.Url.Contains("Horizon=10080"));
        Assert.Contains(f.Broker.Requests,r=>r.Url.Contains("Uic=123"));
        // Saxo defines Mode only together with Time; a lone Mode was rejected in LIVE as InvalidModelState.
        Assert.All(f.Broker.Requests.Where(r=>r.Url.Contains("/chart/v3/charts?")),r=>{
            var q=Microsoft.AspNetCore.WebUtilities.QueryHelpers.ParseQuery(new Uri(r.Url).Query);
            Assert.Equal(q.ContainsKey("Mode"),q.ContainsKey("Time"));
            Assert.True(int.Parse(q["Count"]!)<=1200);
        });
    }
    [Fact] public async Task Rejected_request_reports_only_sanitized_model_state_field_names()
    {
        using var f=new Fixture();f.Broker.ChartStatus=HttpStatusCode.BadRequest;
        f.Broker.ChartError="""{"ErrorCode":"InvalidModelState","Message":"Account private-account invalid","ModelState":{"Time":["Time private-account is required"],"Bad key!":["x"],"Mode":["y"]}}""";
        var result=await f.Provider().Chart("MSFT","1mo",default);
        Assert.Equal("unavailable",result.HistoryStatus);Assert.Equal("available",result.QuoteStatus);Assert.Equal(14,result.Price);
        var d=Assert.Single(result.Diagnostics!);
        Assert.Equal(("history","SAXO_MARKET_REQUEST_REJECTED",400,"InvalidModelState"),(d.Operation,d.Code,d.Status,d.ProviderCode));
        Assert.Equal(["Time","Mode"],d.Fields!);
        var output=JsonSerializer.Serialize(result);Assert.DoesNotContain("private-account",output);Assert.DoesNotContain("is required",output);Assert.DoesNotContain("Bad key",output);
    }
    [Fact] public async Task Authorization_and_kill_switch_run_before_cache_and_disconnect_does_not_leak_cached_data()
    {
        using var f=new Fixture();await f.Provider().Chart("MSFT","1mo",default);var count=f.Broker.Requests.Count;
        var demo=new Workspace();Assert.Equal("Saxo LIVE",(await f.Provider(demo).Chart("MSFT","1mo",default)).Source);
        var outsider=new Workspace();outsider.Select("Live");Assert.Equal("SAXO_PRIVATE_ACCESS_REQUIRED",(await Assert.ThrowsAsync<ApiFailure>(()=>f.Provider(outsider).Search("MSFT",default))).Code);
        f.Config["Saxo:LIVE:ReadEnabled"]="false";Assert.Equal("SAXO_LIVE_READ_DISABLED",(await Assert.ThrowsAsync<ApiFailure>(()=>f.Provider().Chart("MSFT","1mo",default))).Code);
        f.Config["Saxo:LIVE:ReadEnabled"]="true";await f.Session.Disconnect("LIVE",default);
        Assert.Equal("SAXO_MARKET_SIGN_IN_REQUIRED",(await Assert.ThrowsAsync<ApiFailure>(()=>f.Provider().Chart("MSFT","1mo",default))).Code);Assert.Equal(count,f.Broker.Requests.Count);
    }
    [Fact] public async Task Demo_feed_is_a_market_only_projection_and_cannot_request_private_live_paths()
    {
        using var f=new Fixture();var p=f.Provider(new Workspace());
        await p.Search("MSFT",default);var snapshot=await p.Chart("MSFT","1mo",default);
        var output=JsonSerializer.Serialize(snapshot);
        foreach(var secret in new[]{"synthetic-LIVE","private-account","private-position","private-order"})Assert.DoesNotContain(secret,output);
        Assert.All(f.Broker.Requests,r=>Assert.True(r.Url.Contains("/ref/v1/instruments?")||r.Url.Contains("/chart/v3/charts?")||r.Url.Contains("/trade/v1/infoprices?")));
        foreach(var symbol in new[]{"../port/v1/accounts/me","https://gateway.saxobank.com/openapi/port/v1/positions/me","MSFT?AccountKey=private-account"})
            await Assert.ThrowsAsync<ApiFailure>(()=>p.Chart(symbol,"1mo",default));
    }
    [Fact] public async Task Transient_history_failure_keeps_fresh_quote_and_only_explicitly_stale_bars_but_denial_clears_them()
    {
        using var f=new Fixture();var p=f.Provider();var fresh=await p.Chart("MSFT","1mo",default);f.Clock.Now=f.Clock.Now.AddMinutes(2);
        Assert.Equal("available",fresh.HistoryStatus);Assert.Equal(fresh.RetrievedAt,fresh.HistoryRetrievedAt);
        f.Broker.ChartStatus=HttpStatusCode.ServiceUnavailable;var stale=await p.Chart("MSFT","1mo",default);
        Assert.True(stale.Stale);Assert.Equal("stale",stale.HistoryStatus);Assert.Equal(fresh.RetrievedAt,stale.HistoryRetrievedAt);
        Assert.Equal(fresh.Bars,stale.Bars);Assert.Equal("available",stale.QuoteStatus);Assert.Equal(14,stale.Price);Assert.Equal(f.Clock.Now,stale.RetrievedAt);
        Assert.NotNull(fresh.HistorySamples);Assert.Equal(fresh.HistorySamples,stale.HistorySamples);
        Assert.Equal(fresh.ChartDelayMinutes,stale.ChartDelayMinutes);Assert.Equal(fresh.QuoteDelayMinutes,stale.QuoteDelayMinutes);
        f.Clock.Now=f.Clock.Now.AddMinutes(1);f.Broker.ChartStatus=HttpStatusCode.Forbidden;
        var denied=await p.Chart("MSFT","1mo",default);
        Assert.Equal("denied",denied.HistoryStatus);Assert.Empty(denied.Bars);Assert.False(denied.Stale);Assert.Null(denied.HistoryRetrievedAt);Assert.Equal(14,denied.Price);
        f.Clock.Now=f.Clock.Now.AddMinutes(1);f.Broker.ChartStatus=HttpStatusCode.ServiceUnavailable;
        var after=await p.Chart("MSFT","1mo",default);
        Assert.Equal("unavailable",after.HistoryStatus);Assert.Empty(after.Bars);Assert.Equal(14,after.Price);
    }
    [Fact] public async Task History_denied_keeps_independent_quote_and_sanitized_provider_code()
    {
        using var f=new Fixture();f.Broker.ChartStatus=HttpStatusCode.Forbidden;
        f.Broker.ChartError="""{"ErrorCode":"NoAccess","Message":"Account private-account has no market data"}""";
        var result=await f.Provider().Chart("MSFT","1mo",default);
        Assert.Empty(result.Bars);Assert.Equal("denied",result.HistoryStatus);Assert.Equal("available",result.QuoteStatus);
        Assert.Equal(14,result.Price);Assert.Equal(13,result.PreviousClose);Assert.Equal("USD",result.Currency);Assert.Null(result.ChartDelayMinutes);Assert.Equal(15,result.QuoteDelayMinutes);
        var diagnostic=Assert.Single(result.Diagnostics!);
        Assert.Equal(new MarketDiagnostic("history","SAXO_MARKET_DATA_NO_ACCESS",403,"NoAccess"),diagnostic);
        Assert.Equal("SAXO_MARKET_HISTORY_NO_ACCESS",result.Warning);Assert.Equal("Stock",result.AssetType);Assert.Null(result.HistorySamples);
        var output=JsonSerializer.Serialize(result);Assert.DoesNotContain("private-account",output);Assert.DoesNotContain("has no market data",output);
    }
    [Fact] public async Task Both_parts_denied_is_an_explicit_denial_with_both_operations_and_no_cached_resurrection()
    {
        using var f=new Fixture();var p=f.Provider();await p.Chart("MSFT","1mo",default);f.Clock.Now=f.Clock.Now.AddMinutes(2);
        f.Broker.ChartStatus=f.Broker.QuoteStatus=HttpStatusCode.Forbidden;f.Broker.QuoteError="""{"ErrorCode":"NoAccess"}""";
        var error=await Assert.ThrowsAsync<ApiFailure>(()=>p.Chart("MSFT","1mo",default));
        Assert.Equal("SAXO_MARKET_DATA_NO_ACCESS",error.Code);
        var details=Assert.IsType<MarketFailureDetails>(error.Details);
        Assert.Equal(["history","quote"],details.Diagnostics.Select(x=>x.Operation));Assert.Equal("NoAccess",details.Diagnostics[1].ProviderCode);
        f.Clock.Now=f.Clock.Now.AddMinutes(1);f.Broker.QuoteError=null;f.Broker.ChartStatus=f.Broker.QuoteStatus=HttpStatusCode.ServiceUnavailable;
        var unavailable=await Assert.ThrowsAsync<ApiFailure>(()=>p.Chart("MSFT","1mo",default));
        Assert.Equal("SAXO_MARKET_DATA_UNAVAILABLE",unavailable.Code);
    }
    [Fact] public async Task Both_parts_transient_use_whole_stale_snapshot_or_fail_explicitly()
    {
        using var f=new Fixture();f.Broker.ChartStatus=f.Broker.QuoteStatus=HttpStatusCode.BadGateway;
        var error=await Assert.ThrowsAsync<ApiFailure>(()=>f.Provider().Chart("MSFT","1mo",default));
        Assert.Equal("SAXO_MARKET_DATA_UNAVAILABLE",error.Code);Assert.Equal(2,Assert.IsType<MarketFailureDetails>(error.Details).Diagnostics.Length);
        f.Broker.ChartStatus=f.Broker.QuoteStatus=HttpStatusCode.OK;var p=f.Provider();var fresh=await p.Chart("MSFT","1mo",default);
        f.Clock.Now=f.Clock.Now.AddMinutes(2);f.Broker.ChartStatus=f.Broker.QuoteStatus=HttpStatusCode.ServiceUnavailable;
        var stale=await p.Chart("MSFT","1mo",default);
        Assert.True(stale.Stale);Assert.Equal(fresh.RetrievedAt,stale.RetrievedAt);Assert.Equal("stale",stale.QuoteStatus);Assert.Equal("stale",stale.HistoryStatus);
        Assert.Equal(2,stale.Diagnostics!.Length);
        Assert.Equal(fresh.ChartDelayMinutes,stale.ChartDelayMinutes);Assert.Equal(fresh.QuoteDelayMinutes,stale.QuoteDelayMinutes);
        Assert.Equal(fresh.HistoryRetrievedAt,stale.HistoryRetrievedAt);Assert.Equal(fresh.QuoteTime,stale.QuoteTime);
    }
    [Fact] public async Task Malformed_request_and_throttling_are_distinguishable_from_entitlement()
    {
        using var f=new Fixture();f.Broker.ChartStatus=HttpStatusCode.BadRequest;f.Broker.ChartError="""{"ErrorCode":"InvalidModelState","Message":"Horizon"}""";
        f.Broker.QuoteStatus=HttpStatusCode.TooManyRequests;
        var error=await Assert.ThrowsAsync<ApiFailure>(()=>f.Provider().Chart("MSFT","1mo",default));
        Assert.Equal("SAXO_RATE_LIMITED",error.Code);var d=Assert.IsType<MarketFailureDetails>(error.Details).Diagnostics;
        Assert.Equal(new MarketDiagnostic("history","SAXO_MARKET_REQUEST_REJECTED",400,"InvalidModelState"),d[0]);
        Assert.Equal(new MarketDiagnostic("quote","SAXO_RATE_LIMITED",429,null),d[1]);
    }
    [Theory]
    [InlineData("""{"ErrorCode":"Bad code with spaces"}""")]
    [InlineData("""{"ErrorCode":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}""")]
    [InlineData("not json")]
    public async Task Unsafe_or_unreadable_provider_codes_are_dropped(string body)
    {
        using var f=new Fixture();f.Broker.ChartStatus=HttpStatusCode.Forbidden;f.Broker.ChartError=body;
        var result=await f.Provider().Chart("MSFT","1mo",default);
        var d=Assert.Single(result.Diagnostics!);Assert.Null(d.ProviderCode);Assert.Equal(403,d.Status);Assert.Equal("SAXO_MARKET_DATA_NO_ACCESS",d.Code);
    }
    [Fact] public async Task Quote_only_result_needs_a_verified_quote_currency()
    {
        using var f=new Fixture();f.Broker.ChartStatus=HttpStatusCode.Forbidden;
        var result=await f.Provider().Chart("MSFT","1mo",default);Assert.Equal("USD",result.Currency);Assert.Equal(14,result.Price);
        using var g=new Fixture();g.Broker.ChartStatus=HttpStatusCode.Forbidden;g.Broker.QuoteBody=Quote;
        var unknown=await g.Provider().Chart("MSFT","1mo",default);
        Assert.Null(unknown.Price);Assert.Null(unknown.QuoteTime);Assert.Equal("mismatch",unknown.QuoteStatus);Assert.Equal("Unknown",unknown.Currency);
    }
    [Fact] public async Task Expired_authentication_on_either_part_fails_and_invalidates_cached_bars()
    {
        using var f=new Fixture();var p=f.Provider();await p.Chart("MSFT","1mo",default);f.Clock.Now=f.Clock.Now.AddMinutes(2);
        f.Broker.QuoteStatus=HttpStatusCode.Unauthorized;
        var error=await Assert.ThrowsAsync<ApiFailure>(()=>p.Chart("MSFT","1mo",default));
        Assert.Equal("SAXO_MARKET_SIGN_IN_REQUIRED",error.Code);Assert.Equal("quote",Assert.IsType<MarketFailureDetails>(error.Details).Diagnostics[0].Operation);
        f.Broker.QuoteStatus=HttpStatusCode.OK;f.Broker.ChartStatus=HttpStatusCode.ServiceUnavailable;
        var after=await p.Chart("MSFT","1mo",default);
        Assert.Equal("unavailable",after.HistoryStatus);Assert.Empty(after.Bars);Assert.False(after.Stale);
    }
    [Fact] public async Task Permission_cooldown_is_scoped_to_the_denied_instrument_but_sign_in_cooldown_is_not()
    {
        using var f=new Fixture();var p=f.Provider(budgeted:true);f.Broker.ChartStatusByUic["123"]=HttpStatusCode.Forbidden;
        Assert.Equal("denied",(await p.Chart("MSFT","1mo",default)).HistoryStatus);
        f.Clock.Now=f.Clock.Now.AddMinutes(1);var charts=f.Broker.Requests.Count(x=>x.Url.Contains("/chart/"));
        var repeat=await p.Chart("MSFT","1mo",default);
        Assert.Equal(charts,f.Broker.Requests.Count(x=>x.Url.Contains("/chart/")));
        Assert.True(Assert.Single(repeat.Diagnostics!).Cooldown);Assert.Equal(403,repeat.Diagnostics![0].Status);Assert.Equal(14,repeat.Price);
        var other=await p.Chart("GMAB:xcse","1mo",default);
        Assert.Equal("available",other.HistoryStatus);Assert.NotEmpty(other.Bars);Assert.Equal("DKK",other.Currency);
        f.Clock.Now=f.Clock.Now.AddMinutes(1);f.Broker.ChartStatusByUic["456"]=HttpStatusCode.Unauthorized;
        Assert.Equal("SAXO_MARKET_SIGN_IN_REQUIRED",(await Assert.ThrowsAsync<ApiFailure>(()=>p.Chart("GMAB:xcse","1mo",default))).Code);
        f.Clock.Now=f.Clock.Now.AddMinutes(1);f.Broker.ChartStatusByUic.Clear();var before=f.Broker.Requests.Count;
        Assert.Equal("SAXO_MARKET_SIGN_IN_REQUIRED",(await Assert.ThrowsAsync<ApiFailure>(()=>p.Chart("GMAB:xcse","3mo",default))).Code);
        Assert.Equal(before,f.Broker.Requests.Count);
    }
    [Fact] public async Task Exact_listing_and_asset_type_are_required_for_live_quotes()
    {
        using var f=new Fixture();var p=f.Provider();
        Assert.Equal("SAXO_MARKET_LISTING_REQUIRED",(await Assert.ThrowsAsync<ApiFailure>(()=>p.Chart("MSFT:xmil","1mo",default))).Code);
        var msft=await p.Chart("MSFT","1mo",default);Assert.Equal("MSFT:xnas",msft.Symbol);Assert.Equal("Stock",msft.AssetType);
        Assert.Contains(f.Broker.Requests,r=>r.Url.Contains("/infoprices?AssetType=Stock&Uic=123"));
    }
    [Fact] public void Demo_research_guard_never_opens_private_live_brokerage()
    {
        var demo=new Workspace();var host=new Host();
        SaxoAccess.RequireResearchAccess(demo,host);
        Assert.Equal("SAXO_LIVE_OWNER_REQUIRED",Assert.Throws<ApiFailure>(()=>SaxoAccess.RequireMarketAccess(demo,host,"LIVE")).Code);
        SaxoAccess.RequireMarketAccess(demo,host,"SIM");
    }
    [Fact] public async Task Ambiguous_legacy_symbol_requires_listing_and_does_not_request_chart()
    {
        using var f=new Fixture();f.Broker.Listings="""{"Data":[{"Symbol":"XYZ:xnas","AssetType":"Stock","Identifier":1},{"Symbol":"XYZ:xnys","AssetType":"Stock","Identifier":2}]}""";
        Assert.Equal("SAXO_MARKET_LISTING_REQUIRED",(await Assert.ThrowsAsync<ApiFailure>(()=>f.Provider().Chart("XYZ","1mo",default))).Code);
        Assert.Single(f.Broker.Requests);
    }
    [Fact] public async Task Quote_denial_preserves_authorized_chart_without_inventing_a_quote()
    {
        using var f=new Fixture();f.Broker.QuoteStatus=HttpStatusCode.Forbidden;var result=await f.Provider().Chart("MSFT","1mo",default);
        Assert.NotEmpty(result.Bars);Assert.Null(result.Price);Assert.Equal("SAXO_MARKET_DATA_NO_ACCESS",result.Warning);
    }
    [Fact] public async Task Actual_budget_sign_in_cooldown_preserves_auth_failure_and_clears_cached_chart()
    {
        using var f=new Fixture();var p=f.Provider(budgeted:true);await p.Chart("MSFT","1mo",default);
        f.Clock.Now=f.Clock.Now.AddMinutes(2);f.Broker.ChartStatus=HttpStatusCode.Unauthorized;
        Assert.Equal("SAXO_MARKET_SIGN_IN_REQUIRED",(await Assert.ThrowsAsync<ApiFailure>(()=>p.Chart("MSFT","1mo",default))).Code);
        var count=f.Broker.Requests.Count;
        Assert.Equal("SAXO_MARKET_SIGN_IN_REQUIRED",(await Assert.ThrowsAsync<ApiFailure>(()=>p.Chart("MSFT","1mo",default))).Code);
        Assert.Equal(count,f.Broker.Requests.Count);
        f.Clock.Now=f.Clock.Now.AddMinutes(6);f.Broker.ChartStatus=HttpStatusCode.ServiceUnavailable;
        var after=await p.Chart("MSFT","1mo",default);
        Assert.Equal("unavailable",after.HistoryStatus);Assert.Empty(after.Bars);
    }
    [Fact] public async Task Actual_budget_permission_cooldown_removes_denied_history_without_blocking_the_quote()
    {
        using var f=new Fixture();var p=f.Provider(budgeted:true);await p.Chart("MSFT","1mo",default);
        f.Clock.Now=f.Clock.Now.AddMinutes(2);f.Broker.ChartStatus=HttpStatusCode.Forbidden;
        var denied=await p.Chart("MSFT","1mo",default);Assert.Equal("denied",denied.HistoryStatus);Assert.Empty(denied.Bars);Assert.Equal(14,denied.Price);
        f.Clock.Now=f.Clock.Now.AddMinutes(1);var charts=f.Broker.Requests.Count(x=>x.Url.Contains("/chart/"));
        var repeat=await p.Chart("MSFT","1mo",default);
        Assert.Equal(charts,f.Broker.Requests.Count(x=>x.Url.Contains("/chart/")));Assert.Equal("denied",repeat.HistoryStatus);Assert.Equal(14,repeat.Price);
        f.Clock.Now=f.Clock.Now.AddMinutes(6);f.Broker.ChartStatus=HttpStatusCode.ServiceUnavailable;
        var after=await p.Chart("MSFT","1mo",default);Assert.Equal("unavailable",after.HistoryStatus);Assert.Empty(after.Bars);
    }
    [Theory]
    [InlineData(HttpStatusCode.ServiceUnavailable)]
    [InlineData(HttpStatusCode.TooManyRequests)]
    public async Task Actual_budget_cooldown_retains_only_explicitly_stale_history(HttpStatusCode status)
    {
        using var f=new Fixture();var p=f.Provider(budgeted:true);var fresh=await p.Chart("MSFT","1mo",default);
        f.Clock.Now=f.Clock.Now.AddMinutes(2);f.Broker.ChartStatus=status;
        var first=await p.Chart("MSFT","1mo",default);Assert.True(first.Stale);Assert.Equal("stale",first.HistoryStatus);
        f.Clock.Now=f.Clock.Now.AddSeconds(1);var charts=f.Broker.Requests.Count(x=>x.Url.Contains("/chart/"));
        var result=await p.Chart("MSFT","1mo",default);
        Assert.True(result.Stale);Assert.Equal(fresh.RetrievedAt,result.HistoryRetrievedAt);Assert.Equal(fresh.Bars,result.Bars);
        Assert.Equal(charts,f.Broker.Requests.Count(x=>x.Url.Contains("/chart/")));
    }
    [Fact] public async Task Quote_auth_cooldown_cannot_be_swallowed_as_optional_quote_warning()
    {
        using var f=new Fixture();var p=f.Provider(budgeted:true);f.Broker.QuoteStatus=HttpStatusCode.Unauthorized;
        for(var i=0;i<2;i++)Assert.Equal("SAXO_MARKET_SIGN_IN_REQUIRED",(await Assert.ThrowsAsync<ApiFailure>(()=>p.Chart("MSFT","1mo",default))).Code);
        Assert.Single(f.Broker.Requests,x=>x.Url.Contains("/infoprices"));
    }
    [Fact] public async Task Cancellation_does_not_return_cached_or_stale_data()
    {
        using var f=new Fixture();var p=f.Provider();await p.Chart("MSFT","1mo",default);
        using var cancelled=new CancellationTokenSource();cancelled.Cancel();var count=f.Broker.Requests.Count;
        await Assert.ThrowsAnyAsync<OperationCanceledException>(()=>p.Chart("MSFT","1mo",cancelled.Token));
        Assert.Equal(count,f.Broker.Requests.Count);
    }
    [Fact] public async Task Changed_credentials_never_reuse_previous_sessions_cached_market_data()
    {
        using var f=new Fixture();var p=f.Provider();await p.Chart("MSFT","1mo",default);
        f.WriteCredentials("synthetic-rotated");f.Broker.ChartStatus=HttpStatusCode.ServiceUnavailable;
        var rotated=await p.Chart("MSFT","1mo",default);Assert.Equal("unavailable",rotated.HistoryStatus);Assert.Empty(rotated.Bars);Assert.False(rotated.Stale);
        Assert.Equal("Bearer synthetic-rotated",f.Broker.Requests.Last().Auth);
    }
    [Fact] public async Task Search_rejects_fractional_overflow_and_non_object_identifiers_and_deduplicates_exact_listings()
    {
        using var f=new Fixture();f.Broker.Listings="""{"Data":[null,[],{"Symbol":"BAD:xnas","AssetType":"Stock","Identifier":1.5},{"Symbol":"BIG:xnas","AssetType":"Stock","Identifier":2147483648},{"Symbol":"MSFT:xnas","AssetType":"Stock","Identifier":123},{"Symbol":"MSFT:xnas","AssetType":"Stock","Identifier":123}]}""";
        Assert.Equal(123,Assert.Single(await f.Provider().Search("MSFT",default)).Uic);
    }
    [Fact] public void Quote_in_another_currency_is_not_combined_with_chart_prices()
    {
        var quote=Quote.Replace("\"LastUpdated\"","\"DisplayAndFormat\":{\"Currency\":\"EUR\"},\"LastUpdated\"");
        var result=Map(quote);Assert.Equal("USD",result.Currency);Assert.NotEmpty(result.Bars);
        Assert.Null(result.Price);Assert.Null(result.PreviousClose);Assert.Null(result.QuoteTime);Assert.Equal("SAXO_MARKET_DATA_MISMATCH",result.Warning);
    }
    [Theory]
    [InlineData("\"Currency\":\"USD\"","\"Currency\":null")]
    [InlineData("\"ExchangeId\":\"xnas\"","\"ExchangeId\":\"xcse\"")]
    public void Chart_without_currency_or_with_wrong_venue_is_not_displayable(string from,string to)
    { Assert.Equal("SAXO_MARKET_DATA_MISMATCH",Assert.Throws<ApiFailure>(()=>Map(bars:Bars.Replace(from,to))).Code); }
    [Fact] public void Negative_delay_and_previous_close_are_unknown_not_realtime_or_zero()
    {
        var result=Map(Quote.Replace("\"LastClose\":13","\"LastClose\":-1").Replace("\"DelayedByMinutes\":15","\"DelayedByMinutes\":-1"));
        Assert.Equal(15,result.ChartDelayMinutes);Assert.Null(result.QuoteDelayMinutes);Assert.Null(result.PreviousClose);Assert.Contains("quote: delay unknown",result.Delay);
    }
    sealed class Clock:TimeProvider {public DateTimeOffset Now=SaxoMarketDataTests.Now;public override DateTimeOffset GetUtcNow()=>Now;}
    sealed class Host:IHostEnvironment {
        public string EnvironmentName {get;set;}="Production";public string ApplicationName {get;set;}="Test";
        public string ContentRootPath {get;set;}="";public IFileProvider ContentRootFileProvider {get;set;}=new NullFileProvider();
    }
    sealed class Broker:HttpMessageHandler,IHttpClientFactory {
        public List<(string Method,string Url,string? Auth)> Requests=[];
        public HttpStatusCode ChartStatus=HttpStatusCode.OK,QuoteStatus=HttpStatusCode.OK;
        public string? ChartError,QuoteError,QuoteBody;
        // Per-instrument overrides for entitlement tests: Uic -> chart status.
        public Dictionary<string,HttpStatusCode> ChartStatusByUic=[];
        public string Listings="""{"Data":[{"Symbol":"MSFT:xnas","Description":"Microsoft","ExchangeId":"xnas","AssetType":"Stock","Identifier":123},{"Symbol":"GMAB:xcse","Description":"Genmab","ExchangeId":"xcse","AssetType":"Stock","Identifier":456}]}""";
        public HttpClient CreateClient(string name)=>new(this,false);
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage r,CancellationToken ct) {
            Requests.Add((r.Method.Method,r.RequestUri!.ToString(),r.Headers.Authorization?.ToString()));
            var chart=r.RequestUri.AbsolutePath.Contains("/chart/");var quote=r.RequestUri.AbsolutePath.Contains("/infoprices");
            var uic=Microsoft.AspNetCore.WebUtilities.QueryHelpers.ParseQuery(r.RequestUri.Query).TryGetValue("Uic",out var u)?u.ToString():"";
            var status=chart?ChartStatusByUic.GetValueOrDefault(uic,ChartStatus):quote?QuoteStatus:HttpStatusCode.OK;
            var payload=chart?(status==HttpStatusCode.OK?(uic=="456"?Bars.Replace("xnas","xcse").Replace("USD","DKK"):Bars):ChartError??"{}"):
                quote?(status==HttpStatusCode.OK?QuoteBody??(uic=="456"?LiveQuote.Replace("USD","DKK"):LiveQuote):QuoteError??"{}"):Listings;
            // Unexpected provider properties must never escape the typed market projection.
            payload=payload.Insert(1,"\"AccountKey\":\"private-account\",\"PositionId\":\"private-position\",\"OrderId\":\"private-order\""+(payload.Length>2?",":""));
            return Task.FromResult(new HttpResponseMessage(status){Content=new StringContent(payload)});
        }
    }
    sealed class Fixture:IDisposable {
        readonly string directory=Path.Combine(Path.GetTempPath(),"Banking-Market-Test-"+Guid.NewGuid().ToString("N"));
        public Clock Clock=new();public Broker Broker=new();public IConfiguration Config;public SaxoLocalSession Session;
        readonly EphemeralDataProtectionProvider protection=new();
        readonly MemoryCache cache=new(new MemoryCacheOptions());readonly Host host=new();readonly Workspace owner=new(){OwnerAuthenticated=true};
        public Fixture(){
            owner.Select("Live");Config=new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?>{
                ["Cloud:StateDirectory"]=directory,["Saxo:LIVE:ReadEnabled"]="true"}).Build();
            Session=new(host,Broker,Clock,Config,protection);
            Directory.CreateDirectory(directory);
            WriteCredentials("synthetic-LIVE");
        }
        public void WriteCredentials(string token){
            var credentials=new SaxoLocalCredentials("synthetic-app","synthetic-secret","https://example.test",AccessToken:token,ExpiresAt:Now.AddHours(1));
            File.WriteAllBytes(Path.Combine(directory,"saxo-live.protected"),protection.CreateProtector("Banking.Saxo.Session.v1","LIVE").Protect(JsonSerializer.SerializeToUtf8Bytes(credentials)));
        }
        public SaxoMarketDataProvider Provider(Workspace? workspace=null,bool budgeted=false)=>new(
            budgeted?new HttpClient(new SaxoBudgetHandler(new SaxoRequestBudget(Clock)){InnerHandler=Broker}):Broker.CreateClient("market"),
            cache,Clock,Session,Config,workspace??owner,host);
        public void Dispose(){cache.Dispose();Broker.Dispose();if(Path.GetFileName(directory).StartsWith("Banking-Market-Test-")&&Path.GetFullPath(directory).StartsWith(Path.GetFullPath(Path.GetTempPath())))Directory.Delete(directory,true);}
    }
}
