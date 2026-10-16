using Banking.Api.Services;
using System.Diagnostics;
using System.Globalization;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Xml;
using System.Xml.Linq;

namespace Banking.Api.Providers;

// Source facts only. Names and raw employee/grant references never leave this parser.
public sealed record StockSource(string Sheet, int Row);
public sealed record StockWarning(string Code, StockSource? Source = null);
public sealed record StockGrant(string Key, DateOnly AwardDate, string Type, decimal Awarded, decimal Vested,
    decimal Unvested, decimal TotalTransacted, decimal GrantPrice, DateOnly? ExpirationDate, StockSource Source);
public sealed record StockSchedule(string GrantKey, DateOnly Date, decimal Shares, decimal MatchedPastVesting, StockSource Source);
public sealed record StockTransaction(string GrantKey, DateOnly Date, string Type, decimal Quantity, decimal? HistoricalFairMarketValue,
    decimal? TaxableSpread, decimal? ReportedTaxes, decimal? SharesForTaxes, decimal? NetShares, StockSource Source);
public sealed record EmployeeStockReport(string ParserVersion, DateOnly? ReportAsOf, string? ReportedCurrency,
    decimal? CurrentHeldShares, decimal? CurrentPrice, decimal? DkkPerUsd, StockGrant[] Grants,
    StockSchedule[] Schedules, StockTransaction[] Transactions, StockWarning[] Warnings);

