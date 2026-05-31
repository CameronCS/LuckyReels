using AutoMapper;
using DataAccessServiceInterface;
using Microsoft.AspNetCore.SignalR;
using SystemFramework.Security;
using SystemFramework.SignalR;

namespace BusinessLogicService;

public abstract class BaseBusinessServiceWithDataService<TDataLayerService>(TDataLayerService dataLayerService, ActiveTenantService activeTenantService, IHubContext<SystemHub> systemHub, IMapper mapper) where TDataLayerService : IBaseDataLayerService {
    protected readonly TDataLayerService _dataLayerService = dataLayerService;
    protected readonly ActiveTenantService _activeTenantService = activeTenantService;
    protected readonly IHubContext<SystemHub> _systemHub = systemHub;
    protected readonly IMapper _mapper = mapper;
}
