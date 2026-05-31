namespace Models;

public class Session
{
    public Guid Token { get; set; }
    public Guid PlayerID { get; set; }
    public DateTime CreatedAt { get; set; }
}
