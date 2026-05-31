using DatabaseEntities;

namespace DataAccessServiceInterface;

public interface IBlackjackDataService : IBaseDataLayerService
{
    Task<UsrPlayer> GetPlayerByIdAsync(Guid id, CancellationToken ct = default);
    Task UpdatePlayerTokensAsync(Guid id, int tokens, CancellationToken ct = default);
    Task AddBlackjackLogAsync(LogBlackjack log, CancellationToken ct = default);
}
