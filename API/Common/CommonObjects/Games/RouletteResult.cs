namespace CommonObjects.Games;

public class RouletteResult
{
    public string WinNumber { get; set; } = string.Empty;
    public int TotalBet { get; set; }
    public int Net { get; set; }
    public int NewBalance { get; set; }
    public string[] WinningBets { get; set; } = [];
}
