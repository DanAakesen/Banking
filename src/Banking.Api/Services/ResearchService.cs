using Banking.Api.Data;
using Microsoft.EntityFrameworkCore;
namespace Banking.Api.Services;

public sealed class ResearchItem : Entity
{
    public string Name { get; set; } = "";
    public string Symbol { get; set; } = "";
    public string Notes { get; set; } = "";
    public string? Url { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
public sealed record ResearchInput(string Name,string Symbol,string Notes,string? Url=null,string? Version=null);
public sealed class ResearchService(BankingDb db,TimeProvider clock)
{
    public Task<ResearchItem[]> List(CancellationToken ct)=>db.ResearchItems.AsNoTracking().OrderByDescending(x=>x.UpdatedAt).Take(100).ToArrayAsync(ct);
    public async Task<ResearchItem> Save(Guid? id,ResearchInput input,CancellationToken ct)
    {
        Check.Text(input.Name,120);Check.Text(input.Symbol,24);Check.That(input.Symbol.All(c=>char.IsAsciiLetterOrDigit(c)||".^:_-".Contains(c)),"INVALID_SYMBOL");
        Check.That(input.Notes is not null&&input.Notes.Length<=4000,"INVALID_RESEARCH_NOTES");
        Check.That(string.IsNullOrWhiteSpace(input.Url)||input.Url.Length<=1000&&Uri.TryCreate(input.Url,UriKind.Absolute,out var u)&&u.Scheme=="https"&&string.IsNullOrEmpty(u.UserInfo),"INVALID_RESEARCH_URL");
        var row=id.HasValue?await db.ResearchItems.SingleOrDefaultAsync(x=>x.Id==id,ct)??throw new ApiFailure(404,"RESEARCH_NOT_FOUND"):new ResearchItem();
        if(id.HasValue)GoalService.Version(db,row,input.Version);else{Check.That(await db.ResearchItems.CountAsync(ct)<100,"RESEARCH_LIMIT");db.ResearchItems.Add(row);}
        row.Name=input.Name.Trim();row.Symbol=input.Symbol.ToUpperInvariant();row.Notes=input.Notes!;row.Url=string.IsNullOrWhiteSpace(input.Url)?null:input.Url.Trim();row.UpdatedAt=clock.GetUtcNow();
        await db.SaveChangesAsync(ct);return row;
    }
    public async Task Delete(Guid id,string version,CancellationToken ct){var row=await db.ResearchItems.SingleOrDefaultAsync(x=>x.Id==id,ct)??throw new ApiFailure(404,"RESEARCH_NOT_FOUND");GoalService.Version(db,row,version);db.ResearchItems.Remove(row);await db.SaveChangesAsync(ct);}
}
