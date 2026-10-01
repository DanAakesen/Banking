namespace Banking.Api.Providers;

// Keeps existing Saxo sign-ins alive while the API runs. Saxo access tokens last about 20 minutes and refresh tokens
// about 60 minutes after the last refresh, so a sign-in used to lapse after an idle hour (overnight, or between visits).
// This only refreshes stored sessions; it never signs in, changes session capabilities, or reads account data.
public sealed class SaxoSessionKeeper(SaxoLocalSession session, IConfiguration config, ILogger<SaxoSessionKeeper> log) : BackgroundService
{
    readonly Dictionary<string,string> last=[];
    public static TimeSpan Interval(IConfiguration config)=>TimeSpan.FromMinutes(Math.Clamp(config.GetValue<int?>("Saxo:KeepAliveMinutes")??5,1,15));
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        if(config.GetValue<bool?>("Saxo:KeepAlive")==false)return;
        var every=Interval(config);using var timer=new PeriodicTimer(every);
        try { do await Tick(every+TimeSpan.FromMinutes(2),ct); while(await timer.WaitForNextTickAsync(ct)); }
        catch(OperationCanceledException) when(ct.IsCancellationRequested){}
    }
    public async Task Tick(TimeSpan window,CancellationToken ct)
    {
        foreach(var market in new[]{"SIM","LIVE"})
        {
            // LIVE is kept only while LIVE reads are enabled, matching the market-data and portfolio read switches.
            if(market=="LIVE"&&(config.GetValue<bool?>("Saxo:ReadEnabled")==false||!config.GetValue<bool>("Saxo:LIVE:ReadEnabled")))continue;
            string outcome;
            try{outcome=await session.KeepAlive(market,window,ct);}
            catch(Exception ex) when(ex is not OperationCanceledException){outcome="error:"+ex.GetType().Name;}
            // Log changes and refreshes only, without tokens or account data, so an idle lapse is visible in the logs.
            if(outcome=="refreshed"||(last.GetValueOrDefault(market)!=outcome&&!(outcome=="fresh"&&last.GetValueOrDefault(market)=="refreshed")))
                log.Log(outcome is "failed" or "expired"||outcome.StartsWith("error:")?LogLevel.Warning:LogLevel.Information,
                    "saxo_session_keepalive market={Market} outcome={Outcome}",market,outcome);
            last[market]=outcome;
        }
    }
}
