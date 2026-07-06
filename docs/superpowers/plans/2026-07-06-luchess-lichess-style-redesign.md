# luchess Lichess风格重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把luchess三个页面(首页/对局页/历史页)的视觉重设计为lichess风格——暖黑配色、双栏桌面布局、响应式棋盘、行式走子列表——纯前端CSS/HTML改动, 不碰协议或后端。

**Architecture:** `client/public/style.css`重写配色变量与组件样式, 新增`@media (min-width: 900px)`断点把对局页/历史页从单栏flex切成双栏grid; `client/public/game.html`/`games.html`加包装div(`.board-col`/`.side-col`/`.list-col`/`.replay-col`)但保留所有现有id; 走子列表渲染逻辑从`game.ts`内联字符串拼接抽成`client/src/moveList.ts`里的纯函数, 便于单测。

**Tech Stack:** 原生CSS(自定义属性+Grid/Flexbox), esbuild打包的TypeScript, vitest单测。

## Global Constraints

- 不改`server/`目录、WebSocket消息格式、数据库schema。
- 不改任何现有`id`(`board`/`clock-top`/`clock-bottom`/`move-list`/`resign-btn`/`draw-btn`/`undo-btn`/`invite-panel`/`invite-link`/`copy-invite-btn`/`variant-label`/`captured-top`/`captured-bottom`/`offer-banner`/`games-list`/`replay-board`/`replay-prev`/`replay-next`/`create-btn`/`time-control`/`color-pref`/`variant`) —`main.ts`/`game.ts`/`games.ts`的`document.getElementById`调用零改动(除Task1的走子列表渲染行外)。
- 只用暗色主题, 不做亮色/双主题切换。
- 棋盘皮肤(chessground brown+cburnett)不变。
- 不引入新npm依赖(不用动画库/CSS框架)。
- 中文UI文案不变。

---

## Task 1: 走子列表渲染重构为可测纯函数

**Files:**
- Create: `client/src/moveList.ts`
- Create: `client/test/moveList.test.ts`
- Modify: `client/src/game.ts:125-127`

**Interfaces:**
- Produces: `export interface MoveRow { num: number; white: string; black: string }` 和 `export function buildMoveRows(historySan: string[]): MoveRow[]`, 供Task2的CSS(`.move-list`/`.move-num`选择器)和`game.ts`的渲染代码使用。

- [ ] **Step 1: 写失败测试**

创建`client/test/moveList.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildMoveRows } from '../src/moveList.js';

describe('buildMoveRows', () => {
  it('returns no rows for an empty history', () => {
    expect(buildMoveRows([])).toEqual([]);
  });

  it('pairs white and black plies into one row per full move', () => {
    const rows = buildMoveRows(['e4', 'e5', 'Nf3', 'Nc6']);
    expect(rows).toEqual([
      { num: 1, white: 'e4', black: 'e5' },
      { num: 2, white: 'Nf3', black: 'Nc6' },
    ]);
  });

  it('leaves black blank when white just moved and black has not replied yet', () => {
    const rows = buildMoveRows(['e4', 'e5', 'Nf3']);
    expect(rows).toEqual([
      { num: 1, white: 'e4', black: 'e5' },
      { num: 2, white: 'Nf3', black: '' },
    ]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd client && npx vitest run test/moveList.test.ts`
Expected: FAIL — `Cannot find module '../src/moveList.js'` (文件还不存在)

- [ ] **Step 3: 写最小实现**

创建`client/src/moveList.ts`:

```ts
export interface MoveRow {
  num: number;
  white: string;
  black: string;
}

export function buildMoveRows(historySan: string[]): MoveRow[] {
  const rows: MoveRow[] = [];
  for (let i = 0; i < historySan.length; i += 2) {
    rows.push({
      num: i / 2 + 1,
      white: historySan[i] ?? '',
      black: historySan[i + 1] ?? '',
    });
  }
  return rows;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd client && npx vitest run test/moveList.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: 在game.ts里接入新函数**

在`client/src/game.ts`顶部import区(第10行`import { computeCapturedPieces, type Role } from './capturedPieces.js';`后)新增一行:

```ts
import { buildMoveRows } from './moveList.js';
```

把`client/src/game.ts:125-127`原有的:

```ts
  moveListEl.innerHTML = state.historySan
    .map((san: string, i: number) => `<li>${i % 2 === 0 ? `${i / 2 + 1}.` : ''} ${san}</li>`)
    .join('');
