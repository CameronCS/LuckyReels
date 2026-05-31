using DatabaseEntities;

namespace DataAccessServiceInterface;

public interface ISlotDataService : IBaseDataLayerService
{
    Task<UsrPlayer> GetPlayerByIdAsync(Guid id, CancellationToken ct = default);
    Task UpdatePlayerTokensAsync(Guid id, int tokens, CancellationToken ct = default);
    Task AddSpinLogAsync(LogSpin log, CancellationToken ct = default);
}
