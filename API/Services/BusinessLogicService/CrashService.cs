using AutoMapper;
using BusinessLogicServiceInterface;
using CommonObjects.Games;
using DatabaseEntities;
using Microsoft.AspNetCore.SignalR;
using SystemFramework.Security;
using SystemFramework.SignalR;

using IDataLayerService = DataAccessServiceInterface.ICrashDataService;

namespace BusinessLogicService;

public class CrashService(
    IDataLayerService dataLayerService,
    ActiveTenantService activeTenantService,
    IHubContext<SystemHub> systemHub,
    IMapper mapper,
    ICrashGameStore store)
    : BaseBusinessServiceWithDataService<IDataLayerService>(dataLayerService, activeTenantService, systemHub, mapper), ICrashService
{
    public async Task PlaceBetAsync(Guid playerId, int bet, CancellationToken ct = default)
    {
        UsrPlayer player = await _dataLayerService.GetPlayerByIdAsync(playerId, ct);
        if (player == null || player.Tokens < bet) throw new InvalidOperationException("Insufficient tokens.");

        if (!store.TryPlaceBet(playerId, bet))
            throw new InvalidOperationException("Betting is closed for this round.");

        await _dataLayerService.UpdatePlayerTokensAsync(playerId, player.Tokens - bet, ct);
    }

    public async Task<CrashResult> CashoutAsync(Guid playerId, CancellationToken ct = default)
    {
        if (!store.TryCashout(playerId))
            throw new InvalidOperationException("Cannot cashout at this time.");

        store.TryGetBet(playerId, out int bet);

        double cashedOutAt = store.CurrentMultiplier;
        int winnings       = (int)(bet * cashedOutAt);
        int net            = winnings - bet;

        UsrPlayer player = await _dataLayerService.GetPlayerByIdAsync(playerId, ct);
        int newBalance    = player.Tokens + winnings;
        await _dataLayerService.UpdatePlayerTokensAsync(playerId, newBalance, ct);

        return new CrashResult
        {
            CrashedAt   = store.CrashPoint,
            CashedOutAt = cashedOutAt,
            Bet         = bet,
            Net         = net,
            NewBalance  = newBalance
        };
    }
}
