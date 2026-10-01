using System.Text.Json;
using Banking.Api.Data;
using Banking.Api.Providers;
using Banking.Api.Security;

namespace Banking.Api.Services;

public static class BankDetails
{
    public static T? Read<T>(string? json) where T : class => json is null ? null : JsonSerializer.Deserialize<T>(json);
    public static string? Store<T>(T? value) where T : class
    {
        if (value is null) return null;
        var json = JsonSerializer.Serialize(value);
        Check.That(json.Length <= 12000, "SOURCE_FIELD_TOO_LONG");
        return json;
    }
    // Preserve the exact pre-enrichment serialization. Optional bank metadata is NOT identity.
    public static string Fingerprint(SourceTransaction x) => Vault.Hash(JsonSerializer.Serialize(new
        { x.Reference, x.Amount, x.Currency, x.BookingDate, x.ValueDate, x.Description, x.Status }));
    public static TransactionBankDetails? Of(BankTransaction x) => Read<TransactionBankDetails>(x.BankDetailsJson);
    public static object? PublicAccount(Account x)
    {
        var d = Read<AccountBankDetails>(x.BankDetailsJson);
        return d is null ? null : new { d.Description, d.Type, d.Product,
            identifiers = d.Identifiers.Select(i => new { i.Scheme, i.Masked }) };
    }
    public static object? PublicTransaction(BankTransaction x)
    {
        var d = Of(x);
        return d is null ? null : new { d.Creditor, d.Debtor,
            creditorAccount = d.CreditorAccount?.Masked, debtorAccount = d.DebtorAccount?.Masked,
            d.MerchantCategoryCode, merchantCategory = MerchantCategory(d.MerchantCategoryCode),
            d.BankCode, d.BankSubCode, d.BankDescription, d.TransactionDate, d.BalanceAfter, d.BalanceCurrency };
    }
    public static string? MerchantCategory(string? mcc) => mcc switch
    {
        "5411" or "5422" or "5441" or "5451" or "5462" or "5499" => "Groceries",
        "5812" or "5813" or "5814" => "Dining",
        "5541" or "5542" => "Fuel",
        "4111" or "4112" or "4121" or "4131" => "Transport",
        "4900" => "Utilities", "4814" or "4816" => "Internet & phone",
        "5912" or "8011" or "8021" => "Health", "6300" => "Insurance",
        _ => null
    };
    public static bool Identifies(BankIdentifier? identifier, Account account) => identifier is not null
        && (Read<AccountBankDetails>(account.BankDetailsJson)?.Identifiers.Any(i => i.Fingerprint == identifier.Fingerprint) ?? false);

    // Require a unique, complete within-day balance chain. Never use GUID order as bank ordering.
    public static decimal? ClosingBalance(IReadOnlyList<BankTransaction> rows, string currency)
    {
        if (rows.Count == 0) return null;
        var values = rows.Select(x => (x.Amount, Details: Of(x))).ToList();
        if (values.Any(x => x.Details?.BalanceAfter is null || x.Details.BalanceCurrency != currency)) return null;
        var edges = values.Select(x => (Before: x.Details!.BalanceAfter!.Value - x.Amount, After: x.Details.BalanceAfter.Value)).ToList();
        if (edges.Count == 1) return edges[0].After;
        var endings = edges.Where(e => !edges.Any(other => other.Before == e.After)).ToList();
        if (endings.Count != 1) return null;
        var closing = endings[0].After; var current = closing;
        while (edges.Count > 0)
        {
            var matches = edges.Where(x => x.After == current).ToList();
            if (matches.Count != 1) return null;
            current = matches[0].Before; edges.Remove(matches[0]);
        }
        return closing;
    }
}
