using CommonObjects.Games;

namespace BusinessLogicServiceInterface;

public interface IBaccaratService
{
    Task<BaccaratResult> BetAsync(Guid playerId, string betType, int bet, CancellationToken ct = default);
}
