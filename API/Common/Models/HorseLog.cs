namespace Models;

public class HorseLog
{
    public long ID { get; set; }
    public Guid PlayerID { get; set; }
    public string WinnerName { get; set; } = string.Empty;
    public string PickedName { get; set; } = string.Empty;
    public int Bet { get; set; }
    public int Net { get; set; }
    public DateTime CreatedAt { get; set; }
}
