using AutoMapper;
using GameEngines;
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

public class BlackjackService(IDataLayerService dataLayerService, ActiveTenantService activeTenantService, IHubContext<SystemHub> systemHub, IMapper mapper, IDistributedCache cache, IAdminBroadcastService adminBroadcast) : BaseBusinessServiceWithDataService<IDataLayerService>(dataLayerService, activeTenantService, systemHub, mapper), IBlackjackService {
    private static string StateKey(Guid playerId) => $"blackjack:{playerId}";

    private async Task<BlackjackGameState> GetStateAsync(Guid playerId) {
        string json = await cache.GetStringAsync(StateKey(playerId));
        return json == null ? throw new InvalidOperationException("No active blackjack game.") : JsonSerializer.Deserialize<BlackjackGameState>(json);
    }

    private async Task SaveStateAsync(Guid playerId, BlackjackGameState state) {
        DistributedCacheEntryOptions options = new() {
            AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(30)
        };
        await cache.SetStringAsync(StateKey(playerId), JsonSerializer.Serialize(state), options);
    }

    private async Task ClearStateAsync(Guid playerId)
        => await cache.RemoveAsync(StateKey(playerId));

    public async Task<BlackjackState> DealAsync(Guid playerId, int bet, CancellationToken ct = default) {
        UsrPlayer player = await _dataLayerService.GetPlayerByIdAsync(playerId, ct);
        if (player == null || player.Tokens < bet) {
            throw new InvalidOperationException("Insufficient tokens.");
        }

        BlackjackGameState state = new() {
            Deck = BlackjackEngine.FreshShoe(),
            PlayerHand = [],
            DealerHand = [],
            Bet = bet
        };

        state.PlayerHand.Add(BlackjackEngine.Draw(state.Deck));
        state.DealerHand.Add(BlackjackEngine.Draw(state.Deck));
        state.PlayerHand.Add(BlackjackEngine.Draw(state.Deck));
        state.DealerHand.Add(BlackjackEngine.Draw(state.Deck));

        int newBalance = player.Tokens - bet;
        await _dataLayerService.UpdatePlayerTokensAsync(playerId, newBalance, ct);

        // Natural blackjack — resolve immediately, no state to save
        if (BlackjackEngine.HandValue(state.PlayerHand) == 21) {
            string result = BlackjackEngine.Resolve(state.PlayerHand, state.DealerHand);
            int payout = BlackjackEngine.Payout(result, bet);
            int net = BlackjackEngine.Net(result, bet);
            int finalBal = newBalance + payout;

            await _dataLayerService.UpdatePlayerTokensAsync(playerId, finalBal, ct);
            await _dataLayerService.AddBlackjackLogAsync(new LogBlackjack {
                PlayerId = playerId,
                Result = result,
                PlayerCards = JsonSerializer.Serialize(state.PlayerHand),
                DealerCards = JsonSerializer.Serialize(state.DealerHand),
                Bet = bet,
                Net = net,
                CreatedAt = DateTime.UtcNow
            }, ct);

            await adminBroadcast.TokenUpdate(playerId, player.Name, finalBal);
            await adminBroadcast.GameEvent(playerId, "blackjack", new {
                phase = "result", result, bet, net
            });

            return new BlackjackState {
                PlayerHand = [.. state.PlayerHand],
                DealerHand = [.. state.DealerHand],
                PlayerTotal = 21,
                DealerTotal = BlackjackEngine.HandValue(state.DealerHand),
                Bet = bet,
                Balance = finalBal,
                IsGameOver = true,
                Result = result,
                Net = net,
            };
        }

        await SaveStateAsync(playerId, state);

        await adminBroadcast.TokenUpdate(playerId, player.Name, newBalance);
        await adminBroadcast.GameEvent(playerId, "blackjack", new {
            phase = "deal", bet
        });

        return BuildState(state, newBalance);
    }

    public async Task<BlackjackState> HitAsync(Guid playerId, CancellationToken ct = default) {
        BlackjackGameState state = await GetStateAsync(playerId);
        state.PlayerHand.Add(BlackjackEngine.Draw(state.Deck));

        int playerTotal = BlackjackEngine.HandValue(state.PlayerHand);

        if (playerTotal > 21) {
            UsrPlayer player = await _dataLayerService.GetPlayerByIdAsync(playerId, ct);
            int net = BlackjackEngine.Net("bust", state.Bet);

            await _dataLayerService.AddBlackjackLogAsync(new LogBlackjack {
                PlayerId = playerId,
                Result = "bust",
                PlayerCards = JsonSerializer.Serialize(state.PlayerHand),
                DealerCards = JsonSerializer.Serialize(state.DealerHand),
                Bet = state.Bet,
                Net = net,
                CreatedAt = DateTime.UtcNow
            }, ct);

            await ClearStateAsync(playerId);

            await adminBroadcast.GameEvent(playerId, "blackjack", new {
                phase = "result", result = "bust", bet = state.Bet, net
            });

            return new BlackjackState {
                PlayerHand = [.. state.PlayerHand],
                DealerHand = [.. state.DealerHand],
                PlayerTotal = playerTotal,
                DealerTotal = BlackjackEngine.HandValue(state.DealerHand),
                Bet = state.Bet,
                Balance = player.Tokens,
                IsGameOver = true,
                Result = "bust",
                Net = net
            };
        }

        await SaveStateAsync(playerId, state);
        UsrPlayer currentPlayer = await _dataLayerService.GetPlayerByIdAsync(playerId, ct);
        return BuildState(state, currentPlayer.Tokens);
    }

