using AutoMapper;
using DatabaseEntities;
using Microsoft.AspNetCore.SignalR;
using SystemFramework.Security;
using SystemFramework.SignalR;
using BusinessLogicServiceInterface;
using Models;

using IDataLayerService = DataAccessServiceInterface.IErrorService;

namespace BusinessLogicService;

public class ErrorService(IDataLayerService dataLayerService, ActiveTenantService activeTenantService, IHubContext<SystemHub> systemHub, IMapper simpleMapper) : BaseBusinessServiceWithDataService<IDataLayerService>(dataLayerService, activeTenantService, systemHub, simpleMapper), IErrorService {
    public async Task AddError(Error error, CancellationToken cancellationToken = default) {
        ErrError rawData = _mapper.Map<ErrError>(error);
        await _dataLayerService.AddError(rawData, cancellationToken);
    }

    public async Task<IEnumerable<Error>> GetAllErrors(CancellationToken cancellationToken) {
        IEnumerable<ErrError> rawData = await _dataLayerService.GetAllErrors(cancellationToken);
        IEnumerable<Error> errors = _mapper.Map<IEnumerable<Error>>(rawData);

        return errors;
    }
}
