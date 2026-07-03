# luchess Simple Variants (Chess960 + 3check + King of the Hill) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let two players create and play Chess960, Three-check, and King of the Hill games (in addition to standard chess), with a minimal variant picker on the home page, a captured-material display on the game page (new — didn't exist before), and correct history replay for non-standard starting positions.

**Architecture:** Chessops already implements `'3check'`/`'kingofthehill'` as first-class `Rules` and can host Chess960 within plain `'chess'` rules via a randomized starting FEN — so `Room` needs no new rules logic, only a `rules`/`chess960` parameter threaded from room creation through to the chess position, plus exposing chessops' own `remainingChecks` for 3check. The captured-material display is a pure client-side computation derived from the broadcast FEN (comparing against the standard 16-piece starting material), requiring no new protocol fields.

**Tech Stack:** Same as the rest of the project — chessops (already integrated), `better-sqlite3` (schema migration), plain TypeScript client.

## Global Constraints

- No new npm dependencies.
- Chessops handles ALL rules/legality/win-condition logic for `'3check'`/`'kingofthehill'`; `Room`/`chessRules.ts` must not add any custom check-counting, king-position, or win-condition logic beyond exposing what chessops already computes (`pos.remainingChecks`, `pos.outcome()`).
- `server/data/games.sqlite` already has real production data (the site is live). The `variant`/`start_fen` schema migration in `db.ts` must be safe to run against an existing populated database — check column existence before `ALTER TABLE`, never assume an empty table.
- `Room`'s constructor signature must stay backward-compatible with every existing call in `server/test/room.test.ts` (which passes 3 or 5 positional arguments, the 5th being `startFen`) — new parameters must be appended after `startFen`, not inserted before it.
- Chess960 is modeled as `rules: 'chess'` with a randomized starting FEN — it is NOT a separate chessops `Rules` value. It cannot be combined with 3check/King of the Hill in this plan (4 mutually exclusive options: standard, Chess960, 3check, King of the Hill).
- This plan does not touch Atomic/Antichess/RacingKings/Horde/Crazyhouse (later sub-projects) or the full lichess-style layout (also a later sub-project) — the home-page variant picker added here is explicitly a temporary, minimal `<select>`, expected to be replaced later.

---

### Task 1: Chess960 starting-position generator

**Files:**
- Create: `server/src/chess960.ts`
- Test: `server/test/chess960.test.ts`

**Interfaces:**
- Produces: `generateChess960Fen(): string` — a valid starting FEN for a randomized Chess960 back rank (both colors share the same shuffle, as required by the rules), standard pawn rows, castling rights `KQkq`, side to move `w`. Used by `server/src/app.ts` (Task 4).

- [ ] **Step 1: Write the failing tests**

```typescript
// server/test/chess960.test.ts
import { describe, it, expect } from 'vitest';
import { generateChess960Fen } from '../src/chess960.js';
import { parseFen } from 'chessops/fen';
import { setupPosition } from 'chessops/variant';

function backRank(fen: string): string {
  return fen.split(' ')[0].split('/')[7];
}

describe('generateChess960Fen', () => {
  it('produces a FEN chessops accepts as a legal starting position', () => {
    const fen = generateChess960Fen();
    const setup = parseFen(fen).unwrap();
    const result = setupPosition('chess', setup);
    expect(result.isOk).toBe(true);
  });

  it('places the king between the two rooks', () => {
    const fen = generateChess960Fen();
    const rank = backRank(fen);
    const rookFiles = [...rank].reduce<number[]>((acc, ch, i) => (ch === 'R' ? [...acc, i] : acc), []);
    const kingFile = [...rank].indexOf('K');
    expect(rookFiles).toHaveLength(2);
    expect(kingFile).toBeGreaterThan(rookFiles[0]);
    expect(kingFile).toBeLessThan(rookFiles[1]);
  });

  it('places the two bishops on opposite-colored squares', () => {
    const fen = generateChess960Fen();
    const rank = backRank(fen);
    const bishopFiles = [...rank].reduce<number[]>((acc, ch, i) => (ch === 'B' ? [...acc, i] : acc), []);
    expect(bishopFiles).toHaveLength(2);
    expect(bishopFiles[0] % 2).not.toBe(bishopFiles[1] % 2);
  });

  it('mirrors the same back rank for both colors and keeps standard pawn rows', () => {
    const fen = generateChess960Fen();
    const [rank8, rank7, , , , , rank2, rank1] = fen.split(' ')[0].split('/');
    expect(rank8).toBe(rank1.toLowerCase());
    expect(rank7).toBe('pppppppp');
    expect(rank2).toBe('PPPPPPPP');
  });

  it('produces varied results across many calls', () => {
    const ranks = new Set(Array.from({ length: 50 }, () => backRank(generateChess960Fen())));
    expect(ranks.size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --prefix server -- chess960`
Expected: FAIL — `Cannot find module '../src/chess960.js'`

- [ ] **Step 3: Write the implementation**

```typescript
// server/src/chess960.ts
type BackRankRole = 'king' | 'queen' | 'rook' | 'bishop' | 'knight';

const ROLE_LETTER: Record<BackRankRole, string> = {
  king: 'K',
  queen: 'Q',
  rook: 'R',
  bishop: 'B',
  knight: 'N',
};

function randomIndex(length: number): number {
  return Math.floor(Math.random() * length);
}

function pickAndRemove(pool: number[]): number {
  const index = randomIndex(pool.length);
  const [value] = pool.splice(index, 1);
  return value;
}

function generateBackRank(): BackRankRole[] {
  const files: (BackRankRole | null)[] = new Array(8).fill(null);

  const darkFiles = [0, 2, 4, 6];
  const lightFiles = [1, 3, 5, 7];
  files[pickAndRemove(darkFiles)] = 'bishop';
  files[pickAndRemove(lightFiles)] = 'bishop';

  const emptyFiles = () => files.reduce<number[]>((acc, f, i) => (f === null ? [...acc, i] : acc), []);

  files[pickAndRemove(emptyFiles())] = 'queen';
  files[pickAndRemove(emptyFiles())] = 'knight';
  files[pickAndRemove(emptyFiles())] = 'knight';

  const remaining = emptyFiles().sort((a, b) => a - b);
  files[remaining[0]] = 'rook';
  files[remaining[1]] = 'king';
  files[remaining[2]] = 'rook';

  return files as BackRankRole[];
}

export function generateChess960Fen(): string {
  const backRank = generateBackRank();
  const whiteRank = backRank.map((role) => ROLE_LETTER[role]).join('');
  const blackRank = whiteRank.toLowerCase();
  return `${blackRank}/pppppppp/8/8/8/8/PPPPPPPP/${whiteRank} w KQkq - 0 1`;
}
```

