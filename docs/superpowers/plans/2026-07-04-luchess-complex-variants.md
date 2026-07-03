# luchess Complex Variants (Atomic + Antichess + Racing Kings + Horde) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let two players create and play Atomic, Antichess, Racing Kings, and Horde games — the third of 5 sub-projects toward full lichess-variant support.

**Architecture:** Chessops already implements all 4 rule-sets natively (legality, win conditions, and — for Horde/Racing Kings — their own fixed non-standard starting positions via `defaultPosition(rules)`). `Room`'s `rules` field is already typed as chessops' full `Rules` union (not narrowed), so no `Room`/`chessRules.ts` code changes are needed at all — only `app.ts`'s variant-string parsing grows to recognize 4 more values. The one genuinely new piece of work is generalizing the captured-material display: it currently assumes a fixed 16-piece standard starting count per side, which breaks for Horde (30+ starting pawns for white) — it must instead compute its baseline from each game's actual starting FEN.

**Tech Stack:** Same as the rest of the project — chessops (already integrated), no new dependencies.

## Global Constraints

- No new npm dependencies.
- No custom rules/legality/win-condition logic anywhere in this plan — chessops handles Atomic's explosions, Antichess's mandatory captures and reversed win condition, Racing Kings' no-check rule and rank-8 win condition, and Horde's asymmetric elimination condition entirely on its own. `Room` only threads a `rules` string through; it must not gain any variant-specific branching.
- Chess960 is unaffected by this plan — its dedicated FEN generator (`chess960.ts`) is untouched; the 4 variants here use chessops' own `defaultPosition(rules)` with no custom FEN generation.
- `computeCapturedPieces`'s signature change (`(fen)` → `(fen, startFen)`) is a breaking change to an already-approved module — every call site must be updated in the same task that changes the signature, not left inconsistent even temporarily across task boundaries.
- Do not add captured-material display to the history replay page (`games.ts`) — that was raised as a "maybe, if wanted" aside during brainstorming, not a committed requirement, and is out of scope for this plan (YAGNI).
- Do not hand-transcribe exact chessops-generated FEN strings for Horde/Racing Kings into tests or code — verify any such claim by querying chessops' actual `Board.pieces(color, role): SquareSet` API (`.size()` method) at runtime instead. Two earlier sub-projects both shipped tests with hand-typed FEN transcription errors; this plan avoids the pattern entirely by using structural piece-count assertions instead of full-FEN string comparisons wherever a non-standard starting position is involved.

---

### Task 1: Server — extend variant parsing, expose `startFen` on every snapshot

**Files:**
- Modify: `server/src/app.ts`
- Modify: `server/src/room.ts`
- Modify: `server/test/room.test.ts` (23 existing tests unchanged + 4 new)

**Interfaces:**
- Consumes: nothing new — `Room`'s constructor, `createGame`, and chessops' `Rules` type are all already in place from earlier sub-projects.
- Produces: `POST /api/games`'s `variant` field now also accepts `'atomic'`, `'antichess'`, `'racingkings'`, `'horde'` (mapped directly to the same-named chessops `rules`, no FEN generation). `StateSnapshot` gains `startFen: string` (the room's initial FEN, constant for the whole game, already computed and stored via the existing `initialFen` field/`getInitialFen()` method — this task just also includes it in `getSnapshot()`'s returned object).

- [ ] **Step 1: Write the failing tests (append to the existing `describe('Room', ...)` block in `server/test/room.test.ts`; do not remove or alter the 23 existing tests)**

