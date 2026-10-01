using Banking.Api.Services;

namespace Banking.Api.Providers;

// Only broker read models enter this cache, never tickets or browser-specific receipts.
// Authorization happens before entry. Each environment has one configured broker identity.
public sealed class SaxoReadCache(TimeProvider clock)
{
    sealed class Slot { public readonly SemaphoreSlim Gate=new(1); public string Identity=""; public object? Data; public ApiFailure? Error; public DateTimeOffset Until; }
    readonly Slot[] slots=Enumerable.Range(0,4).Select(_=>new Slot()).ToArray();
    public async Task<object> Read(string market,string identity,bool activity,Func<Task<object>> read,CancellationToken ct)
    {
        SaxoLocalSession.EnvironmentName(market);
        var slot=slots[(market=="LIVE"?2:0)+(activity?1:0)];
        await slot.Gate.WaitAsync(ct);
        try {
            if(slot.Identity==identity&&slot.Until>clock.GetUtcNow()) {
                if(slot.Error is not null)throw slot.Error;
                return slot.Data!;
            }
            slot.Identity=identity;slot.Data=null;slot.Error=null;
            try { slot.Data=await read();slot.Until=clock.GetUtcNow().AddSeconds(15);return slot.Data; }
            catch(ApiFailure ex) { slot.Error=ex;slot.Until=clock.GetUtcNow().AddSeconds(15);throw; }
        } finally {slot.Gate.Release();}
    }
}
