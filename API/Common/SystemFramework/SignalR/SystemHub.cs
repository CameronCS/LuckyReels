using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace SystemFramework.SignalR;

[Authorize]
public class SystemHub : Hub {
    public const string HubUrl = "/hub";
    public const string NotificationEvent = "Notification";
}
