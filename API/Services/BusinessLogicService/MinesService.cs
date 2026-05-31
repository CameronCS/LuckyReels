using AutoMapper;
using BusinessLogicService.Engines;
using BusinessLogicService.GameState;
using BusinessLogicServiceInterface;
using CommonObjects.Games;
using DatabaseEntities;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Caching.Distributed;
using SystemFramework.Security;
using SystemFramework.SignalR;
using System.Text.Json;

using IDataLayerService = DataAccessServiceInterface.IMinesDataService;

namespace BusinessLogicService;

public class MinesService(
    IDataLayerService dataLayerService,
    ActiveTenantService activeTenantService,
    IHubContext<SystemHub> systemHub,
    IMapper mapper,
    IDistributedCache cache)
    : BaseBusinessServiceWithDataService<IDataLayerService>(dataLayerService, activeTenantService, systemHub, mapper), IMinesService
{
    private static string StateKey(Guid playerId) => $"mines:{playerId}";

    private async Task<MinesGameState> GetStateAsync(Guid playerId)
    {
        string json = await cache.GetStringAsync(StateKey(playerId));
        if (json == null) throw new InvalidOperationException("No active mines game.");
        return JsonSerializer.Deserialize<MinesGameState>(json);
    }

    private async Task SaveStateAsync(Guid playerId, MinesGameState state)
    {
        DistributedCacheEntryOptions opts = new() { AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(30) };
        await cache.SetStringAsync(StateKey(playerId), JsonSerializer.Serialize(state), opts);
    }

    private async Task ClearStateAsync(Guid playerId)
        => await cache.RemoveAsync(StateKey(playerId));

    public async Task<MinesState> StartAsync(Guid playerId, int mineCount, int bet, CancellationToken ct = default)
    {
        if (mineCount < 1 || mineCount > 24) throw new ArgumentOutOfRangeException(nameof(mineCount));

        UsrPlayer player = await _dataLayerService.GetPlayerByIdAsync(playerId, ct);
        if (player == null || player.Tokens < bet) throw new InvalidOperationException("Insufficient tokens.");

        MinesGameState state = new()
        {
            Grid      = MinesEngine.GenerateGrid(mineCount),
            Revealed  = [],
            MineCount = mineCount,
            Bet       = bet
        };

        int newBalance = player.Tokens - bet;
        await _dataLayerService.UpdatePlayerTokensAsync(playerId, newBalance, ct);
        await SaveStateAsync(playerId, state);

        return new MinesState
        {
            Revealed   = [],
            Multiplier = MinesEngine.CalcMultiplier(mineCount, 0),
            Bet        = bet,
            Balance    = newBalance
        };
    }

    public async Task<MinesState> RevealAsync(Guid playerId, int cellIndex, CancellationToken ct = default)
    {
        MinesGameState state = await GetStateAsync(playerId);

        if (cellIndex < 0 || cellIndex >= MinesEngine.GridSize)
            throw new ArgumentOutOfRangeException(nameof(cellIndex));

        if (state.Revealed.Contains(cellIndex))
            throw new InvalidOperationException("Cell already revealed.");

        UsrPlayer player = await _dataLayerService.GetPlayerByIdAsync(playerId, ct);

        if (state.Grid[cellIndex])
        {
            await ClearStateAsync(playerId);

            return new MinesState
            {
                IsGameOver = true,
                HitMine    = true,
                Grid       = state.Grid,
                Revealed   = [.. state.Revealed],
                Bet        = state.Bet,
                Net        = -state.Bet,
                Balance    = player.Tokens
            };
        }

        state.Revealed.Add(cellIndex);
        await SaveStateAsync(playerId, state);

        return new MinesState
        {
            Revealed   = [.. state.Revealed],
            Multiplier = MinesEngine.CalcMultiplier(state.MineCount, state.Revealed.Count),
            Bet        = state.Bet,
            Balance    = player.Tokens
        };
    }

    public async Task<MinesResult> CashoutAsync(Guid playerId, CancellationToken ct = default)
    {
        MinesGameState state = await GetStateAsync(playerId);

        if (state.Revealed.Count == 0) throw new InvalidOperationException("Reveal at least one cell before cashing out.");

        double multiplier = MinesEngine.CalcMultiplier(state.MineCount, state.Revealed.Count);
        int winAmount     = (int)Math.Floor(state.Bet * multiplier);
        int net           = winAmount - state.Bet;

        UsrPlayer player = await _dataLayerService.GetPlayerByIdAsync(playerId, ct);
        int newBalance    = player.Tokens + winAmount;
        await _dataLayerService.UpdatePlayerTokensAsync(playerId, newBalance, ct);
        await ClearStateAsync(playerId);

        return new MinesResult
        {
            Grid       = state.Grid,
            Revealed   = [.. state.Revealed],
            Net        = net,
            NewBalance = newBalance
        };
    }
}
