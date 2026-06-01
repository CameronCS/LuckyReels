using DatabaseEntities;

namespace DataAccessServiceInterface;

public interface IBaccaratDataService : IBaseDataLayerService
{
    Task<UsrPlayer> GetPlayerByIdAsync(Guid id, CancellationToken ct = default);
    Task UpdatePlayerTokensAsync(Guid id, int tokens, CancellationToken ct = default);
    Task AddBaccaratLogAsync(LogBaccarat log, CancellationToken ct = default);
}
