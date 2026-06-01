namespace GameEngines;

public static class SlotsEngine {
    private static readonly string[] Symbols = ["💎", "7️⃣", "🍀", "⭐", "🍒", "🍋", "🍇", "🔔"];
    private static readonly int[] Weights = [1, 3, 5, 8, 12, 15, 18, 20];
    private static readonly Dictionary<string, int> Payouts = new() {
        ["💎"] = 50, ["7️⃣"] = 20, ["🍀"] = 15, ["⭐"] = 10,
        ["🍒"] = 5, ["🍋"] = 3, ["🍇"] = 2, ["🔔"] = 2
    };

    public static (string[] Symbols, int WinAmount, string ResultType) Spin(int bet) {
        string[] s = [Rng(), Rng(), Rng()];
        string a = s[0], b = s[1], c = s[2];
        int winAmount = 0;
        string resultType = "loss";

        if (a == b && b == c) {
            winAmount = bet * Payouts[a];
            resultType = "jackpot";
        } else if (a == b || b == c || a == c) {
            string sym = a == b ? a : b == c ? b : a;
            winAmount = (int)(bet * Payouts[sym] * 0.5);
            resultType = "match";
        }

        return (s, winAmount, resultType);
    }

    private static string Rng() {
        int total = Weights.Sum();
        double r = Random.Shared.NextDouble() * total;
        for (int i = 0; i < Symbols.Length; i++) {
            r -= Weights[i];
            if (r <= 0) {
                return Symbols[i];
            }
        }
        return Symbols[^1];
    }
}
