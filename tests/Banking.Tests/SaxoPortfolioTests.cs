using System.Text.Json;
using Banking.Api;
using Banking.Api.Providers;
using Banking.Api.Services;

namespace Banking.Tests;

public sealed class SaxoPortfolioTests
{
    static JsonElement Parse(string json)=>JsonSerializer.Deserialize<JsonElement>(json);
    static JsonElement Json(object value)=>JsonSerializer.SerializeToElement(value,new JsonSerializerOptions(JsonSerializerDefaults.Web));

    [Fact]
    public void Position_preserves_currency_cost_basis_and_missing_quote_without_inventing_profit()
    {
        var positions=Parse("""{"Data":[{"PositionId":"p1","NetPositionId":"n1","PositionBase":{"AccountId":"account","AccountKey":"secret","SourceOrderId":"order1","Amount":5,"OpenPrice":199,"OpenPriceIncludingCosts":204.8,"AssetType":"Stock","Status":"Open","ExecutionTimeOpen":"2026-09-28T08:00:00Z","ValueDate":"2026-09-30T00:00:00Z"},"DisplayAndFormat":{"Currency":"DKK","Symbol":"VWS:xcse"},"Costs":{"OpenCost":{"Commission":29},"OpenCostInBaseCurrency":{"Commission":3.88},"CloseCostInBaseCurrency":{"Commission":4.1}},"PositionView":{"CalculationReliability":"PricePending","MarketValueOpenInBaseCurrency":133.11}}]}""");
        var mapped=Json(SaxoReadClient.Map(Parse("""{"Currency":"EUR","TotalValue":1000}"""),positions,DateTimeOffset.UtcNow));
        var p=Assert.Single(mapped.GetProperty("positions").EnumerateArray());
        Assert.Equal("DKK",p.GetProperty("currency").GetString());Assert.Equal("EUR",p.GetProperty("baseCurrency").GetString());
        Assert.Equal(199,p.GetProperty("openPrice").GetDecimal());Assert.Equal(204.8m,p.GetProperty("openPriceIncludingCosts").GetDecimal());
        Assert.Equal(29,p.GetProperty("openCosts").GetProperty("commission").GetDecimal());
        Assert.Equal(4.1m,p.GetProperty("estimatedCloseCostsInBaseCurrency").GetProperty("commission").GetDecimal());
        foreach(var field in new[]{"price","marketValue","marketValueInBaseCurrency","profitLossInBaseCurrency","profitLoss"})Assert.Equal(JsonValueKind.Null,p.GetProperty(field).ValueKind);
        Assert.Equal("VWS.CO",p.GetProperty("researchSymbol").GetString());Assert.Equal("order1",p.GetProperty("sourceOrderId").GetString());
        Assert.DoesNotContain("secret",mapped.ToString());
    }

    [Fact]
    public void Position_preserves_provider_negative_profit_and_value_without_recomputing_it()
    {
        var mapped=Json(SaxoReadClient.Map(Parse("""{"Currency":"EUR"}"""),Parse("""{"Data":[{"DisplayAndFormat":{"Currency":"USD","Symbol":"MSFT:xnas"},"PositionView":{"CurrentPrice":500,"MarketValue":500,"MarketValueInBaseCurrency":439,"ProfitLossOnTrade":-17,"ProfitLossOnTradeInBaseCurrency":-14.926,"ConversionRateCurrent":0.878}}],"__next":"more"}"""),DateTimeOffset.UtcNow));
        var p=mapped.GetProperty("positions")[0];Assert.Equal(-14.926m,p.GetProperty("profitLossInBaseCurrency").GetDecimal());
        Assert.Equal(439,p.GetProperty("marketValueInBaseCurrency").GetDecimal());Assert.True(mapped.GetProperty("hasMore").GetBoolean());
        Assert.Equal(JsonValueKind.Null,p.GetProperty("openCosts").ValueKind);
    }

