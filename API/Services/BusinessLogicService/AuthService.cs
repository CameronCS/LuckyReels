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

        return new AuthenticationResponse {
            IsAuthenticated = true,
            UserId = entity.Id.ToString(),
            UserName = entity.Name,
            ProfileAvatar = entity.ProfileAvatar,
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
            Permission = player.Permission,
            Token = JWTTokenGenerator.Generate(player.Id.ToString(), player.Name, "Player", JwtKey)
        };
    }

    public async Task<Player?> GetPlayerProfileAsync(Guid playerId, CancellationToken ct = default) {
        UsrPlayer player = await _dataLayerService.GetPlayerByIdAsync(playerId, ct);
        return player is null ? null : ToProfile(player);
    }

    public async Task<Player?> UpdatePlayerAvatarAsync(Guid playerId, string? avatar, CancellationToken ct = default) {
        if (!string.IsNullOrWhiteSpace(avatar) && avatar.Length > 400_000) {
            throw new InvalidOperationException("Profile image is too large.");
        }

        await _dataLayerService.UpdatePlayerAvatarAsync(playerId, string.IsNullOrWhiteSpace(avatar) ? null : avatar, ct);
        UsrPlayer player = await _dataLayerService.GetPlayerByIdAsync(playerId, ct);
        return player is null ? null : ToProfile(player);
    }

    private static Player ToProfile(UsrPlayer player)
        => new() {
            ID = player.Id,
            Name = player.Name,
            Email = player.Email,
            Tokens = player.Tokens,
            ProfileAvatar = player.ProfileAvatar,
            Permission = player.Permission,
            LastBonusAt = player.LastBonusAt,
            CreatedAt = player.CreatedAt
        };
}
