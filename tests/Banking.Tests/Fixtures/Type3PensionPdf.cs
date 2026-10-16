using System.Globalization;
using System.Text;

namespace Banking.Tests;

// Independent, generated regression document. No owner source, font program or metadata is copied.
internal static class Type3PensionPdf
{
    public static byte[] Create(int pages)
    {
        var objects = new List<byte[]>(); var random = new Random(8127);
        int Add(string text) { objects.Add(Encoding.ASCII.GetBytes(text)); return objects.Count; }
        int Stream(string text) => Add($"<< /Length {Encoding.ASCII.GetByteCount(text)} >>\nstream\n{text}\nendstream");
        var root = Add(""); var tree = Add("");
        var cmap = Stream("/CIDInit /ProcSet findresource begin 12 dict begin begincmap "
            + "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def "
            + "/CMapName /Synthetic def /CMapType 2 def 1 begincodespacerange <20> <7E> endcodespacerange "
            + "95 beginbfchar " + string.Join(" ", Enumerable.Range(32, 95).Select(c => $"<{c:X2}> <{c:X4}>"))
            + " endbfchar endcmap CMapName currentdict /CMap defineresource pop end end");
        // Font-level FontBBox is present on every Type3 font. Only the optional descriptor bbox is absent.
        var descriptor = Add("<< /Type /FontDescriptor /FontName /IndependentSynthetic /Flags 4 "
            + "/Ascent 800 /Descent -200 /CapHeight 700 /ItalicAngle 0 /StemV 80 >>");
        var fonts = new List<int>();
        for (var variant = 0; variant < 10; variant++) for (var bucket = 0; bucket < 10; bucket++)
        {
            var first = 32 + bucket * 10; var count = Math.Min(10, 127 - first);
            var procs = new List<string>();
            foreach (var code in Enumerable.Range(first, count))
            {
                var program = new StringBuilder("650 0 0 0 650 700 d1\n0 0 m\n");
                for (var curve = 0; curve < 40; curve++)
                    program.AppendLine(string.Join(" ", Enumerable.Range(0, 6).Select(_ => random.Next(650))) + " c");
                program.AppendLine("f");
                procs.Add($"/g{code} {Stream(program.ToString())} 0 R");
            }
            var encoding = Add("<< /Type /Encoding /Differences [" + first + " "
                + string.Join(" ", Enumerable.Range(first, count).Select(c => "/g" + c)) + "] >>");
            var charProcs = Add("<< " + string.Join(" ", procs) + " >>");
            fonts.Add(Add($"<< /Type /Font /Subtype /Type3 /FontBBox [0 0 650 700] /FontMatrix [.001 0 0 .001 0 0] "
                + $"/FirstChar {first} /LastChar {first + count - 1} /Widths [" + string.Join(" ", Enumerable.Repeat("650", count))
                + $"] /Encoding {encoding} 0 R /ToUnicode {cmap} 0 R /CharProcs {charProcs} 0 R "
                + $"/Resources << >> /FontDescriptor {descriptor} 0 R >>"));
        }
        var pageRefs = new List<int>();
        for (var page = 0; page < pages; page++)
        {
            var lines = new List<string> { "PensionsInfo independently synthetic processing fixture",
                page == 0 ? "Rapportdato 30.09.2026" : "Forklaring af forventede udbetalinger og vilkar",
                page == 0 ? "PFA Opsparing 275.000 kr. pr. 30.09.2026" : "PFA Vilkar 12.345 23.456 34.567" };
            lines.AddRange(Enumerable.Repeat("Syntetiske forudsatninger og vilkar for fleksibel udbetaling", 9));
            var content = new StringBuilder(); var variant = page % 10;
            for (var row = 0; row < lines.Count; row++) for (var column = 0; column < lines[row].Length; column++)
            {
                var code = (int)lines[row][column]; var font = variant * 10 + (code - 32) / 10;
                var x = (30 + column * 5.2).ToString("F2", CultureInfo.InvariantCulture);
                content.AppendLine($"BT /F{font} 8 Tf 1 0 0 1 {x} {800 - row * 25} Tm <{code:X2}> Tj ET");
            }
            for (var curve = 0; curve < 36; curve++) content.AppendLine("0 0 m 50 50 150 150 250 250 c S");
            var stream = Stream(content.ToString());
            var active = Enumerable.Range(variant * 10, 10).Concat(Enumerable.Range(((variant + 1) % 10) * 10, 10));
            pageRefs.Add(Add($"<< /Type /Page /Parent {tree} 0 R /MediaBox [0 0 595 842] /Resources << /Font << "
                + string.Join(" ", active.Select(i => $"/F{i} {fonts[i]} 0 R")) + $" >> >> /Contents {stream} 0 R >>"));
        }
        objects[root - 1] = Encoding.ASCII.GetBytes($"<< /Type /Catalog /Pages {tree} 0 R >>");
        objects[tree - 1] = Encoding.ASCII.GetBytes($"<< /Type /Pages /Count {pages} /Kids ["
            + string.Join(" ", pageRefs.Select(r => $"{r} 0 R")) + "] >>");
        using var output = new MemoryStream(); var offsets = new List<long>();
        void Write(string text) => output.Write(Encoding.ASCII.GetBytes(text));
        Write("%PDF-1.7\n");
        for (var i = 0; i < objects.Count; i++) { offsets.Add(output.Position); Write($"{i + 1} 0 obj\n"); output.Write(objects[i]); Write("\nendobj\n"); }
        var xref = output.Position; Write($"xref\n0 {objects.Count + 1}\n0000000000 65535 f \n");
        foreach (var offset in offsets) Write($"{offset:D10} 00000 n \n");
        Write($"trailer\n<< /Root {root} 0 R /Size {objects.Count + 1} >>\nstartxref\n{xref}\n%%EOF\n");
        return output.ToArray();
    }
}
