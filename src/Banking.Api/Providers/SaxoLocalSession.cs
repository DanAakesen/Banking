using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Banking.Api.Services;
using Banking.Api.Security;
using Microsoft.AspNetCore.DataProtection;

namespace Banking.Api.Providers;

public sealed record SaxoLocalCredentials(string AppKey, string AppSecret, string RegisteredRedirectUri, string? RedirectUri = null,
    string? AccessToken = null, string? RefreshToken = null, DateTimeOffset? ExpiresAt = null, DateTimeOffset? RefreshExpiresAt = null);

// Separate SIM/LIVE sessions; local DPAPI or the existing cloud data-protection key ring.
public sealed class SaxoLocalSession(IHostEnvironment environment, IHttpClientFactory clients, TimeProvider clock,
    IConfiguration config, IDataProtectionProvider protection)
{
    static readonly SemaphoreSlim Gate = new(1,1);
    sealed record Pending(DateTimeOffset Expires,string Market,string ReturnUrl,string? Scope,string? ProofHash,string? Code=null);
    readonly ConcurrentDictionary<string,Pending> pending = new();
    readonly ConcurrentDictionary<string,DateTimeOffset> retryAfter = new();
    public bool Disconnected(string market)=>File.Exists(PathName(market)+".disconnected");
    public string CacheIdentity(string market) {
        var c=Read(market);return Vault.Hash(market+":"+c?.AppKey+":"+c?.AccessToken+":"+File.GetLastWriteTimeUtc(PathName(market)).Ticks+":"+Disconnected(market));
    }
    public async Task Disconnect(string market,CancellationToken ct) {
        EnvironmentName(market);await Gate.WaitAsync(ct);
        try {
            foreach(var item in pending.Where(x=>x.Value.Market==market))pending.TryRemove(item.Key,out _);
            var path=PathName(market);Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            await File.WriteAllTextAsync(path+".disconnected","Disconnected",ct);
            if(File.Exists(path))File.Delete(path);
        } finally {Gate.Release();}
    }
    public static string EnvironmentName(string market) { Check.That(market is "SIM" or "LIVE","INVALID_SAXO_ENVIRONMENT");return market; }
    static string AuthHost(string market)=>EnvironmentName(market)=="SIM"?"https://sim.logonvalidation.net":"https://live.logonvalidation.net";
    bool Cloud => CloudHosting.Enabled(environment);
    public string ReturnUrl => (Cloud ? CloudHosting.Origin(config) : "https://localhost:5443") + "/#/markets";
    public string ResolveReturnUrl(string? returnUrl)
    {
        if (returnUrl is null) return ReturnUrl;
        // Exact first-party destinations only. The callback itself stays registered at Azure;
        // OAuth state carries the originating page, never a browser-controlled redirect at callback time.
        var origin = Cloud ? CloudHosting.Origin(config) : "https://localhost:5443";
        if (new[] { origin + "/#/investments", origin + "/#/markets",
            "https://localhost:5444/#/investments", "https://localhost:5444/#/markets" }.Contains(returnUrl)) return returnUrl;
        throw new ApiFailure(400,"INVALID_SAXO_RETURN_URL");
    }
    public string RequiredCallback => (Cloud ? CloudHosting.Origin(config) : "https://localhost:5443") + "/api/saxo/auth/callback";
    string PathName(string market) => Cloud
        ? Path.Combine(config["Cloud:StateDirectory"] ?? "/home/Banking", "saxo-"+EnvironmentName(market).ToLowerInvariant()+".protected")
        : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Banking","saxo-"+EnvironmentName(market).ToLowerInvariant()+".dpapi");
    IDataProtector Protector(string market) => protection.CreateProtector("Banking.Saxo.Session.v1", EnvironmentName(market));
    public SaxoLocalCredentials? Read(string market="SIM")
    {
        EnvironmentName(market);
        if (!Cloud && !environment.IsDevelopment()) return null;
        var path=PathName(market);
        SaxoLocalCredentials? saved = null;
        try
        {
            if (File.Exists(path) && !Disconnected(market))
            {
                var bytes = Cloud ? Protector(market).Unprotect(File.ReadAllBytes(path))
                    : OperatingSystem.IsWindows() ? ProtectedData.Unprotect(File.ReadAllBytes(path),null,DataProtectionScope.CurrentUser) : null;
                if (bytes is not null) saved = JsonSerializer.Deserialize<SaxoLocalCredentials>(bytes, new JsonSerializerOptions{PropertyNameCaseInsensitive=true});
            }
        }
        catch (Exception ex) when (ex is CryptographicException or JsonException)
        { throw new ApiFailure(503,"SAXO_SESSION_UNAVAILABLE"); }
        var key = config[$"Saxo:{market}:AppKey"];
        var secret = config[$"Saxo:{market}:AppSecret"];
        var redirect = config[$"Saxo:{market}:RedirectUri"];
        if (string.IsNullOrWhiteSpace(key) || string.IsNullOrWhiteSpace(secret)) return saved;
        // A different app registration must never inherit the previous app's tokens.
        return saved?.AppKey == key && saved.RedirectUri == redirect
            ? saved with { AppSecret = secret }
            : new SaxoLocalCredentials(key,secret,redirect ?? "",redirect);
    }
    public object Status(string market="SIM")
    {
        var c=Read(market);return new {credentialsReady=c is not null, callbackReady=CallbackReady(c),connected=c?.ExpiresAt>clock.GetUtcNow(),
            accessExpiresAt=c?.ExpiresAt,requiredCallback=RequiredCallback,environment=market};
    }
    bool CallbackReady(SaxoLocalCredentials? c)=>c?.RedirectUri==RequiredCallback;
    public object Start(string market="SIM",string? returnUrl=null,string? scope=null)
    {
        var destination=ResolveReturnUrl(returnUrl);
        var c=Read(market)??throw new ApiFailure(503,"SAXO_ACCESS_REQUIRED");
        if(!CallbackReady(c))throw new ApiFailure(409,"SAXO_CALLBACK_REGISTRATION_REQUIRED");
        foreach(var item in pending.Where(x=>x.Value.Expires<clock.GetUtcNow()))pending.TryRemove(item.Key,out _);
        if(pending.Count>=10)throw new ApiFailure(429,"SAXO_AUTH_LIMIT");
        if(market=="LIVE"&&string.IsNullOrWhiteSpace(scope))throw new ApiFailure(403,"SAXO_PRIVATE_ACCESS_REQUIRED");
        var proof=scope is null?null:Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        var state=Convert.ToHexString(RandomNumberGenerator.GetBytes(32));pending[state]=new(clock.GetUtcNow().AddMinutes(10),market,destination,scope,proof is null?null:Vault.Hash(proof));
        return new {completionProof=proof,environment=market,authorizationUrl=AuthHost(market)+"/authorize?response_type=code&client_id="+Uri.EscapeDataString(c.AppKey)+"&state="+state+"&redirect_uri="+Uri.EscapeDataString(c.RedirectUri!)};
    }
    // Capture the code on Azure, then finish with the original browser's authenticated POST.
    // No broker code/token travels to localhost or JavaScript. The browser holds only a one-use proof.
    public string Cancel(string state) {
        if(state is not {Length:>0 and <=100}||!pending.TryRemove(state,out var entry)||entry.Expires<clock.GetUtcNow())throw new ApiFailure(400,"SAXO_STATE_EXPIRED");
        return new UriBuilder(entry.ReturnUrl){Query="saxoError=cancelled"}.Uri.AbsoluteUri;
    }
    public async Task<string> Complete(string state,string code,CancellationToken ct)
    {
        if(state is not {Length:>0 and <=100}||code is not {Length:>0 and <=4000}||!pending.TryGetValue(state,out var entry)||entry.Expires<clock.GetUtcNow())throw new ApiFailure(400,"SAXO_STATE_EXPIRED");
        if(entry.Scope is not null) {
            if(entry.Code is not null||!pending.TryUpdate(state,entry with{Code=code},entry))throw new ApiFailure(400,"SAXO_STATE_EXPIRED");
            var destination=new UriBuilder(entry.ReturnUrl){Query="saxoComplete="+Uri.EscapeDataString(state)};
            return destination.Uri.AbsoluteUri;
        }
        if(!pending.TryRemove(state,out _))throw new ApiFailure(400,"SAXO_STATE_EXPIRED");
        return await CompleteEntry(entry,code,ct);
    }
    public async Task<string> Finish(string state,string proof,Workspace workspace,CancellationToken ct) {
        await Gate.WaitAsync(ct);
        try {
            if(state is not {Length:>0 and <=100}||proof is not {Length:>0 and <=100}||!pending.TryGetValue(state,out var entry)||entry.Expires<clock.GetUtcNow()||entry.Code is null)
                throw new ApiFailure(400,"SAXO_STATE_EXPIRED");
            if(entry.Scope!=workspace.SessionScope||entry.ProofHash!=Vault.Hash(proof))throw new ApiFailure(403,"SAXO_AUTH_SESSION_MISMATCH");
            SaxoAccess.RequireMarketAccess(workspace,environment,entry.Market);
            if(!pending.TryRemove(state,out _))throw new ApiFailure(400,"SAXO_STATE_EXPIRED");
            var credentials=Read(entry.Market)??throw new ApiFailure(503,"SAXO_ACCESS_REQUIRED");
            await Exchange(credentials,new(){["grant_type"]="authorization_code",["code"]=entry.Code},ct,entry.Market);
            return entry.Market;
        } finally {Gate.Release();}
    }
    async Task<string> CompleteEntry(Pending entry,string code,CancellationToken ct) {

        await Gate.WaitAsync(ct);try {var c=Read(entry.Market)??throw new ApiFailure(503,"SAXO_ACCESS_REQUIRED");
            await Exchange(c,new(){["grant_type"]="authorization_code",["code"]=code},ct,entry.Market);
        }finally{Gate.Release();}
        return entry.ReturnUrl;
    }
    public async Task<string?> Token(CancellationToken ct,string market="SIM")
    {
        await Gate.WaitAsync(ct);try {
            if(Disconnected(market))return null;
            if(retryAfter.TryGetValue(market,out var retry)&&retry>clock.GetUtcNow())throw new ApiFailure(503,"SAXO_RATE_LIMITED");
            var c=Read(market);if(c is null)return null;
            if(c.ExpiresAt>clock.GetUtcNow().AddSeconds(60)&&!string.IsNullOrWhiteSpace(c.AccessToken))return c.AccessToken;
            if(!(c.RefreshExpiresAt>clock.GetUtcNow())||string.IsNullOrWhiteSpace(c.RefreshToken))return null;
            return (await Exchange(c,new(){["grant_type"]="refresh_token",["refresh_token"]=c.RefreshToken},ct,market)).AccessToken;
        }finally{Gate.Release();}
    }
    // Saxo access tokens last about 20 minutes and refresh tokens about 60 minutes after the last refresh. Refreshing
    // before either lapses keeps an existing sign-in alive while nobody uses the app; it never starts a new sign-in.
    // Outcomes: none, fresh, refreshed, expired, cooldown, failed.
    public async Task<string> KeepAlive(string market,TimeSpan window,CancellationToken ct)
    {
        EnvironmentName(market);await Gate.WaitAsync(ct);
        try {
            if(Disconnected(market))return "none";
            var c=Read(market);var now=clock.GetUtcNow();
            if(c is null||string.IsNullOrWhiteSpace(c.RefreshToken))return "none";
            if(!(c.RefreshExpiresAt>now))return "expired";
            if(c.ExpiresAt>now+window&&c.RefreshExpiresAt>now+window&&!string.IsNullOrWhiteSpace(c.AccessToken))return "fresh";
            if(retryAfter.TryGetValue(market,out var retry)&&retry>now)return "cooldown";
            await Exchange(c,new(){["grant_type"]="refresh_token",["refresh_token"]=c.RefreshToken},ct,market);
            return "refreshed";
        }
        catch(ApiFailure ex){return ex.Code=="SAXO_RATE_LIMITED"?"cooldown":Disconnected(market)?"expired":"failed";}
        catch(Exception ex) when(!ct.IsCancellationRequested&&ex is HttpRequestException or TaskCanceledException){return "failed";}
        finally{Gate.Release();}
    }
    async Task<SaxoLocalCredentials> Exchange(SaxoLocalCredentials c,Dictionary<string,string> fields,CancellationToken ct,string market)
    {
        fields["client_id"]=c.AppKey;fields["client_secret"]=c.AppSecret;fields["redirect_uri"]=c.RedirectUri!;
        using var request=new HttpRequestMessage(HttpMethod.Post,AuthHost(market)+"/token"){Content=new FormUrlEncodedContent(fields)};
        using var response=await clients.CreateClient("SaxoOAuth").SendAsync(request,ct);
        if(!response.IsSuccessStatusCode) {
            if(fields["grant_type"]=="refresh_token"&&(int)response.StatusCode is 400 or 401) {
                // Saxo refresh tokens are single-use. If another process (for example the old and new app during a
                // restart) already rotated this one, use the stored newer session instead of discarding the sign-in.
                var current=Read(market);
                if(current?.RefreshToken is {Length:>0} rotated&&rotated!=fields["refresh_token"]&&current.RefreshExpiresAt>clock.GetUtcNow())
                    return current.ExpiresAt>clock.GetUtcNow().AddSeconds(60)&&!string.IsNullOrWhiteSpace(current.AccessToken)?current
                        :await Exchange(current,new(){["grant_type"]="refresh_token",["refresh_token"]=rotated},ct,market);
            }
            if(fields["grant_type"]=="refresh_token")retryAfter[market]=clock.GetUtcNow().AddSeconds(SaxoRequestBudget.RetrySeconds(response,clock.GetUtcNow()));
            if(fields["grant_type"]=="refresh_token"&&(int)response.StatusCode is 400 or 401) {
                var invalid=PathName(market);Directory.CreateDirectory(Path.GetDirectoryName(invalid)!);await File.WriteAllTextAsync(invalid+".disconnected","Sign-in required",ct);
            }
            throw new ApiFailure(503,(int)response.StatusCode==429?"SAXO_RATE_LIMITED":"SAXO_SIGN_IN_REQUIRED");
        }
        await response.Content.LoadIntoBufferAsync(65536,ct);
        var json=JsonSerializer.Deserialize<JsonElement>(await response.Content.ReadAsStringAsync(ct));
        retryAfter.TryRemove(market,out _);
        var now=clock.GetUtcNow();var next=c with {AccessToken=json.GetProperty("access_token").GetString(),RefreshToken=json.GetProperty("refresh_token").GetString(),
            ExpiresAt=now.AddSeconds(json.GetProperty("expires_in").GetInt32()),RefreshExpiresAt=now.AddSeconds(json.GetProperty("refresh_token_expires_in").GetInt32())};
        var bytes=Encoding.UTF8.GetBytes(JsonSerializer.Serialize(next));
        var encrypted=Cloud ? Protector(market).Protect(bytes)
            : OperatingSystem.IsWindows() ? ProtectedData.Protect(bytes,null,DataProtectionScope.CurrentUser)
            : throw new ApiFailure(503,"LOCAL_WINDOWS_REQUIRED");
        var path=PathName(market);Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var temp=path+".tmp";await File.WriteAllBytesAsync(temp,encrypted,ct);File.Move(temp,path,true);if(File.Exists(path+".disconnected"))File.Delete(path+".disconnected");return next;
    }
}
