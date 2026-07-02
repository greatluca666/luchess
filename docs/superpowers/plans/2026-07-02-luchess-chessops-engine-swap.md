# luchess Chessops Engine Swap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace chess.js with chessops (lichess's own rules library) as luchess's chess engine, on both server and client, with zero user-visible behavior change — this is sub-project 1 of 5 toward full lichess-variant support, and lays the groundwork the other four depend on.

**Architecture:** `chessops`'s `Position` class (unlike chess.js) does not track move history, undo, or PGN generation — it only represents "the current position" and exposes `isLegal`/`play`/`outcome`/etc. `Room` therefore becomes responsible for owning its own move history (for undo, PGN export, and threefold-repetition detection), rebuilding position from scratch on undo rather than calling a built-in undo. The client independently uses chessops too (separate npm package, no cross-package imports, matching the existing pattern where client and server each currently import chess.js on their own).

**Tech Stack:** `chessops` (TypeScript, no native bindings) replacing `chess.js` in both `server/package.json` and `client/package.json`.

## Global Constraints

- Zero user-visible behavior change. Every existing server test (33) and the full manual acceptance flow (create/join/move/resign/draw/undo/timeout/spectate/history/replay/reconnect) must work identically to before this plan.
- No variant selection is exposed anywhere in this plan — `Room` always plays standard chess (`rules: 'chess'`, no custom starting position except where a test needs one). The `variant`/`chess960` fields added to `StateSnapshot` are always `'chess'`/`false` in this plan; later sub-projects populate them for real.
- `MoveInput` (the wire format: `{from: string, to: string, promotion?: string}`, algebraic square names, single-letter promotion) does not change — only the server/client-internal chess engine changes.
- Chessops API specifics used in this plan (`isLegal`, `play`, `dests`, `allDests`, `outcome`, `isCheckmate`, `isStalemate`, `isInsufficientMaterial`, `isCheck`, `turn`, `halfmoves`, `parseSquare`, `makeSquare`, `parseSan`, `makeSan`, `parseFen`, `makeFen`, `defaultPosition`, `setupPosition`, `Chess.default`, `Chess.fromSetup`) were verified against chessops' current documentation before writing this plan. If an implementer finds the installed chessops version's actual type signatures differ in a minor way (e.g. a slightly different exported module path), adjust to match the installed version's types — the same way earlier luchess work adapted chessground's exact type exports. Report DONE_WITH_CONCERNS describing any such adjustment.

---

### Task 1: Swap the dependency (server + client)

**Files:**
- Modify: `server/package.json`
- Modify: `client/package.json`

**Interfaces:**
- Produces: `chessops` installed and available to import from `server/src/*` and `client/src/*` in later tasks.

- [ ] **Step 1: Remove chess.js and install chessops on the server**

Run:
```bash
npm uninstall chess.js --prefix server
npm install chessops --prefix server
```
Expected: `server/package.json`'s `dependencies` no longer lists `chess.js`, now lists `chessops` with whatever version npm resolved.

- [ ] **Step 2: Remove chess.js and install chessops on the client**

Run:
```bash
npm uninstall chess.js --prefix client
npm install chessops --prefix client
```
Expected: `client/package.json`'s `dependencies` no longer lists `chess.js`, now lists `chessops`.

- [ ] **Step 3: Confirm nothing else references chess.js yet**

Run: `grep -rn "chess.js" server/src server/test client/src client/test`
Expected: matches only in files this plan will rewrite in later tasks (`server/src/chessRules.ts`, `server/test/chessRules.test.ts`, `server/src/room.ts`, `server/test/room.test.ts`, `client/src/game.ts`, `client/src/games.ts`). Do not fix these yet — later tasks handle them. This step is just to confirm the blast radius matches expectations before proceeding.

- [ ] **Step 4: Commit**

```bash
git add server/package.json server/package-lock.json client/package.json client/package-lock.json
git commit -m "chore: replace chess.js with chessops"
```

---

### Task 2: Rewrite `chessRules.ts` on chessops

**Files:**
- Modify: `server/src/chessRules.ts` (full rewrite)
- Modify: `server/test/chessRules.test.ts` (full rewrite)

