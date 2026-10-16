using System.Text.Json.Serialization;
using Banking.Api.Data;
using Banking.Api.Providers;

namespace Banking.Api.Services;

// Financial source identity never includes raw workbook names or award references.
public sealed class EmployeeStockDocument : Entity
{
    [JsonIgnore] public string Hash { get; set; } = "";
    public int ByteLength { get; set; }
    public bool Synthetic { get; set; }
    [JsonIgnore] public byte[] ProtectedOriginal { get; set; } = [];
}
public sealed class EmployeeStockUpload : Entity
{
    public Guid DocumentId { get; set; }
    public DateTimeOffset UploadedAt { get; set; }
    public string ParserVersion { get; set; } = EmployeeStockWorkbook.Version;
    public string Status { get; set; } = "Uploaded";
    public string? ErrorCode { get; set; }
    [JsonIgnore] public string PreviewJson { get; set; } = "";
    [JsonIgnore] public string? SourceIdentityKey { get; set; }
    public Guid? SnapshotId { get; set; }
}
public sealed class EmployeeStockSnapshot : Entity
{
    public Guid UploadId { get; set; }
    public Guid DocumentId { get; set; }
    public DateOnly AsOf { get; set; }
    public DateTimeOffset ApprovedAt { get; set; }
    public string ReviewHash { get; set; } = "";
    [JsonIgnore] public string SourceIdentityKey { get; set; } = "";
    [JsonIgnore] public string DataJson { get; set; } = "";
    public Guid? SupersedesId { get; set; }
    public Guid? WealthRecordId { get; set; }
}
