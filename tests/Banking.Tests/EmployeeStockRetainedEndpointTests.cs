using System.Net;
using System.Net.Http.Json;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text.Json;
using Banking.Api.Services;

namespace Banking.Tests;

public sealed partial class EmployeeStockEndpointTests
{
    [Fact]
    public async Task RetainedOwnerFlowProtectsPrivateIdsOriginalsHistoryAndAllMutationRoutes()
    {
        await using var host=new Host();await host.Init(retained:true);using var owner=host.Client();var bytes=SyntheticStockWorkbook.Create();
        var uploaded=await owner.PostAsync("/api/employee-stocks/uploads",Workbook(bytes));uploaded.EnsureSuccessStatusCode();var receipt=await uploaded.Content.ReadFromJsonAsync<JsonElement>();
        var id=receipt.GetProperty("id").GetGuid();var original=await owner.GetAsync($"/api/employee-stocks/uploads/{id}/original");
        Assert.Equal(bytes,await original.Content.ReadAsByteArrayAsync());Assert.True(original.Headers.CacheControl!.NoStore);Assert.True(original.Headers.CacheControl.Private);
        Assert.Contains("sandbox",original.Headers.GetValues("Content-Security-Policy").Single());Assert.Equal("attachment",original.Content.Headers.ContentDisposition!.DispositionType);
        var input=new EmployeeStockApproval(receipt.GetProperty("version").GetString()!,EmployeeStockHistoryTests.Review(),true,true);
        var approved=await owner.PostAsJsonAsync($"/api/employee-stocks/uploads/{id}/approve",input);approved.EnsureSuccessStatusCode();var saved=await approved.Content.ReadFromJsonAsync<JsonElement>();var snapshot=saved.GetProperty("snapshotId").GetGuid();
        foreach(var spec in new[]{(Role:(string?)null,Mode:"Live",Code:401),(Role:"Demo",Mode:"Demo",Code:403),(Role:"Demo",Mode:"Live",Code:403),(Role:"Owner",Mode:"Demo",Code:403)}){
            using var visitor=host.Client(spec.Role,spec.Mode);
            foreach(var route in new[]{"uploads",$"uploads/{id}",$"uploads/{id}/original",$"snapshots/{snapshot}"})Assert.Equal(spec.Code,(int)(await visitor.GetAsync("/api/employee-stocks/"+route)).StatusCode);
            foreach(var action in new[]{"parse","reject","link","approve"})Assert.Equal(spec.Code,(int)(await visitor.PostAsJsonAsync($"/api/employee-stocks/uploads/{id}/{action}",new{version=receipt.GetProperty("version").GetString(),confirm=true,snapshotId=snapshot})).StatusCode);
            Assert.Equal(spec.Code,(int)(await visitor.PostAsync("/api/employee-stocks/uploads",Workbook())).StatusCode);
        }
        using var crossOrigin=host.Client(origin:false);Assert.Equal(HttpStatusCode.Forbidden,(await crossOrigin.PostAsJsonAsync($"/api/employee-stocks/uploads/{id}/reject",new{version="invalid"})).StatusCode);
        var history=await owner.GetFromJsonAsync<JsonElement>("/api/employee-stocks/uploads");Assert.Equal(1,history.GetProperty("items").GetArrayLength());Assert.Equal(1,history.GetProperty("development").GetArrayLength());
        var readOnly=await owner.GetFromJsonAsync<JsonElement>($"/api/employee-stocks/uploads/{id}");
        foreach(var forbidden in new[]{"protectedOriginal","previewJson","dataJson","sourceIdentityKey","hash","00007321","FictionalFamily"})Assert.DoesNotContain(forbidden,readOnly.GetRawText());
        Assert.Equal(HttpStatusCode.BadRequest,(await owner.PostAsJsonAsync($"/api/employee-stocks/uploads/{id}/parse",new{version=readOnly.GetProperty("version").GetString()})).StatusCode);
    }
    [Fact]
    public async Task StaleReviewIsRejectedAndExplicitDuplicateLinkKeepsOneCanonicalPoint()
    {
        await using var h=new Host();await h.Init(retained:true);using var c=h.Client();
        // Identical-file reuse requires identical ZIP bytes, not freshly generated equivalent XML with new timestamps.
        var bytes=SyntheticStockWorkbook.Create();var response=await c.PostAsync("/api/employee-stocks/uploads",Workbook(bytes));response.EnsureSuccessStatusCode();var first=await response.Content.ReadFromJsonAsync<JsonElement>();var id=first.GetProperty("id").GetGuid();
        var parsed=await c.PostAsJsonAsync($"/api/employee-stocks/uploads/{id}/parse",new{version=first.GetProperty("version").GetString()});parsed.EnsureSuccessStatusCode();var fresh=await parsed.Content.ReadFromJsonAsync<JsonElement>();
        var stale=new EmployeeStockApproval(first.GetProperty("version").GetString()!,EmployeeStockHistoryTests.Review(),true,true);
        Assert.Equal(HttpStatusCode.Conflict,(await c.PostAsJsonAsync($"/api/employee-stocks/uploads/{id}/approve",stale)).StatusCode);
        var history=await c.GetFromJsonAsync<JsonElement>("/api/employee-stocks/uploads");Assert.Empty(history.GetProperty("development").EnumerateArray());
        var saved=await c.PostAsJsonAsync($"/api/employee-stocks/uploads/{id}/approve",stale with{Version=fresh.GetProperty("version").GetString()!});saved.EnsureSuccessStatusCode();var snapshot=(await saved.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("snapshotId").GetGuid();
        var second=await c.PostAsync("/api/employee-stocks/uploads",Workbook(bytes));second.EnsureSuccessStatusCode();var duplicate=await second.Content.ReadFromJsonAsync<JsonElement>();
        var linked=await c.PostAsJsonAsync($"/api/employee-stocks/uploads/{duplicate.GetProperty("id").GetGuid()}/link",new EmployeeStockReuse(duplicate.GetProperty("version").GetString()!,snapshot,true));
        Assert.True(linked.IsSuccessStatusCode,$"Synthetic duplicate link status={(int)linked.StatusCode}; body={await linked.Content.ReadAsStringAsync()}");
        history=await c.GetFromJsonAsync<JsonElement>("/api/employee-stocks/uploads");Assert.Equal(2,history.GetProperty("items").GetArrayLength());Assert.Single(history.GetProperty("development").EnumerateArray());
    }
    [Fact]
    public async Task ZipTimestampChangesCannotLinkAnotherOriginalSnapshotButExactBytesCan()
    {
        var seed=SyntheticStockWorkbook.Create();var timestamp=new DateTimeOffset(2000,2,3,4,5,6,TimeSpan.Zero);
        var original=WithZipTimestamp(seed,timestamp);var repacked=WithZipTimestamp(seed,timestamp.AddSeconds(2));
        Assert.False(SHA256.HashData(original).SequenceEqual(SHA256.HashData(repacked)));
        Assert.True(SameParts(original,repacked),"Only ZIP metadata differs; synthetic XML parts must remain identical.");
        await using var h=new Host();await h.Init(retained:true);using var c=h.Client();
        var response=await c.PostAsync("/api/employee-stocks/uploads",Workbook(original));response.EnsureSuccessStatusCode();var first=await response.Content.ReadFromJsonAsync<JsonElement>();
        var saved=await c.PostAsJsonAsync($"/api/employee-stocks/uploads/{first.GetProperty("id").GetGuid()}/approve",
            new EmployeeStockApproval(first.GetProperty("version").GetString()!,EmployeeStockHistoryTests.Review(),true,true));saved.EnsureSuccessStatusCode();
        var snapshot=(await saved.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("snapshotId").GetGuid();
        var different=await c.PostAsync("/api/employee-stocks/uploads",Workbook(repacked));different.EnsureSuccessStatusCode();var receipt=await different.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(JsonValueKind.Null,receipt.GetProperty("existingApproval").ValueKind);
        var denied=await c.PostAsJsonAsync($"/api/employee-stocks/uploads/{receipt.GetProperty("id").GetGuid()}/link",
            new EmployeeStockReuse(receipt.GetProperty("version").GetString()!,snapshot,true));
        Assert.Equal(HttpStatusCode.NotFound,denied.StatusCode);
        Assert.Equal("STOCK_SNAPSHOT_NOT_FOUND",(await denied.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("error").GetString());
        var unchanged=await c.GetFromJsonAsync<JsonElement>($"/api/employee-stocks/uploads/{receipt.GetProperty("id").GetGuid()}");
        Assert.Equal("NeedsReview",unchanged.GetProperty("status").GetString());Assert.Equal(JsonValueKind.Null,unchanged.GetProperty("snapshotId").ValueKind);
        Assert.Equal(repacked,await c.GetByteArrayAsync($"/api/employee-stocks/uploads/{receipt.GetProperty("id").GetGuid()}/original"));
        var repeated=await c.PostAsync("/api/employee-stocks/uploads",Workbook(original));repeated.EnsureSuccessStatusCode();var duplicate=await repeated.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(snapshot,duplicate.GetProperty("existingApproval").GetProperty("id").GetGuid());
        var linked=await c.PostAsJsonAsync($"/api/employee-stocks/uploads/{duplicate.GetProperty("id").GetGuid()}/link",
            new EmployeeStockReuse(duplicate.GetProperty("version").GetString()!,snapshot,true));linked.EnsureSuccessStatusCode();
        var result=await linked.Content.ReadFromJsonAsync<JsonElement>();Assert.True(result.GetProperty("duplicate").GetBoolean());Assert.False(result.GetProperty("wealthUpdated").GetBoolean());
        var history=await c.GetFromJsonAsync<JsonElement>("/api/employee-stocks/uploads");Assert.Equal(3,history.GetProperty("items").GetArrayLength());Assert.Single(history.GetProperty("development").EnumerateArray());
    }
    static byte[] WithZipTimestamp(byte[] source,DateTimeOffset timestamp)
    {
        using var output=new MemoryStream();output.Write(source);
        using(var zip=new ZipArchive(output,ZipArchiveMode.Update,true))foreach(var entry in zip.Entries)entry.LastWriteTime=timestamp;
        return output.ToArray();
    }
    static bool SameParts(byte[] first,byte[] second)
    {
        using var a=new ZipArchive(new MemoryStream(first));using var b=new ZipArchive(new MemoryStream(second));
        return a.Entries.Select(e=>e.FullName).SequenceEqual(b.Entries.Select(e=>e.FullName))&&a.Entries.All(entry=>{
            using var x=entry.Open();using var y=b.GetEntry(entry.FullName)!.Open();using var left=new MemoryStream();using var right=new MemoryStream();x.CopyTo(left);y.CopyTo(right);return left.ToArray().SequenceEqual(right.ToArray());});
    }
}
