using BusinessLogicServiceInterface;
using CommonObjects.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SystemFramework.Security;

namespace APIGateWay;

public class AuthGateway(ActiveTenantService activeTenantService, IAuthService authService) : BaseController(activeTenantService) {
    [AllowAnonymous]
    [HttpPost]
    public async Task<ActionResult<AuthenticationResponse>> LoginPlayer(AuthenticationRequest request, CancellationToken ct) {
        AuthenticationResponse response = await authService.LoginPlayerAsync(request, ct);
        if (!response.IsAuthenticated)
            return Unauthorized();
        return Ok(response);
    }

    [AllowAnonymous]
    [HttpPost]
    public async Task<ActionResult<AuthenticationResponse>> LoginAdmin(AuthenticationRequest request, CancellationToken ct) {
        AuthenticationResponse response = await authService.LoginAdminAsync(request, ct);
        if (!response.IsAuthenticated) {
            return Unauthorized();
        }
        return Ok(response);
    }

    [AllowAnonymous]
    [HttpPost]
    public async Task<ActionResult<AuthenticationResponse>> Register(RegisterRequest request, CancellationToken ct) {
        AuthenticationResponse response = await authService.RegisterPlayerAsync(request, ct);
        if (!response.IsAuthenticated) {
            return Conflict("Username already taken.");
        }
        return Ok(response);
    }
}
