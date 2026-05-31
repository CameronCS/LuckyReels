namespace BusinessLogicService.Engines;

internal static class CrashEngine
{
    internal static double GenerateCrashPoint()
    {
        double r = Random.Shared.NextDouble();
        return Math.Max(1.00, Math.Floor(0.99 / (1 - r) * 100) / 100.0);
    }

    internal static double GetMultiplier(double elapsedMs)
        => Math.Floor(Math.Pow(Math.E, elapsedMs / 8000.0) * 100) / 100.0;
}
