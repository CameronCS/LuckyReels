using CommonObjects.Games;

namespace BusinessLogicServiceInterface;

public interface ISlotService
{
    Task<SlotResult> SpinAsync(Guid playerId, int machineNum, int bet, CancellationToken ct = default);
}
