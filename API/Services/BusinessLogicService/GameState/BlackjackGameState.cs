using CommonObjects.Games;

namespace BusinessLogicService.GameState;

internal class BlackjackGameState
{
    public List<Card> Deck { get; set; } = [];
    public List<Card> PlayerHand { get; set; } = [];
    public List<Card> DealerHand { get; set; } = [];
    public int Bet { get; set; }
}