    [Fact]
    public void Open_order_retains_partial_fill_limit_currency_and_duration_not_an_execution_price()
    {
        var mapped=Json(SaxoOrders.MapOpenOrder(Parse("""{"OrderId":"123","AccountKey":"secret","Amount":5,"FilledAmount":2,"Price":199,"Status":"Working","OpenOrderType":"Limit","Duration":{"DurationType":"GoodTillCancel"},"DisplayAndFormat":{"Symbol":"VWS:xcse","Currency":"DKK"}}""")));
        Assert.Equal(5,mapped.GetProperty("quantity").GetDecimal());Assert.Equal(2,mapped.GetProperty("filledQuantity").GetDecimal());
        Assert.Equal("Working",mapped.GetProperty("status").GetString());Assert.Equal("DKK",mapped.GetProperty("currency").GetString());
        Assert.Equal("GoodTillCancel",mapped.GetProperty("duration").GetString());Assert.False(mapped.TryGetProperty("executionPrice",out _));Assert.DoesNotContain("secret",mapped.ToString());
    }

    [Fact]
    public async Task Shared_portfolio_excludes_private_receipts_and_keeps_pending_orders_separate()
    {
        var result=Json(await SaxoPortfolio.Read(()=>Task.FromResult<object>(new{positions=Array.Empty<object>(),currency="EUR",cash=999973.83m}),
            ()=>Task.FromResult<object>(new{orders=new[]{new{orderId="123",status="Working"}},history=Array.Empty<object>(),historyError=(string?)null,receipts=new[]{new{ticketId="private-review",accountKey="secret"}},hasMore=true,historyHasMore=false}),default));
        Assert.Equal("Ok",result.GetProperty("status").GetString());Assert.Empty(result.GetProperty("portfolio").GetProperty("positions").EnumerateArray());
        Assert.Single(result.GetProperty("orders").EnumerateArray());Assert.True(result.GetProperty("ordersHasMore").GetBoolean());
        Assert.Equal("Unavailable",result.GetProperty("performance").GetProperty("status").GetString());Assert.DoesNotContain("private-review",result.ToString());Assert.DoesNotContain("secret",result.ToString());
    }

    [Fact]
    public async Task Partial_failure_does_not_erase_valid_orders_or_turn_unavailable_positions_into_zero()
    {
        var result=Json(await SaxoPortfolio.Read(()=>throw new ApiFailure(503,"SAXO_READ_UNAVAILABLE"),()=>Task.FromResult<object>(new{orders=new[]{new{orderId="123"}},history=(object?)null,historyError="SAXO_HISTORY_UNAVAILABLE"}),default));
        Assert.Equal("Partial",result.GetProperty("status").GetString());Assert.Equal(JsonValueKind.Null,result.GetProperty("portfolio").ValueKind);
        Assert.Single(result.GetProperty("orders").EnumerateArray());Assert.Equal("SAXO_HISTORY_UNAVAILABLE",result.GetProperty("activityError").GetString());
    }

    [Fact]
    public async Task Access_denial_and_cancellation_are_not_masked_as_partial_success()
    {
        await Assert.ThrowsAsync<ApiFailure>(()=>SaxoPortfolio.Read(()=>throw new ApiFailure(403,"FORBIDDEN"),()=>Task.FromResult<object>(new{}),default));
        using var cts=new CancellationTokenSource();cts.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(()=>SaxoPortfolio.Read(()=>Task.FromCanceled<object>(cts.Token),()=>Task.FromResult<object>(new{}),cts.Token));
    }

    [Theory]
    [InlineData("GMAB:xcse","GMAB.CO")]
    [InlineData("VWS:xcse","VWS.CO")]
    [InlineData("SIE:xetr","SIE.DE")]
    [InlineData("SIE:xmil",null)]
    [InlineData("ENR:xetr",null)]
    public void Chart_navigation_maps_only_verified_exact_listings(string symbol,string? expected)=>Assert.Equal(expected,SaxoReadClient.ResearchSymbol(symbol));
}
