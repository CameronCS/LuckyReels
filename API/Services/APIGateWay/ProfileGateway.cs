using BusinessLogicServiceInterface;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Models;
using System.Security.Claims;
using SystemFramework.Security;

namespace APIGateWay;

public record UpdateAvatarRequest(string? ProfileAvatar);

[Authorize(Roles = "Player")]
public class ProfileGateway(ActiveTenantService activeTenantService, IAuthService authService) : BaseController(activeTenantService) {
    private Guid PlayerId => Guid.Parse(User.FindFirst(ClaimTypes.Sid)!.Value);

    [HttpGet]
    public async Task<ActionResult<Player>> Me(CancellationToken ct = default) {
        Player? player = await authService.GetPlayerProfileAsync(PlayerId, ct);
        return player is null ? NotFound() : Ok(player);
    }

    [HttpPost]
    public async Task<ActionResult<Player>> Avatar([FromBody] UpdateAvatarRequest request, CancellationToken ct = default) {
        Player? player = await authService.UpdatePlayerAvatarAsync(PlayerId, request.ProfileAvatar, ct);
        return player is null ? NotFound() : Ok(player);
    }
}
