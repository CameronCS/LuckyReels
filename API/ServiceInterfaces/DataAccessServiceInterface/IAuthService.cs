using DatabaseEntities;

namespace DataAccessServiceInterface;

public interface IAuthService : IBaseDataLayerService
{
    Task<UsrPlayer> GetPlayerByNameAsync(string name, CancellationToken ct = default);
    Task<UsrPlayer> GetPlayerByIdAsync(Guid id, CancellationToken ct = default);
    Task<UsrAdmin> GetAdminByUsernameAsync(string username, CancellationToken ct = default);
    Task AddPlayerAsync(UsrPlayer player, CancellationToken ct = default);
    Task UpdatePlayerAvatarAsync(Guid playerId, string? avatar, CancellationToken ct = default);
    Task UpdatePlayerImageAsync(Guid playerId, byte[] image, string contentType, DateTime updatedAt, CancellationToken ct = default);
    Task<(byte[]? Image, string? ContentType)> GetPlayerImageAsync(Guid playerId, CancellationToken ct = default);
}
