using DatabaseEntities;

namespace DataAccessServiceInterface;

public interface IHorseDataService : IBaseDataLayerService
{
    Task<UsrPlayer> GetPlayerByIdAsync(Guid id, CancellationToken ct = default);
    Task UpdatePlayerTokensAsync(Guid id, int tokens, CancellationToken ct = default);
    Task AddHorseLogAsync(LogHorse log, CancellationToken ct = default);
}
