using Microsoft.AspNetCore.Mvc.ApplicationModels;

namespace APIGateWay;

public class GatewayControllerConvention : IControllerModelConvention
{
    public void Apply(ControllerModel controller)
    {
        if (controller.ControllerName.EndsWith("Gateway")) {
            controller.ControllerName = controller.ControllerName[..^"Gateway".Length];
        }
    }
}
