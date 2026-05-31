namespace CommonObjects.Games;

public class BlackjackResult
{
    public Card[] PlayerHand { get; set; } = [];
    public Card[] DealerHand { get; set; } = [];
    public int PlayerTotal { get; set; }
    public int DealerTotal { get; set; }
    public string Result { get; set; } = string.Empty;
    public int Net { get; set; }
    public int Bet { get; set; }
    public int NewBalance { get; set; }
}
