using System.Globalization;
using System.Text.Json;
using Banking.Api.Services;

namespace Banking.Api.Providers;

// Only the documented scheme balance is mapped. Benefits, insurance and projected payouts are never added to capital.
public static class PensionStatement
{
    public static object Preview(JsonElement document)
    {
        static JsonElement Field(JsonElement value,string name)=>value.ValueKind==JsonValueKind.Object
            ?value.EnumerateObject().FirstOrDefault(x=>x.Name.Equals(name,StringComparison.OrdinalIgnoreCase)).Value:default;
        static string? Text(JsonElement value)=>value.ValueKind==JsonValueKind.String?value.GetString():null;
        var providers=Field(document,"PensionProviders");Check.That(providers.ValueKind==JsonValueKind.Array,"PENSIONSINFO_PROVIDERS_REQUIRED");
        var rows=new List<WealthInput>();var skipped=0;
        foreach(var provider in providers.EnumerateArray().Take(100))
        {
            var name=Text(Field(provider,"PensionProviderName"));var currency=Text(Field(provider,"CurrencyCode"));var schemes=Field(provider,"Schemes");
            if(string.IsNullOrWhiteSpace(name)||name.Length>120||currency?.Length!=3||schemes.ValueKind!=JsonValueKind.Array){skipped++;continue;}
            foreach(var scheme in schemes.EnumerateArray())
            {
                if(rows.Count>=100)throw new ApiFailure(400,"PENSION_IMPORT_LIMIT");
                var value=Field(scheme,"SavedValue");var date=Text(Field(scheme,"SavedValueDate"));
                var reference=Text(Field(scheme,"ReferenceNumber"));var benefits=Field(scheme,"Benefits");
                var pension=benefits.ValueKind==JsonValueKind.Array&&benefits.EnumerateArray().Any(x=>Field(x,"Pension").ValueKind==JsonValueKind.Object);
                if(value.ValueKind!=JsonValueKind.Number||!value.TryGetDecimal(out var amount)||amount<0||amount>100_000_000
                    ||(amount==0&&!pension)||date is null||date.Length<10||!DateOnly.TryParseExact(date[..10],"yyyy-MM-dd",CultureInfo.InvariantCulture,DateTimeStyles.None,out var asOf))
                {skipped++;continue;}
                var suffix=string.IsNullOrWhiteSpace(reference)?$"scheme {rows.Count+1}":"••"+reference[^Math.Min(4,reference.Length)..];
                rows.Add(new(name.Length>90?name[..90]+" · "+suffix:name+" · "+suffix,name,"Pension",amount,currency!,asOf,
                    "PensionsInfo JSON · scheme balance · verify against the original statement"));
            }
        }
        return new {rows,skipped,saved=false,coverage="Review each scheme and date before saving. Insurance amounts, payout projections, CPR, contacts and the original JSON are not retained. Update an existing product rather than importing it twice."};
    }
}