Note: the standard `KQkq` castling notation is used even though the rooks aren't necessarily on a1/h1 — chessops' FEN castling-rights parser resolves `K`/`Q`/`k`/`q` against the actual board (finding the outermost rook on each side of the king), which is exactly what the first test in this task verifies (`setupPosition('chess', setup)` must succeed, not just `parseFen` succeeding). If that test fails against the real installed chessops version, switch to Shredder-style file-letter castling notation (e.g. the specific files the rooks landed on, uppercase for white lowercase for black) instead of `KQkq` — check `server/node_modules/chessops/dist/fen.d.ts`'s `parseCastlingFen`/`makeCastlingFen` for the exact supported formats before making that change.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --prefix server -- chess960`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/chess960.ts server/test/chess960.test.ts
git commit -m "feat(server): add Chess960 starting position generator"
```

---

### Task 2: `Room` support for selectable rules, chess960 flag, and 3check counter

**Files:**
- Modify: `server/src/room.ts` (full rewrite)
- Modify: `server/test/room.test.ts` (18 existing tests unchanged + new tests appended)

**Interfaces:**
- Consumes: `type Rules` from `chessops/types`; `createGame` from `chessRules.ts` (already accepts `rules`/`fen`, unchanged from the engine-swap plan).
- Produces: `Room`'s constructor gains two new trailing parameters — `constructor(id, timeControlMs, colorPref, now = Date.now, startFen?: string, rules: Rules = 'chess', chess960: boolean = false)`. `StateSnapshot` gains `variant: Rules` (was hardcoded `'chess'` — now reflects the real rules) and `checksRemaining: { white: number; black: number } | null` (new field). The existing `chess960: false` hardcoded field becomes the real, constructor-provided value.

- [ ] **Step 1: Write the failing tests (append to the existing `describe('Room', ...)` block; do not remove or alter the 18 existing tests)**

```typescript
  it('creates a room with alternate rules and reflects them in the snapshot', () => {
    const room = new Room('r1', 0, 'white', Date.now, undefined, 'kingofthehill');
    room.connect(fakeWs());
    room.connect(fakeWs());
    expect(room.getSnapshot().variant).toBe('kingofthehill');
    expect(room.getSnapshot().chess960).toBe(false);
  });

  it('reflects a chess960 flag independently of rules', () => {
    const chess960Fen = 'bqnrkbnr/pppppppp/8/8/8/8/PPPPPPPP/BQNRKBNR w KQkq - 0 1';
    const room = new Room('r1', 0, 'white', Date.now, chess960Fen, 'chess', true);
    room.connect(fakeWs());
    room.connect(fakeWs());
    const snapshot = room.getSnapshot();
    expect(snapshot.variant).toBe('chess');
    expect(snapshot.chess960).toBe(true);
    expect(snapshot.fen.startsWith('bqnrkbnr')).toBe(true);
  });

  it('exposes remaining checks for a 3check game and decrements after a real check', () => {
    const room = new Room('r1', 0, 'white', Date.now, undefined, '3check');
    room.connect(fakeWs());
    room.connect(fakeWs());
    expect(room.getSnapshot().checksRemaining).toEqual({ white: 3, black: 3 });

    expect(room.move('white', { from: 'e2', to: 'e4' }).ok).toBe(true);
    expect(room.move('black', { from: 'e7', to: 'e5' }).ok).toBe(true);
    expect(room.move('white', { from: 'd1', to: 'h5' }).ok).toBe(true);
    expect(room.move('black', { from: 'g7', to: 'g6' }).ok).toBe(true);
    expect(room.move('white', { from: 'h5', to: 'e5' }).ok).toBe(true); // captures the e5 pawn, checks black's king

    const snapshot = room.getSnapshot();
    expect(snapshot.checksRemaining).toEqual({ white: 3, black: 2 });
    expect(room.status).toBe('playing');
  });

  it('returns null checksRemaining for non-3check games', () => {
    const room = new Room('r1', 0, 'white');
    room.connect(fakeWs());
    room.connect(fakeWs());
    expect(room.getSnapshot().checksRemaining).toBeNull();
  });

  it('ends a King of the Hill game the instant a king reaches a center square', () => {
    const room = new Room('r1', 0, 'white', Date.now, undefined, 'kingofthehill');
    room.connect(fakeWs());
    room.connect(fakeWs());

    expect(room.move('white', { from: 'e2', to: 'e4' }).ok).toBe(true);
    expect(room.move('black', { from: 'a7', to: 'a6' }).ok).toBe(true);
    expect(room.move('white', { from: 'e1', to: 'e2' }).ok).toBe(true);
    expect(room.move('black', { from: 'a6', to: 'a5' }).ok).toBe(true);
    expect(room.move('white', { from: 'e2', to: 'd3' }).ok).toBe(true);
    expect(room.move('black', { from: 'a5', to: 'a4' }).ok).toBe(true);
    expect(room.move('white', { from: 'd3', to: 'd4' }).ok).toBe(true);

    expect(room.status).toBe('finished');
    expect(room.result).toBe('1-0');
    expect(room.resultReason).toBe('variant-end');
  });
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm test --prefix server -- room`
Expected: FAIL — `Room`'s constructor doesn't yet accept the 6th/7th arguments, and `getSnapshot()` doesn't yet expose `checksRemaining` or a real (non-hardcoded) `variant`.

- [ ] **Step 3: Write the implementation**

Replace `server/src/room.ts` with:

```typescript
// server/src/room.ts
import type WebSocket from 'ws';
import { applyMove, createGame, toChessopsMove, type ChessopsMove, type MoveInput } from './chessRules.js';
import type { Position } from 'chessops/chess';
import type { Rules } from 'chessops/types';
import { makeFen } from 'chessops/fen';
import { generateToken } from './idGen.js';

export type Color = 'white' | 'black';
export type Seat = Color | 'spectator';
export type RoomStatus = 'waiting' | 'playing' | 'finished';

export interface StateSnapshot {
  roomId: string;
  status: RoomStatus;
  fen: string;
  turn: Color;
  historySan: string[];
  clocks: { white: number; black: number };
  timeControlMs: number;
  drawOfferBy: Color | null;
  undoOfferBy: Color | null;
  result: string | null;
  resultReason: string | null;
  variant: Rules;
  chess960: boolean;
  checksRemaining: { white: number; black: number } | null;
}

