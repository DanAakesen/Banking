namespace Banking.Api.Services;

public sealed class ApiFailure(int status, string code, object? details = null) : Exception(code)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
    // Optional sanitized, typed details for the response body. Never raw provider bodies or secrets.
    public object? Details { get; } = details;
}
public static class Check
{
    public static void That(bool valid, string code) { if (!valid) throw new ApiFailure(400, code); }
    public static string Text(string? value, int max = 80)
    { That(!string.IsNullOrWhiteSpace(value) && value.Length <= max, "INVALID_TEXT"); return value!.Trim(); }
    public static string Currency(string? value)
    { That(value is { Length: 3 } && value.All(x => x is >= 'A' and <= 'Z'), "INVALID_CURRENCY"); return value!; }
    public static void Money(decimal value) => That(decimal.Round(value, 4) == value && value is > -1_000_000_000_000_000m and < 1_000_000_000_000_000m, "INVALID_AMOUNT");
    public static void Dates(DateOnly from, DateOnly to) => That(to >= from && to.DayNumber - from.DayNumber <= 3660, "INVALID_DATE_RANGE");
}
