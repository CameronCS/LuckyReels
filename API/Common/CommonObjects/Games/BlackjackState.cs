namespace CommonObjects.Games;

public class BlackjackState
{
    public Card[] PlayerHand { get; set; } = [];
    public Card DealerVisible { get; set; } = new();
    public int PlayerTotal { get; set; }
    public int DealerVisibleTotal { get; set; }
    public int Bet { get; set; }
    public int Balance { get; set; }
    public bool IsGameOver { get; set; }
    public string Result { get; set; } = string.Empty;
    public Card[] DealerHand { get; set; } = [];
    public int DealerTotal { get; set; }
    public int Net { get; set; }
}
