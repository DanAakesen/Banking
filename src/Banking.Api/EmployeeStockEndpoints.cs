using Banking.Api.Services;
using Banking.Api.Providers;
using Banking.Api.Security;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;

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
        var history=app.MapGroup("/api/employee-stocks").AddEndpointFilter(async(context,next)=>{
            var workspace=context.HttpContext.RequestServices.GetRequiredService<Workspace>();
            if(workspace.Mode!="Live"||!workspace.OwnerAuthenticated)throw new ApiFailure(403,"OWNER_REQUIRED_FOR_PRIVATE_UPLOAD");
            context.HttpContext.Response.Headers.CacheControl="no-store, private";
            context.HttpContext.Response.Headers.Pragma="no-cache";
            return await next(context);
        });
        history.MapPost("/uploads",async(HttpRequest request,[FromServices] EmployeeStockImportService service,CancellationToken ct)=>{
            Check.That(request.ContentType?.Split(';')[0].Trim()==MediaType,"STOCK_FILE_TYPE");
            Check.That(request.ContentLength is null or <=EmployeeStockWorkbook.MaxBytes,"STOCK_FILE_TOO_LARGE");
            if(request.HttpContext.Features.Get<IHttpMaxRequestBodySizeFeature>() is{IsReadOnly:false} limit)limit.MaxRequestBodySize=EmployeeStockWorkbook.MaxBytes;
            return await WithReader(async token=>{
                using var body=new MemoryStream();var buffer=new byte[8192];byte[]? bytes=null;
                try{int n;while((n=await request.Body.ReadAsync(buffer,token))>0){Check.That(body.Length+n<=EmployeeStockWorkbook.MaxBytes,"STOCK_FILE_TOO_LARGE");body.Write(buffer,0,n);}bytes=body.ToArray();return await service.Upload(bytes,token);}
                finally{if(bytes is not null)Array.Clear(bytes);Array.Clear(buffer);Array.Clear(body.GetBuffer());}
            },ct);
        });
        history.MapGet("/uploads",(int? offset,[FromServices] EmployeeStockImportService service,CancellationToken ct)=>service.History(offset??0,ct));
        history.MapGet("/uploads/{id:guid}",(Guid id,[FromServices] EmployeeStockImportService service,CancellationToken ct)=>service.Detail(id,ct));
        history.MapPost("/uploads/{id:guid}/parse",(Guid id,EmployeeStockReceiptAction input,[FromServices] EmployeeStockImportService service,CancellationToken ct)=>WithReader(token=>service.Parse(id,input.Version,token),ct));
        history.MapPost("/uploads/{id:guid}/approve",(Guid id,EmployeeStockApproval input,[FromServices] EmployeeStockImportService service,CancellationToken ct)=>service.Approve(id,input,ct));
        history.MapPost("/uploads/{id:guid}/reject",(Guid id,EmployeeStockReceiptAction input,[FromServices] EmployeeStockImportService service,CancellationToken ct)=>service.Reject(id,input.Version,ct));
        history.MapPost("/uploads/{id:guid}/link",(Guid id,EmployeeStockReuse input,[FromServices] EmployeeStockImportService service,CancellationToken ct)=>service.Reuse(id,input,ct));
        history.MapGet("/snapshots/{id:guid}",(Guid id,[FromServices] EmployeeStockImportService service,CancellationToken ct)=>service.Snapshot(id,ct));
        history.MapGet("/uploads/{id:guid}/original",async(Guid id,HttpContext context,[FromServices] EmployeeStockImportService service,CancellationToken ct)=>{
            var original=await service.Original(id,ct);context.Response.Headers.ContentSecurityPolicy="default-src 'none'; sandbox";
            return Results.File(original.Bytes,original.Type,"Employee-shares.xlsx",enableRangeProcessing:false);
        });
        // Separate generated-sample route: private upload and owner API guards above are unchanged.
        var demo=app.MapGroup("/api/employee-stocks/demo").AddEndpointFilter(async(context,next)=>{
            var workspace=context.HttpContext.RequestServices.GetRequiredService<Workspace>();
            if(workspace.Mode!="Demo")throw new ApiFailure(403,"STOCK_DEMO_ONLY");
            context.HttpContext.Response.Headers.CacheControl="no-store, private";context.HttpContext.Response.Headers.Pragma="no-cache";
            await context.HttpContext.RequestServices.GetRequiredService<EmployeeStockImportService>().ForSyntheticDemo(context.HttpContext.RequestAborted);
            return await next(context);
        });
        demo.MapPost("/uploads",(DemoEmployeeStockUpload input,[FromServices] EmployeeStockImportService service,CancellationToken ct)=>WithReader(token=>service.UploadDemo(input.Version,token),ct));
        demo.MapGet("/uploads",(int? offset,[FromServices] EmployeeStockImportService service,CancellationToken ct)=>service.History(offset??0,ct));
        demo.MapGet("/uploads/{id:guid}",(Guid id,[FromServices] EmployeeStockImportService service,CancellationToken ct)=>service.Detail(id,ct));
        demo.MapPost("/uploads/{id:guid}/approve",(Guid id,EmployeeStockApproval input,[FromServices] EmployeeStockImportService service,CancellationToken ct)=>service.Approve(id,input,ct));
        demo.MapPost("/uploads/{id:guid}/link",(Guid id,EmployeeStockReuse input,[FromServices] EmployeeStockImportService service,CancellationToken ct)=>service.Reuse(id,input,ct));
        demo.MapGet("/snapshots/{id:guid}",(Guid id,[FromServices] EmployeeStockImportService service,CancellationToken ct)=>service.Snapshot(id,ct));
        demo.MapGet("/uploads/{id:guid}/original",async(Guid id,HttpContext context,[FromServices] EmployeeStockImportService service,CancellationToken ct)=>{
            var original=await service.Original(id,ct);context.Response.Headers.ContentSecurityPolicy="default-src 'none'; sandbox";
            return Results.File(original.Bytes,original.Type,"Fiktive-medarbejderaktier.xlsx",enableRangeProcessing:false);
        });
    }
    static async Task<T> WithReader<T>(Func<CancellationToken,Task<T>> action,CancellationToken ct)
    {
        if(!await Reader.WaitAsync(0,ct))throw new ApiFailure(429,"STOCK_PREVIEW_BUSY");
        try{using var timeout=CancellationTokenSource.CreateLinkedTokenSource(ct);timeout.CancelAfter(TimeSpan.FromSeconds(15));
            try{return await action(timeout.Token);}catch(OperationCanceledException)when(!ct.IsCancellationRequested){throw new ApiFailure(400,"STOCK_TIME_LIMIT");}}
        finally{Reader.Release();}
    }
}

public sealed record DemoEmployeeStockUpload(string Version);
