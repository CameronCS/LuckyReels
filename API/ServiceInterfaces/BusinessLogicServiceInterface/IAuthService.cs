using CommonObjects.Authentication;

namespace BusinessLogicServiceInterface;

public interface IAuthService
{
    Task<AuthenticationResponse> LoginPlayerAsync(AuthenticationRequest request, CancellationToken ct = default);
    Task<AuthenticationResponse> LoginAdminAsync(AuthenticationRequest request, CancellationToken ct = default);
    Task<AuthenticationResponse> RegisterPlayerAsync(RegisterRequest request, CancellationToken ct = default);
    Task<int> GetTokensAsync(Guid playerId, CancellationToken ct = default);
}
