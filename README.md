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

To test multiplayer locally, open http://localhost:5173 as **multiple separate browser profiles or
incognito/private windows** (not just multiple tabs — see [Reconnecting mid-game](#reconnecting-mid-game)
for why), or share your local network URL with friends on other machines. One window creates a room
and gets a 4-letter room code, the others join with that code.

The client talks to the server via `VITE_SERVER_URL` (defaults to `http://localhost:3001`); copy `packages/client/.env.example` to `.env` if you need to point it elsewhere.

## Tests

The engine has unit tests for scoring and the full turn/hole state machine:

```bash
npm test
```

## Reconnecting mid-game

Player identity is decoupled from the socket connection: joining or creating a room issues a
stable `playerId` plus a secret `playerToken`, stored in the browser's `localStorage`. If the tab
reloads, is closed and reopened, or the connection drops and comes back (flaky wifi), the client
automatically sends that stored credential to the server via `room:reconnect`, which reattaches
the same seat in the room's in-memory game state and sends back exactly where things stand — your
grid, whose turn it is, the piles — not a fresh game.

**This identity is shared by every tab/window of the same browser profile**, since `localStorage`
is per-origin, not per-tab (unlike `sessionStorage`). That's deliberate — it's what makes the seat
survive closing and reopening a tab — but it means two tabs of the same browser can no longer play
as two different people: opening a second tab just opens the same seat again. When that happens,
the server evicts whichever connection was there first (`bindSocketToPlayer` in
`packages/server/src/index.ts`), and the losing tab detects the forced disconnect (`reason === 'io
server disconnect'`, which socket.io does *not* auto-reconnect from) and falls back to the home
screen with an explanatory message instead of hanging. **To test multiple players locally, use
separate browser profiles or incognito/private windows** — see "Running locally" above.

A "Leave room" / "Leave game" link (lobby and scoreboard screens) clears the stored identity and
tells the server to mark that seat disconnected, so you can walk away from a finished match or a
room you joined by mistake without having to clear browser storage by hand.

A room with zero connected players is kept in memory for 10 minutes (`ROOM_EMPTY_TTL_MS` in
`packages/server/src/rooms.ts`) in case everyone reconnects; only after that does it get dropped.
Restarting the *server* process still ends all games, by design — this only covers a player's
connection dropping (or leaving) while the server keeps running.

**To test reconnect-after-refresh yourself:** start a game (two windows, see above), take a couple
of turns, then just refresh one of them. It should skip the home screen, briefly show "Resuming
your game…", and land back in the game with that player's hand, the current turn, and the piles
intact — check the other window too, its "disconnected" badge on that player should clear once
they're back. Closing and reopening the tab (not just refreshing) works the same way now.

**To test a real wifi drop** (without reloading): open devtools and toggle the Network tab to
Offline for a few seconds, then back to Online — socket.io reconnects on its own and triggers the
same flow.

**To test the eviction/takeover path:** open the same window's URL in a second tab of the *same*
browser (deliberately triggering the shared-identity case) — the second tab should take over the
seat, and the first should immediately show "This game was opened in another tab or window."

## Known v1 limitations

- Game state is in-memory only — restarting the *server* ends any in-progress games (see above;
  this is unrelated to a player's own connection dropping, which is handled).
- No standing-in for a host who disconnects and never returns — they keep host privileges (start
  game / next hole) across reconnects, but there's no host handoff if they leave for good.
- Not deployed yet. The server needs a host that supports long-lived WebSocket connections (Render, Fly.io, Railway, etc.); the client can be deployed as a static site pointed at the deployed server via `VITE_SERVER_URL`.
