using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Banking.Api.Data;
using Banking.Api.Providers;
using Banking.Api.Services;
using Microsoft.Extensions.DependencyInjection;

namespace Banking.Tests;

public sealed partial class EmployeeStockEndpointTests
{
    [Fact]
    public async Task GeneratedDemoUsesRealRetentionApprovalHistoryAndPrivateOriginalBoundary()
    {
        await using var h=new Host();await h.Init(retained:true);
        using(var scope=h.App.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<BankingDb>();db.Connections.Add(new(){Provider="product-demo",IsDemo=true});await db.SaveChangesAsync();}
        using var owner=h.Client();var privateUpload=await owner.PostAsync("/api/employee-stocks/uploads",Workbook());privateUpload.EnsureSuccessStatusCode();var privateId=(await privateUpload.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        using var demo=h.Client("Demo","Demo");var response=await demo.PostAsJsonAsync("/api/employee-stocks/demo/uploads",new{version="later"});response.EnsureSuccessStatusCode();var receipt=await response.Content.ReadFromJsonAsync<JsonElement>();var id=receipt.GetProperty("id").GetGuid();
        Assert.True(receipt.GetProperty("synthetic").GetBoolean());Assert.Equal("NeedsReview",receipt.GetProperty("status").GetString());Assert.True(response.Headers.CacheControl!.NoStore);
        var saved=await demo.PostAsJsonAsync($"/api/employee-stocks/demo/uploads/{id}/approve",new EmployeeStockApproval(receipt.GetProperty("version").GetString()!,EmployeeStockDemoTests.Review("later"),true,true));saved.EnsureSuccessStatusCode();var snapshot=(await saved.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("snapshotId").GetGuid();
        var history=await demo.GetFromJsonAsync<JsonElement>("/api/employee-stocks/demo/uploads");Assert.Equal(1,history.GetProperty("total").GetInt32());Assert.Single(history.GetProperty("development").EnumerateArray());Assert.Equal(42.5m,history.GetProperty("current").GetProperty("accepted").GetProperty("review").GetProperty("currentHeldShares").GetDecimal());
        var original=await demo.GetAsync($"/api/employee-stocks/demo/uploads/{id}/original");Assert.Equal(DemoEmployeeStockWorkbook.Create("later"),await original.Content.ReadAsByteArrayAsync());Assert.True(original.Headers.CacheControl!.NoStore);Assert.True(original.Headers.CacheControl.Private);Assert.Contains("sandbox",original.Headers.GetValues("Content-Security-Policy").Single());
        Assert.Equal(HttpStatusCode.NotFound,(await demo.GetAsync($"/api/employee-stocks/demo/uploads/{privateId}")).StatusCode);Assert.Equal(HttpStatusCode.NotFound,(await demo.GetAsync($"/api/employee-stocks/demo/uploads/{privateId}/original")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await owner.GetAsync($"/api/employee-stocks/uploads/{id}")).StatusCode);Assert.Equal(HttpStatusCode.NotFound,(await owner.GetAsync($"/api/employee-stocks/snapshots/{snapshot}")).StatusCode);
        foreach(var spec in new[]{(Role:(string?)null,Mode:"Demo",Code:401),(Role:"Demo",Mode:"Live",Code:403),(Role:"Owner",Mode:"Live",Code:403)}){
            using var visitor=h.Client(spec.Role,spec.Mode);
            foreach(var route in new[]{"uploads",$"uploads/{id}",$"uploads/{id}/original",$"snapshots/{snapshot}"})Assert.Equal(spec.Code,(int)(await visitor.GetAsync("/api/employee-stocks/demo/"+route)).StatusCode);
            Assert.Equal(spec.Code,(int)(await visitor.PostAsJsonAsync("/api/employee-stocks/demo/uploads",new{version="earlier"})).StatusCode);
        }
        using var noOrigin=h.Client("Demo","Demo",false);Assert.Equal(HttpStatusCode.Forbidden,(await noOrigin.PostAsJsonAsync("/api/employee-stocks/demo/uploads",new{version="middle"})).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,(await demo.PostAsJsonAsync("/api/employee-stocks/demo/uploads",new{version="arbitrary"})).StatusCode);
        Assert.Equal(HttpStatusCode.UnsupportedMediaType,(await demo.PostAsync("/api/employee-stocks/demo/uploads",Workbook())).StatusCode); // No raw Demo workbook upload route.
        Assert.Equal(HttpStatusCode.Forbidden,(await demo.PostAsync("/api/employee-stocks/uploads",Workbook())).StatusCode);
    }
}
