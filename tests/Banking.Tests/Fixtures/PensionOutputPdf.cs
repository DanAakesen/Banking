using UglyToad.PdfPig.Writer;
using UglyToad.PdfPig.Content;
using UglyToad.PdfPig.Core;
using UglyToad.PdfPig.Fonts.Standard14Fonts;

namespace Banking.Tests;

// Independent synthetic observations to exercise structured-output bounds, never product Demo data.
internal static class PensionOutputPdf
{
    public static byte[] Create(int rows)
    {
        var builder = new PdfDocumentBuilder(); var font = builder.AddStandard14Font(Standard14Font.Helvetica);
        for (var number = 1; number <= 46; number++)
        {
            var page = builder.AddPage(PageSize.A4);
            void Text(string text, double x, double y) => page.AddText(text, 7, new PdfPoint(x, y), font);
            Text("PensionsInfo independently synthetic output-bound fixture", 30, 830);
            if (number == 1) Text("Rapportdato 30.09.2026", 30, 810);
            if (number == 3) {
                Text("PFA Opsparing 275.000 kr. pr. 30.09.2026", 30, 800);
                Text("Ved dod 500.000 kr.", 30, 780); Text("Tab af erhvervsevne 96.000 kr.", 30, 760);
                Text("Kritisk sygdom 80.000 kr.", 30, 740);
            }
            if (number == 4) {
                Text("PFA Aftale FICT001", 30, 800); Text("Opgjort pr. 30.09.2026", 30, 780);
                Text("Indbetaling pr. ar 18.000 kr.", 30, 760);
            }
            if (number == 42) {
                Text("PFA Aftale FICT001", 30, 800); Text("Opgjort pr. 30.09.2026", 30, 780);
                Text("Ratepension 100.000 kr.", 30, 760); Text("Ratepension 75.000 kr.", 30, 740);
                Text("Livsvarig 100.000 kr.", 30, 720);
            }
            if (number == 44) Text("Forudsatninger: alle belob for skat og i dagens penge", 30, 800);
            if (number is < 19 or > 40) continue;
            var scenario = (number - 19) / 2; var segment = (number - 19) % 2;
            Text($"Pension som {65 + scenario} ar", 30, 810); Text("Arlige udbetalinger", 30, 795);
            Text("75-79", 300, 780); Text("80-84", 400, 780); Text("85+", 500, 780);
            for (var row = segment; row < rows; row += 2)
            {
                var y = 765 - row / 2 * 8; Text("PFA Ratepension", 30, y);
                Text("12.000", 300, y); Text("11.000", 400, y); Text("10.000", 500, y);
            }
        }
        return builder.Build();
    }
}
