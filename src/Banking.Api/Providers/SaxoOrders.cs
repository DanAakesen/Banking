using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Banking.Api.Security;
using Banking.Api.Services;
using Microsoft.AspNetCore.DataProtection;

namespace Banking.Api.Providers;

public sealed record SaxoOrderInput(int Uic, string AccountKey, string Side, int Quantity, decimal LimitPrice,
    string Duration = "DayOrder", decimal? StopLoss = null, decimal? TakeProfit = null, string? StopOrderType = null);
public sealed record SaxoOrderConfirmation(Guid TicketId, bool Confirm = false);
public sealed class SaxoOrderBrokerFailure(int status,string code,string? detail=null):Exception(code)
{public int Status{get;}=status;public string Code{get;}=code;public string? Detail{get;}=detail;}
public sealed record SaxoOrderTicket(Guid Id, string Scope, string AppKey, DateTimeOffset ExpiresAt,
    SaxoOrderInput Input, string Name, string Currency, JsonElement Precheck, string State = "Reviewed", string? OrderId = null, string? Error = null, string[]? RelatedOrderIds = null);

// Deliberately SIM-only. A persisted intent is consumed before the network write;
// uncertainty never causes an automatic resubmission.
public sealed class SaxoOrders(IHttpClientFactory clients, SaxoLocalSession session, IHostEnvironment env,
    IConfiguration config, IDataProtectionProvider protection, TimeProvider clock)
{
    static readonly SemaphoreSlim Gate = new(1, 1);
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    string DirectoryPath => CloudHosting.Enabled(env)
        ? Path.Combine(config["Cloud:StateDirectory"] ?? "/home/Banking", "saxo-orders-sim")
        : config["Saxo:OrderStateDirectory"] ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Banking", "orders");
    public static void RequireSim(string? market)
    { if ((market ?? "SIM") != "SIM") throw new ApiFailure(403,"SAXO_ORDERS_SIM_ONLY"); }
    public bool TradingEnabled => !CloudHosting.Enabled(env) || config.GetValue<bool>("Saxo:SIM:TradingEnabled");
    public void RequireTradingAccess(Workspace workspace)
    {
        if (!TradingEnabled) throw new ApiFailure(403,"SAXO_SIM_TRADING_DISABLED");
        RequireReceiptAccess(workspace);
    }
    void RequireReceiptAccess(Workspace workspace)
    {
        // Demo visitors may trade SIM, but review tickets belong to the
        // authenticated browser session, not the shared Demo data scope.
        if (CloudHosting.Enabled(env) && string.IsNullOrWhiteSpace(workspace.SessionScope))
            throw new ApiFailure(401,"SAXO_SESSION_REQUIRED");
    }
    string Scope(Workspace w) => CloudHosting.Enabled(env)
        ? w.Mode + ":session:" + w.SessionScope : w.Mode + ":" + w.DemoScope;
    public static string? Text(JsonElement e, string key) => e.ValueKind==JsonValueKind.Object && e.TryGetProperty(key,out var v)&&v.ValueKind==JsonValueKind.String?v.GetString():null;
    public static decimal? Number(JsonElement e, string key) => e.ValueKind==JsonValueKind.Object&&e.TryGetProperty(key,out var v)&&v.ValueKind==JsonValueKind.Number&&v.TryGetDecimal(out var n)?n:null;
    static JsonElement Part(JsonElement e,string key)=>e.ValueKind==JsonValueKind.Object&&e.TryGetProperty(key,out var p)?p:default;
    static string[] SupportedTypes(JsonElement detail)=>Part(detail,"SupportedOrderTypes").ValueKind==JsonValueKind.Array?Part(detail,"SupportedOrderTypes").EnumerateArray().Where(x=>x.ValueKind==JsonValueKind.String).Select(x=>x.GetString()!).ToArray():[];
    static JsonElement[] Rows(JsonElement e)=>Part(e,"Data").ValueKind==JsonValueKind.Array?e.GetProperty("Data").EnumerateArray().ToArray():throw new ApiFailure(502,"SAXO_INVALID_RESPONSE");
    static string Q(string s)=>Uri.EscapeDataString(s);
    async Task<JsonElement> Call(string path, CancellationToken ct, object? body=null)
    {
        var token=await session.Token(ct,"SIM");
        if(string.IsNullOrWhiteSpace(token))throw new ApiFailure(503,"SAXO_SIGN_IN_REQUIRED");
        using var req=new HttpRequestMessage(body is null?HttpMethod.Get:HttpMethod.Post,"https://gateway.saxobank.com/sim/openapi/"+path);
        req.Headers.Authorization=new AuthenticationHeaderValue("Bearer",token);
        if(body is not null)req.Content=JsonContent.Create(body, options:new JsonSerializerOptions{PropertyNamingPolicy=null});
        using var response=await clients.CreateClient("SaxoOrders").SendAsync(req,HttpCompletionOption.ResponseHeadersRead,ct);
        await response.Content.LoadIntoBufferAsync(2_000_000,ct);
        var raw=await response.Content.ReadAsStringAsync(ct);
        var data=string.IsNullOrWhiteSpace(raw)?JsonSerializer.SerializeToElement(new{}):JsonSerializer.Deserialize<JsonElement>(raw);
        if(!response.IsSuccessStatusCode){var code=Text(data,"ErrorCode")??Text(Part(data,"ErrorInfo"),"ErrorCode")??"REQUEST_FAILED";
            code=new string(code.Where(char.IsAsciiLetterOrDigit).Take(80).ToArray());
            if(path=="trade/v2/orders"){
                var detail=Text(Part(data,"ErrorInfo"),"Message")??Text(data,"Message");
                var model=Part(data,"ModelState");if(model.ValueKind==JsonValueKind.Object)detail=string.Join("; ",model.EnumerateObject().Select(p=>p.Name+": "+p.Value.ToString()));
                throw new SaxoOrderBrokerFailure((int)response.StatusCode,code,detail is {Length:>1000}?detail[..1000]:detail);}
            throw new ApiFailure(502,"SAXO_"+code);}
        return data;
    }
    public async Task<object> Search(string q,CancellationToken ct)
    {
        Check.That(!string.IsNullOrWhiteSpace(q)&&q.Length<=80,"INVALID_SEARCH");
        var data=await Call("ref/v1/instruments?AssetTypes=Stock&IncludeNonTradable=false&$top=25&Keywords="+Q(q),ct);
        return Rows(data).Select(x=>new {uic=Number(x,"Identifier"),name=Text(x,"Description"),symbol=Text(x,"Symbol"),exchange=Text(x,"ExchangeId")});
    }
    async Task<JsonElement[]> Accounts(CancellationToken ct)=>Rows(await Call("port/v1/accounts/me",ct));
    async Task<JsonElement> Account(string key,CancellationToken ct)
    { var found=(await Accounts(ct)).FirstOrDefault(a=>Text(a,"AccountKey")==key);
      Check.That(found.ValueKind==JsonValueKind.Object,"SAXO_ACCOUNT_NOT_OWNED");return found; }
    async Task<JsonElement> Instrument(int uic,CancellationToken ct)
    {Check.That(uic>0,"INVALID_INSTRUMENT");var d=await Call($"ref/v1/instruments/details/{uic}/Stock",ct);
     Check.That(Text(d,"AssetType")=="Stock"&&Part(d,"IsTradable").ValueKind==JsonValueKind.True,"SAXO_STOCK_NOT_TRADABLE");return d;}
    public async Task<object> Ticket(int uic,CancellationToken ct)
    {
        var detail=await Instrument(uic,ct);var accounts=await Accounts(ct);
        JsonElement quote=default;string? quoteError=null;
        try{quote=await Call($"trade/v1/infoprices?Uic={uic}&AssetType=Stock&FieldGroups=Quote,PriceInfoDetails",ct);quoteError=QuoteError(quote);}catch(ApiFailure ex){quoteError=ex.Code;}
        return new {uic,name=Text(detail,"Description"),symbol=Text(detail,"Symbol"),currency=Text(detail,"CurrencyCode"),
            supportedOrderTypes=SupportedTypes(detail),stopLossDefaultOrderType=Text(detail,"StopLossDefaultOrderType"),
            tickSize=Number(detail,"TickSize"),minimumLotSize=Number(detail,"MinimumLotSize"),
            accounts=accounts.Select(a=>new {key=Text(a,"AccountKey"),name=Text(a,"AccountId"),currency=Text(a,"Currency")}),
            quote=quote.ValueKind==JsonValueKind.Undefined?(JsonElement?)null:quote,quoteError,environment="SIM"};
    }
    // Saxo can return HTTP 200 / ErrorCode None while denying the actual prices.
    // Preserve the provider payload, but never report that as a successful quote.
    public static string? QuoteError(JsonElement response)
    {
        var quote=Part(response,"Quote");
        if(Text(quote,"PriceTypeAsk")=="NoAccess"||Text(quote,"PriceTypeBid")=="NoAccess")
            return "SAXO_MARKET_DATA_NO_ACCESS";
        if(Text(quote,"ErrorCode") is { } code && code!="None")return "SAXO_QUOTE_UNAVAILABLE";
        return Number(quote,"Ask")>0||Number(quote,"Bid")>0?null:"SAXO_QUOTE_UNAVAILABLE";
    }
    static Dictionary<string,object> Payload(SaxoOrderInput input,string reference){var payload=new Dictionary<string,object>{
        ["AccountKey"]=input.AccountKey,["Uic"]=input.Uic,["AssetType"]="Stock",["BuySell"]=input.Side,
        ["Amount"]=input.Quantity,["OrderType"]="Limit",["OrderPrice"]=input.LimitPrice,
        ["OrderDuration"]=new{DurationType=input.Duration},["ManualOrder"]=true,["ExternalReference"]=reference};
        var related=new List<object>();
        foreach(var (price,type) in new[]{(input.StopLoss,input.StopOrderType??"Stop"),(input.TakeProfit,"Limit")})
            if(price.HasValue)related.Add(new{AccountKey=input.AccountKey,Uic=input.Uic,AssetType="Stock",Amount=input.Quantity,BuySell="Sell",OrderType=type,OrderPrice=price.Value,ManualOrder=true,OrderDuration=new{DurationType="GoodTillCancel"}});
        if(related.Count>0)payload["Orders"]=related;
        return payload;
    }
    public static void Validate(SaxoOrderInput input)
    {Check.That(input.Uic>0&&input.AccountKey is {Length:>0 and <=200}&&input.Side is "Buy" or "Sell"&&input.Quantity is >0 and <=1000&&input.LimitPrice>0&&input.LimitPrice<=1_000_000,"INVALID_ORDER");
     Check.That(input.Duration is "DayOrder" or "GoodTillCancel","INVALID_ORDER_DURATION");
     Check.That(input.StopOrderType is null or "Stop" or "StopIfTraded","INVALID_STOP_ORDER_TYPE");
     Check.That((input.StopLoss is null&&input.TakeProfit is null)||input.Side=="Buy","RELATED_ORDERS_REQUIRE_BUY");
     Check.That(input.StopLoss is null||input.StopLoss>0&&input.StopLoss<input.LimitPrice,"INVALID_STOP_LOSS");
     Check.That(input.TakeProfit is null||input.TakeProfit>input.LimitPrice&&input.TakeProfit<=1_000_000,"INVALID_TAKE_PROFIT");}
    public static bool Passed(JsonElement p)=>Text(p,"PreCheckResult")=="Ok"&&Part(p,"ErrorInfo").ValueKind is JsonValueKind.Undefined or JsonValueKind.Null
        && Part(p,"PreTradeDisclaimers").ValueKind is JsonValueKind.Undefined or JsonValueKind.Null
        && (Part(p,"Orders").ValueKind!=JsonValueKind.Array||Part(p,"Orders").EnumerateArray().All(x=>
            Part(x,"ErrorInfo").ValueKind is JsonValueKind.Undefined or JsonValueKind.Null&&Text(x,"PreCheckResult") is null or "Ok"));
    public static void ValidateInstrument(SaxoOrderInput input,JsonElement detail)
    {
        Check.That(SupportedTypes(detail).Contains("Limit"),"SAXO_LIMIT_NOT_SUPPORTED");
        var minimum=Number(detail,"MinimumTradeSize")??Number(detail,"MinimumLotSize");
        Check.That(minimum is >0,"SAXO_LOT_RULES_REQUIRED");
        Check.That(input.Quantity>=minimum,"SAXO_MINIMUM_QUANTITY");
        var increment=Number(detail,"IncrementSize");
        if(increment is >0)Check.That(input.Quantity%increment==0,"SAXO_QUANTITY_INCREMENT");
        var minimumValue=Number(detail,"MinimumOrderValue");
        if(minimumValue is >0)Check.That(input.Quantity*input.LimitPrice>=minimumValue,"SAXO_MINIMUM_ORDER_VALUE");
        foreach(var (price,stop) in new[]{((decimal?)input.LimitPrice,false),(input.TakeProfit,false),(input.StopLoss,true)}) {
            if(price is null)continue;
            var tick=Number(detail,stop?"TickSizeStopOrder":"TickSizeLimitOrder");
            var scheme=Part(detail,"TickSizeScheme");var elements=Part(scheme,"Elements");
            if(tick is not >0&&elements.ValueKind==JsonValueKind.Array) {
                tick=elements.EnumerateArray().Where(x=>Number(x,"HighPrice")>=price).OrderBy(x=>Number(x,"HighPrice")).Select(x=>Number(x,"TickSize")).FirstOrDefault()??Number(scheme,"DefaultTickSize");
            }
            tick??=Number(detail,"TickSize");
            Check.That(tick is >0,"SAXO_TICK_RULES_REQUIRED");
            Check.That(price%tick==0,"SAXO_INVALID_PRICE_INCREMENT");
        }
    }
    // Independent of ticket deduplication. Charges conservative gross notional, including
    // rejected/uncertain submissions, per account and instrument currency; never guesses FX.
    sealed record RiskEntry(DateTimeOffset At,string Account,string Currency,decimal Notional);
    void ReserveRisk(SaxoOrderTicket ticket)
    {
        var path=Path.Combine(DirectoryPath,"risk.protected");
        var protector=protection.CreateProtector("Banking.SaxoOrders.Risk.v1");
        var entries=File.Exists(path)?JsonSerializer.Deserialize<List<RiskEntry>>(protector.Unprotect(File.ReadAllBytes(path)))??[]:new List<RiskEntry>();
        var now=clock.GetUtcNow();entries.RemoveAll(x=>x.At<now.AddDays(-1));
        Check.That(entries.Count(x=>x.At>now.AddMinutes(-1))<3,"SAXO_ORDER_FREQUENCY_LIMIT");
        var notional=ticket.Input.Quantity*ticket.Input.LimitPrice;
        var perOrder=config.GetValue<decimal?>("Saxo:SIM:MaxOrderNotional")??20000m;
        var daily=config.GetValue<decimal?>("Saxo:SIM:MaxDailyNotional")??100000m;
        Check.That(perOrder>0&&daily>0&&notional<=perOrder,"SAXO_ORDER_NOTIONAL_LIMIT");
        var account=Banking.Api.Security.Vault.Hash(ticket.Input.AccountKey);
        Check.That(entries.Where(x=>x.Account==account&&x.Currency==ticket.Currency).Sum(x=>x.Notional)+notional<=daily,"SAXO_DAILY_NOTIONAL_LIMIT");
        entries.Add(new(now,account,ticket.Currency,notional));
        File.WriteAllBytes(path+".tmp",protector.Protect(JsonSerializer.SerializeToUtf8Bytes(entries)));File.Move(path+".tmp",path,true);
    }
    async Task<JsonElement> ValidateAtBroker(SaxoOrderInput input,Guid id,CancellationToken ct)
    {
        Validate(input);var account=await Account(input.AccountKey,ct);Check.That(Part(account,"Active").ValueKind!=JsonValueKind.False,"SAXO_ACCOUNT_INACTIVE");var detail=await Instrument(input.Uic,ct);ValidateInstrument(input,detail);
        if(input.StopLoss.HasValue)Check.That(input.StopOrderType is not null&&SupportedTypes(detail).Contains(input.StopOrderType),"SAXO_STOP_TYPE_NOT_SUPPORTED");
        if(input.Side=="Sell"){
            var positions=await Call("port/v1/positions/me?$top=1000&FieldGroups=PositionBase",ct);
            var orders=await Call("port/v1/orders/me?$top=1000",ct);
            Check.That(Part(positions,"__next").ValueKind!=JsonValueKind.String&&Part(orders,"__next").ValueKind!=JsonValueKind.String,"SAXO_POSITION_COVERAGE_REQUIRED");
            var held=Rows(positions).Select(p=>Part(p,"PositionBase")).Where(p=>Text(p,"AccountKey")==input.AccountKey&&Text(p,"AssetType")=="Stock"&&Number(p,"Uic")==input.Uic).Sum(p=>Number(p,"Amount")??0);
            var reserved=Rows(orders).Where(o=>Text(o,"AccountKey")==input.AccountKey&&Number(o,"Uic")==input.Uic&&Text(o,"BuySell")=="Sell").Sum(o=>Number(o,"Amount")??0);
            Check.That(held-reserved>=input.Quantity,"SAXO_INSUFFICIENT_HOLDINGS");
        }
        var payload=Payload(input,"Banking-"+id.ToString("N"));
        payload["FieldGroups"]=new[]{"Costs","MarginImpactBuySell"};
        var result=await Call("trade/v2/orders/precheck",ct,payload);
        if(input.Side=="Buy"&&Passed(result)){
            var balance=await Call("port/v1/balances?AccountKey="+Q(input.AccountKey)+"&ClientKey="+Q(Text(await Account(input.AccountKey,ct),"ClientKey")??"")+"&FieldGroups=CalculateCashForTrading",ct);
            var cash=Number(balance,"CashAvailableForTrading");var required=Number(result,"EstimatedCashRequired");
            Check.That(cash.HasValue&&required.HasValue&&required>0&&Text(balance,"Currency")==Text(result,"EstimatedCashRequiredCurrency")&&cash>=required,"SAXO_CASH_CHECK_FAILED");
        }
        return result;
    }
    string PathFor(Guid id)=>Path.Combine(DirectoryPath,id.ToString("N")+".protected");
    void Save(SaxoOrderTicket ticket){Directory.CreateDirectory(DirectoryPath);var data=protection.CreateProtector("Banking.SaxoOrders.v1").Protect(JsonSerializer.SerializeToUtf8Bytes(ticket,Json));
        var path=PathFor(ticket.Id);File.WriteAllBytes(path+".tmp",data);File.Move(path+".tmp",path,true);}
    SaxoOrderTicket Load(Guid id,Workspace w){var path=PathFor(id);if(!File.Exists(path))throw new ApiFailure(404,"ORDER_NOT_FOUND");
        var t=JsonSerializer.Deserialize<SaxoOrderTicket>(protection.CreateProtector("Banking.SaxoOrders.v1").Unprotect(File.ReadAllBytes(path)),Json)!;
        if(t.Scope!=Scope(w))throw new ApiFailure(404,"ORDER_NOT_FOUND");
        // A process may die after claiming the submission but before saving its
        // uncertain state. Never display that ticket as safe to submit again.
        return t.State=="Reviewed"&&File.Exists(ClaimPath(id))?t with{State="Unknown",Error="Submission outcome uncertain. Check Saxo before taking further action."}:t;}
    string ClaimPath(Guid id)=>Path.Combine(DirectoryPath,id.ToString("N")+".claimed");
    bool Claim(Guid id)
    {
        try { using var file=new FileStream(ClaimPath(id),FileMode.CreateNew,FileAccess.Write,FileShare.None);file.Flush(true);return true; }
        catch(IOException) when(File.Exists(ClaimPath(id))) { return false; }
    }
    static object View(SaxoOrderTicket t)=>new{ticketId=t.Id,expiresAt=t.ExpiresAt,t.Input,t.Name,t.Currency,t.Precheck,t.State,t.OrderId,t.Error,t.RelatedOrderIds,environment="SIM"};
    public async Task<object> Preview(SaxoOrderInput input,Workspace w,CancellationToken ct)
    {
        RequireTradingAccess(w);
        Validate(input);var id=Guid.NewGuid();var detail=await Instrument(input.Uic,ct);
        if(input.StopLoss.HasValue){
            var supported=SupportedTypes(detail);var preferred=Text(detail,"StopLossDefaultOrderType");
            var stopType=input.StopOrderType??(preferred is "Stop" or "StopIfTraded"&&supported.Contains(preferred)?preferred:supported.FirstOrDefault(x=>x is "StopIfTraded" or "Stop"));
            Check.That(stopType is not null,"SAXO_STOP_TYPE_NOT_SUPPORTED");input=input with{StopOrderType=stopType};
        }
        var check=await ValidateAtBroker(input,id,ct);
        var ticket=new SaxoOrderTicket(id,Scope(w),session.Read("SIM")!.AppKey,clock.GetUtcNow().AddMinutes(2),input,Text(detail,"Description")??"Stock",Text(detail,"CurrencyCode")??"",check,Passed(check)?"Reviewed":"Rejected");
        Save(ticket);return View(ticket);
    }
    public async Task<object> Submit(Guid id,Workspace w,CancellationToken ct,bool confirmed=false)
    {
        RequireTradingAccess(w);
        Check.That(confirmed,"SAXO_CONFIRMATION_REQUIRED");
        await Gate.WaitAsync(ct);try{
            Directory.CreateDirectory(DirectoryPath);
            // A second worker fails closed; it never races the shared risk ledger.
            FileStream riskLock;
            try{riskLock=new FileStream(Path.Combine(DirectoryPath,"risk.lock"),FileMode.OpenOrCreate,FileAccess.ReadWrite,FileShare.None);}
            catch(IOException){throw new ApiFailure(409,"SAXO_SUBMISSION_BUSY");}
            using var heldRiskLock=riskLock;
            var t=Load(id,w);if(t.State!="Reviewed")return View(t);
            Check.That(t.ExpiresAt>clock.GetUtcNow(),"SAXO_REVIEW_EXPIRED");
            Check.That(t.AppKey==session.Read("SIM")?.AppKey,"SAXO_REGISTRATION_CHANGED");
            var check=await ValidateAtBroker(t.Input,id,ct);
            if(!Passed(check)){
                // Another process may already be submitting the same ticket.
                // A late rejected precheck must not overwrite its receipt.
                if(!Claim(id))return View(Load(id,w));
                t=t with{State="Rejected",Precheck=check};Save(t);return View(t);
            }
            // Never increase the approved cash estimate silently.
            Check.That(Text(check,"EstimatedCashRequiredCurrency")==Text(t.Precheck,"EstimatedCashRequiredCurrency")
                &&(Number(check,"EstimatedCashRequired")??0)<=(Number(t.Precheck,"EstimatedCashRequired")??0),"SAXO_COST_CHANGED_REVIEW_AGAIN");
            // FileMode.CreateNew is an atomic, durable claim on the shared
            // state volume. The in-process gate alone cannot protect restarts
            // or overlapping app instances. Claims are never automatically cleared.
            // Reserve before claiming/submitting. A crash can over-count risk, never under-count it.
            RequireTradingAccess(w);
            ReserveRisk(t);
            if(!Claim(id))return View(Load(id,w));
            t=t with{State="Unknown"};Save(t);
            try{var result=await Call("trade/v2/orders",ct,Payload(t.Input,"Banking-"+id.ToString("N")));
                var orderId=Text(result,"OrderId");var failure=Text(Part(result,"ErrorInfo"),"ErrorCode");
                var children=Part(result,"Orders");
                var childIds=children.ValueKind==JsonValueKind.Array?children.EnumerateArray().Select(x=>Text(x,"OrderId")).Where(x=>x is not null).Cast<string>().ToArray():[];
                var expectedChildren=(t.Input.StopLoss.HasValue?1:0)+(t.Input.TakeProfit.HasValue?1:0);
                var childrenOk=childIds.Length==expectedChildren&&(children.ValueKind!=JsonValueKind.Array||children.EnumerateArray().All(x=>Part(x,"ErrorInfo").ValueKind is JsonValueKind.Undefined or JsonValueKind.Null));
                t=t with{State=orderId is not null?(childrenOk&&failure is null?"Accepted":"Unknown"):failure is not null?"Rejected":"Unknown",OrderId=orderId,RelatedOrderIds=childIds,Error=failure??(childrenOk?null:"Related order acceptance is unconfirmed. Check Saxo before taking further action.")};
            }catch(SaxoOrderBrokerFailure ex){var uncertain=ex.Status>=500||ex.Status is 408 or 429||ex.Code is "OrderCommandPending" or "OrderCommandTimeout";
                t=t with{State=uncertain?"Unknown":"Rejected",Error=$"Saxo {ex.Status}: {ex.Code}"+(ex.Detail is null?"":" — "+ex.Detail)};}
            catch(Exception ex) when(ex is HttpRequestException or TaskCanceledException or ApiFailure or JsonException){t=t with{Error="Submission outcome uncertain. Refresh orders before taking further action."};}
            Save(t);return View(t);
        }finally{Gate.Release();}
    }
    public async Task<object> Orders(Workspace w,CancellationToken ct)
    {var data=await Call("port/v1/orders/me?$top=100&FieldGroups=DisplayAndFormat",ct);
     JsonElement? history=null;string? historyError=null;
     try{history=await Call("cs/v1/audit/orderactivities?$top=100&FieldGroups=DisplayAndFormat&FromDateTime="+Q(clock.GetUtcNow().AddDays(-7).ToString("O")),ct);}catch(ApiFailure ex){historyError=ex.Code;}
     var receipts=new List<object>();
     if((!CloudHosting.Enabled(env)||!string.IsNullOrWhiteSpace(w.SessionScope))&&Directory.Exists(DirectoryPath))foreach(var path in Directory.EnumerateFiles(DirectoryPath,"*.protected").OrderByDescending(File.GetLastWriteTimeUtc).Take(100)){
         if(!Guid.TryParseExact(Path.GetFileNameWithoutExtension(path),"N",out var id))continue;
         try{var t=Load(id,w);if(t.State!="Reviewed")receipts.Add(View(t));}catch(ApiFailure ex)when(ex.Status==404){}
     }
     return new{environment="SIM",observedAt=clock.GetUtcNow(),hasMore=Part(data,"__next").ValueKind==JsonValueKind.String,
         receipts,historyError,historyHasMore=history.HasValue&&Part(history.Value,"__next").ValueKind==JsonValueKind.String,
         history=history.HasValue?Rows(history.Value).Select(MapActivity).ToArray():null,
         orders=Rows(data).Select(MapOpenOrder)};}
    public static object MapActivity(JsonElement o)=>new{orderId=Text(o,"OrderId"),name=Text(Part(o,"DisplayAndFormat"),"Description"),status=Text(o,"Status"),subStatus=Text(o,"SubStatus"),quantity=Number(o,"Amount"),filled=Number(o,"FilledAmount"),time=Text(o,"ActivityTime"),reference=Text(o,"ExternalReference")};
    public static object MapOpenOrder(JsonElement o)=>new{
        orderId=Text(o,"OrderId"),accountId=Text(o,"AccountId"),name=Text(Part(o,"DisplayAndFormat"),"Description"),
        symbol=Text(Part(o,"DisplayAndFormat"),"Symbol"),currency=Text(Part(o,"DisplayAndFormat"),"Currency"),
        researchSymbol=SaxoReadClient.ResearchSymbol(Text(Part(o,"DisplayAndFormat"),"Symbol")),
        uic=Number(o,"Uic"),side=Text(o,"BuySell"),quantity=Number(o,"Amount"),filledQuantity=Number(o,"FilledAmount"),
        price=Number(o,"Price"),orderType=Text(o,"OpenOrderType"),duration=Text(Part(o,"Duration"),"DurationType"),
        expiresAt=Text(Part(o,"Duration"),"ExpirationDateTime"),placedAt=Text(o,"OrderTime"),
        status=Text(o,"Status"),reference=Text(o,"ExternalReference")};
    public object Receipt(Guid id,Workspace w){RequireReceiptAccess(w);return View(Load(id,w));}
}