**Interfaces:**
- Consumes: `chessops/variant`'s `defaultPosition`, `setupPosition`, `type Rules`; `chessops/chess`'s `type Position`; `chessops/fen`'s `parseFen`; `chessops/util`'s `parseSquare`; `chessops/san`'s `makeSan`.
- Produces (used by `room.ts` in Task 3):
  - `type Role = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king'`
  - `interface MoveInput { from: string; to: string; promotion?: string }` (unchanged shape from before this plan)
  - `interface ChessopsMove { from: number; to: number; promotion?: Role }`
  - `type ResultReason = 'checkmate' | 'stalemate' | 'insufficient-material' | 'variant-end' | 'threefold-repetition' | 'fifty-move'`
  - `interface GameOverResult { gameOver: boolean; result?: '1-0' | '0-1' | '1/2-1/2'; resultReason?: ResultReason }`
  - `interface MoveResult extends GameOverResult { ok: boolean; error?: string; san?: string }`
  - `createGame(rules?: Rules, fen?: string): Position`
  - `toChessopsMove(move: MoveInput): ChessopsMove | undefined`
  - `applyMove(pos: Position, move: MoveInput): MoveResult`
  - `checkGameOver(pos: Position): GameOverResult`

- [ ] **Step 1: Write the failing tests**

```typescript
// server/test/chessRules.test.ts
import { describe, it, expect } from 'vitest';
import { createGame, applyMove, checkGameOver } from '../src/chessRules.js';

describe('chessRules', () => {
  it('applies a legal opening move', () => {
    const pos = createGame();
    const result = applyMove(pos, { from: 'e2', to: 'e4' });
    expect(result.ok).toBe(true);
    expect(result.san).toBe('e4');
    expect(result.gameOver).toBe(false);
  });

  it('rejects an illegal move', () => {
    const pos = createGame();
    const result = applyMove(pos, { from: 'e2', to: 'e5' });
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('detects checkmate (fools mate)', () => {
    const pos = createGame();
    expect(applyMove(pos, { from: 'f2', to: 'f3' }).ok).toBe(true);
    expect(applyMove(pos, { from: 'e7', to: 'e5' }).ok).toBe(true);
    expect(applyMove(pos, { from: 'g2', to: 'g4' }).ok).toBe(true);
    const final = applyMove(pos, { from: 'd8', to: 'h4' });
    expect(final.ok).toBe(true);
    expect(final.gameOver).toBe(true);
    expect(final.result).toBe('0-1');
    expect(final.resultReason).toBe('checkmate');
  });

  it('detects stalemate as a draw', () => {
    const pos = createGame('chess', '1R6/8/8/8/8/8/7R/k6K b - - 0 1');
    const result = checkGameOver(pos);
    expect(result.gameOver).toBe(true);
    expect(result.result).toBe('1/2-1/2');
    expect(result.resultReason).toBe('stalemate');
  });

  it('detects insufficient material as a draw', () => {
    // King and bishop vs lone king — no combination of moves can force checkmate.
    const pos = createGame('chess', '8/8/8/4k3/8/8/4KB2/8 w - - 0 1');
    const result = checkGameOver(pos);
    expect(result.gameOver).toBe(true);
    expect(result.result).toBe('1/2-1/2');
    expect(result.resultReason).toBe('insufficient-material');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --prefix server -- chessRules`
Expected: FAIL — old `chessRules.ts` still imports `chess.js`, which is no longer installed, so the module fails to load.

- [ ] **Step 3: Write the implementation**

