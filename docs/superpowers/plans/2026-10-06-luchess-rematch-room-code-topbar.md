# luchess 再来一局 + 房间号加入 + 顶栏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let players rematch in the same room (colours swapped), join a room by typing a 6-digit number, and get back to the home page from a shared top bar.

**Architecture:** Room codes become 6-digit numbers and each game gets its own `gameId` for the database, so one room can host many games. `Room` gathers per-game state into `startNewGame()`, used by the constructor and by rematch, which also swaps the two seats. The client reads its seat from every snapshot, so a rematch flips the board without reconnecting. A static top bar replaces the floating language toggle.

**Tech Stack:** TypeScript, Express + ws + better-sqlite3, chessground + chessops, vitest.

**Spec:** `docs/superpowers/specs/2026-10-06-luchess-rematch-room-code-topbar-design.md`

## Global Constraints

- Room code: `100000`–`999999` as a string; game id: 8 chars from the existing safe alphabet.
- `GET /api/rooms/:code` → `200 { roomId, status }` or `404 { error: 'not found' }`.
- New ws messages: `{ type: 'offerRematch' }`, `{ type: 'respondRematch', accept: boolean }`.
- New server error strings: `game is not finished`, `spectators cannot offer rematch`, `no pending rematch offer for you`.
- Snapshot gains `seat: Seat` (the viewer) and `rematchOfferBy: Color | null`.
- A rematch keeps variant/time control, swaps colours, and re-randomizes Chess960; any other custom start FEN is reused.
- Every user-facing string goes through `t()` with both `en` and `zh`.
- No new npm dependencies. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Commands: `cd server && npx tsc --noEmit -p tsconfig.json && npx vitest run`; `cd client && npx tsc --noEmit && npx vitest run && npm run build`.

---

### Task 1: Server — 6-digit room codes, per-game ids, room lookup API

**Files:**
- Modify: `server/src/idGen.ts`, `server/src/roomManager.ts`, `server/src/room.ts`, `server/src/app.ts`
- Test: `server/test/idGen.test.ts`, `server/test/roomManager.test.ts`, `server/test/integration.test.ts`

**Interfaces:**
- Produces: `generateRoomCode(): string`, `generateGameId(length = 8): string` (replaces `generateRoomId`), `Room.gameId: string`, `GET /api/rooms/:code`.

- [ ] **Step 1: Write the failing tests**

Replace `server/test/idGen.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateGameId, generateRoomCode, generateToken } from '../src/idGen.js';

describe('idGen', () => {
  it('generates six-digit room codes that never start with 0', () => {
    for (let i = 0; i < 200; i++) expect(generateRoomCode()).toMatch(/^[1-9]\d{5}$/);
  });

  it('generates a game id of the requested length using the safe alphabet', () => {
    const id = generateGameId(8);
    expect(id).toHaveLength(8);
    expect(id).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ]+$/);
  });

  it('generates different game ids across many calls', () => {
    const ids = new Set(Array.from({ length: 200 }, () => generateGameId(8)));
    expect(ids.size).toBe(200);
  });

  it('generates a token longer than a game id', () => {
    expect(generateToken().length).toBeGreaterThan(8);
  });
});
```

Add to `server/test/roomManager.test.ts` (inside its `describe`):

```ts
  it('names rooms with six-digit codes', () => {
    const manager = new RoomManager();
    expect(manager.createRoom(0, 'white').id).toMatch(/^[1-9]\d{5}$/);
  });
```

In `server/test/integration.test.ts`, first test, replace `expect(games[0].id).toBe(roomId);` with:

```ts
    // Games are stored under their own id, so one room can hold many games.
    expect(games[0].id).toMatch(/^[A-Za-z0-9]{8}$/);
    expect(games[0].id).not.toBe(roomId);
```

and add a new test inside the `describe`:

```ts
  it('reports whether a room code exists', async () => {
    server = createApp({ dbPath: ':memory:' });
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const base = `http://localhost:${(server.address() as AddressInfo).port}`;
    const { roomId } = await (
      await fetch(`${base}/api/games`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeControlMs: 0, colorPref: 'white' }),
      })
    ).json();

    const found = await fetch(`${base}/api/rooms/${roomId}`);
    expect(found.status).toBe(200);
    expect(await found.json()).toEqual({ roomId, status: 'waiting' });

    // Codes start at 100000, so this one can never exist.
    expect((await fetch(`${base}/api/rooms/000000`)).status).toBe(404);
  });
