using System.Globalization;
using System.Text.RegularExpressions;

namespace Banking.Api.Providers;

public static partial class PensionReportParser
{
    // Geometry and private agreement references live only for the duration of extraction.
    // No source strings, identifiers or arbitrary labels become public facts.
    static string Text(IEnumerable<Word> words) => string.Join(" ", words.Select(w => w.Text));
    static string Column(Line line, double left, double right) => Text(line.Words.Where(w => (w.X + w.Right) / 2 >= left && (w.X + w.Right) / 2 < right));
    static (double Left, double Right, Match Match)[] Spans(Line line, string pattern)
    {
        var offsets = new List<(int Start, int End, Word Word)>(); var offset = 0;
        foreach (var word in line.Words) { offsets.Add((offset, offset + word.Text.Length, word)); offset += word.Text.Length + 1; }
        return Regex.Matches(line.Text, pattern, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, RegexLimit).Cast<Match>().Select(m =>
        {
            var words = offsets.Where(w => w.Start < m.Index + m.Length && w.End > m.Index).ToArray();
            return (words.Min(w => w.Word.X), words.Max(w => w.Word.Right), m);
        }).ToArray();
    }
    static double? HeaderX(Line line, string pattern) => Spans(line, pattern).Select(s => (double?)s.Left).FirstOrDefault();
    static (Line? Line, int End) TableHeader(Line[] lines, bool details)
    {
        for (var i = 0; i < lines.Length; i++)
        {
            if (!Has(lines[i].Text, "leverandør|leverandor")) continue;
            // Column labels may wrap while remaining above the first data row.
            var end = i;
            while (end + 1 < lines.Length && end - i < 2 && lines[i].Words[0].Y - lines[end + 1].Words[0].Y <= 26
                && Has(lines[end + 1].Text, "aftalenr|pensionstype|udbetaling|indbetaling|opsparing|øvrigt|ovrigt|bemærkninger|bemarkninger|årlig|arlig")
                && Provider(lines[end + 1].Text).Length == 0 && !Has(lines[end + 1].Text, @"\bATP\b|\b\d{5,20}\b")
                && Money(lines[end + 1].Text) is null) end++;
            var words = lines.Skip(i).Take(end - i + 1).SelectMany(l => l.Words).OrderBy(w => w.X).ThenByDescending(w => w.Y).ToArray();
            var header = new Line(Text(words), words);
            if (Has(header.Text, "opsparing") && (details ? Has(header.Text, "udbetaling") : !Has(header.Text, "udbetaling") && Has(header.Text, "aftalenr") && Has(header.Text, "indbetaling")))
                return (header, end);
        }
        return (null, -1);
    }
    static string Reference(string text)
    {
        var labelled = Match(text, @"(?:aftale(?:nr|nummer)?|police(?:nr|nummer)?)\.?\s*:?\s*([A-Z0-9][A-Z0-9/-]{3,30})\b");
        if (labelled.Success) return labelled.Groups[1].Value;
        return text.Split(' ').FirstOrDefault(t => Has(t, @"^\d{5,20}$")) ?? "";
    }
    static string PensionType(string text) => Has(text, "ratepension") ? "Ratepension" : Has(text, "livsvar") ? "Lifetime" : "";
    static string Risk(string text) => Has(text, @"(?:ved|vedrørende)\s+død|ved\s+dod") ? "Death"
        : Has(text, @"tab af (?:arbejds|erhvervs)evne") ? "WorkCapacity" : Has(text, @"(?:visse )?kritiske? sygdom") ? "CriticalIllness" : "";

