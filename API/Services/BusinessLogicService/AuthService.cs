using AutoMapper;
using BusinessLogicServiceInterface;
using CommonObjects.Authentication;
using DatabaseEntities;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Configuration;
using Models;
using SystemFramework.JWTAuthentication;
using SystemFramework.Security;
using SystemFramework.SignalR;

using IDataLayerService = DataAccessServiceInterface.IAuthService;

namespace BusinessLogicService;

public class AuthService(IDataLayerService dataLayerService, ActiveTenantService activeTenantService, IHubContext<SystemHub> systemHub, IMapper mapper, IConfiguration configuration) : BaseBusinessServiceWithDataService<IDataLayerService>(dataLayerService, activeTenantService, systemHub, mapper), IAuthService {
    private string JwtKey => configuration.GetValue<string>("JwtKey")!;

    public async Task<AuthenticationResponse> LoginPlayerAsync(AuthenticationRequest request, CancellationToken ct = default) {
        UsrPlayer entity = await _dataLayerService.GetPlayerByNameAsync(request.Username, ct);
        if (entity is null || !BCrypt.Net.BCrypt.Verify(request.Password, entity.PasswordHash)) {
            return new AuthenticationResponse { IsAuthenticated = false };
        }

        if (entity.Permission == "Suspended") {
            return new AuthenticationResponse {
                IsAuthenticated = false,
                Permission = entity.Permission,
                FailureReason = "Account suspended."
            };
        }

        return new AuthenticationResponse {
            IsAuthenticated = true,
            UserId = entity.Id.ToString(),
            UserName = entity.Name,
            ProfileAvatar = entity.ProfileAvatar,
            ProfileImageUrl = BuildProfileImageUrl(entity),
            Permission = entity.Permission,
            Token = JWTTokenGenerator.Generate(entity.Id.ToString(), entity.Name, "Player", JwtKey)
        };
    }

    public async Task<AuthenticationResponse> LoginAdminAsync(AuthenticationRequest request, CancellationToken ct = default) {
        UsrAdmin entity = await _dataLayerService.GetAdminByUsernameAsync(request.Username, ct);
        if (entity is null || !BCrypt.Net.BCrypt.Verify(request.Password, entity.PasswordHash)) {
            return new AuthenticationResponse { IsAuthenticated = false };
        }

        return new AuthenticationResponse {
            IsAuthenticated = true,
            UserId = entity.Id.ToString(),
            UserName = entity.Username,
            Permission = "Admin",
            Token = JWTTokenGenerator.Generate(entity.Id.ToString(), entity.Username, "Admin", JwtKey)
        };
    }

    public async Task<int> GetTokensAsync(Guid playerId, CancellationToken ct = default) {
        UsrPlayer player = await _dataLayerService.GetPlayerByIdAsync(playerId, ct);
        return player?.Tokens ?? 0;
    }

    public async Task<AuthenticationResponse> RegisterPlayerAsync(RegisterRequest request, CancellationToken ct = default) {
        UsrPlayer existing = await _dataLayerService.GetPlayerByNameAsync(request.Name, ct);
        if (existing is not null) {
            return new AuthenticationResponse { IsAuthenticated = false };
        }

        UsrPlayer player = new() {
            Id = Guid.NewGuid(),
            Name = request.Name,
            Email = request.Email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            Tokens = 10_000,
            Permission = "Player",
            CreatedAt = DateTime.UtcNow
        };

        await _dataLayerService.AddPlayerAsync(player, ct);

        return new AuthenticationResponse {
            IsAuthenticated = true,
            UserId = player.Id.ToString(),
            UserName = player.Name,
            ProfileAvatar = player.ProfileAvatar,
            ProfileImageUrl = BuildProfileImageUrl(player),
            Permission = player.Permission,
            Token = JWTTokenGenerator.Generate(player.Id.ToString(), player.Name, "Player", JwtKey)
        };
    }

    public async Task<Player?> GetPlayerProfileAsync(Guid playerId, CancellationToken ct = default) {
        UsrPlayer player = await _dataLayerService.GetPlayerByIdAsync(playerId, ct);
        return player is null ? null : ToProfile(player);
    }

    public async Task<Player?> UpdatePlayerImageAsync(Guid playerId, byte[] image, string contentType, CancellationToken ct = default) {
        if (image.Length == 0) {
            throw new InvalidOperationException("Profile image is required.");
        }
        if (image.Length > 400_000) {
            throw new InvalidOperationException("Profile image is too large.");
        }
        if (!IsSupportedImageType(contentType)) {
            throw new InvalidOperationException("Unsupported profile image type.");
        }

        await _dataLayerService.UpdatePlayerImageAsync(playerId, image, contentType, DateTime.UtcNow, ct);
        UsrPlayer player = await _dataLayerService.GetPlayerByIdAsync(playerId, ct);
        return player is null ? null : ToProfile(player);
    }

    public Task<(byte[]? Image, string? ContentType)> GetPlayerImageAsync(Guid playerId, CancellationToken ct = default)
        => _dataLayerService.GetPlayerImageAsync(playerId, ct);

    public async Task<Player?> UpdatePlayerAvatarAsync(Guid playerId, string? avatar, CancellationToken ct = default) {
        if (!string.IsNullOrWhiteSpace(avatar) && avatar.Length > 400_000) {
            throw new InvalidOperationException("Profile image is too large.");
        }

        await _dataLayerService.UpdatePlayerAvatarAsync(playerId, string.IsNullOrWhiteSpace(avatar) ? null : avatar, ct);
        UsrPlayer player = await _dataLayerService.GetPlayerByIdAsync(playerId, ct);
        return player is null ? null : ToProfile(player);
    }

    public async Task EnsurePlayerCanPlayAsync(Guid playerId, CancellationToken ct = default) {
        UsrPlayer player = await _dataLayerService.GetPlayerByIdAsync(playerId, ct);
        if (player is null) {
            throw new InvalidOperationException("Player not found.");
        }
        if (player.Permission == "Suspended") {
            throw new InvalidOperationException("Account suspended.");
        }
    }

    private static Player ToProfile(UsrPlayer player)
        => new() {
            ID = player.Id,
            Name = player.Name,
            Email = player.Email,
            Tokens = player.Tokens,
            ProfileAvatar = player.ProfileAvatar,
            ProfileImageUrl = BuildProfileImageUrl(player),
            ProfileImageContentType = player.ProfileImageContentType,
            ProfileImageUpdatedAt = player.ProfileImageUpdatedAt,
            Permission = player.Permission,
            LastBonusAt = player.LastBonusAt,
            CreatedAt = player.CreatedAt
        };

    private static string? BuildProfileImageUrl(UsrPlayer player)
        => player.ProfileImageContentType is null
            ? null
            : $"/api/v1/Profile/AvatarImage?playerId={player.Id}&v={(player.ProfileImageUpdatedAt ?? player.CreatedAt).Ticks}";

    private static bool IsSupportedImageType(string contentType)
        => contentType is "image/png" or "image/jpeg" or "image/webp" or "image/gif";
}