```

- [ ] **Step 2: Run to verify failure** — `cd server && npx vitest run` → FAIL (`generateRoomCode`/`generateGameId` missing, ids not 6 digits, `/api/rooms` 404s, games stored under the room id).

- [ ] **Step 3: Implement**

`server/src/idGen.ts`:

```ts
import { randomBytes, randomInt } from 'node:crypto';

// Excludes visually ambiguous characters (0/O, 1/l/I).
const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';

// Room numbers are what people type or read out to each other: six digits,
// never starting with 0.
export function generateRoomCode(): string {
  return String(randomInt(100000, 1000000));
}

// One per game, for the history database — a room hosts many games.
export function generateGameId(length = 8): string {
  return generateId(length);
}

export function generateToken(length = 24): string {
  return generateId(length);
}

function generateId(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}
```

`server/src/roomManager.ts`: import `generateRoomCode` instead of `generateRoomId`, and

```ts
    let id = generateRoomCode();
    while (this.rooms.has(id)) id = generateRoomCode();
```

`server/src/room.ts`: `import { generateGameId, generateToken } from './idGen.js';`, add a public field `gameId: string;` under `readonly incrementMs`, and in the constructor (before `this.chess = createGame(...)`) `this.gameId = generateGameId();`.

`server/src/app.ts`: in `persistIfFinished` use `id: room.gameId,`; add after `app.get('/api/games/:id', …)`:

```ts
  app.get('/api/rooms/:code', (req, res) => {
    const room = roomManager.get(req.params.code);
    if (!room) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.json({ roomId: room.id, status: room.status });
  });
```

- [ ] **Step 4: Verify** — `cd server && npx tsc --noEmit -p tsconfig.json && npx vitest run` → all pass.

- [ ] **Step 5: Commit** — `git add server && git commit -m "feat(server): six-digit room codes, per-game ids, room lookup API"`

---

### Task 2: Server — rematch

**Files:**
- Modify: `server/src/room.ts`, `server/src/wsHandlers.ts`
- Test: `server/test/room.test.ts`, `server/test/wsHandlers.test.ts`, `server/test/integration.test.ts`

**Interfaces:**
- Consumes: `generateGameId` (Task 1), `generateChess960Fen` (`server/src/chess960.ts`).
- Produces: `Room.offerRematch(seat: Seat): ActionResult`, `Room.respondRematch(seat: Seat, accept: boolean): ActionResult`, `Room.rematchOfferBy: Color | null`, snapshot fields `seat`, `rematchOfferBy`.

- [ ] **Step 1: Write the failing tests**

Append to `server/test/room.test.ts` (inside `describe('Room', …)`):

```ts
  function finishedGame(startFen?: string) {
    let now = 1_000_000;
    const room = new Room('r1', 60_000, 'white', () => now, startFen);
    const whiteWs = fakeWs();
    const blackWs = fakeWs();
    const white = room.connect(whiteWs);
    room.connect(blackWs);
    room.resign('white');
    return { room, whiteWs, blackWs, whiteToken: white.token!, tick: (ms: number) => (now += ms) };
  }

  it('rematch: accepting starts a fresh game in the same room with colours swapped', () => {
    const { room, whiteWs, blackWs, whiteToken } = finishedGame();
    const firstGameId = room.gameId;
    room.markPersisted();
    expect(room.offerRematch('black').ok).toBe(true);
    expect(room.getSnapshot('white').rematchOfferBy).toBe('black');
    expect(room.respondRematch('white', true).ok).toBe(true);

    expect(room.status).toBe('playing');
    expect(room.result).toBeNull();
    expect(room.gameId).not.toBe(firstGameId);
    expect(room.isPersisted()).toBe(false);
    expect(room.seatColorFor(whiteWs)).toBe('black');
    expect(room.seatColorFor(blackWs)).toBe('white');
    const snapshot = room.getSnapshot('white');
    expect(snapshot.historySan).toEqual([]);
    expect(snapshot.clocks).toEqual({ white: 60_000, black: 60_000 });
    expect(snapshot.rematchOfferBy).toBeNull();
    // The first game's white player keeps their token, which now means black.
    expect(room.connect(fakeWs(), whiteToken).seat).toBe('black');
  });

  it('rematch: both players asking starts it without an explicit accept', () => {
    const { room } = finishedGame();
    room.offerRematch('white');
    expect(room.offerRematch('black').ok).toBe(true);
    expect(room.status).toBe('playing');
  });

  it('rematch: declining keeps the finished game and clears the offer', () => {
    const { room } = finishedGame();
    room.offerRematch('white');
    expect(room.respondRematch('black', false).ok).toBe(true);
    expect(room.status).toBe('finished');
    expect(room.rematchOfferBy).toBeNull();
  });

  it('rematch: only players can ask, only once the game is over, and not answer themselves', () => {
    const live = new Room('r1', 0, 'white');
    live.connect(fakeWs());
    live.connect(fakeWs());
    expect(live.offerRematch('white')).toEqual({ ok: false, error: 'game is not finished' });

    const { room } = finishedGame();
    expect(room.offerRematch('spectator').ok).toBe(false);
    room.offerRematch('white');
    expect(room.respondRematch('white', true)).toEqual({ ok: false, error: 'no pending rematch offer for you' });
  });

  it('rematch: reuses a custom starting position', () => {
    const startFen = '4k3/8/8/8/8/8/8/R3K3 w Q - 0 1';
    const { room } = finishedGame(startFen);
    room.offerRematch('white');
    room.respondRematch('black', true);
    expect(room.getSnapshot().startFen).toBe(startFen);
  });

  it('tells each viewer which seat the snapshot is for', () => {
    const room = new Room('r1', 0, 'white');
    expect(room.getSnapshot('black').seat).toBe('black');
    expect(room.getSnapshot().seat).toBe('spectator');
  });
