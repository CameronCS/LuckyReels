namespace CommonObjects.Games;

public class PlinkoResult
{
    public int[] Path { get; set; } = [];
    public int Slot { get; set; }
    public double Multiplier { get; set; }
    public int WinAmount { get; set; }
    public int NewBalance { get; set; }
}
