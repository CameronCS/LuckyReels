using Microsoft.AspNetCore.SignalR;
using System.Security.Claims;

namespace SystemFramework.SignalR;

public class IdBasedNameIdentifier : IUserIdProvider {
    public string GetUserId(HubConnectionContext hubConnectionContext) {
        return hubConnectionContext.User.FindFirst(ClaimTypes.Sid).Value ?? null;
    }
}