```

Append to `server/test/wsHandlers.test.ts` (inside the `describe`):

```ts
  it('routes rematch offers and answers', () => {
    const ws = fakeWs();
    const room = {
      seatColorFor: () => 'black',
      offerRematch: vi.fn().mockReturnValue({ ok: true }),
      respondRematch: vi.fn().mockReturnValue({ ok: true }),
    } as any;
    handleMessage(room, ws, JSON.stringify({ type: 'offerRematch' }));
    handleMessage(room, ws, JSON.stringify({ type: 'respondRematch', accept: true }));
    expect(room.offerRematch).toHaveBeenCalledWith('black');
    expect(room.respondRematch).toHaveBeenCalledWith('black', true);
  });
```

Add to `server/test/integration.test.ts` (inside the `describe`):

```ts
  it('plays a rematch in the same room with colours swapped and stores both games', async () => {
    server = createApp({ dbPath: ':memory:' });
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;
    const base = `http://localhost:${port}`;
    const { roomId } = await (
      await fetch(`${base}/api/games`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeControlMs: 0, colorPref: 'white' }),
      })
    ).json();

    const a = new WebSocket(`ws://localhost:${port}/ws/${roomId}`);
    expect((await waitForMessage(a, (m) => m.type === 'joined')).seat).toBe('white');
    const b = new WebSocket(`ws://localhost:${port}/ws/${roomId}`);
    await waitForMessage(b, (m) => m.type === 'joined');

    const over1 = waitForMessage(b, (m) => m.type === 'state' && m.status === 'finished');
    a.send(JSON.stringify({ type: 'resign' }));
    await over1;

    const offered = waitForMessage(b, (m) => m.type === 'state' && m.rematchOfferBy === 'white');
    a.send(JSON.stringify({ type: 'offerRematch' }));
    await offered;
    const restartA = waitForMessage(a, (m) => m.type === 'state' && m.status === 'playing');
    const restartB = waitForMessage(b, (m) => m.type === 'state' && m.status === 'playing');
    b.send(JSON.stringify({ type: 'respondRematch', accept: true }));
    const [stateA, stateB] = await Promise.all([restartA, restartB]);
    expect(stateA.seat).toBe('black');
    expect(stateB.seat).toBe('white');
    expect(stateA.historySan).toEqual([]);

    const over2 = waitForMessage(a, (m) => m.type === 'state' && m.status === 'finished');
    b.send(JSON.stringify({ type: 'resign' }));
    await over2;

    const games = await (await fetch(`${base}/api/games`)).json();
    expect(games).toHaveLength(2);
    expect(games[0].id).not.toBe(games[1].id);
    for (const game of games) expect(game.id).not.toBe(roomId);

    a.close();
    b.close();
  });
