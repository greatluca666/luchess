# luchess — 中英双语 + Crazyhouse + 暗棋 (Fog of War) 设计文档

日期: 2026-10-05

## 背景 / 目标

luchess 目前界面全英文(`client/src/i18n.ts` 只是英文常量, 没有语言切换), 已支持 8 种玩法(标准 / Chess960 / 三将 / 山丘之王 / 原子 / 反吃 / 王车赛跑 / 部落)。本次三件事:

1. **中英双语**: 全站可在中文和英文之间切换。
2. **Crazyhouse**: chessops 支持但唯一还没做的变体, 走子模型多了"空投"。
3. **暗棋 (Fog of War)**: chess.com 规则的迷雾棋。chessops 不支持, 需要自写走法生成和按座位隐藏信息。

实施顺序: 双语 → Crazyhouse → 暗棋。双语先做, 后两个玩法的新界面文案直接按双语写。

## 范围

包含:
- 客户端 i18n 框架、语言切换按钮、全部现有文案的中文翻译
- 服务端: `crazyhouse` 变体 + 空投走子消息
- 服务端: `fogofwar` 变体 + 走法生成 + 按座位过滤的状态快照
- 客户端: Crazyhouse 手牌栏 + 空投交互; 暗棋迷雾遮罩
- 历史回放支持两种新变体

不包含(明确排除):
- Crazyhouse 预空投(predrop)、回放页手牌栏展示
- 暗棋预走子(premove)、暗棋专属吃子展示
- 服务端错误信息/日志的翻译(只在客户端把已知错误映射成翻译)
- 其他语言(只做 zh / en)
- 观战者在暗棋对局中看到任何棋子

## 一、中英双语

### 字典与 API (`client/src/i18n.ts`)

```ts
const en = { 'home.tagline': 'Play chess with friends — …', … } as const;
const zh: Record<keyof typeof en, string> = { 'home.tagline': '和朋友下棋 — …', … };
export type Lang = 'en' | 'zh';
export function getLang(): Lang;
export function setLang(lang: Lang): void;   // 写 localStorage + 触发 'langchange' 事件
export function t(key: keyof typeof en): string;
```

- `zh` 的类型用 `en` 的 key 约束 → 漏翻译 / 多余 key 直接 `tsc` 报错。
- 现有 `VARIANT_LABELS` / `GAME_TEXT` 两个导出删除, 调用方改用 `t()`。

### 语言选择

1. `localStorage['luchess.lang']` 有值且合法 → 用它(读写都包 try/catch, 不可用时当作没有)
2. 否则 `navigator.language` 以 `zh` 开头 → `zh`
3. 否则 `en`

### 静态文案

- HTML 元素加 `data-i18n="key"`(替换 textContent)。label 里的文字包一层 `<span>`, 避免替换文字时把里面的 `<select>` 一起清掉。
- `applyStaticI18n(root)` 在页面加载和切换语言时执行, 同时更新 `<html lang>` 和 `<title>`。
- 新模块 `client/src/langToggle.ts`: 在三个页面右上角插入 `中 / EN` 按钮, 点击 `setLang()`。

### 动态文案

各页面监听 `langchange`, 重新渲染:
- 首页: 静态部分即可(玩法卡片、下拉框都是静态 HTML)
- 对局页: 保存最近一次 `state`, 切换时 `applyState(lastState)` 重画(棋盘不受影响)
- 历史页: 重新渲染列表

需要翻译的动态内容:
- 玩法名 `variant.<id>` 和说明 `variant.<id>.desc`
- 对局结果: `1-0` / `0-1` / `1/2-1/2` + `resultReason` → `白方胜 · 将杀` / `White wins · checkmate`
- `resultReason` 全集: checkmate, stalemate, insufficient-material, variant-end, threefold-repetition, fifty-move, resignation, draw-agreement, timeout, 以及暗棋新增的 king-captured
- 服务端错误: 客户端 `errorKey(message)` 把已知英文错误(`not your turn`、`illegal move`、`game is not in progress` 等)映射到翻译 key, 未知错误原样显示

服务端不改。

## 二、Crazyhouse

### 服务端

- `app.ts` 的 variant 白名单加 `crazyhouse`, 映射到 chessops `'crazyhouse'` 规则。
- `MoveInput` 扩展为二选一:
  ```ts
  type MoveInput = { from: string; to: string; promotion?: string } | { drop: Role; to: string };
  ```
  ws 消息: `{ type: 'move', drop: 'knight', to: 'f3' }`。
