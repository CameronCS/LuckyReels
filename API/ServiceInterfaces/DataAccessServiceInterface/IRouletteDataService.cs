using DatabaseEntities;

namespace DataAccessServiceInterface;

public interface IRouletteDataService : IBaseDataLayerService
{
    Task<UsrPlayer> GetPlayerByIdAsync(Guid id, CancellationToken ct = default);
    Task UpdatePlayerTokensAsync(Guid id, int tokens, CancellationToken ct = default);
    Task AddRouletteLogAsync(LogRoulette log, CancellationToken ct = default);
}
