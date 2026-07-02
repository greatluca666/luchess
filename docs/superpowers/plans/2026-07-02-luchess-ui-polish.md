# luchess UI Polish + Invite Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace luchess's bare, unstyled UI with a dark, card-based theme (green accent), and add a waiting-state invite panel with a copy-link button so a game creator has an obvious way to share the room with a friend.

**Architecture:** Pure CSS/HTML changes plus one small new pure-logic module (`invitePanel.ts`) consumed by the existing `game.ts`. No protocol, state-machine, or database changes — the invite panel is driven entirely by the `state.status` field already broadcast over WebSocket.

**Tech Stack:** Same as the rest of the client — plain TypeScript, no framework, no new npm dependencies. System font stack (no external font requests).

## Global Constraints

- No new npm dependencies (client or server).
- No changes to `server/src/*`, the WebSocket protocol, or any DOM element `id` already queried by `main.ts`/`game.ts`/`games.ts` (renaming or removing an id would break existing, already-approved code).
- Board itself (chessground brown board + cburnett pieces) stays unchanged — only the surrounding page chrome is restyled.
- Design tokens (from the spec, use these exact values):
  - `--bg: #1a1a1a`, `--card: #242424`, `--border: #333333`, `--text: #e8e8e8`, `--text-muted: #9a9a9a`, `--accent: #629924`, `--accent-hover: #7ab52e`
  - Font: `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` (body), `ui-monospace, SFMono-Regular, Menlo, monospace` (clocks/move list)

---

### Task 1: Invite panel (waiting-state share link)

**Files:**
- Create: `client/src/invitePanel.ts`
- Test: `client/test/invitePanel.test.ts`
- Modify: `client/src/game.ts` (full file shown below)
- Modify: `client/public/game.html`

**Interfaces:**
- Produces: `shouldShowInvitePanel(status: string): boolean` — pure function, `true` iff `status === 'waiting'`. Used by `game.ts`'s `renderInvitePanel`.

- [ ] **Step 1: Write the failing test**

```typescript
// client/test/invitePanel.test.ts
import { describe, it, expect } from 'vitest';
import { shouldShowInvitePanel } from '../src/invitePanel.js';

describe('shouldShowInvitePanel', () => {
  it('shows the panel while waiting for an opponent', () => {
    expect(shouldShowInvitePanel('waiting')).toBe(true);
  });

  it('hides the panel once the game is playing', () => {
    expect(shouldShowInvitePanel('playing')).toBe(false);
  });

  it('hides the panel once the game is finished', () => {
    expect(shouldShowInvitePanel('finished')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix client -- invitePanel`
Expected: FAIL — `Cannot find module '../src/invitePanel.js'`

- [ ] **Step 3: Write the implementation**

```typescript
// client/src/invitePanel.ts
export function shouldShowInvitePanel(status: string): boolean {
  return status === 'waiting';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix client -- invitePanel`
Expected: PASS (3 tests)

- [ ] **Step 5: Add the invite panel markup to `client/public/game.html`**

Replace the file's `<body>` contents with (only the addition of the `invite-panel` block right after the opening `<div class="game-layout">` — everything else in the file is unchanged):

```html
<!doctype html>
<html lang="zh">
<head>
  <meta charset="utf-8" />
  <title>luchess - 对局</title>
  <link rel="stylesheet" href="/style.css" />
  <link rel="stylesheet" href="/chessground/chessground.base.css" />
  <link rel="stylesheet" href="/chessground/chessground.brown.css" />
  <link rel="stylesheet" href="/chessground/chessground.cburnett.css" />
</head>
<body>
  <div class="game-layout">
    <div id="invite-panel" class="invite-panel" hidden>
      <p>等待对手加入... 分享链接给你朋友:</p>
      <div class="invite-row">
        <input id="invite-link" type="text" readonly />
        <button id="copy-invite-btn">复制邀请链接</button>
      </div>
    </div>
    <div class="clock" id="clock-top">--:--</div>
    <div id="board" class="cg-wrap"></div>
    <div class="clock" id="clock-bottom">--:--</div>
    <div class="controls">
      <button id="resign-btn">认输</button>
      <button id="draw-btn">求和</button>
      <button id="undo-btn">悔棋</button>
    </div>
    <div id="offer-banner" class="offer-banner" hidden></div>
    <ol id="move-list" class="move-list"></ol>
  </div>
  <script type="module" src="/game.js"></script>
</body>
</html>
```

- [ ] **Step 6: Update `client/src/game.ts`**

Replace the entire file with:

