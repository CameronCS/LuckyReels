namespace GameEngines;

public static class HorseEngine
{
    public static readonly string[] Names = ["Thunder Bolt", "Lucky Strike", "Iron Duke", "Wild Fire", "Night Shadow", "Silver Fox"];

    private const int    Count  = 6;
    private const double Adv    = 0.27;
    private const int    Payout = 4;

    public static (int WinnerIndex, string WinnerName, int Net) Race(int bet, int horseIndex)
    {
        double[] speeds = new double[Count];
        bool isBlowout  = Random.Shared.NextDouble() < 0.10;

        if (isBlowout)
        {
            int losers = Random.Shared.NextDouble() < 0.5 ? 2 : 3;
            for (int i = 0; i < Count; i++)
                speeds[i] = i < losers
                    ? 0.28 + Random.Shared.NextDouble() * 0.24
                    : 0.84 + Random.Shared.NextDouble() * 0.36;

            Random.Shared.Shuffle(speeds);
        }
        else
        {
            double baseSpeed = 0.88 + Random.Shared.NextDouble() * 0.12;
            for (int i = 0; i < Count; i++)
                speeds[i] = baseSpeed + (Random.Shared.NextDouble() - 0.5) * 0.30;
        }

        double[] pos    = new double[Count];
        int      winner = -1;

        while (winner < 0)
        {
            for (int i = 0; i < Count; i++)
            {
                if (pos[i] >= 100) continue;
                pos[i] = Math.Min(100, pos[i] + Adv * speeds[i] + (Random.Shared.NextDouble() - 0.5) * 0.09);
                if (pos[i] >= 100 && winner < 0) winner = i;
            }
        }

        int net = (winner == horseIndex ? bet * Payout : 0) - bet;
        return (winner, Names[winner], net);
    }
}
