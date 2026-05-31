using Microsoft.AspNetCore.SignalR;

namespace SystemFramework.SignalR; 
public class SystemHub : Hub {
    public const string HubUrl = "/hub";

    public override async Task OnConnectedAsync() {
        Console.WriteLine($"{Context.ConnectionId} Connected");
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception exception) {
        if (exception is not null) {
            Console.WriteLine($"{Context.ConnectionId} Disconnect Exception: {exception.Message}");
        } else {
            Console.WriteLine($"{Context.ConnectionId} Disconnected");
        }
        await base.OnDisconnectedAsync(exception);
    }
}
