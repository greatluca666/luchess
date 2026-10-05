# luchess 中英双语 + Crazyhouse + 暗棋 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make luchess switchable between English and Chinese, and add two new variants: Crazyhouse (drops from a pocket) and Fog of War (hidden information, capture-the-king).

**Architecture:** i18n is a client-only dictionary (`t(key)`) plus `data-i18n` attributes on static HTML and a fixed-position language toggle. Crazyhouse rides on chessops' built-in `crazyhouse` rules; the server only needs a drop-shaped move input, the client a pocket bar. Fog of War is a new pure server module (`fogOfWar.ts`) for pseudo-legal moves / visibility / masking, and `Room.getSnapshot(viewer)` becomes per-seat so hidden information never leaves the server.

**Tech Stack:** TypeScript, Express + ws + better-sqlite3 (server), chessground 9.2 + chessops 0.15 + esbuild (client), vitest (both).

**Spec:** `docs/superpowers/specs/2026-10-05-luchess-bilingual-crazyhouse-fog-design.md`

## Global Constraints

- Languages: only `zh` and `en`. Language choice: `localStorage['luchess.lang']` → else `navigator.language` starting with `zh` → else `en`. Storage access wrapped in try/catch.
- `zh` dictionary is typed `Record<keyof typeof en, string>` (missing key = compile error).
- Variant ids: `crazyhouse`, `fogofwar` (plus the existing 8). Fog uses chessops `'chess'` rules + a `fog` flag on Room/snapshot, exactly like `chess960`.
- Drop message: `{ type: 'move', drop: 'knight', to: 'f3' }`; drop roles are full role names (`pawn|knight|bishop|rook|queen`).
- Fog: win reason `king-captured`; no-moves draw reason `stalemate`; fog history stored as UCI (`e2e4`, castling `e1h1`, promotion `e7e8q`).
- Fog spectators see an empty board and `?` for every move until the game is finished; after it finishes everyone gets the full snapshot.
- No new npm dependencies.
- Run commands from the package dir: `cd server && npx vitest run`, `cd client && npx vitest run`, `npx tsc --noEmit` (client) / `npx tsc --noEmit -p tsconfig.json` (server).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Bilingual UI (zh / en)

**Files:**
- Rewrite: `client/src/i18n.ts`
- Create: `client/src/pageI18n.ts`
- Rewrite: `client/test/i18n.test.ts`
- Modify: `client/public/index.html`, `client/public/game.html`, `client/public/games.html`
- Modify: `client/src/main.ts`, `client/src/game.ts`, `client/src/games.ts`
- Modify: `client/public/style.css` (append)

**Interfaces:**
- Produces (used by Tasks 3 and 6):
  - `type Lang = 'en' | 'zh'`, `type I18nKey`
  - `t(key: I18nKey): string`, `getLang(): Lang`, `setLang(lang: Lang): void` (dispatches `langchange` on `document`)
  - `hasKey(key: string): key is I18nKey`, `detectLang(stored: string | null, navigatorLang: string | undefined): Lang`
  - `variantLabel(id: string): string`, `resultText(result: string | null, reason: string | null): string`, `errorText(message: string): string`
  - `DICTIONARIES: Record<Lang, Record<I18nKey, string>>`
  - `initPageI18n(onChange?: () => void): void` (pageI18n.ts)
  - Keys `variant.crazyhouse`, `variant.crazyhouse.desc`, `variant.fogofwar`, `variant.fogofwar.desc`, `reason.king-captured` exist from this task on.

- [ ] **Step 1: Write the failing test** — replace `client/test/i18n.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  DICTIONARIES,
  detectLang,
  setLang,
  hasKey,
  variantLabel,
  resultText,
  errorText,
} from '../src/i18n.js';

const ALL_VARIANTS = [
  'chess',
  'chess960',
  '3check',
  'kingofthehill',
  'atomic',
  'antichess',
  'racingkings',
  'horde',
  'crazyhouse',
  'fogofwar',
];

describe('i18n', () => {
  // Start every test from English: the initial language comes from the
  // machine's locale, which may well be Chinese.
  beforeEach(() => setLang('en'));

  it('has exactly the same keys in English and Chinese', () => {
    expect(Object.keys(DICTIONARIES.zh).sort()).toEqual(Object.keys(DICTIONARIES.en).sort());
  });

  it('has no empty strings in either language', () => {
    for (const dict of Object.values(DICTIONARIES)) {
      for (const value of Object.values(dict)) expect(value.trim()).not.toBe('');
    }
  });

  it('has a name and a description for every variant', () => {
    for (const id of ALL_VARIANTS) {
      expect(hasKey(`variant.${id}`)).toBe(true);
      expect(hasKey(`variant.${id}.desc`)).toBe(true);
    }
  });

  it('prefers a stored language, then the browser language, then English', () => {
    expect(detectLang('zh', 'en-US')).toBe('zh');
    expect(detectLang('en', 'zh-CN')).toBe('en');
    expect(detectLang(null, 'zh-TW')).toBe('zh');
    expect(detectLang(null, 'en-GB')).toBe('en');
    expect(detectLang('fr', undefined)).toBe('en');
  });

  it('labels variants in the current language and falls back to the raw id', () => {
    expect(variantLabel('kingofthehill')).toBe('King of the Hill');
    setLang('zh');
    expect(variantLabel('fogofwar')).toBe('暗棋');
    expect(variantLabel('not-a-variant')).toBe('not-a-variant');
  });

  it('formats results with a translated reason', () => {
    expect(resultText('1-0', 'checkmate')).toBe('White wins · checkmate');
    setLang('zh');
    expect(resultText('0-1', 'king-captured')).toBe('黑方胜 · 王被吃掉');
    expect(resultText('1/2-1/2', 'some-new-reason')).toBe('和棋 · some-new-reason');
  });

  it('translates known server errors and passes unknown ones through', () => {
    setLang('zh');
    expect(errorText('not your turn')).toBe('还没轮到你');
    expect(errorText('spectators cannot resign')).toBe('观战者不能进行此操作');
    expect(errorText('something unexpected')).toBe('something unexpected');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run test/i18n.test.ts`
Expected: FAIL — `DICTIONARIES` / `detectLang` are not exported.

- [ ] **Step 3: Rewrite `client/src/i18n.ts`**

