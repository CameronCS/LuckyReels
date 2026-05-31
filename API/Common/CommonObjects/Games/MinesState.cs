namespace CommonObjects.Games;

public class MinesState
{
    public int[] Revealed { get; set; } = [];
    public double Multiplier { get; set; }
    public int Bet { get; set; }
    public int Balance { get; set; }
    public bool IsGameOver { get; set; }
    public bool HitMine { get; set; }
    public bool[] Grid { get; set; } = [];
    public int Net { get; set; }
}
