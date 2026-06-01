using DatabaseEntities;

namespace DataAccessServiceInterface;

public interface IAdminDataService : IBaseDataLayerService
{
    Task<List<UsrPlayer>> GetPlayersPagedAsync(int skip, int take, string? search, IReadOnlySet<Guid> onlineIds, CancellationToken ct = default);
    Task<int> GetPlayerCountAsync(string? search, CancellationToken ct = default);
    Task<UsrPlayer?> GetPlayerByIdAsync(Guid id, CancellationToken ct = default);
    Task SetPlayerTokensAsync(Guid playerId, int tokens, CancellationToken ct = default);
}
