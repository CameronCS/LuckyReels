using AutoMapper;
using BusinessLogicServiceInterface;
using Microsoft.AspNetCore.SignalR;
using Models;
using SystemFramework.Security;
using SystemFramework.SignalR;

using IDataLayerService = DataAccessServiceInterface.IAdminDataService;

namespace BusinessLogicService;

public class AdminService(
    IDataLayerService dataLayerService,
    ActiveTenantService activeTenantService,
    IHubContext<SystemHub> systemHub,
    IMapper mapper,
    IAdminBroadcastService adminBroadcast,
    IOnlineTracker onlineTracker)
    : BaseBusinessServiceWithDataService<IDataLayerService>(dataLayerService, activeTenantService, systemHub, mapper), IAdminService
{
    public async Task<(List<Player> Players, int Total)> GetPlayersAsync(int page, int pageSize, string? search, CancellationToken ct = default)
    {
        int skip      = (page - 1) * pageSize;
        var onlineIds = onlineTracker.GetOnlineIds();
        var rows      = await _dataLayerService.GetPlayersPagedAsync(skip, pageSize, search, onlineIds, ct);
        int total     = await _dataLayerService.GetPlayerCountAsync(search, ct);
        var players = rows.Select(p => new Player
        {
            ID        = p.Id,
            Name      = p.Name,
            Email     = p.Email,
            Tokens    = p.Tokens,
            IsOnline  = onlineIds.Contains(p.Id),
            CreatedAt = p.CreatedAt,
        }).ToList();
        return (players, total);
    }

    public Task BroadcastNotificationAsync(string type, string message, CancellationToken ct = default)
        => adminBroadcast.BroadcastNotificationAsync(type, message);

    public async Task SetTokensAsync(Guid playerId, int tokens, CancellationToken ct = default)
    {
        var player = await _dataLayerService.GetPlayerByIdAsync(playerId, ct);
        if (player is null) return;

        await _dataLayerService.SetPlayerTokensAsync(playerId, tokens, ct);

        await adminBroadcast.TokenUpdate(playerId, player.Name, tokens);
        await adminBroadcast.NotifyPlayerTokensUpdated(playerId, tokens);
    }
}