public static class EmployeeStockWorkbook
{
    public const string Version = "employee-stock-xlsx-1";
    public const int MaxBytes = 8 * 1024 * 1024, MaxExpanded = 32 * 1024 * 1024, MaxPart = 8 * 1024 * 1024;
    public static readonly string[][] Headers = [
        ["Awardee ID","Last Name","First Name","Award ID","Award Date","Award Type","Awarded","Award Price","Vested","Unvested","Total Transacted","Expiration Date"],
        ["Awardee ID","Last Name","First Name","Award ID","Award Date","Award Type","Award Price","Vest Date","Vest Shares"],
        ["Awardee ID","Last Name","First Name","Transaction Date","Transaction Amt","Fair Market Value","Transaction Type","Award ID","Award Date","Award Type","Award Price","Taxable Spread","Federal Tax %","Federal Tax Amt","Federal Sup Tax %","Federal Sup Tax Amt","Medicare Tax%","Medicare Tax Amt","Social Security Tax %","Social Security Tax Amt","State Tax %","State Tax Amt","State 2 Tax %","State 2 Tax Amt","State Other Tax Amt","Local 1 Tax %","Local 1 Tax Amt","Local 2 Tax %","Local 2 Tax Amt","Local 3 Tax %","Local 3 Tax Amt","Local 4 Tax %","Local 4 Tax Amt","Local 5 Tax %","Local 5 Tax Amt","Local 6 Tax %","Local 6 Tax Amt","SUI Tax %","SUI Tax Amt","SDI Tax %","SDI Tax Amt","US Other Tax Amt","Non-US Income Tax %","Non-US Income Tax Amt","Non-US Misc. 1 Tax %","Non-US Misc. 1 Tax Amt","Non-US Social Tax %","Non-US Social Tax Amt","Non-US Misc. 2 Tax %","Non-US Misc. 2 Tax Amt","Non-US Other Tax Amt","Total Taxes","Shares For Taxes","Net Shares","SA Broker/Trustee Name","Award Country","Transaction Country","Award Co. Income %","Awarded Country Source Income","Awarded Country Tax Due","Transaction Country Tax Due","Award State","Transaction State","Award State Income %","Award State Source Income","Award State Tax Paid","Transaction State Tax Paid"]
    ];
    public static readonly string[] Sheets = ["Award Summary", "Vest Schedules", "Transactions"];
    static readonly XNamespace Main = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    static readonly XNamespace Rel = "http://schemas.openxmlformats.org/package/2006/relationships";
    static readonly XNamespace DocRel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    static void Require(bool condition, string code) { if (!condition) throw new ApiFailure(400, "STOCK_" + code); }
    public static EmployeeStockReport Parse(byte[] bytes, CancellationToken ct = default)
    {
        var watch = Stopwatch.StartNew();
        void Budget() { ct.ThrowIfCancellationRequested(); Require(watch.Elapsed < TimeSpan.FromSeconds(10), "TIME_LIMIT"); }
        try { return Extract(bytes, Budget); }
        catch (ApiFailure) { throw; }
        catch (OperationCanceledException) { throw; }
        catch (Exception ex) when (ex is InvalidDataException or XmlException or FormatException or OverflowException or ArgumentException)
        { throw new ApiFailure(400, "STOCK_INVALID_WORKBOOK"); }
    }
    static EmployeeStockReport Extract(byte[] bytes, Action budget)
    {
        budget(); Require(bytes.Length <= MaxBytes, "FILE_TOO_LARGE");
        Require(bytes.Length >= 4 && bytes[0] == 'P' && bytes[1] == 'K' && bytes[2] == 3 && bytes[3] == 4, "FILE_TYPE");
        using var input = new MemoryStream(bytes, false); using var zip = new ZipArchive(input, ZipArchiveMode.Read);
        Require(zip.Entries.Count is > 0 and <= 256, "PACKAGE_LIMIT");
        var parts = new Dictionary<string, XDocument>(StringComparer.OrdinalIgnoreCase); long expanded = 0;
        foreach (var entry in zip.Entries)
        {
            budget(); var name = entry.FullName;
            Require(SafePath(name) && !parts.ContainsKey(name), "PACKAGE_PATH");
            Require(name.EndsWith(".xml", StringComparison.OrdinalIgnoreCase) || name.EndsWith(".rels", StringComparison.OrdinalIgnoreCase), "UNSUPPORTED_PART");
            Require(!name.Contains("externalLink", StringComparison.OrdinalIgnoreCase) && !name.Contains("vba", StringComparison.OrdinalIgnoreCase), "UNSUPPORTED_PART");
            Require(entry.Length <= MaxPart && entry.Length <= Math.Max(1024, entry.CompressedLength) * 200, "EXPANSION_LIMIT");
            using var stream = entry.Open(); using var data = new MemoryStream(); var buffer = new byte[8192]; int read;
            while ((read = stream.Read(buffer)) > 0) { budget(); expanded += read; Require(expanded <= MaxExpanded && data.Length + read <= MaxPart, "EXPANSION_LIMIT"); data.Write(buffer, 0, read); }
            data.Position = 0;
            using var reader = XmlReader.Create(data, new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null, MaxCharactersInDocument = MaxPart, IgnoreComments = true, IgnoreProcessingInstructions = true });
            // Validate depth before constructing an in-memory tree.
            while (reader.Read()) { budget(); Require(reader.Depth <= 32, "XML_DEPTH"); }
            data.Position = 0;
            using var treeReader = XmlReader.Create(data, new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null, MaxCharactersInDocument = MaxPart });
            var doc = XDocument.Load(treeReader); parts.Add(name, doc);
            Require(!doc.Descendants().Any(e => e.Name.LocalName is "f" or "definedName" or "externalReference" or "ddeLink" or "oleObject"), "ACTIVE_CONTENT");
            if (name.EndsWith(".rels", StringComparison.OrdinalIgnoreCase))
                Require(doc.Root?.Name == Rel + "Relationships" && doc.Root.Elements().All(e => e.Name == Rel + "Relationship" && ((string?)e.Attribute("TargetMode") is null or "Internal") && SafeTarget((string?)e.Attribute("Target"))), "EXTERNAL_LINK");
            if (name == "[Content_Types].xml") Require(!doc.Descendants().Any(e => ((string?)e.Attribute("ContentType") ?? "").Contains("macro", StringComparison.OrdinalIgnoreCase)), "ACTIVE_CONTENT");
        }
        XDocument Part(string path) { Require(parts.ContainsKey(path), "PACKAGE_STRUCTURE"); return parts[path]; }
        var rootRels = Part("_rels/.rels").Root!;
        var workbookLinks = rootRels.Elements(Rel + "Relationship").Where(e => (string?)e.Attribute("Type") == DocRel.NamespaceName + "/officeDocument").ToArray();
        Require(workbookLinks.Length == 1 && ((string?)workbookLinks[0].Attribute("Target"))?.TrimStart('/') == "xl/workbook.xml", "PACKAGE_STRUCTURE");
        var book = Part("xl/workbook.xml"); Require(book.Root?.Name == Main + "workbook", "PACKAGE_STRUCTURE");
        Require((string?)book.Root!.Element(Main + "workbookPr")?.Attribute("date1904") is null or "0" or "false", "DATE_SYSTEM");
        var relationships = Part("xl/_rels/workbook.xml.rels").Root!.Elements(Rel + "Relationship").ToArray();
        Require(relationships.Select(e => (string?)e.Attribute("Id")).Distinct().Count() == relationships.Length, "PACKAGE_STRUCTURE");
        var shared = parts.TryGetValue("xl/sharedStrings.xml", out var strings) ? strings.Root!.Elements(Main + "si").Select(Text).ToArray() : [];
        Require(shared.Length <= 50000 && shared.All(s => s.Length <= 4096), "STRING_LIMIT");
        var sheetNodes = book.Root.Element(Main + "sheets")?.Elements(Main + "sheet").ToArray() ?? [];
        Require(sheetNodes.Length == 3 && sheetNodes.Select(e => (string?)e.Attribute("name")).Distinct().Count() == 3, "SHEETS");
        var tables = new List<Row[]>(); int cells = 0;
        for (int i = 0; i < Sheets.Length; i++)
        {
            var sheet = sheetNodes.SingleOrDefault(e => (string?)e.Attribute("name") == Sheets[i]); Require(sheet is not null, "SHEETS");
            var link = relationships.SingleOrDefault(e => (string?)e.Attribute("Id") == (string?)sheet!.Attribute(DocRel + "id"));
            Require(link is not null && (string?)link.Attribute("Type") == DocRel.NamespaceName + "/worksheet", "PACKAGE_STRUCTURE");
            var target = (string?)link!.Attribute("Target"); Require(target is not null && SafeTarget(target), "PACKAGE_PATH");
            var document = Part(target!.StartsWith('/') ? target[1..] : "xl/" + target); Require(document.Root?.Name == Main + "worksheet", "PACKAGE_STRUCTURE");
            var rows = new List<Row>(); int previous = 0;
            foreach (var node in document.Root!.Element(Main + "sheetData")?.Elements(Main + "row") ?? [])
            {
                budget(); Require(rows.Count < 5000 && int.TryParse((string?)node.Attribute("r"), out _), "ROW_LIMIT");
                int rowNo = int.Parse(node.Attribute("r")!.Value, CultureInfo.InvariantCulture); Require(rowNo > previous && rowNo <= 100000, "ROW_ORDER"); previous = rowNo;
                var values = new string[Headers[i].Length]; var seen = new HashSet<int>();
                foreach (var cell in node.Elements(Main + "c"))
                {
                    budget(); Require(++cells <= 100000, "CELL_LIMIT"); var address = (string?)cell.Attribute("r") ?? "";
                    int column = 0, p = 0; while (p < address.Length && address[p] is >= 'A' and <= 'Z') { column = checked(column * 26 + address[p++] - 'A' + 1); }
                    Require(p > 0 && address[p..] == rowNo.ToString(CultureInfo.InvariantCulture) && column > 0, "CELL_ADDRESS");
                    var type = (string?)cell.Attribute("t"); var value = cell.Element(Main + "v")?.Value ?? "";
                    if (type == "s") { Require(int.TryParse(value, out var n) && n >= 0 && n < shared.Length, "SHARED_STRING"); value = shared[int.Parse(value, CultureInfo.InvariantCulture)]; }
                    else if (type == "inlineStr") value = Text(cell.Element(Main + "is") ?? new XElement("empty"));
                    else Require(type is null or "n" or "str", "CELL_TYPE");
                    Require(value.Length <= 4096, "STRING_LIMIT");
                    if (column > values.Length) { Require(string.IsNullOrWhiteSpace(value), "HEADERS"); continue; }
                    Require(seen.Add(column), "DUPLICATE_CELL"); values[column - 1] = value.Trim();
                }
                if (values.All(string.IsNullOrEmpty)) continue;
                rows.Add(new Row(rowNo, values, Sheets[i]));
            }
            Require(rows.Count > 0 && rows[0].Values.SequenceEqual(Headers[i]), "HEADERS"); tables.Add(rows.Skip(1).ToArray());
        }
        Require(tables[0].Length is > 0 and <= 500, "GRANT_LIMIT");
        var people = tables.SelectMany(t => t).Select(r => r.Get(0)).Distinct(StringComparer.Ordinal).ToArray();
        Require(people.Length == 1 && people[0].Length is > 0 and <= 120, "MIXED_AWARDEES");
        var grants = new List<StockGrant>(); var schedules = new List<StockSchedule>(); var transactions = new List<StockTransaction>(); var warnings = new List<StockWarning>();
        var joins = new Dictionary<string, StockGrant>(StringComparer.Ordinal);
        string Key(string id) { Require(id.Length is > 0 and <= 120, "AWARD_REFERENCE"); return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes("employee-stock-v1\0" + people[0] + "\0" + id))).ToLowerInvariant(); }
        string Kind(Row r, int index) { var raw = r.Get(index).ToLowerInvariant().Replace(" ", "").Replace("-", ""); return raw switch { "onhire" or "onhiresa" => "OnHire", "annual" or "annualsa" or "sa" => "Annual", _ => Unknown() }; string Unknown() { warnings.Add(new("AWARD_TYPE_UNSUPPORTED", r.Source)); return "Other"; } }
        foreach (var r in tables[0])
        {
            budget(); var key = Key(r.Get(3)); Require(!joins.ContainsKey(key), "DUPLICATE_GRANT");
            var grant = new StockGrant(key, r.Date(4), Kind(r, 5), r.Number(6), r.Number(8), r.Number(9), r.Number(10), r.Number(7), r.Get(11) == "" ? null : r.Date(11), r.Source);
            grants.Add(grant); joins.Add(key, grant);
            if (grant.Awarded != grant.Vested + grant.Unvested) warnings.Add(new("AWARD_QUANTITIES_DIFFER", r.Source));
        }
        StockGrant Join(Row row, int id, int date, int price) { var key = Key(row.Get(id)); Require(joins.ContainsKey(key), "UNMATCHED_GRANT"); var g = joins[key]; Require(g.AwardDate == row.Date(date) && g.GrantPrice == row.Number(price), "GRANT_FIELDS_DIFFER"); return g; }
        foreach (var r in tables[1]) { budget(); var g = Join(r, 3, 4, 6); var date = r.Date(7); Require(date >= g.AwardDate, "SCHEDULE_DATE"); schedules.Add(new(g.Key, date, r.Number(8), 0, r.Source)); }
        foreach (var r in tables[2])
        {
            budget(); var g = Join(r, 7, 8, 10); var kind = r.Get(6) == "Stock Award Vest" ? "StockAwardVest" : "Unsupported";
            if (kind == "Unsupported") warnings.Add(new("TRANSACTION_TYPE_UNSUPPORTED", r.Source));
            var tx = new StockTransaction(g.Key, r.Date(3), kind, r.Number(4), r.Optional(5), r.Optional(11), r.Optional(51), r.Optional(52), r.Optional(53), r.Source);
            transactions.Add(tx);
            if (tx.NetShares is not null && tx.SharesForTaxes is not null && tx.Quantity != tx.NetShares + tx.SharesForTaxes) warnings.Add(new("DELIVERED_SHARES_DIFFER", r.Source));
        }
        Require(schedules.DistinctBy(s => (s.GrantKey, s.Date)).Count() == schedules.Count, "DUPLICATE_SCHEDULE");
        foreach (var g in grants)
        {
            budget(); var delivered = transactions.Where(t => t.GrantKey == g.Key && t.Type == "StockAwardVest").ToArray();
            if (delivered.Sum(t => t.Quantity) != g.Vested || delivered.Sum(t => t.Quantity) != g.TotalTransacted) warnings.Add(new("VESTING_TOTALS_DIFFER", g.Source));
            if (schedules.Where(s => s.GrantKey == g.Key).Sum(s => s.Shares) != g.Awarded) warnings.Add(new("SCHEDULE_TOTAL_DIFFERS", g.Source));
            // A delivery may be shifted to the next business day or split across rows.
            // Match whole cumulative groups within seven days; ambiguous groups remain unconfirmed.
            foreach (var group in delivered.GroupBy(t => t.Date).OrderBy(t => t.Key))
            {
                var candidates = schedules.Select((s, index) => (s, index)).Where(x => x.s.GrantKey == g.Key && x.s.MatchedPastVesting == 0 && group.Key.DayNumber - x.s.Date.DayNumber is >= 0 and <= 7).ToArray();
                if (candidates.Length == 0 || candidates.Sum(x => x.s.Shares) != group.Sum(t => t.Quantity)) { warnings.Add(new("SCHEDULE_MATCH_REQUIRES_REVIEW", group.First().Source)); continue; }
                foreach (var (s, index) in candidates) schedules[index] = s with { MatchedPastVesting = s.Shares };
            }
        }
        warnings.Add(new("CURRENT_HOLDINGS_NOT_REPORTED")); warnings.Add(new("PROFILE_CURRENCY_AND_ISSUER_NOT_REPORTED")); warnings.Add(new("REPORT_DATE_NOT_REPORTED")); warnings.Add(new("TAX_OBSERVATIONS_NOT_TAX_SETTLEMENT"));
        return new(Version, null, null, null, null, null, grants.ToArray(), schedules.ToArray(), transactions.ToArray(), warnings.Distinct().ToArray());
    }
    static string Text(XElement element) => string.Concat(element.Descendants(Main + "t").Select(e => e.Value));
    static bool SafePath(string value) => value.Length is > 0 and <= 200 && !value.StartsWith('/') && !value.Contains('\\') && !value.Contains(':') && !value.Contains('%') && value.Split('/').All(p => p.Length > 0 && p is not "." and not "..");
    static bool SafeTarget(string? value) => value is not null && SafePath(value.StartsWith('/') ? value[1..] : value);
    sealed record Row(int NumberInSheet, string[] Values, string Sheet)
    {
        public StockSource Source => new(Sheet, NumberInSheet);
        public string Get(int n) => Values[n] ?? "";
        public DateOnly Date(int n) { Require(DateOnly.TryParseExact(Get(n), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date) && date.Year is >= 1900 and <= 2200, "DATE_INVALID"); return date; }
        public decimal Number(int n) { var value = Optional(n); Require(value is not null, "NUMBER_MISSING"); return value!.Value; }
        public decimal? Optional(int n) { if (Get(n) == "") return null; Require(decimal.TryParse(Get(n), NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var value) && value >= 0 && value <= 1000000000 && decimal.Round(value, 8) == value, "NUMBER_INVALID"); return value; }
    }
}
