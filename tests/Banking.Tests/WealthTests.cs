using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Banking.Api.Data;
using Banking.Api.Providers;
using Banking.Api.Services;
using Microsoft.Extensions.DependencyInjection;
using static Banking.Tests.BackendTests;

namespace Banking.Tests;

public sealed class WealthTests
{
    [Fact]
    public async Task Overview_demo_visuals_reconcile_and_never_leak_into_live()
    {
        await using var app = new BackendFactory(secondWorkspace:true);
        using var demo = app.AuthClient(); using var live = app.AuthClient();
        live.DefaultRequestHeaders.Add("X-Banking-Mode", "Live");
        try {
            await demo.PostAsJsonAsync("/api/wealth", new WealthInput("Demo investments", "Fictional", "Investment", 125000, "DKK", new(2026,1,1), "Demo"));
            await demo.PostAsJsonAsync("/api/wealth", new WealthInput("Demo pension", "Fictional", "Pension", 510000, "DKK", new(2026,1,1), "Demo"));
            var result = await Read(await demo.GetAsync("/api/wealth/overview?currency=DKK"));
            var visuals = result.GetProperty("visuals");
            Assert.True(visuals.GetProperty("synthetic").GetBoolean());
            var history = visuals.GetProperty("investment").GetProperty("history").EnumerateArray().ToArray();
            Assert.Equal(125000m, history[^1].GetProperty("value").GetDecimal());
            var pension = visuals.GetProperty("pension");
            Assert.Equal(510000m, pension.GetProperty("contributions").GetDecimal()+pension.GetProperty("returns").GetDecimal());
            var trends = visuals.GetProperty("metricTrendFactors").EnumerateArray().ToArray();
            Assert.Equal(7, trends.Length);
            Assert.All(trends, trend => Assert.Equal(1m, trend.EnumerateArray().Last().GetDecimal()));
            Assert.Empty((await Read(await demo.GetAsync("/api/wealth/overview?currency=EUR"))).GetProperty("visuals").GetProperty("investment").GetProperty("history").EnumerateArray());
            Assert.Equal(JsonValueKind.Null,(await Read(await live.GetAsync("/api/wealth/overview?currency=DKK"))).GetProperty("visuals").ValueKind);
        } finally { await app.Cleanup(); }
    }
    [Fact]
    public async Task Research_is_scoped_versioned_and_rejects_unsafe_links_and_invalid_oauth_state()
    {
        await using var app=new BackendFactory(secondWorkspace:true);using var demo=app.AuthClient();using var live=app.AuthClient();live.DefaultRequestHeaders.Add("X-Banking-Mode","Live");
        try{
            var input=new ResearchInput("Example company","TEST","Check annual report","https://example.com/research");
            var row=await Read(await demo.PostAsJsonAsync("/api/research",input));var id=row.GetProperty("id").GetGuid();var version=row.GetProperty("version").GetString();
            Assert.Empty((await Read(await live.GetAsync("/api/research"))).EnumerateArray());
            Assert.True((await demo.PutAsJsonAsync($"/api/research/{id}",input with{Notes="Updated notes",Version=version})).IsSuccessStatusCode);
            Assert.Equal(HttpStatusCode.Conflict,(await demo.PutAsJsonAsync($"/api/research/{id}",input with{Version=version})).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest,(await demo.PostAsJsonAsync("/api/research",input with{Url="javascript:alert(1)"})).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest,(await demo.PostAsJsonAsync("/api/research",input with{Url="https://user:secret@example.com"})).StatusCode);
            Assert.False((await demo.GetAsync("/api/saxo/auth/callback?state=unknown&code=invalid")).IsSuccessStatusCode);
            var status=await Read(await demo.GetAsync("/api/investments/saxo/status"));Assert.Equal(JsonValueKind.Object,status.GetProperty("setup").ValueKind);
        }finally{await app.Cleanup();}
    }
    [Fact]
    public void Pension_import_is_case_insensitive_drops_personal_metadata_and_does_not_sum_insurance()
    {
        var result=JsonSerializer.SerializeToElement(PensionStatement.Preview(JsonSerializer.Deserialize<JsonElement>("""
        {"header":{"SocialSecurityNumber":"never retain"},"pensionproviders":[{"pensionprovidername":"PFA","currencycode":"DKK","schemes":[
        {"referencenumber":"1234567890","savedvalue":200000,"savedvaluedate":"2026-01-01T00:00:00","benefits":[{"Risk":{"Amount":9000000}}]},
        {"savedvalue":null,"savedvaluedate":"2026-01-01"},{"savedvalue":0,"savedvaluedate":"2026-01-01","benefits":[{"Risk":{"Amount":500000}}]}]}]}
        """)));
        Assert.Single(result.GetProperty("rows").EnumerateArray());Assert.Equal(2,result.GetProperty("skipped").GetInt32());
        Assert.DoesNotContain("never retain",result.GetRawText());Assert.DoesNotContain("1234567890",result.GetRawText());
        Assert.False(result.GetProperty("saved").GetBoolean());
    }
    [Fact]
    public void Saxo_mapping_preserves_unknowns_and_never_adds_cash_to_total()
    {
        var result=JsonSerializer.SerializeToElement(SaxoReadClient.Map(
            JsonSerializer.Deserialize<JsonElement>("""{"Currency":"DKK","CashBalance":100,"TotalValue":350,"CalculationReliability":"Ok"}"""),
            JsonSerializer.Deserialize<JsonElement>("""{"Data":[{"PositionBase":{"Uic":1,"Amount":2},"PositionView":{"CurrentPrice":null}}],"__next":"https://untrusted.example/next"}"""),DateTimeOffset.UtcNow));
        Assert.Equal(350,result.GetProperty("totalValue").GetDecimal());Assert.True(result.GetProperty("simulation").GetBoolean());
        Assert.True(result.GetProperty("hasMore").GetBoolean());Assert.Equal(JsonValueKind.Null,result.GetProperty("positions")[0].GetProperty("price").ValueKind);
    }
    [Fact]
    public async Task Statements_update_without_double_counting_and_scenarios_do_not_become_debt()
    {
        await using var app=new BackendFactory(secondWorkspace:true);using var demo=app.AuthClient();using var live=app.AuthClient();live.DefaultRequestHeaders.Add("X-Banking-Mode","Live");
        try{
            var input=new WealthInput("PFA statement","PFA","Pension",200000,"DKK",new(2026,1,1),"Synthetic test statement",120000,70);
            var row=await Read(await demo.PostAsJsonAsync("/api/wealth",input));var id=row.GetProperty("id").GetGuid();
            Assert.Equal(HttpStatusCode.Conflict,(await demo.PostAsJsonAsync("/api/wealth",input with{AsOf=new(2026,2,1)})).StatusCode);
            Assert.True((await demo.PutAsJsonAsync($"/api/wealth/{id}",input with{Value=210000,Version=row.GetProperty("version").GetString()})).IsSuccessStatusCode);
            Assert.Empty((await Read(await live.GetAsync("/api/wealth"))).EnumerateArray());
            Assert.Equal(HttpStatusCode.BadRequest,(await demo.PostAsJsonAsync("/api/wealth",input with{Name="Bad",AnnualPension=null})).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden,(await demo.PostAsJsonAsync("/api/investments/saxo/connect?environment=LIVE",new{})).StatusCode);
            await demo.PostAsJsonAsync("/api/loans",new LoanInput("Possible loan",100000,4,120,new(2026,1,1)));
            var summary=await Read(await demo.GetAsync("/api/wealth/summary?currency=DKK"));
            Assert.Equal(210000,summary.GetProperty("pension").GetDecimal());Assert.Equal(0,summary.GetProperty("debt").GetDecimal());
            Assert.Equal(JsonValueKind.Null,summary.GetProperty("recordedNetWealth").ValueKind);
            Assert.Equal(0,(await Read(await demo.GetAsync("/api/wealth/summary?currency=EUR"))).GetProperty("pension").GetDecimal());
        }finally{await app.Cleanup();}
    }
}