```

替换为:

```ts
  moveListEl.innerHTML = buildMoveRows(state.historySan)
    .map((row) => `<li><span class="move-num">${row.num}.</span><span>${row.white}</span><span>${row.black}</span></li>`)
    .join('');
```

- [ ] **Step 6: 跑全部client测试确认无回归**

Run: `cd client && npm test`
Expected: PASS — 全部测试套件(clock/wsClient/invitePanel/pgnReplay/capturedPieces/moveList)通过, 无失败

- [ ] **Step 7: typecheck**

Run: `cd client && npm run typecheck`
Expected: 无类型错误退出

- [ ] **Step 8: Commit**

```bash
git add client/src/moveList.ts client/test/moveList.test.ts client/src/game.ts
git commit -m "refactor(client): extract move-list row grouping into buildMoveRows

Pure function makes the pairing logic (one row per full move) unit
testable, and gives the upcoming CSS grid layout a stable per-row
li>span structure to target."
```

---

## Task 2: 配色变量与基础组件重设计 (style.css全量重写)

**Files:**
- Modify: `client/public/style.css` (整个文件重写)

**Interfaces:**
- Produces: CSS class名`.board-col`/`.side-col`/`.list-col`/`.replay-col`/`.page-wide`/`.history-layout`/`.move-num`供Task3/Task4的HTML使用; CSS变量`--danger`供`#resign-btn`使用。
- Consumes: Task1产出的`.move-list`结构(`<li><span class="move-num">…</span><span>…</span><span>…</span></li>`)。

此任务只改CSS, 不改任何HTML/TS文件——`.board-col`等新class在HTML里还不存在, 相关grid规则暂时不生效(不影响现有页面渲染), 首页的配色/按钮/select样式改动立即可见, 可用于本任务的视觉验收。

- [ ] **Step 1: 用下面内容整体替换`client/public/style.css`**

```css
:root {
  --bg: #14140f;
  --card: #1e1d18;
  --border: #38352c;
  --text: #e9e8e6;
  --text-muted: #9b9a95;
  --accent: #7fae00;
  --accent-hover: #96c412;
  --danger: #cc3333;
  --radius: 8px;
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
  letter-spacing: -0.01em;
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

select {
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path fill='%239b9a95' d='M4 6l4 4 4-4z'/></svg>");
  background-repeat: no-repeat;
  background-position: right 0.75rem center;
  background-size: 12px;
  padding-right: 2.25rem;
}

select:focus,
input[type="text"]:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(127, 174, 0, 0.2);
}

button {
  background: transparent;
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.5rem 1rem;
  font-size: 0.95rem;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.1s ease;
}

button:hover:not(:disabled) {
  border-color: var(--accent);
  transform: translateY(-1px);
}

button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
}

#create-btn,
#copy-invite-btn,
#accept-draw,
#accept-undo {
  background: var(--accent);
  border-color: var(--accent);
  color: #0d1a05;
  font-weight: 600;
  padding: 0.65rem 1rem;
}

#create-btn:hover:not(:disabled),
#copy-invite-btn:hover:not(:disabled),
#accept-draw:hover:not(:disabled),
#accept-undo:hover:not(:disabled) {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}

#resign-btn {
  border-color: var(--danger);
  color: var(--danger);
}

#resign-btn:hover:not(:disabled) {
  background: rgba(204, 51, 51, 0.12);
  border-color: var(--danger);
}

a {
  color: var(--accent);
}

.page.page-wide {
  max-width: 640px;
}

.game-layout {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}

.board-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
}

.side-col {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 100%;
}

.history-layout {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.list-col {
  width: 100%;
}

.replay-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
}

.cg-wrap {
  width: min(480px, 92vw);
  aspect-ratio: 1 / 1;
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
  background: rgba(127, 174, 0, 0.15);
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
  display: grid;
  grid-template-columns: 2.5rem 1fr 1fr;
  gap: 0.15rem 0.5rem;
  list-style: none;
  padding: 0.5rem;
  margin: 0;
  width: 100%;
  max-height: 320px;
  overflow-y: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.9rem;
  color: var(--text-muted);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
}

.move-list li {
  display: contents;
}

.move-list li span {
  padding: 0.15rem 0.35rem;
}

.move-list li:nth-child(odd) span {
  background: rgba(255, 255, 255, 0.03);
}

.move-list .move-num {
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
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease;
}

#games-list li a:hover {
  border-color: var(--accent);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  transform: translateY(-1px);
}

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

@media (min-width: 900px) {
  .page.page-wide {
    max-width: 900px;
  }

  .game-layout {
    display: grid;
    grid-template-columns: auto 320px;
    align-items: start;
    gap: 1.5rem;
  }

  .side-col {
    position: sticky;
    top: 1rem;
  }

  #move-list {
    order: -1;
  }

  .history-layout {
    display: grid;
    grid-template-columns: 300px auto;
    align-items: start;
    gap: 1.5rem;
  }

  .list-col {
    max-height: 480px;
    overflow-y: auto;
  }
}
```

