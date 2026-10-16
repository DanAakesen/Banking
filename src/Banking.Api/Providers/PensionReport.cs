using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Banking.Api.Services;
using UglyToad.PdfPig;

namespace Banking.Api.Providers;

public sealed record PensionSource(int Page, string Section, string Unit, string Status = "Reported", DateOnly? AsOf = null)
{ public string Confidence => Status == "Reported" ? "Matched source pattern; review required" : Status == "UserEdited" ? "User reviewed edit" : "Unknown"; }
public sealed record PensionNumber(decimal? Value, PensionSource Source);
public sealed record PensionComponent(string Key, string Type, PensionNumber Balance);
public sealed record PensionAgreement(string Key, string Provider, string Name, DateOnly? AsOf,
    PensionNumber Balance, PensionNumber AnnualContribution, PensionComponent[] Components, string Currency = "DKK", PensionSource? DateSource = null);
public sealed record PensionPayout(string Key, string Provider, string Type, int FromAge, int? ToAge,
    PensionNumber Amount, int? MinimumAge = null, int? DurationYears = null, string? TaxMarker = null);
public sealed record PensionScenario(int StartAge, PensionPayout[] Payouts);
public sealed record PensionInsurance(string Key, string Provider, string Type, PensionNumber Amount);
public sealed record PensionWarning(string Code, int? Page, string Section);
public sealed record PensionReport(string ParserVersion, int Pages, DateOnly? ReportAsOf,
    PensionAgreement[] Agreements, PensionScenario[] Scenarios, PensionInsurance[] Insurance,
    PensionWarning[] Warnings, bool BeforeTax, bool TodaysMoney, PensionSource? ReportDateSource = null, PensionSource? AssumptionsSource = null);