```typescript
  it('exposes startFen on every snapshot, matching the room\'s actual starting position', () => {
    const room = new Room('r1', 0, 'white');
    room.connect(fakeWs());
    room.connect(fakeWs());
    const snapshot = room.getSnapshot();
    expect(snapshot.startFen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  });

  it('creates a Horde room with a real horde-shaped starting position (far more than 8 white pawns)', () => {
    const room = new Room('r1', 0, 'white', Date.now, undefined, 'horde');
    room.connect(fakeWs());
    room.connect(fakeWs());
    const snapshot = room.getSnapshot();
    expect(snapshot.variant).toBe('horde');
    const board = parseFen(snapshot.fen).unwrap().board;
    expect(board.pieces('white', 'pawn').size()).toBeGreaterThan(20);
    expect(board.pieces('black', 'queen').size()).toBe(1);
    expect(snapshot.startFen).toBe(snapshot.fen); // no moves played yet
  });

  it('creates a Racing Kings room with no pawns on the board for either side', () => {
    const room = new Room('r1', 0, 'white', Date.now, undefined, 'racingkings');
    room.connect(fakeWs());
    room.connect(fakeWs());
    const snapshot = room.getSnapshot();
    expect(snapshot.variant).toBe('racingkings');
    const board = parseFen(snapshot.fen).unwrap().board;
    expect(board.pieces('white', 'pawn').size()).toBe(0);
    expect(board.pieces('black', 'pawn').size()).toBe(0);
  });

  it('creates Atomic and Antichess rooms with the standard starting arrangement', () => {
    const atomicRoom = new Room('r1', 0, 'white', Date.now, undefined, 'atomic');
    atomicRoom.connect(fakeWs());
    atomicRoom.connect(fakeWs());
    expect(atomicRoom.getSnapshot().variant).toBe('atomic');
    const atomicBoard = parseFen(atomicRoom.getSnapshot().fen).unwrap().board;
    expect(atomicBoard.pieces('white', 'pawn').size()).toBe(8);
    expect(atomicBoard.pieces('black', 'king').size()).toBe(1);

    const antichessRoom = new Room('r2', 0, 'white', Date.now, undefined, 'antichess');
    antichessRoom.connect(fakeWs());
    antichessRoom.connect(fakeWs());
    expect(antichessRoom.getSnapshot().variant).toBe('antichess');
    const antichessBoard = parseFen(antichessRoom.getSnapshot().fen).unwrap().board;
    expect(antichessBoard.pieces('white', 'pawn').size()).toBe(8);
    expect(antichessBoard.pieces('black', 'king').size()).toBe(1);
  });
```

Add this import near the top of `server/test/room.test.ts`, alongside the existing imports:

```typescript
import { parseFen } from 'chessops/fen';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --prefix server -- room`
Expected: FAIL — `startFen` doesn't exist on `StateSnapshot` yet, and `app.ts`'s room creation doesn't yet accept `'atomic'`/`'antichess'`/`'racingkings'`/`'horde'` as `rules` values passed through `roomManager.createRoom` in these direct-construction tests this doesn't matter yet (these tests construct `Room` directly, not through the API) — so the first failure you'll see is specifically the missing `startFen` field.

- [ ] **Step 3: Add `startFen` to `Room.getSnapshot()`**

In `server/src/room.ts`, `getSnapshot()` currently ends with:

```typescript
      variant: this.rules,
      chess960: this.chess960,
      checksRemaining: remainingChecks ? { white: remainingChecks.white, black: remainingChecks.black } : null,
    };
  }
```

