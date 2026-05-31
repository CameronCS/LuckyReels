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

using IDataLayerService = DataAccessServiceInterface.IBlackjackDataService;

namespace BusinessLogicService;

public class BlackjackService(
    IDataLayerService dataLayerService,
    ActiveTenantService activeTenantService,
    IHubContext<SystemHub> systemHub,
    IMapper mapper,
    IDistributedCache cache)
    : BaseBusinessServiceWithDataService<IDataLayerService>(dataLayerService, activeTenantService, systemHub, mapper), IBlackjackService
{
    private static string StateKey(Guid playerId) => $"blackjack:{playerId}";

    private async Task<BlackjackGameState> GetStateAsync(Guid playerId)
    {
        string json = await cache.GetStringAsync(StateKey(playerId));
        if (json == null) throw new InvalidOperationException("No active blackjack game.");
        return JsonSerializer.Deserialize<BlackjackGameState>(json);
    }

    private async Task SaveStateAsync(Guid playerId, BlackjackGameState state)
    {
        DistributedCacheEntryOptions options = new() { AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(30) };
        await cache.SetStringAsync(StateKey(playerId), JsonSerializer.Serialize(state), options);
    }

    private async Task ClearStateAsync(Guid playerId)
        => await cache.RemoveAsync(StateKey(playerId));

    public async Task<BlackjackState> DealAsync(Guid playerId, int bet, CancellationToken ct = default)
    {
        UsrPlayer player = await _dataLayerService.GetPlayerByIdAsync(playerId, ct);
        if (player == null || player.Tokens < bet)
            throw new InvalidOperationException("Insufficient tokens.");

        BlackjackGameState state = new()
        {
            Deck       = BlackjackEngine.FreshShoe(),
            PlayerHand = [],
            DealerHand = [],
            Bet        = bet
        };

        state.PlayerHand.Add(BlackjackEngine.Draw(state.Deck));
        state.DealerHand.Add(BlackjackEngine.Draw(state.Deck));
        state.PlayerHand.Add(BlackjackEngine.Draw(state.Deck));
        state.DealerHand.Add(BlackjackEngine.Draw(state.Deck));

        int newBalance = player.Tokens - bet;
        await _dataLayerService.UpdatePlayerTokensAsync(playerId, newBalance, ct);
        await SaveStateAsync(playerId, state);

        return BuildState(state, newBalance);
    }

    public async Task<BlackjackState> HitAsync(Guid playerId, CancellationToken ct = default)
    {
        BlackjackGameState state = await GetStateAsync(playerId);
        state.PlayerHand.Add(BlackjackEngine.Draw(state.Deck));

        int playerTotal = BlackjackEngine.HandValue(state.PlayerHand);

        if (playerTotal > 21)
        {
            UsrPlayer player = await _dataLayerService.GetPlayerByIdAsync(playerId, ct);
            int net = BlackjackEngine.Net("bust", state.Bet);

            await _dataLayerService.AddBlackjackLogAsync(new LogBlackjack
            {
                PlayerId    = playerId,
                Result      = "bust",
                PlayerCards = JsonSerializer.Serialize(state.PlayerHand),
                DealerCards = JsonSerializer.Serialize(state.DealerHand),
                Bet         = state.Bet,
                Net         = net,
                CreatedAt   = DateTime.UtcNow
            }, ct);

            await ClearStateAsync(playerId);

            return new BlackjackState
            {
                PlayerHand  = [.. state.PlayerHand],
                DealerHand  = [.. state.DealerHand],
                PlayerTotal = playerTotal,
                DealerTotal = BlackjackEngine.HandValue(state.DealerHand),
                Bet         = state.Bet,
                Balance     = player.Tokens,
                IsGameOver  = true,
                Result      = "bust",
                Net         = net
            };
        }

        await SaveStateAsync(playerId, state);
        UsrPlayer currentPlayer = await _dataLayerService.GetPlayerByIdAsync(playerId, ct);
        return BuildState(state, currentPlayer.Tokens);
    }

    public async Task<BlackjackResult> StandAsync(Guid playerId, CancellationToken ct = default)
    {
        BlackjackGameState state = await GetStateAsync(playerId);

        BlackjackEngine.DealerPlay(state.DealerHand, state.Deck);

        string result  = BlackjackEngine.Resolve(state.PlayerHand, state.DealerHand);
        int payout     = BlackjackEngine.Payout(result, state.Bet);
        int net        = BlackjackEngine.Net(result, state.Bet);

        UsrPlayer player = await _dataLayerService.GetPlayerByIdAsync(playerId, ct);
        int newBalance   = player.Tokens + payout;

        await _dataLayerService.UpdatePlayerTokensAsync(playerId, newBalance, ct);

        await _dataLayerService.AddBlackjackLogAsync(new LogBlackjack
        {
            PlayerId    = playerId,
            Result      = result,
            PlayerCards = JsonSerializer.Serialize(state.PlayerHand),
            DealerCards = JsonSerializer.Serialize(state.DealerHand),
            Bet         = state.Bet,
            Net         = net,
            CreatedAt   = DateTime.UtcNow
        }, ct);

        await ClearStateAsync(playerId);

        return new BlackjackResult
        {
            PlayerHand  = [.. state.PlayerHand],
            DealerHand  = [.. state.DealerHand],
            PlayerTotal = BlackjackEngine.HandValue(state.PlayerHand),
            DealerTotal = BlackjackEngine.HandValue(state.DealerHand),
            Result      = result,
            Net         = net,
            Bet         = state.Bet,
            NewBalance  = newBalance
        };
    }

    private static BlackjackState BuildState(BlackjackGameState state, int balance)
        => new()
        {
            PlayerHand         = [.. state.PlayerHand],
            DealerVisible      = state.DealerHand[0],
            PlayerTotal        = BlackjackEngine.HandValue(state.PlayerHand),
            DealerVisibleTotal = BlackjackEngine.HandValue([state.DealerHand[0]]),
            Bet                = state.Bet,
            Balance            = balance
        };
}
