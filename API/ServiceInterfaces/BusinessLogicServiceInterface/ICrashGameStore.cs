namespace BusinessLogicServiceInterface;

public enum RoundPhase { Betting, Running, Crashed }

public interface ICrashGameStore
{
    RoundPhase Phase { get; }
    double CurrentMultiplier { get; }
    double CrashPoint { get; }
    bool TryPlaceBet(Guid playerId, int bet);
    bool TryCashout(Guid playerId);
    bool TryGetBet(Guid playerId, out int bet);
    void StartRound();
    (double Multiplier, bool Crashed) Tick();
    void Reset();
}
