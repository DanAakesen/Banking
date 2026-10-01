using System.Data;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Banking.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Banking.Api.Services;

public sealed record ReviewRef(string Key, string Signature);
public sealed record ReviewInput(string Kind, IReadOnlyList<ReviewRef> Items, Guid? CategoryId = null, string? RuleContains = null);
public sealed record ReviewUndo(string Version);
public sealed record ReviewEntry(Guid Id, Guid AccountId, string Description, decimal Amount, string Currency, DateOnly? BookingDate, string Version);
public sealed record ReviewItem(string Key, string Signature, string Kind, ReviewEntry Transaction, ReviewEntry? Counterpart,
    string? Evidence = null, Guid? SuggestedCategoryId = null, string? MerchantCategory = null);

public sealed class ReviewService(BankingDb db, TimeProvider clock)
{
    private sealed record SavedCategory(Guid Id, Guid? CategoryId, string Classification, string AfterVersion);
    private sealed record UndoPayload(List<SavedCategory> Categories, Guid? MatchId = null, string? MatchVersion = null,
        Guid? RuleId = null, string? RuleVersion = null, string? Description = null, int Count = 1,
        List<ReviewEntry>? Transactions = null);
    private static ReviewEntry Entry(BankTransaction x) => new(x.Id, x.AccountId, x.Description, x.Amount, x.Currency, x.BookingDate, Convert.ToBase64String(x.Version));
    private static ReviewItem Item(string kind, BankTransaction a, BankTransaction? b = null)
    {
        var key = kind.ToLowerInvariant() + ":" + a.Id + (b is null ? "" : ":" + b.Id);
        // A transfer rejection survives category edits, but not changes to the underlying bank entries.
        var state = b == null ? Convert.ToBase64String(a.Version) : JsonSerializer.Serialize(new[] { a, b }.Select(x => new { x.Id, x.AccountId, x.Amount, x.Currency, x.BookingDate, x.Description, x.Status, x.Current }));
        var signature = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(key + state)));
        return new(key, signature, kind, Entry(a), b is null ? null : Entry(b));
    }

    private async Task<List<ReviewItem>> Pending(CancellationToken ct)
    {
        // Pair globally before applying an account filter, so the other account remains discoverable.
        var rows = await db.Transactions.AsNoTracking().Where(x => x.Current && x.Status == "BOOK"
            && !db.Transfers.Any(m => m.OutgoingId == x.Id || m.IncomingId == x.Id)).Take(50001).ToListAsync(ct);
        Check.That(rows.Count <= 50000, "REVIEW_HISTORY_LIMIT");
        var now = clock.GetUtcNow();
        var dispositions = await db.ReviewActions.AsNoTracking().Where(x => x.UndoneAt == null
            && (x.Kind == "Dismiss" || x.Kind == "Skip" && x.SnoozeUntil > now))
            .Select(x => new { x.Kind, x.ItemKey, x.Signature }).Take(50001).ToListAsync(ct);
        Check.That(dispositions.Count <= 50000, "REVIEW_HISTORY_LIMIT");
        var dismissed = dispositions.Where(x => x.Kind == "Dismiss").Select(x => (x.ItemKey, x.Signature)).ToHashSet();
        var skipped = dispositions.Where(x => x.Kind == "Skip").Select(x => (x.ItemKey, x.Signature)).ToHashSet();
        var pairs = new List<ReviewItem>();
        var accounts = await db.Accounts.AsNoTracking().ToDictionaryAsync(x => x.Id, ct);
        var categories = await db.Categories.AsNoTracking().ToListAsync(ct);
        foreach (var group in rows.Where(x => x.BookingDate != null && x.Amount != 0)
            .GroupBy(x => (x.Currency, x.BookingDate, Amount: Math.Abs(x.Amount))))
        {
            var outgoing = group.Where(x => x.Amount < 0).ToArray();
            var incoming = group.Where(x => x.Amount > 0).ToArray();
            // Extremely repetitive batches need manual matching, not quadratic candidate expansion.
            if (outgoing.Length + incoming.Length > 500) continue;
            var candidates = (from a in outgoing from b in incoming
                where a.AccountId != b.AccountId
                let evidence = TransferEvidence(a,b,accounts)
                where evidence != "Conflict" && (evidence == "AccountIdentity" || outgoing.Length == 1 && incoming.Length == 1)
                select (a,b,evidence)).ToList();
            foreach (var candidate in candidates)
            {
                // Identity evidence may resolve equal-amount collisions, but never an ambiguous pair.
                if (candidates.Count(x => x.a.Id == candidate.a.Id) != 1 || candidates.Count(x => x.b.Id == candidate.b.Id) != 1) continue;
                var pair = Item("Transfer",candidate.a,candidate.b) with { Evidence = candidate.evidence };
                if (!dismissed.Contains((pair.Key,pair.Signature))) pairs.Add(pair);
            }
        }
        var paired = pairs.SelectMany(x => new[] { x.Transaction.Id, x.Counterpart!.Id }).ToHashSet();
        var items = rows.Where(x => x.CategoryId == null && !paired.Contains(x.Id)).Select(x =>
        {
            var merchant = x.Amount < 0 ? BankDetails.MerchantCategory(BankDetails.Of(x)?.MerchantCategoryCode) : null;
            var names = merchant switch { "Groceries" => new[] { "Groceries", "Dagligvarer" }, "Dining" => ["Dining", "Restaurants", "Restaurant"],
                "Fuel" => ["Fuel", "Transport", "Benzin"], "Internet & phone" => ["Internet & phone", "Utilities", "Internet"],
                _ => new[] { merchant ?? "" } };
            var suggestions = categories.Where(c => names.Contains(c.Name,StringComparer.OrdinalIgnoreCase)).ToList();
            return Item("Category", x) with { MerchantCategory = merchant, SuggestedCategoryId = suggestions.Count == 1 ? suggestions[0].Id : null,
                Evidence = merchant is not null ? "MerchantCategory" : null };
        }).Concat(pairs);
        return items.Where(x => !skipped.Contains((x.Key, x.Signature))).ToList();
    }

    public static string TransferEvidence(BankTransaction outgoing, BankTransaction incoming, IReadOnlyDictionary<Guid,Account> accounts)
    {
        var destination = BankDetails.Of(outgoing)?.CreditorAccount;
        var source = BankDetails.Of(incoming)?.DebtorAccount;
        bool Conflicts(Providers.BankIdentifier? id, Account account)
        {
            var ids = BankDetails.Read<Providers.AccountBankDetails>(account.BankDetailsJson)?.Identifiers;
            return id is not null && ids is not null && ids.Any(x => x.Scheme == id.Scheme) && !BankDetails.Identifies(id,account);
        }
        if (Conflicts(destination,accounts[incoming.AccountId]) || Conflicts(source,accounts[outgoing.AccountId])) return "Conflict";
        return BankDetails.Identifies(destination,accounts[incoming.AccountId]) || BankDetails.Identifies(source,accounts[outgoing.AccountId])
            ? "AccountIdentity" : "AmountAndDate";
    }

    public async Task<object> Queue(Guid? accountId, string kind, string sort, int offset, CancellationToken ct)
    {
        Check.That(kind is "All" or "Category" or "Transfer", "INVALID_REVIEW_KIND");
        Check.That(sort is "newest" or "oldest" && offset is >= 0 and <= 50000, "INVALID_PAGE");
        if (accountId != null && !await db.Accounts.AnyAsync(x => x.Id == accountId, ct)) throw new ApiFailure(404, "ACCOUNT_NOT_FOUND");
        await using var snapshot = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        var pending = await Pending(ct);
        var scoped = pending.Where(x => accountId == null || x.Transaction.AccountId == accountId || x.Counterpart?.AccountId == accountId).ToList();
        var filtered = scoped.Where(x => kind == "All" || x.Kind == kind).ToList();
        var ordered = sort == "newest" ? filtered.OrderByDescending(x => x.Transaction.BookingDate) : filtered.OrderBy(x => x.Transaction.BookingDate);
        await snapshot.CommitAsync(ct);
        return new { total = filtered.Count, globalTotal = pending.Count, offset, limit = 8,
            counts = new { all = scoped.Count, categories = scoped.Count(x => x.Kind == "Category"), transfers = scoped.Count(x => x.Kind == "Transfer") },
            items = ordered.ThenBy(x => x.Key).Skip(offset).Take(8), generatedAt = clock.GetUtcNow() };
    }

    public async Task<object> History(int offset, CancellationToken ct)
    {
        Check.That(offset is >= 0 and <= 100000, "INVALID_PAGE");
        var total = await db.ReviewActions.CountAsync(ct);
        var rows = await db.ReviewActions.AsNoTracking().OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip(offset).Take(10).ToListAsync(ct);
        return new { total, offset, items = rows.Select(x => { var p = JsonSerializer.Deserialize<UndoPayload>(x.Payload)!;
            return new { x.Id, x.Kind, x.CreatedAt, x.SnoozeUntil, x.UndoneAt, x.Version, p.Description, p.Count }; }) };
    }

    public async Task<object> Apply(ReviewInput input, CancellationToken ct)
    {
        Check.That(input.Kind is "Categorize" or "ConfirmTransfer" or "Skip" or "Dismiss", "INVALID_REVIEW_ACTION");
        Check.That(input.Items is { Count: > 0 and <= 50 } && input.Items.All(x => x != null) && input.Items.Select(x => x.Key).Distinct().Count() == input.Items.Count, "INVALID_REVIEW_SELECTION");
        Check.That(input.Items.All(x => x != null && !string.IsNullOrEmpty(x.Key) && x.Key.Length <= 100 && x.Signature?.Length == 64), "INVALID_REVIEW_SELECTION");
        Check.That(input.Kind == "Categorize" || input.Items.Count == 1, "INVALID_REVIEW_SELECTION");
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        var pending = (await Pending(ct)).ToDictionary(x => x.Key);
        var selected = input.Items.Select(x => pending.TryGetValue(x.Key, out var item) && item.Signature == x.Signature ? item : throw new ApiFailure(409, "REVIEW_ITEM_CHANGED")).ToList();
        var action = new ReviewAction { Kind = input.Kind, ItemKey = selected[0].Key, Signature = selected[0].Signature, CreatedAt = clock.GetUtcNow() };
        var prior = new List<(BankTransaction Row, Guid? Category, string Classification)>();
        TransferMatch? match = null; CategoryRule? rule = null;
        if (input.Kind == "Categorize")
        {
            Check.That(selected.All(x => x.Kind == "Category"), "INVALID_REVIEW_SELECTION");
            if (input.CategoryId == null || !await db.Categories.AnyAsync(x => x.Id == input.CategoryId, ct)) throw new ApiFailure(400, "CATEGORY_NOT_FOUND");
            foreach (var item in selected)
            {
                var row = await db.Transactions.FindAsync([item.Transaction.Id], ct) ?? throw new ApiFailure(409, "REVIEW_ITEM_CHANGED");
                prior.Add((row, row.CategoryId, row.Classification));
                db.ClassificationChanges.Add(new ClassificationChange { TransactionId = row.Id, PreviousCategoryId = row.CategoryId, CategoryId = input.CategoryId, ChangedAt = clock.GetUtcNow() });
                row.CategoryId = input.CategoryId; row.Classification = "Manual";
            }
            if (input.RuleContains is not null)
            {
                Check.That(selected.Count == 1, "RULE_REQUIRES_SINGLE_ITEM");
                var contains = Check.Text(input.RuleContains, 200);
                Check.That(selected[0].Transaction.Description.Contains(contains, StringComparison.OrdinalIgnoreCase), "RULE_MUST_MATCH_TRANSACTION");
                Check.That(await db.Rules.CountAsync(ct) < 500, "RULE_LIMIT");
                rule = new CategoryRule { Contains = contains, CategoryId = input.CategoryId.Value, Priority = 0 }; db.Rules.Add(rule);
            }
        }
        else if (input.Kind == "ConfirmTransfer")
        {
            Check.That(selected[0].Kind == "Transfer", "INVALID_REVIEW_SELECTION");
            match = new TransferMatch { OutgoingId = selected[0].Transaction.Id, IncomingId = selected[0].Counterpart!.Id }; db.Transfers.Add(match);
        }
        else
        {
            Check.That(input.Kind != "Dismiss" || selected[0].Kind == "Transfer", "INVALID_REVIEW_SELECTION");
            if (input.Kind == "Skip") action.SnoozeUntil = clock.GetUtcNow().AddHours(24);
        }
        await db.SaveChangesAsync(ct);
        action.Payload = JsonSerializer.Serialize(new UndoPayload(prior.Select(x => new SavedCategory(x.Row.Id, x.Category, x.Classification, Convert.ToBase64String(x.Row.Version))).ToList(),
            match?.Id, match == null ? null : Convert.ToBase64String(match.Version), rule?.Id, rule == null ? null : Convert.ToBase64String(rule.Version),
            selected[0].Transaction.Description, selected.Count, selected.SelectMany(x => x.Counterpart == null ? new[] { x.Transaction } : new[] { x.Transaction, x.Counterpart }).ToList()));
        db.ReviewActions.Add(action); await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct);
        return new { action.Id, action.Version };
    }

    private static void RequireVersion(Entity item, string? version)
    { if (version == null || Convert.ToBase64String(item.Version) != version) throw new ApiFailure(409, "REVIEW_UNDO_CONFLICT"); }

    public async Task<object> Undo(Guid id, string version, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        var action = await db.ReviewActions.FindAsync([id], ct) ?? throw new ApiFailure(404, "REVIEW_ACTION_NOT_FOUND");
        RequireVersion(action, version);
        if (action.UndoneAt != null) throw new ApiFailure(409, "REVIEW_ALREADY_UNDONE");
        var p = JsonSerializer.Deserialize<UndoPayload>(action.Payload)!;
        foreach (var saved in p.Categories)
        {
            var row = await db.Transactions.FindAsync([saved.Id], ct) ?? throw new ApiFailure(409, "REVIEW_UNDO_CONFLICT");
            RequireVersion(row, saved.AfterVersion);
            if (saved.CategoryId != null && !await db.Categories.AnyAsync(x => x.Id == saved.CategoryId, ct)) throw new ApiFailure(409, "REVIEW_UNDO_CONFLICT");
            db.ClassificationChanges.Add(new ClassificationChange { TransactionId = row.Id, PreviousCategoryId = row.CategoryId, CategoryId = saved.CategoryId, ChangedAt = clock.GetUtcNow() });
            row.CategoryId = saved.CategoryId; row.Classification = saved.Classification;
        }
        if (p.RuleId != null)
        {
            var rule = await db.Rules.FindAsync([p.RuleId], ct) ?? throw new ApiFailure(409, "REVIEW_UNDO_CONFLICT"); RequireVersion(rule, p.RuleVersion);
            // A rule already used elsewhere must not be removed as though nothing else happened.
            if (await db.Transactions.AnyAsync(x => x.Classification == "Rule" && x.CategoryId == rule.CategoryId && x.Description.Contains(rule.Contains), ct))
                throw new ApiFailure(409, "REVIEW_UNDO_CONFLICT");
            db.Rules.Remove(rule);
        }
        if (p.MatchId != null)
        {
            var match = await db.Transfers.FindAsync([p.MatchId], ct) ?? throw new ApiFailure(409, "REVIEW_UNDO_CONFLICT"); RequireVersion(match, p.MatchVersion);
            foreach (var entry in p.Transactions ?? [])
            { var row = await db.Transactions.FindAsync([entry.Id], ct) ?? throw new ApiFailure(409, "REVIEW_UNDO_CONFLICT"); RequireVersion(row, entry.Version); }
            db.Transfers.Remove(match);
        }
        action.UndoneAt = clock.GetUtcNow(); await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct);
        return new { action.Id, action.Version, action.UndoneAt };
    }
}
