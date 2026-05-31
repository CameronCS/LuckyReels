namespace CommonObjects.Authentication;

public class AuthenticationResponse
{
    public string Token { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public bool IsAuthenticated { get; set; }
}
