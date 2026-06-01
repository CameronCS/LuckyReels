using AutoMapper;
using GameEngines;
using BusinessLogicServiceInterface;
using CommonObjects.Games;
using DatabaseEntities;
using Microsoft.AspNetCore.SignalR;
using SystemFramework.Security;
using SystemFramework.SignalR;

using IDataLayerService = DataAccessServiceInterface.IPlinkoDataService;

namespace BusinessLogicService;

public class PlinkoService(IDataLayerService dataLayerService, ActiveTenantService activeTenantService, IHubContext<SystemHub> systemHub, IMapper mapper, IAdminBroadcastService adminBroadcast) : BaseBusinessServiceWithDataService<IDataLayerService>(dataLayerService, activeTenantService, systemHub, mapper), IPlinkoService {
    public async Task<PlinkoResult> DropAsync(Guid playerId, int bet, string riskLevel, CancellationToken ct = default) {
        UsrPlayer player = await _dataLayerService.GetPlayerByIdAsync(playerId, ct);
        if (player == null || player.Tokens < bet) {
            throw new InvalidOperationException("Insufficient tokens.");
        }

        (int[] path, int slot, double mult, int net) = PlinkoEngine.Drop(bet, riskLevel);

        int winAmount = net + bet;
        int newBalance = player.Tokens - bet + winAmount;
        await _dataLayerService.UpdatePlayerTokensAsync(playerId, newBalance, ct);

        await adminBroadcast.TokenUpdate(playerId, player.Name, newBalance);
        await adminBroadcast.GameEvent(playerId, "plinko", new { riskLevel, slot, mult, bet, net });

        return new PlinkoResult {
            Path = path,
            Slot = slot,
            Multiplier = mult,
            WinAmount = winAmount,
            Net = net,
            NewBalance = newBalance
        };
    }
}
