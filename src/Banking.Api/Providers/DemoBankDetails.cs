namespace Banking.Api.Providers;

// Fictional identifiers and metadata only. Never consumes live data.
public static class DemoBankDetails
{
    public static BankIdentifier Identifier(string role) => EnableBankingProvider.Identifier("DEMO", "fictional-account-" + role)!;
    public static AccountBankDetails Account(string role) => new(DemoLanguage.Translate("Household " + role + " account"),role is "savings" or "car" or "summerhouse" ? "SVGS" : "CACC",null,[Identifier(role)]);
    public static TransactionBankDetails Transaction(string description, decimal amount, string role, decimal? balance, string? counterpart = null)
    {
        var text=description.ToLowerInvariant();
        var mcc=text.Contains("grocer") || text.Contains("supermarket") || text.Contains("dagligvarer") ? "5411" : text.Contains("kaffe") || text.Contains("coffee") || text.Contains("dining") || text.Contains("restaurant") ? "5812"
            : text.Contains("tankstation") || text.Contains("fuel") ? "5541" : text.Contains("forbrug") || text.Contains("utilities") ? "4900" : text.Contains("forsikring") || text.Contains("insurance") ? "6300" : null;
        var transfer=counterpart is not null;
        return new(amount<0 ? transfer ? "Familiens opsparing" : description : "Familien",
            amount<0 ? "Familien" : transfer ? "Familien" : description,
            amount<0 ? transfer ? Identifier(counterpart!) : null : Identifier(role),
            amount>0 ? transfer ? Identifier(counterpart!) : null : Identifier(role), mcc,
            transfer ? "TRANSFER" : mcc is not null ? "CARD" : "OTHER",null,
            transfer ? "Intern overførsel" : mcc is not null ? "Kortkøb" : "Bankpostering",null,balance,balance is null ? null : "DKK");
    }
}
