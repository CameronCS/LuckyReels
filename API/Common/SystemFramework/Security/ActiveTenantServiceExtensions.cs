using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

namespace SystemFramework.Security; 
public static class ActiveTenantServiceExtensions {
    public static IServiceCollection AddActiveTenantService(this IServiceCollection services) {
        services.AddHttpContextAccessor();
        services.AddScoped<ActiveTenantService>();
        services.AddSingleton<IHttpContextAccessor, HttpContextAccessor>();
        return services;
    }
}