Add `startFen: this.initialFen,` as a new line in that returned object (alongside `variant`/`chess960`/`checksRemaining` — exact placement among the existing fields doesn't matter, just add the key). Also add `startFen: string;` to the `StateSnapshot` interface near the top of the file, alongside the existing `variant`/`chess960`/`checksRemaining` fields.

- [ ] **Step 4: Extend `server/src/app.ts`'s variant parsing**

Find this block in the `POST /api/games` handler:

```typescript
    if (variant === 'chess960') {
      chess960 = true;
      startFen = generateChess960Fen();
    } else if (variant === '3check' || variant === 'kingofthehill') {
      rules = variant;
    }
```

Replace it with:

```typescript
    if (variant === 'chess960') {
      chess960 = true;
      startFen = generateChess960Fen();
    } else if (
      variant === '3check' ||
      variant === 'kingofthehill' ||
      variant === 'atomic' ||
      variant === 'antichess' ||
      variant === 'racingkings' ||
      variant === 'horde'
    ) {
      rules = variant;
    }
```

(`startFen` stays `undefined` for these 4 — `Room`'s constructor already calls `createGame(rules)` with no fen when `startFen` is undefined, and chessops' `defaultPosition(rules)` supplies the correct starting position for each, including Horde/Racing Kings' own fixed non-standard setups — no other code path needs to change.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test --prefix server -- room`
Expected: PASS (27 tests — the 23 from before this plan, plus these 4 new ones)

- [ ] **Step 6: Run the full server suite**

Run: `npm test --prefix server`
Expected: all passing, including `server/test/integration.test.ts` and `server/test/variantApi.test.ts` (both unmodified by this task).

- [ ] **Step 7: Commit**

```bash
git add server/src/app.ts server/src/room.ts server/test/room.test.ts
git commit -m "feat(server): support Atomic/Antichess/RacingKings/Horde and expose startFen on every snapshot"
```

---

### Task 2: Client — generalize captured-material computation to use the game's actual starting position

**Files:**
- Modify: `client/src/capturedPieces.ts` (full rewrite)
- Modify: `client/test/capturedPieces.test.ts` (full rewrite)

**Interfaces:**
- Produces: `computeCapturedPieces(fen: string, startFen: string): CapturedPieces` — breaking signature change from the previous `(fen: string)`. `Role`/`CapturedPieces` types unchanged. Used by `client/src/game.ts` (Task 3).

- [ ] **Step 1: Write the failing tests**

```typescript
// client/test/capturedPieces.test.ts
import { describe, it, expect } from 'vitest';
import { computeCapturedPieces } from '../src/capturedPieces.js';

const STANDARD_START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('computeCapturedPieces', () => {
  it('reports no captures for the starting position', () => {
    const result = computeCapturedPieces(STANDARD_START, STANDARD_START);
    expect(result.capturedByWhite).toEqual([]);
    expect(result.capturedByBlack).toEqual([]);
  });

  it('attributes a missing black pawn to captures made by white', () => {
    // Position after 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6 4.Qxf7# (Scholar's mate) —
    // black is missing the f7 pawn, captured by white's queen (now on f7).
    const result = computeCapturedPieces(
      'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4',
      STANDARD_START
    );
    expect(result.capturedByWhite).toEqual(['pawn']);
    expect(result.capturedByBlack).toEqual([]);
  });

  it('attributes missing white pawns and a missing black rook independently', () => {
    // Black's h8 rook and white's a2/h2 pawns are missing; every other piece
    // stays on its original square (a constructed test position, not a real game).
    const fen = 'rnbqkbn1/pppppppp/8/8/8/8/1PPPPPP1/RNBQKBNR w KQq - 0 1';
    const result = computeCapturedPieces(fen, STANDARD_START);
    expect(result.capturedByBlack.sort()).toEqual(['pawn', 'pawn'].sort());
    expect(result.capturedByWhite).toEqual(['rook']);
  });

  it('uses the actual starting position as the baseline, not a hardcoded standard count', () => {
    // A constructed "horde-like" starting position: white has 24 pawns and no
    // other pieces, black has the standard army. This is NOT chessops' real
    // Horde starting FEN (which has a specific, non-uniform pawn arrangement) —
    // it's a synthetic-but-well-formed fixture purely to prove the function
    // computes its baseline from `startFen`, not from a hardcoded 8-pawn
    // assumption (which would silently show zero captured pawns here, since
    // 24 present pawns is already more than a hardcoded baseline of 8).
    const hordeLikeStart = 'rnbqkbnr/pppppppp/8/8/PPPPPPPP/PPPPPPPP/PPPPPPPP/8 w - - 0 1';
    const afterSomeCaptures = 'r1bqkbnr/pppppppp/8/8/1PPPPPP1/PPPPPPPP/PPPPPPPP/8 w - - 0 1';
    const result = computeCapturedPieces(afterSomeCaptures, hordeLikeStart);
    expect(result.capturedByBlack.sort()).toEqual(['pawn', 'pawn'].sort());
    expect(result.capturedByWhite).toEqual(['knight']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --prefix client -- capturedPieces`
Expected: FAIL — `computeCapturedPieces` currently takes only one argument; calling it with two will be a TypeScript error at minimum, and the 4th test doesn't exist yet regardless.

- [ ] **Step 3: Rewrite the implementation**

```typescript
// client/src/capturedPieces.ts
export type Role = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';

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

function countPieces(boardPart: string): { white: Record<Role, number>; black: Record<Role, number> } {
  const white = emptyCounts();
  const black = emptyCounts();
  for (const ch of boardPart) {
    const role = FEN_CHAR_TO_ROLE[ch.toLowerCase()];
    if (!role) continue;
    if (ch === ch.toLowerCase()) black[role] += 1;
    else white[role] += 1;
  }
  return { white, black };
}

function missingPieces(starting: Record<Role, number>, present: Record<Role, number>): Role[] {
  const list: Role[] = [];
  for (const role of Object.keys(starting) as Role[]) {
    const missing = Math.max(0, starting[role] - present[role]);
    for (let i = 0; i < missing; i++) list.push(role);
  }
  return list;
}

export function computeCapturedPieces(fen: string, startFen: string): CapturedPieces {
  const current = countPieces(fen.split(' ')[0]);
  const starting = countPieces(startFen.split(' ')[0]);

  return {
    capturedByWhite: missingPieces(starting.black, current.black),
    capturedByBlack: missingPieces(starting.white, current.white),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --prefix client -- capturedPieces`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/capturedPieces.ts client/test/capturedPieces.test.ts
git commit -m "feat(client): compute captured material against each game's actual starting position"
```

---

### Task 3: Client — update `game.ts`'s call site and variant labels

**Files:**
- Modify: `client/src/game.ts`

**Interfaces:**
- Consumes: `computeCapturedPieces(fen, startFen)` (Task 2, new signature); `state.startFen` (Task 1, new field on every `state` broadcast).
- No automated test for this file (DOM-heavy) — verified via typecheck now and manual verification later (Task 6).

- [ ] **Step 1: Update `renderCaptured`'s call site**

Find this line in `client/src/game.ts`:

```typescript
  const { capturedByWhite, capturedByBlack } = computeCapturedPieces(state.fen);
```

Replace with:

```typescript
  const { capturedByWhite, capturedByBlack } = computeCapturedPieces(state.fen, state.startFen);
```

- [ ] **Step 2: Extend `variantLabel`**

Find this function:

```typescript
function variantLabel(state: any): string {
  if (state.chess960) return 'Chess960';
  if (state.variant === '3check') return '三check';
  if (state.variant === 'kingofthehill') return 'King of the Hill';
  return '标准';
}
```

Replace with:

```typescript
function variantLabel(state: any): string {
  if (state.chess960) return 'Chess960';
  if (state.variant === '3check') return '三check';
  if (state.variant === 'kingofthehill') return 'King of the Hill';
  if (state.variant === 'atomic') return 'Atomic';
  if (state.variant === 'antichess') return 'Antichess';
  if (state.variant === 'racingkings') return 'Racing Kings';
  if (state.variant === 'horde') return 'Horde';
  return '标准';
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck --prefix client`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add client/src/game.ts
git commit -m "feat(client): pass startFen to captured-material computation; add 4 new variant labels"
```

---

### Task 4: Client — extend the home page variant picker

**Files:**
- Modify: `client/public/index.html`

**Interfaces:**
- Produces: 4 new `variant` values sendable from the home page's create-game form, consumed by Task 1's server-side parsing.
- No automated test (thin DOM, matching the existing pattern) — `main.ts` needs no changes, it already reads `variantSelect.value` generically.

- [ ] **Step 1: Add 4 more options to the variant select**

Find this block in `client/public/index.html`:

```html
      <label>
        玩法
        <select id="variant">
          <option value="chess">标准</option>
          <option value="chess960">Chess960</option>
          <option value="3check">三check</option>
          <option value="kingofthehill">King of the Hill</option>
        </select>
      </label>
```

Replace with:

```html
      <label>
        玩法
        <select id="variant">
          <option value="chess">标准</option>
          <option value="chess960">Chess960</option>
          <option value="3check">三check</option>
          <option value="kingofthehill">King of the Hill</option>
          <option value="atomic">Atomic</option>
          <option value="antichess">Antichess</option>
          <option value="racingkings">Racing Kings</option>
          <option value="horde">Horde</option>
        </select>
      </label>
```

- [ ] **Step 2: Commit**

```bash
git add client/public/index.html
git commit -m "feat(client): add Atomic/Antichess/RacingKings/Horde to the home page variant picker"
```

---

### Task 5: Client — extend history list variant labels

**Files:**
- Modify: `client/src/games.ts`

**Interfaces:**
- No new interfaces — this task only extends an existing lookup table.
- No automated test for this file (DOM-heavy) — verified via typecheck and manual verification (Task 6).

- [ ] **Step 1: Extend `VARIANT_LABELS`**

Find this block in `client/src/games.ts`:

```typescript
const VARIANT_LABELS: Record<string, string> = {
  chess: '标准',
  chess960: 'Chess960',
  '3check': '三check',
  kingofthehill: 'King of the Hill',
};
```

Replace with:

```typescript
const VARIANT_LABELS: Record<string, string> = {
  chess: '标准',
  chess960: 'Chess960',
  '3check': '三check',
  kingofthehill: 'King of the Hill',
  atomic: 'Atomic',
  antichess: 'Antichess',
  racingkings: 'Racing Kings',
  horde: 'Horde',
};
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --prefix client`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add client/src/games.ts
git commit -m "feat(client): add Atomic/Antichess/RacingKings/Horde labels to history list"
```

---

### Task 6: Full regression and manual verification of all 4 variants

**Files:** None created or modified — this task verifies Tasks 1–5.

**Interfaces:** None (verification only).

- [ ] **Step 1: Run the full server test suite**

Run: `npm test --prefix server`
Expected: all passing (27 room tests + the rest, matching Task 1's count).

- [ ] **Step 2: Run the full client test suite**

Run: `npm test --prefix client`
Expected: all passing (clock/wsClient/invitePanel/pgnReplay + 4 capturedPieces tests, matching Task 2's count).

- [ ] **Step 3: Typecheck the client**

Run: `npm run typecheck --prefix client`
Expected: clean.

- [ ] **Step 4: Build and start the app**

```bash
npm run build --prefix client
npm run build --prefix server
mkdir -p data
PORT=3800 LUCHESS_DB_PATH=$(pwd)/data/games.sqlite node server/dist/index.js
```
Run as a background process; confirm the "listening" log line; use `http://localhost:3800`; kill it when done.

- [ ] **Step 5: Manual verification — budget tool calls carefully**

Prior long-running manual-verification tasks in this project have taken 20-40 minutes covering multiple variants; that's expected here too given there are 4 variants to check. Prioritize the accessibility-tree snapshot tool over screenshots; take a screenshot only when specifically confirming something visual (a variant's distinctive board layout, or a captured-material display with many icons for Horde). Use two browser tabs for two players. If running low on budget partway through, stop and report what's been verified rather than continuing silently.

Verify, in order:

1. **Atomic**: create a game with 玩法=Atomic. Play a capture (e.g. an early pawn or piece trade) and confirm the resulting board reflects an explosion (pieces around the capture square disappearing, not just the captured piece) — take one screenshot to confirm visually. Confirm variant label shows "Atomic".
2. **Antichess**: create a game with 玩法=Antichess. If a capture is available on the first move for either side, confirm the UI only allows that capture (mandatory-capture rule enforced by chessops server-side — dragging a non-capturing piece elsewhere should be rejected if a capture was available). Confirm variant label shows "Antichess".
3. **Racing Kings**: create a game with 玩法=Racing Kings. Take one screenshot of the starting position to confirm both kings start on rank 1 with no pawns anywhere on the board. Confirm variant label shows "Racing Kings".
4. **Horde**: create a game with 玩法=Horde. Take one screenshot of the starting position to confirm white has a large mass of pawns (dramatically more than the normal 8) and black has a standard army. Play one capture where white loses a pawn and confirm the captured-material display shows it correctly (not a crash, not a nonsensical count) — this is the specific regression this plan's Task 2 exists to prevent.
5. **History replay**: visit `/games`. Confirm all 4 just-finished games appear with the correct variant labels (Atomic/Antichess/Racing Kings/Horde). Click the Horde game and confirm replay correctly starts from the horde-shaped position (not the standard starting position) — take one screenshot to confirm.
6. **Console check**: confirm no unexpected console errors on the game page or `/games` page (a harmless favicon 404 is fine).

- [ ] **Step 6: Cleanup**

Kill the background server process when done.

- [ ] **Step 7: Final commit (only if verification required fixes)**

If verification required any code changes, commit them separately with a clear message describing what was fixed. If no fixes were needed, there is nothing to commit for this task.