```typescript
// server/src/chessRules.ts
import { defaultPosition, setupPosition, type Rules } from 'chessops/variant';
import type { Position } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseSquare } from 'chessops/util';
import { makeSan } from 'chessops/san';

export type Role = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';

export interface MoveInput {
  from: string;
  to: string;
  promotion?: string;
}

export interface ChessopsMove {
  from: number;
  to: number;
  promotion?: Role;
}

export type ResultReason =
  | 'checkmate'
  | 'stalemate'
  | 'insufficient-material'
  | 'variant-end'
  | 'threefold-repetition'
  | 'fifty-move';

export interface GameOverResult {
  gameOver: boolean;
  result?: '1-0' | '0-1' | '1/2-1/2';
  resultReason?: ResultReason;
}

export interface MoveResult extends GameOverResult {
  ok: boolean;
  error?: string;
  san?: string;
}

const PROMOTION_ROLES: Record<string, Role> = {
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
};

function promotionRole(letter: string | undefined): Role {
  return PROMOTION_ROLES[letter ?? 'q'] ?? 'queen';
}

export function createGame(rules: Rules = 'chess', fen?: string): Position {
  if (!fen) return defaultPosition(rules) as Position;
  const setup = parseFen(fen).unwrap();
  return setupPosition(rules, setup).unwrap();
}

export function toChessopsMove(move: MoveInput): ChessopsMove | undefined {
  const from = parseSquare(move.from);
  const to = parseSquare(move.to);
  if (from === undefined || to === undefined) return undefined;
  return { from, to, promotion: promotionRole(move.promotion) };
}

export function applyMove(pos: Position, move: MoveInput): MoveResult {
  const chessMove = toChessopsMove(move);
  if (!chessMove || !pos.isLegal(chessMove)) {
    return { ok: false, error: 'illegal move', gameOver: false };
  }
  const san = makeSan(pos, chessMove);
  pos.play(chessMove);
  return { ok: true, san, ...checkGameOver(pos) };
}

export function checkGameOver(pos: Position): GameOverResult {
  const outcome = pos.outcome();
  if (!outcome) return { gameOver: false };
  const result: '1-0' | '0-1' | '1/2-1/2' =
    outcome.winner === 'white' ? '1-0' : outcome.winner === 'black' ? '0-1' : '1/2-1/2';
  let resultReason: ResultReason;
  if (pos.isCheckmate()) resultReason = 'checkmate';
  else if (pos.isStalemate()) resultReason = 'stalemate';
  else if (pos.isInsufficientMaterial()) resultReason = 'insufficient-material';
  else resultReason = 'variant-end';
  return { gameOver: true, result, resultReason };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --prefix server -- chessRules`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/chessRules.ts server/test/chessRules.test.ts
git commit -m "feat(server): rewrite chessRules.ts on chessops"
```

---

### Task 3: Adapt `room.ts` — own move history, undo-by-replay, repetition/fifty-move detection

**Files:**
- Modify: `server/src/room.ts` (full rewrite)
- Modify: `server/test/room.test.ts` (mostly unchanged; 2 tests added)

**Interfaces:**
- Consumes: `applyMove`, `createGame`, `toChessopsMove`, `type MoveInput` from `chessRules.ts` (Task 2); `type Position` from `chessops/chess`; `makeFen` from `chessops/fen`.
- Produces: same public `Room` class surface as before this plan (`connect`, `disconnect`, `move`, `resign`, `offerDraw`, `respondDraw`, `offerUndo`, `respondUndo`, `checkTimeout`, `getSnapshot`, `getPgn`, `seatColorFor`, `allConnections`, `hasActiveConnections`, `isPersisted`, `markPersisted`), plus a new optional 5th constructor parameter `startFen?: string` (defaults to the standard starting position), and `StateSnapshot` gains two always-fixed fields: `variant: 'chess'`, `chess960: false`.

- [ ] **Step 1: Write the failing tests (2 new tests; the other 15 are unchanged from before this plan and should still pass against the new implementation)**

Add these two tests to the end of the existing `describe('Room', ...)` block in `server/test/room.test.ts` (do not remove or alter any of the 15 existing tests — they exercise the same behaviors and must keep passing):

```typescript
  it('declares a draw by threefold repetition when the same position recurs three times', () => {
    const room = new Room('r1', 0, 'white');
    room.connect(fakeWs());
    room.connect(fakeWs());
    const knightShuffle: Array<{ color: 'white' | 'black'; from: string; to: string }> = [
      { color: 'white', from: 'g1', to: 'f3' },
      { color: 'black', from: 'g8', to: 'f6' },
      { color: 'white', from: 'f3', to: 'g1' },
      { color: 'black', from: 'f6', to: 'g8' },
    ];
    for (let round = 0; round < 2; round++) {
      for (const step of knightShuffle) {
        const result = room.move(step.color, { from: step.from, to: step.to });
        expect(result.ok).toBe(true);
      }
    }
    expect(room.status).toBe('finished');
    expect(room.result).toBe('1/2-1/2');
    expect(room.resultReason).toBe('threefold-repetition');
  });

  it('declares a draw when the fifty-move counter reaches 100 halfmoves', () => {
    const room = new Room('r1', 0, 'white', Date.now, '8/8/8/4k3/8/4K3/8/7R w - - 99 60');
    room.connect(fakeWs());
    room.connect(fakeWs());
    const result = room.move('white', { from: 'h1', to: 'h2' });
    expect(result.ok).toBe(true);
    expect(room.status).toBe('finished');
    expect(room.result).toBe('1/2-1/2');
    expect(room.resultReason).toBe('fifty-move');
  });