    static HashSet<int> ExtractLayouts(List<Line[]> pages, Dictionary<string, Group> groups,
        Dictionary<string, PensionNumber> providerTotals, Dictionary<int, List<PensionPayout>> payouts,
        List<PensionInsurance> insurance, List<PensionWarning> warnings, CancellationToken ct)
    {
        var handled = new HashSet<int>(); var references = new Dictionary<string, HashSet<string>>();
        // Details establish the provider of a logo-only summary before totals/contributions are joined.
        for (var p = 0; p < pages.Count; p++)
        {
            ct.ThrowIfCancellationRequested(); var lines = pages[p]; var page = p + 1;
            var (header, headerEnd) = TableHeader(lines, true);
            if (header is null) continue;
            handled.Add(page);
            var payoutX = HeaderX(header, "udbetaling"); var savingsX = HeaderX(header, "opsparing"); var otherX = HeaderX(header, "øvrigt|ovrigt") ?? double.MaxValue;
            if (!payoutX.HasValue || !savingsX.HasValue) { warnings.Add(new("CAPITAL_COLUMNS_REQUIRE_REVIEW", page, "Capital")); continue; }
            var block = new List<Line>();
            void Finish()
            {
                if (block.Count == 0) return;
                var identity = string.Join(" ", block.Select(l => Column(l, 0, payoutX.Value)));
                var provider = Provider(identity); var reference = Reference(identity); var type = PensionType(identity);
                if (provider.Length == 0 || reference.Length == 0 || type.Length == 0)
                { warnings.Add(new("AGREEMENT_LINK_REQUIRES_REVIEW", page, "Capital")); block.Clear(); return; }
                var key = Key(provider + ":" + reference);
                if (!groups.TryGetValue(key, out var group)) groups[key] = group = new(key, provider);
                if (!references.TryGetValue(reference, out var keys)) references[reference] = keys = [];
                keys.Add(key);
                var savings = string.Join(" ", block.Select(l => Column(l, savingsX.Value, otherX)));
                var money = Money(savings); var date = Date(savings);
                group.Components.Add(new(Key(key + ":" + type + ":" + group.Components.Count), type,
                    Number(money, page, "Balance components", asOf: date)));
                if (group.AsOf is null && date.HasValue) { group.AsOf = date; group.DatePage = page; }
                else if (date.HasValue && group.AsOf != date) warnings.Add(new("COMPONENT_DATES_DIFFER", page, "Capital"));
                block.Clear();
            }
            foreach (var line in lines.Skip(headerEnd + 1))
            {
                if (Provider(Column(line, 0, payoutX.Value)).Length > 0) Finish();
                block.Add(line);
            }
            Finish();
        }
        foreach (var group in groups.Values.Where(g => g.Components.Select(c => c.Balance.Source.AsOf).Where(d => d.HasValue).Distinct().Count() > 1))
        { group.AsOf = null; group.DatePage = 0; }
        for (var p = 0; p < pages.Count; p++)
        {
            ct.ThrowIfCancellationRequested(); var lines = pages[p]; var page = p + 1;
            var (header, headerEnd) = TableHeader(lines, false);
            if (header is null) continue;
            handled.Add(page);
            var refX = HeaderX(header, "aftalenr"); var noteX = HeaderX(header, "bemærkninger|bemarkninger");
            var contributionX = HeaderX(header, "årlig|arlig") ?? HeaderX(header, "indbetaling"); var savingsX = HeaderX(header, "opsparing");
            if (refX is null || noteX is null || contributionX is null || savingsX is null)
            { warnings.Add(new("CAPITAL_COLUMNS_REQUIRE_REVIEW", page, "Capital")); continue; }
            var rows = new List<Line>();
            void Finish()
            {
                if (rows.Count == 0) return;
                var reference = Reference(string.Join(" ", rows.Select(l => Column(l, refX.Value, noteX.Value))));
                var identity = string.Join(" ", rows.Select(l => Column(l, 0, contributionX.Value)));
                if (Has(identity, @"\bATP\b|folkepension")) { rows.Clear(); return; }
                Group? group = null;
                if (references.TryGetValue(reference, out var keys) && keys.Count == 1) group = groups[keys.Single()];
                else if (reference.Length > 0 && !references.ContainsKey(reference) && Provider(identity) is { Length: > 0 } provider)
                { var key = Key(provider + ":" + reference); if (!groups.TryGetValue(key, out group)) groups[key] = group = new(key, provider); }
                if (group is null) { warnings.Add(new("AGREEMENT_LINK_REQUIRES_REVIEW", page, "Capital")); rows.Clear(); return; }
                var savings = string.Join(" ", rows.Select(l => Column(l, savingsX.Value, double.MaxValue)));
                var contribution = string.Join(" ", rows.Select(l => Column(l, contributionX.Value, savingsX.Value)));
                var date = Date(savings);
                group.Balance = Number(Money(savings), page, "Agreement balance", asOf: date);
                group.Contribution = Number(Money(contribution), page, "Contributions", Has(header.Text, "årlig|arlig") ? "DKK/year" : "Unknown", Date(contribution));
                // A missing summary balance date must not turn a future payout date into an as-of date.
                if (date.HasValue) { group.AsOf = date; group.DatePage = page; }
                rows.Clear();
            }
            foreach (var line in lines.Skip(headerEnd + 1))
            {
                if (Reference(Column(line, refX.Value, noteX.Value)).Length > 0 || Has(Column(line, 0, refX.Value), @"\bATP\b")) Finish();
                if (rows.Count > 0 || Reference(Column(line, refX.Value, noteX.Value)).Length > 0 || Has(line.Text, @"\bATP\b")) rows.Add(line);
            }
            Finish();
        }
        int? age = null;
        for (var p = 0; p < pages.Count; p++)
        {
            ct.ThrowIfCancellationRequested(); var lines = pages[p]; var page = p + 1;
            var text = string.Join(" ", lines.Select(l => l.Text));
            var ageMatch = Match(text, @"hvis du går på pension som\s*(\d{2})\s*[-–]?\s*årig");
            if (ageMatch.Success) { age = int.Parse(ageMatch.Groups[1].Value, CultureInfo.InvariantCulture); if (age is < 40 or > 100) age = null; }
            if (age.HasValue && ageMatch.Success)
            { handled.Add(page); payouts.TryAdd(age.Value, []); ParseScenario(lines, page, age.Value, payouts[age.Value], warnings); continue; }
            var overview = lines.FirstOrDefault(l => Has(l.Text, "nuværende pensionsopsparinger|nuvarende pensionsopsparinger"));
            if (overview is not null)
            {
                handled.Add(page);
                // The right section can share baselines with capital. Only the left section supplies balances.
                var right = lines.SelectMany(l => Spans(l, @"dine forsikringer|udbetaling ved|visse kritiske")).Where(s => s.Left > overview.Words[0].X + 100).Select(s => s.Left).DefaultIfEmpty(double.NaN).Min();
                if (double.IsNaN(right)) warnings.Add(new("CAPITAL_COLUMNS_REQUIRE_REVIEW", page, "Capital"));
                else foreach (var line in lines.Where(l => l.Words[0].Y < overview.Words[0].Y))
                {
                    var left = Column(line, 0, right); var provider = Provider(left); var money = Money(left);
                    if (provider.Length > 0 && money.HasValue && !Has(left, @"\bATP\b|folkepension"))
                        providerTotals[provider] = Number(money, page, "Reported provider balance", asOf: Date(left));
                }
                warnings.Add(new("INSURANCE_OVERVIEW_REQUIRES_DETAIL_REVIEW", page, "Insurance"));
                continue;
            }
            var risk = Risk(text);
            if (risk.Length > 0 && Has(text, @"på én gang|pa en gang|mistet arbejdsevne"))
            { handled.Add(page); ParseInsurance(lines, page, risk, insurance, warnings); }
        }
        return handled;
    }

