using CommonObjects.Games;

namespace GameEngines;

public static class BlackjackEngine {
    private static readonly string[] Suits = ["♠", "♥", "♦", "♣"];
    private static readonly string[] Ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

    public static List<Card> FreshShoe() {
        List<Card> shoe = [];
        for (int i = 0; i < 6; i++) {
            foreach (string s in Suits) {
                foreach (string r in Ranks) {
                    shoe.Add(new Card { Rank = r, Suit = s });
                }
            }
        }

        Random.Shared.Shuffle(System.Runtime.InteropServices.CollectionsMarshal.AsSpan(shoe));
        return shoe;
    }

    public static Card Draw(List<Card> deck) {
        if (deck.Count < 20) {
            List<Card> fresh = FreshShoe();
            deck.AddRange(fresh);
        }
        Card card = deck[^1];
        deck.RemoveAt(deck.Count - 1);
        return card;
    }

    public static int HandValue(List<Card> hand) {
        int total = 0, aces = 0;
        foreach (Card c in hand) {
            int v = c.Rank == "A" ? 11 : new[] { "J", "Q", "K" }.Contains(c.Rank) ? 10 : int.Parse(c.Rank);
            if (c.Rank == "A") {
                aces++;
            }
            total += v;
        }
        while (total > 21 && aces > 0) {
            total -= 10;
            aces--;
        }
        return total;
    }

    public static void DealerPlay(List<Card> dealerHand, List<Card> deck) {
        while (HandValue(dealerHand) < 17) {
            dealerHand.Add(Draw(deck));
        }
    }

    public static string Resolve(List<Card> playerHand, List<Card> dealerHand) {
        int pv = HandValue(playerHand);
        int dv = HandValue(dealerHand);
        bool playerBJ = pv == 21 && playerHand.Count == 2;
        bool dealerBJ = dv == 21 && dealerHand.Count == 2;

        if (playerBJ && dealerBJ) {
            return "push";
        }
        if (playerBJ) {
            return "blackjack";
        }
        if (pv > 21) {
            return "bust";
        }
        if (dv > 21) {
            return "dealer_bust";
        }
        if (pv > dv) {
            return "win";
        }
        if (pv < dv) {
            return "loss";
        }
        return "push";
    }

    public static int Payout(string result, int bet)
        => result switch {
            "blackjack" => bet + (int)(bet * 1.5),
            "win" => bet * 2,
            "dealer_bust" => bet * 2,
            "push" => bet,
            _ => 0
        };

    public static int Net(string result, int bet)
        => result switch {
            "blackjack" => (int)(bet * 1.5),
            "win" => bet,
            "dealer_bust" => bet,
            "push" => 0,
            _ => -bet
        };
}
