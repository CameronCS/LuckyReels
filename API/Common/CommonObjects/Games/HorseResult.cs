namespace CommonObjects.Games;

public class HorseResult
{
    public string WinnerName { get; set; } = string.Empty;
    public string PickedName { get; set; } = string.Empty;
    public int Bet { get; set; }
    public int Net { get; set; }
    public int NewBalance { get; set; }
}