```

- [ ] **Step 2: Run tests to verify the 2 new ones fail (and the 15 existing ones currently fail too, since `room.ts` still imports chess.js which is uninstalled)**

Run: `npm test --prefix server -- room`
Expected: FAIL — module load error (chess.js not installed) or, once you notice that, missing 5th-constructor-parameter behavior for the new tests.

- [ ] **Step 3: Write the implementation**

```typescript
// server/src/room.ts
import type WebSocket from 'ws';
import { applyMove, createGame, toChessopsMove, type ChessopsMove, type MoveInput } from './chessRules.js';
import type { Position } from 'chessops/chess';
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
  variant: 'chess';
  chess960: false;
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
    startFen?: string
  ) {
    this.id = id;
    this.timeControlMs = timeControlMs;
    this.clocks = { white: timeControlMs, black: timeControlMs };
    this.colorPref = colorPref;
    this.now = now;
    this.chess = createGame('chess', startFen);
    this.initialFen = makeFen(this.chess.toSetup());
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

    const chessMove = toChessopsMove(input);
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
    this.chess = createGame('chess', this.initialFen);
    this.repetitionCounts.clear();
    // Mirror live play exactly: the pre-move-1 starting position is never
    // recorded during normal play (recordAndCountRepetition only runs after
    // a move), so don't record it here either — only count positions that
    // result from a played move.
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
      variant: 'chess',
      chess960: false,
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

Note the important behavior change from before this plan: `respondDraw`/`respondUndo` already had the `status !== 'playing'` guard from a prior bugfix — it is preserved here (both check `this.status !== 'playing'` before the spectator check, same ordering as `move`/`resign`/`offerDraw`/`offerUndo`). Do not drop this guard.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --prefix server -- room`
Expected: PASS (17 tests — the 15 that existed before this plan, plus the 2 new ones)

- [ ] **Step 5: Run the full server suite**

Run: `npm test --prefix server`
Expected: all passing — this includes `server/test/integration.test.ts`, which needs NO changes in this task (it plays a full game over real WebSocket connections and checks the broadcast/DB result — since behavior is meant to be identical, this test should pass unmodified as the strongest end-to-end regression check).

- [ ] **Step 6: Commit**

```bash
git add server/src/room.ts server/test/room.test.ts
git commit -m "feat(server): adapt Room to chessops (own move history, undo-by-replay, repetition/fifty-move detection)"
```

---

### Task 4: New client module `pgnReplay.ts` (pure logic, TDD)

**Files:**
- Create: `client/src/pgnReplay.ts`
- Test: `client/test/pgnReplay.test.ts`

**Interfaces:**
- Produces: `extractSanMoves(pgn: string): string[]` — strips move-number tokens (`1.`, `2.`, …) and PGN result markers (`*`, `1-0`, `0-1`, `1/2-1/2`) from plain PGN movetext, returning just the SAN move tokens in order. Used by `games.ts` (Task 6).

- [ ] **Step 1: Write the failing tests**

```typescript
// client/test/pgnReplay.test.ts
import { describe, it, expect } from 'vitest';
import { extractSanMoves } from '../src/pgnReplay.js';

describe('extractSanMoves', () => {
  it('strips move numbers and an unfinished-game result marker', () => {
    expect(extractSanMoves('1. e4 e5 2. Nf3 Nc6 *')).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
  });

  it('strips a decisive result marker', () => {
    expect(extractSanMoves('1. f3 e5 2. g4 Qh4# 0-1')).toEqual(['f3', 'e5', 'g4', 'Qh4#']);
  });

  it('strips a draw result marker', () => {
    expect(extractSanMoves('1. Nf3 Nf6 2. Ng1 Ng8 1/2-1/2')).toEqual(['Nf3', 'Nf6', 'Ng1', 'Ng8']);
  });

  it('returns an empty array for an empty movetext', () => {
    expect(extractSanMoves('*')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --prefix client -- pgnReplay`
Expected: FAIL — `Cannot find module '../src/pgnReplay.js'`

- [ ] **Step 3: Write the implementation**

```typescript
// client/src/pgnReplay.ts
export function extractSanMoves(pgn: string): string[] {
  return pgn
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .filter((token) => !/^\d+\.+$/.test(token))
    .filter((token) => !['*', '1-0', '0-1', '1/2-1/2'].includes(token));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --prefix client -- pgnReplay`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/pgnReplay.ts client/test/pgnReplay.test.ts
git commit -m "feat(client): add pure PGN movetext parsing for replay"
```

---

### Task 5: Adapt `client/src/game.ts` to chessops

**Files:**
- Modify: `client/src/game.ts` (full replacement)

**Interfaces:**
- Consumes: `chessops/chess`'s `Chess`; `chessops/fen`'s `parseFen`, `makeFen`; `chessops/util`'s `makeSquare`.
- No change to the file's own exports (it's an entry point, not imported elsewhere) — behavior must match exactly what the file did before this plan.

This task has no automated test (DOM-heavy entry point, same as before this plan) — verified via typecheck and later manual verification (Task 7).

- [ ] **Step 1: Replace the file**

```typescript
// client/src/game.ts
import { Chessground } from 'chessground';
import type { Key, Dests } from 'chessground/types';
import { Chess } from 'chessops/chess';
import { parseFen, makeFen } from 'chessops/fen';
import { makeSquare } from 'chessops/util';
import { WsClient } from './wsClient.js';
import { formatClock } from './clock.js';
import { shouldShowInvitePanel } from './invitePanel.js';

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
  const dests: Dests = new Map();
  for (const [from, toSquares] of pos.allDests()) {
    const toList: Key[] = [];
    for (const to of toSquares) toList.push(makeSquare(to) as Key);
    if (toList.length > 0) dests.set(makeSquare(from) as Key, toList);
  }
  return dests;
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
  try {
    await navigator.clipboard.writeText(link);
    copyInviteBtn.textContent = '已复制!';
  } catch {
    inviteLinkInput.select();
    copyInviteBtn.textContent = '已选中, 按 Ctrl+C 复制';
  }
  setTimeout(() => {
    copyInviteBtn.textContent = original;
  }, 2000);
});
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --prefix client`
Expected: clean. If chessops' actual installed type exports differ slightly from the module paths used above (`chessops/chess`, `chessops/fen`, `chessops/util`), adjust the import paths to match — check `client/node_modules/chessops/dist/*.d.ts` or its `package.json` `exports` field, the same way `chessground`'s `Key`/`Dests` subpath was resolved in earlier luchess work. Report DONE_WITH_CONCERNS if you had to adjust anything.

- [ ] **Step 3: Commit**

```bash
git add client/src/game.ts
git commit -m "feat(client): adapt game.ts to chessops"
```

---

### Task 6: Adapt `client/src/games.ts` to chessops (history replay)

**Files:**
- Modify: `client/src/games.ts` (full replacement)

**Interfaces:**
- Consumes: `extractSanMoves` from `pgnReplay.ts` (Task 4); `chessops/chess`'s `Chess`; `chessops/fen`'s `makeFen`; `chessops/san`'s `parseSan`.
- No automated test for this file (DOM-heavy, same as before this plan) — verified via typecheck and manual verification (Task 7), including replaying a PGN produced by the OLD chess.js-based server (format compatibility).

- [ ] **Step 1: Replace the file**

```typescript
// client/src/games.ts
import { Chessground } from 'chessground';
import { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { extractSanMoves } from './pgnReplay.js';

const listEl = document.getElementById('games-list')!;
const boardEl = document.getElementById('replay-board')!;
const prevBtn = document.getElementById('replay-prev') as HTMLButtonElement;
const nextBtn = document.getElementById('replay-next') as HTMLButtonElement;

const ground = Chessground(boardEl, { viewOnly: true });

let replayMoves: string[] = [];
let replayIndex = 0;

async function loadList(): Promise<void> {
  const res = await fetch('/api/games');
  const games = await res.json();
  listEl.innerHTML = games
    .map((g: any) => `<li><a href="#" data-id="${g.id}">${g.id} — ${g.result} (${g.resultReason})</a></li>`)
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
  replayIndex = 0;
  render();
}

function positionAt(index: number): Chess {
  const pos = Chess.default();
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

Note the architecture change from before this plan: instead of incrementally mutating one long-lived `Chess` instance and needing separate "step forward"/"step backward" logic, `positionAt(index)` rebuilds the position from scratch every render by replaying SAN moves 0..index — consistent with how `Room`'s undo now also rebuilds from scratch (Task 3) rather than mutating in place. This is simpler, not a regression.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --prefix client`
Expected: clean (same caveat as Task 5 about verifying chessops' actual type export paths if something doesn't match).

- [ ] **Step 3: Commit**

```bash
git add client/src/games.ts
git commit -m "feat(client): adapt games.ts history replay to chessops"
```

---

### Task 7: Full regression, old-PGN compatibility check, and manual verification

**Files:** None created or modified — this task verifies Tasks 1–6.

**Interfaces:** None (verification only).

- [ ] **Step 1: Run the full server test suite**

Run: `npm test --prefix server`
Expected: all passing (same 35 tests as after Task 3: the original 33 plus the 2 new threefold/fifty-move tests — confirm the count matches; if it doesn't, something regressed and must be investigated before continuing).

- [ ] **Step 2: Run the full client test suite**

Run: `npm test --prefix client`
Expected: all passing (14 tests: the 10 that existed before this plan — clock, wsClient, invitePanel — plus the 4 new `pgnReplay` tests).

- [ ] **Step 3: Typecheck the client**

Run: `npm run typecheck --prefix client`
Expected: clean.

- [ ] **Step 4: Verify old chess.js-format PGN still replays correctly**

This is a manual check, not an automated test (it exercises the actual browser-side replay UI against a real historical record). If the deployed server's `data/games.sqlite` (or a local copy) already has finished games from before this plan (produced by the old chess.js engine), open `/games` in a browser and confirm at least one pre-existing game replays correctly (prev/next step through the recorded moves, board updates correctly). If no pre-existing games are available in the environment you're testing in, instead: build the app, play and finish a short game (e.g. resign after 2-3 moves) to populate one row, confirm it round-trips through `/games` correctly — this at least proves the new `getPgn()` output is parseable by the new `extractSanMoves`/`parseSan`-based replay, which is the same code path that would need to handle an old-format row (both are plain SAN movetext with no headers, as established in the design).

- [ ] **Step 5: Build and manually verify full gameplay**

Build and run:
```bash
npm run build --prefix client
npm run build --prefix server
mkdir -p data
PORT=3300 LUCHESS_DB_PATH=$(pwd)/data/games.sqlite node server/dist/index.js
```
Run as a background process; confirm "luchess listening on :3300" in the log; use `http://localhost:3300` for all checks below; kill it when done.

Via two browser tabs (or Playwright browser tools), verify — this should feel identical to luchess before this plan, since that is the entire point of this sub-project:
1. Create a game, second tab joins, seated correctly, status becomes `playing`.
2. Play several moves — board, move list, and clocks update correctly on both tabs.
3. Offer and accept a draw — game ends `1/2-1/2` / `draw-agreement` on both tabs.
4. Start a new game, make a move, offer and accept undo — move disappears from board and move list on both tabs.
5. Resign from one tab — game ends with the correct winner.
6. Visit `/games` — the games just finished appear, and replay (prev/next) works correctly for each.
7. Reload a player's tab mid-game — reconnects into the same seat (not spectator).
8. No console errors on any page.

If anything differs from luchess's behavior before this plan, that's a regression — fix it (using systematic-debugging if the cause isn't obvious) before considering this task, and the plan, complete.

- [ ] **Step 6: Final commit (only if Step 4 or Step 5 required fixes)**

If verification required any code changes, commit them separately with a clear message describing what was fixed. If no fixes were needed, there is nothing to commit for this task.
