namespace Models;

public class BlackjackLog
{
    public long ID { get; set; }
    public Guid PlayerID { get; set; }
    public string Result { get; set; } = string.Empty;
    public string PlayerCards { get; set; } = string.Empty;
    public string DealerCards { get; set; } = string.Empty;
    public int Bet { get; set; }
    public int Net { get; set; }
    public DateTime CreatedAt { get; set; }
}
