using AutoMapper;
using BusinessLogicServiceInterface;
using CommonObjects.Authentication;
using DatabaseEntities;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Configuration;
using SystemFramework.JWTAuthentication;
using SystemFramework.Security;
using SystemFramework.SignalR;

using IDataLayerService = DataAccessServiceInterface.IAuthService;

namespace BusinessLogicService;

public class AuthService(
    IDataLayerService dataLayerService,
    ActiveTenantService activeTenantService,
    IHubContext<SystemHub> systemHub,
    IMapper mapper,
    IConfiguration configuration)
    : BaseBusinessServiceWithDataService<IDataLayerService>(dataLayerService, activeTenantService, systemHub, mapper), IAuthService
{
    private string JwtKey => configuration.GetValue<string>("JwtKey")!;

    public async Task<AuthenticationResponse> LoginPlayerAsync(AuthenticationRequest request, CancellationToken ct = default)
    {
        UsrPlayer entity = await _dataLayerService.GetPlayerByNameAsync(request.Username, ct);
        if (entity is null || !BCrypt.Net.BCrypt.Verify(request.Password, entity.PasswordHash))
            return new AuthenticationResponse { IsAuthenticated = false };

        return new AuthenticationResponse
        {
            IsAuthenticated = true,
            UserId = entity.Id.ToString(),
            UserName = entity.Name,
            Token = JWTTokenGenerator.Generate(entity.Id.ToString(), entity.Name, "Player", JwtKey)
        };
    }

    public async Task<AuthenticationResponse> LoginAdminAsync(AuthenticationRequest request, CancellationToken ct = default)
    {
        UsrAdmin entity = await _dataLayerService.GetAdminByUsernameAsync(request.Username, ct);
        if (entity is null || !BCrypt.Net.BCrypt.Verify(request.Password, entity.PasswordHash))
            return new AuthenticationResponse { IsAuthenticated = false };

        return new AuthenticationResponse
        {
            IsAuthenticated = true,
            UserId = entity.Id.ToString(),
            UserName = entity.Username,
            Token = JWTTokenGenerator.Generate(entity.Id.ToString(), entity.Username, "Admin", JwtKey)
        };
    }

    public async Task<AuthenticationResponse> RegisterPlayerAsync(RegisterRequest request, CancellationToken ct = default)
    {
        UsrPlayer existing = await _dataLayerService.GetPlayerByNameAsync(request.Name, ct);
        if (existing is not null)
            return new AuthenticationResponse { IsAuthenticated = false };

        UsrPlayer player = new()
        {
            Id = Guid.NewGuid(),
            Name = request.Name,
            Email = request.Email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            Tokens = 10_000,
            CreatedAt = DateTime.UtcNow
        };

        await _dataLayerService.AddPlayerAsync(player, ct);

        return new AuthenticationResponse
        {
            IsAuthenticated = true,
            UserId = player.Id.ToString(),
            UserName = player.Name,
            Token = JWTTokenGenerator.Generate(player.Id.ToString(), player.Name, "Player", JwtKey)
        };
    }
}
