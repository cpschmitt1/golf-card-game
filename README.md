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

## Host controls, and the end-of-hole flow

After every hole ends normally (final turns all taken and the hole scored), everyone's cards are
revealed as part of scoring — but the board shows that reveal on its own for a moment ("Hole N is
over — here's everyone's final hand", with a **See Scores →** button) before the scoreboard pops
up, so you actually get to look at what everyone had instead of it vanishing straight under a
modal. This is purely client-local and per-player — nobody's forced through it in lockstep, and
clicking through doesn't affect what other players see.

The host has two controls, both host-only and both visible in `GameBoard`'s header/scoreboard:

- **End Match** — always available, in any phase, including mid-hole. Clicking it (after a confirm
  prompt) ends the match immediately. If a hole is in progress, it's **discarded**: no score is
  recorded for it, and — unlike a normal hole ending — nobody's cards are revealed, since the hole
  never happened as far as scoring is concerned. Between holes, there's nothing in-progress to
  discard, so it's just a flag flip straight to final results.
- **Play Again** — appears on the final-results screen once the match is over (naturally at hole 18,
  or via End Match). Resets the room back to the lobby with the **same room code and same players**
  (scores reset to zero), so a group can start another match without everyone leaving and
  re-sharing a link. Reconnect credentials aren't affected by this — it only touches the
  lobby/match state, not the room's identity bookkeeping.

## Known v1 limitations

- Game state is in-memory only — restarting the *server* ends any in-progress games (see above;
  this is unrelated to a player's own connection dropping, which is handled).
- No standing-in for a host who disconnects and never returns — they keep host privileges (start
  game / next hole) across reconnects, but there's no host handoff if they leave for good.
- Single server instance only — game state lives in that one process's memory, so this can't be
  scaled to multiple replicas without adding a shared store (e.g. Redis) for room state and the
  Socket.IO adapter. Fine for a friends game; don't bump Railway's replica count above 1.

## Deploying to Railway

This is an npm-workspaces monorepo, so the **engine package must be built before either the server
or the client**, and both services need their Railway "Root Directory" left at the repo root (not
pointed at `packages/server` or `packages/client`) so `npm install` can see the workspace config —
custom Build/Start commands target the right package instead.

Create **two Railway services from this repo** (same GitHub repo, added twice):

**1. Server service**
- Root Directory: `/` (leave as the repo root)
- Build Command: `npm run build:server`
- Start Command: `npm run start:server`
- Settings → Networking → Generate Domain (needs a public URL so browsers can reach it)
- Variables: `CLIENT_ORIGIN` — set once you have the client's URL (step 2); can be a comma-separated
  list if you later add a custom domain. `PORT` is set automatically by Railway — don't set it.
- Optional: Settings → Deploy → Healthcheck Path → `/health`

**2. Client service**
- Root Directory: `/` (same repo, same setting)
- Build Command: `npm run build:client`
- Start Command: `npm run start:client`
- Settings → Networking → Generate Domain
- Variables: `VITE_SERVER_URL` = the server's public URL from step 1 (e.g.
  `https://golf-server-production.up.railway.app`). This is baked in **at build time** (Vite), so
  changing it later requires a redeploy of this service, not just a restart.

**Then go back to the server service** and set `CLIENT_ORIGIN` to the client's public URL from step
2 — Railway redeploys automatically on a variable change. After that, both URLs know about each
other and the app is live at the client's domain.

Railway's generated domains are HTTPS out of the box, and Socket.IO's websocket transport upgrades
to `wss://` automatically from an `https://` URL — no extra config needed there. Locally, you can
sanity-check the exact production build Railway will run with:

```bash
npm run build:server && npm run build:client
CLIENT_ORIGIN=http://localhost:4173 PORT=3001 node packages/server/dist/index.js &
cd packages/client && PORT=4173 npm run start
```

(then open http://localhost:4173 — the default `VITE_SERVER_URL` of `http://localhost:3001` matches
the server started above, so no `.env` needed for this local check specifically).
