using CommonObjects.Games;

namespace BusinessLogicServiceInterface;

public interface IRouletteService
{
    Task<RouletteResult> SpinAsync(Guid playerId, List<RouletteBet> bets, CancellationToken ct = default);
}
