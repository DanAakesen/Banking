using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Banking.Api.Providers;
using Banking.Api.Services;
using static Banking.Tests.PensionHistoryTests;

namespace Banking.Tests;

public sealed partial class PensionEndpointTests
{
    [Fact]
    public async Task DemoSeriesSharesNormalReviewApprovalOriginalAndHistoryContractsWithoutOwnerData()
    {
        await using var host = new Host(); await host.Init(); using var demo = host.Client("Demo", "Demo");
        using var secondDemo = host.Client("Demo", "Demo"); using var owner = host.Client();
        Guid? product = null; string? productVersion = null; JsonElement latest = default;
        foreach (var variant in new[] { "earlier", "later" })
        {
            var uploaded = await demo.PostAsJsonAsync("/api/pension/uploads/demo", new { version = variant }); uploaded.EnsureSuccessStatusCode();
            var receipt = await uploaded.Content.ReadFromJsonAsync<JsonElement>(); latest = receipt;
            var report = receipt.GetProperty("report").Deserialize<PensionReport>(Json)!;
            Assert.True(receipt.GetProperty("synthetic").GetBoolean()); Assert.False(receipt.GetProperty("financialSaved").GetBoolean());
            Assert.Equal("NeedsReview", receipt.GetProperty("status").GetString()); Assert.Equal(11, report.Scenarios.Length); Assert.Equal(5, report.Insurance.Length);
            var original = await secondDemo.GetAsync("/api/pension/uploads/" + receipt.GetProperty("id").GetString() + "/original"); original.EnsureSuccessStatusCode();
            Assert.Equal(DemoPensionReport.Create(variant), await original.Content.ReadAsByteArrayAsync()); Assert.Contains("no-store", original.Headers.CacheControl!.ToString());
            var input = new PensionApproval(receipt.GetProperty("version").GetString()!, report.ReportAsOf!.Value, report,
                [new(report.Agreements[0].Key, product, productVersion)], false, true);
            var path = "pension/uploads/" + receipt.GetProperty("id").GetString() + "/approve";
            Assert.Equal(HttpStatusCode.BadRequest, (await demo.PostAsJsonAsync("/api/" + path, input)).StatusCode);
            var saved = await demo.PostAsJsonAsync("/api/" + path, input with { Confirm = true }); saved.EnsureSuccessStatusCode();
            var rows = await secondDemo.GetFromJsonAsync<JsonElement>("/api/wealth"); var row = Assert.Single(rows.EnumerateArray());
            if (product.HasValue) Assert.Equal(product, row.GetProperty("id").GetGuid());
            product = row.GetProperty("id").GetGuid(); productVersion = row.GetProperty("version").GetString();
            if (Environment.GetEnvironmentVariable("BANKING_PENSION_BROWSER_FIXTURE_DIR") is { Length: > 0 } folder)
            { Directory.CreateDirectory(folder); await File.WriteAllTextAsync(Path.Combine(folder, "report-demo-" + variant + ".json"), JsonSerializer.Serialize(report, Json)); }
        }
        var history = await secondDemo.GetFromJsonAsync<JsonElement>("/api/pension/uploads");
        Assert.Equal(2, history.GetProperty("total").GetInt32()); Assert.Equal(2, history.GetProperty("development").GetArrayLength());
        Assert.All(history.GetProperty("development").EnumerateArray(), d => Assert.Equal(JsonValueKind.Null, d.GetProperty("returns").ValueKind));
        var summary = await demo.GetFromJsonAsync<JsonElement>("/api/wealth/summary"); Assert.Equal(431000, summary.GetProperty("pension").GetDecimal());
        var overview = await demo.GetFromJsonAsync<JsonElement>("/api/wealth/overview");
        Assert.Equal(JsonValueKind.Null, overview.GetProperty("visuals").GetProperty("pension").ValueKind); // No invented contribution/return chart.
        Assert.Empty((await owner.GetFromJsonAsync<JsonElement>("/api/wealth")).EnumerateArray());
        Assert.Empty((await owner.GetFromJsonAsync<JsonElement>("/api/pension/uploads")).GetProperty("items").EnumerateArray());
        var id = latest.GetProperty("id").GetGuid();
        var detail = await demo.GetFromJsonAsync<JsonElement>("/api/pension/uploads/" + id); var snapshotId = detail.GetProperty("snapshotId").GetGuid();
        var snapshot = await demo.GetFromJsonAsync<JsonElement>("/api/pension/snapshots/" + snapshotId);
        foreach (var dto in new[] { detail, history, snapshot }) AssertNoOriginal(dto);
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync($"/api/pension/uploads/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync($"/api/pension/uploads/{id}/original")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync($"/api/pension/snapshots/{snapshotId}")).StatusCode);
        using var anonymous = host.Client(null); using var forged = host.Client("Demo", "Live");
        var foreignReport = latest.GetProperty("report").Deserialize<PensionReport>(Json)!;
        var foreignApproval = new PensionApproval(latest.GetProperty("version").GetString()!, foreignReport.ReportAsOf!.Value,
            foreignReport, [new(foreignReport.Agreements[0].Key, product, productVersion)], true, true);
        foreach (var foreign in new[] { owner, anonymous, forged })
        {
            var expected = foreign == owner ? HttpStatusCode.NotFound : foreign == anonymous ? HttpStatusCode.Unauthorized : HttpStatusCode.Forbidden;
            Assert.Equal(expected, (await foreign.PostAsJsonAsync($"/api/pension/uploads/{id}/approve", foreignApproval)).StatusCode);
            Assert.Equal(expected, (await foreign.PostAsJsonAsync($"/api/pension/uploads/{id}/parse", new { version = foreignApproval.Version })).StatusCode);
            Assert.Equal(expected, (await foreign.PostAsJsonAsync($"/api/pension/uploads/{id}/link", new PensionReuse(foreignApproval.Version, snapshotId, true))).StatusCode);
        }
        var repeated = await demo.PostAsJsonAsync("/api/pension/uploads/demo", new { version = "later" }); repeated.EnsureSuccessStatusCode();
        var duplicate = await repeated.Content.ReadFromJsonAsync<JsonElement>();
        var linked = await demo.PostAsJsonAsync($"/api/pension/uploads/{duplicate.GetProperty("id").GetGuid()}/link",
            new PensionReuse(duplicate.GetProperty("version").GetString()!, snapshotId, true)); linked.EnsureSuccessStatusCode();
        history = await demo.GetFromJsonAsync<JsonElement>("/api/pension/uploads"); Assert.Equal(3, history.GetProperty("total").GetInt32()); Assert.Equal(2, history.GetProperty("development").GetArrayLength());
        var correctionResponse = await demo.PostAsJsonAsync("/api/pension/uploads/demo", new { version = "correction" }); correctionResponse.EnsureSuccessStatusCode();
        var correction = await correctionResponse.Content.ReadFromJsonAsync<JsonElement>(); var correctedReport = correction.GetProperty("report").Deserialize<PensionReport>(Json)!;
        var approval = new PensionApproval(correction.GetProperty("version").GetString()!, correctedReport.ReportAsOf!.Value, correctedReport,
            [new(correctedReport.Agreements[0].Key, product, productVersion)], true, true);
        var correctionPath = $"/api/pension/uploads/{correction.GetProperty("id").GetGuid()}/approve";
        Assert.Equal(HttpStatusCode.Conflict, (await demo.PostAsJsonAsync(correctionPath, approval)).StatusCode);
        var corrected = await demo.PostAsJsonAsync(correctionPath, approval with { SupersedesId = snapshotId }); corrected.EnsureSuccessStatusCode();
        history = await demo.GetFromJsonAsync<JsonElement>("/api/pension/uploads"); Assert.Equal(4, history.GetProperty("total").GetInt32()); Assert.Equal(2, history.GetProperty("development").GetArrayLength());
        Assert.Equal(431000, (await demo.GetFromJsonAsync<JsonElement>("/api/pension/snapshots/" + snapshotId)).GetProperty("accepted").GetProperty("report").GetProperty("agreements")[0].GetProperty("balance").GetProperty("value").GetDecimal());
        if (Environment.GetEnvironmentVariable("BANKING_PENSION_BROWSER_FIXTURE_DIR") is { Length: > 0 } fixtures)
            await File.WriteAllTextAsync(Path.Combine(fixtures, "report-demo-correction.json"), JsonSerializer.Serialize(correctedReport, Json));
        Assert.Equal(0, await host.WealthCount()); Assert.Equal(0, await host.DocumentCount());
    }
    static void AssertNoOriginal(JsonElement dto)
    {
        if (dto.ValueKind == JsonValueKind.Object) foreach (var field in dto.EnumerateObject())
        { Assert.DoesNotContain(field.Name, new[] { "protectedOriginal", "previewJson", "dataJson", "rawText", "fileName" }); AssertNoOriginal(field.Value); }
        if (dto.ValueKind == JsonValueKind.Array) foreach (var item in dto.EnumerateArray()) AssertNoOriginal(item);
    }
    [Fact]
    public async Task DemoSampleBoundaryRejectsPrivateInputsForeignIdsAndMissingCsrf()
    {
        await using var host = new Host(); await host.Init(); using var demo = host.Client("Demo", "Demo"); using var owner = host.Client();
        using var forged = host.Client("Demo", "Live"); using var anonymous = host.Client(null);
        Assert.Equal(HttpStatusCode.Forbidden, (await owner.PostAsJsonAsync("/api/pension/uploads/demo", new { version = "later" })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsJsonAsync("/api/pension/uploads/demo", new { version = "later" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await forged.PostAsJsonAsync("/api/pension/uploads/demo", new { version = "later" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await demo.PostAsJsonAsync("/api/pension/uploads/demo", new { version = "private-pdf" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await demo.PostAsync("/api/pension/uploads", Pdf())).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await demo.PostAsJsonAsync("/api/pension/uploads", new { synthetic = true, file = "private-input" })).StatusCode);
        demo.DefaultRequestHeaders.Remove("Origin"); demo.DefaultRequestHeaders.Add("Origin", "https://evil.fixture");
        Assert.Equal(HttpStatusCode.Forbidden, (await demo.PostAsJsonAsync("/api/pension/uploads/demo", new { version = "later" })).StatusCode);
        demo.DefaultRequestHeaders.Remove("Origin");
        Assert.Equal(HttpStatusCode.Forbidden, (await demo.PostAsJsonAsync("/api/pension/uploads/demo", new { version = "later" })).StatusCode);
        Assert.Empty((await owner.GetFromJsonAsync<JsonElement>("/api/pension/uploads")).GetProperty("items").EnumerateArray());
    }
}