interface SeatInfo {
  ws: WebSocket | null;
  token: string;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export class Room {
  readonly id: string;
  readonly timeControlMs: number;
  status: RoomStatus = 'waiting';
  drawOfferBy: Color | null = null;
  undoOfferBy: Color | null = null;
  result: string | null = null;
  resultReason: string | null = null;
  finishedAt: number | null = null;

  private readonly now: () => number;
  private readonly colorPref: Color | 'random';
  private readonly rules: Rules;
  private readonly chess960: boolean;
  private chess: Position;
  private readonly initialFen: string;
  private moveHistorySan: string[] = [];
  private moves: ChessopsMove[] = [];
  private repetitionCounts = new Map<string, number>();
  private clocks: { white: number; black: number };
  private lastMoveAt: number | null = null;
  private seats: { white: SeatInfo | null; black: SeatInfo | null } = { white: null, black: null };
  private connections = new Map<WebSocket, Seat>();
  private persisted = false;

  constructor(
    id: string,
    timeControlMs: number,
    colorPref: Color | 'random',
    now: () => number = Date.now,
    startFen?: string,
    rules: Rules = 'chess',
    chess960: boolean = false
  ) {
    this.id = id;
    this.timeControlMs = timeControlMs;
    this.clocks = { white: timeControlMs, black: timeControlMs };
    this.colorPref = colorPref;
    this.now = now;
    this.rules = rules;
    this.chess960 = chess960;
    this.chess = createGame(rules, startFen);
    this.initialFen = makeFen(this.chess.toSetup());
    this.recordAndCountRepetition();
  }

  connect(ws: WebSocket, token?: string): { seat: Seat; token?: string } {
    for (const color of ['white', 'black'] as Color[]) {
      const seat = this.seats[color];
      if (seat && token && seat.token === token) {
        seat.ws = ws;
        this.connections.set(ws, color);
        return { seat: color };
      }
    }

    const openColor = this.pickOpenSeat();
    if (openColor) {
      const newToken = generateToken();
      this.seats[openColor] = { ws, token: newToken };
      this.connections.set(ws, openColor);
      if (this.seats.white && this.seats.black && this.status === 'waiting') {
        this.status = 'playing';
        this.lastMoveAt = this.now();
      }
      return { seat: openColor, token: newToken };
    }

    this.connections.set(ws, 'spectator');
    return { seat: 'spectator' };
  }

  disconnect(ws: WebSocket): void {
    this.connections.delete(ws);
    for (const color of ['white', 'black'] as Color[]) {
      if (this.seats[color]?.ws === ws) {
        this.seats[color]!.ws = null;
      }
    }
  }

  private pickOpenSeat(): Color | null {
    const whiteOpen = !this.seats.white;
    const blackOpen = !this.seats.black;
    if (!whiteOpen && !blackOpen) return null;
    if (whiteOpen && blackOpen) {
      return this.colorPref === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : this.colorPref;
    }
    return whiteOpen ? 'white' : 'black';
  }

  hasActiveConnections(): boolean {
    return this.connections.size > 0;
  }

  move(seat: Seat, input: MoveInput): ActionResult {
    if (this.status !== 'playing') return { ok: false, error: 'game is not in progress' };
    if (seat === 'spectator') return { ok: false, error: 'spectators cannot move' };
    const turnColor: Color = this.chess.turn === 'white' ? 'white' : 'black';
    if (seat !== turnColor) return { ok: false, error: 'not your turn' };

    const chessMove = toChessopsMove(this.chess, input);
    if (!chessMove) return { ok: false, error: 'illegal move' };

    const result = applyMove(this.chess, input);
    if (!result.ok) return { ok: false, error: result.error };

    this.moveHistorySan.push(result.san!);
    this.moves.push(chessMove);
    const repetitionCount = this.recordAndCountRepetition();

    const now = this.now();
    if (this.timeControlMs > 0 && this.lastMoveAt !== null) {
      this.clocks[turnColor] = Math.max(0, this.clocks[turnColor] - (now - this.lastMoveAt));
    }
    this.lastMoveAt = now;
    this.drawOfferBy = null;
    this.undoOfferBy = null;

    if (result.gameOver) {
      this.finish(result.result!, result.resultReason!);
    } else if (this.chess.halfmoves >= 100) {
      this.finish('1/2-1/2', 'fifty-move');
    } else if (repetitionCount >= 3) {
      this.finish('1/2-1/2', 'threefold-repetition');
    }
    return { ok: true };
  }

  private recordAndCountRepetition(): number {
    const key = makeFen(this.chess.toSetup(), { epd: true });
    const count = (this.repetitionCounts.get(key) ?? 0) + 1;
    this.repetitionCounts.set(key, count);
    return count;
  }

  resign(seat: Seat): ActionResult {
    if (this.status !== 'playing') return { ok: false, error: 'game is not in progress' };
    if (seat === 'spectator') return { ok: false, error: 'spectators cannot resign' };
    this.finish(seat === 'white' ? '0-1' : '1-0', 'resignation');
    return { ok: true };
  }

  offerDraw(seat: Seat): ActionResult {
    if (this.status !== 'playing') return { ok: false, error: 'game is not in progress' };
    if (seat === 'spectator') return { ok: false, error: 'spectators cannot offer draw' };
    this.drawOfferBy = seat;
    return { ok: true };
  }

  respondDraw(seat: Seat, accept: boolean): ActionResult {
    if (this.status !== 'playing') return { ok: false, error: 'game is not in progress' };
    if (seat === 'spectator') return { ok: false, error: 'spectators cannot respond' };
    if (!this.drawOfferBy || this.drawOfferBy === seat) {
      return { ok: false, error: 'no pending draw offer for you' };
    }
    if (accept) this.finish('1/2-1/2', 'draw-agreement');
    this.drawOfferBy = null;
    return { ok: true };
  }

  offerUndo(seat: Seat): ActionResult {
    if (this.status !== 'playing') return { ok: false, error: 'game is not in progress' };
    if (seat === 'spectator') return { ok: false, error: 'spectators cannot offer undo' };
    if (this.moves.length === 0) return { ok: false, error: 'no move to undo' };
    this.undoOfferBy = seat;
    return { ok: true };
  }

  respondUndo(seat: Seat, accept: boolean): ActionResult {
    if (this.status !== 'playing') return { ok: false, error: 'game is not in progress' };
    if (seat === 'spectator') return { ok: false, error: 'spectators cannot respond' };
    if (!this.undoOfferBy || this.undoOfferBy === seat) {
      return { ok: false, error: 'no pending undo offer for you' };
    }
    if (accept) {
      this.moveHistorySan.pop();
      this.moves.pop();
      this.rebuildPosition();
      this.lastMoveAt = this.now();
    }
    this.undoOfferBy = null;
    return { ok: true };
  }

  private rebuildPosition(): void {
    this.chess = createGame(this.rules, this.initialFen);
    this.repetitionCounts.clear();
    this.recordAndCountRepetition();
    for (const m of this.moves) {
      this.chess.play(m);
      this.recordAndCountRepetition();
    }
  }

  checkTimeout(): boolean {
    if (this.status !== 'playing' || this.timeControlMs === 0 || this.lastMoveAt === null) return false;
    const turnColor: Color = this.chess.turn === 'white' ? 'white' : 'black';
    const elapsed = this.now() - this.lastMoveAt;
    const remaining = this.clocks[turnColor] - elapsed;
    if (remaining <= 0) {
      this.clocks[turnColor] = 0;
      this.finish(turnColor === 'white' ? '0-1' : '1-0', 'timeout');
      return true;
    }
    return false;
  }

  getSnapshot(): StateSnapshot {
    const turnColor: Color = this.chess.turn === 'white' ? 'white' : 'black';
    let clocks = { ...this.clocks };
    if (this.status === 'playing' && this.timeControlMs > 0 && this.lastMoveAt !== null) {
      const elapsed = this.now() - this.lastMoveAt;
      clocks = { ...clocks, [turnColor]: Math.max(0, clocks[turnColor] - elapsed) };
    }
    const remainingChecks = this.chess.remainingChecks;
    return {
      roomId: this.id,
      status: this.status,
      fen: makeFen(this.chess.toSetup()),
      turn: turnColor,
      historySan: this.moveHistorySan,
      clocks,
      timeControlMs: this.timeControlMs,
      drawOfferBy: this.drawOfferBy,
      undoOfferBy: this.undoOfferBy,
      result: this.result,
      resultReason: this.resultReason,
      variant: this.rules,
      chess960: this.chess960,
      checksRemaining: remainingChecks ? { white: remainingChecks.white, black: remainingChecks.black } : null,
    };
  }

  getPgn(): string {
    const parts: string[] = [];
    this.moveHistorySan.forEach((san, i) => {
      if (i % 2 === 0) parts.push(`${i / 2 + 1}.`);
      parts.push(san);
    });
    return parts.join(' ');
  }

  getInitialFen(): string {
    return this.initialFen;
  }

  seatColorFor(ws: WebSocket): Seat | undefined {
    return this.connections.get(ws);
  }

  allConnections(): WebSocket[] {
    return Array.from(this.connections.keys());
  }

  isPersisted(): boolean {
    return this.persisted;
  }

  markPersisted(): void {
    this.persisted = true;
  }

  private finish(result: string, resultReason: string): void {
    this.status = 'finished';
    this.result = result;
    this.resultReason = resultReason;
    this.finishedAt = this.now();
  }
}
```

Note the one new public method, `getInitialFen(): string` — Task 4 (`app.ts`) needs this to persist the game's starting FEN to the database for correct history replay (Chess960 games don't start from the standard position).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --prefix server -- room`
Expected: PASS (23 tests — the 18 from before this plan, plus these 5 new ones)

- [ ] **Step 5: Run the full server suite**

Run: `npm test --prefix server`
Expected: all passing, including `server/test/integration.test.ts` unmodified (it plays standard chess, unaffected by these changes).

- [ ] **Step 6: Commit**

```bash
git add server/src/room.ts server/test/room.test.ts
git commit -m "feat(server): support selectable rules, chess960 flag, and 3check counter in Room"
```

---

### Task 3: Database migration for `variant`/`start_fen`

**Files:**
- Modify: `server/src/db.ts` (full rewrite)
- Modify: `server/test/db.test.ts` (existing tests unchanged + new migration tests appended)

**Interfaces:**
- Produces: `GameRecord` gains `variant: string` and `startFen: string` fields. `openDb(path)` now also runs a safe schema migration (adds the two new columns to an existing `games` table if they're missing, defaulting existing rows to `'chess'` / the standard starting FEN). `saveGame`/`listGames`/`getGame` read/write the two new columns.

- [ ] **Step 1: Write the failing tests**

Replace `server/test/db.test.ts` with:

```typescript
// server/test/db.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import RawDatabase from 'better-sqlite3';
import { openDb, saveGame, listGames, getGame, STANDARD_START_FEN } from '../src/db.js';

describe('db', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDb(':memory:');
  });

  it('saves and retrieves a game by id, including variant and startFen', () => {
    saveGame(db, {
      id: 'abc123',
      pgn: '1. e4 e5 *',
      result: '1-0',
      resultReason: 'checkmate',
      whiteTimeMs: 12000,
      blackTimeMs: 5000,
      timeControlMs: 60000,
      finishedAt: 1700000000000,
      variant: 'kingofthehill',
      startFen: STANDARD_START_FEN,
    });
    const game = getGame(db, 'abc123');
    expect(game?.pgn).toBe('1. e4 e5 *');
    expect(game?.result).toBe('1-0');
    expect(game?.variant).toBe('kingofthehill');
    expect(game?.startFen).toBe(STANDARD_START_FEN);
  });

  it('lists games most recently finished first', () => {
    saveGame(db, {
      id: 'g1',
      pgn: '*',
      result: '1-0',
      resultReason: 'checkmate',
      whiteTimeMs: 0,
      blackTimeMs: 0,
      timeControlMs: 0,
      finishedAt: 100,
      variant: 'chess',
      startFen: STANDARD_START_FEN,
    });
    saveGame(db, {
      id: 'g2',
      pgn: '*',
      result: '0-1',
      resultReason: 'resignation',
      whiteTimeMs: 0,
      blackTimeMs: 0,
      timeControlMs: 0,
      finishedAt: 200,
      variant: 'chess',
      startFen: STANDARD_START_FEN,
    });
    const games = listGames(db);
    expect(games.map((g) => g.id)).toEqual(['g2', 'g1']);
  });

  it('returns undefined for an unknown id', () => {
    expect(getGame(db, 'missing')).toBeUndefined();
  });

  it('migrates an existing pre-variant database file without losing data, defaulting old rows to standard chess', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'luchess-db-test-'));
    const dbPath = path.join(dir, 'legacy.sqlite');

    // Build a file on disk shaped like the schema that existed before this plan (no
    // variant/start_fen columns), with one real row in it — this is what the already-deployed
    // production database looks like today.
    const legacyDb = new RawDatabase(dbPath);
    legacyDb.exec(`
      CREATE TABLE games (
        id TEXT PRIMARY KEY,
        pgn TEXT NOT NULL,
        result TEXT NOT NULL,
        result_reason TEXT NOT NULL,
        white_time_ms INTEGER NOT NULL,
        black_time_ms INTEGER NOT NULL,
        time_control_ms INTEGER NOT NULL,
        finished_at INTEGER NOT NULL
      )
    `);
    legacyDb
      .prepare(
        `INSERT INTO games (id, pgn, result, result_reason, white_time_ms, black_time_ms, time_control_ms, finished_at)
         VALUES ('legacy1', '1. e4 e5 *', '1-0', 'resignation', 1000, 2000, 60000, 1600000000000)`
      )
      .run();
    legacyDb.close();

    // This calls the REAL openDb() against the real file — exercising the actual migration
    // path, not a simulated/duplicated copy of it.
    const migratedDb = openDb(dbPath);
    const legacyGame = getGame(migratedDb, 'legacy1');
    expect(legacyGame?.variant).toBe('chess');
    expect(legacyGame?.startFen).toBe(STANDARD_START_FEN);

    // Calling openDb() again on the now-migrated file must be idempotent (no "duplicate
    // column" error) — this is exactly what happens every time the server process restarts.
    migratedDb.close();
    expect(() => openDb(dbPath)).not.toThrow();

    rmSync(dir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --prefix server -- db`
Expected: FAIL — `db.ts` doesn't export `STANDARD_START_FEN`, `saveGame`/`GameRecord` don't have `variant`/`startFen` fields yet.

- [ ] **Step 3: Write the implementation**

Replace `server/src/db.ts` with:

```typescript
// server/src/db.ts
import Database from 'better-sqlite3';

export const STANDARD_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export interface GameRecord {
  id: string;
  pgn: string;
  result: string;
  resultReason: string;
  whiteTimeMs: number;
  blackTimeMs: number;
  timeControlMs: number;
  finishedAt: number;
  variant: string;
  startFen: string;
}

export function openDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      pgn TEXT NOT NULL,
      result TEXT NOT NULL,
      result_reason TEXT NOT NULL,
      white_time_ms INTEGER NOT NULL,
      black_time_ms INTEGER NOT NULL,
      time_control_ms INTEGER NOT NULL,
      finished_at INTEGER NOT NULL
    )
  `);
  migrateVariantColumns(db);
  return db;
}

