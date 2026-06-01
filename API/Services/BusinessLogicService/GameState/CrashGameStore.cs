using GameEngines;
using BusinessLogicServiceInterface;

namespace BusinessLogicService.GameState;

public class CrashGameStore : ICrashGameStore
{
    private readonly object _lock = new();
    private readonly Dictionary<Guid, int> _bets = new();
    private readonly HashSet<Guid> _cashedOut = new();
    private DateTime _roundStart;

    public RoundPhase Phase { get; private set; } = RoundPhase.Betting;
    public double CurrentMultiplier { get; private set; } = 1.0;
    public double CrashPoint { get; private set; }

    public bool TryPlaceBet(Guid playerId, int bet)
    {
        lock (_lock)
        {
            if (Phase != RoundPhase.Betting) return false;
            _bets[playerId] = bet;
            return true;
        }
    }

    public bool TryCashout(Guid playerId)
    {
        lock (_lock)
        {
            if (Phase != RoundPhase.Running) return false;
            if (!_bets.ContainsKey(playerId) || _cashedOut.Contains(playerId)) return false;
            _cashedOut.Add(playerId);
            return true;
        }
    }

    public bool TryGetBet(Guid playerId, out int bet)
    {
        lock (_lock) { return _bets.TryGetValue(playerId, out bet); }
    }

    public void StartRound()
    {
        lock (_lock)
        {
            CrashPoint = CrashEngine.GenerateCrashPoint();
            CurrentMultiplier = 1.0;
            _roundStart = DateTime.UtcNow;
            Phase = RoundPhase.Running;
        }
    }

    public (double Multiplier, bool Crashed) Tick()
    {
        lock (_lock)
        {
            double elapsed = (DateTime.UtcNow - _roundStart).TotalMilliseconds;
            double multiplier = CrashEngine.GetMultiplier(elapsed);

            if (multiplier >= CrashPoint)
            {
                CurrentMultiplier = CrashPoint;
                Phase = RoundPhase.Crashed;
                return (CrashPoint, true);
            }

            CurrentMultiplier = multiplier;
            return (multiplier, false);
        }
    }

    public void Reset()
    {
        lock (_lock)
        {
            _bets.Clear();
            _cashedOut.Clear();
            Phase = RoundPhase.Betting;
            CurrentMultiplier = 1.0;
        }
    }
}
