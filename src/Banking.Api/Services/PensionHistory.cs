using System.Text.Json.Serialization;
using Banking.Api.Data;
using Banking.Api.Providers;

namespace Banking.Api.Services;

public sealed class PensionDocument : Entity
{
    public string Hash { get; set; } = "";
    public string MediaType { get; set; } = "application/pdf";
    // Only explicit receipt DTOs are exposed by HTTP. Backup archives must include the encrypted original.
    public byte[] ProtectedOriginal { get; set; } = [];
    public int ByteLength { get; set; }
    public bool Synthetic { get; set; }
}
public sealed class PensionUpload : Entity
{
    public Guid DocumentId { get; set; }
    public DateTimeOffset UploadedAt { get; set; }
    public string ParserVersion { get; set; } = PensionReportParser.Version;
    public string Status { get; set; } = "NeedsReview";
    public string? ErrorCode { get; set; }
    public string PreviewJson { get; set; } = "";
    public Guid? SnapshotId { get; set; }
}
public sealed class PensionSnapshot : Entity
{
    public Guid UploadId { get; set; }
    public Guid DocumentId { get; set; }
    public DateOnly AsOf { get; set; }
    public DateTimeOffset ApprovedAt { get; set; }
    public string ReviewHash { get; set; } = "";
    public string CoverageKey { get; set; } = "";
    public string DataJson { get; set; } = "";
    public Guid? SupersedesId { get; set; }
}
public sealed record PensionTarget(string Key, Guid? Id, string? Version);
public sealed record PensionApproval(string Version, DateOnly ReportAsOf, PensionReport Reviewed,
    PensionTarget[] Products, bool Confirm, bool AcknowledgeWarnings, Guid? SupersedesId = null);
public sealed record PensionAccepted(PensionReport Report, PensionTarget[] Products);
public sealed record PensionReuse(string Version, Guid SnapshotId, bool Confirm);