    sealed record AgeColumn(double Center, double Left, int From, int? To);
    static void ParseScenario(Line[] lines, int page, int age, List<PensionPayout> target, List<PensionWarning> warnings)
    {
        var header = Array.FindIndex(lines, l => Has(l.Text, "pensioner") && Has(l.Text, @"\d{2}.*(?:år|ar)"));
        if (header < 0) return; // The chart page of a pair has no source table.
        var spans = Spans(lines[header], @"(?:Fra\s*)?(\d{2})(?:\s*[-–]\s*(\d{2})|\s*(\+))?\s*(?:år|ar)\b");
        var columns = spans.Select(s => new AgeColumn((s.Left + s.Right) / 2, s.Left,
            int.Parse(s.Match.Groups[1].Value, CultureInfo.InvariantCulture),
            s.Match.Groups[2].Success ? int.Parse(s.Match.Groups[2].Value, CultureInfo.InvariantCulture) : Has(s.Match.Value, "fra|\\+") ? null : int.Parse(s.Match.Groups[1].Value, CultureInfo.InvariantCulture))).ToArray();
        if (columns.Length == 0 || columns.Any(c => c.From is < 40 or > 120 || c.To < c.From) || columns.Zip(columns.Skip(1)).Any(c => c.First.From >= c.Second.From))
        { warnings.Add(new("SCENARIO_COLUMNS_REQUIRE_REVIEW", page, "Retirement scenario")); return; }
        var gap = columns.Length > 1 ? columns[1].Center - columns[0].Center : 100;
        var left = columns[0].Center - gap / 2;
        var last = HeaderX(lines[header], "værdi|vardi") ?? columns[^1].Center + gap / 2;
        var annual = Has(string.Join(" ", lines.Select(l => l.Text)), @"årligt|årlige|om året|arligt|arlige|om aret");
        var monthly = Has(string.Join(" ", lines.Select(l => l.Text)), @"måned|maned|pr\.?\s*md");
        var unit = annual && !monthly ? "DKK/year" : monthly && !annual ? "DKK/month" : "Unknown";
        var blocks = new List<(int Row, string Text, decimal?[] Values)>(); string label = ""; decimal?[]? values = null; var row = 0;
        void Finish() { if (values is not null) blocks.Add((row, label, values)); values = null; label = ""; }
        for (var i = header + 1; i < lines.Length; i++)
        {
            var line = lines[i]; var prefix = Column(line, 0, left);
            var cells = columns.Select((c, n) =>
            {
                var start = n == 0 ? left : (columns[n - 1].Center + c.Center) / 2;
                var end = n + 1 == columns.Length ? last : (c.Center + columns[n + 1].Center) / 2;
                return Amount(string.Concat(line.Words.Where(w => (w.X + w.Right) / 2 >= start && (w.X + w.Right) / 2 < end && Has(w.Text, @"^[\d.,]+$")).Select(w => w.Text)));
            }).ToArray();
            // A long terms line can cross amount-column geometry. It is not a financial row.
            var dataRow = Provider(prefix).Length > 0 || Has(prefix, @"\bATP\b|folkepension|^i alt|^om året|^om aret|^[ST]\s+\p{L}");
            if (dataRow && cells.Any(c => c.HasValue)) { Finish(); values = cells; label = prefix; row = i; }
            else if (Has(prefix, @"^om året|^om aret|^i alt|^[ST]\s+\p{L}|^Folkepension")
                || prefix.Trim() == "ATP" || (Provider(prefix).Length > 0 && prefix.Trim() == Provider(prefix))) Finish();
            else if (values is not null) label += " " + Column(line, 0, last);
        }
        Finish();
        var hasPublicDetail = blocks.Any(b => Has(b.Text, @"folkepension\s*[-–]"));
        foreach (var block in blocks)
        {
            var total = Has(block.Text, @"^i alt\b");
            var publicPension = Has(block.Text, "folkepension");
            if (publicPension && hasPublicDetail && !Has(block.Text, @"folkepension\s*[-–]")) continue;
            var type = total ? "Total" : publicPension ? "PublicPension" : Has(block.Text, @"\bATP\b") ? "ATP" : PensionType(block.Text);
            var provider = total ? "Total" : publicPension ? "PublicPension" : type == "ATP" ? "ATP" : Provider(block.Text);
            if (type.Length == 0 || provider.Length == 0)
            { if (!Has(block.Text, @"^om året|^om aret")) warnings.Add(new("SCENARIO_ROW_REQUIRES_REVIEW", page, "Retirement scenario")); continue; }
            var minimum = Match(block.Text, @"tidligst\s*(?:fra\s*)?(\d{2})\s*(?:år|ar)");
            var duration = Match(block.Text, @"udbetales\s*(?:over|i)\s*(\d{1,2})\s*(?:år|ar)");
            var marker = Match(block.Text, @"^\s*([ST])\s+");
            for (var c = 0; c < columns.Length; c++) if (block.Values[c].HasValue)
                target.Add(new(Key($"{page}:{block.Row}:{c}"), provider, type, columns[c].From, columns[c].To,
                    Number(block.Values[c], page, "Retirement scenario", unit),
                    minimum.Success ? int.Parse(minimum.Groups[1].Value, CultureInfo.InvariantCulture) : null,
                    duration.Success ? int.Parse(duration.Groups[1].Value, CultureInfo.InvariantCulture) : null, marker.Success ? marker.Groups[1].Value : null));
        }
        if (!warnings.Any(w => w.Code == "PAYOUT_TREND_REQUIRES_ORIGINAL_REVIEW"))
            warnings.Add(new("PAYOUT_TREND_REQUIRES_ORIGINAL_REVIEW", null, "Retirement scenario"));
    }

