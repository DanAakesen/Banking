using System.Net.Http.Headers;
using System.Text.Json;
using Banking.Api.Services;

namespace Banking.Api.Providers;

// Read-only, with isolated SIM/LIVE credentials. No order or arbitrary URL surface.
public sealed class SaxoReadClient(HttpClient client, IConfiguration config, SaxoLocalSession session, SaxoReadCache? cache=null)
{
    string TokenKey(string market)=>SaxoLocalSession.EnvironmentName(market)=="SIM"?"Saxo:SimulationAccessToken":"Saxo:LiveAccessToken";
    string CacheIdentity(string market)=>Banking.Api.Security.Vault.Hash(session.CacheIdentity(market)+":"+config[TokenKey(market)]);
    public bool Configured => IsConfigured("SIM");
    public static string? ResearchSymbol(string? symbol)
    {
        if(symbol=="NOVOb:xcse")return "NOVO-B.CO";
        if(symbol=="MAERSKb:xcse")return "MAERSK-B.CO";
        if(symbol=="MAERSKa:xcse")return "MAERSK-A.CO";
        // Exact listings verified during the approved SIM portfolio preparation.
        if(symbol=="GMAB:xcse")return "GMAB.CO";
        if(symbol=="VWS:xcse")return "VWS.CO";
        if(symbol=="SIE:xetr")return "SIE.DE";
        if(string.IsNullOrEmpty(symbol))return null;
        var parts=symbol.Split(':');
        // Known US venue conventions only; do not silently map foreign listings.
        if(parts.Length==2 && parts[1] is "xnas" or "xnys" or "arcx" && parts[0].All(char.IsAsciiLetterOrDigit))return parts[0].ToUpperInvariant();
        return null;
    }
    public bool IsConfigured(string market)=>!session.Disconnected(market) && (!string.IsNullOrWhiteSpace(config[TokenKey(market)]) || session.Read(market)?.ExpiresAt > DateTimeOffset.UtcNow || session.Read(market)?.RefreshExpiresAt > DateTimeOffset.UtcNow);
    public Task<object> Read(CancellationToken ct,string market="SIM")
    {
        RequireReads(market);
        return cache is null?ReadCore(ct,market):cache.Read(market,CacheIdentity(market),false,()=>ReadCore(ct,market),ct);
    }
    public bool ReadEnabled(string market)=>config.GetValue<bool?>("Saxo:ReadEnabled")!=false && (market!="LIVE"||config.GetValue<bool>("Saxo:LIVE:ReadEnabled"));
    void RequireReads(string market) { SaxoLocalSession.EnvironmentName(market);if(!ReadEnabled(market))throw new ApiFailure(503,"SAXO_READ_DISABLED"); }
    async Task<object> ReadCore(CancellationToken ct,string market)
    {
        if (!IsConfigured(market)) throw new ApiFailure(503, "SAXO_ACCESS_REQUIRED");
        var balances = await Get("port/v1/balances/me?FieldGroups=CalculateCashForTrading", ct,market);
        var positions = await Get("port/v1/positions/me?$top=100&FieldGroups=PositionBase,PositionView,DisplayAndFormat,Costs", ct,market);
        var accountData=await Get("port/v1/accounts/me?$top=100",ct,market);
        Check.That(accountData.TryGetProperty("Data",out var accounts)&&accounts.ValueKind==JsonValueKind.Array,"SAXO_INVALID_ACCOUNTS");
        Check.That(!accountData.TryGetProperty("__next",out _)&&accounts.GetArrayLength()<=20,"SAXO_ACCOUNT_COVERAGE_REQUIRED");
        var summaries=new List<object>();
        foreach(var account in accounts.EnumerateArray()){
            var key=account.GetProperty("AccountKey").GetString()!;var clientKey=account.GetProperty("ClientKey").GetString()!;
            var balance=await Get("port/v1/balances?AccountKey="+Uri.EscapeDataString(key)+"&ClientKey="+Uri.EscapeDataString(clientKey)+"&FieldGroups=CalculateCashForTrading,MarginOverview",ct,market);
            summaries.Add(MapAccount(account,balance));
        }
        return Map(balances, positions, DateTimeOffset.UtcNow,market,summaries);
    }
    public Task<object> Activity(CancellationToken ct,string market="SIM") {
        RequireReads(market);
        return cache is null?ActivityCore(ct,market):cache.Read(market,CacheIdentity(market),true,()=>ActivityCore(ct,market),ct);
    }
    async Task<object> ActivityCore(CancellationToken ct,string market) {
        static JsonElement[] Rows(JsonElement e)=>e.TryGetProperty("Data",out var d)&&d.ValueKind==JsonValueKind.Array?d.EnumerateArray().Take(100).ToArray():throw new ApiFailure(502,"SAXO_INVALID_RESPONSE");
        static bool More(JsonElement e)=>e.TryGetProperty("__next",out var n)&&n.ValueKind==JsonValueKind.String || e.TryGetProperty("Data",out var d)&&d.GetArrayLength()>100;
        var data=await Get("port/v1/orders/me?$top=100&FieldGroups=DisplayAndFormat",ct,market);
        JsonElement? history=null;string? historyError=null;
        try {history=await Get("cs/v1/audit/orderactivities?$top=100&FieldGroups=DisplayAndFormat&FromDateTime="+Uri.EscapeDataString(DateTimeOffset.UtcNow.AddDays(-7).ToString("O")),ct,market);}
        catch(ApiFailure ex){historyError=ex.Code;}
        return new {environment=market,observedAt=DateTimeOffset.UtcNow,orders=Rows(data).Select(SaxoOrders.MapOpenOrder).ToArray(),hasMore=More(data),
            history=history.HasValue?Rows(history.Value).Select(SaxoOrders.MapActivity).ToArray():null,historyError,historyHasMore=history.HasValue&&More(history.Value)};
    }
    async Task<JsonElement> Get(string path, CancellationToken ct,string market)
    {
        using var request=new HttpRequestMessage(HttpMethod.Get,"https://gateway.saxobank.com/"+(market=="SIM"?"sim/":"")+"openapi/"+path);
        var token=await session.Token(ct,market)??(session.Disconnected(market)?null:config[TokenKey(market)]);
        if(string.IsNullOrWhiteSpace(token))throw new ApiFailure(503,"SAXO_SIGN_IN_REQUIRED");
        request.Headers.Authorization=new AuthenticationHeaderValue("Bearer",token);
        using var response=await client.SendAsync(request,HttpCompletionOption.ResponseHeadersRead,ct);
        if(!response.IsSuccessStatusCode)throw new ApiFailure(503,(int)response.StatusCode switch {401=>"SAXO_SIGN_IN_REQUIRED",403=>"SAXO_PERMISSION_REQUIRED",429=>"SAXO_RATE_LIMITED",409=>"SAXO_READ_CONFLICT",_=>"SAXO_READ_UNAVAILABLE"});
        await response.Content.LoadIntoBufferAsync(2_000_000,ct);
        return JsonSerializer.Deserialize<JsonElement>(await response.Content.ReadAsStringAsync(ct));
    }
    public static object MapAccount(JsonElement account,JsonElement balance)
    {
        static string? T(JsonElement x,string k)=>x.TryGetProperty(k,out var v)&&v.ValueKind==JsonValueKind.String?v.GetString():null;
        static decimal? N(JsonElement x,string k)=>x.TryGetProperty(k,out var v)&&v.ValueKind==JsonValueKind.Number&&v.TryGetDecimal(out var n)?n:null;
        static bool? B(JsonElement x,string k)=>x.TryGetProperty(k,out var v)&&v.ValueKind is JsonValueKind.True or JsonValueKind.False?v.GetBoolean():null;
        var currency=T(balance,"Currency");Check.Currency(currency);
        Check.That(currency==T(account,"Currency"),"SAXO_ACCOUNT_CURRENCY_MISMATCH");
        var fees=balance.TryGetProperty("TransactionsNotBookedDetail",out var detail)&&detail.ValueKind==JsonValueKind.Object?detail:JsonSerializer.SerializeToElement(new{});
        return new {id=T(account,"AccountId"),currency,accountType=T(account,"AccountType"),active=B(account,"Active"),
            fractionalOrders=B(account,"FractionalOrderEnabled"),marginTrading=B(account,"IsMarginTradingAllowed"),conversionAtSettlement=B(account,"IsCurrencyConversionAtSettlementTime"),
            cash=N(balance,"CashBalance"),available=N(balance,"CashAvailableForTrading"),value=N(balance,"TotalValue"),invested=N(balance,"NonMarginPositionsValue"),
            unbooked=N(balance,"TransactionsNotBooked"),blocked=N(balance,"CashBlocked"),commission=N(fees,"Commission"),exchangeFees=N(fees,"ExchangeFee"),shareValue=N(fees,"ShareValue"),
            marginUsed=N(balance,"MarginUsedByCurrentPositions"),marginAvailable=N(balance,"MarginAvailableForTrading"),marginUtilization=N(balance,"MarginUtilizationPct"),
            openPositions=N(balance,"OpenPositionsCount"),orders=N(balance,"OrdersCount"),reliability=T(balance,"CalculationReliability")};
    }
    public static object Map(JsonElement balances, JsonElement positions, DateTimeOffset observedAt,string market="SIM",IReadOnlyList<object>? accounts=null)
    {
        static decimal? Number(JsonElement e,string key)=>SaxoOrders.Number(e,key);
        static string? Text(JsonElement e,string key)=>SaxoOrders.Text(e,key);
        static JsonElement Part(JsonElement e,string key)=>e.ValueKind==JsonValueKind.Object&&e.TryGetProperty(key,out var x)?x:default;
        static object? Cost(JsonElement e)=>e.ValueKind!=JsonValueKind.Object?null:new{
            commission=Number(e,"Commission"),exchangeFee=Number(e,"ExchangeFee"),stampDuty=Number(e,"StampDuty"),
            additionalTransactionCosts=Number(e,"AdditionalTransactionCosts"),externalCharges=Number(e,"ExternalCharges"),performanceFee=Number(e,"PerformanceFee")};
        Check.That(positions.TryGetProperty("Data",out var data)&&data.ValueKind==JsonValueKind.Array,"SAXO_INVALID_POSITIONS");
        var currency=Text(balances,"Currency"); Check.Currency(currency);
        var rows=data.EnumerateArray().Take(100).Select(p=>{
            var basis=p.TryGetProperty("PositionBase",out var b)?b:default;
            var view=p.TryGetProperty("PositionView",out var v)?v:default;
            var display=p.TryGetProperty("DisplayAndFormat",out var d)?d:default;
            var costs=Part(p,"Costs");
            return new { positionId=Text(p,"PositionId"),netPositionId=Text(p,"NetPositionId"),accountId=Text(basis,"AccountId"),
                currency=Text(display,"Currency"),baseCurrency=currency,status=Text(basis,"Status"),sourceOrderId=Text(basis,"SourceOrderId"),
                openPrice=Number(basis,"OpenPrice"),openPriceIncludingCosts=Number(basis,"OpenPriceIncludingCosts"),
                openedAt=Text(basis,"ExecutionTimeOpen"),valueDate=Text(basis,"ValueDate"),
                marketValue=Number(view,"MarketValue"),marketValueInBaseCurrency=Number(view,"MarketValueInBaseCurrency"),
                marketValueOpenInBaseCurrency=Number(view,"MarketValueOpenInBaseCurrency"),
                priceAsOf=Text(view,"CurrentPriceLastTraded"),priceType=Text(view,"CurrentPriceType"),
                conversionRateOpen=Number(view,"ConversionRateOpen"),conversionRateCurrent=Number(view,"ConversionRateCurrent"),
                profitLoss=Number(view,"ProfitLossOnTrade"),currencyProfitLoss=Number(view,"ProfitLossCurrencyConversion"),
                openCosts=Cost(Part(costs,"OpenCost")),openCostsInBaseCurrency=Cost(Part(costs,"OpenCostInBaseCurrency")),
                estimatedCloseCostsInBaseCurrency=Cost(Part(costs,"CloseCostInBaseCurrency")),
                name=display.ValueKind==JsonValueKind.Object?Text(display,"Description")??Text(display,"Symbol"):null,
                priceDecimals=Number(display,"Decimals"),quantityText=Number(basis,"Amount")?.ToString(System.Globalization.CultureInfo.InvariantCulture),
                symbol=display.ValueKind==JsonValueKind.Object?Text(display,"Symbol"):null,
                researchSymbol=display.ValueKind==JsonValueKind.Object?ResearchSymbol(Text(display,"Symbol")):null,
                instrument=basis.ValueKind==JsonValueKind.Object?Number(basis,"Uic"):null,
                quantity=basis.ValueKind==JsonValueKind.Object?Number(basis,"Amount"):null,
                assetType=basis.ValueKind==JsonValueKind.Object?Text(basis,"AssetType"):null,
                price=view.ValueKind==JsonValueKind.Object?Number(view,"CurrentPrice"):null,
                priceDelayMinutes=view.ValueKind==JsonValueKind.Object?Number(view,"CurrentPriceDelayMinutes"):null,
                profitLossInBaseCurrency=view.ValueKind==JsonValueKind.Object?Number(view,"ProfitLossOnTradeInBaseCurrency"):null,
                reliability=view.ValueKind==JsonValueKind.Object?Text(view,"CalculationReliability"):null };
        }).ToArray();
        return new { source="Saxo "+market, simulation=market=="SIM", observedAt, currency,
            buyingPower=Number(balances,"CashAvailableForTrading"),
            cash=Number(balances,"CashBalance"), totalValue=Number(balances,"TotalValue"), reliability=Text(balances,"CalculationReliability"),
            accounts=accounts??[], positions=rows, total=Number(positions,"__count"), hasMore=data.GetArrayLength()>100||positions.TryGetProperty("__next",out var next)&&next.ValueKind==JsonValueKind.String,
            coverage="First 100 positions. Broker snapshot is separate from recorded wealth. Total value includes cash and unsettled transactions; never add cash to it again." };
    }
}
