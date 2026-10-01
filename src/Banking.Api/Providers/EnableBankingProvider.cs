using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Banking.Api.Security;

namespace Banking.Api.Providers;

// AIS-only adapter. Never registers an application, links accounts, or calls payment endpoints.
public sealed class EnableBankingProvider(HttpClient http, IConfiguration config, Vault vault) : IBankProvider
{
    public string Name => "enable-banking";
    public bool IsDemo => false;
    private static string Base64(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    private string Token()
    {
        var privateKey = config["EnableBanking:PrivateKey"];
        if (string.IsNullOrEmpty(privateKey))
        {
            var keyFile = config["EnableBanking:ProtectedKeyFile"] ?? throw new ProviderFailure("PROVIDER_CONFIGURATION_REQUIRED");
            privateKey = vault.Reveal(File.ReadAllText(keyFile));
        }
        var appId = config["EnableBanking:ApplicationId"];
        if (!Guid.TryParse(appId, out _)) throw new ProviderFailure("PROVIDER_CONFIGURATION_REQUIRED");
        using var rsa = RSA.Create();
        rsa.ImportFromPem(privateKey);
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var header = Base64(JsonSerializer.SerializeToUtf8Bytes(new { typ = "JWT", alg = "RS256", kid = appId }));
        var body = Base64(JsonSerializer.SerializeToUtf8Bytes(new { iss = "enablebanking.com", aud = "api.enablebanking.com", iat = now, exp = now + 60 }));
        var signed = $"{header}.{body}";
        return $"{signed}.{Base64(rsa.SignData(Encoding.ASCII.GetBytes(signed), HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1))}";
    }
    private async Task<JsonElement> Send(HttpMethod method, string path, object? body, CancellationToken ct)
    {
        // Methods and paths originate exclusively in the explicit AIS methods below.
        using var request = new HttpRequestMessage(method, new Uri(new Uri("https://api.enablebanking.com/"), path));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", Token());
        if (body is not null) request.Content = JsonContent.Create(body);
        using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        if (response.StatusCode == HttpStatusCode.NoContent) return JsonSerializer.SerializeToElement(new { });
        if (response.StatusCode == HttpStatusCode.TooManyRequests)
        {
            var delay = response.Headers.RetryAfter?.Delta ?? TimeSpan.FromHours(6);
            if (response.Headers.RetryAfter?.Date is { } date) delay = date - DateTimeOffset.UtcNow;
            throw new ProviderFailure("RATE_LIMITED", delay < TimeSpan.FromHours(6) ? TimeSpan.FromHours(6) : delay);
        }
        if ((int)response.StatusCode >= 500) throw new ProviderFailure("PROVIDER_UNAVAILABLE", TimeSpan.FromMinutes(15));
        await response.Content.LoadIntoBufferAsync(path == "aspsps" ? 16 * 1024 * 1024 : 2 * 1024 * 1024, ct);
        var bytes = await response.Content.ReadAsByteArrayAsync(ct);
        JsonElement result;
        try { using var document = JsonDocument.Parse(bytes); result = document.RootElement.Clone(); }
        catch (JsonException) { throw new ProviderFailure("INVALID_PROVIDER_RESPONSE"); }
        if (result.ValueKind != JsonValueKind.Object) throw new ProviderFailure("INVALID_PROVIDER_RESPONSE");
        if (!response.IsSuccessStatusCode)
        {
            var error = Text(result, "error");
            throw error switch
            {
                "WRONG_REQUEST_PARAMETERS" => new ProviderFailure(InvalidParameters(result)),
                "REDIRECT_URI_NOT_ALLOWED" => new ProviderFailure("PROVIDER_CALLBACK_NOT_ALLOWED"),
                "PSU_HEADER_NOT_PROVIDED" => new ProviderFailure("PROVIDER_PSU_CONTEXT_REQUIRED"),
                "ACCESS_DENIED" or "UNAUTHORIZED_ACCESS" => new ProviderFailure("PROVIDER_ACCESS_DENIED"),
                "ASPSP_RATE_LIMIT_EXCEEDED" => new ProviderFailure("RATE_LIMITED", TimeSpan.FromHours(6)),
                "ASPSP_TIMEOUT" => new ProviderFailure("PROVIDER_UNAVAILABLE", TimeSpan.FromMinutes(15)),
                "EXPIRED_SESSION" or "REVOKED_SESSION" or "CLOSED_SESSION" or "SESSION_DOES_NOT_EXIST" or "INVALID_SESSION" or "SESSION_EXPIRED"
                    => new ProviderFailure("CONSENT_EXPIRED"),
                _ => new ProviderFailure("PROVIDER_REQUEST_REJECTED")
            };
        }
        return result;
    }
    public async Task<IReadOnlyList<BankInfo>> Banks(CancellationToken ct)
    {
        var data = await Send(HttpMethod.Get, "aspsps", null, ct);
        return data.GetProperty("aspsps").EnumerateArray()
            .Where(x => x.TryGetProperty("psu_types", out var types) && types.ValueKind == JsonValueKind.Array && types.EnumerateArray().Any(t => t.GetString() == "personal"))
            .Select(x => new BankInfo(Required(x, "name"), Required(x, "country"), x.GetProperty("maximum_consent_validity").GetInt32(), false)).ToList();
    }
    public async Task<string> Authorize(string bank, string country, string state, Uri callback, DateTimeOffset until, CancellationToken ct)
    {
        var data = await Send(HttpMethod.Post, "auth", new { access = new { valid_until = until, balances = true, transactions = true }, aspsp = new { name = bank, country },
            state, redirect_url = callback.ToString(), psu_type = "personal" }, ct);
        var url = Required(data, "url");
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme != "https") throw new ProviderFailure("INVALID_PROVIDER_RESPONSE");
        return url;
    }
    public async Task<object> VerifyApplication(CancellationToken ct)
    {
        var application = await Send(HttpMethod.Get, "application", null, ct);
        var production = Text(application, "environment") == "PRODUCTION";
        var active = application.TryGetProperty("active", out var enabled) && enabled.ValueKind == JsonValueKind.True;
        var ais = application.TryGetProperty("services", out var services) && services.EnumerateArray().Any(x => x.GetString() == "AIS");
        var callback = config["Cloud:LiveCallbackUrl"] ?? config["Local:LiveCallbackUrl"] ?? "https://localhost:5443/api/auth/callback/live";
        var redirectConfigured = application.GetProperty("redirect_urls").EnumerateArray().Any(x => x.GetString() == callback);
        return new { production, active, ais, redirectConfigured, ready = production && active && ais && redirectConfigured, liveBankVerified = false };
    }
    public async Task CloseSession(string session, CancellationToken ct) => await Send(HttpMethod.Delete, $"sessions/{Uri.EscapeDataString(session)}", null, ct);
    public async Task<AuthorizedSession> ReadAuthorizedSession(string sessionId, CancellationToken ct)
    {
        if (!Guid.TryParse(sessionId, out _)) throw new ProviderFailure("INVALID_SESSION_ID");
        var data = await Send(HttpMethod.Get, $"sessions/{Uri.EscapeDataString(sessionId)}", null, ct);
        if (Text(data, "status") != "AUTHORIZED" || Text(data, "psu_type") != "personal")
            throw new ProviderFailure("SESSION_NOT_AUTHORIZED");
        var until = data.GetProperty("access").GetProperty("valid_until").GetDateTimeOffset();
        if (until <= DateTimeOffset.UtcNow) throw new ProviderFailure("CONSENT_EXPIRED");
        var stored = data.GetProperty("accounts_data").EnumerateArray().ToList();
        if (stored.Count is < 1 or > 100) throw new ProviderFailure("INVALID_PROVIDER_SESSION");
        var ids = stored.Select(x => Required(x, "uid")).ToHashSet(StringComparer.Ordinal);
        if (ids.Count != stored.Count || !ids.SetEquals(data.GetProperty("accounts").EnumerateArray().Select(x => x.GetString() ?? "")))
            throw new ProviderFailure("SESSION_ACCOUNT_MISMATCH");
        var accounts = new List<ProviderAccount>();
        foreach (var item in stored)
        {
            var id = Required(item, "uid");
            var details = await Send(HttpMethod.Get, $"accounts/{Uri.EscapeDataString(id)}/details", null, ct);
            var account = ParseAccount(details);
            if (account.Id != id || account.Identity != Required(item, "identification_hash"))
                throw new ProviderFailure("SESSION_ACCOUNT_MISMATCH");
            accounts.Add(account);
        }
        var bank = data.GetProperty("aspsp");
        return new AuthorizedSession(Required(bank, "name"), Required(bank, "country"), data.GetProperty("created").GetDateTimeOffset(),
            new BankSession(sessionId, until, accounts));
    }
    public async Task<BankSession> Complete(string code, CancellationToken ct)
    {
        var data = await Send(HttpMethod.Post, "sessions", new { code }, ct);
        var accounts = data.GetProperty("accounts").EnumerateArray().Select(ParseAccount).ToList();
        return new BankSession(Required(data, "session_id"), data.GetProperty("access").GetProperty("valid_until").GetDateTimeOffset(), accounts);
    }
    private static ProviderAccount ParseAccount(JsonElement x) => new(
        Required(x, "uid"), Required(x, "identification_hash"), Text(x, "name") ?? "Bank account", Text(x, "currency") ?? "XXX",
        x.TryGetProperty("identification_hashes", out var aliases) && aliases.ValueKind == JsonValueKind.Array
            ? aliases.EnumerateArray().Select(a => a.GetString() ?? "").Where(a => a.Length > 0).Distinct(StringComparer.Ordinal).ToList() : [], ParseAccountDetails(x));
    public async Task<AccountBankDetails?> AccountDetails(string session, string account, CancellationToken ct) =>
        ParseAccountDetails(await Send(HttpMethod.Get, $"accounts/{Uri.EscapeDataString(account)}/details", null, ct));
    public static BankIdentifier? Identifier(string? scheme, string? value)
    {
        if (string.IsNullOrWhiteSpace(scheme) || string.IsNullOrWhiteSpace(value)) return null;
        var normalized = string.Concat(value.Where(c => !char.IsWhiteSpace(c))).ToUpperInvariant();
        if (normalized.Length is < 5 or > 128 || scheme.Length > 40) return null;
        var type = scheme.ToUpperInvariant();
        return new(type, Vault.Hash(type + ":" + normalized), "•••• " + normalized[^4..]);
    }
    private static BankIdentifier? AccountIdentifier(JsonElement parent, string key)
    {
        if (!parent.TryGetProperty(key, out var account) || account.ValueKind != JsonValueKind.Object) return null;
        if (Text(account, "iban") is { } iban) return Identifier("IBAN", iban);
        if (account.TryGetProperty("other", out var other) && other.ValueKind == JsonValueKind.Object)
            return Identifier(Text(other, "scheme_name"), Text(other, "identification"));
        return null;
    }
    private static AccountBankDetails ParseAccountDetails(JsonElement x)
    {
        var identifiers = new List<BankIdentifier>();
        if (AccountIdentifier(x, "account_id") is { } primary) identifiers.Add(primary);
        if (x.TryGetProperty("all_account_ids", out var all) && all.ValueKind == JsonValueKind.Array)
            foreach (var id in all.EnumerateArray())
                if (id.ValueKind == JsonValueKind.Object && Identifier(Text(id, "scheme_name"), Text(id, "identification")) is { } parsed)
                    identifiers.Add(parsed);
        return new(Text(x, "details"), Text(x, "cash_account_type"), Text(x, "product"), identifiers.DistinctBy(i => i.Fingerprint).ToArray());
    }
    private static string? NestedText(JsonElement parent, string key, string field) =>
        parent.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.Object ? Text(value, field) : null;
    public async Task<TransactionPage> Transactions(string session, string account, bool full, DateOnly? from, DateOnly to, string? cursor, CancellationToken ct)
    {
        var path = $"accounts/{Uri.EscapeDataString(account)}/transactions?strategy={(full ? "longest" : "default")}";
        if (!full) path += $"&date_from={from:yyyy-MM-dd}&date_to={to:yyyy-MM-dd}";
        if (cursor is not null) path += "&continuation_key=" + Uri.EscapeDataString(cursor);
        var data = await Send(HttpMethod.Get, path, null, ct);
        return new TransactionPage(data.GetProperty("transactions").EnumerateArray().Select(ParseTransaction).ToList(), Text(data, "continuation_key"));
    }
    public static SourceTransaction ParseTransaction(JsonElement item)
    {
        var money = item.GetProperty("transaction_amount");
        var magnitude = decimal.Parse(Required(money, "amount"), CultureInfo.InvariantCulture);
        var direction = Required(item, "credit_debit_indicator");
        if (magnitude < 0 || direction is not ("DBIT" or "CRDT")) throw new ProviderFailure("INVALID_PROVIDER_AMOUNT");
        var description = item.TryGetProperty("remittance_information", out var info) && info.ValueKind == JsonValueKind.Array
            ? string.Join(" ", info.EnumerateArray().Select(x => x.GetString())) : "";
        return new SourceTransaction(Text(item, "entry_reference"), direction == "DBIT" ? -magnitude : magnitude,
            Required(money, "currency"), Date(item, "booking_date"), Date(item, "value_date"), description, Required(item, "status"),
            new TransactionBankDetails(NestedText(item,"creditor","name"), NestedText(item,"debtor","name"),
                AccountIdentifier(item,"creditor_account"), AccountIdentifier(item,"debtor_account"), Text(item,"merchant_category_code"),
                NestedText(item,"bank_transaction_code","code"), NestedText(item,"bank_transaction_code","sub_code"), NestedText(item,"bank_transaction_code","description"),
                Date(item,"transaction_date"), NestedText(item,"balance_after_transaction","amount") is { } balance ? decimal.Parse(balance,CultureInfo.InvariantCulture) : null,
                NestedText(item,"balance_after_transaction","currency")));
    }
    public async Task<IReadOnlyList<SourceBalance>> Balances(string session, string account, CancellationToken ct)
    {
        var data = await Send(HttpMethod.Get, $"accounts/{Uri.EscapeDataString(account)}/balances", null, ct);
        return data.GetProperty("balances").EnumerateArray().Select(x => new SourceBalance(
            decimal.Parse(Required(x.GetProperty("balance_amount"), "amount"), CultureInfo.InvariantCulture),
            Required(x.GetProperty("balance_amount"), "currency"), Required(x, "balance_type"),
            x.TryGetProperty("last_change_date_time", out var date) && date.ValueKind == JsonValueKind.String ? date.GetDateTimeOffset() : null)).ToList();
    }
    private static string InvalidParameters(JsonElement error)
    {
        // Inspect provider diagnostics locally, but emit only fixed field codes, never messages or values.
        var detail = error.GetRawText();
        if (detail.Contains("consent", StringComparison.OrdinalIgnoreCase) && detail.Contains("valid", StringComparison.OrdinalIgnoreCase))
            return "PROVIDER_INVALID_CONSENT_DURATION";
        foreach (var field in new[] { "valid_until", "redirect_url", "psu_type", "state", "balances", "transactions", "aspsp", "access" })
            if (detail.Contains(field, StringComparison.OrdinalIgnoreCase)) return "PROVIDER_INVALID_" + field.ToUpperInvariant();
        return "PROVIDER_INVALID_PARAMETERS";
    }
    private static string? Text(JsonElement data, string key) => data.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
    private static string Required(JsonElement data, string key) => Text(data, key) ?? throw new ProviderFailure("INVALID_PROVIDER_RESPONSE");
    private static DateOnly? Date(JsonElement data, string key) => Text(data, key) is { } value ? DateOnly.ParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture) : null;
}
