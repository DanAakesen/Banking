using System.Data;
using System.Text.Json;
using System.Text.RegularExpressions;
using Banking.Api.Data;
using Banking.Api.Providers;
using Banking.Api.Security;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace Banking.Api.Services;

public sealed class PensionImportService(BankingDb db, Workspace workspace, TimeProvider clock,
    IDataProtectionProvider protection, IPensionPdfReader pdf)
{
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    IDataProtector Protector => protection.CreateProtector("Banking.Pension.Original.v1", workspace.Mode, workspace.DemoScope);
    void RequireAccess()
    { if (workspace.Mode == "Live" && !workspace.OwnerAuthenticated) throw new ApiFailure(403, "OWNER_REQUIRED"); }
    public async Task<object> Upload(byte[] bytes, string type, bool synthetic, CancellationToken ct)
    {
        RequireAccess();
        if (workspace.Mode == "Demo" && !synthetic) throw new ApiFailure(403, "DEMO_SYNTHETIC_REPORT_ONLY");
        Check.That(type is "application/pdf" or "application/json", "PENSION_FILE_TYPE");
        Check.That(bytes.Length > 0 && bytes.Length <= (type == "application/pdf" ? PensionReportParser.MaxBytes : 60000), "PENSION_FILE_TOO_LARGE");
        if (type == "application/pdf") Check.That(bytes.Length > 5 && bytes.AsSpan(0, 5).SequenceEqual("%PDF-"u8), "INVALID_PENSION_PDF");
        var hash = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(bytes)).ToLowerInvariant();
        var document = await db.PensionDocuments.SingleOrDefaultAsync(d => d.Hash == hash, ct);
        if (document is null)
        {
            document = new() { Hash = hash, ByteLength = bytes.Length, MediaType = type, Synthetic = synthetic,
                ProtectedOriginal = Protector.Protect(bytes) };
            db.PensionDocuments.Add(document);
        }
        var upload = new PensionUpload { DocumentId = document.Id, UploadedAt = clock.GetUtcNow(), Status = "Uploaded" };
        db.PensionUploads.Add(upload);
        await db.SaveChangesAsync(ct); // Retain the receipt/original even if parsing is unsupported or interrupted.
        return await Parse(upload.Id, Convert.ToBase64String(upload.Version), ct);
    }
    public async Task<object> Parse(Guid id, string version, CancellationToken ct)
    {
        RequireAccess(); var upload = await Find(id, ct);
        Check.That(upload.Status != "Approved", "PENSION_UPLOAD_ALREADY_APPROVED");
        GoalService.Version(db, upload, version);
        var document = await db.PensionDocuments.SingleAsync(d => d.Id == upload.DocumentId, ct);
        if (workspace.Mode == "Demo" && !document.Synthetic) throw new ApiFailure(403, "DEMO_SYNTHETIC_REPORT_ONLY");
        var bytes = Protector.Unprotect(document.ProtectedOriginal);
        try
        {
            var report = document.MediaType == "application/pdf" ? await pdf.Read(bytes, ct) : PensionReportParser.Json(bytes, clock);
            upload.PreviewJson = JsonSerializer.Serialize(report, Json);
            upload.ParserVersion = PensionReportParser.Version; upload.Status = "NeedsReview"; upload.ErrorCode = null;
        }
        catch (ApiFailure error) { upload.PreviewJson = ""; upload.Status = "Unsupported"; upload.ErrorCode = error.Code; }
        catch (JsonException) { upload.PreviewJson = ""; upload.Status = "Unsupported"; upload.ErrorCode = "INVALID_STATEMENT_JSON"; }
        finally { Array.Clear(bytes); }
        await db.SaveChangesAsync(ct);
        return await Detail(id, ct);
    }
    async Task<PensionUpload> Find(Guid id, CancellationToken ct) =>
        await db.PensionUploads.SingleOrDefaultAsync(u => u.Id == id, ct) ?? throw new ApiFailure(404, "PENSION_UPLOAD_NOT_FOUND");
    public async Task<object> Detail(Guid id, CancellationToken ct)
    {
        RequireAccess(); var upload = await Find(id, ct);
        var document = await db.PensionDocuments.AsNoTracking().SingleAsync(d => d.Id == upload.DocumentId, ct);
        if (workspace.Mode == "Demo" && !document.Synthetic) throw new ApiFailure(403, "DEMO_SYNTHETIC_REPORT_ONLY");
        var report = upload.PreviewJson.Length == 0 ? null : JsonSerializer.Deserialize<PensionReport>(upload.PreviewJson, Json);
        var products = await db.WealthRecords.AsNoTracking().Where(w => w.Kind == "Pension").ToArrayAsync(ct);
        var existing = await db.PensionSnapshots.AsNoTracking().Where(s => s.DocumentId == document.Id).OrderByDescending(s => s.ApprovedAt)
            .Select(s => new { s.Id, s.AsOf, s.ApprovedAt }).FirstOrDefaultAsync(ct);
        return new { upload.Id, upload.UploadedAt, upload.Status, upload.ErrorCode, upload.Version,
            document.Hash, document.MediaType, document.ByteLength, document.Synthetic, upload.ParserVersion, report,
            financialSaved = upload.SnapshotId.HasValue, upload.SnapshotId, existingApproval = existing,
            suggestedProducts = report?.Agreements.Select(a => new { a.Key, product = products.FirstOrDefault(p => p.PensionSourceKey == a.Key
                || p.Provider == a.Provider && p.Name == a.Name) }), products };
    }
    public async Task<object> History(int offset, CancellationToken ct)
    {
        RequireAccess(); Check.That(offset is >= 0 and <= 100000, "INVALID_OFFSET");
        var total = await db.PensionUploads.CountAsync(ct);
        var rows = await (from u in db.PensionUploads.AsNoTracking() join d in db.PensionDocuments.AsNoTracking() on u.DocumentId equals d.Id
            orderby u.UploadedAt descending, u.Id
            select new { u.Id, u.UploadedAt, u.Status, u.ErrorCode, u.SnapshotId, d.Hash, d.MediaType, d.Synthetic }).Skip(offset).Take(50).ToArrayAsync(ct);
        // One canonical approved snapshot per corrected report date. Reupload receipts link to it, not extra chart points.
        var snapshots = await db.PensionSnapshots.AsNoTracking()
            .Where(s => !db.PensionSnapshots.Any(newer => newer.SupersedesId == s.Id))
            .OrderByDescending(s => s.AsOf).ThenByDescending(s => s.ApprovedAt).Take(201).ToArrayAsync(ct);
        var superseded = snapshots.Where(s => s.SupersedesId.HasValue).Select(s => s.SupersedesId!.Value).ToHashSet();
        var dates = snapshots.Take(200).Where(s => !superseded.Contains(s.Id)).SelectMany(s =>
        {
            var accepted = JsonSerializer.Deserialize<PensionAccepted>(s.DataJson, Json)!;
            return accepted.Report.Agreements.GroupBy(a => a.Currency).Select(g => new { s.Id, s.AsOf, s.ApprovedAt, currency = g.Key,
                capital = g.All(a => a.Balance.Value.HasValue) ? (decimal?)g.Sum(a => a.Balance.Value!.Value) : null,
                products = g.Select(a => a.Name), sourceDates = g.Select(a => a.AsOf).Distinct(),
                contributions = g.All(a => a.AnnualContribution.Value.HasValue && a.AnnualContribution.Source.Unit == g.Key + "/year")
                    ? (decimal?)g.Sum(a => a.AnnualContribution.Value!.Value) : null,
                returns = (decimal?)null, basis = "Approved reported values only; no interpolation or inferred return" });
        });
        return new { total, offset, items = rows, development = dates, developmentHasMore = snapshots.Length > 200 };
    }
    public async Task<(byte[] Bytes, string Type)> Original(Guid id, CancellationToken ct)
    {
        RequireAccess(); var upload = await Find(id, ct);
        var document = await db.PensionDocuments.SingleAsync(d => d.Id == upload.DocumentId, ct);
        if (workspace.Mode == "Demo" && !document.Synthetic) throw new ApiFailure(403, "DEMO_SYNTHETIC_REPORT_ONLY");
        return (Protector.Unprotect(document.ProtectedOriginal), document.MediaType);
    }
    public async Task<object> Snapshot(Guid id, CancellationToken ct)
    {
        RequireAccess(); var row = await db.PensionSnapshots.AsNoTracking().SingleOrDefaultAsync(s => s.Id == id, ct)
            ?? throw new ApiFailure(404, "PENSION_SNAPSHOT_NOT_FOUND");
        return new { row.Id, row.UploadId, row.AsOf, row.ApprovedAt, row.SupersedesId,
            accepted = JsonSerializer.Deserialize<PensionAccepted>(row.DataJson, Json) };
    }
    public async Task<object> Reuse(Guid id, PensionReuse input, CancellationToken ct)
    {
        RequireAccess(); Check.That(input.Confirm, "PENSION_REVIEW_CONFIRMATION_REQUIRED");
        var upload = await Find(id, ct);
        var snapshot = await db.PensionSnapshots.SingleOrDefaultAsync(s => s.Id == input.SnapshotId && s.DocumentId == upload.DocumentId, ct)
            ?? throw new ApiFailure(404, "PENSION_SNAPSHOT_NOT_FOUND");
        if (upload.Status == "Approved") { Check.That(upload.SnapshotId == snapshot.Id, "PENSION_APPROVAL_IMMUTABLE"); }
        else { GoalService.Version(db, upload, input.Version); upload.Status = "Approved"; upload.SnapshotId = snapshot.Id; await db.SaveChangesAsync(ct); }
        return new { snapshotId = snapshot.Id, duplicate = true, financialSaved = true };
    }
    public async Task<object> Approve(Guid id, PensionApproval input, CancellationToken ct)
    {
        RequireAccess(); Check.That(input.Confirm && input.AcknowledgeWarnings, "PENSION_REVIEW_CONFIRMATION_REQUIRED");
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(clock.GetUtcNow(), "Europe/Copenhagen").DateTime);
        Check.That(input.ReportAsOf.Year >= 1900 && input.ReportAsOf <= today, "INVALID_VALUATION_DATE");
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        if (db.Database.IsSqlServer()) await DatabaseLock.AcquireTransaction(db, "pension-approval:" + workspace.DemoScope, ct);
        var upload = await Find(id, ct);
        Check.That(upload.Status is "NeedsReview" or "Approved", "PENSION_PREVIEW_REQUIRED");
        var original = JsonSerializer.Deserialize<PensionReport>(upload.PreviewJson, Json)!;
        var reviewed = Review(original, input.Reviewed, input.Products, today) with { ReportAsOf = input.ReportAsOf,
            ReportDateSource = (original.ReportDateSource ?? new(0, "Report date", "Date", "NeedsReview")) with {
                Status = input.ReportAsOf == original.ReportAsOf ? original.ReportDateSource?.Status ?? "NeedsReview" : "UserEdited" } };
        var canonical = JsonSerializer.Serialize(reviewed with { Agreements = reviewed.Agreements.OrderBy(a => a.Key).ToArray() }, Json);
        var hash = PensionReportParser.Key(canonical);
        var same = await db.PensionSnapshots.SingleOrDefaultAsync(s => s.DocumentId == upload.DocumentId && s.ReviewHash == hash, ct);
        if (upload.Status == "Approved")
        {
            Check.That(same?.Id == upload.SnapshotId, "PENSION_APPROVAL_IMMUTABLE");
            return new { snapshotId = upload.SnapshotId, duplicate = true, financialSaved = true };
        }
        GoalService.Version(db, upload, input.Version);
        if (same is not null)
        {
            upload.Status = "Approved"; upload.SnapshotId = same.Id; await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct);
            return new { snapshotId = same.Id, duplicate = true, financialSaved = true };
        }
        var mappings = new List<PensionTarget>();
        foreach (var agreement in reviewed.Agreements)
        {
            var target = input.Products.Single(p => p.Key == agreement.Key);
            var row = target.Id.HasValue ? await db.WealthRecords.SingleOrDefaultAsync(w => w.Id == target.Id && w.Kind == "Pension", ct)
                ?? throw new ApiFailure(404, "VALUATION_NOT_FOUND") : null;
            if (row is null && await db.WealthRecords.AnyAsync(w => w.PensionSourceKey == agreement.Key
                || w.Kind == "Pension" && w.Provider == agreement.Provider && w.Name == agreement.Name, ct))
                throw new ApiFailure(409, "VALUATION_ALREADY_EXISTS_EDIT_IT");
            if (row is not null) { Check.That(row.Currency == agreement.Currency, "PENSION_PRODUCT_CURRENCY_MISMATCH"); GoalService.Version(db, row, target.Version); }
            else { Check.That(await db.WealthRecords.CountAsync(ct) + db.ChangeTracker.Entries<WealthRecord>().Count(e => e.State == EntityState.Added) < 100, "VALUATION_LIMIT"); row = new WealthRecord(); db.WealthRecords.Add(row); }
            var currency = agreement.Currency;
            var value = agreement.Balance.Value!.Value;
            WealthService.Validate(new(agreement.Name, agreement.Provider, "Pension", value, currency, agreement.AsOf!.Value,
                "PensionsInfo reviewed capital · source page " + agreement.Balance.Source.Page), clock);
            // Preserve a newer current observation when an older report is approved for history.
            if (row.AsOf <= agreement.AsOf)
            {
                row.Name = agreement.Name; row.Provider = agreement.Provider; row.Kind = "Pension"; row.Currency = currency;
                row.Value = value; row.AsOf = agreement.AsOf.Value; row.PensionSourceKey = agreement.Key;
                row.SourceNote = "PensionsInfo reviewed capital · source page " + agreement.Balance.Source.Page + ". Projection/insurance excluded; retained manual projections require separate review.";
            }
            mappings.Add(new(agreement.Key, row.Id, null));
        }
        // Compare stable product identities across PDF, JSON and manual sources.
        var coverage = PensionReportParser.Key(string.Join(":", mappings.Select(p => p.Id!.Value.ToString("N")).Order()));
        var previous = await db.PensionSnapshots.Where(s => s.AsOf == input.ReportAsOf && s.CoverageKey == coverage).OrderByDescending(s => s.ApprovedAt).ThenByDescending(s => s.Id).FirstOrDefaultAsync(ct);
        if (previous is not null && input.SupersedesId != previous.Id) throw new ApiFailure(409, "PENSION_CORRECTION_CONFIRMATION_REQUIRED", new { supersedesId = previous.Id, previous.AsOf, previous.ApprovedAt });
        if (previous is null && input.SupersedesId.HasValue) throw new ApiFailure(409, "PENSION_HISTORY_CHANGED");
        var snapshot = new PensionSnapshot { UploadId = upload.Id, DocumentId = upload.DocumentId, AsOf = input.ReportAsOf,
            ApprovedAt = clock.GetUtcNow(), ReviewHash = hash, CoverageKey = coverage, SupersedesId = previous?.Id,
            DataJson = JsonSerializer.Serialize(new PensionAccepted(reviewed, mappings.ToArray()), Json) };
        db.PensionSnapshots.Add(snapshot); upload.Status = "Approved"; upload.SnapshotId = snapshot.Id;
        await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct);
        return new { snapshotId = snapshot.Id, duplicate = false, financialSaved = true };
    }
    // Called by the explicit existing manual Save action, within its transaction. No historical backfill.
    public async Task RecordManual(WealthRecord row, CancellationToken ct)
    {
        RequireAccess();
        var key = row.PensionSourceKey ?? PensionReportParser.Key("manual:" + row.Id);
        row.PensionSourceKey = key;
        var source = new PensionSource(0, "Manual statement entry", row.Currency, "UserEdited", row.AsOf);
        PensionScenario[] scenarios = row.AnnualPension.HasValue && row.RetirementAge.HasValue
            ? [new(row.RetirementAge.Value, [new(PensionReportParser.Key(key + ":manual-projection"), row.Provider,
                "ManualProjection", row.RetirementAge.Value, row.RetirementAge.Value,
                new(row.AnnualPension.Value, source with { Unit = row.Currency + "/year" }))])] : [];
        var report = new PensionReport("manual-1", 0, row.AsOf,
            [new(key, row.Provider, row.Name, row.AsOf, new(row.Value, source),
                new(null, source with { Unit = row.Currency + "/year", Status = "NeedsReview" }), [], row.Currency,
                source with { Unit = "Date" })], scenarios, [], [new("MANUAL_BALANCE_ONLY", null, "Coverage")], false, false);
        var raw = JsonSerializer.SerializeToUtf8Bytes(report, Json);
        var hash = PensionReportParser.Key(System.Text.Encoding.UTF8.GetString(raw));
        var doc = await db.PensionDocuments.SingleOrDefaultAsync(d => d.Hash == hash, ct);
        if (doc is null) { doc = new() { Hash = hash, ByteLength = raw.Length, MediaType = "application/json", Synthetic = workspace.Mode == "Demo", ProtectedOriginal = Protector.Protect(raw) }; db.Add(doc); }
        var upload = new PensionUpload { DocumentId = doc.Id, UploadedAt = clock.GetUtcNow(), ParserVersion = "manual-1", Status = "Approved", PreviewJson = JsonSerializer.Serialize(report, Json) };
        db.Add(upload);
        var same = await db.PensionSnapshots.SingleOrDefaultAsync(s => s.DocumentId == doc.Id && s.ReviewHash == hash, ct);
        if (same is null)
        {
            var coverage = PensionReportParser.Key(row.Id.ToString("N"));
            var previous = await db.PensionSnapshots.Where(s => s.CoverageKey == coverage && s.AsOf == row.AsOf).OrderByDescending(s => s.ApprovedAt).FirstOrDefaultAsync(ct);
            same = new() { DocumentId = doc.Id, UploadId = upload.Id, AsOf = row.AsOf, ApprovedAt = clock.GetUtcNow(), ReviewHash = hash, CoverageKey = coverage,
                SupersedesId = previous?.Id, DataJson = JsonSerializer.Serialize(new PensionAccepted(report, [new(key, row.Id, null)]), Json) };
            db.Add(same);
        }
        upload.SnapshotId = same.Id;
    }
    static string Label(string value)
    {
        Check.Text(value, 120);
        Check.That(!Regex.IsMatch(value, @"\d{6}[- ]?\d{4}|@|https?://", RegexOptions.IgnoreCase, TimeSpan.FromMilliseconds(100)), "PENSION_PRIVATE_LABEL");
        return value.Trim();
    }
    static PensionNumber Edited(PensionNumber original, PensionNumber reviewed)
    {
        Check.That(reviewed.Value is null or >= 0 and <= 100_000_000 && (!reviewed.Value.HasValue || decimal.Round(reviewed.Value.Value, 2) == reviewed.Value), "INVALID_WEALTH_VALUE");
        return original with { Value = reviewed.Value, Source = original.Source with { Status = reviewed.Value == original.Value ? original.Source.Status : "UserEdited" } };
    }
    public static PensionReport Review(PensionReport original, PensionReport submitted, PensionTarget[] products, DateOnly today)
    {
        Check.That(products.Length > 0 && products.Length <= original.Agreements.Length
            && products.Select(p => p.Key).Distinct().Count() == products.Length
            && products.Where(p => p.Id.HasValue).Select(p => p.Id).Distinct().Count() == products.Count(p => p.Id.HasValue), "PENSION_PRODUCT_SELECTION_REQUIRED");
        var agreements = new List<PensionAgreement>();
        foreach (var mapping in products)
        {
            var source = original.Agreements.SingleOrDefault(a => a.Key == mapping.Key) ?? throw new ApiFailure(400, "PENSION_UNKNOWN_FIELD");
            var edit = submitted.Agreements.SingleOrDefault(a => a.Key == mapping.Key) ?? throw new ApiFailure(400, "PENSION_UNKNOWN_FIELD");
            Check.That(edit.Balance.Value.HasValue && edit.AsOf.HasValue && edit.AsOf.Value.Year >= 1900 && edit.AsOf <= today, "PENSION_BALANCE_AND_DATE_REQUIRED");
            Check.That(edit.Components.Length == source.Components.Length, "PENSION_UNKNOWN_FIELD");
            var components = source.Components.Select(c => c with { Balance = Edited(c.Balance,
                edit.Components.SingleOrDefault(e => e.Key == c.Key)?.Balance ?? throw new ApiFailure(400, "PENSION_UNKNOWN_FIELD")) }).ToArray();
            agreements.Add(source with { Provider = Label(edit.Provider), Name = Label(edit.Name), AsOf = edit.AsOf,
                DateSource = (source.DateSource ?? new(0, "Balance date", "Date", "NeedsReview")) with { Status = edit.AsOf == source.AsOf ? source.DateSource?.Status ?? "NeedsReview" : "UserEdited" },
                Balance = Edited(source.Balance, edit.Balance), AnnualContribution = Edited(source.AnnualContribution, edit.AnnualContribution), Components = components });
        }
        // Projection/insurance provenance and identities remain server-owned; only numeric amounts can be reviewed.
        var scenarios = original.Scenarios.Select(s => s with { Payouts = s.Payouts.Select(p => p with { Amount = Edited(p.Amount,
            submitted.Scenarios.SingleOrDefault(e => e.StartAge == s.StartAge)?.Payouts.SingleOrDefault(e => e.Key == p.Key)?.Amount
                ?? throw new ApiFailure(400, "PENSION_UNKNOWN_FIELD")) }).ToArray() }).ToArray();
        var insurance = original.Insurance.Select(p => p with { Amount = Edited(p.Amount,
            submitted.Insurance.SingleOrDefault(e => e.Key == p.Key)?.Amount ?? throw new ApiFailure(400, "PENSION_UNKNOWN_FIELD")) }).ToArray();
        return original with { Agreements = agreements.ToArray(), Scenarios = scenarios, Insurance = insurance };
    }
}
