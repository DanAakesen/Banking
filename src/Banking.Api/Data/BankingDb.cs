using Microsoft.EntityFrameworkCore;
using Banking.Api.Security;
using System.Linq.Expressions;

namespace Banking.Api.Data;

public sealed class BankingDb(DbContextOptions<BankingDb> options, Workspace? workspace = null) : DbContext(options)
{
    public string CurrentDemoScope => workspace?.DemoScope ?? "";
    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        foreach (var entry in ChangeTracker.Entries<Entity>())
        {
            if (entry.State == EntityState.Added) entry.Entity.DemoScope = CurrentDemoScope;
            else if (entry.State is EntityState.Modified or EntityState.Deleted && entry.Entity.DemoScope != CurrentDemoScope)
                throw new InvalidOperationException("Cross-session writes are forbidden.");
        }
        return base.SaveChangesAsync(cancellationToken);
    }
    public DbSet<Connection> Connections => Set<Connection>();
    public DbSet<Account> Accounts => Set<Account>();
    public DbSet<AccountAlias> AccountAliases => Set<AccountAlias>();
    public DbSet<BankTransaction> Transactions => Set<BankTransaction>();
    public DbSet<BalanceSnapshot> Balances => Set<BalanceSnapshot>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<CategoryRule> Rules => Set<CategoryRule>();
    public DbSet<Budget> Budgets => Set<Budget>();
    public DbSet<BudgetPlan> BudgetPlans => Set<BudgetPlan>();
    public DbSet<BudgetEntry> BudgetEntries => Set<BudgetEntry>();
    public DbSet<Goal> Goals => Set<Goal>();
    public DbSet<Banking.Api.Services.LoanRecord> Loans => Set<Banking.Api.Services.LoanRecord>();
    public DbSet<Banking.Api.Services.WealthRecord> WealthRecords => Set<Banking.Api.Services.WealthRecord>();
    public DbSet<Banking.Api.Services.ResearchItem> ResearchItems => Set<Banking.Api.Services.ResearchItem>();
    public DbSet<ReviewAction> ReviewActions => Set<ReviewAction>();
    public DbSet<ClassificationChange> ClassificationChanges => Set<ClassificationChange>();
    public DbSet<TransferMatch> Transfers => Set<TransferMatch>();
    public DbSet<SyncJob> Jobs => Set<SyncJob>();
    public DbSet<ImportItem> ImportItems => Set<ImportItem>();
    public DbSet<AuthorizationAttempt> Authorizations => Set<AuthorizationAttempt>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        foreach (var entity in model.Model.GetEntityTypes())
        {
            foreach (var property in entity.GetProperties())
            {
                if (property.ClrType == typeof(string)) property.SetMaxLength(2000);
                if (property.Name == "Currency") property.SetMaxLength(3);
                if (property.ClrType == typeof(decimal) || property.ClrType == typeof(decimal?)) { property.SetPrecision(19); property.SetScale(4); }
            }
            model.Entity(entity.ClrType).Property(nameof(Entity.Version)).IsRowVersion();
            model.Entity(entity.ClrType).Property(nameof(Entity.DemoScope)).HasMaxLength(64).HasDefaultValue("");
            var row = Expression.Parameter(entity.ClrType, "row");
            model.Entity(entity.ClrType).HasQueryFilter(Expression.Lambda(Expression.Equal(
                Expression.Property(row, nameof(Entity.DemoScope)), Expression.Property(Expression.Constant(this), nameof(CurrentDemoScope))), row));
        }
        model.Entity<Account>().Property(x => x.IdentityHash).HasMaxLength(64);
        model.Entity<Banking.Api.Services.ResearchItem>().Property(x=>x.Notes).HasMaxLength(4000);
        model.Entity<Banking.Api.Services.WealthRecord>().Property(x => x.Name).HasMaxLength(120);
        model.Entity<Banking.Api.Services.WealthRecord>().Property(x => x.Provider).HasMaxLength(120);
        model.Entity<Banking.Api.Services.WealthRecord>().Property(x => x.Kind).HasMaxLength(16);
        model.Entity<Banking.Api.Services.WealthRecord>().HasIndex(x => new { x.DemoScope, x.Kind, x.Provider, x.Name }).IsUnique();
        model.Entity<Account>().Property(x => x.CustomName).HasMaxLength(200);
        model.Entity<Account>().Property(x => x.BankDetailsJson).HasMaxLength(12000);
        model.Entity<BankTransaction>().Property(x => x.BankDetailsJson).HasMaxLength(12000);
        model.Entity<Account>().HasIndex(x => new { x.ConnectionId, x.IdentityHash }).IsUnique();
        model.Entity<AccountAlias>().Property(x => x.IdentityHash).HasMaxLength(64);
        model.Entity<AccountAlias>().HasIndex(x => new { x.ConnectionId, x.IdentityHash }).IsUnique();
        model.Entity<AccountAlias>().HasOne<Connection>().WithMany().HasForeignKey(x => x.ConnectionId);
        model.Entity<BankTransaction>().Property(x => x.SourceKey).HasMaxLength(80);
        model.Entity<BankTransaction>().HasIndex(x => new { x.AccountId, x.SourceKey }).IsUnique();
        model.Entity<BankTransaction>().HasIndex(x => new { x.BookingDate, x.Currency, x.CategoryId });
        model.Entity<Category>().Property(x => x.Name).HasMaxLength(80);
        model.Entity<Category>().HasIndex(x => new { x.DemoScope, x.Name }).IsUnique();
        model.Entity<SyncJob>().Property(x => x.Status).HasMaxLength(24);
        model.Entity<SyncJob>().Property(x => x.Cursor).HasMaxLength(16000);
        model.Entity<SyncJob>().HasIndex(x => x.AccountId).IsUnique()
            .HasFilter("[Status] IN ('Queued', 'Running')");
        model.Entity<SyncJob>().HasIndex(x => new { x.Status, x.NextAttempt });
        model.Entity<ImportItem>().HasIndex(x => new { x.JobId, x.Ordinal }).IsUnique();
        model.Entity<ImportItem>().Property(x => x.Payload).HasMaxLength(16000);
        model.Entity<AuthorizationAttempt>().Property(x => x.StateHash).HasMaxLength(64);
        model.Entity<AuthorizationAttempt>().Property(x => x.PendingSession).HasColumnType("nvarchar(max)").Metadata.SetMaxLength(null);
        model.Entity<AuthorizationAttempt>().HasIndex(x => x.StateHash).IsUnique();
        model.Entity<Budget>().HasIndex(x => new { x.CategoryId, x.From, x.To, x.Currency }).IsUnique();
        model.Entity<BudgetPlan>().Property(x => x.Name).HasMaxLength(120);
        model.Entity<BudgetPlan>().Property(x => x.LastRequestHash).HasMaxLength(64);
        model.Entity<BudgetPlan>().HasIndex(x => new { x.DemoScope, x.IsActive }).IsUnique().HasFilter("[IsActive] = 1");
        model.Entity<BudgetPlan>().HasMany(x => x.Entries).WithOne().HasForeignKey(x => x.BudgetPlanId);
        model.Entity<BudgetEntry>().HasOne<Category>().WithMany().HasForeignKey(x => x.CategoryId).OnDelete(DeleteBehavior.Restrict);
        model.Entity<BudgetEntry>().HasOne<Account>().WithMany().HasForeignKey(x => x.SavingsAccountId).OnDelete(DeleteBehavior.Restrict);
        model.Entity<BudgetEntry>().Property(x => x.Name).HasMaxLength(120);
        model.Entity<BudgetEntry>().Property(x => x.Type).HasMaxLength(10);
        model.Entity<BudgetEntry>().Property(x => x.Source).HasMaxLength(24);
        model.Entity<Goal>().Property(x => x.Name).HasMaxLength(120);
        model.Entity<Goal>().Property(x => x.Notes).HasMaxLength(8000);
        model.Entity<Goal>().Property(x => x.ReferencesJson).HasMaxLength(24000);
        model.Entity<Goal>().Property(x => x.PhotoDataUrl).HasMaxLength(60000);
        model.Entity<Goal>().Property(x => x.ContributionDay).HasDefaultValue(1);
        model.Entity<ReviewAction>().Property(x => x.Kind).HasMaxLength(24);
        model.Entity<ReviewAction>().Property(x => x.ItemKey).HasMaxLength(100);
        model.Entity<ReviewAction>().Property(x => x.Signature).HasMaxLength(64);
        model.Entity<ReviewAction>().Property(x => x.Payload).HasColumnType("nvarchar(max)").Metadata.SetMaxLength(null);
        model.Entity<ReviewAction>().HasIndex(x => x.CreatedAt);
        model.Entity<ReviewAction>().HasIndex(x => new { x.ItemKey, x.Signature });
        model.Entity<TransferMatch>().HasIndex(x => x.OutgoingId).IsUnique();
        model.Entity<TransferMatch>().HasIndex(x => x.IncomingId).IsUnique();
        foreach (var relation in model.Model.GetEntityTypes().SelectMany(x => x.GetForeignKeys()))
            relation.DeleteBehavior = DeleteBehavior.Restrict;
    }
}
