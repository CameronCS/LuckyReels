using AutoMapper;
using GameEngines;
using BusinessLogicServiceInterface;
using CommonObjects.Games;
using DatabaseEntities;
using Microsoft.AspNetCore.SignalR;
using SystemFramework.Security;
using SystemFramework.SignalR;

using IDataLayerService = DataAccessServiceInterface.IHorseDataService;

namespace BusinessLogicService;

public class HorseService(
    IDataLayerService dataLayerService,
    ActiveTenantService activeTenantService,
    IHubContext<SystemHub> systemHub,
    IMapper mapper)
    : BaseBusinessServiceWithDataService<IDataLayerService>(dataLayerService, activeTenantService, systemHub, mapper), IHorseService
{
    public async Task<HorseResult> RaceAsync(Guid playerId, string pickedHorse, int bet, CancellationToken ct = default)
    {
        UsrPlayer player = await _dataLayerService.GetPlayerByIdAsync(playerId, ct);
        if (player == null || player.Tokens < bet) throw new InvalidOperationException("Insufficient tokens.");

        int horseIndex = Array.IndexOf(HorseEngine.Names, pickedHorse);
        if (horseIndex < 0) throw new ArgumentException($"Unknown horse: {pickedHorse}");

        (int _, string winnerName, int net) = HorseEngine.Race(bet, horseIndex);

        int newBalance = player.Tokens + net;
        await _dataLayerService.UpdatePlayerTokensAsync(playerId, newBalance, ct);

        await _dataLayerService.AddHorseLogAsync(new LogHorse
        {
            PlayerId   = playerId,
            WinnerName = winnerName,
            PickedName = pickedHorse,
            Bet        = bet,
            Net        = net,
            CreatedAt  = DateTime.UtcNow
        }, ct);

        return new HorseResult
        {
            WinnerName = winnerName,
            PickedName = pickedHorse,
            Bet        = bet,
            Net        = net,
            NewBalance = newBalance
        };
    }
}
