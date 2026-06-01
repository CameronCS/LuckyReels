using DataAccessServiceInterface;
using DatabaseEntities;
using Microsoft.EntityFrameworkCore;
using SystemFramework.Security;

namespace DataAccessService;

public class AuthService(App_DBContext context, ActiveTenantService activeTenantService) : BaseDataService(context, activeTenantService), IAuthService {
    public async Task<UsrPlayer> GetPlayerByNameAsync(string name, CancellationToken ct = default)
        => await _context.UsrPlayers.FirstOrDefaultAsync(p => p.Name == name, ct);

    public async Task<UsrPlayer> GetPlayerByIdAsync(Guid id, CancellationToken ct = default)
        => await _context.UsrPlayers.FirstOrDefaultAsync(p => p.Id == id, ct);

    public async Task<UsrAdmin> GetAdminByUsernameAsync(string username, CancellationToken ct = default)
        => await _context.UsrAdmins.FirstOrDefaultAsync(a => a.Username == username, ct);

    public async Task AddPlayerAsync(UsrPlayer player, CancellationToken ct = default) {
        await _context.UsrPlayers.AddAsync(player, ct);
        await _context.SaveChangesAsync(ct);
    }
}
