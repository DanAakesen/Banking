using UglyToad.PdfPig.Content;
using UglyToad.PdfPig.Core;
using UglyToad.PdfPig.Fonts.Standard14Fonts;
using UglyToad.PdfPig.Writer;
using Banking.Api.Services;

namespace Banking.Api.Providers;

// Deliberately fictional, server-generated originals. Public Demo cannot retain a visitor's private file.
public static class SyntheticPensionReport
{
    public static byte[] Create(string version)
    {
        Check.That(version is "earlier" or "later" or "correction", "INVALID_PENSION_SAMPLE");
        var later = version != "earlier"; var date = later ? "30.09.2026" : "31.12.2025";
        var total = version == "correction" ? "432.000" : later ? "431.000" : "401.000";
        var builder = new PdfDocumentBuilder(); var font = builder.AddStandard14Font(Standard14Font.Helvetica);
        for (var number = 1; number <= 46; number++)
        {
            var page = builder.AddPage(PageSize.A4);
            void Text(string text, double y, double x = 35) => page.AddText(text, 10, new PdfPoint(x, y), font);
            Text("PensionsInfo - SYNTHETIC DEMO REPORT - no real person", 810);
            if (number == 1) Text("Rapportdato " + date, 780);
            if (number == 3)
            {
                Text("Demo Pension Opsparing " + total + " kr. pr. " + date, 760);
                Text("Ved dod 600.000 kr.", 730); Text("Tab af erhvervsevne 120.000 kr.", 710);
                Text("Kritisk sygdom 100.000 kr.", 690);
            }
            if (number == 4)
            { Text("Demo Pension Aftale DEMO001", 760); Text("Opgjort pr. " + date, 740); Text("Indbetaling pr. ar 36.000 kr.", 720); }
            if (number is >= 19 and <= 40)
            {
                var age = 65 + (number - 19) / 2;
                Text("Pension som " + age + " ar", 780);
                if (number % 2 == 0)
                {
                    Text("Arlige udbetalinger i kr. for skat", 755); Text("65-69", 730, 300); Text("70-74", 730, 400); Text("75+", 730, 500);
                    Text("Demo Pension Ratepension", 700); Text("60.000", 700, 300); Text("55.000", 700, 400); Text("0", 700, 500);
                    Text("Demo Pension Livsvarig", 680); Text("24.000", 680, 300); Text("24.000", 680, 400); Text("24.000", 680, 500);
                    Text("ATP", 660); Text("0", 660, 300); Text("12.000", 660, 400); Text("12.000", 660, 500);
                    Text("Folkepension", 640); Text("0", 640, 300); Text("90.000", 640, 400); Text("90.000", 640, 500);
                    Text("I alt", 620); Text("84.000", 620, 300); Text("181.000", 620, 400); Text("126.000", 620, 500);
                }
            }
            if (number == 41) Text("Kobekraft: fremtidige udbetalinger er indicative og ikke faktiske afkast.", 760);
            if (number == 42)
            {
                Text("Demo Pension Aftale DEMO001", 780); Text("Opgjort pr. " + date, 760);
                Text("Ratepension " + (later ? "160.000" : "150.000") + " kr.", 730);
                Text("Ratepension " + (later ? "110.000" : "100.000") + " kr.", 710);
                Text("Livsvarig " + (version == "correction" ? "161.000" : later ? "160.000" : "150.000") + " kr.", 690);
            }
            if (number == 43) Text("Ekstra vilkar og flyttegebyr: se originalen. Ikke pensionskapital.", 760);
            if (number == 44) Text("Forudsatninger: alle belob for skat og i dagens penge. Prognoser er vejledende.", 760);
            Text("Side " + number, 30);
        }
        return builder.Build();
    }
}
