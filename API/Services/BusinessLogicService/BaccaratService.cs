using AutoMapper;
using GameEngines;
using BusinessLogicServiceInterface;
using CommonObjects.Games;
using DatabaseEntities;
using Microsoft.AspNetCore.SignalR;
using SystemFramework.Security;
using SystemFramework.SignalR;
using System.Text.Json;

using IDataLayerService = DataAccessServiceInterface.IBaccaratDataService;

namespace BusinessLogicService;

public class BaccaratService(
    IDataLayerService dataLayerService,
    ActiveTenantService activeTenantService,
    IHubContext<SystemHub> systemHub,
    IMapper mapper)
    : BaseBusinessServiceWithDataService<IDataLayerService>(dataLayerService, activeTenantService, systemHub, mapper), IBaccaratService
{
    public async Task<BaccaratResult> BetAsync(Guid playerId, string betType, int bet, CancellationToken ct = default)
    {
        UsrPlayer player = await _dataLayerService.GetPlayerByIdAsync(playerId, ct);
        if (player == null || player.Tokens < bet) throw new InvalidOperationException("Insufficient tokens.");

        (List<Card> playerHand, List<Card> bankerHand, string outcome, int net) = BaccaratEngine.Play(betType, bet);

        int newBalance = player.Tokens + net;
        await _dataLayerService.UpdatePlayerTokensAsync(playerId, newBalance, ct);

        await _dataLayerService.AddBaccaratLogAsync(new LogBaccarat
        {
            PlayerId   = playerId,
            BetType    = betType,
            Outcome    = outcome,
            PlayerHand = JsonSerializer.Serialize(playerHand),
            BankerHand = JsonSerializer.Serialize(bankerHand),
            Bet        = bet,
            Net        = net,
            CreatedAt  = DateTime.UtcNow
        }, ct);

        return new BaccaratResult
        {
            PlayerHand = [.. playerHand],
            BankerHand = [.. bankerHand],
            BetType    = betType,
            Outcome    = outcome,
            Bet        = bet,
            Net        = net,
            NewBalance = newBalance
        };
    }
}
