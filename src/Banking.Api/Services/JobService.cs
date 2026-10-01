using Banking.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Banking.Api.Services;

public sealed record RetryInput(string Version, bool Restart = false);
public sealed class JobService(BankingDb db, TimeProvider clock)
{
    public async Task<object> Retry(Guid id, RetryInput input, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var connectionId = await db.Jobs.Where(x => x.Id == id).Select(x => (Guid?)x.Account.ConnectionId).SingleOrDefaultAsync(ct)
            ?? throw new ApiFailure(404, "JOB_NOT_FOUND");
        await DatabaseLock.AcquireTransaction(db, $"Banking:connection:{connectionId}", ct);
        var job = await db.Jobs.Include(x => x.Account).ThenInclude(x => x.Connection).SingleAsync(x => x.Id == id, ct);
        if (job.Status != "Failed") throw new ApiFailure(409, "JOB_NOT_FAILED");
        if (string.IsNullOrWhiteSpace(input.Version)) throw new ApiFailure(428, "VERSION_REQUIRED");
        if (!job.Version.SequenceEqual(Convert.FromBase64String(input.Version))) throw new ApiFailure(409, "VERSION_CONFLICT");
        if (await db.Jobs.AnyAsync(x => x.AccountId == job.AccountId && (x.Status == "Queued" || x.Status == "Running"), ct))
            throw new ApiFailure(409, "IMPORT_STILL_ACTIVE");
        var now = clock.GetUtcNow();
        if (job.Account.Connection.Status != "Active" || job.Account.Connection.ValidUntil <= now || !job.Account.Accessible)
            throw new ApiFailure(409, "RECONNECT_REQUIRED");
        if (input.Restart)
        {
            job = ConnectionService.NewJob(job.AccountId, now, job.FullHistory);
            db.Jobs.Add(job);
        }
        else { job.Status = "Queued"; job.Attempts = 0; job.CompletedAt = null; job.ErrorCode = null; }
        // Manual retry is explicit, but does not override known bank/provider cooldowns.
        var connection = await db.Connections.SingleAsync(x => x.Id == connectionId, ct);
        var lastAttempt = await db.Jobs.Where(x => x.AccountId == job.AccountId).MaxAsync(x => x.LastAttemptAt, ct);
        job.NextAttempt = now;
        if (!connection.IsDemo && lastAttempt?.AddHours(6) > job.NextAttempt) job.NextAttempt = lastAttempt.Value.AddHours(6);
        if (connection.RetryNotBefore > job.NextAttempt) job.NextAttempt = connection.RetryNotBefore.Value;
        await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct);
        return new { job.Id, job.Status, job.NextAttempt, job.Version };
    }
}
