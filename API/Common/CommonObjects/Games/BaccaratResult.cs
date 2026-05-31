namespace CommonObjects.Games;

public class BaccaratResult
{
    public Card[] PlayerHand { get; set; } = [];
    public Card[] BankerHand { get; set; } = [];
    public string BetType { get; set; } = string.Empty;
    public string Outcome { get; set; } = string.Empty;
    public int Bet { get; set; }
    public int Net { get; set; }
    public int NewBalance { get; set; }
}
