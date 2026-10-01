using System.Net;
using System.Text.Json;
using Banking.Api.Providers;
using Banking.Api.Security;
using Banking.Api.Services;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;

namespace Banking.Tests;
public sealed class SaxoOrderTests
{
    sealed class Host(string name):IHostEnvironment{public string EnvironmentName{get;set;}=name;public string ApplicationName{get;set;}="tests";public string ContentRootPath{get;set;}="";public IFileProvider ContentRootFileProvider{get;set;}=new NullFileProvider();}
    sealed class Clock:TimeProvider{public DateTimeOffset Now=DateTimeOffset.UtcNow;public override DateTimeOffset GetUtcNow()=>Now;}
    sealed class Broker:HttpMessageHandler,IHttpClientFactory
    {
        public int Writes,Reads;public bool Timeout,Reject,RejectWrite,MissingChild;public decimal Cash=1000,RequiredCash=101;public string RequiredCurrency="DKK";public JsonElement LastPayload;public Action? BeforePrecheck;
        public string QuoteResponse="""{"Quote":{"Bid":99,"Ask":100}}""";
        public HttpClient CreateClient(string name)=>new(this,false);
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage r,CancellationToken ct){
            var path=r.RequestUri!.AbsolutePath;var body=r.Content is null?"":await r.Content.ReadAsStringAsync(ct);
            if(path.EndsWith("/token"))return Ok("""{"access_token":"test","refresh_token":"refresh","expires_in":3600,"refresh_token_expires_in":86400}""");
            Assert.StartsWith("/sim/openapi/",path);Assert.Equal("Bearer",r.Headers.Authorization?.Scheme);
            if(r.Method==HttpMethod.Get)Reads++;
            if(path.EndsWith("/ref/v1/instruments"))return Ok("""{"Data":[{"Identifier":6041,"Description":"Test stock","Symbol":"TEST:xcse"}]}""");
            if(path.EndsWith("/infoprices"))return Ok(QuoteResponse);
            if(path.EndsWith("/orderactivities"))return Ok("""{"Data":[]}""");
            if(path.EndsWith("/accounts/me"))return Ok("""{"Data":[{"AccountKey":"account","AccountId":"SIM","ClientKey":"client","Currency":"DKK"}]}""");
            if(path.Contains("/instruments/details/"))return Ok("""{"AssetType":"Stock","IsTradable":true,"TickSize":0.01,"MinimumLotSize":1,"Description":"Test stock","CurrencyCode":"DKK","SupportedOrderTypes":["Limit","StopIfTraded"],"StopLossDefaultOrderType":"StopIfTraded"}""");
            if(path.EndsWith("/balances"))return Ok(JsonSerializer.Serialize(new{Currency="DKK",CashAvailableForTrading=Cash}));
            if(path.EndsWith("/positions/me")||path.EndsWith("/orders/me"))return Ok("""{"Data":[]}""");
            if(path.EndsWith("/precheck")){BeforePrecheck?.Invoke();Assert.True(JsonDocument.Parse(body).RootElement.GetProperty("ManualOrder").GetBoolean());return Ok(Reject?"""{"PreCheckResult":"Error","ErrorInfo":{"ErrorCode":"Rejected"}}""":JsonSerializer.Serialize(new{PreCheckResult="Ok",EstimatedCashRequired=RequiredCash,EstimatedCashRequiredCurrency=RequiredCurrency,EstimatedTotalCost=1}));}
            if(path.EndsWith("/orders")){LastPayload=JsonSerializer.Deserialize<JsonElement>(body);Assert.False(LastPayload.TryGetProperty("ClearForceOpen",out _));Writes++;if(Timeout)throw new HttpRequestException("Unknown network outcome");if(RejectWrite)return new(HttpStatusCode.BadRequest){Content=new StringContent("""{"ErrorInfo":{"ErrorCode":"MarketClosed"}}""")};return Ok(LastPayload.TryGetProperty("Orders",out var children)&&!MissingChild?JsonSerializer.Serialize(new{OrderId="123",Orders=children.EnumerateArray().Select((x,i)=>new{OrderId=(124+i).ToString()})}):"""{"OrderId":"123"}""");}
            throw new Exception("Unexpected broker endpoint "+path);
        }
        static HttpResponseMessage Ok(string json)=>new(HttpStatusCode.OK){Content=new StringContent(json)};
    }
    sealed class Fixture:IDisposable
    {
        public readonly string Dir=Path.Combine(Path.GetTempPath(),"Banking-Orders-Test-"+Guid.NewGuid().ToString("N"));
        public readonly Broker Broker=new();public readonly Clock Clock=new();public readonly IDataProtectionProvider Protection=new EphemeralDataProtectionProvider();
        public readonly Workspace Workspace=new(){DemoScope="visitor-a",SessionScope="session-a"};public IConfiguration Config;public SaxoLocalSession Session;
        public Fixture(){Config=new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?>{["Cloud:Origin"]="https://test.example",["Cloud:StateDirectory"]=Dir,["Saxo:OrderStateDirectory"]=Path.Combine(Dir,"orders"),["Saxo:SIM:AppKey"]="key",["Saxo:SIM:AppSecret"]="secret",["Saxo:SIM:RedirectUri"]="https://test.example/api/saxo/auth/callback"}).Build();Session=new(new Host("Production"),Broker,Clock,Config,Protection);}
        public SaxoOrders Service()=>new(Broker,Session,new Host("Testing"),Config,Protection,Clock);
        public SaxoOrders Production()=>new(Broker,Session,new Host("Production"),Config,Protection,Clock);
        public async Task Login(){var url=JsonSerializer.SerializeToElement(Session.Start()).GetProperty("authorizationUrl").GetString()!;var state=url.Split("state=")[1].Split('&')[0];await Session.Complete(state,"code",default);}
        public void Dispose(){Broker.Dispose();if(Directory.Exists(Dir))Directory.Delete(Dir,true);}
    }
    static Guid Id(object preview)=>JsonSerializer.SerializeToElement(preview).GetProperty("ticketId").GetGuid();
    static string State(object receipt)=>JsonSerializer.SerializeToElement(receipt,new JsonSerializerOptions(JsonSerializerDefaults.Web)).GetProperty("state").GetString()!;
    static SaxoOrderInput Buy()=>new(6041,"account","Buy",1,100);
    [Fact] public async Task Different_tickets_share_frequency_and_currency_notional_limits()
    {
        using var f=new Fixture();await f.Login();var service=f.Service();
        for(var i=0;i<3;i++){var id=Id(await service.Preview(Buy(),f.Workspace,default));Assert.Equal("Accepted",State(await service.Submit(id,f.Workspace,default,true)));}
        var next=Id(await service.Preview(Buy(),f.Workspace,default));
        Assert.Equal("SAXO_ORDER_FREQUENCY_LIMIT",(await Assert.ThrowsAsync<ApiFailure>(()=>service.Submit(next,f.Workspace,default,true))).Code);
        Assert.Equal(3,f.Broker.Writes);
        f.Clock.Now=f.Clock.Now.AddSeconds(61);f.Config["Saxo:SIM:MaxDailyNotional"]="350";
        Assert.Equal("SAXO_DAILY_NOTIONAL_LIMIT",(await Assert.ThrowsAsync<ApiFailure>(()=>service.Submit(next,f.Workspace,default,true))).Code);
        f.Config["Saxo:SIM:MaxDailyNotional"]="1000";f.Config["Saxo:SIM:MaxOrderNotional"]="50";
        Assert.Equal("SAXO_ORDER_NOTIONAL_LIMIT",(await Assert.ThrowsAsync<ApiFailure>(()=>service.Submit(next,f.Workspace,default,true))).Code);
        Assert.Equal(3,f.Broker.Writes);
    }
    [Fact] public async Task Kill_switch_changed_during_precheck_prevents_submission()
    {
        using var f=new Fixture();await f.Login();f.Config["Saxo:SIM:TradingEnabled"]="true";var service=f.Production();
        var id=Id(await service.Preview(Buy(),f.Workspace,default));
        f.Broker.BeforePrecheck=()=>f.Config["Saxo:SIM:TradingEnabled"]="false";
        Assert.Equal("SAXO_SIM_TRADING_DISABLED",(await Assert.ThrowsAsync<ApiFailure>(()=>service.Submit(id,f.Workspace,default,true))).Code);
        Assert.Equal(0,f.Broker.Writes);
    }
    [Theory]
    [InlineData("{\"Quote\":{\"ErrorCode\":\"None\",\"PriceTypeAsk\":\"NoAccess\",\"PriceTypeBid\":\"NoAccess\"}}","SAXO_MARKET_DATA_NO_ACCESS")]
    [InlineData("{\"Quote\":{\"Ask\":100,\"PriceTypeBid\":\"NoAccess\"}}","SAXO_MARKET_DATA_NO_ACCESS")]
    [InlineData("{\"Quote\":{\"Ask\":100,\"ErrorCode\":\"PriceNotAvailable\"}}","SAXO_QUOTE_UNAVAILABLE")]
    [InlineData("{\"Quote\":{\"Ask\":0,\"Bid\":0}}","SAXO_QUOTE_UNAVAILABLE")]
    [InlineData("{}","SAXO_QUOTE_UNAVAILABLE")]
    [InlineData("{\"Quote\":{\"Ask\":100,\"Bid\":99,\"DelayedByMinutes\":15}}",null)]
    public void Successful_http_response_does_not_imply_quote_access(string json,string? expected)
        => Assert.Equal(expected,SaxoOrders.QuoteError(JsonSerializer.Deserialize<JsonElement>(json)));
    [Fact] public async Task Ticket_surfaces_denied_prices_without_losing_instrument_or_account_details()
    {
        using var f=new Fixture();await f.Login();
        f.Broker.QuoteResponse="""{"Quote":{"ErrorCode":"None","PriceTypeAsk":"NoAccess","PriceTypeBid":"NoAccess"}}""";
        var ticket=JsonSerializer.SerializeToElement(await f.Production().Ticket(6041,default));
        Assert.Equal("SAXO_MARKET_DATA_NO_ACCESS",ticket.GetProperty("quoteError").GetString());
        Assert.Single(ticket.GetProperty("accounts").EnumerateArray());
        Assert.Equal("NoAccess",ticket.GetProperty("quote").GetProperty("Quote").GetProperty("PriceTypeAsk").GetString());
        Assert.Equal(0,f.Broker.Writes);
    }
    [Fact] public async Task Attached_exit_orders_are_part_of_the_approved_payload(){using var f=new Fixture();await f.Login();var s=f.Service();var input=Buy() with{StopLoss=90,TakeProfit=120,Duration="GoodTillCancel"};var id=Id(await s.Preview(input,f.Workspace,default));Assert.Equal("Accepted",State(await s.Submit(id,f.Workspace,default,confirmed:true)));var payload=f.Broker.LastPayload;Assert.Equal("GoodTillCancel",payload.GetProperty("OrderDuration").GetProperty("DurationType").GetString());var children=payload.GetProperty("Orders");Assert.Equal(2,children.GetArrayLength());Assert.Equal("StopIfTraded",children[0].GetProperty("OrderType").GetString());Assert.Equal(90,children[0].GetProperty("OrderPrice").GetDecimal());Assert.Equal("Sell",children[0].GetProperty("BuySell").GetString());Assert.Equal("Limit",children[1].GetProperty("OrderType").GetString());}
    [Fact] public async Task Missing_child_acceptance_is_uncertain_and_never_replayed(){using var f=new Fixture();await f.Login();var s=f.Service();var id=Id(await s.Preview(Buy() with{StopLoss=90},f.Workspace,default));f.Broker.MissingChild=true;Assert.Equal("Unknown",State(await s.Submit(id,f.Workspace,default,confirmed:true)));await s.Submit(id,f.Workspace,default,confirmed:true);Assert.Equal(1,f.Broker.Writes);}
    [Fact] public void Invalid_exits_and_duration_are_rejected(){Assert.Throws<ApiFailure>(()=>SaxoOrders.Validate(Buy() with{StopLoss=101}));Assert.Throws<ApiFailure>(()=>SaxoOrders.Validate(Buy() with{TakeProfit=99}));Assert.Throws<ApiFailure>(()=>SaxoOrders.Validate(Buy() with{Side="Sell",StopLoss=90}));Assert.Throws<ApiFailure>(()=>SaxoOrders.Validate(Buy() with{Duration="Forever"}));Assert.False(SaxoOrders.Passed(JsonSerializer.Deserialize<JsonElement>("""{"PreCheckResult":"Ok","Orders":[{"ErrorInfo":{"ErrorCode":"InvalidStop"}}]}""")));}
    [Fact] public async Task Repeated_submit_and_service_restart_only_write_once(){using var f=new Fixture();await f.Login();var s=f.Service();var id=Id(await s.Preview(Buy(),f.Workspace,default));Assert.Equal("Accepted",State(await s.Submit(id,f.Workspace,default,confirmed:true)));Assert.Equal("Accepted",State(await f.Service().Submit(id,f.Workspace,default,confirmed:true)));Assert.Equal(1,f.Broker.Writes);Assert.DoesNotContain("account",File.ReadAllText(Path.Combine(f.Dir,"orders",id.ToString("N")+".protected")));}
    [Fact] public async Task Timeout_is_persisted_and_never_retried(){using var f=new Fixture();await f.Login();var s=f.Service();var id=Id(await s.Preview(Buy(),f.Workspace,default));f.Broker.Timeout=true;Assert.Equal("Unknown",State(await s.Submit(id,f.Workspace,default,confirmed:true)));await f.Service().Submit(id,f.Workspace,default,confirmed:true);Assert.Equal(1,f.Broker.Writes);}
    [Fact] public async Task Explicit_broker_rejection_is_not_reported_as_network_uncertainty(){using var f=new Fixture();await f.Login();var s=f.Service();var id=Id(await s.Preview(Buy(),f.Workspace,default));f.Broker.RejectWrite=true;Assert.Equal("Rejected",State(await s.Submit(id,f.Workspace,default,confirmed:true)));await s.Submit(id,f.Workspace,default,confirmed:true);Assert.Equal(1,f.Broker.Writes);}
    [Fact] public async Task Workspace_expiry_and_changed_registration_are_checked(){using var f=new Fixture();await f.Login();var s=f.Service();var id=Id(await s.Preview(Buy(),f.Workspace,default));await Assert.ThrowsAsync<ApiFailure>(()=>s.Submit(id,new Workspace{DemoScope="other"},default,confirmed:true));f.Config["Saxo:SIM:AppKey"]="replacement";Assert.Equal("SAXO_REGISTRATION_CHANGED",(await Assert.ThrowsAsync<ApiFailure>(()=>s.Submit(id,f.Workspace,default,confirmed:true))).Code);f.Config["Saxo:SIM:AppKey"]="key";f.Clock.Now=f.Clock.Now.AddMinutes(3);await Assert.ThrowsAsync<ApiFailure>(()=>s.Submit(id,f.Workspace,default,confirmed:true));Assert.Equal(0,f.Broker.Writes);}
    [Fact] public async Task Cash_short_sales_and_precheck_errors_block_writes(){using var f=new Fixture();await f.Login();var s=f.Service();f.Broker.Cash=50;await Assert.ThrowsAsync<ApiFailure>(()=>s.Preview(Buy(),f.Workspace,default));await Assert.ThrowsAsync<ApiFailure>(()=>s.Preview(Buy() with{Side="Sell"},f.Workspace,default));f.Broker.Cash=1000;f.Broker.Reject=true;var r=await s.Preview(Buy(),f.Workspace,default);Assert.Equal("Rejected",State(r));await s.Submit(Id(r),f.Workspace,default,confirmed:true);Assert.Equal(0,f.Broker.Writes);}
    [Theory] [InlineData("LIVE")] [InlineData("live")] [InlineData("invalid")]
    public void Non_sim_order_environments_fail(string market){Assert.Equal("SAXO_ORDERS_SIM_ONLY",Assert.Throws<ApiFailure>(()=>SaxoOrders.RequireSim(market)).Code);}
    [Fact] public void Invalid_inputs_fail(){Assert.Throws<ApiFailure>(()=>SaxoOrders.Validate(Buy() with{Quantity=0}));Assert.Throws<ApiFailure>(()=>SaxoOrders.Validate(Buy() with{LimitPrice=-1}));Assert.False(SaxoOrders.Passed(JsonSerializer.Deserialize<JsonElement>("""{"PreCheckResult":"Ok","PreTradeDisclaimers":{}}""")));}

    [Fact] public async Task Production_reads_work_without_enabling_trading_or_owner_login()
    {
        using var f=new Fixture();await f.Login();var service=f.Production();
        SaxoOrders.RequireSim("SIM");
        await service.Search("Test",default);await service.Ticket(6041,default);
        var snapshot=JsonSerializer.SerializeToElement(await service.Orders(f.Workspace,default));
        Assert.Equal("SIM",snapshot.GetProperty("environment").GetString());
        Assert.Empty(snapshot.GetProperty("receipts").EnumerateArray());
        Assert.True(f.Broker.Reads>0);Assert.Equal(0,f.Broker.Writes);
    }

    [Fact] public async Task Production_demo_trading_requires_enablement_session_and_explicit_confirmation()
    {
        using var f=new Fixture();await f.Login();var service=f.Production();
        Assert.Equal("SAXO_SIM_TRADING_DISABLED",(await Assert.ThrowsAsync<ApiFailure>(()=>service.Preview(Buy(),f.Workspace,default))).Code);
        f.Config["Saxo:SIM:TradingEnabled"]="true";
        Assert.False(f.Workspace.OwnerAuthenticated);
        Assert.Equal("SAXO_SESSION_REQUIRED",(await Assert.ThrowsAsync<ApiFailure>(()=>service.Preview(Buy(),new Workspace(),default))).Code);
        Assert.Equal("SAXO_SESSION_REQUIRED",(await Assert.ThrowsAsync<ApiFailure>(()=>service.Submit(Guid.NewGuid(),new Workspace(),default,true))).Code);
        var id=Id(await service.Preview(Buy(),f.Workspace,default));
        Assert.Equal("SAXO_CONFIRMATION_REQUIRED",(await Assert.ThrowsAsync<ApiFailure>(()=>service.Submit(id,f.Workspace,default))).Code);
        Assert.Equal(0,f.Broker.Writes);
        Assert.Equal("Accepted",State(await service.Submit(id,f.Workspace,default,true)));
        Assert.Equal(1,f.Broker.Writes);
        f.Config["Saxo:SIM:TradingEnabled"]="false";
        Assert.Equal("Accepted",State(service.Receipt(id,f.Workspace)));
        Assert.Equal("SAXO_SIM_TRADING_DISABLED",(await Assert.ThrowsAsync<ApiFailure>(()=>service.Submit(id,f.Workspace,default,true))).Code);
    }

    [Fact] public async Task Cloud_receipts_survive_restart_use_persistent_state_and_stay_private()
    {
        using var f=new Fixture();await f.Login();f.Config["Saxo:SIM:TradingEnabled"]="true";f.Workspace.OwnerAuthenticated=true;
        var service=f.Production();var id=Id(await service.Preview(Buy(),f.Workspace,default));
        await service.Submit(id,f.Workspace,default,true);
        var path=Path.Combine(f.Dir,"saxo-orders-sim",id.ToString("N")+".protected");
        Assert.True(File.Exists(path));Assert.DoesNotContain("account",File.ReadAllText(path));
        Assert.False(Directory.Exists(Path.Combine(f.Dir,"orders")));
        Assert.Equal("Accepted",State(await f.Production().Submit(id,f.Workspace,default,true)));
        Assert.Equal(1,f.Broker.Writes);
        var visitor=new Workspace{DemoScope=f.Workspace.DemoScope,SessionScope="session-b"};
        Assert.Equal("ORDER_NOT_FOUND",Assert.Throws<ApiFailure>(()=>service.Receipt(id,visitor)).Code);
        var data=JsonSerializer.SerializeToElement(await service.Orders(visitor,default));
        Assert.Empty(data.GetProperty("receipts").EnumerateArray());
    }

    [Fact] public async Task Demo_visitors_sharing_financial_data_cannot_confirm_each_others_tickets()
    {
        using var f=new Fixture();await f.Login();f.Config["Saxo:SIM:TradingEnabled"]="true";
        f.Workspace.DemoScope="";
        var other=new Workspace{DemoScope="",SessionScope="session-b"};
        var service=f.Production();var id=Id(await service.Preview(Buy(),f.Workspace,default));
        Assert.Equal("ORDER_NOT_FOUND",(await Assert.ThrowsAsync<ApiFailure>(()=>service.Submit(id,other,default,true))).Code);
        Assert.Equal(0,f.Broker.Writes);
        Assert.Equal("Reviewed",State(service.Receipt(id,f.Workspace)));
        Assert.Equal("Accepted",State(await service.Submit(id,f.Workspace,default,true)));
        var own=JsonSerializer.SerializeToElement(await service.Orders(f.Workspace,default));
        Assert.Single(own.GetProperty("receipts").EnumerateArray());
        var others=JsonSerializer.SerializeToElement(await service.Orders(other,default));
        Assert.Empty(others.GetProperty("receipts").EnumerateArray());
        Assert.Equal(1,f.Broker.Writes);
    }

    [Fact] public async Task Durable_claim_blocks_replay_after_crash_before_receipt_update()
    {
        using var f=new Fixture();await f.Login();f.Config["Saxo:SIM:TradingEnabled"]="true";f.Workspace.OwnerAuthenticated=true;
        var id=Id(await f.Production().Preview(Buy(),f.Workspace,default));
        File.WriteAllBytes(Path.Combine(f.Dir,"saxo-orders-sim",id.ToString("N")+".claimed"),[]);
        Assert.Equal("Unknown",State(f.Production().Receipt(id,f.Workspace)));
        Assert.Equal("Unknown",State(await f.Production().Submit(id,f.Workspace,default,true)));
        Assert.Equal(0,f.Broker.Writes);
    }

    [Fact] public async Task Concurrent_confirmations_submit_once_and_increased_cost_requires_new_review()
    {
        using var f=new Fixture();await f.Login();f.Config["Saxo:SIM:TradingEnabled"]="true";f.Workspace.OwnerAuthenticated=true;
        var id=Id(await f.Production().Preview(Buy(),f.Workspace,default));
        f.Broker.RequiredCash=102;
        Assert.Equal("SAXO_COST_CHANGED_REVIEW_AGAIN",(await Assert.ThrowsAsync<ApiFailure>(()=>f.Production().Submit(id,f.Workspace,default,true))).Code);
        Assert.Equal(0,f.Broker.Writes);
        f.Broker.RequiredCash=101;
        var results=await Task.WhenAll(Enumerable.Range(0,8).Select(_=>f.Production().Submit(id,f.Workspace,default,true)));
        Assert.All(results,r=>Assert.Equal("Accepted",State(r)));Assert.Equal(1,f.Broker.Writes);
    }

    [Theory] [InlineData(false)] [InlineData(true)]
    public async Task Claim_created_by_another_process_during_precheck_is_not_overwritten(bool rejected)
    {
        using var f=new Fixture();await f.Login();f.Config["Saxo:SIM:TradingEnabled"]="true";f.Workspace.OwnerAuthenticated=true;
        var id=Id(await f.Production().Preview(Buy(),f.Workspace,default));
        f.Broker.Reject=rejected;
        f.Broker.BeforePrecheck=()=>File.WriteAllBytes(Path.Combine(f.Dir,"saxo-orders-sim",id.ToString("N")+".claimed"),[]);
        Assert.Equal("Unknown",State(await f.Production().Submit(id,f.Workspace,default,true)));
        Assert.Equal("Unknown",State(f.Production().Receipt(id,f.Workspace)));
        Assert.Equal(0,f.Broker.Writes);
    }
}