```typescript
// client/src/game.ts
import { Chessground } from 'chessground';
import type { Key, Dests } from 'chessground/types';
import { Chess } from 'chess.js';
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
let localChess = new Chess();

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

function computeDests(chess: Chess): Dests {
  const dests: Dests = new Map();
  for (const m of chess.moves({ verbose: true })) {
    const from = m.from as Key;
    const to = m.to as Key;
    const list = dests.get(from) ?? [];
    list.push(to);
    dests.set(from, list);
  }
  return dests;
}

function applyState(state: any): void {
  localChess.load(state.fen);
  const turnColor = state.turn === 'white' ? 'white' : 'black';

  ground.set({
    fen: state.fen,
    turnColor,
    orientation: mySeat === 'black' ? 'black' : 'white',
    movable: {
      color: mySeat === 'white' || mySeat === 'black' ? mySeat : undefined,
      dests: mySeat === turnColor ? computeDests(localChess) : new Map(),
    },
    check: localChess.inCheck(),
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
  try {
    await navigator.clipboard.writeText(link);
  } catch {
    inviteLinkInput.select();
  }
  const original = copyInviteBtn.textContent;
  copyInviteBtn.textContent = '已复制!';
  setTimeout(() => {
    copyInviteBtn.textContent = original;
  }, 2000);
});
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck --prefix client`
Expected: clean, no errors

- [ ] **Step 8: Commit**

```bash
git add client/src/invitePanel.ts client/test/invitePanel.test.ts client/src/game.ts client/public/game.html
git commit -m "feat(client): add waiting-state invite panel with copy-link button"
```

---

### Task 2: Dark theme visual redesign

**Files:**
- Modify: `client/public/style.css` (full rewrite)
- Modify: `client/public/index.html`
- Modify: `client/public/game.html`
- Modify: `client/public/games.html`

**Interfaces:**
- Consumes: the `invite-panel`/`invite-link`/`copy-invite-btn` markup added in Task 1 (styled here via the `.invite-panel`/`.invite-row` CSS classes — do not rename or remove those ids).
- Produces: `.page` and `.card` CSS classes used to wrap each page's content; design token custom properties (`--bg`, `--card`, `--border`, `--text`, `--text-muted`, `--accent`, `--accent-hover`) on `:root`.

This task is CSS/HTML only — no `.ts` files change, so there's no TDD cycle. Verification is visual (done in Task 3).

- [ ] **Step 1: Rewrite `client/public/style.css`**

```css
:root {
  --bg: #1a1a1a;
  --card: #242424;
  --border: #333333;
  --text: #e8e8e8;
  --text-muted: #9a9a9a;
  --accent: #629924;
  --accent-hover: #7ab52e;
  --radius: 10px;
}

* {
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: var(--bg);
  color: var(--text);
  margin: 0;
  padding: 2rem 1rem;
}

.page {
  max-width: 640px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

h1 {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text);
  margin: 0 0 0.5rem;
}

.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  padding: 1.5rem;
  width: 100%;
}

.create-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-items: stretch;
}

.create-form label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.9rem;
  color: var(--text-muted);
}

select,
input[type="text"] {
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  font-size: 1rem;
}

select:focus,
input[type="text"]:focus {
  outline: none;
  border-color: var(--accent);
}

button {
  background: transparent;
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.5rem 1rem;
  font-size: 0.95rem;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

button:hover:not(:disabled) {
  border-color: var(--accent);
}

button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

#create-btn,
#copy-invite-btn,
#accept-draw,
#accept-undo {
  background: var(--accent);
  border-color: var(--accent);
  color: #0d1a05;
  font-weight: 600;
}

#create-btn:hover,
#copy-invite-btn:hover,
#accept-draw:hover,
#accept-undo:hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}

a {
  color: var(--accent);
}

.game-layout {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}

.cg-wrap {
  width: 480px;
  height: 480px;
  position: relative;
  margin: 0 auto;
}

.clock {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 2rem;
  font-variant-numeric: tabular-nums;
  color: var(--text);
}

.controls {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
}

.offer-banner,
.invite-panel {
  background: rgba(98, 153, 36, 0.15);
  border: 1px solid var(--accent);
  border-left: 4px solid var(--accent);
  border-radius: 6px;
  padding: 0.75rem 1rem;
  text-align: center;
  width: 100%;
  animation: fade-in 0.2s ease;
}

@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.invite-row {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.invite-row input {
  flex: 1;
}

.move-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  list-style: none;
  padding: 0;
  margin: 0;
  width: 100%;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.9rem;
  color: var(--text-muted);
}

#games-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

#games-list li a {
  display: block;
  padding: 0.75rem 1rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  text-decoration: none;
  color: var(--text);
  transition: border-color 0.15s ease;
}

#games-list li a:hover {
  border-color: var(--accent);
}
```

