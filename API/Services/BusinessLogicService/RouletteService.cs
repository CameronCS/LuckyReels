using AutoMapper;
using GameEngines;
using BusinessLogicServiceInterface;
using CommonObjects.Games;
using DatabaseEntities;
using Microsoft.AspNetCore.SignalR;
using SystemFramework.Security;
using SystemFramework.SignalR;

using IDataLayerService = DataAccessServiceInterface.IRouletteDataService;

namespace BusinessLogicService;

public class RouletteService(
    IDataLayerService dataLayerService,
    ActiveTenantService activeTenantService,
    IHubContext<SystemHub> systemHub,
    IMapper mapper)
    : BaseBusinessServiceWithDataService<IDataLayerService>(dataLayerService, activeTenantService, systemHub, mapper), IRouletteService
{
    public async Task<RouletteResult> SpinAsync(Guid playerId, List<RouletteBet> bets, CancellationToken ct = default)
    {
        UsrPlayer player = await _dataLayerService.GetPlayerByIdAsync(playerId, ct);
        if (player == null) throw new InvalidOperationException("Player not found.");

        (int winNum, int totalBet, int net, List<string> winningKeys) = RouletteEngine.Spin(bets);

        if (player.Tokens < totalBet) throw new InvalidOperationException("Insufficient tokens.");

        int newBalance = player.Tokens + net;
        await _dataLayerService.UpdatePlayerTokensAsync(playerId, newBalance, ct);

        await _dataLayerService.AddRouletteLogAsync(new LogRoulette
        {
            PlayerId  = playerId,
            WinNum    = RouletteEngine.FormatWinNumber(winNum),
            TotalBet  = totalBet,
            Net       = net,
            CreatedAt = DateTime.UtcNow
        }, ct);

        return new RouletteResult
        {
            WinNumber   = RouletteEngine.FormatWinNumber(winNum),
            TotalBet    = totalBet,
            Net         = net,
            NewBalance  = newBalance,
            WinningBets = [.. winningKeys]
        };
    }
}
