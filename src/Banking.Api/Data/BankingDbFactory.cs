using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Banking.Api.Data;

public sealed class BankingDbFactory : IDesignTimeDbContextFactory<BankingDb>
{
    public BankingDb CreateDbContext(string[] args) => new(new DbContextOptionsBuilder<BankingDb>()
        .UseSqlServer("Server=(localdb)\\Banking;Database=Banking_Local;Integrated Security=true;TrustServerCertificate=true", x => x.UseCompatibilityLevel(150)).Options);
}
