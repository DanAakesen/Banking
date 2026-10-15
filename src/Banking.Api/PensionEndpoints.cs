using Banking.Api.Providers;
using Banking.Api.Security;
using Banking.Api.Services;
using Microsoft.AspNetCore.Http.Features;
using System.Text.Json;

namespace Banking.Api;

public static class PensionEndpoints
{
    public static void MapPensionApi(this WebApplication app)
    {
        var pension = app.MapGroup("/api/pension").AddEndpointFilter(async (context, next) => {
            var workspace = context.HttpContext.RequestServices.GetRequiredService<Workspace>();
            if (workspace.Mode != "Live" || !workspace.OwnerAuthenticated) throw new ApiFailure(403, "OWNER_REQUIRED_FOR_PENSION");
            return await next(context);
        });
        pension.MapPost("/uploads", async (HttpRequest request, Workspace workspace, PensionImportService service, CancellationToken ct) =>
        {
            if (workspace.Mode != "Live" || !workspace.OwnerAuthenticated) throw new ApiFailure(403, "OWNER_REQUIRED_FOR_PRIVATE_UPLOAD");
            if (request.HttpContext.Features.Get<IHttpMaxRequestBodySizeFeature>() is { IsReadOnly: false } limit)
                limit.MaxRequestBodySize = PensionReportParser.MaxBytes;
            var type = request.ContentType?.Split(';')[0].Trim().ToLowerInvariant() ?? "";
            Check.That(type is "application/pdf" or "application/json", "PENSION_FILE_TYPE");
            Check.That(request.ContentLength is null or <= PensionReportParser.MaxBytes, "PENSION_FILE_TOO_LARGE");
            var bytes = await ReadBounded(request, type == "application/json" ? 60000 : PensionReportParser.MaxBytes, ct);
            try { return await service.Upload(bytes, type, false, ct); } finally { Array.Clear(bytes); }
        });
        pension.MapGet("/uploads", (int? offset, PensionImportService service, CancellationToken ct) => service.History(offset ?? 0, ct));
        pension.MapGet("/uploads/{id:guid}", (Guid id, PensionImportService service, CancellationToken ct) => service.Detail(id, ct));
        pension.MapPost("/uploads/{id:guid}/parse", (Guid id, PensionRetry input, PensionImportService service, CancellationToken ct) => service.Parse(id, input.Version, ct));
        pension.MapPost("/uploads/{id:guid}/link", (Guid id, PensionReuse input, PensionImportService service, CancellationToken ct) => service.Reuse(id, input, ct));
        pension.MapPost("/uploads/{id:guid}/approve", async (Guid id, HttpRequest request, PensionImportService service, CancellationToken ct) => {
            const int reviewLimit = 768000;
            if (request.HttpContext.Features.Get<IHttpMaxRequestBodySizeFeature>() is { IsReadOnly: false } limit) limit.MaxRequestBodySize = reviewLimit;
            Check.That(request.HasJsonContentType(), "PENSION_FILE_TYPE");
            var bytes = await ReadBounded(request, reviewLimit, ct);
            PensionApproval input;
            try { input = JsonSerializer.Deserialize<PensionApproval>(bytes, new JsonSerializerOptions(JsonSerializerDefaults.Web)) ?? throw new JsonException(); }
            catch (JsonException) { throw new ApiFailure(400, "INVALID_PENSION_REVIEW"); }
            finally { Array.Clear(bytes); }
            return await service.Approve(id, input, ct);
        });
        pension.MapGet("/snapshots/{id:guid}", (Guid id, PensionImportService service, CancellationToken ct) => service.Snapshot(id, ct));
        pension.MapGet("/uploads/{id:guid}/original", async (Guid id, PensionImportService service, HttpContext context, CancellationToken ct) =>
        {
            var file = await service.Original(id, ct);
            context.Response.Headers.CacheControl = "no-store, private";
            context.Response.Headers.Pragma = "no-cache";
            context.Response.Headers.ContentSecurityPolicy = "default-src 'none'; sandbox";
            return Results.File(file.Bytes, file.Type, "PensionsInfo-report" + (file.Type == "application/pdf" ? ".pdf" : ".json"), enableRangeProcessing: false);
        });
    }
    static async Task<byte[]> ReadBounded(HttpRequest request, int max, CancellationToken ct)
    {
        Check.That(request.ContentLength is null || request.ContentLength <= max, "PENSION_FILE_TOO_LARGE");
        using var output = new MemoryStream(); var buffer = new byte[8192]; int count;
        while ((count = await request.Body.ReadAsync(buffer, ct)) > 0)
        { Check.That(output.Length + count <= max, "PENSION_FILE_TOO_LARGE"); await output.WriteAsync(buffer.AsMemory(0, count), ct); }
        return output.ToArray();
    }
    public sealed record PensionRetry(string Version);
}