function migrateVariantColumns(db: Database.Database): void {
  const columns = db.prepare(`PRAGMA table_info(games)`).all() as Array<{ name: string }>;
  const columnNames = new Set(columns.map((c) => c.name));
  if (!columnNames.has('variant')) {
    db.exec(`ALTER TABLE games ADD COLUMN variant TEXT NOT NULL DEFAULT 'chess'`);
  }
  if (!columnNames.has('start_fen')) {
    db.exec(`ALTER TABLE games ADD COLUMN start_fen TEXT NOT NULL DEFAULT '${STANDARD_START_FEN}'`);
  }
}

export function saveGame(db: Database.Database, game: GameRecord): void {
  db.prepare(`
    INSERT INTO games (id, pgn, result, result_reason, white_time_ms, black_time_ms, time_control_ms, finished_at, variant, start_fen)
    VALUES (@id, @pgn, @result, @resultReason, @whiteTimeMs, @blackTimeMs, @timeControlMs, @finishedAt, @variant, @startFen)
  `).run(game);
}

export function listGames(db: Database.Database): GameRecord[] {
  const rows = db.prepare(`SELECT * FROM games ORDER BY finished_at DESC`).all() as Record<string, unknown>[];
  return rows.map(rowToGameRecord);
}

export function getGame(db: Database.Database, id: string): GameRecord | undefined {
  const row = db.prepare(`SELECT * FROM games WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  return row ? rowToGameRecord(row) : undefined;
}

function rowToGameRecord(row: Record<string, unknown>): GameRecord {
  return {
    id: row.id as string,
    pgn: row.pgn as string,
    result: row.result as string,
    resultReason: row.result_reason as string,
    whiteTimeMs: row.white_time_ms as number,
    blackTimeMs: row.black_time_ms as number,
    timeControlMs: row.time_control_ms as number,
    finishedAt: row.finished_at as number,
    variant: row.variant as string,
    startFen: row.start_fen as string,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --prefix server -- db`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/db.ts server/test/db.test.ts
git commit -m "feat(server): add variant/start_fen columns with safe migration"
```

---

### Task 4: Wire variant selection through the API, with a lightweight integration check

**Files:**
- Modify: `server/src/app.ts`
- Modify: `server/src/roomManager.ts`
- Test: `server/test/variantApi.test.ts` (new)

**Interfaces:**
- Consumes: `generateChess960Fen` (Task 1), `Room`'s new constructor params + `getInitialFen()` (Task 2), `GameRecord`'s `variant`/`startFen` fields (Task 3).
- Produces: `RoomManager.createRoom(timeControlMs, colorPref, rules?, startFen?)` — two new optional trailing parameters. `POST /api/games` accepts a `variant` field in its JSON body (`'chess' | 'chess960' | '3check' | 'kingofthehill'`, invalid/missing defaults to `'chess'`).

- [ ] **Step 1: Modify `server/src/roomManager.ts`**

Change the `createRoom` method signature and body to accept and forward the new parameters:

```typescript
// server/src/roomManager.ts
import { Room, type Color } from './room.js';
import { generateRoomId } from './idGen.js';
import type { Rules } from 'chessops/types';

const CLEANUP_INTERVAL_MS = 60_000;
const CLEANUP_AFTER_MS = 10 * 60_000;

export class RoomManager {
  private rooms = new Map<string, Room>();
  private emptySince = new Map<string, number>();

  createRoom(
    timeControlMs: number,
    colorPref: Color | 'random',
    rules: Rules = 'chess',
    startFen?: string,
    chess960: boolean = false
  ): Room {
    let id = generateRoomId();
    while (this.rooms.has(id)) id = generateRoomId();
    const room = new Room(id, timeControlMs, colorPref, Date.now, startFen, rules, chess960);
    this.rooms.set(id, room);
    return room;
  }

  get(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  allRooms(): IterableIterator<Room> {
    return this.rooms.values();
  }

  startCleanupLoop(): NodeJS.Timeout {
    return setInterval(() => this.sweep(), CLEANUP_INTERVAL_MS);
  }

  sweep(now: number = Date.now()): void {
    for (const [id, room] of this.rooms) {
      if (room.hasActiveConnections()) {
        this.emptySince.delete(id);
        continue;
      }
      const since = this.emptySince.get(id);
      if (since === undefined) {
        this.emptySince.set(id, now);
      } else if (now - since >= CLEANUP_AFTER_MS) {
        this.rooms.delete(id);
        this.emptySince.delete(id);
      }
    }
  }
}
```

- [ ] **Step 2: Modify `server/src/app.ts`**

Find the `POST /api/games` handler (currently validates `timeControlMs`/`colorPref` and calls `roomManager.createRoom(validTime, validColor)`) and the `persistIfFinished` function (which builds a `GameRecord` to save). Update both:

```typescript
// In the imports section, add:
import { generateChess960Fen } from './chess960.js';
import type { Rules } from 'chessops/types';

// Replace the POST /api/games handler with:
app.post('/api/games', (req, res) => {
  const { timeControlMs, colorPref, variant } = req.body ?? {};
  const validTime = typeof timeControlMs === 'number' && timeControlMs >= 0 ? timeControlMs : 0;
  const validColor: Color | 'random' =
    colorPref === 'white' || colorPref === 'black' ? colorPref : 'random';

  let rules: Rules = 'chess';
  let chess960 = false;
  let startFen: string | undefined;
  if (variant === 'chess960') {
    chess960 = true;
    startFen = generateChess960Fen();
  } else if (variant === '3check' || variant === 'kingofthehill') {
    rules = variant;
  }

  const room = roomManager.createRoom(validTime, validColor, rules, startFen, chess960);
  res.json({ roomId: room.id });
});
```

Update `persistIfFinished` to include the two new `GameRecord` fields — find the `saveGame(db, { ... })` call inside it and add:

```typescript
      variant: room.getSnapshot().chess960 ? 'chess960' : room.getSnapshot().variant,
      startFen: room.getInitialFen(),
```

to the object passed to `saveGame`, alongside the existing fields (`id`, `pgn`, `result`, `resultReason`, `whiteTimeMs`, `blackTimeMs`, `timeControlMs`, `finishedAt`).

Note: the persisted `variant` string intentionally combines chessops' `rules` value with the `chess960` flag into one display-friendly identifier (`'chess960'` when the flag is set, otherwise the raw rules value) — this is what the history page will show and what a future "create a rematch" feature (not in this plan) could round-trip back into the `variant` field the API accepts.

- [ ] **Step 3: Write the integration test**

```typescript
// server/test/variantApi.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import { WebSocket } from 'ws';
import { createApp } from '../src/app.js';

describe('variant selection over the API', () => {
  let server: http.Server | undefined;

  afterEach(() => {
    server?.close();
  });

  async function createAppAndConnect(variant: string): Promise<{ base: string; port: number; ws: WebSocket; state: any }> {
    server = createApp({ dbPath: ':memory:' });
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const port = (server!.address() as AddressInfo).port;
    const base = `http://localhost:${port}`;

    const createRes = await fetch(`${base}/api/games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeControlMs: 0, colorPref: 'white', variant }),
    });
    const { roomId } = await createRes.json();

    const ws = new WebSocket(`ws://localhost:${port}/ws/${roomId}`);
    const state = await new Promise<any>((resolve) => {
      const handler = (raw: any) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'state') {
          ws.off('message', handler);
          resolve(msg);
        }
      };
      ws.on('message', handler);
    });
    return { base, port, ws, state };
  }

  it('creates a 3check room with the 3check rules and initial checksRemaining', async () => {
    const { ws, state } = await createAppAndConnect('3check');
    expect(state.variant).toBe('3check');
    expect(state.chess960).toBe(false);
    expect(state.checksRemaining).toEqual({ white: 3, black: 3 });
    ws.close();
  });

  it('creates a King of the Hill room with the kingofthehill rules', async () => {
    const { ws, state } = await createAppAndConnect('kingofthehill');
    expect(state.variant).toBe('kingofthehill');
    expect(state.chess960).toBe(false);
    expect(state.checksRemaining).toBeNull();
    ws.close();
  });

  it('creates a Chess960 room with chess rules but a randomized starting FEN', async () => {
    const { ws, state } = await createAppAndConnect('chess960');
    expect(state.variant).toBe('chess');
    expect(state.chess960).toBe(true);
    expect(state.fen.split(' ')[0]).not.toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'.split(' ')[0]);
    ws.close();
  });

  it('falls back to standard chess for an unrecognized variant value', async () => {
    const { ws, state } = await createAppAndConnect('not-a-real-variant');
    expect(state.variant).toBe('chess');
    expect(state.chess960).toBe(false);
    ws.close();
  });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --prefix server -- variantApi`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full server suite**

Run: `npm test --prefix server`
Expected: all passing (should now be 23 room + 5 chess960 + 4 db + 4 variantApi + the other pre-existing files = confirm the total against what Task 3 left off at, plus these additions).

- [ ] **Step 6: Commit**

```bash
git add server/src/app.ts server/src/roomManager.ts server/test/variantApi.test.ts
git commit -m "feat(server): wire variant selection through room creation API"
```

---

### Task 5: Client captured-material computation (pure logic, TDD)

**Files:**
- Create: `client/src/capturedPieces.ts`
- Test: `client/test/capturedPieces.test.ts`

**Interfaces:**
- Produces: `type Role`, `interface CapturedPieces { capturedByWhite: Role[]; capturedByBlack: Role[] }`, `computeCapturedPieces(fen: string): CapturedPieces`. Used by `client/src/game.ts` (Task 6).

- [ ] **Step 1: Write the failing tests**

```typescript
// client/test/capturedPieces.test.ts
import { describe, it, expect } from 'vitest';
import { computeCapturedPieces } from '../src/capturedPieces.js';

describe('computeCapturedPieces', () => {
  it('reports no captures for the starting position', () => {
    const result = computeCapturedPieces('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(result.capturedByWhite).toEqual([]);
    expect(result.capturedByBlack).toEqual([]);
  });

  it('attributes a missing black pawn to captures made by white', () => {
    // Scholar's mate FEN after 4.Qxf7# — black is missing the f7 pawn.
    const result = computeCapturedPieces('rnbqkbnr/ppppp1pp/8/5p2/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 0 3');
    expect(result.capturedByWhite).toEqual(['pawn']);
    expect(result.capturedByBlack).toEqual([]);
  });

  it('attributes missing white pawns and a missing black rook independently', () => {
    const fen = 'nbqkbn2/pppppppp/8/8/8/8/1PP1PPPP/RNBQKBNR w KQ - 0 1';
    const result = computeCapturedPieces(fen);
    expect(result.capturedByBlack.sort()).toEqual(['pawn', 'pawn'].sort());
    expect(result.capturedByWhite).toEqual(['rook']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --prefix client -- capturedPieces`
Expected: FAIL — `Cannot find module '../src/capturedPieces.js'`

- [ ] **Step 3: Write the implementation**

```typescript
// client/src/capturedPieces.ts
export type Role = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';

const STARTING_COUNTS: Record<Role, number> = {
  pawn: 8,
  knight: 2,
  bishop: 2,
  rook: 2,
  queen: 1,
  king: 1,
};

const FEN_CHAR_TO_ROLE: Record<string, Role> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

export interface CapturedPieces {
  capturedByWhite: Role[];
  capturedByBlack: Role[];
}

function emptyCounts(): Record<Role, number> {
  return { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0, king: 0 };
}

function missingPieces(present: Record<Role, number>): Role[] {
  const list: Role[] = [];
  for (const role of Object.keys(STARTING_COUNTS) as Role[]) {
    const missing = STARTING_COUNTS[role] - present[role];
    for (let i = 0; i < missing; i++) list.push(role);
  }
  return list;
}

export function computeCapturedPieces(fen: string): CapturedPieces {
  const boardPart = fen.split(' ')[0];
  const whiteCounts = emptyCounts();
  const blackCounts = emptyCounts();

  for (const ch of boardPart) {
    const role = FEN_CHAR_TO_ROLE[ch.toLowerCase()];
    if (!role) continue;
    if (ch === ch.toLowerCase()) blackCounts[role] += 1;
    else whiteCounts[role] += 1;
  }

  return {
    capturedByWhite: missingPieces(blackCounts),
    capturedByBlack: missingPieces(whiteCounts),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --prefix client -- capturedPieces`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/capturedPieces.ts client/test/capturedPieces.test.ts
git commit -m "feat(client): add pure captured-material computation from FEN"
```

---

### Task 6: Game page — variant label, captured-material display, 3check king icons

**Files:**
- Modify: `client/public/game.html`
- Modify: `client/src/game.ts` (full replacement)

**Interfaces:**
- Consumes: `computeCapturedPieces` (Task 5); `state.variant`/`state.chess960`/`state.checksRemaining` (Task 2, already broadcast).
- No automated test (DOM-heavy) — verified via typecheck and manual verification (Task 9).

- [ ] **Step 1: Add new elements to `client/public/game.html`**

Inside `<div class="game-layout card">`, add a `variant-label` div right after the `invite-panel` block, and add `captured-top`/`captured-bottom` divs immediately before/after the clock divs respectively. The full body becomes:

```html
<body>
  <div class="page">
    <div class="game-layout card">
      <div id="invite-panel" class="invite-panel" hidden>
        <p>等待对手加入... 分享链接给你朋友:</p>
        <div class="invite-row">
          <input id="invite-link" type="text" readonly />
          <button id="copy-invite-btn">复制邀请链接</button>
        </div>
      </div>
      <div id="variant-label" class="variant-label"></div>
      <div id="captured-top" class="captured"></div>
      <div class="clock" id="clock-top">--:--</div>
      <div id="board" class="cg-wrap"></div>
      <div class="clock" id="clock-bottom">--:--</div>
      <div id="captured-bottom" class="captured"></div>
      <div class="controls">
        <button id="resign-btn">认输</button>
        <button id="draw-btn">求和</button>
        <button id="undo-btn">悔棋</button>
      </div>
      <div id="offer-banner" class="offer-banner" hidden></div>
      <ol id="move-list" class="move-list"></ol>
    </div>
  </div>
  <script type="module" src="/game.js"></script>
</body>
```

(Everything above `<div id="variant-label">` and below `<div id="captured-bottom">` — the `<head>`, invite-panel, board, controls, offer-banner, move-list — is unchanged from the current file.)

- [ ] **Step 2: Add a small CSS rule to `client/public/style.css`**

Append:

```css
.variant-label {
  font-size: 0.85rem;
  color: var(--text-muted);
  text-align: center;
}

.captured {
  min-height: 1.5rem;
  font-size: 1.25rem;
  letter-spacing: 0.1rem;
  text-align: center;
}
```

- [ ] **Step 3: Replace `client/src/game.ts`**

```typescript
// client/src/game.ts
import { Chessground } from 'chessground';
import type { Key, Dests } from 'chessground/types';
import { Chess } from 'chessops/chess';
import { parseFen, makeFen } from 'chessops/fen';
import { chessgroundDests } from 'chessops/compat';
import { WsClient } from './wsClient.js';
import { formatClock } from './clock.js';
import { shouldShowInvitePanel } from './invitePanel.js';
import { computeCapturedPieces, type Role } from './capturedPieces.js';

const roomId = location.pathname.split('/').pop()!;
const boardEl = document.getElementById('board')!;
const clockTop = document.getElementById('clock-top')!;
const clockBottom = document.getElementById('clock-bottom')!;
const moveListEl = document.getElementById('move-list')!;
const offerBanner = document.getElementById('offer-banner')!;
const resignBtn = document.getElementById('resign-btn') as HTMLButtonElement;
const drawBtn = document.getElementById('draw-btn') as HTMLButtonElement;
const undoBtn = document.getElementById('undo-btn') as HTMLButtonElement;
const invitePanel = document.getElementById('invite-panel')!;
const inviteLinkInput = document.getElementById('invite-link') as HTMLInputElement;
const copyInviteBtn = document.getElementById('copy-invite-btn') as HTMLButtonElement;
const variantLabelEl = document.getElementById('variant-label')!;
const capturedTop = document.getElementById('captured-top')!;
const capturedBottom = document.getElementById('captured-bottom')!;

let mySeat: 'white' | 'black' | 'spectator' = 'spectator';
let localChess: Chess = Chess.default();

const ground = Chessground(boardEl, {
  movable: { free: false, color: undefined },
  events: { move: (orig: Key, dest: Key) => sendMove(orig, dest) },
});

const ws = new WsClient({
  roomId,
  onMessage: (msg) => {
    if (msg.type === 'joined') {
      mySeat = msg.seat;
    } else if (msg.type === 'state') {
      applyState(msg);
    } else if (msg.type === 'error') {
      console.warn('server error:', msg.message);
    }
  },
});

function sendMove(from: string, to: string): void {
  ws.send({ type: 'move', from, to, promotion: 'q' });
}

function computeDests(pos: Chess): Dests {
  return chessgroundDests(pos) as Dests;
}

const WHITE_GLYPH: Record<Role, string> = {
  pawn: '♙',
  knight: '♘',
  bishop: '♗',
  rook: '♖',
  queen: '♕',
  king: '♔',
};

const BLACK_GLYPH: Record<Role, string> = {
  pawn: '♟',
  knight: '♞',
  bishop: '♝',
  rook: '♜',
  queen: '♛',
  king: '♚',
};

function variantLabel(state: any): string {
  if (state.chess960) return 'Chess960';
  if (state.variant === '3check') return '三check';
  if (state.variant === 'kingofthehill') return 'King of the Hill';
  return '标准';
}

function renderCaptured(state: any): void {
  const { capturedByWhite, capturedByBlack } = computeCapturedPieces(state.fen);
  const whiteIcons = capturedByWhite.map((role) => BLACK_GLYPH[role]).join('');
  const blackIcons = capturedByBlack.map((role) => WHITE_GLYPH[role]).join('');

  let whiteChecks = '';
  let blackChecks = '';
  if (state.checksRemaining) {
    whiteChecks = WHITE_GLYPH.king.repeat(3 - state.checksRemaining.white);
    blackChecks = BLACK_GLYPH.king.repeat(3 - state.checksRemaining.black);
  }

  const iAmBlack = mySeat === 'black';
  capturedTop.textContent = iAmBlack ? whiteIcons + whiteChecks : blackIcons + blackChecks;
  capturedBottom.textContent = iAmBlack ? blackIcons + blackChecks : whiteIcons + whiteChecks;
}

function applyState(state: any): void {
  localChess = Chess.fromSetup(parseFen(state.fen).unwrap()).unwrap();
  const turnColor = state.turn === 'white' ? 'white' : 'black';

  ground.set({
    fen: state.fen,
    turnColor,
    orientation: mySeat === 'black' ? 'black' : 'white',
    movable: {
      color: mySeat === 'white' || mySeat === 'black' ? mySeat : undefined,
      dests: mySeat === turnColor ? computeDests(localChess) : new Map(),
    },
    check: localChess.isCheck(),
  });

  clockTop.textContent = formatClock(mySeat === 'black' ? state.clocks.white : state.clocks.black);
  clockBottom.textContent = formatClock(mySeat === 'black' ? state.clocks.black : state.clocks.white);

  variantLabelEl.textContent = variantLabel(state);
  renderCaptured(state);

  moveListEl.innerHTML = state.historySan
    .map((san: string, i: number) => `<li>${i % 2 === 0 ? `${i / 2 + 1}.` : ''} ${san}</li>`)
    .join('');

  renderInvitePanel(state);
  renderOfferBanner(state);
  renderControls(state);

  if (state.status === 'finished') {
    offerBanner.hidden = false;
    offerBanner.textContent = `对局结束: ${state.result} (${state.resultReason})`;
  }
}

function renderInvitePanel(state: any): void {
  if (shouldShowInvitePanel(state.status)) {
    invitePanel.hidden = false;
    inviteLinkInput.value = location.href;
  } else {
    invitePanel.hidden = true;
  }
}

function renderOfferBanner(state: any): void {
  if (state.status !== 'playing') return;
  if (state.drawOfferBy && state.drawOfferBy !== mySeat) {
    offerBanner.hidden = false;
    offerBanner.innerHTML = `对方求和, <button id="accept-draw">同意</button> <button id="reject-draw">拒绝</button>`;
    document.getElementById('accept-draw')!.addEventListener('click', () =>
      ws.send({ type: 'respondDraw', accept: true })
    );
    document.getElementById('reject-draw')!.addEventListener('click', () =>
      ws.send({ type: 'respondDraw', accept: false })
    );
  } else if (state.undoOfferBy && state.undoOfferBy !== mySeat) {
    offerBanner.hidden = false;
    offerBanner.innerHTML = `对方请求悔棋, <button id="accept-undo">同意</button> <button id="reject-undo">拒绝</button>`;
    document.getElementById('accept-undo')!.addEventListener('click', () =>
      ws.send({ type: 'respondUndo', accept: true })
    );
    document.getElementById('reject-undo')!.addEventListener('click', () =>
      ws.send({ type: 'respondUndo', accept: false })
    );
  } else {
    offerBanner.hidden = true;
  }
}

function renderControls(state: any): void {
  const isPlayer = mySeat === 'white' || mySeat === 'black';
  const canAct = isPlayer && state.status === 'playing';
  resignBtn.disabled = !canAct;
  drawBtn.disabled = !canAct || state.drawOfferBy === mySeat;
  undoBtn.disabled = !canAct || state.undoOfferBy === mySeat || state.historySan.length === 0;
}

resignBtn.addEventListener('click', () => ws.send({ type: 'resign' }));
drawBtn.addEventListener('click', () => ws.send({ type: 'offerDraw' }));
undoBtn.addEventListener('click', () => ws.send({ type: 'offerUndo' }));

copyInviteBtn.addEventListener('click', async () => {
  const link = location.href;
  const original = copyInviteBtn.textContent;
  let copied = false;
  try {
    await navigator.clipboard.writeText(link);
    copied = true;
  } catch {
    inviteLinkInput.select();
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }
  }
  copyInviteBtn.textContent = copied ? '已复制!' : '已选中, 按 Ctrl+C 复制';
  setTimeout(() => {
    copyInviteBtn.textContent = original;
  }, 2000);
});
```

Note: `makeFen` is imported but, as before this plan, not directly used in this file (kept for parity with the existing unused import noted in an earlier review — not something to "fix" as part of this task; leave as-is unless it causes an actual lint/build error).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck --prefix client`
Expected: clean. If chessops' `Position.remainingChecks` shape or any import path differs from what this task assumes, adjust to match the installed version's types (check `client/node_modules/chessops/dist/chess.d.ts`), the same pattern used throughout this project.

- [ ] **Step 5: Commit**

```bash
git add client/public/game.html client/public/style.css client/src/game.ts
git commit -m "feat(client): add variant label, captured-material display, and 3check king icons"
```

---

### Task 7: Home page — variant picker

**Files:**
- Modify: `client/public/index.html`
- Modify: `client/src/main.ts`

**Interfaces:**
- Produces: a `variant` field sent in the `POST /api/games` body, consumed by Task 4's server code (already deployed by this point in the plan).
- No automated test (thin DOM/fetch glue, same as before this plan).

- [ ] **Step 1: Add the variant select to `client/public/index.html`**

Add a new `<label>` block for "玩法" right after the existing "执子颜色" label, before the "创建对局" button:

```html
<!doctype html>
<html lang="zh">
<head>
  <meta charset="utf-8" />
  <title>luchess</title>
  <link rel="stylesheet" href="/style.css" />
</head>
<body>
  <div class="page">
    <h1>luchess</h1>
    <main class="card create-form">
      <label>
        时限
        <select id="time-control">
          <option value="0">无限时</option>
          <option value="300000">5+0</option>
          <option value="600000">10+0</option>
          <option value="900000">15+0</option>
        </select>
      </label>
      <label>
        执子颜色
        <select id="color-pref">
          <option value="random">随机</option>
          <option value="white">白方</option>
          <option value="black">黑方</option>
        </select>
      </label>
      <label>
        玩法
        <select id="variant">
          <option value="chess">标准</option>
          <option value="chess960">Chess960</option>
          <option value="3check">三check</option>
          <option value="kingofthehill">King of the Hill</option>
        </select>
      </label>
      <button id="create-btn">创建对局</button>
      <p><a href="/games">历史对局</a></p>
    </main>
  </div>
  <script type="module" src="/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Update `client/src/main.ts`**

```typescript
// client/src/main.ts
const createBtn = document.getElementById('create-btn') as HTMLButtonElement;
const timeSelect = document.getElementById('time-control') as HTMLSelectElement;
const colorSelect = document.getElementById('color-pref') as HTMLSelectElement;
const variantSelect = document.getElementById('variant') as HTMLSelectElement;

createBtn.addEventListener('click', async () => {
  const timeControlMs = Number(timeSelect.value);
  const colorPref = colorSelect.value;
  const variant = variantSelect.value;
  const res = await fetch('/api/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeControlMs, colorPref, variant }),
  });
  const { roomId } = await res.json();
  location.href = `/game/${roomId}`;
});
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck --prefix client`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add client/public/index.html client/src/main.ts
git commit -m "feat(client): add minimal variant picker to the home page"
```

---

### Task 8: History replay — use the game's actual starting FEN; show variant in the list

**Files:**
- Modify: `client/src/games.ts` (full replacement)

**Interfaces:**
- Consumes: `/api/games/:id`'s response now includes `variant`/`startFen` (Task 3/4, already deployed by this point).
- No automated test (DOM-heavy) — verified via typecheck and manual verification (Task 9), including replaying a Chess960 game (non-standard start).

- [ ] **Step 1: Replace `client/src/games.ts`**

```typescript
// client/src/games.ts
import { Chessground } from 'chessground';
import { Chess } from 'chessops/chess';
import { parseFen, makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { extractSanMoves } from './pgnReplay.js';

const listEl = document.getElementById('games-list')!;
const boardEl = document.getElementById('replay-board')!;
const prevBtn = document.getElementById('replay-prev') as HTMLButtonElement;
const nextBtn = document.getElementById('replay-next') as HTMLButtonElement;

const ground = Chessground(boardEl, { viewOnly: true });

let replayMoves: string[] = [];
let replayStartFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
let replayIndex = 0;

const VARIANT_LABELS: Record<string, string> = {
  chess: '标准',
  chess960: 'Chess960',
  '3check': '三check',
  kingofthehill: 'King of the Hill',
};

async function loadList(): Promise<void> {
  const res = await fetch('/api/games');
  const games = await res.json();
  listEl.innerHTML = games
    .map(
      (g: any) =>
        `<li><a href="#" data-id="${g.id}">${g.id} — ${VARIANT_LABELS[g.variant] ?? g.variant} — ${g.result} (${g.resultReason})</a></li>`
    )
    .join('');
  listEl.querySelectorAll('a').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      loadReplay((a as HTMLAnchorElement).dataset.id!);
    })
  );
}

async function loadReplay(id: string): Promise<void> {
  const res = await fetch(`/api/games/${id}`);
  const game = await res.json();
  replayMoves = extractSanMoves(game.pgn);
  replayStartFen = game.startFen;
  replayIndex = 0;
  render();
}

function positionAt(index: number): Chess {
  const pos = Chess.fromSetup(parseFen(replayStartFen).unwrap()).unwrap();
  for (let i = 0; i < index; i++) {
    const move = parseSan(pos, replayMoves[i]);
    if (!move) break;
    pos.play(move);
  }
  return pos;
}

function render(): void {
  const pos = positionAt(replayIndex);
  ground.set({ fen: makeFen(pos.toSetup()) });
}

prevBtn.addEventListener('click', () => {
  if (replayIndex === 0) return;
  replayIndex -= 1;
  render();
});

nextBtn.addEventListener('click', () => {
  if (replayIndex >= replayMoves.length) return;
  replayIndex += 1;
  render();
});

loadList();
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --prefix client`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add client/src/games.ts
git commit -m "feat(client): replay from the game's actual starting FEN; show variant in history list"
```

---

### Task 9: Full regression, migration check, and manual verification of all 4 variants

**Files:** None created or modified — this task verifies Tasks 1–8.

**Interfaces:** None (verification only).

- [ ] **Step 1: Run the full server test suite**

Run: `npm test --prefix server`
Expected: all passing (23 room + 5 chess960 + 4 db + 4 variantApi + the pre-existing chessRules/idGen/roomManager/wsHandlers/integration files — confirm the total is consistent with what each prior task reported).

- [ ] **Step 2: Run the full client test suite**

Run: `npm test --prefix client`
Expected: all passing (14 from before this plan — clock/wsClient/invitePanel/pgnReplay — plus 3 new `capturedPieces` tests = 17 total).

- [ ] **Step 3: Typecheck the client**

Run: `npm run typecheck --prefix client`
Expected: clean.

- [ ] **Step 4: Confirm the migration test is real, not simulated**

Task 3's `db.test.ts` migration test already calls the actual `openDb()` against a real temp file shaped like the pre-this-plan schema (not a synthetic in-memory simulation) — this is the direct proof the migration is safe to run against the real production `data/games.sqlite` file. Confirm it's still passing as part of Step 1's full suite run; no additional script needed here.

- [ ] **Step 5: Build and manually verify all 4 variants**

Build and run:
```bash
npm run build --prefix client
npm run build --prefix server
mkdir -p data
PORT=3600 LUCHESS_DB_PATH=$(pwd)/data/games.sqlite node server/dist/index.js
```
Run as a background process; confirm the "listening" log line; use `http://localhost:3600`; kill it when done.

Via two browser tabs (or Playwright browser tools):
1. **Standard**: create a standard game (variant dropdown left on 标准), confirm nothing regressed (board, clock, moves, resign/draw/undo all work as before, variant label shows "标准", captured-material area shows nothing until a capture happens, then shows the correct icon).
2. **Chess960**: create a Chess960 game, confirm the board's starting position is shuffled (not the standard back rank), confirm castling still shows the traditional move-hint squares and executes correctly for whichever side can legally castle first, confirm the variant label shows "Chess960".
3. **Three-check**: create a 3check game, deliver at least one check, confirm a king icon appears in the checked player's captured-material area, confirm the game does NOT end after 1 or 2 checks, and (if practical) play out to a 3rd check and confirm the game ends with the correct winner.
4. **King of the Hill**: create a KotH game, walk a king to a center square (d4/d5/e4/e5), confirm the game ends immediately in that player's favor.
5. **Captured pieces**: in any game, make a capture and confirm the correct piece icon appears in the capturing side's captured-material area, on both tabs.
6. **History**: visit `/games`, confirm the Chess960 game replays correctly from its actual (non-standard) starting position, confirm the list shows the correct variant label for each game.
7. No console errors on any page.

If anything differs from the design's intent, that's a real bug — fix it (using systematic-debugging if the cause isn't obvious) before considering this task, and the plan, complete.

- [ ] **Step 6: Final commit (only if Step 4 or Step 5 required fixes)**

If verification required any code changes, commit them separately with a clear message describing what was fixed. If no fixes were needed, there is nothing to commit for this task.
