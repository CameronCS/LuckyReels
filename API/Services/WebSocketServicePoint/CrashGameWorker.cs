using BusinessLogicServiceInterface;
using CommonObjects.Games;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Hosting;

namespace WebSocketServicePoint;

public class CrashGameWorker(IHubContext<GameHub> hub, ICrashGameStore store) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            store.Reset();
            await hub.Clients.Group("Crash").SendAsync(HubEvents.CrashPhase, "betting", ct);
            await Task.Delay(10_000, ct);

            store.StartRound();
            await hub.Clients.Group("Crash").SendAsync(HubEvents.CrashPhase, "running", ct);

            while (!ct.IsCancellationRequested)
            {
                (double multiplier, bool crashed) = store.Tick();

                await hub.Clients.Group("Crash").SendAsync(HubEvents.CrashTick, new CrashUpdate
                {
                    Multiplier = multiplier,
                    Crashed    = crashed
                }, ct);

                if (crashed) break;

                await Task.Delay(100, ct);
            }

            await Task.Delay(3_000, ct);
        }
    }
}
