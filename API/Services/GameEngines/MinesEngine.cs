namespace GameEngines;

public static class MinesEngine
{
    public const int GridSize = 25;

    public static bool[] GenerateGrid(int mineCount)
    {
        bool[] cells = new bool[GridSize];
        int placed = 0;
        while (placed < mineCount)
        {
            int idx = Random.Shared.Next(GridSize);
            if (!cells[idx]) { cells[idx] = true; placed++; }
        }
        return cells;
    }

    public static double CalcMultiplier(int mineCount, int revealed)
    {
        int safe = GridSize - mineCount;
        double prob = 1.0;
        for (int i = 0; i < revealed; i++)
            prob *= (double)(safe - i) / (GridSize - i);
        return Math.Floor(0.97 / prob * 100) / 100.0;
    }
}
