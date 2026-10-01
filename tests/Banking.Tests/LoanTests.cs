using System.Net;
using System.Net.Http.Json;
using Banking.Api.Services;
using static Banking.Tests.BackendTests;

namespace Banking.Tests;

public sealed class LoanTests
{
    static LoanInput Example => new("House planning", 1_000_000m, 4m, 360, new(2026, 9, 13), MonthlyFee: 25, UpfrontFee: 1000);
    [Fact]
    public void Amortization_reconciles_principal_interest_fees_and_dates()
    {
        var p = LoanService.Project(Example);
        Assert.Equal(4799.15m, p.MonthlyPayment);
        Assert.Equal(1_000_000m, p.Schedule.Sum(x => x.Principal));
        Assert.Equal(0m, p.Schedule[^1].Remaining);
        Assert.Equal(10000m, p.TotalFees);
        Assert.Equal(1_000_000m + p.TotalInterest + p.TotalFees, p.TotalPaid);
        Assert.Equal(new DateOnly(2056, 9, 13), p.PaidOff);
        Assert.All(p.Schedule, x => Assert.Equal(x.Opening - x.Principal, x.Remaining));
        Assert.True(LoanService.Project(Example with { AnnualRate = 5 }).MonthlyPayment > p.MonthlyPayment);
    }
    [Fact]
    public void Zero_interest_and_last_payment_rounding_do_not_create_debt()
    {
        var p=LoanService.Project(Example with { Principal = 100m, Months = 3, AnnualRate = 0, MonthlyFee = 0, UpfrontFee = 0 });
        Assert.Equal(33.33m,p.MonthlyPayment); Assert.Equal(33.34m,p.Schedule[^1].Payment);
        Assert.Equal(100m,p.TotalPaid); Assert.Equal(0,p.TotalInterest);
        Assert.Throws<ApiFailure>(()=>LoanService.Project(Example with { Months = 0 }));
        Assert.Throws<ApiFailure>(()=>LoanService.Project(Example with { Principal = -1 }));
        Assert.Throws<ApiFailure>(()=>LoanService.Project(Example with { AnnualRate = 31 }));
        Assert.Throws<ApiFailure>(()=>LoanService.Project(Example with { MonthlyFee = .001m }));
    }
    [Fact]
    public async Task Loans_are_isolated_preview_is_readonly_and_edits_require_current_version()
    {
        await using var app=new BackendFactory(secondWorkspace:true);using var demo=app.AuthClient();using var live=app.AuthClient();
        live.DefaultRequestHeaders.Add("X-Banking-Mode","Live");
        try {
            Assert.True((await demo.PostAsJsonAsync("/api/loans/preview",Example)).IsSuccessStatusCode);
            Assert.Empty((await Read(await demo.GetAsync("/api/loans"))).EnumerateArray());
            var saved=await Read(await demo.PostAsJsonAsync("/api/loans",Example));
            var id=saved.GetProperty("id").GetGuid();var version=saved.GetProperty("version").GetString();
            Assert.Empty((await Read(await live.GetAsync("/api/loans"))).EnumerateArray());
            Assert.Equal(HttpStatusCode.NotFound,(await live.PutAsJsonAsync($"/api/loans/{id}",Example with{Version=version})).StatusCode);
            Assert.True((await demo.PutAsJsonAsync($"/api/loans/{id}",Example with{Name="Updated",Version=version})).IsSuccessStatusCode);
            Assert.Equal(HttpStatusCode.Conflict,(await demo.PutAsJsonAsync($"/api/loans/{id}",Example with{Version=version})).StatusCode);
            var fresh=(await Read(await demo.GetAsync("/api/loans")))[0];
            Assert.True((await demo.DeleteAsync($"/api/loans/{id}?version={Uri.EscapeDataString(fresh.GetProperty("version").GetString()!)}")).IsSuccessStatusCode);
            Assert.Empty((await Read(await demo.GetAsync("/api/loans"))).EnumerateArray());
        }finally{await app.Cleanup();}
    }
}
