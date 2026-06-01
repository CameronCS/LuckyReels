using CommonObjects.Games;

namespace BusinessLogicServiceInterface;

public interface IPlinkoService
{
    Task<PlinkoResult> DropAsync(Guid playerId, int bet, string riskLevel, CancellationToken ct = default);
}
