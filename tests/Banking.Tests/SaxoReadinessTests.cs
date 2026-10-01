using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using Banking.Api.Providers;
using Banking.Api.Services;

namespace Banking.Tests;

public sealed class SaxoReadinessTests
{
    sealed class Clock:TimeProvider {public DateTimeOffset Now=DateTimeOffset.UtcNow;public override DateTimeOffset GetUtcNow()=>Now;}
    static JsonElement J(string s)=>JsonSerializer.Deserialize<JsonElement>(s);
    [Fact]
    public async Task Concurrent_reads_share_only_the_same_environment_identity_and_original_timestamp()
    {
        var clock=new Clock();var cache=new SaxoReadCache(clock);var calls=0;
        async Task<object> Read(){Interlocked.Increment(ref calls);await Task.Yield();return new {observedAt=clock.Now};}
        var values=await Task.WhenAll(Enumerable.Range(0,20).Select(_=>cache.Read("SIM","identity",false,Read,default)));
        Assert.Equal(1,calls);Assert.All(values,v=>Assert.Same(values[0],v));
        await cache.Read("LIVE","identity",false,Read,default);Assert.Equal(2,calls);
        await cache.Read("SIM","new-session",false,Read,default);Assert.Equal(3,calls);
        clock.Now=clock.Now.AddSeconds(16);await cache.Read("SIM","new-session",false,Read,default);Assert.Equal(4,calls);
    }
    [Fact]
    public async Task Read_failures_are_deduplicated_but_do_not_replace_data_with_zero()
    {
        var cache=new SaxoReadCache(new Clock());var calls=0;
        Task<object> Read(){calls++;throw new ApiFailure(503,"SAXO_PERMISSION_REQUIRED");}
        for(var i=0;i<4;i++)Assert.Equal("SAXO_PERMISSION_REQUIRED",(await Assert.ThrowsAsync<ApiFailure>(()=>cache.Read("LIVE","session",false,Read,default))).Code);
        Assert.Equal(1,calls);
    }
    [Theory]
    [InlineData(401,"SAXO_SIGN_IN_REQUIRED")]
    [InlineData(403,"SAXO_PERMISSION_REQUIRED")]
    [InlineData(429,"SAXO_RATE_LIMITED")]
    [InlineData(503,"SAXO_PROVIDER_UNAVAILABLE")]
    public async Task Provider_failures_pause_requests_without_replaying_a_write(int status,string error)
    {
        var clock=new Clock();var budget=new SaxoRequestBudget(clock);var calls=0;
        using var request=new HttpRequestMessage(HttpMethod.Post,"https://gateway.saxobank.com/sim/openapi/trade/v2/orders");
        request.Headers.Authorization=new AuthenticationHeaderValue("Bearer","synthetic");
        Task<HttpResponseMessage> Send(){calls++;var response=new HttpResponseMessage((HttpStatusCode)status);response.Headers.RetryAfter=new RetryConditionHeaderValue(TimeSpan.FromSeconds(90));return Task.FromResult(response);}
        using var response=await budget.Send(request,Send,default);Assert.Equal(1,calls);
        Assert.Equal(error,(await Assert.ThrowsAsync<ApiFailure>(()=>budget.Send(request,Send,default))).Code);Assert.Equal(1,calls);
        clock.Now=clock.Now.AddMinutes(6);using var next=await budget.Send(request,Send,default);Assert.Equal(2,calls);
    }
    [Fact]
    public async Task Provider_budget_obeys_remaining_reset_and_isolates_live()
    {
        var clock=new Clock();var budget=new SaxoRequestBudget(clock);var calls=0;
        using var sim=new HttpRequestMessage(HttpMethod.Get,"https://gateway.saxobank.com/sim/openapi/port/v1/balances/me");
        using var live=new HttpRequestMessage(HttpMethod.Get,"https://gateway.saxobank.com/openapi/port/v1/balances/me");
        Task<HttpResponseMessage> Send(){calls++;var r=new HttpResponseMessage(HttpStatusCode.OK);r.Headers.Add("X-RateLimit-Port-Remaining","0");r.Headers.Add("X-RateLimit-Port-Reset","42");return Task.FromResult(r);}
        using var r=await budget.Send(sim,Send,default);await Assert.ThrowsAsync<ApiFailure>(()=>budget.Send(sim,Send,default));
        using var l=await budget.Send(live,Send,default);Assert.Equal(2,calls);
        clock.Now=clock.Now.AddSeconds(43);using var n=await budget.Send(sim,Send,default);Assert.Equal(3,calls);
    }
    [Fact]
    public void Instrument_rules_check_each_exit_tick_and_quantity_increment()
    {
        var detail=J("""{"SupportedOrderTypes":["Limit","StopIfTraded"],"MinimumLotSize":2,"IncrementSize":2,"TickSizeLimitOrder":0.05,"TickSizeStopOrder":0.1}""");
        var input=new SaxoOrderInput(1,"account","Buy",2,100,StopLoss:99,TakeProfit:101,StopOrderType:"StopIfTraded");
        SaxoOrders.ValidateInstrument(input,detail);
        Assert.Equal("SAXO_QUANTITY_INCREMENT",Assert.Throws<ApiFailure>(()=>SaxoOrders.ValidateInstrument(input with{Quantity=3},detail)).Code);
        Assert.Equal("SAXO_INVALID_PRICE_INCREMENT",Assert.Throws<ApiFailure>(()=>SaxoOrders.ValidateInstrument(input with{StopLoss=99.05m},detail)).Code);
        Assert.Equal("SAXO_INVALID_PRICE_INCREMENT",Assert.Throws<ApiFailure>(()=>SaxoOrders.ValidateInstrument(input with{LimitPrice=100.01m},detail)).Code);
    }
    [Fact]
    public void Price_bands_and_missing_rules_fail_closed()
    {
        var detail=J("""{"SupportedOrderTypes":["Limit"],"MinimumLotSize":1,"TickSizeScheme":{"Elements":[{"HighPrice":10,"TickSize":0.01}],"DefaultTickSize":0.05}}""");
        var input=new SaxoOrderInput(1,"a","Buy",1,9.99m);SaxoOrders.ValidateInstrument(input,detail);
        Assert.Throws<ApiFailure>(()=>SaxoOrders.ValidateInstrument(input with{LimitPrice=10.01m},detail));
        SaxoOrders.ValidateInstrument(input with{LimitPrice=10.05m},detail);
        Assert.Throws<ApiFailure>(()=>SaxoOrders.ValidateInstrument(input,J("""{"SupportedOrderTypes":["Limit"],"MinimumLotSize":1}""")));
    }
    [Fact]
    public void Large_lists_unknown_assets_and_tiny_short_quantities_preserve_evidence()
    {
        var raw=new {Data=Enumerable.Range(0,105).Select(i=>new {PositionId=i.ToString(),PositionBase=new{Amount=-0.000000000123m,AssetType="NewDerivative",NewField=true},DisplayAndFormat=new{Currency="JPY",Decimals=9},PositionView=new{CurrentPriceType="FutureEnum"}}),__count=105};
        var mapped=JsonSerializer.SerializeToElement(SaxoReadClient.Map(J("""{"Currency":"EUR"}"""),JsonSerializer.SerializeToElement(raw),DateTimeOffset.UtcNow,"LIVE"));
        Assert.True(mapped.GetProperty("hasMore").GetBoolean());Assert.Equal(100,mapped.GetProperty("positions").GetArrayLength());
        var p=mapped.GetProperty("positions")[0];Assert.Equal("-0.000000000123",p.GetProperty("quantityText").GetString());
        Assert.Equal("NewDerivative",p.GetProperty("assetType").GetString());Assert.Equal(9,p.GetProperty("priceDecimals").GetDecimal());
        Assert.Equal(JsonValueKind.Null,p.GetProperty("marketValue").ValueKind);Assert.False(mapped.GetProperty("simulation").GetBoolean());
    }
}
