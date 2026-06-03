using CommonObjects.Authentication;
using Models;

namespace BusinessLogicServiceInterface;

public interface IAuthService
{
    Task<AuthenticationResponse> LoginPlayerAsync(AuthenticationRequest request, CancellationToken ct = default);
    Task<AuthenticationResponse> LoginAdminAsync(AuthenticationRequest request, CancellationToken ct = default);
    Task<AuthenticationResponse> RegisterPlayerAsync(RegisterRequest request, CancellationToken ct = default);
    Task<int> GetTokensAsync(Guid playerId, CancellationToken ct = default);
    Task<Player> GetPlayerProfileAsync(Guid playerId, CancellationToken ct = default);
    Task<Player> UpdatePlayerAvatarAsync(Guid playerId, string avatar, CancellationToken ct = default);
    Task<Player> UpdatePlayerImageAsync(Guid playerId, byte[] image, string contentType, CancellationToken ct = default);
    Task<(byte[] Image, string ContentType)> GetPlayerImageAsync(Guid playerId, CancellationToken ct = default);
    Task EnsurePlayerCanPlayAsync(Guid playerId, CancellationToken ct = default);
}
