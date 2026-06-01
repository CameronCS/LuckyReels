namespace BusinessLogicService.GameState;

internal class MinesGameState
{
    public bool[] Grid { get; set; } = new bool[25];
    public List<int> Revealed { get; set; } = [];
    public int MineCount { get; set; }
    public int Bet { get; set; }
}