- [ ] **Step 2: Wrap `client/public/index.html` content in `.page`/`.card`**

Replace the file with:

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
      <button id="create-btn">创建对局</button>
      <p><a href="/games">历史对局</a></p>
    </main>
  </div>
  <script type="module" src="/main.js"></script>
</body>
</html>
```

- [ ] **Step 3: Wrap `client/public/game.html` content in `.page`, add `card` to `.game-layout`**

Replace the file with (same `invite-panel` markup from Task 1, now inside the new wrapper):

```html
<!doctype html>
<html lang="zh">
<head>
  <meta charset="utf-8" />
  <title>luchess - 对局</title>
  <link rel="stylesheet" href="/style.css" />
  <link rel="stylesheet" href="/chessground/chessground.base.css" />
  <link rel="stylesheet" href="/chessground/chessground.brown.css" />
  <link rel="stylesheet" href="/chessground/chessground.cburnett.css" />
</head>
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
      <div class="clock" id="clock-top">--:--</div>
      <div id="board" class="cg-wrap"></div>
      <div class="clock" id="clock-bottom">--:--</div>
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
</html>
```

- [ ] **Step 4: Wrap `client/public/games.html` content in `.page`/`.card`**

Replace the file with:

```html
<!doctype html>
<html lang="zh">
<head>
  <meta charset="utf-8" />
  <title>luchess - 历史对局</title>
  <link rel="stylesheet" href="/style.css" />
  <link rel="stylesheet" href="/chessground/chessground.base.css" />
  <link rel="stylesheet" href="/chessground/chessground.brown.css" />
  <link rel="stylesheet" href="/chessground/chessground.cburnett.css" />
</head>
<body>
  <div class="page">
    <h1>历史对局</h1>
    <div class="card">
      <ul id="games-list"></ul>
      <div id="replay-board" class="cg-wrap"></div>
      <div class="controls">
        <button id="replay-prev">上一步</button>
        <button id="replay-next">下一步</button>
      </div>
    </div>
  </div>
  <script type="module" src="/games.js"></script>
</body>
</html>
```

- [ ] **Step 5: Confirm no logic files changed**

Run: `git diff --stat` and confirm only `client/public/*.html` and `client/public/style.css` are modified in this task (no `.ts` files).

- [ ] **Step 6: Commit**

```bash
git add client/public/style.css client/public/index.html client/public/game.html client/public/games.html
git commit -m "style(client): dark theme redesign with card layout and green accent"
```

---

### Task 3: Build, run, and manual verification

**Files:** None created or modified — this task builds and visually verifies Tasks 1–2.

**Interfaces:** None (verification only).

- [ ] **Step 1: Run the full client test suite**

Run: `npm test --prefix client`
Expected: all tests pass, including the 3 new `invitePanel` tests (existing `clock`/`wsClient` tests unaffected: 10 total).

- [ ] **Step 2: Run the full server test suite (sanity check — nothing here touches the server)**

Run: `npm test --prefix server`
Expected: 33/33 passing, unchanged from before this plan.

- [ ] **Step 3: Build the client**

Run: `npm run build --prefix client`
Expected: succeeds, `client/dist/` regenerated with the updated HTML/CSS/JS.

- [ ] **Step 4: Manual browser verification**

Start the server locally (`npm run build --prefix server && npm start --prefix server`, or reuse an already-running dev instance) and open it in a browser (or via Playwright browser tools). Verify:

1. **Home page**: dark background, green "创建对局" button, card-styled form, selects are styled (not default browser chrome).
2. **Create a game**: navigate to `/game/{roomId}`. While alone in the room (`status: waiting`), the invite panel is visible above the board, showing the current page URL in the readonly input. Click "复制邀请链接" — button text changes to "已复制!" and reverts after ~2 seconds. If running over plain HTTP (non-localhost), confirm the fallback (`inviteLinkInput.select()`) at least selects the text instead of silently failing.
3. **Second player joins** (open the same `/game/{roomId}` URL in a second tab): invite panel disappears on both tabs once `status` becomes `playing`.
4. **Play a move, offer a draw**: offer-banner renders with the new accent-colored card style and fade-in, not the old plain yellow box.
5. **History page**: dark card-styled list of finished games, hover state on list items works, replay board still functions.
6. Confirm no console errors in the browser dev tools on any of the three pages.

If any of these fail, that's a real bug — fix inline before considering this task (and the plan) complete, following systematic-debugging if the cause isn't obvious.

- [ ] **Step 5: Final commit (only if Step 4 required fixes)**

If Step 4 required any code changes, commit them separately with a clear message describing what was fixed. If no fixes were needed, there is nothing to commit for this task.
