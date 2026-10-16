using System.Globalization;
using System.Text;

namespace Banking.Api.Providers;

// Independently fictional regression input. Never a product Demo report or a private-source copy.
public static class ColumnPensionPdf
{
    // Standard Courier with an explicit WinAnsi encoding preserves Danish tokens without OS font dependencies.
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
    public const string Reference = "87654321", AsOf = "12.04.2024";
    public static byte[] Create(bool ambiguous = false, bool missingSavingsDate = false, bool conditional = false, bool wrapped = false, bool blankComponent = false, string criticalLayout = "right")
    {
        var builder = new LayoutPdf();
        string Amount(decimal value) => value.ToString("N0", CultureInfo.GetCultureInfo("da-DK"));
        for (var p = 1; p <= 46; p++)
        {
            var page = builder.AddPage();
            void Text(string text, double x, double y) => page.Text(text, x, y);
            void Right(string text, double end, double y)
            {
                Text(text, end - text.Length * 6, y);
            }
            Text("PensionsInfo - fictional column layout regression", 25, 825);
            if (p == 3)
            {
                Text("Dine pensioner", 30, 790); Text("Dine forsikringer", 650, 790);
                Text("Nuværende pensionsopsparinger", 30, 765); Text("Udbetaling ved død", 650, 765);
                Text("PFA", 30, 735); Text("927.000 kr.", 350, 735); Text("På én gang 638.000 kr.", 900, 735);
                Text("ATP*", 30, 710); Text("Folkepension**", 30, 690);
            }
            if (p == 4)
            {
                Text("Dine aftaler", 30, 790);
                Text("Leverandør", 30, 760); Text("Aftalenr.", 210, 760); Text("Bemærkninger", 400, 760);
                if (wrapped) { Text("Årlig", 650, 760); Text("indbetaling", 650, 748); } else Text("Årlig indbetaling", 650, 760); Text("Opsparing", 850, 760);
                Text("ATP Livslang Pension", 30, 730); Text("Lovpligtig", 400, 730); Text("5.200 kr.", 650, 730); Text("Opgøres ikke", 850, 730);
                Text("pr. " + AsOf, 650, 710);
                // Provider logo intentionally has no extractable text in this row.
                Text(Reference, 210, 660); Text("Via arbejde", 400, 660);
                Text("132.000 kr.", 650, 660); Text("927.000 kr.", 850, 660);
                Text("pr. " + AsOf, 650, 640); if (!missingSavingsDate) Text("pr. " + AsOf, 850, 640);
            }
            if (p is >= 5 and <= 8)
            {
                Text(p == 5 ? "Udbetaling ved død" : p == 6 ? "Udbetaling ved død til børn" : p == 7 ? "Udbetaling ved tab af arbejdsevne" : "Visse kritiske sygdomme", 30, 790);
                Text(p == 7 ? "Mistet arbejdsevne" : "På én gang", p == 8 && criticalLayout != "right" ? 30 : 650, 760);
                if (p == 8 && criticalLayout != "right")
                {
                    if (criticalLayout != "missing") Right("126.000 kr.", 1140, 760);
                    if (criticalLayout == "ambiguous") Text("23.000 kr.", 650, 760);
                    if (criticalLayout == "notes") Text("Supplerende note", 400, 760);
                } if (p == 7) Text("Indtil 71 år", 900, 760);
                if (p == 5)
                {
                    Text("S ATP", 30, 730); Text("ATP Livslang Pension", 30, 715); Text("58.000 kr.", 650, 715);
                    Text("S PFA", 30, 680); Text(Reference, 30, 665); Text("438.000 kr.", 650, 665);
                    Text("S PFA", 30, 630); Text(Reference, 30, 615); Text("142.000 kr.", 650, 615);
                    Text("I alt", 30, 580); Text("638.000 kr.", 650, 565);
                }
                else if (p == 7)
                {
                    Text("Om året i en årrække", 30, 730); Text("S PFA", 30, 700);
                    Text("188.000", 650, 700); Text(conditional ? "176.000" : "188.000", 900, 700);
                    Text(Reference + " Ophørende udbetaling", 30, 680);
                }
                else if (p == 8 && criticalLayout != "right")
                {
                    Text("F PFA", 30, 730);
                    Right(criticalLayout == "bare" ? "126.000" : "126.000 kr.", criticalLayout == "misaligned" ? 900 : 1140, 730);
                    if (criticalLayout == "multipleCells") Text("49.000", 800, 730);
                    Text(Reference, 30, 710); Text("Engangsudbetaling", 30, 690);
                    Text("Supplerende oplysninger", 30, 665); Right("349.000 kr.", 1140, 665);
                    Text("I alt:", 30, 630); Right("126.000 kr.", 1140, 630);
                }
                else { Text("PFA", 30, 730); Text(p == 6 ? "74.000 kr." : "94.000 kr.", 650, 710); }
            }
            if (p is >= 19 and <= 40)
            {
                var age = 65 + (p - 19) / 2;
                Text($"Hvis du går på pension som {age}-årig får du ({(p % 2 == 1 ? 1 : 2)} | 2)", 30, 790);
                if (p % 2 == 0)
                {
                    Text("Om året i kr. før skat", 30, 770);
                    // Includes single-age, separated tokens, open end, and an entitlement range before private start.
                    var ranges = age == 65 ? new[] { "65-66 år", "67-69 år", "70-79 år", "80-81 år", wrapped ? "Fra82år" : "Fra 82 år" }
                        : age == 70 ? new[] { "70-84 år", "Fra 85 år" }
                        : new[] { $"{age - 1} år", $"{age}-{age + 9} år", $"Fra {age + 10} år" };
                    Text("Pensioner", 30, 740);
                    for (var c = 0; c < ranges.Length; c++) Text(ranges[c], 330 + c * 120, 740);
                    Text("Værdi i købekraft", 1010, 740);
                    var n = ranges.Length;
                    var publicAmounts = Enumerable.Repeat<decimal?>(98000, n).ToArray();
                    var rate = Enumerable.Range(0, n).Select(c => (decimal?)(age == 70 ? c == 0 ? 197000 : 0 : c == n - 1 ? 0 : 104000)).ToArray();
                    var rate2 = Enumerable.Range(0, n).Select(c => (decimal?)(age == 70 ? c == 0 ? 81000 : 0 : c == n - 1 ? 0 : 23000)).ToArray();
                    if (blankComponent) Array.Fill(rate2, null);
                    var life = Enumerable.Repeat<decimal?>(age == 70 ? 142000 : 34000, n).ToArray();
                    var atp = Enumerable.Repeat<decimal?>(18000, n).ToArray();
                    if (age == 65) { publicAmounts[0] = null; atp[0] = null; atp[1] = null; }
                    if (age != 65 && age != 70) { rate[0] = null; rate2[0] = null; life[0] = null; }
                    void Row(string label, decimal?[] values, double y, string? trend = null)
                    {
                        Text(label, 30, y);
                        for (var c = 0; c < n; c++) if (values[c].HasValue) Right(Amount(values[c]!.Value), 403 + c * 120, y);
                        if (trend is not null) Text(trend, 1010, y);
                    }
                    Row("Folkepension", publicAmounts, 710);
                    Row("S Folkepension - grundbeløb", publicAmounts, 690); Text("Udbetales tidligst fra 67 år", 30, 675);
                    Row("Om året i en årrække", Enumerable.Range(0, n).Select(c => rate[c] + rate2[c]).ToArray(), 645);
                    Row("S PFA", rate, 620, "Faldende"); Text(Reference, 30, 605); Text("Ratepension Udbetales i 15 år", 30, 590);
                    Row("S PFA", rate2, 560, "Faldende"); Text(Reference, 30, 545); Text("Ratepension Udbetales i 15 år", 30, 530);
                    Row("Om året, så længe du lever", Enumerable.Range(0, n).Select(c => (decimal?)((life[c] ?? 0) + (atp[c] ?? 0))).ToArray(), 500);
                    Row("S ATP", atp, 475, "Stigende"); Text("ATP Livslang Pension", 30, 460); Text("Livsvarig pension Udbetales tidligst fra 70 år", 30, 445);
                    Row("S PFA", life, 415, "Faldende"); Text(Reference, 30, 400); Text("Livsvarig pension", 30, 385);
                    Row("I alt årligt:", Enumerable.Range(0, n).Select(c => (decimal?)((publicAmounts[c] ?? 0) + (rate[c] ?? 0) + (rate2[c] ?? 0) + (life[c] ?? 0) + (atp[c] ?? 0))).ToArray(), 350);
                }
            }
            if (p == 42)
            {
                Text("Pension - flere oplysninger / Uanset pensionsalder", 30, 790);
                Text("Leverandør, aftalenr. og pensionstype", 30, 760); Text("Udbetaling", 300, 760);
                Text("Indbetaling", 490, 760); Text("Opsparing", 760, 760); Text("Øvrigt", 1100, 760);
                for (var c = 0; c < 3; c++)
                {
                    var y = 725 - c * 150;
                    Text(ambiguous && c == 2 ? "Velliv" : "PFA", 30, y); Text(Reference, 30, y - 15); Text(c < 2 ? "Ratepension" : "Livsvarig pension", 30, y - 30);
                    Text("Startdato 01.09.2054", 300, y);
                    Text("Der er ikke leveret oplysninger om", 490, y); Text("indbetalingen på denne pension", 490, y - 15); Text("Sidste betaling 01.08.2054", 490, y - 30);
                    Text("Investeringsformen for opsparingen", 760, y); Text("er markedsrentepension.", 760, y - 15);
                    Text((missingSavingsDate ? "" : "Pr. " + AsOf + " ") + "udgør opsparingen", 760, y - 30);
                    Text((c == 0 ? "704.000" : c == 1 ? "61.000" : "161.000") + " kr.", 760, y - 45);
                }
            }
            if (p == 44) Text("Alle beløb er før skat og i dagens penge. Forudsætninger: prognoser er vejledende.", 30, 760);
            Text("Side " + p, 30, 25);
        }
        return builder.Build();
    }
}
