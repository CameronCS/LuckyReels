using Microsoft.AspNetCore.Authentication;
using System;
using System.Collections.Generic;
using System.Text;

namespace SystemFramework.JWTAuthentication; 
public class JWTAuthenticationOptions : AuthenticationSchemeOptions {
    public string PrivateKey { get; set; } = string.Empty;
    public string CustomHeader { get; set; } = string.Empty;

    public override void Validate() {
        base.Validate();
        if (string.IsNullOrWhiteSpace(PrivateKey)) {
            throw new InvalidOperationException("BearerAuthenticationOptions.PrivateKey must be configured");
        }
    }
}
