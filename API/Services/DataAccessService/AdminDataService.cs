using DataAccessServiceInterface;
using DatabaseEntities;
using Microsoft.EntityFrameworkCore;
using SystemFramework.Security;

namespace DataAccessService;

public class AdminDataService(App_DBContext context, ActiveTenantService activeTenantService) : BaseDataService(context, activeTenantService), IAdminDataService {
    public async Task<List<UsrPlayer>> GetPlayersPagedAsync(int skip, int take, string search, IReadOnlySet<Guid> onlineIds, CancellationToken ct = default) {
        IQueryable<UsrPlayer> q = _context.UsrPlayers;
        if (!string.IsNullOrWhiteSpace(search)) {
            q = q.Where(p => p.Name.Contains(search));
        }
        if (onlineIds.Count > 0) {
            // Materialise to List<Guid> so EF Core translates Contains → SQL IN (...)
            List<Guid> ids = onlineIds.ToList();
            q = q.OrderByDescending(p => ids.Contains(p.Id)).ThenBy(p => p.Name);
        } else {
            q = q.OrderBy(p => p.Name);
        }
        return await q.Skip(skip).Take(take)
            .Select(p => new UsrPlayer {
                Id = p.Id,
                Name = p.Name,
                Email = p.Email,
                Tokens = p.Tokens,
                LastBonusAt = p.LastBonusAt,
                CreatedAt = p.CreatedAt,
                ProfileAvatar = p.ProfileAvatar,
                ProfileImageContentType = p.ProfileImageContentType,
                ProfileImageUpdatedAt = p.ProfileImageUpdatedAt,
                Permission = p.Permission
            })
            .ToListAsync(ct);
    }

    public async Task<int> GetPlayerCountAsync(string search, CancellationToken ct = default) {
        IQueryable<UsrPlayer> q = _context.UsrPlayers;
        if (!string.IsNullOrWhiteSpace(search)) {
            q = q.Where(p => p.Name.Contains(search));
        }
        return await q.CountAsync(ct);
    }

    public async Task<UsrPlayer> GetPlayerByIdAsync(Guid id, CancellationToken ct = default)
        => await _context.UsrPlayers.FirstOrDefaultAsync(p => p.Id == id, ct);

    public async Task SetPlayerTokensAsync(Guid playerId, int tokens, CancellationToken ct = default)
        => await _context.UsrPlayers
            .Where(p => p.Id == playerId)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.Tokens, tokens), ct);

    public async Task SetPlayerPermissionAsync(Guid playerId, string permission, CancellationToken ct = default)
        => await _context.UsrPlayers
            .Where(p => p.Id == playerId)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.Permission, permission), ct);
}