    static void ParseInsurance(Line[] lines, int page, string risk, List<PensionInsurance> target, List<PensionWarning> warnings)
    {
        if (lines.Any(l => Has(l.Text, @"udbetaling ved (?:død|dod).*?(?:børn|born|børne|borne)")))
        { warnings.Add(new("CHILD_BENEFIT_REQUIRES_ORIGINAL_REVIEW", page, "Insurance")); return; }
        var header = lines.FirstOrDefault(l => Has(l.Text, @"på én gang|pa en gang|mistet arbejdsevne"));
        if (header is null) return;
        var x = HeaderX(header, @"på én gang|pa en gang|mistet arbejdsevne")!.Value;
        double? numberRight = null, currencyRight = null;
        if (x < 100)
        {
            // This one-column overview puts its subtotal beside a LEFT-side label. Use only
            // that currency-bearing subtotal as geometry, never as an additional policy.
            var number = Spans(header, @"(?<![\d/-])\d[\d.,]*(?=\s*(?:kr\.?|DKK)\b)");
            var money = Spans(header, @"(?<![\d/-])\d[\d.,]*\s*(?:kr\.?|DKK)\b\.?");
            var label = Spans(header, @"^(?:på én gang|pa en gang)");
            if (risk != "CriticalIllness" || number.Length != 1 || money.Length != 1 || label.Length != 1
                || Money(header.Text) is null || money[0].Left < label[0].Right + 100
                || !Has(header.Text, @"^(?:på én gang|pa en gang)\s+\d[\d.,]*\s*(?:kr\.?|DKK)\.?\s*$"))
            { warnings.Add(new("INSURANCE_COLUMNS_REQUIRE_REVIEW", page, "Insurance")); return; }
            x = (label[0].Right + money[0].Left) / 2;
            numberRight = number[0].Right; currencyRight = money[0].Right;
        }
        var provider = ""; var index = 0;
        var annual = Has(string.Join(" ", lines.Select(l => l.Text)), "om året|om aret|årlig|arlig");
        var monthly = Has(string.Join(" ", lines.Select(l => l.Text)), "måned|maned");
        foreach (var line in lines.Where(l => l.Words[0].Y < header.Words[0].Y))
        {
            index++; var label = Column(line, 0, x); var found = Has(label, @"\bATP\b") ? "ATP" : Provider(label);
            if (found.Length > 0) provider = found;
            if (Has(label, @"^i alt|^om året|^om aret")) { provider = ""; continue; }
            if (provider.Length == 0) continue;
            var numeric = line.Words.Where(w => w.X >= x && Has(w.Text, @"^\d[\d.,]*$")).ToArray();
            if (numberRight.HasValue)
            {
                // Accept only a labelled provider observation aligned with the anchored amount
                // column. Continuation references and arbitrary notes cannot supply a cover.
                if (found.Length == 0 || !Has(label, @"^(?:[FST]\s+)?" + Regex.Escape(found) + @"\s*$")) continue;
                if (numeric.Length != 1 || Amount(numeric[0].Text) is null
                    || (Math.Abs(numeric[0].Right - numberRight.Value) > 6 && Math.Abs(numeric[0].Right - currencyRight!.Value) > 6))
                { warnings.Add(new("INSURANCE_COLUMNS_REQUIRE_REVIEW", page, "Insurance")); continue; }
            }
            var amounts = numeric.Select(w => Amount(w.Text)).Where(v => v.HasValue).ToArray();
            if (amounts.Length == 0) continue;
            var distinct = amounts.Distinct().ToArray(); var value = distinct.Length == 1 ? distinct[0] : null;
            if (!value.HasValue) warnings.Add(new("INSURANCE_CONDITIONS_REQUIRE_ORIGINAL_REVIEW", page, "Insurance"));
            target.Add(new(Key($"{page}:{index}:insurance"), provider, risk, Number(value, page, "Insurance source observation", risk == "WorkCapacity" ? annual && !monthly ? "DKK/year" : monthly && !annual ? "DKK/month" : "Unknown" : "DKK")));
        }
        if (!warnings.Any(w => w.Code == "INSURANCE_TERMS_REQUIRE_ORIGINAL_REVIEW"))
            warnings.Add(new("INSURANCE_TERMS_REQUIRE_ORIGINAL_REVIEW", null, "Insurance"));
    }
}
