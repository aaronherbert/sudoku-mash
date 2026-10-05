# Sudoku Mash

Real-time multiplayer Sudoku with no server. Players connect peer to peer with
[PeerJS](https://peerjs.com/), and the host's browser runs the game. The UI is
built with Tide (`@aaronherbert/design-system`).

## How to play

1. Enter a display name. One player presses **Create game** and shares the five-digit room code.
2. Others enter the code and press **Join game**. Up to 8 players can join.
3. The host picks Easy (~40 clues), Medium (~32) or Hard (~26) and presses **Start game**. You need at least 2 players.
4. Everyone races to fill the **same board**. Pick a cell, then press 1–9 on the number pad or keyboard. Arrow keys move the selection.
   - The first correct digit in a cell claims it: **1 point**. The digit shows in the scorer's colour. Each player gets a random Tide palette, all at the same shade.
   - Finishing a row earns **+5**, and finishing a 3×3 box earns **+5**. These go to whoever places the last cell.
   - A wrong digit isn't placed, and **locks you out for 5 seconds**.
5. The round ends when the grid is full. The results show the round's placings (ties go to whoever reached the score first) and the running scoreboard. The host can change the difficulty and start the next round.

### Dropping out

- **Guest:** if you refresh or lose your connection, the game reconnects you automatically and restores your score and any lockout.
- **Host:** if you refresh, the game reopens the same room. Guests see "Reconnecting to host…" and wait up to 2 minutes.
- **Host closes the room** (or doesn't come back within 2 minutes): guests see "Host left, game over".

## Run locally

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # engine unit tests + WCAG contrast check of the board colours
npm run typecheck
npm run build
```

To try it alone, open two **separate tabs**: create in one, join in the other. Each tab is its own player, even in the same browser.

### Installing Tide

Tide comes from GitHub Packages, which needs a token even though the package is public:

1. Create a classic personal access token with `read:packages` at https://github.com/settings/tokens.
2. Add it to your **user-level** `~/.npmrc` (never this repo's):
   ```
   //npm.pkg.github.com/:_authToken=<token>
   ```

**Without a token:** if `../design-system` is checked out and built, follow these steps:

1. Remove `@aaronherbert/design-system` from `package.json`.
2. Run `npm install`.
3. Put it back.
4. Run `npm run link:tide`. This links the local copy into `node_modules`.

Once you have a token, run `npm install` to regenerate `package-lock.json` with Tide in it. Then switch the workflow's `npm install` to `npm ci`.

## Deploy (GitHub Pages)

`.github/workflows/deploy.yml` tests, builds and deploys on every push to `main`. You need to do these once:

1. In the repo, go to **Settings → Pages** and set the source to **GitHub Actions**.
2. On the Tide package page, go to **Package settings → Manage Actions access**, add this repository, and give it read access.
3. Vite's `base` is `/sudoku-mash/` (in `vite.config.ts`). If you rename the repo, change it to match.

## How it works

```
src/engine/   Pure host engine: room state, puzzle generation (unique-solution
              backtracking solver), move validation, lockouts, scoring. No DOM or
              network, so it's fully unit-tested. Puzzles are generated in a Web Worker.
src/net/      PeerJS wrapper. messages.ts holds the typed message unions;
              hostTransport.ts and guestTransport.ts handle connections.
src/session/  React hooks that join the engine and network into one RoomHandle
              for the UI. Also handles persistence and reconnects.
src/ui/       Screens, built from Tide components. The board and number pad
              are custom, styled only with Tide tokens (app.css).
```

- The host is also a player. Its moves go through the same `reduce()` as guests' moves, without the network hop.
- Guests only ever receive public state: no solution and no other players' session ids. Every move is checked on the host, and the host enforces lockouts itself, whatever a guest's UI shows.
- Rooms use the PeerJS id `sudoku-mash-<code>` on the free public PeerJS signalling server. All connections are `reliable: true`.
- Each tab keeps a session id and, if it's the host, the full engine state in `localStorage`. These are written after every change and namespaced by a per-tab id held in `sessionStorage`. That way a refresh finds its own session, while two tabs in one browser stay two separate players.
