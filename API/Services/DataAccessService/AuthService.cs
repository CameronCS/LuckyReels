using DataAccessServiceInterface;
using DatabaseEntities;
using Microsoft.EntityFrameworkCore;
using System.Linq.Expressions;
using SystemFramework.Security;

namespace DataAccessService;

public class AuthService(App_DBContext context, ActiveTenantService activeTenantService) : BaseDataService(context, activeTenantService), IAuthService {
    public async Task<UsrPlayer> GetPlayerByNameAsync(string name, CancellationToken ct = default)
        => await _context.UsrPlayers
            .Where(p => p.Name == name)
            .Select(ProfileProjection)
            .FirstOrDefaultAsync(ct);

    public async Task<UsrPlayer> GetPlayerByIdAsync(Guid id, CancellationToken ct = default)
        => await _context.UsrPlayers
            .Where(p => p.Id == id)
            .Select(ProfileProjection)
            .FirstOrDefaultAsync(ct);

    public async Task<UsrAdmin> GetAdminByUsernameAsync(string username, CancellationToken ct = default)
        => await _context.UsrAdmins.FirstOrDefaultAsync(a => a.Username == username, ct);

    public async Task AddPlayerAsync(UsrPlayer player, CancellationToken ct = default) {
        await _context.UsrPlayers.AddAsync(player, ct);
        await _context.SaveChangesAsync(ct);
    }

    public async Task UpdatePlayerAvatarAsync(Guid playerId, string? avatar, CancellationToken ct = default)
        => await _context.UsrPlayers
            .Where(p => p.Id == playerId)
            .ExecuteUpdateAsync(s => s
                .SetProperty(p => p.ProfileAvatar, avatar)
                .SetProperty(p => p.ProfileImage, (byte[]?)null)
                .SetProperty(p => p.ProfileImageContentType, (string?)null)
                .SetProperty(p => p.ProfileImageUpdatedAt, (DateTime?)null), ct);

    public async Task UpdatePlayerImageAsync(Guid playerId, byte[] image, string contentType, DateTime updatedAt, CancellationToken ct = default)
        => await _context.UsrPlayers
            .Where(p => p.Id == playerId)
            .ExecuteUpdateAsync(s => s
                .SetProperty(p => p.ProfileAvatar, (string?)null)
                .SetProperty(p => p.ProfileImage, image)
                .SetProperty(p => p.ProfileImageContentType, contentType)
                .SetProperty(p => p.ProfileImageUpdatedAt, updatedAt), ct);

    public async Task<(byte[]? Image, string? ContentType)> GetPlayerImageAsync(Guid playerId, CancellationToken ct = default) {
        var row = await _context.UsrPlayers
            .Where(p => p.Id == playerId)
            .Select(p => new { p.ProfileImage, p.ProfileImageContentType })
            .FirstOrDefaultAsync(ct);

        return (row?.ProfileImage, row?.ProfileImageContentType);
    }

    private static readonly Expression<Func<UsrPlayer, UsrPlayer>> ProfileProjection = p => new UsrPlayer {
            Id = p.Id,
            Name = p.Name,
            Email = p.Email,
            PasswordHash = p.PasswordHash,
            Tokens = p.Tokens,
            LastBonusAt = p.LastBonusAt,
            CreatedAt = p.CreatedAt,
            ProfileAvatar = p.ProfileAvatar,
            ProfileImageContentType = p.ProfileImageContentType,
            ProfileImageUpdatedAt = p.ProfileImageUpdatedAt,
            Permission = p.Permission
        };
}