```

- [ ] **Step 2: Run to verify failure** — `cd server && npx vitest run` → FAIL (no `offerRematch` etc.).

- [ ] **Step 3: Implement in `server/src/room.ts`**

1. Import `import { generateChess960Fen } from './chess960.js';`.
2. `StateSnapshot` gains (after `undoOfferBy`):

```ts
  rematchOfferBy: Color | null;
  // Which seat this snapshot was built for — it changes on a rematch.
  seat: Seat;
```

3. Fields: add `rematchOfferBy: Color | null = null;` under `undoOfferBy`; change `gameId: string;` to `gameId!: string;`, `private chess: Position;` to `private chess!: Position;`, `private readonly initialFen: string;` to `private initialFen!: string;`, `private clocks: { white: number; black: number };` to `private clocks!: { white: number; black: number };`; add `private readonly baseStartFen: string | undefined;`.
4. Constructor body becomes:

```ts
    this.id = id;
    this.timeControlMs = timeControlMs;
    this.incrementMs = incrementMs;
    this.colorPref = colorPref;
    this.now = now;
    this.rules = rules;
    this.chess960 = chess960;
    this.fog = fog;
    this.baseStartFen = startFen;
    this.startNewGame(startFen);
```

5. Add:

```ts
  // Everything that belongs to one game rather than to the room and its
  // seats — set up for the first game and again for every rematch.
  private startNewGame(startFen: string | undefined): void {
    this.gameId = generateGameId();
    this.chess = createGame(this.rules, startFen);
    this.initialFen = makeFen(this.chess.toSetup());
    this.moveHistorySan = [];
    this.moves = [];
    this.repetitionCounts = new Map();
    // The game's starting position is itself the first occurrence for
    // threefold-repetition purposes (per the FIDE rule), so it must be
    // recorded once here — otherwise a position that returns to the exact
    // start only twice via played moves would never reach a recorded count
    // of 3.
    this.recordAndCountRepetition();
    this.clocks = { white: this.timeControlMs, black: this.timeControlMs };
    this.drawOfferBy = null;
    this.undoOfferBy = null;
    this.rematchOfferBy = null;
    this.result = null;
    this.resultReason = null;
    this.finishedAt = null;
    this.persisted = false;
    const bothSeated = this.seats.white !== null && this.seats.black !== null;
    this.status = bothSeated ? 'playing' : 'waiting';
    this.lastMoveAt = bothSeated ? this.now() : null;
  }

  offerRematch(seat: Seat): ActionResult {
    if (this.status !== 'finished') return { ok: false, error: 'game is not finished' };
    if (seat === 'spectator') return { ok: false, error: 'spectators cannot offer rematch' };
    // Both players asking for a rematch is the same as one accepting.
    if (this.rematchOfferBy && this.rematchOfferBy !== seat) {
      this.startRematch();
      return { ok: true };
    }
    this.rematchOfferBy = seat;
    return { ok: true };
  }

  respondRematch(seat: Seat, accept: boolean): ActionResult {
    if (this.status !== 'finished') return { ok: false, error: 'game is not finished' };
    if (seat === 'spectator') return { ok: false, error: 'spectators cannot respond' };
    if (!this.rematchOfferBy || this.rematchOfferBy === seat) {
      return { ok: false, error: 'no pending rematch offer for you' };
    }
    if (accept) this.startRematch();
    else this.rematchOfferBy = null;
    return { ok: true };
  }

  // Same room and settings, colours swapped. Each player keeps their token,
  // which from now on resolves to the other colour when they reconnect.
  private startRematch(): void {
    this.seats = { white: this.seats.black, black: this.seats.white };
    for (const [ws, seat] of this.connections) {
      if (seat === 'white') this.connections.set(ws, 'black');
      else if (seat === 'black') this.connections.set(ws, 'white');
    }
    this.startNewGame(this.chess960 ? generateChess960Fen() : this.baseStartFen);
  }
```

6. In `getSnapshot`, add to the object literal after `undoOfferBy: this.undoOfferBy,`:

```ts
      rematchOfferBy: this.rematchOfferBy,
      seat: viewer,
```

`server/src/wsHandlers.ts`, new cases before `default`:

```ts
    case 'offerRematch':
      result = room.offerRematch(seat);
      break;
    case 'respondRematch':
      result = room.respondRematch(seat, !!msg.accept);
      break;
