using CommonObjects.Games;

namespace BusinessLogicServiceInterface;

public interface IHorseService
{
    Task<HorseResult> RaceAsync(Guid playerId, string pickedHorse, int bet, CancellationToken ct = default);
}
