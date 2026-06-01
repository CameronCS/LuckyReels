namespace BusinessLogicServiceInterface;

public interface IAdminBroadcastService
{
    Task TokenUpdate(Guid playerId, string playerName, int tokens);
    Task GameEvent(Guid playerId, string game, object data);
    Task NotifyPlayerTokensUpdated(Guid playerId, int tokens);
    Task PlayerOnlineStatus(Guid playerId, bool isOnline);
    Task BroadcastNotificationAsync(string type, string message);
    Task NotifyPlayerAsync(Guid playerId, string type, string message);
}
