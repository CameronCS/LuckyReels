using BusinessLogicServiceInterface;
using Microsoft.AspNetCore.SignalR;
using SystemFramework.SignalR;

namespace WebSocketServicePoint;

public class AdminBroadcastService(
    IHubContext<AdminHub>   adminHub,
    IHubContext<GameHub>    gameHub,
    IHubContext<SystemHub>  notificationHub)
    : IAdminBroadcastService
{
    public Task TokenUpdate(Guid playerId, string playerName, int tokens)
        => adminHub.Clients.Group("Admins").SendAsync("PlayerTokenUpdate", new
        {
            playerId = playerId.ToString(),
            name     = playerName,
            tokens
        });

    public Task GameEvent(Guid playerId, string game, object data)
        => adminHub.Clients.Group($"watch-{playerId}").SendAsync("PlayerGameEvent", new
        {
            playerId = playerId.ToString(),
            game,
            data,
            time     = DateTime.UtcNow
        });

    public Task NotifyPlayerTokensUpdated(Guid playerId, int tokens)
        => gameHub.Clients.User(playerId.ToString()).SendAsync(HubEvents.TokensUpdated, tokens);

    public Task PlayerOnlineStatus(Guid playerId, bool isOnline)
        => adminHub.Clients.Group("Admins").SendAsync("PlayerOnlineStatus", new
        {
            playerId = playerId.ToString(),
            isOnline,
        });

    public Task BroadcastNotificationAsync(string type, string message)
        => notificationHub.Clients.All.SendAsync(SystemHub.NotificationEvent, new { type, message });

    public Task NotifyPlayerAsync(Guid playerId, string type, string message)
        => notificationHub.Clients.User(playerId.ToString()).SendAsync(SystemHub.NotificationEvent, new { type, message });
}