```

- [ ] **Step 4: Verify** — `cd server && npx tsc --noEmit -p tsconfig.json && npx vitest run` → all pass.

- [ ] **Step 5: Commit** — `git add server && git commit -m "feat(server): rematch in the same room with colours swapped"`

---

### Task 3: Client — top bar and favicon

**Files:**
- Create: `client/public/favicon.svg`
- Modify: `client/public/index.html`, `client/public/game.html`, `client/public/games.html`, `client/public/style.css`, `client/src/pageI18n.ts`
- Test: `client/test/htmlPages.test.ts`

**Interfaces:**
- Produces: every page has `<header class="topbar">` with `a.brand[href="/"]` and `button.lang-toggle`; `initPageI18n()` uses that button.

- [ ] **Step 1: Write the failing test** — add to `client/test/htmlPages.test.ts` (inside the `describe`):

```ts
  it.each(PAGES)('%s has a top bar linking home, a language switch and a favicon', (page) => {
    const html = readFileSync(new URL(`../public/${page}`, import.meta.url), 'utf8');
    expect(html).toContain('<a class="brand" href="/">');
    expect(html).toContain('<button type="button" class="lang-toggle"></button>');
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
  });
```

- [ ] **Step 2: Run to verify failure** — `cd client && npx vitest run test/htmlPages.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`client/public/favicon.svg` (cburnett white knight, same art as the board):

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="45" height="45" viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" fill="#fff"/><path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3" fill="#fff"/><path d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0zm5.433-9.75a.5 1.5 30 1 1-.866-.5.5 1.5 30 1 1 .866.5z" fill="#000"/></g></svg>
```

In each of the three HTML files, add after the viewport meta:

```html
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
```

and as the first child of `<body>`:

```html
  <header class="topbar">
    <a class="brand" href="/"><span class="brand-icon" aria-hidden="true"></span><span>luchess</span></a>
    <button type="button" class="lang-toggle"></button>
  </header>
```

`index.html`: delete `<h1>luchess</h1>` from `.home-header` (the top bar carries the name now).

`client/src/pageI18n.ts` — `initPageI18n` uses the page's own toggle:

```ts
export function initPageI18n(onChange?: () => void): void {
  const toggle = document.querySelector<HTMLButtonElement>('.lang-toggle')!;
  toggle.addEventListener('click', () => setLang(getLang() === 'zh' ? 'en' : 'zh'));

  const render = () => {
    applyStaticI18n();
    toggle.textContent = t('lang.switch');
  };
  render();
  document.addEventListener('langchange', () => {
    render();
    onChange?.();
  });
}
```

(and update the file's header comment: it no longer mounts the toggle, it fills it.)

`client/public/style.css`:
- Replace the `/* Language switch, fixed … */ .lang-toggle { … }` block with:

```css
/* Shared top bar: brand (home link) on the left, language switch on the right. */
.topbar {
  max-width: 900px;
  margin: 0 auto 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text);
  font-size: 1.15rem;
  font-weight: 700;
  text-decoration: none;
}

.brand:hover {
  color: var(--accent);
}

.brand-icon {
  width: 1.75rem;
  height: 1.75rem;
  background: url('/favicon.svg') center / contain no-repeat;
}

.lang-toggle {
  padding: 0.3rem 0.75rem;
  font-size: 0.85rem;
}
```

- Delete the `/* On phones the page content starts … */ @media (max-width: 699px) { body { padding-top: 3.25rem; } }` block.
- In `.cg-wrap`, change `calc(100vh - 17rem)` to `calc(100vh - 20rem)` and extend its comment: the top bar takes ~3rem more.

- [ ] **Step 4: Verify** — `cd client && npx tsc --noEmit && npx vitest run && npm run build` → pass.

- [ ] **Step 5: Commit** — `git add client && git commit -m "feat(client): shared top bar with home link and favicon"`

---

### Task 4: Client — join a room by number

**Files:**
- Create: `client/src/roomCode.ts`, `client/test/roomCode.test.ts`
- Modify: `client/src/i18n.ts`, `client/src/pageI18n.ts`, `client/src/main.ts`, `client/public/index.html`, `client/public/style.css`

**Interfaces:**
- Consumes: `GET /api/rooms/:code` (Task 1).
- Produces: `normalizeRoomCode(input: string): string | null`; i18n keys `home.joinLabel`, `home.joinPlaceholder`, `home.join`, `home.joinInvalid`, `home.joinNotFound`; `[data-i18n-placeholder]` support.

- [ ] **Step 1: Write the failing test** — `client/test/roomCode.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { normalizeRoomCode } from '../src/roomCode.js';