// Only typed financial facts and fixed labels leave the extractor. Never return source lines,
// PDF metadata, customer names, CPR, addresses, contacts, agreement numbers or document actions.
public static class PensionReportParser
{
    public const string Version = "pensionsinfo-text-1";
    public const int MaxBytes = 8 * 1024 * 1024, MaxPages = 80;
    static readonly TimeSpan RegexLimit = TimeSpan.FromMilliseconds(100);
    static readonly string[] Providers = ["PFA", "Danica", "Velliv", "Nordea Pension", "Sampension", "PensionDanmark",
        "Industriens Pension", "AkademikerPension", "AP Pension", "PenSam", "Lærernes Pension", "PKA", "PBU", "P+", "Demo Pension"];
    public static string Key(string text) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(text))).ToLowerInvariant();
    static Match Match(string text, string pattern) => Regex.Match(text, pattern, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, RegexLimit);
    static bool Has(string text, string pattern) => Match(text, pattern).Success;
    static string Fold(string text) => text.ToLowerInvariant().Replace('å', 'a').Replace('æ', 'a').Replace('ø', 'o');
    public static decimal? Amount(string text)
    {
        text = text.Trim().Replace("\u00a0", "").Replace(" ", "");
        if (!Regex.IsMatch(text, @"^\d+(?:[.,]\d+)*$", RegexOptions.None, RegexLimit)) return null;
        var comma = text.LastIndexOf(','); var dot = text.LastIndexOf('.');
        if (comma >= 0 && dot >= 0)
            text = comma > dot ? text.Replace(".", "").Replace(',', '.') : text.Replace(",", "");
        else if (comma >= 0)
        { if (text.Length - comma - 1 is not (1 or 2)) return null; text = text.Replace(',', '.'); }
        else if (dot >= 0)
        {
            if (Has(text, @"^\d{1,3}(?:\.\d{3})+$")) text = text.Replace(".", "");
            else if (text.Length - dot - 1 is not (1 or 2)) return null;
        }
        return decimal.TryParse(text, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var value)
            && value is >= 0 and <= 100_000_000 && decimal.Round(value, 2) == value ? value : null;
    }
    public static DateOnly? Date(string line)
    {
        var match = Match(line, @"\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{1,2}\.?\s+(?:januar|februar|marts|april|maj|juni|juli|august|september|oktober|november|december)\s+\d{4})\b");
        if (!match.Success) return null;
        return DateOnly.TryParse(match.Value, CultureInfo.GetCultureInfo("da-DK"), DateTimeStyles.AllowWhiteSpaces, out var date)
            && date.Year >= 1900 ? date : null;
    }
    sealed record Word(string Text, double X, double Y);
    sealed record Line(string Text, Word[] Words);
    sealed class Group(string key, string provider)
    {
        public string Key = key, Provider = provider;
        public DateOnly? AsOf;
        public int DatePage;
        public PensionNumber? Balance, Contribution;
        public List<PensionComponent> Components = [];
    }
    static PensionNumber Number(decimal? value, int page, string section, string unit = "DKK", DateOnly? asOf = null) =>
        new(value, new(page, section, unit, value.HasValue ? "Reported" : "NeedsReview", asOf));
    static decimal? Money(string text)
    {
        var matches = Regex.Matches(text, @"(?<![\d/-])(\d[\d.,\u00a0 ]*)\s*(?:kr\.?|DKK)\b", RegexOptions.IgnoreCase, RegexLimit);
        return matches.Count == 1 ? Amount(matches[0].Groups[1].Value) : null;
    }
    static string Provider(string text) => Providers.FirstOrDefault(p => Has(text, @"(?<!\p{L})" + Regex.Escape(p) + @"(?!\p{L})")) ?? "";
    public static PensionReport Parse(byte[] bytes, CancellationToken ct = default) => Parse(bytes, ct, null);
    internal static PensionReport Parse(byte[] bytes, CancellationToken ct, Action<string, int, int>? progress)
    {
        Check.That(bytes.Length is > 5 and <= MaxBytes && bytes.AsSpan(0, 5).SequenceEqual("%PDF-"u8), "INVALID_PENSION_PDF");
        progress?.Invoke("Opening", 0, 0);
        using var pdf = PdfDocument.Open(bytes, new ParsingOptions { UseLenientParsing = false, MaxStackDepth = 64 });
        Check.That(!pdf.IsEncrypted, "PENSION_PDF_ENCRYPTED");
        Check.That(pdf.NumberOfPages is > 0 and <= MaxPages, "PENSION_PDF_PAGE_LIMIT");
        var pages = new List<Line[]>(); var letters = 0;
        for (var number = 1; number <= pdf.NumberOfPages; number++)
        {
            ct.ThrowIfCancellationRequested();
            progress?.Invoke("ReadingPage", number, letters);
            var page = pdf.GetPage(number);
            letters += page.Letters.Count;
            Check.That(page.Letters.Count <= 60_000 && letters <= 600_000, "PENSION_PDF_TEXT_LIMIT");
            progress?.Invoke("ReadingWords", number, letters);
            var words = page.GetWords().Select(w => new Word(w.Text, w.BoundingBox.Left, w.BoundingBox.Bottom)).ToArray();
            var rows = new List<List<Word>>();
            foreach (var word in words.OrderByDescending(w => w.Y).ThenBy(w => w.X))
            {
                var row = rows.LastOrDefault();
                if (row is null || Math.Abs(row[0].Y - word.Y) > 3) { row = []; rows.Add(row); }
                row.Add(word);
            }
            pages.Add(rows.Select(r => new Line(string.Join(" ", r.OrderBy(w => w.X).Select(w => w.Text)), r.OrderBy(w => w.X).ToArray())).ToArray());
        }
        Check.That(letters >= 20, "PENSION_PDF_SCANNED_OR_EMPTY");
        Check.That(pages.SelectMany(p => p).Any(l => Has(l.Text, "pensionsinfo")), "PENSIONSINFO_PDF_REQUIRED");
        progress?.Invoke("Extracting", pages.Count, letters);
        return Extract(pages, ct);
    }
    static PensionReport Extract(List<Line[]> pages, CancellationToken ct)
    {
        var groups = new Dictionary<string, Group>(); var providerTotals = new Dictionary<string, PensionNumber>();
        var payouts = new Dictionary<int, List<PensionPayout>>(); var insurance = new List<PensionInsurance>();
        var warnings = new List<PensionWarning>(); DateOnly? reportDate = null; PensionSource? reportDateSource = null, assumptionsSource = null;
        var beforeTax = false; var todaysMoney = false; var recognizedPages = new HashSet<int>(); int? lastScenarioAge = null;
        for (var p = 0; p < pages.Count; p++)
        {
            ct.ThrowIfCancellationRequested(); var page = p + 1; var lines = pages[p];
            var pageText = string.Join(" ", lines.Select(l => l.Text));
            var provider = ""; var reference = ""; DateOnly? asOf = null; int? scenarioAge = null;
            var ranges = new List<(double X, int From, int? To)>();
            var annual = Has(pageText, @"årlig|arlig|om året|om aret|pr\.?\s*år|pr\.?\s*ar");
            var monthly = Has(pageText, @"måned|maned|pr\.?\s*md");
            if (Has(pageText, @"forudsæt|forudsat|alle.*beløb|alle.*belob"))
            { beforeTax |= Has(pageText, @"før skat|for skat"); todaysMoney |= Has(pageText, @"nutidskron|dagens (?:penge|pris)|købekraft|kobekraft"); assumptionsSource = new(page, "Projection assumptions", "Terms"); }
            var lineNumber = 0;
            foreach (var line in lines)
            {
                lineNumber++;
                var text = line.Text; var folded = Fold(text); var foundProvider = Provider(text);
                if (foundProvider.Length > 0) { if (provider != foundProvider) reference = ""; provider = foundProvider; }
                if (Has(text, @"rapportdato|udskrevet|rapport dannet|oprettet den") && reportDate is null && Date(text) is DateOnly foundReportDate)
                { reportDate = foundReportDate; reportDateSource = new(page, "Report date", "Date", "Reported", reportDate); }
                if (Has(text, @"pr\.|opgjort|opgørelsesdato|opgorelsesdato|saldo.*dato|as.of")) asOf = Date(text) ?? asOf;
                var refMatch = Match(text, @"(?:aftale(?:nr|nummer)?|police(?:nr|nummer)?|ordnings(?:nr|nummer)?)\.?\s*:?\s*([A-Z0-9][A-Z0-9/-]{3,30})\b");
                if (refMatch.Success) reference = refMatch.Groups[1].Value;
                var ageMatch = Match(text, @"(?:pension(?:ering)?\s*(?:som|ved|fra)?|pensionsalder|udbetaling fra)\s*(\d{2})\s*(?:år|ar|-)");
                if (ageMatch.Success && int.TryParse(ageMatch.Groups[1].Value, out var age) && age is >= 40 and <= 100)
                { scenarioAge = age; lastScenarioAge = age; payouts.TryAdd(age, []); recognizedPages.Add(page); }
                var ageWords = line.Words.Select(w => (Word: w, Match: Match(w.Text, @"^(\d{2})[-–](\d{2})$|^(\d{2})\+$")))
                    .Where(x => x.Match.Success).ToArray();
                if (ageWords.Length > 0)
                {
                    scenarioAge ??= lastScenarioAge;
                    ranges = ageWords.Select(x => (x.Word.X,
                        int.Parse(x.Match.Groups[1].Success ? x.Match.Groups[1].Value : x.Match.Groups[3].Value, CultureInfo.InvariantCulture),
                        x.Match.Groups[2].Success ? (int?)int.Parse(x.Match.Groups[2].Value, CultureInfo.InvariantCulture) : null)).ToList();
                    continue;
                }
                if (scenarioAge.HasValue && ranges.Count > 0 && (annual || monthly))
                {
                    var kind = folded.Contains("folkepension") ? "PublicPension" : Has(text, @"\bATP\b") ? "ATP" : folded.Contains("ratepension") ? "Ratepension" : folded.Contains("livsvar") ? "Lifetime" : folded.Contains("i alt") ? "Total" : "";
                    if (kind.Length > 0)
                    {
                        for (var c = 0; c < ranges.Count; c++)
                        {
                            var column = ranges[c]; var end = c + 1 < ranges.Count ? ranges[c + 1].X - 8 : double.MaxValue;
                            var cell = string.Join("", line.Words.Where(w => w.X >= column.X - 8 && w.X < end && Has(w.Text, @"^[\d.,]+$")).Select(w => w.Text));
                            var amount = Amount(cell); var min = Match(text, @"tidligst\s*(\d{2})"); var duration = Match(text, @"(?:over|i)\s*(\d{1,2})\s*(?:år|ar)");
                            if (amount.HasValue) payouts[scenarioAge.Value].Add(new(Key($"{page}:{lineNumber}:{c}"), kind is "ATP" or "PublicPension" ? kind : provider,
                                kind, column.From, column.To, Number(amount, page, "Retirement scenario", annual && !monthly ? "DKK/year" : monthly && !annual ? "DKK/month" : "Unknown"),
                                min.Success ? int.Parse(min.Groups[1].Value, CultureInfo.InvariantCulture) : null,
                                duration.Success ? int.Parse(duration.Groups[1].Value, CultureInfo.InvariantCulture) : null, Has(text, @"\*|skattefri") ? "See report terms" : null));
                        }
                        recognizedPages.Add(page); continue;
                    }
                }
                var money = Money(text);
                var risk = folded.Contains("dod") ? "Death" : folded.Contains("erhverv") ? "WorkCapacity" : folded.Contains("kritisk") ? "CriticalIllness" : "";
                if (risk.Length > 0 && money.HasValue)
                { insurance.Add(new(Key($"{page}:{lineNumber}:insurance"), provider, risk, Number(money, page, "Insurance"))); recognizedPages.Add(page); continue; }
                // Entitlements and projection pages never produce capital, even when they contain money.
                if (Has(text, @"folkepension|\bATP\b") || scenarioAge.HasValue) continue;
                if (provider.Length == 0 || !money.HasValue) continue;
                var isBalance = Has(text, @"opsparing|saldo|depot|ratepension|livsvarig");
                var isContribution = Has(text, @"indbetaling|bidrag");
                if (!isBalance && !isContribution) continue;
                recognizedPages.Add(page);
                if (reference.Length == 0 && isBalance && !Has(text, @"ratepension|livsvarig"))
                { providerTotals[provider] = Number(money, page, "Reported provider balance", asOf: asOf); continue; }
                var key = Key(provider + ":" + (reference.Length > 0 ? reference : "unidentified-agreement"));
                if (!groups.TryGetValue(key, out var group)) groups[key] = group = new Group(key, provider);
                if ((asOf ?? Date(text)) is DateOnly foundDate) { group.AsOf = foundDate; group.DatePage = page; }
                if (isContribution)
                    group.Contribution = Number(money, page, "Contributions", Has(text, @"måned|maned|pr\.?\s*md") ? "DKK/month" : Has(text, @"år|ar|annual") ? "DKK/year" : "Unknown", asOf);
                else if (Has(text, @"ratepension|livsvarig"))
                {
                    var type = folded.Contains("ratepension") ? "Ratepension" : "Lifetime";
                    group.Components.Add(new(Key(key + ":" + type + ":" + group.Components.Count), type, Number(money, page, "Balance components", asOf: asOf)));
                }
                else group.Balance = Number(money, page, "Agreement balance", asOf: asOf);
            }
        }
        foreach (var pair in providerTotals)
        {
            var matching = groups.Values.Where(g => g.Provider == pair.Key).ToArray();
            if (matching.Length == 0) { var key = Key(pair.Key + ":unidentified-agreement"); groups[key] = new Group(key, pair.Key) { Balance = pair.Value }; }
            else if (matching.Length == 1 && matching[0].Balance is null) matching[0].Balance = pair.Value;
            else if (matching.Length > 1) warnings.Add(new("PROVIDER_TOTAL_NOT_ALLOCATED", pair.Value.Source.Page, "Capital"));
        }
        foreach (var group in groups.Values)
        {
            if (group.Balance is null) warnings.Add(new("CAPITAL_REQUIRES_REVIEW", group.Components.FirstOrDefault()?.Balance.Source.Page, "Capital"));
            if (group.Balance?.Value is decimal total && group.Components.Count > 0 && group.Components.Sum(c => c.Balance.Value ?? 0) != total)
                warnings.Add(new("REPORTED_COMPONENT_TOTAL_DIFFERENCE", group.Balance.Source.Page, "Capital"));
            if (group.AsOf is null) warnings.Add(new("BALANCE_DATE_REQUIRED", group.Balance?.Source.Page, "Capital"));
        }
        foreach (var (age, rows) in payouts)
            if (rows.Count == 0) warnings.Add(new("SCENARIO_TABLE_REQUIRES_REVIEW", null, $"Retirement age {age}"));
        warnings.Add(new("NO_HOLDINGS_OR_RETURN_HISTORY", null, "Coverage"));
        if (insurance.Count > 0) warnings.Add(new("INSURANCE_SOURCE_OBSERVATIONS_NOT_AGGREGATED", null, "Insurance"));
        warnings.Add(new("UNPARSED_SECTIONS_REQUIRE_ORIGINAL_REVIEW", null, "Coverage"));
        foreach (var page in Enumerable.Range(1, pages.Count).Where(p => !recognizedPages.Contains(p)))
            warnings.Add(new("PAGE_REQUIRES_ORIGINAL_REVIEW", page, "Coverage"));
        if (!beforeTax || !todaysMoney) warnings.Add(new("PROJECTION_ASSUMPTIONS_REQUIRE_REVIEW", null, "Assumptions"));
        if (groups.Count == 0) warnings.Add(new("NO_RELIABLE_CAPITAL_FOUND", null, "Capital"));
        return new(Version, pages.Count, reportDate, groups.Values.Select((g, i) => new PensionAgreement(g.Key, g.Provider,
            g.Provider + " · pension " + (i + 1), g.AsOf, g.Balance ?? Number(null, 0, "Capital"),
            g.Contribution ?? Number(null, 0, "Contributions", "DKK/year"), g.Components.ToArray(), "DKK",
            new(g.DatePage, "Balance date", "Date", g.AsOf.HasValue ? "Reported" : "NeedsReview", g.AsOf))).ToArray(),
            payouts.Select(p => new PensionScenario(p.Key, p.Value.ToArray())).OrderBy(x => x.StartAge).ToArray(),
            insurance.ToArray(), warnings.ToArray(), beforeTax, todaysMoney, reportDateSource, assumptionsSource);
    }
    public static PensionReport Json(byte[] bytes, TimeProvider clock)
    {
        using var document = JsonDocument.Parse(bytes);
        var preview = JsonSerializer.SerializeToElement(PensionStatement.Preview(document.RootElement, clock), new JsonSerializerOptions(JsonSerializerDefaults.Web));
        var rows = preview.GetProperty("rows").EnumerateArray().Select((r, i) =>
        {
            var input = r.Deserialize<WealthInput>(new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
            var provider = Provider(input.Provider); if (provider.Length == 0) provider = "Unrecognized provider";
            return new PensionAgreement(Key(input.Provider + ":" + input.Name), provider, provider + " · pension " + (i + 1), input.AsOf,
                new(input.Value, new(0, "JSON scheme balance", input.Currency, "Reported", input.AsOf)), Number(null, 0, "Contributions", input.Currency + "/year"), [],
                input.Currency, new(0, "JSON balance date", "Date", "Reported", input.AsOf));
        }).ToArray();
        return new(Version, 0, rows.Select(r => r.AsOf).Distinct().Count() == 1 ? rows[0].AsOf : null,
            rows, [], [], [new("JSON_BALANCES_ONLY", null, "Coverage"), new("UNPARSED_SECTIONS_REQUIRE_ORIGINAL_REVIEW", null, "Coverage")], false, false);
    }
}
