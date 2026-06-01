namespace GameEngines;

public static class PlinkoEngine
{
    private const int Rows = 8;

    private static readonly Dictionary<string, double[]> Multipliers = new()
    {
        ["low"]    = [5.6, 2.1, 1.1, 1.0, 0.5, 1.0, 1.1, 2.1, 5.6],
        ["medium"] = [13,  3,   1.3, 0.7, 0.4, 0.7, 1.3, 3,   13 ],
        ["high"]   = [29,  4,   1.5, 0.3, 0.2, 0.3, 1.5, 4,   29 ],
    };

    public static (int[] Path, int Slot, double Mult, int Net) Drop(int bet, string risk)
    {
        double[] mults = Multipliers.GetValueOrDefault(risk, Multipliers["medium"]);
        int[] path     = new int[Rows];

        for (int i = 0; i < Rows; i++)
            path[i] = Random.Shared.NextDouble() < 0.5 ? 0 : 1;

        int slot    = path.Sum();
        double mult = mults[slot];
        int net     = (int)Math.Floor(bet * mult) - bet;

        return (path, slot, mult, net);
    }
}
