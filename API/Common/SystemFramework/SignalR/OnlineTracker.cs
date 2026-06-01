using System.Collections.Concurrent;

namespace SystemFramework.SignalR;

public interface IOnlineTracker
{
    void Add(Guid playerId);
    void Remove(Guid playerId);
    IReadOnlySet<Guid> GetOnlineIds();
}

public sealed class OnlineTracker : IOnlineTracker
{
    private readonly ConcurrentDictionary<Guid, int> _counts = new();

    public void Add(Guid playerId)
        => _counts.AddOrUpdate(playerId, 1, (_, c) => c + 1);

    public void Remove(Guid playerId)
        => _counts.AddOrUpdate(playerId, 0, (_, c) => Math.Max(0, c - 1));

    public IReadOnlySet<Guid> GetOnlineIds()
        => new HashSet<Guid>(_counts.Where(kv => kv.Value > 0).Select(kv => kv.Key));
}
