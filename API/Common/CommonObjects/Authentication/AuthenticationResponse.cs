namespace CommonObjects.Authentication;

public class AuthenticationResponse
{
    public string Token { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public string? ProfileAvatar { get; set; }
    public string? ProfileImageUrl { get; set; }
    public string Permission { get; set; } = string.Empty;
    public string FailureReason { get; set; } = string.Empty;
    public bool IsAuthenticated { get; set; }
}