```ts
// client/src/i18n.ts
// Bilingual (English / Chinese) UI strings. `zh` is typed against `en`'s
// keys, so a key missing from either side is a compile error.

export type Lang = 'en' | 'zh';

const STORAGE_KEY = 'luchess.lang';

const en = {
  'lang.switch': '中文',
  'title.home': 'luchess',
  'title.game': 'luchess - Game',
  'title.history': 'luchess - Game history',

  'home.tagline': 'Play chess with friends — no ads, no sign-up, just share a link and start',
  'home.timeControl': 'Time control',
  'home.unlimited': 'Unlimited',
  'home.custom': 'Custom…',
  'home.customMinutes': 'Custom minutes',
  'home.increment': 'Increment per move',
  'home.side': 'Playing side',
  'home.random': 'Random',
  'home.white': 'White',
  'home.black': 'Black',
  'home.variant': 'Variant',
  'home.create': 'Create game',
  'home.history': 'Game history',

  'variant.chess': 'Standard',
  'variant.chess.desc': 'Classic chess rules — no extra setup needed',
  'variant.chess960': 'Chess960',
  'variant.chess960.desc': 'The back rank is shuffled randomly every game',
  'variant.3check': 'Three-check',
  'variant.3check.desc': 'Check the king three times to win',
  'variant.kingofthehill': 'King of the Hill',
  'variant.kingofthehill.desc': 'Move your king into one of the central four squares to win',
  'variant.atomic': 'Atomic',
  'variant.atomic.desc': 'Captured pieces explode and take nearby units with them',
  'variant.antichess': 'Antichess',
  'variant.antichess.desc': 'Capture is mandatory — the first side to lose all pieces wins',
  'variant.racingkings': 'Racing Kings',
  'variant.racingkings.desc': 'No checks allowed — the first king to reach the 8th rank wins',
  'variant.horde': 'Horde',
  'variant.horde.desc': "White has 36 pawns against black's standard army",
  'variant.crazyhouse': 'Crazyhouse',
  'variant.crazyhouse.desc': 'Captured pieces join your hand — drop them back onto the board',
  'variant.fogofwar': 'Fog of War',
  'variant.fogofwar.desc': 'You only see squares your pieces can reach — capture the king to win',

  'game.waiting': 'Waiting for opponent... Share this link with a friend:',
  'game.copyInvite': 'Copy invite link',
  'game.copied': 'Copied!',
  'game.copiedFallback': 'Selected, press Ctrl+C to copy',
  'game.resign': 'Resign',
  'game.draw': 'Draw',
  'game.undo': 'Undo',
  'game.gameOver': 'Game over',
  'game.opponentOffersDraw': 'Opponent offers a draw',
  'game.opponentRequestsUndo': 'Opponent requests undo',
  'game.accept': 'Accept',
  'game.reject': 'Reject',

  'history.title': 'Game history',
  'history.previous': 'Previous',
  'history.next': 'Next',

  'result.whiteWins': 'White wins',
  'result.blackWins': 'Black wins',
  'result.draw': 'Draw',

  'reason.checkmate': 'checkmate',
  'reason.stalemate': 'stalemate',
  'reason.insufficient-material': 'insufficient material',
  'reason.variant-end': 'variant rule',
  'reason.threefold-repetition': 'threefold repetition',
  'reason.fifty-move': 'fifty-move rule',
  'reason.resignation': 'resignation',
  'reason.draw-agreement': 'draw agreed',
  'reason.timeout': 'time out',
  'reason.king-captured': 'king captured',

  'error.notInProgress': 'The game is not in progress',
  'error.spectator': 'Spectators cannot do that',
  'error.notYourTurn': "It's not your turn",
  'error.illegalMove': 'Illegal move',
  'error.noDrawOffer': 'There is no draw offer to answer',
  'error.noUndoOffer': 'There is no undo request to answer',
  'error.noMoveToUndo': 'There is no move to undo',
} as const;

export type I18nKey = keyof typeof en;

const zh: Record<I18nKey, string> = {
  'lang.switch': 'EN',
  'title.home': 'luchess',
  'title.game': 'luchess - 对局',
  'title.history': 'luchess - 历史对局',

  'home.tagline': '和朋友下国际象棋——无广告、免注册，分享链接就能开始',
  'home.timeControl': '用时',
  'home.unlimited': '不限时',
  'home.custom': '自定义…',
  'home.customMinutes': '自定义分钟数',
  'home.increment': '每步加秒',
  'home.side': '执子',
  'home.random': '随机',
  'home.white': '白方',
  'home.black': '黑方',
  'home.variant': '玩法',
  'home.create': '创建对局',
  'home.history': '历史对局',

  'variant.chess': '标准',
  'variant.chess.desc': '经典国际象棋规则，无需额外设置',
  'variant.chess960': '960 随机开局',
  'variant.chess960.desc': '每局随机打乱底线棋子的排列',
  'variant.3check': '三将',
  'variant.3check.desc': '将军对方三次即获胜',
  'variant.kingofthehill': '山丘之王',
  'variant.kingofthehill.desc': '把王走进中心四格之一即获胜',
  'variant.atomic': '原子棋',
  'variant.atomic.desc': '吃子会爆炸，波及周围的棋子',
  'variant.antichess': '反吃棋',
  'variant.antichess.desc': '能吃必须吃，先输光所有棋子的一方获胜',
  'variant.racingkings': '赛王棋',
  'variant.racingkings.desc': '不允许将军，先把王走到第 8 行的一方获胜',
  'variant.horde': '蜂群棋',
  'variant.horde.desc': '白方 36 个兵对阵黑方完整兵力',
  'variant.crazyhouse': '疯狂屋',
  'variant.crazyhouse.desc': '吃掉的子进入手牌，可以空投回棋盘',
  'variant.fogofwar': '暗棋',
  'variant.fogofwar.desc': '只能看见自己棋子能走到的格子，吃掉对方的王获胜',

  'game.waiting': '等待对手加入…把这个链接发给朋友：',
  'game.copyInvite': '复制邀请链接',
  'game.copied': '已复制！',
  'game.copiedFallback': '已选中，按 Ctrl+C 复制',
  'game.resign': '认输',
  'game.draw': '求和',
  'game.undo': '悔棋',
  'game.gameOver': '对局结束',
  'game.opponentOffersDraw': '对手提议和棋',
  'game.opponentRequestsUndo': '对手请求悔棋',
  'game.accept': '接受',
  'game.reject': '拒绝',

  'history.title': '历史对局',
  'history.previous': '上一步',
  'history.next': '下一步',

  'result.whiteWins': '白方胜',
  'result.blackWins': '黑方胜',
  'result.draw': '和棋',

  'reason.checkmate': '将杀',
  'reason.stalemate': '逼和',
  'reason.insufficient-material': '子力不足',
  'reason.variant-end': '玩法规则判定',
  'reason.threefold-repetition': '三次重复局面',
  'reason.fifty-move': '五十步规则',
  'reason.resignation': '认输',
  'reason.draw-agreement': '双方同意和棋',
  'reason.timeout': '超时',
  'reason.king-captured': '王被吃掉',

  'error.notInProgress': '对局未在进行中',
  'error.spectator': '观战者不能进行此操作',
  'error.notYourTurn': '还没轮到你',
  'error.illegalMove': '不合法的走法',
  'error.noDrawOffer': '没有待回应的和棋提议',
  'error.noUndoOffer': '没有待回应的悔棋请求',
  'error.noMoveToUndo': '没有可以悔的棋',
};

export const DICTIONARIES: Record<Lang, Record<I18nKey, string>> = { en, zh };

export function detectLang(stored: string | null, navigatorLang: string | undefined): Lang {
  if (stored === 'en' || stored === 'zh') return stored;
  return navigatorLang?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

// localStorage can be missing (tests) or throw (blocked site data, some
// private windows) — either way, behave as if nothing was stored.
function readStoredLang(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

let current: Lang = detectLang(readStoredLang(), typeof navigator === 'undefined' ? undefined : navigator.language);

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Not persisted — the choice still applies for this page view.
  }
  if (typeof document !== 'undefined') document.dispatchEvent(new Event('langchange'));
}

export function hasKey(key: string): key is I18nKey {
  return Object.prototype.hasOwnProperty.call(en, key);
}

export function t(key: I18nKey): string {
  return DICTIONARIES[current][key];
}

export function variantLabel(id: string): string {
  const key = `variant.${id}`;
  return hasKey(key) ? t(key) : id;
}

export function resultText(result: string | null, reason: string | null): string {
  const outcome =
    result === '1-0'
      ? t('result.whiteWins')
      : result === '0-1'
        ? t('result.blackWins')
        : result === '1/2-1/2'
          ? t('result.draw')
          : (result ?? '');
  if (!reason) return outcome;
  const reasonKey = `reason.${reason}`;
  return `${outcome} · ${hasKey(reasonKey) ? t(reasonKey) : reason}`;
}

// The server reports errors as fixed English strings (see server/src/room.ts);
// map the known ones to translations and show anything else verbatim.
const ERROR_KEYS: Record<string, I18nKey> = {
  'game is not in progress': 'error.notInProgress',
  'not your turn': 'error.notYourTurn',
  'illegal move': 'error.illegalMove',
  'no pending draw offer for you': 'error.noDrawOffer',
  'no pending undo offer for you': 'error.noUndoOffer',
  'no move to undo': 'error.noMoveToUndo',
};

export function errorText(message: string): string {
  if (message.startsWith('spectators cannot')) return t('error.spectator');
  return Object.prototype.hasOwnProperty.call(ERROR_KEYS, message) ? t(ERROR_KEYS[message]) : message;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run test/i18n.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Create `client/src/pageI18n.ts`**

```ts
// client/src/pageI18n.ts
// DOM side of i18n: fills every [data-i18n] element from the dictionary and
// mounts the fixed 中 / EN toggle. Each page calls initPageI18n() once,
// passing a callback that re-renders its dynamic (JS-built) text.
import { getLang, setLang, t, hasKey } from './i18n.js';

export function applyStaticI18n(): void {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n!;
    if (hasKey(key)) el.textContent = t(key);
  });
  document.documentElement.lang = getLang() === 'zh' ? 'zh-CN' : 'en';
}