- `chessRules.toChessopsMove` 对 drop 输入返回 chessops 的 `{ role, to }`(DropMove), 合法性仍由 `pos.isLegal()` 判定(手牌里没有、兵落底线、格子有子都会被拒)。
- `Room.moves` 的类型从 `ChessopsMove` 改成 chessops 的 `Move` 联合类型, `rebuildPosition()`(悔棋)不用改逻辑。
- SAN 由 `makeSan` 生成, 空投记作 `N@f3`。快照里的 `fen` 由 `makeFen` 自动带手牌段 `[Nn…]`。

### 客户端

- `game.html` 棋盘上下的吃子行在 Crazyhouse 下改为手牌栏: 每种棋子一个图标 + 数量角标, 数量为 0 的灰显。
- 手牌数据从 FEN 的 `[...]` 段解析(新纯函数 `parsePockets(fen)`, 可单测)。
- 交互(只在轮到自己时可用):
  - 拖拽: 在手牌图标上 `pointerdown` → chessground `dragNewPiece()`, 落到棋盘触发 `events.dropNewPiece(piece, key)` → 发送 drop 消息
  - 点选: 点手牌 → 高亮该手牌并通过 `dropmode` 让下一次点棋盘格子落子; 再点一次手牌取消
- 可落子格高亮: 用 chessops `pos.dropDests(ctx)` 计算(兵不能落第 1/8 行等规则由 chessops 处理)。
- 非法空投由服务端拒绝, 客户端收到下一次 state 时棋盘自动回到真实局面。

### 回放

`games.ts` 的 `positionAt()` 已经用 `parseSan` + `setupPosition(rulesFor(variant))`, chessops 对 crazyhouse 局面能解析 `N@f3`, 回放无需改动; 只需在标签映射里加 crazyhouse。

## 三、暗棋 (Fog of War)

### 规则 (chess.com 版)

- 每方只能看见: 自己的棋子 + 自己棋子能走到的格子(含可吃的敌子所在格)。兵的斜前方格子只有在能吃子(有敌子或可吃过路兵)时才算能走到。
- 没有"将军"概念: 王可以走进被攻击的格子、可以不理会攻击、可以在被攻击时或穿过被攻击的格子易位(易位只要求王车未动、中间格子为空)。
- **吃掉对方的王即获胜**, `resultReason = 'king-captured'`。
- 轮到的一方没有任何可走的步 → 和棋(`stalemate`)。
- 保留 50 步规则、三次重复、协议和棋、认输、超时、悔棋。
- 变体 id 为 `fogofwar`, 底层用 chessops `'chess'` 规则 + Room 上的 `fog: boolean` 标志(与 `chess960` 的做法一致)。

### 服务端新模块 `server/src/fogOfWar.ts`

纯函数, 不依赖 Room, 全部可单测:

```ts
// 不考虑将军的全部走法(含易位、过路兵、升变)
export function fogMoves(pos: Position): NormalMove[];
// color 一方能看到的格子
export function visibleSquares(pos: Position, color: Color): SquareSet;
// 去掉 color 一方看不到的敌方棋子后的 FEN。易位权只保留 color 自己的, 过路兵字段清空
// (客户端的可走格由服务端下发, 不需要这两个字段, 留着反而泄露对方信息)
export function maskedFen(pos: Position, color: Color): string;
```

- 走法生成复用 chessops `pos.dests(square, ctx)`: 传入一个 `king: undefined` 的 ctx, chessops 会跳过将军/牵制过滤, 得到不含易位的伪合法走法。
- 易位自己生成: 对当前方仍有的易位权, 检查王车之间(chessops `castles.path`)为空即可, 不检查被攻击格。目标格沿用 chessops 约定(王走到车所在格), 由 `pos.play()` 执行。
- `visibleSquares(pos, color)` 要按 color 一方计算, 不管当前轮到谁: 先把局面克隆成轮到 color 再算走法。克隆时如果 color 不是当前行棋方, 要清掉过路兵格(过路兵权利只属于当前行棋方)。

### Room 改动

