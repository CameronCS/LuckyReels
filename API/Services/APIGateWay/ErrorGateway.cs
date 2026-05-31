using BusinessLogicServiceInterface;
using Microsoft.AspNetCore.Mvc;
using SystemFramework.Security;
using Models;

namespace APIGateWay; 
public class ErrorGateway(ActiveTenantService activeTenantService, IErrorService errorService): BaseController(activeTenantService) {
    [HttpPost]
    public async Task AddError(Error error) {
        await errorService.AddError(error);
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<Error>>> GetAllErrors(CancellationToken cancellationToken) {
        IEnumerable<Error> errors = await errorService.GetAllErrors(cancellationToken);
        return Ok(errors);
    }
}
