using BusinessLogicServiceInterface;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Models;
using SystemFramework.Security;

namespace APIGateWay;

public record SetTokensRequest(Guid PlayerId, int Tokens);
public record SetPermissionRequest(Guid PlayerId, string Permission);
public record BroadcastRequest(string Type, string Message);

[Authorize(Roles = "Admin")]
public class AdminGateway(ActiveTenantService activeTenantService, IAdminService adminService) : BaseController(activeTenantService) {
    [HttpGet]
    public async Task<IActionResult> Players([FromQuery] int page = 1, [FromQuery] int pageSize = 50, [FromQuery] string search = null, CancellationToken ct = default) {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        (List<Player> players, int total) = await adminService.GetPlayersAsync(page, pageSize, search, ct);
        return Ok(new {
            players, total, page, pageSize
        });
    }

    [HttpPost]
    public async Task<IActionResult> SetTokens([FromBody] SetTokensRequest request, CancellationToken ct = default) {
        if (request.Tokens < 0) {
            return BadRequest("Tokens cannot be negative.");
        }
        await adminService.SetTokensAsync(request.PlayerId, request.Tokens, ct);
        return Ok();
    }

    [HttpPost]
    public async Task<IActionResult> SetPermission([FromBody] SetPermissionRequest request, CancellationToken ct = default) {
        if (request.Permission is not ("Player" or "VIP" or "Moderated" or "Suspended")) {
            return BadRequest("Invalid permission.");
        }
        await adminService.SetPermissionAsync(request.PlayerId, request.Permission, ct);
        return Ok();
    }

    [HttpPost]
    public async Task<IActionResult> Broadcast([FromBody] BroadcastRequest request, CancellationToken ct = default) {
        if (string.IsNullOrWhiteSpace(request.Message)) {
            return BadRequest("Message is required.");
        }
        await adminService.BroadcastNotificationAsync(request.Type, request.Message, ct);
        return Ok();
    }
}
