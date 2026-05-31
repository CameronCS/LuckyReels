using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Text;
using System.Text.Encodings.Web;

namespace SystemFramework.JWTAuthentication; 
public class JWTAuthenticationHandler(IOptionsMonitor<JWTAuthenticationOptions> options, ILoggerFactory logger, UrlEncoder encoder) : AuthenticationHandler<JWTAuthenticationOptions>(options, logger, encoder) {
    public const string BearerAuthenticationHandlerScheme = "BearerAuthenticationHandlerScheme";

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync() {
        Endpoint endpoint = Context.GetEndpoint();
        if (endpoint?.Metadata?.GetMetadata<IAllowAnonymous>() is not null) {
            return AuthenticateResult.NoResult();
        }

        string headerName = !string.IsNullOrEmpty(Options.CustomHeader) ? Options.CustomHeader : "Authorization";

        string headerValue = Request.Headers[headerName].FirstOrDefault();

        if (string.IsNullOrEmpty(headerValue) && Request.Query.TryGetValue("access_token", out var queryToken))
            headerValue = $"Bearer {queryToken}";

        if (string.IsNullOrEmpty(headerValue))
            return AuthenticateResult.NoResult();

        string[] bearer = headerValue.Split(' ', StringSplitOptions.RemoveEmptyEntries);

        if (bearer.Length != 2 || !bearer[0].Equals("Bearer", StringComparison.OrdinalIgnoreCase)) {
            string failureReason = "Invalid authorization header format";
            Logger.LogWarning("Authentication failed: {Reason} - Path: {Path}", failureReason, Request.Path.Value);
            return AuthenticateResult.Fail(failureReason);
        }

        string encodedToken = bearer[1];

        JsonWebTokenHandler tokenHandler = new();
        byte[] key = Encoding.ASCII.GetBytes(Options.PrivateKey);
        TokenValidationParameters parameters = new() {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(key),
            ValidateIssuer = false,
            ValidateAudience = false,
            ClockSkew = TimeSpan.Zero,
        };

        try {
            TokenValidationResult result = await tokenHandler.ValidateTokenAsync(encodedToken, parameters);

            if (!result.IsValid) {
                string failureReason = result.Exception?.Message ?? "Token validation failed";
                Logger.LogWarning("Authentication failed: {Reason} - Path: {Path}", failureReason, Request.Path.Value);
                return AuthenticateResult.Fail(failureReason);
            }

            ClaimsPrincipal claimsPrincipal = new(result.ClaimsIdentity);
            AuthenticationTicket ticket = new(claimsPrincipal, Scheme.Name);
            return AuthenticateResult.Success(ticket);
        } catch (Exception ex) {
            Logger.LogWarning(ex, "Authentication failed: {Message} - Path: {Path}", ex.Message, Request.Path.Value);
            return AuthenticateResult.Fail(ex.Message);
        }
    }
}
