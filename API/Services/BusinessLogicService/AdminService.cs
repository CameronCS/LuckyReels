using AutoMapper;
using BusinessLogicServiceInterface;
using DatabaseEntities;
using Microsoft.AspNetCore.SignalR;
using Models;
using SystemFramework.Security;
using SystemFramework.SignalR;

using IDataLayerService = DataAccessServiceInterface.IAdminDataService;

namespace BusinessLogicService;

public class AdminService(IDataLayerService dataLayerService, ActiveTenantService activeTenantService, IHubContext<SystemHub> systemHub, IMapper mapper, IAdminBroadcastService adminBroadcast, IOnlineTracker onlineTracker) : BaseBusinessServiceWithDataService<IDataLayerService>(dataLayerService, activeTenantService, systemHub, mapper), IAdminService {
    public async Task<(List<Player> Players, int Total)> GetPlayersAsync(int page, int pageSize, string? search, CancellationToken ct = default) {
        int skip = (page - 1) * pageSize;

        IReadOnlySet<Guid> onlineIds = onlineTracker.GetOnlineIds();
        List<UsrPlayer> rows = await _dataLayerService.GetPlayersPagedAsync(skip, pageSize, search, onlineIds, ct);
        
        int total = await _dataLayerService.GetPlayerCountAsync(search, ct);
        
        List<Player> players = [.. rows.Select(p => new Player {
            ID = p.Id,
            Name = p.Name,
            Email = p.Email,
            Tokens = p.Tokens,
            ProfileAvatar = p.ProfileAvatar,
            Permission = p.Permission,
            IsOnline = onlineIds.Contains(p.Id),
            CreatedAt = p.CreatedAt,
        })];

        return (players, total);
    }

    public Task BroadcastNotificationAsync(string type, string message, CancellationToken ct = default)
        => adminBroadcast.BroadcastNotificationAsync(type, message);

    public async Task SetTokensAsync(Guid playerId, int tokens, CancellationToken ct = default) {
        UsrPlayer? player = await _dataLayerService.GetPlayerByIdAsync(playerId, ct);
        if (player is null) {
            return;
        }

        await _dataLayerService.SetPlayerTokensAsync(playerId, tokens, ct);

        await adminBroadcast.TokenUpdate(playerId, player.Name, tokens);
        await adminBroadcast.NotifyPlayerTokensUpdated(playerId, tokens);
    }

    public async Task SetPermissionAsync(Guid playerId, string permission, CancellationToken ct = default) {
        if (!IsValidPermission(permission)) {
            throw new InvalidOperationException("Invalid permission.");
        }

        await _dataLayerService.SetPlayerPermissionAsync(playerId, permission, ct);
    }

    private static bool IsValidPermission(string permission)
        => permission is "Player" or "VIP" or "Moderated" or "Suspended";
}
