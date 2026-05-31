namespace Models;

public class BaccaratLog
{
    public long ID { get; set; }
    public Guid PlayerID { get; set; }
    public string BetType { get; set; } = string.Empty;
    public string Outcome { get; set; } = string.Empty;
    public string PlayerHand { get; set; } = string.Empty;
    public string BankerHand { get; set; } = string.Empty;
    public int Bet { get; set; }
    public int Net { get; set; }
    public DateTime CreatedAt { get; set; }
}
