# Lucky Reels — Architecture

## Overview

.NET 10 backend + React (Vite) frontend.  
Architecture follows an N-tier pattern: **FE → SignalR Hub → BLL → DAL**

---

## Frontend

**Framework:** React 18 + Vite  
**Real-time:** `@microsoft/signalr`  
**Routing:** React Router DOM

### Structure

```
luckyreelsclient/src/
├── hub.jsx              HubProvider context — owns both SignalR connections
├── main.jsx             App entry point, route definitions, notification toasts
├── pages/               One component per route
│   ├── Home.jsx         Lobby / game selection
│   ├── Slots.jsx
│   ├── Blackjack.jsx
│   ├── Roulette.jsx
│   ├── Horse.jsx
│   ├── Baccarat.jsx
│   ├── Mines.jsx
│   ├── Crash.jsx
│   ├── Plinko.jsx
│   └── Admin.jsx
└── components/          Shared UI
    ├── GameHeader.jsx
    └── Stars.jsx
```

### Key Rules

- **`hub.jsx` owns both connections** — `/game` (GameHub) and `/hub` (SystemHub). Pages call `useHub()` only; none create their own connection.
- **JWT stored in localStorage** under keys `lr_token` and `lr_user`.
- **Animation-heavy games use DOM refs** (Horse rAF loop, Crash canvas, Plinko physics) to bypass React re-renders mid-frame. React state is only updated at phase boundaries (idle → racing → result).

---

## Backend Solution Structure

All backend projects live under `API/`.

```
API/
├── Backend/                              ASP.NET Core host
├── Common/
│   ├── CommonObjects/                    Shared request/response DTOs
│   ├── Models/                           Domain models
│   └── SystemFramework/                  JWT auth, SignalR utilities, base infrastructure
├── Database/
│   ├── DatabaseEntities/                 EF Core entities + App_DBContext
│   └── MigrationHandler/                 EF Core code-first migrations
├── ServiceInterfaces/
│   ├── BusinessLogicServiceInterface/    BLL interfaces + BLL-level DTOs
│   └── DataAccessServiceInterface/       DAL interfaces
└── Services/
    ├── APIGateWay/                        HTTP controllers
    ├── BusinessLogicService/              BLL implementations + game state stores
    ├── DataAccessService/                 DAL implementations
    ├── GameEngines/                       Pure stateless game logic
    └── WebSocketServicePoint/             SignalR hubs + background workers
```

---

## Project Responsibilities

| Project | Type | Owns |
|---|---|---|
| **Backend** | ASP.NET Core host | `Program.cs`, DI registration, composition root |
| **CommonObjects** | Class library | Shared request/response DTOs used across layers |
| **Models** | Class library | Plain domain objects — the BLL's view of the world, no EF Core attributes |
| **SystemFramework** | Class library | JWT auth pipeline, `IOnlineTracker`, `IUserIdProvider`, base infrastructure |
| **DatabaseEntities** | Class library | EF Core entity classes + `App_DBContext` |
| **MigrationHandler** | Class library | EF Core code-first migrations (applied automatically on startup) |
| **BusinessLogicServiceInterface** | Class library | BLL service interfaces (`ISlotService`, `IHorseService`, etc.) |
| **DataAccessServiceInterface** | Class library | DAL service interfaces (`ISlotDataService`, etc.) |
| **APIGateWay** | Class library | HTTP controllers (`AuthGateway`, `AdminGateway`, `ErrorGateway`) |
| **BusinessLogicService** | Class library | BLL implementations + in-memory game state (`BlackjackGameState`, `MinesGameState`, `CrashGameStore`) |
| **DataAccessService** | Class library | DAL implementations — EF Core queries, entity↔model mapping |
| **GameEngines** | Class library | Pure stateless game logic (`SlotsEngine`, `HorseEngine`, etc.) — no I/O, no DI |
| **WebSocketServicePoint** | Class library | SignalR hubs (`GameHub`, `AdminHub`, `SystemHub`), `CrashGameWorker`, `AdminBroadcastService` |

---

## Dependency Graph

