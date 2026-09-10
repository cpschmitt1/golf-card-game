# Golf — Online

A real-time, browser-based version of the Golf card game for 2-6 players, playing a full 18-hole match.

## Project layout

```
packages/
  engine/   Pure game-logic library (deck, rules, turn state machine, scoring). No I/O.
  server/   Node + Express + Socket.IO server. Owns the authoritative game state per room.
  client/   React + Vite single-page app. Renders state and sends player actions.
```

## Running locally

Requires Node.js 18+.

```bash
npm install
npm run dev
```

This builds the engine once, then runs all three packages together:

- Engine — rebuilds automatically on change (`tsup --watch`)
- Server — http://localhost:3001 (`tsx watch`, restarts on change)
- Client — http://localhost:5173 (Vite, hot module reload)

Open http://localhost:5173 in multiple browser tabs (or share your local network URL with friends) to test multiplayer — one tab creates a room and gets a 4-letter room code, the others join with that code.

The client talks to the server via `VITE_SERVER_URL` (defaults to `http://localhost:3001`); copy `packages/client/.env.example` to `.env` if you need to point it elsewhere.

## Tests

The engine has unit tests for scoring and the full turn/hole state machine:

```bash
npm test
```

## Known v1 limitations

- Game state is in-memory only — restarting the server ends any in-progress games.
- No reconnect support: refreshing the page drops you from the game (you're re-added as a new player if you rejoin the room while it's still in the lobby).
- Not deployed yet. The server needs a host that supports long-lived WebSocket connections (Render, Fly.io, Railway, etc.); the client can be deployed as a static site pointed at the deployed server via `VITE_SERVER_URL`.
