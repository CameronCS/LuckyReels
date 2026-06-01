using CommonObjects.Games;

namespace GameEngines;

public static class RouletteEngine {
    private static readonly HashSet<int> Red = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
    private static readonly int[] Wheel = [0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, 37, 27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2];

    private static readonly Dictionary<string, (int[] Winners, int Payout)> Bets = BuildBets();

    private static Dictionary<string, (int[], int)> BuildBets() {
        Dictionary<string, (int[], int)> d = new();

        d["straight-0"] = ([0], 35);
        d["straight-37"] = ([37], 35);
        for (int n = 1; n <= 36; n++)
            d[$"straight-{n}"] = ([n], 35);

        int[] black = Enumerable.Range(1, 36).Where(n => !Red.Contains(n)).ToArray();

        d["col-1"] = ([1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34], 2);
        d["col-2"] = ([2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35], 2);
        d["col-3"] = ([3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36], 2);
        d["dozen-1"] = (Range(1, 12), 2);
        d["dozen-2"] = (Range(13, 24), 2);
        d["dozen-3"] = (Range(25, 36), 2);
        d["low"] = (Range(1, 18), 1);
        d["high"] = (Range(19, 36), 1);
        d["even"] = (Enumerable.Range(2, 35).Where(n => n % 2 == 0).ToArray(), 1);
        d["odd"] = (Enumerable.Range(1, 35).Where(n => n % 2 == 1).ToArray(), 1);
        d["red"] = ([.. Red], 1);
        d["black"] = (black, 1);

        return d;
    }

    private static int[] Range(int from, int to)
        => Enumerable.Range(from, to - from + 1).ToArray();

    public static (int WinNum, int TotalBet, int Net, List<string> WinningKeys) Spin(List<RouletteBet> bets) {
        int winNum = Wheel[Random.Shared.Next(Wheel.Length)];
        int totalBet = 0;
        int totalReturn = 0;
        List<string> winningKeys = [];

        foreach (RouletteBet bet in bets) {
            int amount = Math.Max(0, bet.Amount);
            if (amount == 0) {
                continue;
            }

            totalBet += amount;

            if (!Bets.TryGetValue(bet.Key, out (int[] Winners, int Payout) def)) {
                continue;
            }
            if (def.Winners.Contains(winNum)) {
                totalReturn += amount * (def.Payout + 1);
                winningKeys.Add(bet.Key);
            }
        }

        return (winNum, totalBet, totalReturn - totalBet, winningKeys);
    }

    public static string FormatWinNumber(int n) => n == 37 ? "00" : n.ToString();
}
