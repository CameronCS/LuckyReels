namespace CommonObjects.Authentication; 
public class AuthenticationResponse {
    public AuthenticationResponse() {
    }

    public AuthenticationResponse(int activeTenantId, int userId, string userName) {
        ActiveTenantId = activeTenantId;
        UserId = userId;
        UserName = userName;
    }

    public int ActiveTenantId {
        get; set;
    }

    public int UserId {
        get; set;
    }

    public string UserName { get; set; } = "";

    public bool IsAuthenticated {
        get; set;
    }
}