    public async Task<BlackjackResult> StandAsync(Guid playerId, CancellationToken ct = default) {
        BlackjackGameState state = await GetStateAsync(playerId);

        BlackjackEngine.DealerPlay(state.DealerHand, state.Deck);

        string result = BlackjackEngine.Resolve(state.PlayerHand, state.DealerHand);
        int payout = BlackjackEngine.Payout(result, state.Bet);
        int net = BlackjackEngine.Net(result, state.Bet);

        UsrPlayer player = await _dataLayerService.GetPlayerByIdAsync(playerId, ct);
        int newBalance = player.Tokens + payout;

        await _dataLayerService.UpdatePlayerTokensAsync(playerId, newBalance, ct);

        await _dataLayerService.AddBlackjackLogAsync(new LogBlackjack {
            PlayerId = playerId,
            Result = result,
            PlayerCards = JsonSerializer.Serialize(state.PlayerHand),
            DealerCards = JsonSerializer.Serialize(state.DealerHand),
            Bet = state.Bet,
            Net = net,
            CreatedAt = DateTime.UtcNow
        }, ct);

        await ClearStateAsync(playerId);

        await adminBroadcast.TokenUpdate(playerId, player.Name, newBalance);
        await adminBroadcast.GameEvent(playerId, "blackjack", new {
            phase = "result", result, bet = state.Bet, net
        });

        return new BlackjackResult {
            PlayerHand = [.. state.PlayerHand],
            DealerHand = [.. state.DealerHand],
            PlayerTotal = BlackjackEngine.HandValue(state.PlayerHand),
            DealerTotal = BlackjackEngine.HandValue(state.DealerHand),
            Result = result,
            Net = net,
            Bet = state.Bet,
            NewBalance = newBalance
        };
    }

    public async Task<BlackjackResult> DoubleAsync(Guid playerId, CancellationToken ct = default) {
        BlackjackGameState state = await GetStateAsync(playerId);

        UsrPlayer player = await _dataLayerService.GetPlayerByIdAsync(playerId, ct);
        if (player.Tokens < state.Bet)
            throw new InvalidOperationException("Insufficient tokens to double down.");

        int balanceAfterDouble = player.Tokens - state.Bet;
        await _dataLayerService.UpdatePlayerTokensAsync(playerId, balanceAfterDouble, ct);

        state.PlayerHand.Add(BlackjackEngine.Draw(state.Deck));
        int playerTotal = BlackjackEngine.HandValue(state.PlayerHand);
        int effectiveBet = state.Bet * 2;

        string result;
        if (playerTotal > 21) {
            result = "bust";
        } else {
            BlackjackEngine.DealerPlay(state.DealerHand, state.Deck);
            result = BlackjackEngine.Resolve(state.PlayerHand, state.DealerHand);
        }

        int payout = BlackjackEngine.Payout(result, effectiveBet);
        int net = BlackjackEngine.Net(result, effectiveBet);
        int newBalance = balanceAfterDouble + payout;

        await _dataLayerService.UpdatePlayerTokensAsync(playerId, newBalance, ct);

        await _dataLayerService.AddBlackjackLogAsync(new LogBlackjack {
            PlayerId = playerId,
            Result = result,
            PlayerCards = JsonSerializer.Serialize(state.PlayerHand),
            DealerCards = JsonSerializer.Serialize(state.DealerHand),
            Bet = effectiveBet,
            Net = net,
            CreatedAt = DateTime.UtcNow
        }, ct);

        await ClearStateAsync(playerId);

        await adminBroadcast.TokenUpdate(playerId, player.Name, newBalance);
        await adminBroadcast.GameEvent(playerId, "blackjack", new {
            phase = "result", result, bet = effectiveBet, net
        });

        return new BlackjackResult {
            PlayerHand = [.. state.PlayerHand],
            DealerHand = [.. state.DealerHand],
            PlayerTotal = playerTotal,
            DealerTotal = BlackjackEngine.HandValue(state.DealerHand),
            Result = result,
            Net = net,
            Bet = effectiveBet,
            NewBalance = newBalance
        };
    }

    private static BlackjackState BuildState(BlackjackGameState state, int balance)
        => new() {
            PlayerHand = [.. state.PlayerHand],
            DealerVisible = state.DealerHand[0],
            PlayerTotal = BlackjackEngine.HandValue(state.PlayerHand),
            DealerVisibleTotal = BlackjackEngine.HandValue([state.DealerHand[0]]),
            Bet = state.Bet,
            Balance = balance
        };
}