- [ ] **Step 2: 用`run`技能起本地开发服务, 视觉验收首页**

用`run`技能构建并启动luchess(`npm run build:client && npm start`, 或该技能识别到的等价流程), 浏览器打开首页, 确认: 背景/卡片改为暖黑色调, 主按钮(创建对局)为亮绿色, 下拉框有自定义箭头且focus时有绿色描边光晕。此时对局页/历史页的HTML还没加`.board-col`等wrapper, 双栏grid规则不生效, 页面仍是单栏(预期行为, Task3/4处理)。

- [ ] **Step 3: Commit**

```bash
git add client/public/style.css
git commit -m "style(client): rewrite style.css for lichess-style dark theme

New color tokens (warm near-black bg, lichess green accent, dedicated
danger color for resign), custom select arrows, button hover lift,
responsive .cg-wrap sizing, and grid rules for the upcoming two-column
game/history layouts (inert until Task 3/4 add the wrapper markup)."
```

---

## Task 3: 对局页双栏布局

**Files:**
- Modify: `client/public/game.html` (整个`<body>`重写)

**Interfaces:**
- Consumes: Task2定义的`.page-wide`/`.board-col`/`.side-col`CSS class与grid规则。
- 不改任何`id`, 不改`client/src/game.ts`(该文件所有`getElementById`调用继续按原id工作)。

- [ ] **Step 1: 用下面内容整体替换`client/public/game.html`的`<body>`**

```html
<body>
  <div class="page page-wide">
    <div class="game-layout card">
      <div class="board-col">
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
      </div>
      <div class="side-col">
        <div class="controls">
          <button id="resign-btn">认输</button>
          <button id="draw-btn">求和</button>
          <button id="undo-btn">悔棋</button>
        </div>
        <div id="offer-banner" class="offer-banner" hidden></div>
        <ol id="move-list" class="move-list"></ol>
      </div>
    </div>
  </div>
  <script type="module" src="/game.js"></script>
</body>
```

（其余`<head>`部分不变。）

- [ ] **Step 2: 跑client测试确认无回归**

Run: `cd client && npm test`
Expected: PASS — game.ts依赖的id全部还在, 测试不涉及DOM结构断言, 保持全绿

- [ ] **Step 3: 用`run`技能视觉验收对局页**

