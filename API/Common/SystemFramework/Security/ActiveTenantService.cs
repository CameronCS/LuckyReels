using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using System.Security.Claims;

namespace SystemFramework.Security;

public class ActiveTenantService(IHttpContextAccessor httpContext) {
    private readonly IHttpContextAccessor _httpContext = httpContext;

    public bool IsAuthenticated {
        get {
            return _httpContext?.HttpContext?.User?.Identity?.IsAuthenticated ?? false;
        }
    }

    public int ActiveTenantId {
        get {
            if (!IsAuthenticated) {
                throw new UnauthorizedAccessException("User is not authenticated.");
            }
            Claim activeTenantIdClaim = _httpContext.HttpContext.User.FindFirst(ClaimTypes.UserData);
            if (activeTenantIdClaim is not null) {
                return int.Parse(activeTenantIdClaim.Value);
            }
            throw new UnauthorizedAccessException("Active Tenant Id claim not found.");
        }
    }

    public int UserId {
        get {
            if (!IsAuthenticated) {
                throw new UnauthorizedAccessException("User is not authenticated.");
            }
            Claim userIdClaim = _httpContext.HttpContext.User.FindFirst(ClaimTypes.Sid);
            if (userIdClaim is not null) {
                return int.Parse(userIdClaim.Value);
            }
            throw new UnauthorizedAccessException("User Id claim not found.");
        }
    }

    public string UserName {
        get {
            if (!IsAuthenticated) {
                throw new UnauthorizedAccessException("User is not authenticated.");
            }

            Claim userNameClaim = _httpContext.HttpContext.User.FindFirst(ClaimTypes.Name);
            if (userNameClaim is not null) {
                return userNameClaim.Value;
            }
            throw new UnauthorizedAccessException("User is not authenticated");
        }
    }
}
