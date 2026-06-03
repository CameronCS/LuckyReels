namespace Models;

public class Player
{
    public Guid ID { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public int Tokens { get; set; }
    public string? ProfileAvatar { get; set; }
    public string? ProfileImageUrl { get; set; }
    public string? ProfileImageContentType { get; set; }
    public DateTime? ProfileImageUpdatedAt { get; set; }
    public string Permission { get; set; } = "Player";
    public bool IsOnline { get; set; }
    public DateTime? LastBonusAt { get; set; }
    public DateTime CreatedAt { get; set; }
}
