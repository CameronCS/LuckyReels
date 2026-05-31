using CommonObjects.Games;

namespace BusinessLogicService.Engines;

internal static class BaccaratEngine
{
    private static readonly string[] Suits = ["♠", "♥", "♦", "♣"];
    private static readonly string[] Ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

    private static List<Card> FreshShoe()
    {
        List<Card> shoe = [];
        for (int i = 0; i < 8; i++)
            foreach (string s in Suits)
                foreach (string r in Ranks)
                    shoe.Add(new Card { Rank = r, Suit = s });

        Random.Shared.Shuffle(System.Runtime.InteropServices.CollectionsMarshal.AsSpan(shoe));
        return shoe;
    }

    private static int CardValue(string rank)
    {
        if (rank == "A") return 1;
        if (rank == "10" || rank == "J" || rank == "Q" || rank == "K") return 0;
        return int.Parse(rank);
    }

    private static int HandTotal(List<Card> hand)
        => hand.Sum(c => CardValue(c.Rank)) % 10;

    internal static (List<Card> PlayerHand, List<Card> BankerHand, string Outcome, int Net) Play(string betType, int bet)
    {
        List<Card> shoe = FreshShoe();
        int pos = 0;
        Card Draw() => shoe[pos++];

        List<Card> playerHand = [Draw(), Draw()];
        List<Card> bankerHand = [Draw(), Draw()];

        bool natural = HandTotal(playerHand) >= 8 || HandTotal(bankerHand) >= 8;

        Card playerThird = null;
        if (!natural)
        {
            if (HandTotal(playerHand) <= 5)
            {
                playerThird = Draw();
                playerHand.Add(playerThird);
            }

            int bt = HandTotal(bankerHand);
            bool bankerDraws;

            if (playerThird == null)
            {
                bankerDraws = bt <= 5;
            }
            else
            {
                int p3 = CardValue(playerThird.Rank);
                bankerDraws = bt <= 2 ? true
                    : bt == 3 ? p3 != 8
                    : bt == 4 ? p3 >= 2 && p3 <= 7
                    : bt == 5 ? p3 >= 4 && p3 <= 7
                    : bt == 6 ? p3 == 6 || p3 == 7
                    : false;
            }

            if (bankerDraws) bankerHand.Add(Draw());
        }

        int playerTotal = HandTotal(playerHand);
        int bankerTotal = HandTotal(bankerHand);
        string outcome  = playerTotal > bankerTotal ? "player"
                        : bankerTotal > playerTotal ? "banker"
                        : "tie";

        int net = betType switch
        {
            "player" => outcome == "player" ? bet : outcome == "tie" ? 0 : -bet,
            "banker" => outcome == "banker" ? (int)(bet * 0.95) : outcome == "tie" ? 0 : -bet,
            _        => outcome == "tie" ? bet * 8 : -bet
        };

        return (playerHand, bankerHand, outcome, net);
    }
}
