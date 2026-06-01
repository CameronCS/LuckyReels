using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.DependencyInjection;

namespace SystemFramework.JWTAuthentication; 
public static class JWTAuthenticationExtension {
    public static AuthenticationBuilder AddJWTAuthentication(this IServiceCollection services, Action<JWTAuthenticationOptions> configurationOption) {
        return services.AddAuthentication(options => options.DefaultScheme = JWTAuthenticationHandler.BearerAuthenticationHandlerScheme)
                       .AddScheme<JWTAuthenticationOptions, JWTAuthenticationHandler>(JWTAuthenticationHandler.BearerAuthenticationHandlerScheme, configurationOption);
    }
}