启动服务, 开两个浏览器标签模拟白/黑双方创建并进行一局(至少走几步产生走子记录), 分别在桌面宽度(>900px)和手机宽度下检查:
- 桌面: 棋盘居左, 右侧栏(走子列表在上、可滚动, 操作按钮+求和/悔棋横幅在下)随页面滚动吸顶(`position: sticky`)。
- 手机(<900px): 单栏顺序为 邀请面板→变体标签→吃子→棋盘→按钮→横幅→走子列表(与改版前一致的堆叠顺序)。
- 认输按钮为红色描边, 求和/悔棋按钮为默认灰边框, hover时所有按钮轻微上浮。
- 走子列表按"回合号+白方+黑方"三列对齐显示, 奇数行有轻微斑马纹背景。

- [ ] **Step 4: Commit**

```bash
git add client/public/game.html
git commit -m "feat(client): two-column desktop layout for the game page

Board + clocks in .board-col, move list + controls + banners in a
sticky .side-col — collapses to the original single-column stack
below 900px via style.css's media query from Task 2."
```

---

## Task 4: 历史页双栏布局

**Files:**
- Modify: `client/public/games.html` (整个`<body>`重写)

**Interfaces:**
- Consumes: Task2定义的`.page-wide`/`.history-layout`/`.list-col`/`.replay-col`CSS。
- 不改任何`id`, 不改`client/src/games.ts`。

- [ ] **Step 1: 用下面内容整体替换`client/public/games.html`的`<body>`**

```html
<body>
  <div class="page page-wide">
    <h1>历史对局</h1>
    <div class="card history-layout">
      <div class="list-col">
        <ul id="games-list"></ul>
      </div>
      <div class="replay-col">
        <div id="replay-board" class="cg-wrap"></div>
        <div class="controls">
          <button id="replay-prev">上一步</button>
          <button id="replay-next">下一步</button>
        </div>
      </div>
    </div>
  </div>
  <script type="module" src="/games.js"></script>
</body>
```

- [ ] **Step 2: 跑client测试确认无回归**

Run: `cd client && npm test`
Expected: PASS

- [ ] **Step 3: 用`run`技能视觉验收历史页**

启动服务, 打开`/games`, 确认: 桌面宽度下列表在左(固定300px宽, 超过480px高度可滚动), 回放棋盘+翻页按钮在右; 手机宽度下列表在上、棋盘在下(与改版前一致)。点击列表项加载回放, 点"上一步"/"下一步"验证棋盘正常前进后退。

- [ ] **Step 4: Commit**

```bash
git add client/public/games.html
git commit -m "feat(client): two-column desktop layout for the game history page

Game list in a fixed-width scrollable .list-col, replay board +
prev/next controls in .replay-col — single column on mobile, matching
the existing stacking order."
```

---

## Task 5: 全站回归验收

**Files:** 无代码改动, 仅验证。

- [ ] **Step 1: 跑完整测试套件(client+server)**

Run: `cd /Users/macmima1234/luchess && npm run test:client && npm run test:server`
Expected: 两个套件全部PASS, 0 failing

- [ ] **Step 2: typecheck client**

Run: `cd client && npm run typecheck`
Expected: 无类型错误

- [ ] **Step 3: 用`run`技能做一次完整手动走查**

按下列顺序过一遍, 桌面宽度(>900px)和手机宽度(如iPhone 375px)各一次:
1. 首页——分别选不同玩法(标准/Chess960/Atomic等)+时限+执子颜色创建对局, 确认下拉框/按钮样式正常、点击后正确跳转到`/game/<roomId>`。
2. 对局等待态——确认邀请面板显示分享链接, 点复制按钮文案变化。
3. 双人对局中(开两个标签页分别接受邀请)——走几步棋, 确认双栏布局、计时器、吃子图标、走子列表分行显示都正确; 测试认输/求和/悔棋按钮与横幅交互。
4. 对局结束态——确认结束横幅正确显示结果。
5. 历史页——列表+回放翻页正常, 双栏/单栏切换正确。

- [ ] **Step 4: 无需commit**（本任务纯验证，若走查中发现问题，回退到对应Task修复后重新走查）
