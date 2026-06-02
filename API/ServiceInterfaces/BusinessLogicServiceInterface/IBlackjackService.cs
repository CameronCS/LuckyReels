using CommonObjects.Games;

namespace BusinessLogicServiceInterface;

public interface IBlackjackService
{
    Task<BlackjackState> DealAsync(Guid playerId, int bet, CancellationToken ct = default);
    Task<BlackjackState> HitAsync(Guid playerId, CancellationToken ct = default);
    Task<BlackjackResult> StandAsync(Guid playerId, CancellationToken ct = default);
    Task<BlackjackResult> DoubleAsync(Guid playerId, CancellationToken ct = default);
}