export function initPageI18n(onChange?: () => void): void {
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'lang-toggle';
  toggle.addEventListener('click', () => setLang(getLang() === 'zh' ? 'en' : 'zh'));
  document.body.appendChild(toggle);

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

- [ ] **Step 6: Mark up `client/public/index.html`**

Replace the whole `<body>`…`</body>` and the `<title>` with (new: `data-i18n` everywhere, label text wrapped in `<span>` so translating it doesn't wipe the `<select>`, and two new options/tiles for `crazyhouse` and `fogofwar`):

```html
  <title data-i18n="title.home">luchess</title>
```

```html
<body>
  <div class="page page-wide">
    <header class="home-header">
      <h1>luchess</h1>
      <p class="tagline" data-i18n="home.tagline">Play chess with friends — no ads, no sign-up, just share a link and start</p>
    </header>

    <div class="hero">
      <div class="deco-board-outer" aria-hidden="true">
        <div class="deco-board" id="deco-board"></div>
      </div>

      <main class="card create-form">
        <label>
          <span data-i18n="home.timeControl">Time control</span>
          <select id="time-control">
            <option value="0" data-i18n="home.unlimited">Unlimited</option>
            <option value="300000">5+0</option>
            <option value="600000">10+0</option>
            <option value="900000">15+0</option>
            <option value="custom" data-i18n="home.custom">Custom…</option>
          </select>
        </label>
        <div id="custom-time-wrap" class="custom-time-wrap" hidden>
          <label>
            <span data-i18n="home.customMinutes">Custom minutes</span>
            <input type="number" id="custom-time-minutes" min="1" max="180" value="20" />
          </label>
          <label>
            <span data-i18n="home.increment">Increment per move</span>
            <input type="number" id="custom-increment-seconds" min="0" max="60" value="0" />
          </label>
        </div>
        <label>
          <span data-i18n="home.side">Playing side</span>
          <select id="color-pref">
            <option value="random" data-i18n="home.random">Random</option>
            <option value="white" data-i18n="home.white">White</option>
            <option value="black" data-i18n="home.black">Black</option>
          </select>
        </label>
        <label>
          <span data-i18n="home.variant">Variant</span>
          <select id="variant">
            <option value="chess" data-i18n="variant.chess">Standard</option>
            <option value="chess960" data-i18n="variant.chess960">Chess960</option>
            <option value="3check" data-i18n="variant.3check">Three-check</option>
            <option value="kingofthehill" data-i18n="variant.kingofthehill">King of the Hill</option>
            <option value="atomic" data-i18n="variant.atomic">Atomic</option>
            <option value="antichess" data-i18n="variant.antichess">Antichess</option>
            <option value="racingkings" data-i18n="variant.racingkings">Racing Kings</option>
            <option value="horde" data-i18n="variant.horde">Horde</option>
            <option value="crazyhouse" data-i18n="variant.crazyhouse">Crazyhouse</option>
            <option value="fogofwar" data-i18n="variant.fogofwar">Fog of War</option>
          </select>
        </label>
        <button id="create-btn" data-i18n="home.create">Create game</button>
        <p><a href="/games" data-i18n="home.history">Game history</a></p>
      </main>
    </div>

    <div class="variant-grid" id="variant-tiles">
      <button type="button" class="variant-tile" data-value="chess" aria-pressed="true">
        <span class="tile-head"><span class="tag">STD</span><span class="name" data-i18n="variant.chess">Standard</span></span>
        <span class="desc" data-i18n="variant.chess.desc">Classic chess rules — no extra setup needed</span>
      </button>
      <button type="button" class="variant-tile" data-value="chess960">
        <span class="tile-head"><span class="tag">960</span><span class="name" data-i18n="variant.chess960">Chess960</span></span>
        <span class="desc" data-i18n="variant.chess960.desc">The back rank is shuffled randomly every game</span>
      </button>
      <button type="button" class="variant-tile" data-value="3check">
        <span class="tile-head"><span class="tag">+3</span><span class="name" data-i18n="variant.3check">Three-check</span></span>
        <span class="desc" data-i18n="variant.3check.desc">Check the king three times to win</span>
      </button>
      <button type="button" class="variant-tile" data-value="kingofthehill">
        <span class="tile-head"><span class="tag">KH</span><span class="name" data-i18n="variant.kingofthehill">King of the Hill</span></span>
        <span class="desc" data-i18n="variant.kingofthehill.desc">Move your king into one of the central four squares to win</span>
      </button>
      <button type="button" class="variant-tile" data-value="atomic">
        <span class="tile-head"><span class="tag">ATM</span><span class="name" data-i18n="variant.atomic">Atomic</span></span>
        <span class="desc" data-i18n="variant.atomic.desc">Captured pieces explode and take nearby units with them</span>
      </button>
      <button type="button" class="variant-tile" data-value="antichess">
        <span class="tile-head"><span class="tag">ANTI</span><span class="name" data-i18n="variant.antichess">Antichess</span></span>
        <span class="desc" data-i18n="variant.antichess.desc">Capture is mandatory — the first side to lose all pieces wins</span>
      </button>
      <button type="button" class="variant-tile" data-value="racingkings">
        <span class="tile-head"><span class="tag">RACE</span><span class="name" data-i18n="variant.racingkings">Racing Kings</span></span>
        <span class="desc" data-i18n="variant.racingkings.desc">No checks allowed — the first king to reach the 8th rank wins</span>
      </button>
      <button type="button" class="variant-tile" data-value="horde">
        <span class="tile-head"><span class="tag">HORDE</span><span class="name" data-i18n="variant.horde">Horde</span></span>
        <span class="desc" data-i18n="variant.horde.desc">White has 36 pawns against black's standard army</span>
      </button>
      <button type="button" class="variant-tile" data-value="crazyhouse">
        <span class="tile-head"><span class="tag">ZH</span><span class="name" data-i18n="variant.crazyhouse">Crazyhouse</span></span>
        <span class="desc" data-i18n="variant.crazyhouse.desc">Captured pieces join your hand — drop them back onto the board</span>
      </button>
      <button type="button" class="variant-tile" data-value="fogofwar">
        <span class="tile-head"><span class="tag">FOG</span><span class="name" data-i18n="variant.fogofwar">Fog of War</span></span>
        <span class="desc" data-i18n="variant.fogofwar.desc">You only see squares your pieces can reach — capture the king to win</span>
      </button>
    </div>
  </div>
  <script type="module" src="/main.js"></script>
</body>
```

(The server rejects nothing here: until Tasks 2/5 land, choosing the two new tiles just falls back to standard chess server-side, which is the existing unknown-variant behaviour.)

- [ ] **Step 7: Mark up `client/public/game.html`**

Change the title and the static texts, and add an error line under the controls:

```html
  <title data-i18n="title.game">luchess - Game</title>
```

```html
          <p data-i18n="game.waiting">Waiting for opponent... Share this link with a friend:</p>
          <div class="invite-row">
            <input id="invite-link" type="text" readonly />
            <button id="copy-invite-btn" data-i18n="game.copyInvite">Copy invite link</button>
          </div>
```

```html
        <div class="controls">
          <button id="resign-btn" data-i18n="game.resign">Resign</button>
          <button id="draw-btn" data-i18n="game.draw">Draw</button>
          <button id="undo-btn" data-i18n="game.undo">Undo</button>
        </div>
        <div id="error-msg" class="error-msg" hidden></div>
        <div id="offer-banner" class="offer-banner" hidden></div>
```

- [ ] **Step 8: Mark up `client/public/games.html`**

```html
  <title data-i18n="title.history">luchess - Game history</title>
```

```html
    <h1 data-i18n="history.title">Game history</h1>
```

```html
          <button id="replay-prev" data-i18n="history.previous">Previous</button>
          <button id="replay-next" data-i18n="history.next">Next</button>
```

- [ ] **Step 9: Wire `client/src/main.ts`**

Add the import next to the other imports and call it once at the end of the file:

```ts
import { initPageI18n } from './pageI18n.js';
```

```ts
initPageI18n();
```

- [ ] **Step 10: Wire `client/src/games.ts`**

Replace the `VARIANT_LABELS` import with:

```ts
import { variantLabel, resultText } from './i18n.js';
import { initPageI18n } from './pageI18n.js';
```

Replace `loadList()` with a fetch + a re-renderable `renderList()`, and replace the final `loadList();` call:

```ts
let games: any[] = [];

async function loadList(): Promise<void> {
  const res = await fetch('/api/games');
  games = await res.json();
  renderList();
}

function renderList(): void {
  listEl.innerHTML = games
    .map(
      (g: any) =>
        `<li><a href="#" data-id="${g.id}">${g.id} — ${variantLabel(g.variant)} — ${resultText(g.result, g.resultReason)}</a></li>`
    )
    .join('');
  listEl.querySelectorAll('a').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      loadReplay((a as HTMLAnchorElement).dataset.id!);
    })
  );
}
```

```ts
initPageI18n(renderList);
loadList();
```

- [ ] **Step 11: Wire `client/src/game.ts`**

1. Replace `import { GAME_TEXT, VARIANT_LABELS } from './i18n.js';` with:

```ts
import { t, variantLabel, resultText, errorText } from './i18n.js';
import { initPageI18n } from './pageI18n.js';
```

2. Add next to the other element lookups:

```ts
const errorMsgEl = document.getElementById('error-msg')!;
```

3. Add next to the other `let`s:

```ts
// Most recent server state, kept so a language switch can redraw all the
// JS-built text without waiting for the next broadcast.
let lastState: any = null;
let errorTimer: ReturnType<typeof setTimeout> | undefined;
```

4. In the `WsClient` `onMessage`, replace `console.warn('server error:', msg.message);` with `showError(msg.message);` and add:

```ts
function showError(message: string): void {
  errorMsgEl.textContent = errorText(message);
  errorMsgEl.hidden = false;
  clearTimeout(errorTimer);
  errorTimer = setTimeout(() => {
    errorMsgEl.hidden = true;
  }, 3000);
}
```

5. Replace the old `variantLabel(state)` function with:

```ts
// Snapshot variant id as the history page and i18n keys know it: chess960
// is a flag on top of plain 'chess' rules rather than a rules value.
function variantId(state: any): string {
  return state.chess960 ? 'chess960' : state.variant;
}
```

and in `applyState` set the label with `variantLabelEl.textContent = variantLabel(variantId(state));`.

6. First line of `applyState`: `lastState = state;`

7. The game-over banner in `applyState` becomes:

```ts
    offerBanner.textContent = `${t('game.gameOver')}: ${resultText(state.result, state.resultReason)}`;
```

8. In `renderOfferBanner`, replace `GAME_TEXT.opponentOffersDraw` / `.opponentRequestsUndo` / `.accept` / `.reject` with `t('game.opponentOffersDraw')`, `t('game.opponentRequestsUndo')`, `t('game.accept')`, `t('game.reject')`.

9. In the copy-invite handler, drop `const original = copyInviteBtn.textContent;`, use `t('game.copied')` / `t('game.copiedFallback')`, and restore with `copyInviteBtn.textContent = t('game.copyInvite');`.

10. At the end of the file:

```ts
initPageI18n(() => {
  if (lastState) applyState(lastState);
});
```

- [ ] **Step 12: Append styles to `client/public/style.css`**

```css
/* Language switch, fixed in the top-right corner of every page. */
.lang-toggle {
  position: fixed;
  top: 0.75rem;
  right: 0.75rem;
  z-index: 10;
  padding: 0.3rem 0.75rem;
  font-size: 0.85rem;
  background: var(--card);
}

.error-msg {
  color: var(--danger);
  border: 1px solid var(--danger);
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  font-size: 0.9rem;
}
```

- [ ] **Step 13: Verify**

Run: `cd client && npx tsc --noEmit && npx vitest run && npm run build`
Expected: tsc clean, all tests pass, `client build complete`.

- [ ] **Step 14: Commit**

```bash
git add client
git commit -m "feat(client): bilingual zh/en UI with a language toggle"
```

---

### Task 2: Server — Crazyhouse drops

**Files:**
- Modify: `server/src/chessRules.ts`
- Modify: `server/src/room.ts` (move type only)
- Modify: `server/src/wsHandlers.ts`
- Modify: `server/src/app.ts` (variant whitelist)
- Test: `server/test/chessRules.test.ts`, `server/test/room.test.ts`, `server/test/wsHandlers.test.ts`, `server/test/variantApi.test.ts`

**Interfaces:**
- Produces:
  - `type MoveInput = NormalMoveInput | DropMoveInput` with `NormalMoveInput { from: string; to: string; promotion?: string }`, `DropMoveInput { drop: string; to: string }`
  - `toChessopsMove(pos: Position, move: MoveInput): Move | undefined` (chessops `Move` union; `ChessopsMove` is deleted)
  - `ResultReason` gains `'king-captured'` (used in Task 4)

- [ ] **Step 1: Write the failing tests**

Append to `server/test/room.test.ts` (inside the `describe('Room', …)` block):

```ts
  it('lets a crazyhouse player drop a pocket piece and records it as N@ SAN', () => {
    const room = new Room(
      'r1', 0, 'white', Date.now,
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[Nn] w KQkq - 0 1', 'crazyhouse'
    );
    room.connect(fakeWs());
    room.connect(fakeWs());
    expect(room.move('white', { drop: 'knight', to: 'e4' }).ok).toBe(true);
    const snapshot = room.getSnapshot();
    expect(snapshot.historySan).toEqual(['N@e4']);
    expect(snapshot.fen.startsWith('rnbqkbnr/pppppppp/8/8/4N3/8/PPPPPPPP/RNBQKBNR[n] b')).toBe(true);
  });

  it('rejects crazyhouse drops of missing pieces, pawns onto the back rank, and onto occupied squares', () => {
    const room = new Room('r1', 0, 'white', Date.now, '4k3/8/8/8/8/8/8/4K3[P] w - - 0 1', 'crazyhouse');
    room.connect(fakeWs());
    room.connect(fakeWs());
    expect(room.move('white', { drop: 'queen', to: 'e4' }).ok).toBe(false);
    expect(room.move('white', { drop: 'pawn', to: 'a8' }).ok).toBe(false);
    expect(room.move('white', { drop: 'pawn', to: 'a1' }).ok).toBe(false);
    expect(room.move('white', { drop: 'pawn', to: 'e1' }).ok).toBe(false);
    expect(room.move('white', { drop: 'king', to: 'a4' }).ok).toBe(false);
    expect(room.move('white', { drop: 'pawn', to: 'a4' }).ok).toBe(true);
  });

  it('puts captured pieces into the capturer\'s crazyhouse pocket', () => {
    const room = new Room('r1', 0, 'white', Date.now, undefined, 'crazyhouse');
    room.connect(fakeWs());
    room.connect(fakeWs());
    room.move('white', { from: 'e2', to: 'e4' });
    room.move('black', { from: 'd7', to: 'd5' });
    room.move('white', { from: 'e4', to: 'd5' });
    expect(room.getSnapshot().fen.split(' ')[0].endsWith('[P]')).toBe(true);
  });
```

Append to `server/test/chessRules.test.ts` (new `describe` at the end of the file; add `import { createGame, toChessopsMove } from '../src/chessRules.js';` if those names are not already imported there):

```ts
describe('toChessopsMove input hardening', () => {
  it('rejects non-string squares instead of throwing', () => {
    const pos = createGame();
    expect(toChessopsMove(pos, { from: 5 as unknown as string, to: 'e4' })).toBeUndefined();
    expect(toChessopsMove(pos, { from: 'e2', to: undefined as unknown as string })).toBeUndefined();
  });

  it('ignores prototype keys as a promotion or drop role', () => {
    const pos = createGame('chess', '4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    expect(toChessopsMove(pos, { from: 'a7', to: 'a8', promotion: '__proto__' })).toEqual({ from: 48, to: 56, promotion: 'queen' });
    expect(toChessopsMove(pos, { drop: '__proto__', to: 'e4' })).toBeUndefined();
  });
});
```

Append to `server/test/wsHandlers.test.ts` (inside the `describe`):

```ts
  it('routes a crazyhouse drop message to room.move as a drop', () => {
    const ws = fakeWs();
    const room = { seatColorFor: () => 'white', move: vi.fn().mockReturnValue({ ok: true }) } as any;
    handleMessage(room, ws, JSON.stringify({ type: 'move', drop: 'knight', to: 'f3' }));
    expect(room.move).toHaveBeenCalledWith('white', { drop: 'knight', to: 'f3' });
  });
```

Append to `server/test/variantApi.test.ts` (inside the `describe`):

```ts
  it('creates a Crazyhouse room whose FEN carries (empty) pockets', async () => {
    const { ws, state } = await createAppAndConnect('crazyhouse');
    expect(state.variant).toBe('crazyhouse');
    expect(state.fen.split(' ')[0].endsWith('[]')).toBe(true);
    ws.close();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run`
Expected: FAIL — type errors on `{ drop: … }` inputs / drop tests return `ok: false`; the crazyhouse API test gets `variant: 'chess'`.

- [ ] **Step 3: Update `server/src/chessRules.ts`**

Change the imports and the input types (the local `Role` type and `ChessopsMove` interface are replaced by chessops' own):

```ts
import { defaultPosition, setupPosition } from 'chessops/variant';
import type { Move, Role, Rules } from 'chessops/types';
import type { Position } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseSquare, squareRank } from 'chessops/util';
import { makeSan } from 'chessops/san';

export interface NormalMoveInput {
  from: string;
  to: string;
  promotion?: string;
}

// Crazyhouse: place a piece from the mover's pocket onto an empty square.
export interface DropMoveInput {
  drop: string;
  to: string;
}

export type MoveInput = NormalMoveInput | DropMoveInput;
```

Add `'king-captured'` to `ResultReason`:

```ts
export type ResultReason =
  | 'checkmate'
  | 'stalemate'
  | 'insufficient-material'
  | 'variant-end'
  | 'threefold-repetition'
  | 'fifty-move'
  | 'king-captured';
```

Replace `promotionRole` and `toChessopsMove`:

```ts
const DROP_ROLES = new Set<string>(['pawn', 'knight', 'bishop', 'rook', 'queen']);

function promotionRole(letter: string | undefined): Role {
  // hasOwnProperty, not a plain lookup: `letter` comes off the websocket and
  // '__proto__' would otherwise resolve to Object.prototype.
  return letter !== undefined && Object.prototype.hasOwnProperty.call(PROMOTION_ROLES, letter)
    ? PROMOTION_ROLES[letter]
    : 'queen';
}
```

```ts
export function toChessopsMove(pos: Position, move: MoveInput): Move | undefined {
  // Inputs come straight off the websocket, so their shape can't be trusted
  // — parseSquare() throws on anything that isn't a string.
  if (typeof move.to !== 'string') return undefined;
  const to = parseSquare(move.to);
  if (to === undefined) return undefined;
  if ('drop' in move) {
    return DROP_ROLES.has(move.drop) ? { role: move.drop as Role, to } : undefined;
  }
  if (typeof move.from !== 'string') return undefined;
  const from = parseSquare(move.from);
  if (from === undefined) return undefined;
  // Only attach a promotion role when the move is actually a pawn reaching
  // the last rank. The real client always sends `promotion: 'q'` on every
  // move (even ordinary ones like e2-e4), so we cannot rely on the caller's
  // input to decide this — it must be derived from the position itself.
  if (isPromotionMove(pos, from, to)) {
    return { from, to, promotion: promotionRole(move.promotion) };
  }
  return { from, to };
}
```

`applyMove` keeps its body; chessops' `isLegal` already handles drops (pocket count, pawn back rank, empty target).

- [ ] **Step 4: Update `server/src/room.ts` move type**

```ts
import { applyMove, createGame, toChessopsMove, type MoveInput } from './chessRules.js';
import type { Move, Rules } from 'chessops/types';
```

(remove the separate `import type { Rules } from 'chessops/types';` line) and change the field:

```ts
  private moves: Move[] = [];
```

- [ ] **Step 5: Update `server/src/wsHandlers.ts`**

```ts
    case 'move':
      result = room.move(
        seat,
        typeof msg.drop === 'string'
          ? { drop: msg.drop, to: msg.to }
          : { from: msg.from, to: msg.to, promotion: msg.promotion }
      );
      break;
```

- [ ] **Step 6: Update the whitelist in `server/src/app.ts`**

```ts
    } else if (
      variant === '3check' ||
      variant === 'kingofthehill' ||
      variant === 'atomic' ||
      variant === 'antichess' ||
      variant === 'racingkings' ||
      variant === 'horde' ||
      variant === 'crazyhouse'
    ) {
      rules = variant;
    }
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd server && npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: tsc clean, all tests pass.

- [ ] **Step 8: Commit**

```bash
git add server
git commit -m "feat(server): Crazyhouse variant with pocket drops; harden move input parsing"
```

---

### Task 3: Client — Crazyhouse pocket bar and drops

**Files:**
- Create: `client/src/pockets.ts`, `client/test/pockets.test.ts`
- Modify: `client/src/boardFromFen.ts`, `client/test/boardFromFen.test.ts`
- Modify: `client/src/game.ts`
- Modify: `client/public/style.css` (append)

**Interfaces:**
- Consumes: `t`, `variantLabel` etc. from Task 1; server drop message from Task 2.
- Produces: `type DropRole`, `DROP_ROLES: DropRole[]`, `type PocketCounts`, `type Pockets`, `parsePockets(fen: string): Pockets`, `dropDestKeys(pos: Position, role: DropRole): string[]`. In game.ts: `applyStandardBoard(state, turnColor)` and `renderCaptured(state)` (Task 6 extends both).

- [ ] **Step 1: Write the failing tests**

`client/test/pockets.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { setupPosition } from 'chessops/variant';
import { parseFen } from 'chessops/fen';
import { parsePockets, dropDestKeys } from '../src/pockets.js';

describe('parsePockets', () => {
  it('counts each side\'s pocket pieces from the bracketed FEN section', () => {
    const pockets = parsePockets('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[NPPq] w KQkq - 0 1');
    expect(pockets.white).toEqual({ pawn: 2, knight: 1, bishop: 0, rook: 0, queen: 0 });
    expect(pockets.black).toEqual({ pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 1 });
  });

  it('returns empty pockets for an empty bracket or a FEN without pockets', () => {
    const empty = { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0 };
    expect(parsePockets('8/8/8/8/8/8/8/8[] w - - 0 1')).toEqual({ white: empty, black: empty });
    expect(parsePockets('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toEqual({ white: empty, black: empty });
  });
});

describe('dropDestKeys', () => {
  const pos = setupPosition('crazyhouse', parseFen('4k3/8/8/8/8/8/8/4K3[PN] w - - 0 1').unwrap()).unwrap();

  it('allows a piece on every empty square', () => {
    const keys = dropDestKeys(pos, 'knight');
    expect(keys).toHaveLength(62);
    expect(keys).toContain('a1');
  });

  it('keeps pawns off the first and last ranks', () => {
    const keys = dropDestKeys(pos, 'pawn');
    expect(keys).toHaveLength(48);
    expect(keys).not.toContain('a1');
    expect(keys).not.toContain('h8');
    expect(keys).toContain('a2');
  });
});
```

Append to `client/test/boardFromFen.test.ts` (inside its `describe`):

```ts
  it('ignores a crazyhouse pocket section and promoted-piece markers', () => {
    const grid = boardGridFromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKQ~NR[Nn]');
    expect(grid).toHaveLength(8);
    grid.forEach((row) => expect(row).toHaveLength(8));
    expect(grid[7][5]).toEqual({ role: 'queen', color: 'white' });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd client && npx vitest run test/pockets.test.ts test/boardFromFen.test.ts`
Expected: FAIL — `pockets.js` missing; the bracket test yields extra/undefined squares.

- [ ] **Step 3: Create `client/src/pockets.ts`**

```ts
// client/src/pockets.ts
// Crazyhouse pockets: parse them out of the FEN and work out where a pocket
// piece may be dropped.
import type { Position } from 'chessops/chess';
import { SquareSet } from 'chessops/squareSet';
import { makeSquare } from 'chessops/util';
import type { Role } from './capturedPieces.js';

export type DropRole = Exclude<Role, 'king'>;
export const DROP_ROLES: DropRole[] = ['pawn', 'knight', 'bishop', 'rook', 'queen'];
export type PocketCounts = Record<DropRole, number>;
export interface Pockets {
  white: PocketCounts;
  black: PocketCounts;
}

const CHAR_TO_ROLE: Record<string, DropRole> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen' };

function emptyCounts(): PocketCounts {
  return { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0 };
}

// chessops writes pockets after the board part, lichess-style:
// "rnbqkbnr/.../RNBQKBNR[NPp] w KQkq - 0 1" (uppercase = white's pocket).
export function parsePockets(fen: string): Pockets {
  const pockets: Pockets = { white: emptyCounts(), black: emptyCounts() };
  const match = fen.split(' ')[0].match(/\[([^\]]*)\]/);
  if (!match) return pockets;
  for (const ch of match[1]) {
    const role = CHAR_TO_ROLE[ch.toLowerCase()];
    if (!role) continue;
    pockets[ch === ch.toLowerCase() ? 'black' : 'white'][role] += 1;
  }
  return pockets;
}

// chessops' dropDests() is per side, not per piece: with any non-pawn in the
// pocket it includes the back ranks, which pawns may never be dropped on.
export function dropDestKeys(pos: Position, role: DropRole): string[] {
  let squares = pos.dropDests(pos.ctx());
  if (role === 'pawn') squares = squares.diff(SquareSet.backranks());
  return Array.from(squares, (square) => makeSquare(square));
}
```

- [ ] **Step 4: Fix `client/src/boardFromFen.ts`**

```ts
export function boardGridFromFen(fenBoardPart: string): (BoardSquare | null)[][] {
  // Crazyhouse FENs append the pockets in brackets ("...RNBQKBNR[Nn]") and
  // mark promoted pieces with '~' — neither is a square on the board.
  const board = fenBoardPart.split('[')[0];
  return board.split('/').map((rankStr) => {
    const row: (BoardSquare | null)[] = [];
    for (const ch of rankStr) {
      if (/[1-8]/.test(ch)) {
        row.push(...Array(Number(ch)).fill(null));
      } else if (FEN_CHAR_TO_ROLE[ch.toLowerCase()]) {
        row.push({ role: FEN_CHAR_TO_ROLE[ch.toLowerCase()], color: ch === ch.toLowerCase() ? 'black' : 'white' });
      }
    }
    return row;
  });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd client && npx vitest run test/pockets.test.ts test/boardFromFen.test.ts`
Expected: PASS.

- [ ] **Step 6: Pocket UI in `client/src/game.ts`**

1. Imports:

```ts
import type { Key, Dests, MouchEvent, Piece } from 'chessground/types';
import { parsePockets, dropDestKeys, DROP_ROLES, type DropRole, type PocketCounts } from './pockets.js';
```

2. State next to `lastState`:

```ts
// Crazyhouse: the pocket piece currently picked up (click-to-drop mode).
let selectedDrop: DropRole | null = null;
```

3. Chessground events gain drops:

```ts
const ground = Chessground(boardEl, {
  movable: { free: false, color: undefined },
  events: {
    move: (orig: Key, dest: Key) => sendMove(orig, dest),
    dropNewPiece: (piece: Piece, key: Key) => sendDrop(piece.role as DropRole, key),
  },
});
```

```ts
function sendDrop(role: DropRole, key: Key): void {
  ws.send({ type: 'move', drop: role, to: key });
}
```

4. Helpers:

```ts
function isPlayer(): boolean {
  return mySeat === 'white' || mySeat === 'black';
}

function dropHighlights(): Map<Key, string> {
  const custom = new Map<Key, string>();
  if (selectedDrop) {
    for (const key of dropDestKeys(localChess, selectedDrop)) custom.set(key as Key, 'drop-dest');
  }
  return custom;
}
```

5. Split the board part of `applyState` into `applyStandardBoard` and `flashAtomicExplosion`, and reset the drop selection whenever the move count or turn changes (the server re-broadcasts every second for the clocks, so a plain "on every state" reset would drop the selection mid-click). `applyState` becomes:

```ts
function applyState(state: any): void {
  lastState = state;
  const prevPosition = previousPosition;
  const prevMoveCount = previousMoveCount;
  const turnColor = state.turn === 'white' ? 'white' : 'black';
  if (state.historySan.length !== prevMoveCount || mySeat !== turnColor || state.status !== 'playing') {
    selectedDrop = null;
  }

  localChess = setupPosition(state.variant, parseFen(state.fen).unwrap()).unwrap();
  applyStandardBoard(state, turnColor);
  flashAtomicExplosion(state, prevPosition, prevMoveCount);
  previousPosition = localChess;
  previousMoveCount = state.historySan.length;

  clockTop.textContent = formatClock(mySeat === 'black' ? state.clocks.white : state.clocks.black);
  clockBottom.textContent = formatClock(mySeat === 'black' ? state.clocks.black : state.clocks.white);

  variantLabelEl.textContent = variantLabel(variantId(state));
  renderCaptured(state);

  moveListEl.innerHTML = buildMoveRows(state.historySan)
    .map((row) => `<li><span class="move-num">${row.num}.</span><span>${row.white}</span><span>${row.black}</span></li>`)
    .join('');

  renderInvitePanel(state);
  renderOfferBanner(state);
  renderControls(state);

  if (state.status === 'finished') {
    offerBanner.hidden = false;
    offerBanner.textContent = `${t('game.gameOver')}: ${resultText(state.result, state.resultReason)}`;
  }
}

function applyStandardBoard(state: any, turnColor: 'white' | 'black'): void {
  const dropPiece = selectedDrop && isPlayer() ? { color: mySeat as 'white' | 'black', role: selectedDrop } : undefined;
  ground.set({
    fen: state.fen,
    turnColor,
    orientation: mySeat === 'black' ? 'black' : 'white',
    movable: {
      color: isPlayer() ? (mySeat as 'white' | 'black') : undefined,
      dests: mySeat === turnColor ? computeDests(localChess) : new Map(),
    },
    premovable: { enabled: true },
    check: localChess.isCheck(),
    highlight: { custom: dropHighlights() },
    dropmode: dropPiece ? { active: true, piece: dropPiece } : { active: false },
    drawable: {
      // King of the Hill: highlight the four center squares so players can
      // see at a glance where they need to march their king.
      autoShapes:
        state.variant === 'kingofthehill' ? KOTH_CENTER_SQUARES.map((orig) => ({ orig, brush: 'green' })) : [],
    },
  });
  // Queuing a move while it's not your turn (chessground calls this a
  // "premove") only stores it in premovable.current — the host app must
  // explicitly ask chessground to play it once dests are updated for the
  // new turn, or it just sits there forever.
  ground.playPremove();
}

// Atomic: flash an explosion effect over whichever squares just lost a
// piece — the capturing piece and everything non-pawn in the blast
// radius — by diffing the position against the one before this move.
function flashAtomicExplosion(state: any, prevPosition: Position | null, prevMoveCount: number): void {
  if (state.variant !== 'atomic' || !prevPosition || state.historySan.length <= prevMoveCount) return;
  const lastSan = state.historySan[state.historySan.length - 1];
  const move = parseSan(prevPosition, lastSan);
  if (move && isNormal(move)) {
    const keys = explodedSquares(
      makeFen(prevPosition.toSetup()).split(' ')[0],
      state.fen.split(' ')[0],
      makeSquare(move.from)
    );
    if (keys.length > 0) ground.explode(keys as Key[]);
  }
}
```

6. Pockets replace the captured row in crazyhouse — put this at the top of `renderCaptured`:

```ts
function renderCaptured(state: any): void {
  if (state.variant === 'crazyhouse') {
    renderPockets(state);
    return;
  }
  // …existing captured-pieces body unchanged…
}

function renderPockets(state: any): void {
  const pockets = parsePockets(state.fen);
  const bottomColor = mySeat === 'black' ? 'black' : 'white';
  const topColor = bottomColor === 'white' ? 'black' : 'white';
  const canDrop = mySeat === bottomColor && state.status === 'playing' && state.turn === mySeat;
  capturedTop.innerHTML = pocketHtml(topColor, pockets[topColor], false);
  capturedBottom.innerHTML = pocketHtml(bottomColor, pockets[bottomColor], canDrop);
}

function pocketHtml(color: 'white' | 'black', counts: PocketCounts, interactive: boolean): string {
  return DROP_ROLES.map((role) => {
    const count = counts[role];
    const classes = ['pocket-piece'];
    if (count === 0) classes.push('empty');
    if (interactive && selectedDrop === role) classes.push('selected');
    const inner = `${pieceIconHtml(color, role)}<span class="pocket-count">${count}</span>`;
    return interactive && count > 0
      ? `<button type="button" class="${classes.join(' ')}" data-role="${role}">${inner}</button>`
      : `<span class="${classes.join(' ')}">${inner}</span>`;
  }).join('');
}
```

7. Pick-up handling. A press both selects the piece (so a later tap on a square drops it, via chessground's dropmode) and starts a drag (so it can be dragged straight onto the board). Pressing the selected piece again cancels.

```ts
function onPocketPress(e: MouseEvent | TouchEvent): void {
  if (e instanceof MouseEvent && e.button !== 0) return;
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button.pocket-piece');
  if (!btn || !lastState || !isPlayer()) return;
  e.preventDefault();
  const role = btn.dataset.role as DropRole;
  if (selectedDrop === role) {
    selectedDrop = null;
    applyState(lastState);
    return;
  }
  selectedDrop = role;
  applyState(lastState);
  ground.dragNewPiece({ color: mySeat as 'white' | 'black', role }, e as unknown as MouchEvent);
}

capturedBottom.addEventListener('mousedown', onPocketPress);
capturedBottom.addEventListener('touchstart', onPocketPress, { passive: false });
```

- [ ] **Step 7: Append pocket styles to `client/public/style.css`**

```css
/* Crazyhouse pocket bar (replaces the captured-pieces row). */
.pocket-piece {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.2rem;
  height: 2.2rem;
  padding: 0;
  margin: 0 0.1rem;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
}

button.pocket-piece {
  cursor: grab;
  touch-action: none;
}

button.pocket-piece:hover:not(:disabled) {
  border-color: var(--accent);
  background: transparent;
}

.pocket-piece.selected {
  border-color: var(--accent);
  background: rgba(127, 174, 0, 0.2);
}

.pocket-piece.empty {
  opacity: 0.3;
}

.pocket-piece .piece-icon {
  width: 1.8rem;
  height: 1.8rem;
}

.pocket-count {
  position: absolute;
  right: -0.2rem;
  bottom: -0.2rem;
  min-width: 1rem;
  padding: 0 0.25rem;
  font-size: 0.7rem;
  font-weight: 700;
  line-height: 1.2;
  text-align: center;
  color: var(--text);
  background: var(--bg);
  border-radius: 999px;
}

cg-board square.drop-dest {
  background: radial-gradient(rgba(20, 85, 30, 0.5) 22%, rgba(0, 0, 0, 0) 23%);
}
```

- [ ] **Step 8: Verify**

Run: `cd client && npx tsc --noEmit && npx vitest run && npm run build`
Expected: clean / pass / built.

- [ ] **Step 9: Commit**

```bash
git add client
git commit -m "feat(client): Crazyhouse pocket bar with drag and click-to-drop"
```

---

### Task 4: Server — Fog of War rules module

**Files:**
- Create: `server/src/fogOfWar.ts`
- Test: `server/test/fogOfWar.test.ts`

**Interfaces:**
- Consumes: `GameOverResult` from `chessRules.ts` (with `'king-captured'` from Task 2).
- Produces:
  - `fogMoves(pos: Position): NormalMove[]` — pseudo-legal, castling encoded king→rook square
  - `fogDests(pos: Position): Record<string, string[]>` — client dests, castling offered on both the rook square and the king's two-square target
  - `visibleSquares(pos: Position, color: Color): SquareSet`
  - `maskedFen(pos: Position, color: Color): string`
  - `fogOutcome(pos: Position, mover: Color): GameOverResult`

- [ ] **Step 1: Write the failing test** — `server/test/fogOfWar.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Castles, Chess, type Position } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { makeUci, parseSquare, parseUci } from 'chessops/util';
import { fogMoves, fogDests, visibleSquares, maskedFen, fogOutcome } from '../src/fogOfWar.js';

function position(fen: string): Position {
  return Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
}

function ucis(pos: Position): string[] {
  return fogMoves(pos).map(makeUci);
}

function sq(name: string): number {
  return parseSquare(name)!;
}

describe('fogMoves', () => {
  it('lets the king step onto attacked squares', () => {
    const moves = ucis(position('4k3/8/8/8/8/8/3r4/4K3 w - - 0 1'));
    expect(moves).toEqual(expect.arrayContaining(['e1d1', 'e1e2', 'e1f2', 'e1d2']));
  });

  it('lets a pinned piece leave the pin line', () => {
    expect(ucis(position('4k3/4r3/8/8/8/8/4B3/4K3 w - - 0 1'))).toContain('e2d3');
  });

  it('allows castling out of and through attacked squares', () => {
    const moves = ucis(position('4r1k1/8/8/8/8/8/8/R3K2R w KQ - 0 1'));
    expect(moves).toEqual(expect.arrayContaining(['e1h1', 'e1a1']));
  });

  it('does not castle through pieces', () => {
    const moves = ucis(position('r3k2r/8/8/8/8/8/8/RN2K1NR w KQkq - 0 1'));
    expect(moves).not.toContain('e1h1');
    expect(moves).not.toContain('e1a1');
  });

  it('includes en passant', () => {
    expect(ucis(position('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2'))).toContain('e5d6');
  });

  it('expands promotions into all four pieces', () => {
    const moves = ucis(position('4k3/P7/8/8/8/8/8/4K3 w - - 0 1'));
    expect(moves).toEqual(expect.arrayContaining(['a7a8q', 'a7a8r', 'a7a8b', 'a7a8n']));
    expect(moves).not.toContain('a7a8');
  });
});

describe('fogDests', () => {
  it('offers castling on both the rook square and the king\'s two-square target', () => {
    expect(fogDests(position('4k3/8/8/8/8/8/8/4K2R w K - 0 1')).e1).toEqual(expect.arrayContaining(['h1', 'g1']));
  });
});

describe('visibleSquares', () => {
  it('shows own pieces plus every square they can reach — 32 at the start, for either side', () => {
    const pos = Chess.default();
    const white = visibleSquares(pos, 'white');
    expect(white.size()).toBe(32);
    expect(white.has(sq('e4'))).toBe(true);
    expect(white.has(sq('e7'))).toBe(false);
    const black = visibleSquares(pos, 'black');
    expect(black.size()).toBe(32);
    expect(black.has(sq('e5'))).toBe(true);
    expect(black.has(sq('e2'))).toBe(false);
  });

  it('reveals an enemy piece only when it can be captured', () => {
    const visible = visibleSquares(position('4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1'), 'white');
    expect(visible.has(sq('d5'))).toBe(true);
    expect(visible.has(sq('e8'))).toBe(false);
  });
});

describe('maskedFen', () => {
  it('removes enemy pieces the viewer cannot see', () => {
    expect(maskedFen(position('4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1'), 'white')).toBe('8/8/8/3p4/4P3/8/8/4K3 w - - 0 1');
  });

  it('keeps only the viewer\'s own castling rights and no en passant square', () => {
    expect(maskedFen(Chess.default(), 'white')).toBe('8/8/8/8/8/8/PPPPPPPP/RNBQKBNR w KQ - 0 1');
    expect(maskedFen(position('rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3'), 'black').split(' ').slice(2, 4)).toEqual(['kq', '-']);
  });
});

describe('fogOutcome', () => {
  it('awards the game to whoever captures the king', () => {
    const pos = Chess.default();
    for (const uci of ['e2e3', 'f7f6', 'd1h5', 'a7a6', 'h5e8']) pos.play(parseUci(uci)!);
    expect(fogOutcome(pos, 'white')).toEqual({ gameOver: true, result: '1-0', resultReason: 'king-captured' });
  });

  it('calls it a draw when the side to move has no moves at all', () => {
    // A boxed-in black king and three black pawns that can neither push nor
    // capture — not reachable in a real game (pawns on the first rank), so
    // the board is set directly instead of going through validated setup.
    const pos = Chess.default();
    pos.board = parseFen('7K/8/8/8/8/8/pp6/kp6 w - - 0 1').unwrap().board;
    pos.castles = Castles.empty();
    pos.turn = 'black';
    expect(fogMoves(pos)).toEqual([]);
    expect(fogOutcome(pos, 'white')).toEqual({ gameOver: true, result: '1/2-1/2', resultReason: 'stalemate' });
  });

  it('keeps playing otherwise', () => {
    expect(fogOutcome(Chess.default(), 'black')).toEqual({ gameOver: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run test/fogOfWar.test.ts`
Expected: FAIL — cannot find module `../src/fogOfWar.js`.

- [ ] **Step 3: Create `server/src/fogOfWar.ts`**

```ts
// server/src/fogOfWar.ts
// Fog of War (chess.com rules): there is no check — a king may walk into
// attack, stay in it, and castle out of or through it — and the game is won
// by capturing the king. Each side only sees its own pieces plus the
// squares those pieces could move to.
import type { Context, Position } from 'chessops/chess';
import type { Color, NormalMove } from 'chessops/types';
import { SquareSet } from 'chessops/squareSet';
import { makeFen } from 'chessops/fen';
import { kingCastlesTo, makeSquare, opposite } from 'chessops/util';
import type { GameOverResult } from './chessRules.js';

const PROMOTION_ROLES = ['queen', 'rook', 'bishop', 'knight'] as const;

// chessops' dests() only filters for check and pins when the context names a
// king — leaving it undefined yields plain pseudo-legal moves (castling is
// skipped too, so fogMoves() adds it back itself).
const NO_CHECK_CONTEXT: Context = {
  king: undefined,
  blockers: SquareSet.empty(),
  checkers: SquareSet.empty(),
  variantEnd: false,
  mustCapture: false,
};

// Every move for the side to move. Castling is encoded the chessops way:
// king moves onto its own rook's square.
export function fogMoves(pos: Position): NormalMove[] {
  const moves: NormalMove[] = [];
  for (const from of pos.board[pos.turn]) {
    const isPawn = pos.board.pawn.has(from);
    for (const to of pos.dests(from, NO_CHECK_CONTEXT)) {
      if (isPawn && SquareSet.backranks().has(to)) {
        for (const promotion of PROMOTION_ROLES) moves.push({ from, to, promotion });
      } else {
        moves.push({ from, to });
      }
    }
  }
  const king = pos.board.kingOf(pos.turn);
  if (king !== undefined) {
    for (const side of ['a', 'h'] as const) {
      const rook = pos.castles.rook[pos.turn][side];
      if (rook === undefined) continue;
      if (pos.castles.path[pos.turn][side].intersects(pos.board.occupied)) continue;
      moves.push({ from: king, to: rook });
    }
  }
  return moves;
}

// The side to move's dests for chessground. Players drag the king two
// squares to castle, so that target is offered alongside the rook square.
export function fogDests(pos: Position): Record<string, string[]> {
  const dests: Record<string, string[]> = {};
  const add = (from: string, to: string) => {
    const list = (dests[from] ??= []);
    if (!list.includes(to)) list.push(to);
  };
  for (const move of fogMoves(pos)) {
    add(makeSquare(move.from), makeSquare(move.to));
    if (pos.board.king.has(move.from) && pos.board[pos.turn].has(move.to)) {
      add(makeSquare(move.from), makeSquare(kingCastlesTo(pos.turn, move.to < move.from ? 'a' : 'h')));
    }
  }
  return dests;
}

export function visibleSquares(pos: Position, color: Color): SquareSet {
  // Vision is the same whether or not it is `color`'s turn — evaluate the
  // position as if it were. An en passant square is only ever the current
  // mover's right, so it does not carry over to the other side.
  const view = pos.clone();
  if (view.turn !== color) {
    view.turn = color;
    view.epSquare = undefined;
  }
  let visible = pos.board[color];
  for (const move of fogMoves(view)) visible = visible.with(move.to);
  return visible;
}

// The position as `color` is allowed to know it: unseen enemy pieces
// removed, only `color`'s own castling rights, and no en passant square (the
// client gets its legal moves from fogDests(), so it needs neither, and both
// would leak what the opponent has done).
export function maskedFen(pos: Position, color: Color): string {
  const setup = pos.toSetup();
  const hidden = setup.board[opposite(color)].diff(visibleSquares(pos, color));
  for (const square of hidden) setup.board.take(square);
  return makeFen({
    ...setup,
    castlingRights: setup.castlingRights.intersect(SquareSet.backrank(color)),
    epSquare: undefined,
  });
}

// Call after `mover` has played.
export function fogOutcome(pos: Position, mover: Color): GameOverResult {
  if (pos.board.kingOf(opposite(mover)) === undefined) {
    return { gameOver: true, result: mover === 'white' ? '1-0' : '0-1', resultReason: 'king-captured' };
  }
  if (fogMoves(pos).length === 0) return { gameOver: true, result: '1/2-1/2', resultReason: 'stalemate' };
  return { gameOver: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx tsc --noEmit -p tsconfig.json && npx vitest run test/fogOfWar.test.ts`
Expected: PASS (15 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/fogOfWar.ts server/test/fogOfWar.test.ts
git commit -m "feat(server): Fog of War move generation, vision and masking"
```

---

### Task 5: Server — Fog of War rooms and per-seat snapshots

**Files:**
- Modify: `server/src/room.ts`, `server/src/roomManager.ts`, `server/src/app.ts`
- Test: `server/test/room.test.ts`, `server/test/integration.test.ts`, `server/test/variantApi.test.ts`

**Interfaces:**
- Consumes: everything from Task 4; `MoveInput`/`Move` from Task 2.
- Produces:
  - `new Room(id, timeControlMs, colorPref, now?, startFen?, rules?, chess960?, incrementMs?, fog?: boolean)`
  - `RoomManager.createRoom(timeControlMs, colorPref, rules?, startFen?, chess960?, incrementMs?, fog?)`
  - `Room.getSnapshot(viewer: Seat = 'spectator'): StateSnapshot`
  - `StateSnapshot` gains `fog: boolean; visible: string[] | null; dests: Record<string, string[]> | null`
  - Persisted `variant` is `'fogofwar'` for fog games; their `pgn` holds move-numbered UCI tokens (`1. e2e4 e7e5`).

- [ ] **Step 1: Write the failing tests**

Append to `server/test/room.test.ts` (inside `describe('Room', …)`):

```ts
  function fogRoom(startFen?: string): Room {
    const room = new Room('r1', 0, 'white', Date.now, startFen, 'chess', false, 0, true);
    room.connect(fakeWs());
    room.connect(fakeWs());
    return room;
  }

  it('fog: ignores check and ends the game when a king is captured', () => {
    const room = fogRoom();
    const moves: Array<['white' | 'black', string, string]> = [
      ['white', 'e2', 'e3'],
      ['black', 'f7', 'f6'],
      ['white', 'd1', 'h5'],
      ['black', 'a7', 'a6'], // ignores the "check" — legal in fog of war
      ['white', 'h5', 'e8'],
    ];
    for (const [color, from, to] of moves) expect(room.move(color, { from, to }).ok).toBe(true);
    expect(room.status).toBe('finished');
    expect(room.result).toBe('1-0');
    expect(room.resultReason).toBe('king-captured');
    expect(room.getSnapshot().historySan).toEqual(['e2e3', 'f7f6', 'd1h5', 'a7a6', 'h5e8']);
  });

  it('fog: rejects moves that are not even pseudo-legal', () => {
    expect(fogRoom().move('white', { from: 'e2', to: 'e5' }).ok).toBe(false);
  });

  it('fog: shows each player only what they can see and hides the opponent\'s moves', () => {
    const room = fogRoom();
    room.move('white', { from: 'e2', to: 'e4' });
    const white = room.getSnapshot('white');
    expect(white.fen.split(' ')[0]).toBe('8/8/8/8/4P3/8/PPPP1PPP/RNBQKBNR');
    expect(white.historySan).toEqual(['e2e4']);
    expect(white.dests).toEqual({});
    const black = room.getSnapshot('black');
    expect(black.fen.split(' ')[0]).toBe('rnbqkbnr/pppppppp/8/8/8/8/8/8');
    expect(black.historySan).toEqual(['?']);
    expect(black.dests!.e7).toEqual(expect.arrayContaining(['e6', 'e5']));
    expect(black.visible).toContain('e5');
    expect(black.visible).not.toContain('e4');
  });

  it('fog: spectators see nothing until the game ends, then everyone sees everything', () => {
    const room = fogRoom();
    room.move('white', { from: 'e2', to: 'e4' });
    const spectator = room.getSnapshot('spectator');
    expect(spectator.fen.split(' ')[0]).toBe('8/8/8/8/8/8/8/8');
    expect(spectator.historySan).toEqual(['?']);
    expect(spectator.visible).toEqual([]);
    room.resign('black');
    const after = room.getSnapshot('spectator');
    expect(after.fen.split(' ')[0]).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR');
    expect(after.historySan).toEqual(['e2e4']);
    expect(after.visible).toBeNull();
  });

  it('fog: accepts castling dragged as a two-square king move and records it king-to-rook', () => {
    const room = fogRoom('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    expect(room.move('white', { from: 'e1', to: 'g1' }).ok).toBe(true);
    expect(room.getSnapshot('white').historySan).toEqual(['e1h1']);
    expect(room.getSnapshot('white').fen.split(' ')[0].split('/')[7]).toBe('R4RK1');
  });

  it('fog: undo rebuilds the position from the recorded moves', () => {
    const room = fogRoom();
    room.move('white', { from: 'e2', to: 'e4' });
    room.offerUndo('white');
    room.respondUndo('black', true);
    expect(room.getSnapshot('white').fen.split(' ')[0]).toBe('8/8/8/8/8/8/PPPPPPPP/RNBQKBNR');
    expect(room.getSnapshot('white').historySan).toEqual([]);
  });

  it('gives non-fog snapshots no fog fields', () => {
    const room = new Room('r1', 0, 'white');
    room.connect(fakeWs());
    room.connect(fakeWs());
    const snapshot = room.getSnapshot('white');
    expect(snapshot.fog).toBe(false);
    expect(snapshot.visible).toBeNull();
    expect(snapshot.dests).toBeNull();
  });
```

Append to `server/test/variantApi.test.ts`:

```ts
  it('creates a Fog of War room: chess rules, fog flag, masked view for the joining player', async () => {
    const { ws, state } = await createAppAndConnect('fogofwar');
    expect(state.variant).toBe('chess');
    expect(state.fog).toBe(true);
    expect(state.visible).toHaveLength(32);
    expect(state.fen.split(' ')[0]).toBe('8/8/8/8/8/8/PPPPPPPP/RNBQKBNR');
    ws.close();
  });
```

Append to `server/test/integration.test.ts` (inside the `describe`, before the closing `});` of the describe):

```ts
  it('sends each fog of war player their own masked state and persists the game as fogofwar', async () => {
    server = createApp({ dbPath: ':memory:' });
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;
    const base = `http://localhost:${port}`;

    const createRes = await fetch(`${base}/api/games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeControlMs: 0, colorPref: 'white', variant: 'fogofwar' }),
    });
    const { roomId } = await createRes.json();

    const white = new WebSocket(`ws://localhost:${port}/ws/${roomId}`);
    await waitForMessage(white, (m) => m.type === 'joined');
    const black = new WebSocket(`ws://localhost:${port}/ws/${roomId}`);
    await waitForMessage(black, (m) => m.type === 'joined');

    const whiteState = waitForMessage(white, (m) => m.type === 'state' && m.historySan.length === 1);
    const blackState = waitForMessage(black, (m) => m.type === 'state' && m.historySan.length === 1);
    white.send(JSON.stringify({ type: 'move', from: 'e2', to: 'e4' }));
    const [w, b] = await Promise.all([whiteState, blackState]);
    expect(w.historySan).toEqual(['e2e4']);
    expect(/[a-z]/.test(w.fen.split(' ')[0])).toBe(false);
    expect(b.historySan).toEqual(['?']);
    expect(/[A-Z]/.test(b.fen.split(' ')[0])).toBe(false);

    const finished = waitForMessage(white, (m) => m.type === 'state' && m.status === 'finished');
    black.send(JSON.stringify({ type: 'resign' }));
    await finished;

    const games = await (await fetch(`${base}/api/games`)).json();
    expect(games[0].variant).toBe('fogofwar');
    expect(games[0].pgn).toBe('1. e2e4');

    white.close();
    black.close();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run`
Expected: FAIL — Room has no 9th `fog` param / `getSnapshot` ignores viewer / `fogofwar` falls back to plain chess.

- [ ] **Step 3: Update `server/src/room.ts`**

Imports:

```ts
import type WebSocket from 'ws';
import {
  applyMove,
  createGame,
  toChessopsMove,
  type GameOverResult,
  type MoveInput,
} from './chessRules.js';
import { fogDests, fogMoves, fogOutcome, maskedFen, visibleSquares } from './fogOfWar.js';
import { normalizeMove, type Position } from 'chessops/chess';
import { isNormal, type Move, type Rules } from 'chessops/types';
import { makeFen } from 'chessops/fen';
import { makeSquare, makeUci } from 'chessops/util';
import { generateToken } from './idGen.js';

const EMPTY_BOARD_FEN = '8/8/8/8/8/8/8/8 w - - 0 1';
```

`StateSnapshot` gains three fields (after `startFen`):

```ts
  // Fog of War: `fog` is set for the whole game. While it is unfinished,
  // `fen` / `historySan` are the viewer's masked versions, `visible` lists
  // the squares they can see and `dests` their legal moves (the masked board
  // is not enough to compute them client-side). null outside fog games and
  // once a fog game is over.
  fog: boolean;
  visible: string[] | null;
  dests: Record<string, string[]> | null;
```

Add a helper type below `ActionResult`:

```ts
interface PlayedMove {
  move: Move;
  notation: string;
  outcome: GameOverResult;
}
```

Field + constructor (new last parameter):

```ts
  private readonly fog: boolean;
```

```ts
    incrementMs: number = 0,
    fog: boolean = false
  ) {
    …
    this.chess960 = chess960;
    this.fog = fog;
```

Replace `move()`:

```ts
  move(seat: Seat, input: MoveInput): ActionResult {
    if (this.status !== 'playing') return { ok: false, error: 'game is not in progress' };
    if (seat === 'spectator') return { ok: false, error: 'spectators cannot move' };
    const turnColor: Color = this.chess.turn === 'white' ? 'white' : 'black';
    if (seat !== turnColor) return { ok: false, error: 'not your turn' };

    const played = this.fog ? this.playFogMove(input) : this.playStandardMove(input);
    if (!played) return { ok: false, error: 'illegal move' };

    this.moveHistorySan.push(played.notation);
    this.moves.push(played.move);
    const repetitionCount = this.recordAndCountRepetition();

    const now = this.now();
    if (this.timeControlMs > 0 && this.lastMoveAt !== null) {
      this.clocks[turnColor] = Math.max(0, this.clocks[turnColor] - (now - this.lastMoveAt)) + this.incrementMs;
    }
    this.lastMoveAt = now;
    this.drawOfferBy = null;
    this.undoOfferBy = null;

    if (played.outcome.gameOver) {
      this.finish(played.outcome.result!, played.outcome.resultReason!);
    } else if (this.chess.halfmoves >= 100) {
      this.finish('1/2-1/2', 'fifty-move');
    } else if (repetitionCount >= 3) {
      this.finish('1/2-1/2', 'threefold-repetition');
    }
    return { ok: true };
  }

  private playStandardMove(input: MoveInput): PlayedMove | undefined {
    const move = toChessopsMove(this.chess, input);
    if (!move) return undefined;
    const result = applyMove(this.chess, input);
    if (!result.ok) return undefined;
    return { move, notation: result.san!, outcome: result };
  }

  // Fog of War moves are recorded as UCI: plenty of them (a king stepping
  // into attack, ignoring a check) are illegal chess, which SAN can't express.
  private playFogMove(input: MoveInput): PlayedMove | undefined {
    const requested = toChessopsMove(this.chess, input);
    if (!requested || !isNormal(requested)) return undefined;
    // Turns a two-square king drag (e1-g1) into chessops' king-takes-rook
    // castling encoding (e1-h1), which is what fogMoves() produces.
    const wanted = normalizeMove(this.chess, requested);
    if (!isNormal(wanted)) return undefined;
    const move = fogMoves(this.chess).find(
      (m) => m.from === wanted.from && m.to === wanted.to && m.promotion === wanted.promotion
    );
    if (!move) return undefined;
    const mover = this.chess.turn;
    this.chess.play(move);
    return { move, notation: makeUci(move), outcome: fogOutcome(this.chess, mover) };
  }
```

Replace `getSnapshot()`:

```ts
  getSnapshot(viewer: Seat = 'spectator'): StateSnapshot {
    const turnColor: Color = this.chess.turn === 'white' ? 'white' : 'black';
    let clocks = { ...this.clocks };
    if (this.status === 'playing' && this.timeControlMs > 0 && this.lastMoveAt !== null) {
      const elapsed = this.now() - this.lastMoveAt;
      clocks = { ...clocks, [turnColor]: Math.max(0, clocks[turnColor] - elapsed) };
    }
    const remainingChecks = this.chess.remainingChecks;
    const snapshot: StateSnapshot = {
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
      startFen: this.initialFen,
      fog: this.fog,
      visible: null,
      dests: null,
    };
    if (!this.fog || this.status === 'finished') return snapshot;
    return { ...snapshot, ...this.fogView(viewer) };
  }

  private fogView(viewer: Seat): Pick<StateSnapshot, 'fen' | 'historySan' | 'visible' | 'dests'> {
    if (viewer === 'spectator') {
      return { fen: EMPTY_BOARD_FEN, historySan: this.moveHistorySan.map(() => '?'), visible: [], dests: {} };
    }
    // Fog of War always starts from the standard position, so white's moves
    // are the even plies.
    const ownParity = viewer === 'white' ? 0 : 1;
    const myTurn = this.status === 'playing' && this.chess.turn === viewer;
    return {
      fen: maskedFen(this.chess, viewer),
      historySan: this.moveHistorySan.map((uci, i) => (i % 2 === ownParity ? uci : '?')),
      visible: Array.from(visibleSquares(this.chess, viewer), (square) => makeSquare(square)),
      dests: myTurn ? fogDests(this.chess) : {},
    };
  }
```

(`Position` stays imported for the `chess` field type; the old `import type { Position } from 'chessops/chess';` line is replaced by the combined import above.)

- [ ] **Step 4: Update `server/src/roomManager.ts`**

```ts
    incrementMs: number = 0,
    fog: boolean = false
  ): Room {
    let id = generateRoomId();
    while (this.rooms.has(id)) id = generateRoomId();
    const room = new Room(id, timeControlMs, colorPref, Date.now, startFen, rules, chess960, incrementMs, fog);
```

- [ ] **Step 5: Update `server/src/app.ts`**

In `POST /api/games`:

```ts
    let rules: Rules = 'chess';
    let chess960 = false;
    let fog = false;
    let startFen: string | undefined;
    if (variant === 'chess960') {
      chess960 = true;
      startFen = generateChess960Fen();
    } else if (variant === 'fogofwar') {
      fog = true;
    } else if (
```

```ts
    const room = roomManager.createRoom(validTime, validColor, rules, startFen, chess960, validIncrement, fog);
```

`broadcastState` sends each connection its own view:

```ts
  // Each connection gets its own snapshot: in Fog of War, what a player may
  // see depends on their seat, so one shared payload would leak the board.
  function broadcastState(room: Room): void {
    for (const conn of room.allConnections()) {
      if (conn.readyState !== WebSocket.OPEN) continue;
      const seat = room.seatColorFor(conn) ?? 'spectator';
      conn.send(JSON.stringify({ type: 'state', ...room.getSnapshot(seat) }));
    }
  }
```

In `persistIfFinished`:

```ts
        variant: snapshot.fog ? 'fogofwar' : snapshot.chess960 ? 'chess960' : snapshot.variant,
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd server && npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: tsc clean, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add server
git commit -m "feat(server): Fog of War rooms with per-seat masked snapshots"
```

---

### Task 6: Client — Fog of War board, move list and replay

**Files:**
- Modify: `client/src/moveList.ts`, `client/test/moveList.test.ts`
- Modify: `client/src/variantRules.ts`; Create: `client/test/variantRules.test.ts`
- Modify: `client/src/game.ts`, `client/src/games.ts`
- Modify: `client/public/style.css` (append)

**Interfaces:**
- Consumes: snapshot fields `fog`, `visible`, `dests` (Task 5); `applyStandardBoard`, `renderCaptured`, `variantId` in game.ts (Tasks 1/3).
- Produces: `formatFogMove(token: string): string`; `rulesFor('fogofwar') === 'chess'`.

- [ ] **Step 1: Write the failing tests**

Append to `client/test/moveList.test.ts` (and add `formatFogMove` to its import):

```ts
describe('formatFogMove', () => {
  it('renders UCI as from-to, with promotions', () => {
    expect(formatFogMove('e2e4')).toBe('e2-e4');
    expect(formatFogMove('e7e8q')).toBe('e7-e8=Q');
  });

  it('leaves hidden moves and anything else untouched', () => {
    expect(formatFogMove('?')).toBe('?');
    expect(formatFogMove('Nf3')).toBe('Nf3');
  });
});
```

`client/test/variantRules.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { rulesFor } from '../src/variantRules.js';

describe('rulesFor', () => {
  it('maps the flag-style variants onto plain chess rules', () => {
    expect(rulesFor('chess960')).toBe('chess');
    expect(rulesFor('fogofwar')).toBe('chess');
  });

  it('passes real chessops rules through', () => {
    expect(rulesFor('crazyhouse')).toBe('crazyhouse');
    expect(rulesFor('atomic')).toBe('atomic');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd client && npx vitest run test/moveList.test.ts test/variantRules.test.ts`
Expected: FAIL — `formatFogMove` not exported; `rulesFor('fogofwar')` returns `'fogofwar'`.

- [ ] **Step 3: Implement**

Append to `client/src/moveList.ts`:

```ts
// Fog of War history is UCI ("e2e4", "e7e8q") or "?" for an opponent move
// the viewer isn't allowed to see.
export function formatFogMove(token: string): string {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(token)) return token;
  const promotion = token.length === 5 ? `=${token[4].toUpperCase()}` : '';
  return `${token.slice(0, 2)}-${token.slice(2, 4)}${promotion}`;
}
```

Replace `client/src/variantRules.ts`:

```ts
import type { Rules } from 'chessops/types';

// chess960 and fogofwar are flags on top of plain chess rules (a shuffled
// start / hidden information), not chessops rules of their own.
const CHESS_RULES_VARIANTS = new Set(['chess960', 'fogofwar']);

export function rulesFor(variant: string): Rules {
  return CHESS_RULES_VARIANTS.has(variant) ? 'chess' : (variant as Rules);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd client && npx vitest run test/moveList.test.ts test/variantRules.test.ts`
Expected: PASS.

- [ ] **Step 5: Fog board in `client/src/game.ts`**

1. Imports: `import { buildMoveRows, formatFogMove } from './moveList.js';`

2. Constant next to `KOTH_CENTER_SQUARES`:

```ts
const ALL_KEYS: Key[] = [...'abcdefgh'].flatMap((file) => [...'12345678'].map((rank) => `${file}${rank}` as Key));
```

3. `variantId` learns fog:

```ts
function variantId(state: any): string {
  return state.fog ? 'fogofwar' : state.chess960 ? 'chess960' : state.variant;
}
```

4. In `applyState`, replace the three board lines (`localChess = …`, `applyStandardBoard(…)`, `flashAtomicExplosion(…)`, `previousPosition = localChess;`) with:

```ts
  if (state.fog) {
    // A masked fog position may lack the opponent's king, which chessops'
    // setupPosition() rejects — so fog games skip chessops entirely and use
    // the server's dests.
    applyFogBoard(state, turnColor);
    previousPosition = null;
  } else {
    localChess = setupPosition(state.variant, parseFen(state.fen).unwrap()).unwrap();
    applyStandardBoard(state, turnColor);
    flashAtomicExplosion(state, prevPosition, prevMoveCount);
    previousPosition = localChess;
  }
```

and the move list line with:

```ts
  const moves: string[] = state.fog ? state.historySan.map(formatFogMove) : state.historySan;
  moveListEl.innerHTML = buildMoveRows(moves)
```

5. Add:

```ts
function applyFogBoard(state: any, turnColor: 'white' | 'black'): void {
  const fogged = new Map<Key, string>();
  if (state.status !== 'finished') {
    const visible = new Set<string>(state.visible ?? []);
    for (const key of ALL_KEYS) if (!visible.has(key)) fogged.set(key, 'fog');
  }
  ground.set({
    fen: state.fen,
    turnColor,
    orientation: mySeat === 'black' ? 'black' : 'white',
    movable: {
      color: isPlayer() ? (mySeat as 'white' | 'black') : undefined,
      dests: mySeat === turnColor ? (new Map(Object.entries(state.dests ?? {})) as Dests) : new Map(),
    },
    // A premove would need dests for a position the player can't see.
    premovable: { enabled: false },
    check: false,
    highlight: { custom: fogged },
    dropmode: { active: false },
    drawable: { autoShapes: [] },
  });
}
```

6. `renderCaptured` — after the crazyhouse early return:

```ts
  // Material counted from a masked board would show every hidden enemy piece
  // as captured; reveal captures only once the game is over.
  if (state.fog && state.status !== 'finished') {
    capturedTop.innerHTML = '';
    capturedBottom.innerHTML = '';
    return;
  }
```

- [ ] **Step 6: Fog replay in `client/src/games.ts`**

Add `import { parseUci } from 'chessops/util';` and replace `positionAt`:

```ts
function positionAt(index: number): Position {
  const pos = setupPosition(rulesFor(replayVariant), parseFen(replayStartFen).unwrap()).unwrap();
  for (let i = 0; i < index; i++) {
    // Fog of War games are stored as UCI: their moves (a king stepping into
    // attack, say) are not legal chess, so SAN can't describe them.
    const move = replayVariant === 'fogofwar' ? parseUci(replayMoves[i]) : parseSan(pos, replayMoves[i]);
    if (!move) break;
    pos.play(move);
  }
  return pos;
}
```

- [ ] **Step 7: Append the fog style to `client/public/style.css`**

```css
/* Fog of War: squares the player can't currently see. Own pieces always sit
   on visible squares and hidden enemy pieces are never sent, so a fogged
   square is always empty. */
cg-board square.fog {
  background: rgba(12, 12, 10, 0.86);
}
```

- [ ] **Step 8: Verify**

Run: `cd client && npx tsc --noEmit && npx vitest run && npm run build`
Expected: clean / pass / built.

- [ ] **Step 9: Commit**

```bash
git add client
git commit -m "feat(client): Fog of War board, move list and replay"
```

---

### Task 7: End-to-end check in a real browser

**Files:**
- Create (not committed): `.claude/launch.json`

- [ ] **Step 1: Launch config** — `.claude/launch.json`:

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "luchess",
      "runtimeExecutable": "sh",
      "runtimeArgs": ["-c", "npm run build --prefix client && cd server && PORT=3100 LUCHESS_DB_PATH=/tmp/luchess-e2e.sqlite npx tsx src/index.ts"],
      "port": 3100
    }
  ]
}
```

- [ ] **Step 2: Start it** with `preview_start {name: "luchess"}`.

- [ ] **Step 3: Language**
  - Home page renders, the `中文` toggle switches every label, option and tile to Chinese, and the choice survives a reload.
  - Both new tiles are listed in both languages.

- [ ] **Step 4: Crazyhouse** — create a game, open the invite link in a second tab, then:
  - play `e4 d5 exd5` and confirm white's pocket shows a pawn;
  - after black replies, drop the pawn by click-then-square and confirm it lands;
  - confirm a pawn can't be dropped onto rank 1/8 (no `drop-dest` dot there);
  - drag-to-drop also works.

- [ ] **Step 5: Fog of War** — create a game, join from a second tab, then:
  - confirm each side sees only its own half plus reachable squares (dark fog elsewhere), and the opponent's moves show as `?`;
  - play to a king capture and confirm the banner reads e.g. `对局结束: 白方胜 · 王被吃掉` and the full board is revealed;
  - open `/games` and step through the replay.

- [ ] **Step 6: Stop the server and fix anything found** (each fix: failing test first where it's logic, then commit).

---

### Task 8: Deploy to 146.56.141.232

- [ ] **Step 1: Push** — `git push origin main`. If no GitHub credentials are available, rsync the repo to the server instead (excluding `node_modules`, `dist`, `data`, `.git`).

- [ ] **Step 2: Build on the server** (repo is owned by root; node is root's fnm install):

```bash
ssh -i ~/Downloads/ssh-key-2022-12-20-2.key ubuntu@146.56.141.232 'sudo bash -c "
  export PATH=/root/.local/share/fnm/node-versions/v22.13.1/installation/bin:\$PATH
  cd /home/ubuntu/luchess && git -c safe.directory=\"*\" pull --ff-only &&
  npm install --prefix server && npm install --prefix client &&
  npm run build --prefix client && npm run build --prefix server"'
```

- [ ] **Step 3: Switch to the systemd unit** — stop the hand-started `npm start` (and its `node dist/index.js` child), then `sudo systemctl start luchess` and check `systemctl is-active luchess`. In-progress games in memory are lost.

- [ ] **Step 4: Verify live** — `https://luchess.cc.cd` returns 200, `/main.js` contains `fogofwar`, creating a `crazyhouse` and a `fogofwar` game via `POST /api/games` both return a `roomId`, and the history page still lists old games.
