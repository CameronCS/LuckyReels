using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using System.Security.Claims;
using System.Text;

namespace SystemFramework.JWTAuthentication;

public static class JWTTokenGenerator
{
    public static string Generate(string userId, string userName, string role, string privateKey)
    {
        byte[] key = Encoding.ASCII.GetBytes(privateKey);

        SecurityTokenDescriptor descriptor = new()
        {
            Subject = new ClaimsIdentity([
                new Claim(ClaimTypes.Sid, userId),
                new Claim(ClaimTypes.Name, userName),
                new Claim(ClaimTypes.UserData, role == "Admin" ? "1" : "0"),
                new Claim(ClaimTypes.Role, role),
            ]),
            Expires = DateTime.UtcNow.AddHours(8),
            SigningCredentials = new SigningCredentials(
                new SymmetricSecurityKey(key),
                SecurityAlgorithms.HmacSha256Signature
            )
        };

        return new JsonWebTokenHandler().CreateToken(descriptor);
    }
}
