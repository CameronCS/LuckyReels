using BusinessLogicServiceInterface;
using CommonObjects.Games;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.DependencyInjection;
using System.Security.Claims;
using SystemFramework.SignalR;

namespace WebSocketServicePoint;

[Authorize]
public class GameHub(IServiceProvider services, IOnlineTracker onlineTracker, IAdminBroadcastService adminBroadcast) : Hub {
    private Guid PlayerId => Guid.Parse(Context.User.FindFirst(ClaimTypes.Sid).Value);

    private T Game<T>() {
        T service = services.GetService<T>();
        if (service == null)
            throw new HubException("This game is not yet available.");
        return service;
    }

    private async Task EnsurePlayerCanPlay()
        => await Game<IAuthService>().EnsurePlayerCanPlayAsync(PlayerId);

    public override async Task OnConnectedAsync() {
        await EnsurePlayerCanPlay();
        await Groups.AddToGroupAsync(Context.ConnectionId, "Online");
        onlineTracker.Add(PlayerId);
        await adminBroadcast.PlayerOnlineStatus(PlayerId, true);
        int tokens = await Game<IAuthService>().GetTokensAsync(PlayerId);
        await Clients.Caller.SendAsync(HubEvents.TokensUpdated, tokens);
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception exception) {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, "Online");
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, "Crash");
        onlineTracker.Remove(PlayerId);
        await adminBroadcast.PlayerOnlineStatus(PlayerId, false);
        await base.OnDisconnectedAsync(exception);
    }

    // ── Balance ──────────────────────────────────────────────────────────────

    public async Task<int> GetTokens()
    {
        await EnsurePlayerCanPlay();
        return await Game<IAuthService>().GetTokensAsync(PlayerId);
    }

    // ── Slots ─────────────────────────────────────────────────────────────────

    public async Task SpinSlots(int machineNum, int bet) {
        await EnsurePlayerCanPlay();
        SlotResult result = await Game<ISlotService>().SpinAsync(PlayerId, machineNum, bet);
        await Clients.Caller.SendAsync(HubEvents.SlotResult, result);
    }

    // ── Blackjack ─────────────────────────────────────────────────────────────

    public async Task BlackjackDeal(int bet) {
        await EnsurePlayerCanPlay();
        BlackjackState state = await Game<IBlackjackService>().DealAsync(PlayerId, bet);
        string evt = state.IsGameOver ? HubEvents.BlackjackResult : HubEvents.BlackjackState;
        await Clients.Caller.SendAsync(evt, state);
    }

    public async Task BlackjackHit() {
        await EnsurePlayerCanPlay();
        BlackjackState state = await Game<IBlackjackService>().HitAsync(PlayerId);
        string evt = state.IsGameOver ? HubEvents.BlackjackResult : HubEvents.BlackjackState;
        await Clients.Caller.SendAsync(evt, state);
    }

    public async Task BlackjackStand() {
        await EnsurePlayerCanPlay();
        BlackjackResult result = await Game<IBlackjackService>().StandAsync(PlayerId);
        await Clients.Caller.SendAsync(HubEvents.BlackjackResult, result);
    }

    // ── Roulette ──────────────────────────────────────────────────────────────

    public async Task SpinRoulette(List<RouletteBet> bets) {
        await EnsurePlayerCanPlay();
        RouletteResult result = await Game<IRouletteService>().SpinAsync(PlayerId, bets);
        await Clients.Caller.SendAsync(HubEvents.RouletteResult, result);
    }

    // ── Horse Racing ──────────────────────────────────────────────────────────

    public async Task RaceHorse(string pickedHorse, int bet) {
        await EnsurePlayerCanPlay();
        HorseResult result = await Game<IHorseService>().RaceAsync(PlayerId, pickedHorse, bet);
        await Clients.Caller.SendAsync(HubEvents.HorseResult, result);
    }

    // ── Baccarat ──────────────────────────────────────────────────────────────

    public async Task BaccaratBet(string betType, int bet) {
        await EnsurePlayerCanPlay();
        BaccaratResult result = await Game<IBaccaratService>().BetAsync(PlayerId, betType, bet);
        await Clients.Caller.SendAsync(HubEvents.BaccaratResult, result);
    }

    // ── Mines ─────────────────────────────────────────────────────────────────

    public async Task MinesStart(int mineCount, int bet) {
        await EnsurePlayerCanPlay();
        MinesState state = await Game<IMinesService>().StartAsync(PlayerId, mineCount, bet);
        await Clients.Caller.SendAsync(HubEvents.MinesState, state);
    }

    public async Task MinesReveal(int cellIndex) {
        await EnsurePlayerCanPlay();
        MinesState state = await Game<IMinesService>().RevealAsync(PlayerId, cellIndex);
        string evt = state.IsGameOver ? HubEvents.MinesResult : HubEvents.MinesState;
        await Clients.Caller.SendAsync(evt, state);
    }

    public async Task MinesCashout() {
        await EnsurePlayerCanPlay();
        MinesResult result = await Game<IMinesService>().CashoutAsync(PlayerId);
        await Clients.Caller.SendAsync(HubEvents.MinesResult, result);
    }

    // ── Crash ─────────────────────────────────────────────────────────────────

    public async Task CrashJoin() {
        await EnsurePlayerCanPlay();
        await Groups.AddToGroupAsync(Context.ConnectionId, "Crash");
    }

    public async Task CrashLeave()
        => await Groups.RemoveFromGroupAsync(Context.ConnectionId, "Crash");

    public async Task CrashBet(int bet)
    {
        await EnsurePlayerCanPlay();
        await Game<ICrashService>().PlaceBetAsync(PlayerId, bet);
    }

    public async Task CrashCashout() {
        await EnsurePlayerCanPlay();
        CrashResult result = await Game<ICrashService>().CashoutAsync(PlayerId);
        await Clients.Caller.SendAsync(HubEvents.CrashResult, result);
    }

    // ── Plinko ────────────────────────────────────────────────────────────────

    public async Task DropPlinko(int bet, string riskLevel) {
        await EnsurePlayerCanPlay();
        PlinkoResult result = await Game<IPlinkoService>().DropAsync(PlayerId, bet, riskLevel);
        await Clients.Caller.SendAsync(HubEvents.PlinkoResult, result);
    }
}
