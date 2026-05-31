using CommonObjects.Games;

namespace BusinessLogicServiceInterface;

public interface IMinesService
{
    Task<MinesState> StartAsync(Guid playerId, int mineCount, int bet, CancellationToken ct = default);
    Task<MinesState> RevealAsync(Guid playerId, int cellIndex, CancellationToken ct = default);
    Task<MinesResult> CashoutAsync(Guid playerId, CancellationToken ct = default);
}
