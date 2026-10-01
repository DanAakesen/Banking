using System.Net;
using System.Text.Json;
using Banking.Api.Providers;
using Banking.Api.Services;
using Microsoft.Extensions.Caching.Memory;

namespace Banking.Tests;

public sealed class MarketTests
{
    [Fact]
    public void Saxo_reports_connected_empty_separately_and_never_invents_buying_power()
    {
        var balances=JsonSerializer.Deserialize<JsonElement>("""{"Currency":"DKK","CashBalance":1000,"TotalValue":1000}""");
        var positions=JsonSerializer.Deserialize<JsonElement>("""{"Data":[],"__count":0}""");
        var result=JsonSerializer.SerializeToElement(SaxoReadClient.Map(balances,positions,DateTimeOffset.UtcNow,"LIVE"));
        Assert.False(result.GetProperty("simulation").GetBoolean());Assert.Equal("Saxo LIVE",result.GetProperty("source").GetString());
        Assert.Empty(result.GetProperty("positions").EnumerateArray());Assert.Equal(JsonValueKind.Null,result.GetProperty("buyingPower").ValueKind);
        Assert.Throws<ApiFailure>(()=>SaxoLocalSession.EnvironmentName("live/../sim"));
        Assert.Equal("MSFT",SaxoReadClient.ResearchSymbol("MSFT:xnas"));
        Assert.Equal("NOVO-B.CO",SaxoReadClient.ResearchSymbol("NOVOb:xcse"));
        Assert.Null(SaxoReadClient.ResearchSymbol("SAPG:xetr"));
    }
    [Fact]
    public void Saxo_account_summary_keeps_account_currency_and_missing_values_distinct()
    {
        var a=JsonSerializer.Deserialize<JsonElement>("""{"AccountId":"test","Currency":"EUR","AccountKey":"secret-key","ClientKey":"private","Active":true,"FractionalOrderEnabled":false}""");
        var b=JsonSerializer.Deserialize<JsonElement>("""{"Currency":"EUR","CashBalance":1000000,"CashAvailableForTrading":999973.83,"TotalValue":999973.83,"NonMarginPositionsValue":0,"TransactionsNotBooked":-26.17,"TransactionsNotBookedDetail":{"Commission":-26.14,"ExchangeFee":-0.01,"ShareValue":-0.02}}""");
        var mapped=JsonSerializer.SerializeToElement(SaxoReadClient.MapAccount(a,b));
        Assert.Equal("EUR",mapped.GetProperty("currency").GetString());Assert.Equal(999973.83m,mapped.GetProperty("available").GetDecimal());
        Assert.Equal(mapped.GetProperty("value").GetDecimal(),mapped.GetProperty("cash").GetDecimal()+mapped.GetProperty("unbooked").GetDecimal());
        Assert.Equal(0,mapped.GetProperty("invested").GetDecimal());Assert.Equal(JsonValueKind.Null,mapped.GetProperty("marginUsed").ValueKind);
        Assert.DoesNotContain("secret-key",mapped.ToString());Assert.DoesNotContain("private",mapped.ToString());
        Assert.False(mapped.GetProperty("fractionalOrders").GetBoolean());
        Assert.Throws<ApiFailure>(()=>SaxoReadClient.MapAccount(a,JsonSerializer.Deserialize<JsonElement>("""{"Currency":"DKK"}""")));
    }
}
