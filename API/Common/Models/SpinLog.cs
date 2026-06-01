namespace Models;

public class SpinLog
{
    public long ID { get; set; }
    public Guid PlayerID { get; set; }
    public byte MachineNum { get; set; }
    public string Symbols { get; set; } = string.Empty;
    public int Bet { get; set; }
    public int WinAmount { get; set; }
    public string SpinType { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}
