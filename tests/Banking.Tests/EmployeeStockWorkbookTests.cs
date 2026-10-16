using Banking.Api.Services;
using System.Text.Json;
using Banking.Api;
using Banking.Api.Providers;

namespace Banking.Tests;

public sealed class EmployeeStockWorkbookTests
{
    [Fact]
    public void RealisticThreeTabSharedStringExportPreservesFactsAndDoesNotInferHoldings()
    {
        var report=EmployeeStockWorkbook.Parse(SyntheticStockWorkbook.Create());
        Assert.Equal(2,report.Grants.Length);Assert.Equal(8,report.Schedules.Length);Assert.Equal(2,report.Transactions.Length);
        Assert.Equal(25.125m,report.Grants.Sum(g=>g.Vested));Assert.Equal(90.375m,report.Grants.Sum(g=>g.Unvested));
        Assert.Equal(20m,report.Transactions.Sum(t=>t.NetShares));Assert.All(report.Grants,g=>Assert.Equal(0,g.GrantPrice));
        Assert.Null(report.ReportAsOf);Assert.Null(report.ReportedCurrency);Assert.Null(report.CurrentHeldShares);Assert.Null(report.CurrentPrice);Assert.Null(report.DkkPerUsd);
        Assert.DoesNotContain(report.Warnings,w=>w.Code.Contains("DIFFER")||w.Code.Contains("REQUIRES_REVIEW"));
        var first=report.Schedules.Single(s=>s.Date==new DateOnly(2026,2,28));Assert.Equal(10.125m,first.MatchedPastVesting);
        Assert.Equal(new DateOnly(2026,3,2),report.Transactions.Single(t=>t.GrantKey==first.GrantKey).Date);
        Assert.Equal(new DateOnly(2029,11,30),report.Schedules.Max(s=>s.Date)); // five-year grant schedule is never truncated
        Assert.Contains(report.Schedules,s=>s.Date<new DateOnly(2026,10,16)&&s.MatchedPastVesting>0);
        var json=JsonSerializer.Serialize(report,new JsonSerializerOptions(JsonSerializerDefaults.Web));
        foreach(var privateValue in new[]{"FictionalFamily","FictionalGiven","00007321","00004123","00004124","Fictional Custodian"})Assert.DoesNotContain(privateValue,json);
        Assert.DoesNotContain("awardeeId",json);Assert.DoesNotContain("awardId",json);Assert.DoesNotContain("original",json);
        Assert.Equal("Award Summary",report.Grants[0].Source.Sheet);Assert.Equal(2,report.Grants[0].Source.Row);
    }
    [Fact]
    public void SplitTransactionsMatchCumulativeQuantityWithoutExactDateEquality()
    {
        var report=EmployeeStockWorkbook.Parse(SyntheticStockWorkbook.Create(rows=>{
            var original=rows[2][0];var extra=(object?[])original.Clone();original[4]=5m;original[52]=1m;original[53]=4m;
            extra[4]=5.125m;extra[52]=1.125m;extra[53]=4m;rows[2]=[original,extra,rows[2][1]];
        }));Assert.Equal(10.125m,report.Schedules[0].MatchedPastVesting);
    }
    [Fact]
    public void UnknownTypesAndDiscrepanciesAreWarningsNeverBalancingEntries()
    {
        var report=EmployeeStockWorkbook.Parse(SyntheticStockWorkbook.Create(rows=>{rows[0][0][6]=41m;rows[2][0][6]="SECRET_UNSUPPORTED_SALE";}));
        Assert.Contains(report.Warnings,w=>w.Code=="AWARD_QUANTITIES_DIFFER");Assert.Contains(report.Warnings,w=>w.Code=="TRANSACTION_TYPE_UNSUPPORTED");
        Assert.Equal(0,report.Schedules[0].MatchedPastVesting);Assert.Equal("Unsupported",report.Transactions[0].Type);
        Assert.DoesNotContain("SECRET_UNSUPPORTED_SALE",JsonSerializer.Serialize(report));
    }
    [Theory]
    [InlineData("mixed","STOCK_MIXED_AWARDEES")][InlineData("date","STOCK_DATE_INVALID")][InlineData("precision","STOCK_NUMBER_INVALID")]
    [InlineData("negative","STOCK_NUMBER_INVALID")][InlineData("duplicate","STOCK_DUPLICATE_GRANT")][InlineData("leading","STOCK_UNMATCHED_GRANT")]
    public void RejectsInvalidFactsWithFixedErrors(string kind,string code)
    {
        var bytes=SyntheticStockWorkbook.Create(rows=>{switch(kind){case "mixed":rows[2][0][0]="SECRET_SECOND_PERSON";break;case "date":rows[0][0][4]="not-date-SECRET";break;case "precision":rows[0][0][6]=1.000000001m;break;case "negative":rows[0][0][6]=-1m;break;case "duplicate":rows[0]=[rows[0][0],rows[0][0]];break;case "leading":rows[1][0][3]="4123";break;}});
        Assert.Equal(code,Assert.Throws<ApiFailure>(()=>EmployeeStockWorkbook.Parse(bytes)).Code);
    }
    [Theory]
    [InlineData("formula")][InlineData("external")][InlineData("traversal")][InlineData("macro")][InlineData("dtd")][InlineData("headers")][InlineData("duplicate-cell")][InlineData("deep")][InlineData("expansion")][InlineData("boolean")]
    public void RejectsHostilePackagesWithoutLeakingContent(string kind)
    {
        var bytes=SyntheticStockWorkbook.Create(package:p=>{switch(kind){
            case "formula":p["xl/worksheets/sheet1.xml"]=p["xl/worksheets/sheet1.xml"].Replace("</sheetData>","<row r='99'><c r='A99'><f>SECRET()</f><v>1</v></c></row></sheetData>");break;
            case "external":p["xl/_rels/workbook.xml.rels"]=p["xl/_rels/workbook.xml.rels"].Replace("Target=", "TargetMode='External' Target=");break;
            case "traversal":p["../SECRET.xml"]="<x/>";break;case "macro":p["xl/vbaProject.bin"]="SECRET";break;
            case "dtd":p["xl/sharedStrings.xml"]="<!DOCTYPE x [<!ENTITY e SYSTEM 'file:///SECRET'>]><x>&e;</x>";break;
            case "headers":p["xl/sharedStrings.xml"]=p["xl/sharedStrings.xml"].Replace("Awarded", "SECRET");break;
            case "duplicate-cell":p["xl/worksheets/sheet1.xml"]=p["xl/worksheets/sheet1.xml"].Replace("</sheetData>","<row r='99'><c r='A99'><v>1</v></c><c r='A99'><v>2</v></c></row></sheetData>");break;
            case "deep":p["docProps/extra.xml"]=string.Concat(Enumerable.Repeat("<x>",40))+string.Concat(Enumerable.Repeat("</x>",40));break;
            case "expansion":p["docProps/extra.xml"]="<x>"+new string('a',1000000)+"</x>";break;
            case "boolean":p["xl/worksheets/sheet1.xml"]=p["xl/worksheets/sheet1.xml"].Replace("t=\"n\"","t=\"b\"");break;
        }});
        var failure=Assert.Throws<ApiFailure>(()=>EmployeeStockWorkbook.Parse(bytes));Assert.StartsWith("STOCK_",failure.Code);Assert.DoesNotContain("SECRET",failure.Message);
    }
    [Fact]
    public void ByteAndCancellationBoundsAreEnforced()
    {
        Assert.Equal("STOCK_FILE_TOO_LARGE",Assert.Throws<ApiFailure>(()=>EmployeeStockWorkbook.Parse(new byte[EmployeeStockWorkbook.MaxBytes+1])).Code);
        using var cancelled=new CancellationTokenSource();cancelled.Cancel();Assert.Throws<OperationCanceledException>(()=>EmployeeStockWorkbook.Parse(SyntheticStockWorkbook.Create(),cancelled.Token));
    }
    [Fact]
    public void MissingAndReportedZeroStayDistinct()
    {
        var report=EmployeeStockWorkbook.Parse(SyntheticStockWorkbook.Create(rows=>rows[2][0][51]=null));
        Assert.Null(report.Transactions[0].ReportedTaxes);Assert.Equal(0,report.Transactions[1].ReportedTaxes);
    }
    [Fact]
    public void ExportsOnlySyntheticBrowserFixturesWhenRequested()
    {
        var target=Environment.GetEnvironmentVariable("STOCK_BROWSER_FIXTURE");if(string.IsNullOrEmpty(target))return;
        Directory.CreateDirectory(target);var bytes=SyntheticStockWorkbook.Create();var report=EmployeeStockWorkbook.Parse(bytes);
        File.WriteAllBytes(Path.Combine(target,"synthetic.xlsx"),bytes);
        File.WriteAllText(Path.Combine(target,"report.json"),JsonSerializer.Serialize(report,new JsonSerializerOptions(JsonSerializerDefaults.Web)));
    }
    [Fact]
    public void AcceptsPackageAbsoluteLocalSheetTargetsWithoutNetworkResolution()
    {
        var report=EmployeeStockWorkbook.Parse(SyntheticStockWorkbook.Create(package:p=>p["xl/_rels/workbook.xml.rels"]=p["xl/_rels/workbook.xml.rels"].Replace("Target='worksheets/","Target='/xl/worksheets/")));
        Assert.Equal(2,report.Grants.Length);
    }
    [Theory]
    [InlineData("entries")][InlineData("string")][InlineData("row")]
    public void PackageStringAndRowLimitsRejectBeforeUnboundedWork(string kind)
    {
        var bytes=SyntheticStockWorkbook.Create(package:p=>{
            if(kind=="entries")for(int i=0;i<260;i++)p[$"docProps/part{i}.xml"]="<x/>";
            if(kind=="string")p["xl/sharedStrings.xml"]=p["xl/sharedStrings.xml"].Replace("FictionalFamily",new string('z',4097));
            if(kind=="row")p["xl/worksheets/sheet1.xml"]=p["xl/worksheets/sheet1.xml"].Replace("r=\"2\"","r=\"100001\"");
        });
        Assert.StartsWith("STOCK_",Assert.Throws<ApiFailure>(()=>EmployeeStockWorkbook.Parse(bytes)).Code);
    }
}
