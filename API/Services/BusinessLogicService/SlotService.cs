using AutoMapper;
using GameEngines;
using BusinessLogicServiceInterface;
using CommonObjects.Games;
using DatabaseEntities;
using Microsoft.AspNetCore.SignalR;
using SystemFramework.Security;
using SystemFramework.SignalR;

using IDataLayerService = DataAccessServiceInterface.ISlotDataService;

namespace BusinessLogicService;

public class SlotService(
    IDataLayerService dataLayerService,
    ActiveTenantService activeTenantService,
    IHubContext<SystemHub> systemHub,
    IMapper mapper)
    : BaseBusinessServiceWithDataService<IDataLayerService>(dataLayerService, activeTenantService, systemHub, mapper), ISlotService
{
    public async Task<SlotResult> SpinAsync(Guid playerId, int machineNum, int bet, CancellationToken ct = default)
    {
        UsrPlayer player = await _dataLayerService.GetPlayerByIdAsync(playerId, ct);
        if (player == null || player.Tokens < bet)
            throw new InvalidOperationException("Insufficient tokens.");

        (string[] symbols, int winAmount, string resultType) = SlotsEngine.Spin(bet);

        int newBalance = player.Tokens - bet + winAmount;
        await _dataLayerService.UpdatePlayerTokensAsync(playerId, newBalance, ct);

        await _dataLayerService.AddSpinLogAsync(new LogSpin
        {
            PlayerId   = playerId,
            MachineNum = (byte)machineNum,
            Symbols    = string.Join(",", symbols),
            Bet        = bet,
            WinAmount  = winAmount,
            SpinType   = resultType,
            CreatedAt  = DateTime.UtcNow
        }, ct);

        return new SlotResult
        {
            Symbols    = symbols,
            WinAmount  = winAmount,
            ResultType = resultType,
            NewBalance = newBalance
        };
    }
}
