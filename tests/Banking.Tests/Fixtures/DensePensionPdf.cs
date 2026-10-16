using UglyToad.PdfPig.Content;
using UglyToad.PdfPig.Core;
using UglyToad.PdfPig.Fonts.Standard14Fonts;
using UglyToad.PdfPig.Writer;

namespace Banking.Tests;

// Independently synthetic load fixture, never an accepted owner format or product Demo data.
internal static class DensePensionPdf
{
    public static byte[] Create(int pages, byte[]? embeddedFont = null)
    {
        var builder = new PdfDocumentBuilder { IncludeDocumentInformation = false };
        var fonts = new[] { builder.AddStandard14Font(Standard14Font.Helvetica),
            builder.AddStandard14Font(Standard14Font.TimesRoman), builder.AddStandard14Font(Standard14Font.Courier) };
        if (embeddedFont is not null) fonts[0] = builder.AddTrueTypeFont(embeddedFont);
        for (var number = 0; number < pages; number++)
        {
            var page = builder.AddPage(PageSize.A4);
            void Text(string text, double x, double y, int font = 0, double size = 8) =>
                page.AddText(text, size, new PdfPoint(x, y), fonts[font]);
            Text("PensionsInfo - independently synthetic processing fixture", 30, 805, size: 11);
            if (number == 0)
            {
                Text("Rapportdato 30.09.2026", 30, 788);
                Text("PFA Opsparing 275.000 kr. pr. 30.09.2026", 30, 774);
                Text("Forudsatninger: alle belob for skat og i dagens penge", 30, 760);
            }
            Text("Beskrivelse og forklaring", 30, 740, 1, 10);
            Text("2026", 340, 740); Text("2027", 420, 740); Text("2028", 500, 740);
            for (var row = 0; row < 65; row++)
            {
                var y = 725 - row * 10;
                Text("PFA Vilkar for ordning med fleksibel udbetaling", 30, y, row % 3);
                Text("12.345,50", 340, y, (row + 1) % 3);
                Text("23.456,75", 420, y, row % 3);
                Text("34.567,25", 500, y, (row + 2) % 3);
            }
            Text("Kun en syntetisk test. Ingen person, kontaktoplysninger eller instruktioner.", 30, 45, 2);
        }
        return builder.Build();
    }
}
