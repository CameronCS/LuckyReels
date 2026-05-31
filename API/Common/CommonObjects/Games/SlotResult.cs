namespace CommonObjects.Games;

public class SlotResult
{
    public string[] Symbols { get; set; } = [];
    public int WinAmount { get; set; }
    public string ResultType { get; set; } = string.Empty;
    public int NewBalance { get; set; }
}
