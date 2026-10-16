using Banking.Api.Services;
using Banking.Api.Providers;
using Banking.Api.Security;
using Microsoft.AspNetCore.Http.Features;

namespace Banking.Api;

public static class EmployeeStockEndpoints
{
    public const string MediaType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    static readonly SemaphoreSlim Reader = new(1, 1);
    public static void MapEmployeeStockApi(this WebApplication app)
    {
        app.MapPost("/api/employee-stocks/preview", async (HttpRequest request, Workspace workspace, CancellationToken ct) =>
        {
            if (workspace.Mode != "Live" || !workspace.OwnerAuthenticated) throw new ApiFailure(403, "OWNER_REQUIRED_FOR_PRIVATE_UPLOAD");
            request.HttpContext.Response.Headers.CacheControl = "no-store, private";
            request.HttpContext.Response.Headers.Pragma = "no-cache";
            Check.That(request.ContentType?.Split(';')[0].Trim() == MediaType, "STOCK_FILE_TYPE");
            Check.That(request.ContentLength is null or <= EmployeeStockWorkbook.MaxBytes, "STOCK_FILE_TOO_LARGE");
            if (request.HttpContext.Features.Get<IHttpMaxRequestBodySizeFeature>() is { IsReadOnly: false } limit) limit.MaxRequestBodySize = EmployeeStockWorkbook.MaxBytes;
            if (!await Reader.WaitAsync(0, ct)) throw new ApiFailure(429, "STOCK_PREVIEW_BUSY");
            try
            {
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct); timeout.CancelAfter(TimeSpan.FromSeconds(15));
                using var output = new MemoryStream(); var buffer = new byte[8192]; byte[]? bytes = null;
                try
                {
                    int n; while ((n = await request.Body.ReadAsync(buffer, timeout.Token)) > 0) { Check.That(output.Length + n <= EmployeeStockWorkbook.MaxBytes, "STOCK_FILE_TOO_LARGE"); output.Write(buffer, 0, n); }
                    bytes = output.ToArray();
                    return EmployeeStockWorkbook.Parse(bytes, timeout.Token);
                }
                catch (OperationCanceledException) when (!ct.IsCancellationRequested) { throw new ApiFailure(400, "STOCK_TIME_LIMIT"); }
                finally { if (bytes is not null) Array.Clear(bytes); Array.Clear(buffer); Array.Clear(output.GetBuffer()); }
            }
            finally { Reader.Release(); }
        });
    }
}
