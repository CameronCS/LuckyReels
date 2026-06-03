using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace WebSocketServicePoint;

[Authorize(Roles = "Admin")]
public class AdminHub : Hub {
    public override async Task OnConnectedAsync() {
        await Groups.AddToGroupAsync(Context.ConnectionId, "Admins");
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception exception) {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, "Admins");
        await base.OnDisconnectedAsync(exception);
    }

    public Task WatchPlayer(string playerId)
        => Groups.AddToGroupAsync(Context.ConnectionId, $"watch-{playerId}");

    public Task UnwatchPlayer(string playerId)
        => Groups.RemoveFromGroupAsync(Context.ConnectionId, $"watch-{playerId}");
}