- `move()`: fog 模式下用 `fogMoves(pos)` 判断合法性(不用 `isLegal`), 合法则 `pos.play()`。走完检查对方王是否已不在棋盘上 → `finish(winner, 'king-captured')`; 否则对新的一方算 `fogMoves`, 为空 → `finish('1/2-1/2', 'stalemate')`。不调用 chessops 的 `outcome()`。
- 棋谱: fog 模式下 `moveHistorySan` 改存 UCI(`e2e4`, `e1h1`, `e7e8q`)。原因: "王走进被攻击格"这类走法在标准规则下不合法, `makeSan` / `parseSan` 都处理不了。数据库 `pgn` 列对 fog 对局存带回合号的 UCI 序列(`1. e2e4 e7e5`, 与 SAN 对局格式一致, 回放解析逻辑通用), 由 `variant = 'fogofwar'` 区分。
- `getSnapshot(viewer: Seat)` 改为按观看者生成。非 fog 对局对所有人返回相同内容(行为不变)。fog 对局在 `status !== 'finished'` 时:

  | 字段 | 白方 / 黑方玩家 | 观战者 |
  |---|---|---|
  | `fen` | `maskedFen(pos, 自己)` | 空棋盘 FEN |
  | `visible` | 能看到的格子列表 | `[]` |
  | `dests` | 轮到自己时为服务端算好的 `{from: to[]}`, 否则 `{}` | `{}` |
  | `historySan` | 自己的走法为 UCI, 对方的为 `'?'` | 全部为 `'?'` |
  | `startFen` | 标准开局(公开信息) | 同左 |

  对局结束后所有人拿到完整快照(真实 FEN、完整走法)。
- `app.ts` 的 `broadcastState` 改为对每个连接单独调用 `room.getSnapshot(seatOf(conn))`。

### 客户端

- fog 对局里不用 chessops 解析 FEN(遮挡后的局面可能没有对方王, `setupPosition` 会校验失败), 直接把 FEN 交给 chessground。
- 可走格直接用快照里的 `dests`。
- 看不到的格子 = 64 格 − `visible`, 用 `highlight.custom` 加 `fog` class, CSS 画成深色遮罩。
- fog 对局关闭 premove、关闭 check 高亮, 对局中隐藏吃子行。
- 走法列表: UCI 显示为 `e2-e4`, 对方走法显示 `?`。
- 回放: `games.ts` 遇到 `fogofwar` 时按 UCI 逐步 `pos.play()` 回放(不经过合法性校验), 显示全盘。

## 错误处理

- 非法空投 / 非法暗棋走法: 服务端返回现有的 `illegal move` 错误, 客户端提示(已翻译)并以下一次 state 为准重画棋盘。
- 历史数据库: 不需要迁移。新变体只是 `variant` 列的新取值; 老对局行为不变。
- 语言存储不可用(隐私模式等): 退回浏览器语言检测, 页面照常工作。

## 测试

服务端 (vitest):
- `fogOfWar.test.ts`: 王可走进被攻击格; 被攻击时、穿过被攻击格可以易位; 中间有子不能易位; 过路兵; 升变; `visibleSquares` 对开局和中局的结果; `maskedFen` 不含任何看不到的敌子
- `room.test.ts`: 吃王判胜(`king-captured`); 无可走步判和; fog 快照里白方看不到的黑子不出现在 `fen` 里; 观战者拿到空盘和全 `?` 棋谱; 结束后快照完整; crazyhouse 空投合法 / 非法, SAN 为 `N@f3`
- `variantApi.test.ts`: `crazyhouse` / `fogofwar` 能创建房间
- `integration.test.ts`: 两个 ws 客户端在 fog 对局中各自收到不同快照

客户端 (vitest):
- `i18n.test.ts`: 中英 key 集合一致; 语言检测优先级; 参数插值
- `pockets.test.ts`: `parsePockets` 解析 FEN 手牌段

端到端: 本地起服务, 两个浏览器窗口分别下一局 Crazyhouse 和一局暗棋, 并切换中英文检查各页面。

## 部署

1. 本地 `~/luchess` 开发, 分批提交, push 到 GitHub `greatluca666/luchess`。
2. 服务器 `/home/ubuntu/luchess`: `git pull`, `npm install`(server / client), 构建 client 和 server。
3. 停掉手动启动的 `npm start` 进程, `systemctl start luchess`(该 unit 已于 2026-10-05 注册并 enable)。重启会丢失内存中进行中的对局。
4. 验证 `https://luchess.cc.cd` 中英切换、新建两种新玩法对局可用。
