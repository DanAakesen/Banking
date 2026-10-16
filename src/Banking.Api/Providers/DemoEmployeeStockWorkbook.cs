using System.Globalization;
using System.IO.Compression;
using System.Text;
using System.Xml.Linq;
using Banking.Api.Services;

namespace Banking.Api.Providers;

// Independently invented product Demo. No owner source, dates, identities or amounts.
public static class DemoEmployeeStockWorkbook
{
    public const string Source = "Fiktivt Demo-eksempel · ikke en observeret markedskurs";
    public static (DateOnly Day, decimal Held, decimal Price, decimal Rate) Values(string variant) => variant switch {
        "earlier" => (new(2026,3,15),28.75m,405m,7.05m),
        "middle" => (new(2026,7,15),36.25m,415m,6.95m),
        "later" => (new(2026,10,1),42.5m,425m,6.8m),
        _ => throw new ApiFailure(400,"STOCK_DEMO_VERSION_INVALID") };
    public static byte[] Create(string variant)
    {
        var (asOf,_,_,_)=Values(variant);
        static string Day(DateOnly d)=>d.ToString("yyyy-MM-dd",CultureInfo.InvariantCulture);
        static DateOnly Delivery(DateOnly d)=>d.DayOfWeek==DayOfWeek.Saturday?d.AddDays(2):d.DayOfWeek==DayOfWeek.Sunday?d.AddDays(1):d;
        var summary=new List<object?[]>();var schedule=new List<object?[]>();var transactions=new List<object?[]>();
        void Grant(string id,DateOnly awarded,string kind,DateOnly start,int count,decimal qty)
        {
            var dates=Enumerable.Range(0,count).Select(i=>{var d=start.AddMonths(i*3);return new DateOnly(d.Year,d.Month,DateTime.DaysInMonth(d.Year,d.Month));}).ToArray();
            var past=dates.Where(d=>Delivery(d)<=asOf).ToArray();var vested=past.Length*qty;
            object?[] Identity()=>["00008888","Eksempel","Fiktiv",id,Day(awarded),kind];
            summary.Add([..Identity(),count*qty,0m,vested,count*qty-vested,vested,null]);
            foreach(var d in dates)schedule.Add([..Identity(),0m,Day(d),qty]);
            foreach(var d in past){var row=new object?[67];row[0]="00008888";row[1]="Eksempel";row[2]="Fiktiv";row[3]=Day(Delivery(d));row[4]=qty;row[5]=300m+d.Year-2024+d.Month;row[6]="Stock Award Vest";row[7]=id;row[8]=Day(awarded);row[9]=kind;row[10]=0m;row[11]=qty*(decimal)row[5]!;row[51]=null;row[52]=qty/4;row[53]=qty*3/4;row[54]="Fidelity · fiktivt eksempel";transactions.Add(row);}
        }
        Grant("00009001",new(2023,12,15),"On-Hire",new(2024,2,29),16,10m);
        Grant("00009002",new(2025,12,15),"FY2026 Annual SA",new(2026,3,31),20,6m);
        List<object?[]>[] rows=[summary,schedule,transactions];
        const string ns="http://schemas.openxmlformats.org/spreadsheetml/2006/main",rel="http://schemas.openxmlformats.org/package/2006/relationships",dr="http://schemas.openxmlformats.org/officeDocument/2006/relationships";
        XNamespace n=ns;var strings=new List<string>();var parts=new Dictionary<string,string>();
        XElement Cell(object? value,int column,int row){string address="";for(int c=column;c>0;c=(c-1)/26)address=(char)('A'+(c-1)%26)+address;
            if(value is null)return new(n+"c",new XAttribute("r",address+row));bool numeric=value is decimal or int;var text=Convert.ToString(value,CultureInfo.InvariantCulture)!;
            if(!numeric){if(!strings.Contains(text))strings.Add(text);text=strings.IndexOf(text).ToString(CultureInfo.InvariantCulture);}
            return new(n+"c",new XAttribute("r",address+row),new XAttribute("t",numeric?"n":"s"),new XElement(n+"v",text));}
        for(int i=0;i<3;i++){var all=new[]{EmployeeStockWorkbook.Headers[i].Cast<object?>().ToArray()}.Concat(rows[i]);
            parts[$"xl/worksheets/sheet{i+1}.xml"]=new XElement(n+"worksheet",new XElement(n+"sheetData",all.Select((r,j)=>new XElement(n+"row",new XAttribute("r",j+1),r.Select((v,k)=>Cell(v,k+1,j+1)))))).ToString();}
        parts["xl/sharedStrings.xml"]=new XElement(n+"sst",strings.Select(s=>new XElement(n+"si",new XElement(n+"t",s)))).ToString();
        parts["_rels/.rels"]=$"<Relationships xmlns='{rel}'><Relationship Id='r1' Type='{dr}/officeDocument' Target='xl/workbook.xml'/></Relationships>";
        parts["xl/workbook.xml"]=$"<workbook xmlns='{ns}' xmlns:r='{dr}'><sheets>"+string.Concat(EmployeeStockWorkbook.Sheets.Select((s,i)=>$"<sheet name='{s}' sheetId='{i+1}' r:id='s{i+1}'/>"))+"</sheets></workbook>";
        parts["xl/_rels/workbook.xml.rels"]=$"<Relationships xmlns='{rel}'>"+string.Concat(Enumerable.Range(1,3).Select(i=>$"<Relationship Id='s{i}' Type='{dr}/worksheet' Target='worksheets/sheet{i}.xml'/>"))+$"<Relationship Id='strings' Type='{dr}/sharedStrings' Target='sharedStrings.xml'/></Relationships>";
        parts["[Content_Types].xml"]="<Types xmlns='http://schemas.openxmlformats.org/package/2006/content-types'><Default Extension='rels' ContentType='application/vnd.openxmlformats-package.relationships+xml'/><Default Extension='xml' ContentType='application/xml'/><Override PartName='/xl/workbook.xml' ContentType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'/><Override PartName='/xl/sharedStrings.xml' ContentType='application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml'/>"+string.Concat(Enumerable.Range(1,3).Select(i=>$"<Override PartName='/xl/worksheets/sheet{i}.xml' ContentType='application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml'/>"))+"</Types>";
        using var output=new MemoryStream();using(var zip=new ZipArchive(output,ZipArchiveMode.Create,true))foreach(var (name,xml) in parts){var entry=zip.CreateEntry(name,CompressionLevel.Optimal);entry.LastWriteTime=new(2000,1,1,0,0,0,TimeSpan.Zero);using var writer=new StreamWriter(entry.Open(),new UTF8Encoding(false));writer.Write(xml);}return output.ToArray();
    }
}