describe('normalizeRoomCode', () => {
  it('accepts six digits, with or without spaces', () => {
    expect(normalizeRoomCode('482913')).toBe('482913');
    expect(normalizeRoomCode(' 482 913 ')).toBe('482913');
  });

  it('pulls the code out of a pasted invite link', () => {
    expect(normalizeRoomCode('https://luchess.cc.cd/game/482913')).toBe('482913');
  });

  it('rejects anything that is not exactly six digits', () => {
    expect(normalizeRoomCode('')).toBeNull();
    expect(normalizeRoomCode('48291')).toBeNull();
    expect(normalizeRoomCode('4829134')).toBeNull();
    expect(normalizeRoomCode('abcdef')).toBeNull();
    expect(normalizeRoomCode('https://luchess.cc.cd/game/4829134')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `cd client && npx vitest run test/roomCode.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

`client/src/roomCode.ts`:

```ts
// client/src/roomCode.ts
// Accepts what people actually type or paste into "join a room": the six
// digits (spaces allowed) or a whole invite link.
export function normalizeRoomCode(input: string): string | null {
  const fromLink = input.match(/\/game\/(\d+)/);
  if (fromLink) return /^\d{6}$/.test(fromLink[1]) ? fromLink[1] : null;
  const digits = input.replace(/\s+/g, '');
  return /^\d{6}$/.test(digits) ? digits : null;
}
```

`client/src/i18n.ts` — new keys (en / zh):

| key | en | zh |
|---|---|---|
| `home.joinLabel` | `Join a room` | `加入房间` |
| `home.joinPlaceholder` | `6-digit room number` | `6 位房间号` |
| `home.join` | `Join` | `加入` |
| `home.joinInvalid` | `Enter a 6-digit room number` | `请输入 6 位房间号` |
| `home.joinNotFound` | `Room not found or expired` | `房间不存在或已过期` |

`client/src/pageI18n.ts` — in `applyStaticI18n`, after the `[data-i18n]` loop:

```ts
  document.querySelectorAll<HTMLElement>('[data-i18n-placeholder]').forEach((el) => {
    const key = el.dataset.i18nPlaceholder!;
    if (hasKey(key)) el.setAttribute('placeholder', t(key));
  });
```

`client/public/index.html` — between the create button and the history link:

```html
        <div class="join-room">
          <label for="join-code" data-i18n="home.joinLabel">Join a room</label>
          <div class="join-row">
            <input id="join-code" type="text" inputmode="numeric" autocomplete="off" data-i18n-placeholder="home.joinPlaceholder" placeholder="6-digit room number" />
            <button id="join-btn" type="button" data-i18n="home.join">Join</button>
          </div>
          <p id="join-error" class="error-msg" hidden></p>
        </div>
```

`client/src/main.ts` — imports `import { t } from './i18n.js';` and `import { normalizeRoomCode } from './roomCode.js';`; replace the trailing `initPageI18n();` with:

```ts
const joinInput = document.getElementById('join-code') as HTMLInputElement;
const joinBtn = document.getElementById('join-btn') as HTMLButtonElement;
const joinError = document.getElementById('join-error')!;

function showJoinError(message: string): void {
  joinError.textContent = message;
  joinError.hidden = false;
}

async function joinRoom(): Promise<void> {
  joinError.hidden = true;
  const code = normalizeRoomCode(joinInput.value);
  if (!code) {
    showJoinError(t('home.joinInvalid'));
    return;
  }
  const res = await fetch(`/api/rooms/${code}`);
  if (!res.ok) {
    showJoinError(t('home.joinNotFound'));
    return;
  }
  location.href = `/game/${code}`;
}

joinBtn.addEventListener('click', () => void joinRoom());
joinInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') void joinRoom();
});

// A shown error would stay in the old language — just clear it.
initPageI18n(() => {
  joinError.hidden = true;
});
```

`client/public/style.css` — append:

```css
/* Home: join an existing room by its number. */
.join-room {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding-top: 0.85rem;
  border-top: 1px solid var(--border);
  font-size: 0.9rem;
  color: var(--text-muted);
}

.join-row {
  display: flex;
  gap: 0.5rem;
}

.join-row input {
  flex: 1;
  min-width: 0;
}
```

- [ ] **Step 4: Verify** — `cd client && npx tsc --noEmit && npx vitest run && npm run build` → pass.

- [ ] **Step 5: Commit** — `git add client && git commit -m "feat(client): join a room by its six-digit number"`

---

### Task 5: Client — room number on the game page, dead-room handling, rematch UI

**Files:**
- Modify: `client/src/wsClient.ts`, `client/src/game.ts`, `client/src/i18n.ts`, `client/public/game.html`, `client/public/style.css`
- Test: `client/test/wsClient.test.ts`, `client/test/i18n.test.ts`

**Interfaces:**
- Consumes: snapshot `seat`, `rematchOfferBy`; ws messages `offerRematch` / `respondRematch` (Task 2).
- Produces: `WsClientOptions.onFatal?(reason: string): void`.

- [ ] **Step 1: Write the failing tests**

Append to `client/test/wsClient.test.ts` (inside `describe('WsClient', …)`):

```ts
  it('stops reconnecting and reports it when the server rejects the room', () => {
    const onFatal = vi.fn();
    new WsClient({ roomId: 'abc123', onMessage: () => {}, onFatal });
    FakeWebSocket.instances[0].emit('close', { code: 1008, reason: 'room not found' });
    vi.advanceTimersByTime(5000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(onFatal).toHaveBeenCalledWith('room not found');
  });
```

Append to the errors test in `client/test/i18n.test.ts`:

```ts
    expect(errorText('game is not finished')).toBe('对局还没有结束');
    expect(errorText('no pending rematch offer for you')).toBe('没有待回应的再来一局邀请');
```

- [ ] **Step 2: Run to verify failure** — `cd client && npx vitest run test/wsClient.test.ts test/i18n.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`client/src/wsClient.ts`: add to `WsClientOptions`

```ts
  // Called instead of reconnecting when the server refuses the room for good
  // (it closes with 1008 for an unknown room or a malformed path).
  onFatal?(reason: string): void;
```

store it like `onOpen`, and replace the close listener:

```ts
    ws.addEventListener('close', (event: any) => {
      if (event?.code === 1008) {
        this.onFatal?.(event.reason ?? '');
        return;
      }
      if (!this.closedByUser) setTimeout(() => this.connect(), 1000);
    });
```

`client/src/i18n.ts` — change `game.waiting` and add keys:

| key | en | zh |
|---|---|---|
| `game.waiting` | `Waiting for opponent — share the room number or this link:` | `等待对手加入…把房间号或链接发给朋友：` |
| `game.room` | `Room` | `房间` |
| `game.roomNumber` | `Room number` | `房间号` |
| `game.rematch` | `Rematch` | `再来一局` |
| `game.rematchSent` | `Rematch offered` | `已邀请再来一局` |
| `game.opponentOffersRematch` | `Opponent wants a rematch` | `对手想再来一局` |
| `game.roomNotFound` | `This room does not exist or has expired.` | `房间不存在或已过期。` |
| `game.backHome` | `Back to home` | `回到首页` |
| `error.notFinished` | `The game is not over yet` | `对局还没有结束` |
| `error.noRematchOffer` | `There is no rematch offer to answer` | `没有待回应的再来一局邀请` |

and in `ERROR_KEYS`:

```ts
  'game is not finished': 'error.notFinished',
  'no pending rematch offer for you': 'error.noRematchOffer',
```

`client/public/game.html` — invite panel shows the number; controls get a rematch button:

```html
        <div id="invite-panel" class="invite-panel" hidden>
          <p data-i18n="game.waiting">Waiting for opponent — share the room number or this link:</p>
          <p class="room-code-line"><span data-i18n="game.roomNumber">Room number</span> <strong id="room-code" class="room-code"></strong></p>
          <div class="invite-row">
            <input id="invite-link" type="text" readonly />
            <button id="copy-invite-btn" data-i18n="game.copyInvite">Copy invite link</button>
          </div>
        </div>
```

```html
          <button id="undo-btn" data-i18n="game.undo">Undo</button>
          <button id="rematch-btn" hidden>Rematch</button>
```

`client/src/game.ts`:
1. Element + init:

```ts
const rematchBtn = document.getElementById('rematch-btn') as HTMLButtonElement;
document.getElementById('room-code')!.textContent = roomId;
```

2. `WsClient` options: in `onMessage`, state branch becomes

```ts
    } else if (msg.type === 'state') {
      // The server says which seat each snapshot is for; it flips on a rematch.
      if (msg.seat) mySeat = msg.seat;
      applyState(msg);
```

and add

```ts
  onFatal: () => {
    invitePanel.hidden = true;
    offerBanner.hidden = false;
    offerBanner.innerHTML = `${t('game.roomNotFound')} <a href="/">${t('game.backHome')}</a>`;
  },
```

3. Variant label: `variantLabelEl.textContent = \`${variantLabel(variantId(state))} · ${t('game.room')} ${roomId}\`;`
4. Replace the finished-state block at the end of `applyState` with `if (state.status === 'finished') renderGameOver(state);` and add:

```ts
function renderGameOver(state: any): void {
  offerBanner.hidden = false;
  offerBanner.textContent = `${t('game.gameOver')}: ${resultText(state.result, state.resultReason)}`;
  if (!isPlayer() || !state.rematchOfferBy || state.rematchOfferBy === mySeat) return;
  const line = document.createElement('div');
  line.className = 'rematch-offer';
  line.innerHTML = `${t('game.opponentOffersRematch')} <button id="accept-rematch">${t('game.accept')}</button> <button id="reject-rematch">${t('game.reject')}</button>`;
  offerBanner.appendChild(line);
  document.getElementById('accept-rematch')!.addEventListener('click', () =>
    ws.send({ type: 'respondRematch', accept: true })
  );
  document.getElementById('reject-rematch')!.addEventListener('click', () =>
    ws.send({ type: 'respondRematch', accept: false })
  );
}
```

5. In `renderControls`, after the existing lines:

```ts
  rematchBtn.hidden = !(isPlayer && state.status === 'finished');
  const rematchOffered = state.rematchOfferBy === mySeat;
  rematchBtn.disabled = rematchOffered;
  rematchBtn.textContent = rematchOffered ? t('game.rematchSent') : t('game.rematch');
```

6. Listener next to the other control listeners:

```ts
rematchBtn.addEventListener('click', () => ws.send({ type: 'offerRematch' }));
```

`client/public/style.css` — add `#rematch-btn` and `#accept-rematch` to the accent-button selector lists (`#create-btn, #copy-invite-btn, #accept-draw, #accept-undo` and its `:hover` twin), and append:

```css
.room-code-line {
  margin: 0.5rem 0;
}

.room-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 1.6rem;
  letter-spacing: 0.15em;
  color: var(--text);
}

.rematch-offer {
  margin-top: 0.5rem;
}
```

- [ ] **Step 4: Verify** — `cd client && npx tsc --noEmit && npx vitest run && npm run build` → pass.

- [ ] **Step 5: Commit** — `git add client && git commit -m "feat(client): room number on the game page, rematch, stop retrying dead rooms"`

---

### Task 6: End-to-end check

- [ ] Start the local preview (temporary `luchess` entry in the session-root `.claude/launch.json`, as last time).
- [ ] Tab A creates a timed game; the invite panel shows a 6-digit number; the label reads `… · 房间 NNNNNN`.
- [ ] Tab B joins from the home page by typing that number; a wrong number (`123456` when no such room) shows `房间不存在或已过期`; `12345` shows `请输入 6 位房间号`.
- [ ] Play a couple of moves, resign, click 再来一局 in A, accept in B: both boards flip, clocks reset, move list empty.
- [ ] Open `/game/000000`: banner with 回到首页, no reconnect loop (one ws request in the network log).
- [ ] Top bar on all three pages; brand link returns home; mobile (375px) layout has no overlap; no console errors.

### Task 7: Deploy

- [ ] Push `main`; on the server pull, `npm install` + `npm run build` in `server/` and `client/`, `systemctl restart luchess`.
- [ ] Verify live: home 200 with top bar; `POST /api/games` returns a 6-digit `roomId`; `GET /api/rooms/<it>` 200; `GET /api/rooms/000000` 404; lugame still 200.