```
Backend (composition root)
├── refs APIGateWay
├── refs WebSocketServicePoint
├── refs BusinessLogicService     ← to register concrete implementations
└── refs DataAccessService        ← to register concrete implementations

APIGateWay
├── refs BusinessLogicServiceInterface
├── refs CommonObjects
└── refs SystemFramework

WebSocketServicePoint
├── refs BusinessLogicServiceInterface
├── refs CommonObjects
└── refs SystemFramework

BusinessLogicService
├── refs BusinessLogicServiceInterface   ← implements these interfaces
├── refs DataAccessServiceInterface      ← depends on, never on DataAccessService directly
├── refs GameEngines                     ← pure logic, no I/O
├── refs Models
└── refs SystemFramework

BusinessLogicServiceInterface
├── refs Models
├── refs CommonObjects
└── refs SystemFramework

DataAccessService
├── refs DataAccessServiceInterface      ← implements these interfaces
├── refs DatabaseEntities               ← gets entities + DbContext here, maps to Models internally
├── refs Models
└── refs SystemFramework

DataAccessServiceInterface
├── refs Models
└── refs SystemFramework

GameEngines
└── (no internal refs — pure logic, zero dependencies)

Models
└── refs SystemFramework

DatabaseEntities
└── refs SystemFramework

MigrationHandler
└── refs DatabaseEntities

SystemFramework
└── (no internal refs — base layer, referenced by everything)
```

---

## SignalR Hubs

| Hub | Route | Used by |
|---|---|---|
| `GameHub` | `/game` | All game actions (spin, bet, hit, etc.) and results |
| `AdminHub` | `/adminhub` | Admin broadcast — live activity pushed to the admin panel |
| `SystemHub` | `/hub` | System notifications (hourly bonus alerts, etc.) |

---

## Key Rules

- **Backend is the sole composition root** — the only project that references both an interface and its concrete implementation simultaneously.
- **DatabaseEntities is walled off** — only `DataAccessService` references it. Nothing above the DAL knows EF Core exists.
- **GameEngines are pure** — no I/O, no DI, called directly by `BusinessLogicService`. Swapping an engine touches only that file.
- **DAL maps entities → Models** internally before returning data. The BLL only ever works with `Models`.
- **WebSocketServicePoint / APIGateWay** call only `BusinessLogicServiceInterface` — zero knowledge of BLL implementation.

---

## Data Flow Example — Slots Spin

```
React (luckyreelsclient)
  → conn.invoke('SpinSlots', machineNum, bet)
    → GameHub (WebSocketServicePoint)
      → ISlotService.SpinAsync(playerId, bet, machineNum)    [BusinessLogicServiceInterface]
        → SlotsEngine.Spin(bet)                               [GameEngines — pure logic]
        → ISlotDataService.LogSpinAsync(model)                [DataAccessServiceInterface]
        → ISlotDataService.UpdateBalanceAsync(model)          [DataAccessServiceInterface]
        → return SlotResult                                   [CommonObjects]
      → hub sends SlotResult to caller
      → AdminBroadcastService pushes activity to /adminhub
```

---

## Stateful Games (In-Memory State)

Blackjack, Mines, and Crash maintain mid-game state in singleton stores inside `BusinessLogicService`.

| Store | Holds |
|---|---|
| `BlackjackGameState` | Active hands keyed by player ID |
| `MinesGameState` | Active grids + revealed cells keyed by player ID |
| `CrashGameStore` | Active crash timer + bets keyed by player ID |

---

## Background Services

| Service | Location | Behaviour |
|---|---|---|
| `CrashGameWorker` | `WebSocketServicePoint` | `BackgroundService` — drives the crash game loop, broadcasts multiplier updates, settles bets |
| DB migration | `Backend` startup | `context.Database.Migrate()` applies any pending migrations on boot |

---

## Database

**Engine:** Microsoft SQL Server  
**ORM:** EF Core 10  
**Migration strategy:** Code-first — migrations live in `MigrationHandler`, applied automatically on startup via `context.Database.Migrate()`

To add a migration:

```bash
dotnet ef migrations add <Name> --project API/Database/MigrationHandler --startup-project API/Backend
```

---

## Redis (Optional)

Set `ConnectionStrings:Redis` in `appsettings.json` to enable:

- SignalR Redis backplane (scale-out across multiple backend instances)
- `IDistributedCache` backed by Redis instead of in-memory

Leave it empty for single-instance local dev.
