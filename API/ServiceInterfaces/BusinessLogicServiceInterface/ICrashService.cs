using CommonObjects.Games;

namespace BusinessLogicServiceInterface;

public interface ICrashService
{
    Task PlaceBetAsync(Guid playerId, int bet, CancellationToken ct = default);
    Task<CrashResult> CashoutAsync(Guid playerId, CancellationToken ct = default);
}
