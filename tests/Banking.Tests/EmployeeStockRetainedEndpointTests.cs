using System.Net;
using System.Net.Http.Json;
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
        var response=await c.PostAsync("/api/employee-stocks/uploads",Workbook());var first=await response.Content.ReadFromJsonAsync<JsonElement>();var id=first.GetProperty("id").GetGuid();
        var parsed=await c.PostAsJsonAsync($"/api/employee-stocks/uploads/{id}/parse",new{version=first.GetProperty("version").GetString()});parsed.EnsureSuccessStatusCode();var fresh=await parsed.Content.ReadFromJsonAsync<JsonElement>();
        var stale=new EmployeeStockApproval(first.GetProperty("version").GetString()!,EmployeeStockHistoryTests.Review(),true,true);
        Assert.Equal(HttpStatusCode.Conflict,(await c.PostAsJsonAsync($"/api/employee-stocks/uploads/{id}/approve",stale)).StatusCode);
        var history=await c.GetFromJsonAsync<JsonElement>("/api/employee-stocks/uploads");Assert.Empty(history.GetProperty("development").EnumerateArray());
        var saved=await c.PostAsJsonAsync($"/api/employee-stocks/uploads/{id}/approve",stale with{Version=fresh.GetProperty("version").GetString()!});saved.EnsureSuccessStatusCode();var snapshot=(await saved.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("snapshotId").GetGuid();
        var second=await c.PostAsync("/api/employee-stocks/uploads",Workbook());var duplicate=await second.Content.ReadFromJsonAsync<JsonElement>();
        var linked=await c.PostAsJsonAsync($"/api/employee-stocks/uploads/{duplicate.GetProperty("id").GetGuid()}/link",new EmployeeStockReuse(duplicate.GetProperty("version").GetString()!,snapshot,true));linked.EnsureSuccessStatusCode();
        history=await c.GetFromJsonAsync<JsonElement>("/api/employee-stocks/uploads");Assert.Equal(2,history.GetProperty("items").GetArrayLength());Assert.Single(history.GetProperty("development").EnumerateArray());
    }
}
