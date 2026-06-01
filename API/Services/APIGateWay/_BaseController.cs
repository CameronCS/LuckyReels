using Microsoft.AspNetCore.Mvc;
using SystemFramework.Security;

namespace APIGateWay;

[ApiController]
[Route("api/v{v:apiVersion}/[Controller]/[Action]")]
public abstract class BaseController(ActiveTenantService activeTenantService) : ControllerBase {
    protected readonly ActiveTenantService _activeTenantService = activeTenantService;
}
