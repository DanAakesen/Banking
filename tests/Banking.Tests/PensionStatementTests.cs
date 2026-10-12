using System.Text.Json;
using Banking.Api.Providers;
using Banking.Api.Services;

namespace Banking.Tests;

public sealed class PensionStatementTests
{
    sealed class MidnightClock : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(2026, 9, 30, 22, 30, 0, TimeSpan.Zero);
    }

    [Fact]
    public void Statement_day_follows_Copenhagen_at_the_UTC_day_boundary()
    {
        var input = JsonSerializer.Deserialize<JsonElement>("""{"PensionProviders":[{"PensionProviderName":"PFA","CurrencyCode":"DKK","Schemes":[{"SavedValue":100,"SavedValueDate":"2026-10-01"},{"SavedValue":200,"SavedValueDate":"2026-10-02"}]}]}""");
        var result = JsonSerializer.SerializeToElement(PensionStatement.Preview(input, new MidnightClock()));
        Assert.Single(result.GetProperty("rows").EnumerateArray());
        Assert.Equal(1, result.GetProperty("skipped").GetInt32());
    }

    static JsonElement Preview(string schemes, string currency = "DKK") => JsonSerializer.SerializeToElement(
        PensionStatement.Preview(JsonSerializer.Deserialize<JsonElement>("{\"PensionProviders\":[{\"PensionProviderName\":\"PFA\",\"CurrencyCode\":\"" + currency + "\",\"Schemes\":" + schemes + "}]}")), new JsonSerializerOptions(JsonSerializerDefaults.Web));

    [Fact]
    public void Preserves_capital_and_zero_without_importing_forecast_or_personal_metadata()
    {
        var result = Preview("""[{"SavedValue":123456.78,"SavedValueDate":"2026-09-01T00:00:00+02:00","ReferenceNumber":"1234567890","CPR":"private-person","Contacts":["private-contact"],"Benefits":[{"Pension":{"AnnualAmount":120000}}]},{"SavedValue":0,"SavedValueDate":"2026-09-01","Benefits":[{"Pension":{}}]}]""");
        var rows = result.GetProperty("rows");
        Assert.Equal(2, rows.GetArrayLength());
        Assert.Equal(123456.78m, rows[0].GetProperty("value").GetDecimal());
        Assert.Equal("2026-09-01", rows[0].GetProperty("asOf").GetString());
        Assert.Equal(JsonValueKind.Null, rows[0].GetProperty("annualPension").ValueKind);
        Assert.Equal(0, rows[1].GetProperty("value").GetDecimal());
        Assert.DoesNotContain("private-", result.GetRawText());
        Assert.DoesNotContain("1234567890", result.GetRawText());
        Assert.False(result.GetProperty("saved").GetBoolean());
    }

    [Theory]
    [InlineData("null", "2026-09-01")]
    [InlineData("\"123.456,78\"", "2026-09-01")]
    [InlineData("-1", "2026-09-01")]
    [InlineData("100000001", "2026-09-01")]
    [InlineData("1.234", "2026-09-01")]
    [InlineData("0", "2026-09-01")]
    [InlineData("100", "01/09/2026")]
    [InlineData("100", "2026-09-01garbage")]
    [InlineData("100", "2999-01-01")]
    [InlineData("100", "1899-01-01")]
    public void Unsupported_amounts_or_dates_are_skipped_not_guessed(string value, string date)
    {
        var result = Preview("[{\"SavedValue\":" + value + ",\"SavedValueDate\":\"" + date + "\"}]");
        Assert.Equal(0, result.GetProperty("rows").GetArrayLength());
        Assert.Equal(1, result.GetProperty("skipped").GetInt32());
    }

    [Fact]
    public void Rejects_oversized_or_wrong_documents_and_invalid_currency()
    {
        Assert.Throws<ApiFailure>(() => PensionStatement.Preview(JsonSerializer.Deserialize<JsonElement>("{}")));
        var large = JsonSerializer.SerializeToElement(new { PensionProviders = Array.Empty<object>(), ignored = new string('x', 60000) });
        Assert.Throws<ApiFailure>(() => PensionStatement.Preview(large));
        var many = JsonSerializer.SerializeToElement(new { PensionProviders = Enumerable.Repeat(new { }, 101) });
        Assert.Throws<ApiFailure>(() => PensionStatement.Preview(many));
        Assert.Equal(1, Preview("[]", "123").GetProperty("skipped").GetInt32());
    }
}
