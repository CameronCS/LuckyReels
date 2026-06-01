namespace Models;

public class RouletteLog
{
    public long ID { get; set; }
    public Guid PlayerID { get; set; }
    public string WinNum { get; set; } = string.Empty;
    public int TotalBet { get; set; }
    public int Net { get; set; }
    public DateTime CreatedAt { get; set; }
}
