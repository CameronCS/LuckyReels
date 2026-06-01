# Lucky Reels Casino

A real-time browser casino with 8 games, a live admin panel, and a .NET 10 + SignalR backend.

## Games

Slots · Blackjack · Roulette · Horse Racing · Baccarat · Mines · Crash · Plinko

## Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/)
- [Node.js](https://nodejs.org/) v18+
- Microsoft SQL Server (local or remote)
- (Optional) Redis — for multi-instance SignalR backplane + distributed cache

## Setup

### 1. Configure the backend

Set connection strings and keys in `API/Backend/appsettings.json` (or user secrets):

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=localhost;Database=LuckyReels;Trusted_Connection=True;",
    "Redis": ""
  },
  "JwtKey": "your-secret-key-min-32-chars",
  "AutoMapperKey": ""
}
```

Leave `Redis` empty to use in-memory caching (single instance). Populate it with a Redis connection string to enable the Redis backplane for scale-out.

### 2. Run the backend

The backend applies any pending database migrations automatically on first run.

```bash
cd API/Backend
dotnet run
```

The API starts at `https://localhost:7211`. SignalR hubs are mounted at:

| Hub | Route | Purpose |
|---|---|---|
| `GameHub` | `/game` | All game actions and results |
| `SystemHub` | `/hub` | System notifications (bonus alerts, etc.) |
| `AdminHub` | `/adminhub` | Live activity broadcast to the admin panel |

### 3. Install frontend dependencies

```bash
cd luckyreelsclient
npm install
```

### 4. Start the frontend dev server

```bash
npm run dev
```

Vite proxies `/game`, `/hub`, and `/adminhub` to the .NET backend automatically. Open `http://localhost:5173`.

---

## Project Structure

```
├── API/
│   ├── Backend/                              ASP.NET Core host — DI wiring, Program.cs
│   ├── Common/
│   │   ├── CommonObjects/                    Shared request/response DTOs
│   │   ├── Models/                           Domain models (BLL's view of the world)
│   │   └── SystemFramework/                  JWT auth, SignalR utilities, base infrastructure
│   ├── Database/
│   │   ├── DatabaseEntities/                 EF Core entities + App_DBContext
│   │   └── MigrationHandler/                 EF Core code-first migrations
│   ├── ServiceInterfaces/
│   │   ├── BusinessLogicServiceInterface/    BLL service interfaces + BLL-level DTOs
│   │   └── DataAccessServiceInterface/       DAL service interfaces
│   └── Services/
│       ├── APIGateWay/                        HTTP controllers (auth, admin, errors)
│       ├── BusinessLogicService/              BLL implementations + in-memory game state
│       ├── DataAccessService/                 DAL implementations (EF Core queries)
│       ├── GameEngines/                       Pure stateless game logic (RNG, rules, payouts)
│       └── WebSocketServicePoint/             SignalR hubs, CrashGameWorker, AdminBroadcastService
└── luckyreelsclient/                         React frontend (Vite)
    └── src/
        ├── hub.jsx                            HubProvider — owns both SignalR connections
        ├── main.jsx                           App entry point, routes, notification toasts
        ├── components/                        Shared UI (GameHeader, Stars)
        └── pages/                             One component per route/game
```

---

## New player tokens

New players receive **10,000 tokens** on registration.

## Admin panel

Navigate to `/admin` and log in with an admin account. From the admin panel you can:

- View all registered players and their online status
- Adjust token balances
- Watch live game activity
- Create additional admin accounts

## Adding a migration

```bash
dotnet ef migrations add <MigrationName> --project API/Database/MigrationHandler --startup-project API/Backend
```

The migration is applied automatically the next time the backend starts.
