namespace CommonObjects.Games;

public class MinesResult
{
    public bool[] Grid { get; set; } = [];
    public int[] Revealed { get; set; } = [];
    public int Net { get; set; }
    public int NewBalance { get; set; }
}
