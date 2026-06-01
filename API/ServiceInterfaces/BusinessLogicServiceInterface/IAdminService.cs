using Models;

namespace BusinessLogicServiceInterface;

public interface IAdminService
{
    Task<(List<Player> Players, int Total)> GetPlayersAsync(int page, int pageSize, string? search, CancellationToken ct = default);
    Task SetTokensAsync(Guid playerId, int tokens, CancellationToken ct = default);
    Task BroadcastNotificationAsync(string type, string message, CancellationToken ct = default);
}
