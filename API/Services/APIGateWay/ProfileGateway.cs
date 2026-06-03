using BusinessLogicServiceInterface;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Models;
using System.Security.Claims;
using SystemFramework.Security;

namespace APIGateWay;

public record UpdateAvatarRequest(string ProfileAvatar);

[Authorize(Roles = "Player")]
public class ProfileGateway(ActiveTenantService activeTenantService, IAuthService authService) : BaseController(activeTenantService) {
    private Guid PlayerId => Guid.Parse(User.FindFirst(ClaimTypes.Sid)!.Value);

    [HttpGet]
    public async Task<ActionResult<Player>> Me(CancellationToken ct = default) {
        Player player = await authService.GetPlayerProfileAsync(PlayerId, ct);
        return player is null ? NotFound() : Ok(player);
    }

    [HttpPost]
    public async Task<ActionResult<Player>> Avatar([FromBody] UpdateAvatarRequest request, CancellationToken ct = default) {
        string profileAvatar = request is null || string.IsNullOrEmpty(request.ProfileAvatar)
            ? null
            : request.ProfileAvatar;
        Player player = await authService.UpdatePlayerAvatarAsync(PlayerId, profileAvatar, ct);
        return player is null ? NotFound() : Ok(player);
    }

    [HttpPost]
    public async Task<ActionResult<Player>> AvatarImage([FromForm] IFormFile image, CancellationToken ct = default) {
        if (image is null || image.Length == 0) {
            return BadRequest("Image is required.");
        }
        if (image.Length > 400_000) {
            return BadRequest("Choose an image under 400 KB.");
        }

        await using MemoryStream stream = new();
        await image.CopyToAsync(stream, ct);
        Player player = await authService.UpdatePlayerImageAsync(PlayerId, stream.ToArray(), image.ContentType, ct);
        return player is null ? NotFound() : Ok(player);
    }

    [AllowAnonymous]
    [HttpGet]
    public async Task<IActionResult> AvatarImage([FromQuery] Guid playerId, CancellationToken ct = default) {
        (byte[] image, string contentType) = await authService.GetPlayerImageAsync(playerId, ct);
        return image is null ? NotFound() : File(image, contentType ?? "application/octet-stream");
    }
}
