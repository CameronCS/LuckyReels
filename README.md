# Lucky Reels Casino

A real-time multiplayer browser casino with 8 games, a live admin panel, and a WebSocket backend.

## Games

Slots · Blackjack · Roulette · Horse Racing · Baccarat · Mines · Crash · Plinko

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- MySQL 8.0+

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env` and fill in your database credentials:

```
DB_HOST=localhost
DB_USER=your_mysql_user
DB_PASS=your_mysql_password
DB_NAME=lucky_reels
PORT=3000

# Optional: restrict WebSocket connections to one origin (recommended in production)
# ALLOWED_ORIGIN=https://your-domain.com
```

### 3. Initialise the database

Creates the schema and your first admin account. Admin password must be at least 12 characters.

```bash
node setup.js <db-user> <db-pass> <admin-username> <admin-password>

# Example
node setup.js root mypassword admin MySecurePassword123
```

### 4. Start the server

```bash
npm start
```

The server starts at `http://localhost:3000`.  
The admin panel is at `http://localhost:3000/admin.html`.

---

## Development with ngrok

To expose the server over HTTPS (required for testing on other devices):

```bash
ngrok http 3000
```

Set `ALLOWED_ORIGIN` in `.env` to your ngrok URL to lock WebSocket connections to that origin:

```
ALLOWED_ORIGIN=https://abc123.ngrok-free.app
```

---

## Project structure

```
├── server.js          Static file server + entry point
├── setup.js           One-time database initialisation
├── lib/
│   ├── db.js          MySQL connection pool + transaction helper
│   ├── ws.js          WebSocket handler — auth, sessions, all game logic
│   └── state.js       In-memory state (sessions, online players, active games)
├── games/             Pure game logic (RNG, rules, payouts)
│   ├── blackjack.js
│   ├── slots.js
│   ├── roulette.js
│   ├── horse.js
│   ├── baccarat.js
│   ├── mines.js
│   ├── crash.js
│   └── plinko.js
├── public/            Static frontend
│   ├── index.html     Hub / lobby
│   ├── admin.html     Admin panel
│   ├── *.html         Individual game pages
│   ├── css/
│   ├── js/
│   │   └── ws-worker.js   SharedWorker — persistent WebSocket across page navigation
│   └── ...
└── docs/
    └── https-setup.md     Production HTTPS / reverse proxy guide
```

---

## New player tokens

New players receive **1,000 tokens** on registration. Admins can adjust balances from the admin panel at any time.

## Admin panel

Navigate to `/admin.html` and log in with the credentials created during setup.

From the admin panel you can:
- View all registered players and their online status
- Adjust token balances
- Watch live game activity
- Create additional admin accounts
