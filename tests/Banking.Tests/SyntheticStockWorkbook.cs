using System.Globalization;
using System.IO.Compression;
using System.Text;
using System.Xml.Linq;

namespace Banking.Tests;

// Independently fictional identities/awards/dates/quantities. Never derived from an owner export.
internal static class SyntheticStockWorkbook
{
    internal static readonly string[][] Headers = [
        ["Awardee ID","Last Name","First Name","Award ID","Award Date","Award Type","Awarded","Award Price","Vested","Unvested","Total Transacted","Expiration Date"],
        ["Awardee ID","Last Name","First Name","Award ID","Award Date","Award Type","Award Price","Vest Date","Vest Shares"],
        ["Awardee ID","Last Name","First Name","Transaction Date","Transaction Amt","Fair Market Value","Transaction Type","Award ID","Award Date","Award Type","Award Price","Taxable Spread","Federal Tax %","Federal Tax Amt","Federal Sup Tax %","Federal Sup Tax Amt","Medicare Tax%","Medicare Tax Amt","Social Security Tax %","Social Security Tax Amt","State Tax %","State Tax Amt","State 2 Tax %","State 2 Tax Amt","State Other Tax Amt","Local 1 Tax %","Local 1 Tax Amt","Local 2 Tax %","Local 2 Tax Amt","Local 3 Tax %","Local 3 Tax Amt","Local 4 Tax %","Local 4 Tax Amt","Local 5 Tax %","Local 5 Tax Amt","Local 6 Tax %","Local 6 Tax Amt","SUI Tax %","SUI Tax Amt ","SDI Tax %","SDI Tax Amt ","US Other Tax Amt","Non-US Income Tax %","Non-US Income Tax Amt ","Non-US Misc. 1 Tax %","Non-US Misc. 1 Tax Amt","Non-US Social Tax %","Non-US Social Tax Amt","Non-US Misc. 2 Tax % ","Non-US Misc. 2 Tax Amt","Non-US Other Tax Amt","Total Taxes","Shares For Taxes","Net Shares","SA Broker/Trustee Name","Award Country","Transaction Country","Award Co. Income %","Awarded Country Source Income","Awarded Country Tax Due","Transaction Country Tax Due","Award State","Transaction State","Award State Income %","Award State Source Income","Award State Tax Paid","Transaction State Tax Paid"]
    ];
    internal static object?[][][] Rows()
    {
        object?[] Tx(string award, string date, decimal qty, decimal withheld, decimal net, string grantDate, string kind)
        {
            var row = new object?[67]; row[0]="00007321";row[1]="FictionalFamily";row[2]="FictionalGiven";
            row[3]=date;row[4]=qty;row[5]=218.75m;row[6]="Stock Award Vest";row[7]=award;row[8]=grantDate;row[9]=kind;row[10]=0m;row[11]=qty*218.75m;row[51]=0m;row[52]=withheld;row[53]=net;row[54]="Fictional Custodian";return row;
        }
        return [
            [ ["00007321","FictionalFamily","FictionalGiven","00004123","2024-02-29","On-Hire",40.5m,0m,10.125m,30.375m,10.125m,null],
              ["00007321","FictionalFamily","FictionalGiven","00004124","2024-11-30","Annual SA",75m,0m,15m,60m,15m,null] ],
            [ ["00007321","FictionalFamily","FictionalGiven","00004123","2024-02-29","On-Hire",0m,"2026-02-28",10.125m],
              ["00007321","FictionalFamily","FictionalGiven","00004123","2024-02-29","On-Hire",0m,"2027-02-28",10.125m],
              ["00007321","FictionalFamily","FictionalGiven","00004123","2024-02-29","On-Hire",0m,"2028-02-28",20.25m],
              ["00007321","FictionalFamily","FictionalGiven","00004124","2024-11-30","Annual SA",0m,"2025-11-30",15m],
              ["00007321","FictionalFamily","FictionalGiven","00004124","2024-11-30","Annual SA",0m,"2026-11-30",15m],
              ["00007321","FictionalFamily","FictionalGiven","00004124","2024-11-30","Annual SA",0m,"2027-11-30",15m],
              ["00007321","FictionalFamily","FictionalGiven","00004124","2024-11-30","Annual SA",0m,"2028-11-30",15m],
              ["00007321","FictionalFamily","FictionalGiven","00004124","2024-11-30","Annual SA",0m,"2029-11-30",15m] ],
            [ Tx("00004123","2026-03-02",10.125m,2.125m,8m,"2024-02-29","On-Hire"),
              Tx("00004124","2025-12-01",15m,3m,12m,"2024-11-30","Annual SA") ] ];
    }
    internal static byte[] Create(Action<object?[][][]>? change = null, Action<Dictionary<string,string>>? package = null)
    {
        var rows=Rows();change?.Invoke(rows);var parts=new Dictionary<string,string>();
        const string ns="http://schemas.openxmlformats.org/spreadsheetml/2006/main", rel="http://schemas.openxmlformats.org/package/2006/relationships", dr="http://schemas.openxmlformats.org/officeDocument/2006/relationships";
        XNamespace n=ns;
        var shared=new List<string>();
        XElement Cell(object? value,int column,int row)
        {
            string address="";for(int c=column;c>0;c=(c-1)/26)address=(char)('A'+(c-1)%26)+address;
            if(value is null)return new XElement(n+"c",new XAttribute("r",address+row));
            bool numeric=value is decimal or int;
            var text=numeric?Convert.ToString(value,CultureInfo.InvariantCulture)!:value.ToString()!;
            if(!numeric){if(!shared.Contains(text))shared.Add(text);text=shared.IndexOf(text).ToString(CultureInfo.InvariantCulture);}
            return new XElement(n+"c",new XAttribute("r",address+row),new XAttribute("t",numeric?"n":"s"),new XElement(n+"v",text));
        }
        for(int s=0;s<3;s++)
        {
            var all=new[]{Headers[s].Cast<object?>().ToArray()}.Concat(rows[s]).ToArray();
            parts[$"xl/worksheets/sheet{s+1}.xml"]=new XDocument(new XElement(n+"worksheet",new XElement(n+"sheetData",all.Select((r,i)=>new XElement(n+"row",new XAttribute("r",i+1),r.Select((v,j)=>Cell(v,j+1,i+1))))))).ToString();
        }
        parts["xl/sharedStrings.xml"]=new XElement(n+"sst",shared.Select(s=>new XElement(n+"si",new XElement(n+"t",s)))).ToString();
        parts["_rels/.rels"]=$"<Relationships xmlns='{rel}'><Relationship Id='r1' Type='{dr}/officeDocument' Target='xl/workbook.xml'/></Relationships>";
        parts["xl/workbook.xml"]=$"<workbook xmlns='{ns}' xmlns:r='{dr}'><sheets><sheet name='Award Summary' sheetId='1' r:id='s1'/><sheet name='Vest Schedules' sheetId='2' r:id='s2'/><sheet name='Transactions' sheetId='3' r:id='s3'/></sheets></workbook>";
        parts["xl/_rels/workbook.xml.rels"]=$"<Relationships xmlns='{rel}'>"+string.Concat(Enumerable.Range(1,3).Select(i=>$"<Relationship Id='s{i}' Type='{dr}/worksheet' Target='worksheets/sheet{i}.xml'/>"))+"</Relationships>";
        parts["[Content_Types].xml"]="<Types xmlns='http://schemas.openxmlformats.org/package/2006/content-types'><Default Extension='xml' ContentType='application/xml'/></Types>";
        package?.Invoke(parts);
        using var output=new MemoryStream();using(var zip=new ZipArchive(output,ZipArchiveMode.Create,true))foreach(var (name,xml) in parts){using var writer=new StreamWriter(zip.CreateEntry(name).Open(),new UTF8Encoding(false));writer.Write(xml);}return output.ToArray();
    }
}
