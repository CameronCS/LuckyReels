using DataAccessServiceInterface;
using DatabaseEntities;
using Microsoft.EntityFrameworkCore;
using SystemFramework.Security;

namespace DataAccessService;

public class PlinkoDataService(App_DBContext context, ActiveTenantService activeTenantService) : BaseDataService(context, activeTenantService), IPlinkoDataService {
    public async Task<UsrPlayer> GetPlayerByIdAsync(Guid id, CancellationToken ct = default)
        => await _context.UsrPlayers.FirstOrDefaultAsync(p => p.Id == id, ct);

    public async Task UpdatePlayerTokensAsync(Guid id, int tokens, CancellationToken ct = default)
        => await _context.UsrPlayers
            .Where(p => p.Id == id)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.Tokens, tokens), ct);
}
