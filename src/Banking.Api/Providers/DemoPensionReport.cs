using System.Globalization;
using System.Text;
using Banking.Api.Services;

namespace Banking.Api.Providers;

// Independent fictional originals only. Parsed by the same bounded reader and reviewed
// through the same DTO/approval/history path as owner reports. No private input is accepted.
public static class DemoPensionReport
{
    public const string Series = "banking-fictional-pension-2";
    const string Reference = "99000123";
    sealed class LayoutPdf
    {
        readonly List<StringBuilder> pages = [];
        public sealed class Page(StringBuilder content)
        {
            public void Text(string text, double x, double y) => content.AppendLine(FormattableString.Invariant(
                $"BT /F1 10 Tf 1 0 0 1 {x} {y} Tm ({text.Replace("\\", "\\\\").Replace("(", "\\(").Replace(")", "\\)")}) Tj ET"));
        }
        public Page AddPage() { var content = new StringBuilder(); pages.Add(content); return new(content); }
        public byte[] Build()
        {
            var objects = new List<string> { "<< /Type /Catalog /Pages 2 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>" };
            var refs = new List<int>();
            foreach (var page in pages)
            {
                var stream = page.ToString(); var n = objects.Count + 1;
                objects.Add($"<< /Length {Encoding.Latin1.GetByteCount(stream)} >>\nstream\n{stream}endstream");
                refs.Add(n + 1); objects.Add($"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1200 850] /Resources << /Font << /F1 3 0 R >> >> /Contents {n} 0 R >>");
            }
            objects[1] = $"<< /Type /Pages /Count {pages.Count} /Kids [" + string.Join(" ", refs.Select(n => $"{n} 0 R")) + "] >>";
            using var output = new MemoryStream(); var offsets = new List<long>();
            void Write(string text) => output.Write(Encoding.Latin1.GetBytes(text));
            Write("%PDF-1.7\n");
            for (var n = 0; n < objects.Count; n++) { offsets.Add(output.Position); Write($"{n + 1} 0 obj\n{objects[n]}\nendobj\n"); }
            var xref = output.Position; Write($"xref\n0 {objects.Count + 1}\n0000000000 65535 f \n");
            foreach (var offset in offsets) Write($"{offset:D10} 00000 n \n");
            Write($"trailer\n<< /Root 1 0 R /Size {objects.Count + 1} >>\nstartxref\n{xref}\n%%EOF\n");
            return output.ToArray();
        }
    }
    public static byte[] Create(string version)
    {
        Check.That(version is "earlier" or "later" or "correction", "INVALID_PENSION_SAMPLE");
        var earlier = version == "earlier";
        var date = earlier ? "31.12.2025" : "30.09.2026";
        var components = earlier ? new[] { 150000m, 100000m, 151000m }
            : new[] { 160000m, 110000m, version == "correction" ? 162000m : 161000m };
        var total = components.Sum();
        string Amount(decimal value) => value.ToString("N0", CultureInfo.GetCultureInfo("da-DK"));
        var builder = new LayoutPdf();
        for (var p = 1; p <= 46; p++)
        {
            var page = builder.AddPage();
            void Text(string text, double x, double y) => page.Text(text, x, y);
            void Right(string text, double end, double y) => Text(text, end - text.Length * 6, y);
            Text("PensionsInfo - FIKTIV DEMO - ingen virkelig person eller udbyderaftale", 25, 825);
            if (p == 1)
            {
                Text("Rapportdato " + date, 30, 780);
                Text("Fiktive eksempelbeløb til Banking Demo. Ikke et tilbud eller faktiske pensionsrettigheder.", 30, 750);
                Text("Tidligere rapporter bevares. Afkast og investeringsbeholdninger er ikke oplyst.", 30, 725);
            }
            if (p == 3)
            {
                Text("Dine pensioner", 30, 790); Text("Dine forsikringer", 650, 790);
                Text("Nuværende pensionsopsparinger", 30, 765); Text("Udbetaling ved død", 650, 765);
                Text("Demo Pension", 30, 735); Text(Amount(total) + " kr.", 350, 735); Text("På én gang 600.000 kr.", 900, 735);
                Text("ATP*", 30, 710); Text("Folkepension**", 30, 690);
            }
            if (p == 4)
            {
                Text("Dine aftaler", 30, 790);
                Text("Leverandør", 30, 760); Text("Aftalenr.", 210, 760); Text("Bemærkninger", 400, 760);
                Text("Årlig indbetaling", 650, 760); Text("Opsparing", 850, 760);
                Text("ATP Livslang Pension", 30, 730); Text("Lovpligtig", 400, 730); Text("3.600 kr.", 650, 730); Text("Opgøres ikke", 850, 730);
                Text("pr. " + date, 650, 710);
                Text(Reference, 210, 660); Text("Via arbejde (fiktiv)", 400, 660);
                Text("36.000 kr.", 650, 660); Text(Amount(total) + " kr.", 850, 660);
                Text("pr. " + date, 650, 640); Text("pr. " + date, 850, 640);
            }
            if (p is 5 or 7 or 8)
            {
                Text(p == 5 ? "Udbetaling ved død" : p == 7 ? "Udbetaling ved tab af arbejdsevne" : "Visse kritiske sygdomme", 30, 790);
                Text(p == 7 ? "Mistet arbejdsevne" : "På én gang", p == 8 ? 30 : 650, 760);
                if (p == 5)
                {
                    Text("S ATP", 30, 730); Text("ATP Livslang Pension", 30, 715); Text("48.000 kr.", 650, 715);
                    Text("S Demo Pension", 30, 680); Text(Reference, 30, 665); Text("420.000 kr.", 650, 665);
                    Text("S Demo Pension", 30, 630); Text(Reference, 30, 615); Text("132.000 kr.", 650, 615);
                    Text("I alt", 30, 580); Text("600.000 kr.", 650, 565);
                }
                else if (p == 7)
                {
                    Text("Indtil 70 år", 900, 760); Text("Om året i en årrække", 30, 730);
                    Text("S Demo Pension", 30, 700); Text("120.000", 650, 700); Text("120.000", 900, 700);
                    Text(Reference + " Ophørende udbetaling", 30, 680);
                }
                else
                {
                    Right("100.000 kr.", 1140, 760);
                    Text("F Demo Pension", 30, 730); Right("100.000 kr.", 1140, 730);
                    Text(Reference, 30, 710); Text("Engangsudbetaling", 30, 690);
                    Text("I alt:", 30, 630); Right("100.000 kr.", 1140, 630);
                }
            }
            if (p is >= 19 and <= 40)
            {
                var age = 65 + (p - 19) / 2;
                Text($"Hvis du går på pension som {age}-årig får du ({(p % 2 == 1 ? 1 : 2)} | 2)", 30, 790);
                if (p % 2 == 0)
                {
                    Text("Om året i kr. før skat", 30, 770);
                    // Split at public-entitlement ages and at the end of the private 15-year terms.
                    // An earlier public-only band is intentionally present for starts after 67.
                    var boundaries = new[] { 67, 70, age, age + 15 }.Where(a => a >= Math.Min(age, 67)).Distinct().Order().ToArray();
                    Text("Pensioner", 30, 740);
                    for (var c = 0; c < boundaries.Length; c++)
                    {
                        var from = boundaries[c];
                        var label = c == boundaries.Length - 1 ? $"Fra {from} år" : boundaries[c + 1] == from + 1 ? $"{from} år" : $"{from}-{boundaries[c + 1] - 1} år";
                        Text(label, 330 + c * 140, 740);
                    }
                    Text("Værdi i købekraft", 1010, 740);
                    var factor = 1m + (age - 65) * .03m;
                    var rate = boundaries.Select(a => a >= age && a < age + 15 ? (decimal?)(18000 * factor) : null).ToArray();
                    var rate2 = boundaries.Select(a => a >= age && a < age + 15 ? (decimal?)(12000 * factor) : null).ToArray();
                    var life = boundaries.Select(a => a >= age ? (decimal?)(24000 * factor) : null).ToArray();
                    var atp = boundaries.Select(a => a >= 70 ? (decimal?)12000 : null).ToArray();
                    var publicPension = boundaries.Select(a => a >= 67 ? (decimal?)90000 : null).ToArray();
                    void Row(string label, decimal?[] values, double y, string? trend = null)
                    {
                        Text(label, 30, y);
                        for (var c = 0; c < values.Length; c++) if (values[c].HasValue) Right(Amount(values[c]!.Value), 403 + c * 140, y);
                        if (trend is not null) Text(trend, 1010, y);
                    }
                    decimal?[] Sum(params decimal?[][] rows) => Enumerable.Range(0, boundaries.Length).Select(c => (decimal?)rows.Sum(r => r[c] ?? 0)).ToArray();
                    Row("Folkepension", publicPension, 710);
                    Row("S Folkepension - grundbeløb", publicPension, 690); Text("Udbetales tidligst fra 67 år", 30, 675);
                    Row("Om året i en årrække", Sum(rate, rate2), 645);
                    Row("S Demo Pension", rate, 620, "Faldende"); Text(Reference, 30, 605); Text("Ratepension Udbetales i 15 år", 30, 590);
                    Row("S Demo Pension", rate2, 560, "Faldende"); Text(Reference, 30, 545); Text("Ratepension Udbetales i 15 år", 30, 530);
                    Row("Om året, så længe du lever", Sum(life, atp), 500);
                    Row("S ATP", atp, 475, "Stigende"); Text("ATP Livslang Pension", 30, 460); Text("Livsvarig pension Udbetales tidligst fra 70 år", 30, 445);
                    Row("S Demo Pension", life, 415, "Faldende"); Text(Reference, 30, 400); Text("Livsvarig pension", 30, 385);
                    Row("I alt årligt:", Sum(rate, rate2, life, atp, publicPension), 350);
                }
            }
            if (p == 41) Text("Købekraft er vejledende. Der er ingen oplysninger om faktiske historiske afkast.", 30, 760);
            if (p == 42)
            {
                Text("Pension - flere oplysninger / Uanset pensionsalder", 30, 790);
                Text("Leverandør, aftalenr. og pensionstype", 30, 760); Text("Udbetaling", 300, 760);
                Text("Indbetaling", 490, 760); Text("Opsparing", 760, 760); Text("Øvrigt", 1100, 760);
                for (var c = 0; c < components.Length; c++)
                {
                    var y = 725 - c * 150;
                    Text("Demo Pension", 30, y); Text(Reference, 30, y - 15); Text(c < 2 ? "Ratepension" : "Livsvarig pension", 30, y - 30);
                    Text("Se det valgte scenarie", 300, y);
                    Text("Der er ikke leveret oplysninger om", 490, y); Text("indbetalingen på denne pension", 490, y - 15);
                    Text("Investeringsformen for opsparingen", 760, y); Text("er markedsrentepension.", 760, y - 15);
                    Text("Pr. " + date + " udgør opsparingen", 760, y - 30); Text(Amount(components[c]) + " kr.", 760, y - 45);
                }
            }
            if (p == 43) Text("Fuldstændige vilkår og begunstigede er ikke specificeret i dette fiktive eksempel.", 30, 760);
            if (p == 44) Text("Alle beløb er før skat og i dagens penge. Forudsætninger: prognoser er vejledende.", 30, 760);
            Text("Side " + p, 30, 25);
        }
        return builder.Build(); // Deterministic bytes, no generated metadata, timestamps or random trailer ID.
    }
}
