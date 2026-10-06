# luchess — 再来一局 + 房间号加入 + 顶栏 设计文档

日期: 2026-10-06

## 背景 / 目标

现在每局棋都要新建房间、重新分享链接；房间号是 8 位大小写混合字符(`buZCR3aK`), 手机上很难输入。本次三件事:

1. **再来一局**: 对局结束后在同一个房间里重开, 双方交换颜色, 链接和房间号都不变。
2. **房间号加入**: 房间号改为 6 位数字; 首页可以直接输入房间号进入房间。
3. **顶栏**: 每个页面顶部有图标 + `luchess` 标题, 点击回到首页; 语言切换按钮移进顶栏。

## 范围

包含:
- 6 位数字房间号(`100000`–`999999`), 每局棋单独的对局 ID(用于历史记录)
- `GET /api/rooms/:code` 查询房间是否存在
- 首页房间号输入框 + 校验 + "房间不存在"提示
- 对局页显示房间号; 房间不存在时停止重连并提示
- 再来一局: 发起 / 接受 / 拒绝 / 双方同时发起即开始; 交换颜色; 960 重新随机开局
- 顶栏 + favicon(马的图标)

不包含:
- 再来一局时修改玩法或用时
- 房间密码 / 私密房间
- 旧格式 8 位房间号链接的兼容(这些房间只存在于内存, 部署重启后本来就失效)

## 一、房间号与对局 ID

- `idGen.ts`: `generateRoomCode()` 返回 `100000`–`999999` 的随机整数字符串(`crypto.randomInt`); 原 `generateRoomId(length)` 改名为 `generateGameId(length = 8)`, 字符集不变。
- `RoomManager.createRoom` 用 `generateRoomCode()` 作为房间 id(已有的冲突重试循环保留)。房间空置 10 分钟被清理后, 号码可被新房间复用。
- `Room` 新增 `gameId: string`, 每开一局(构造时和再来一局时)用 `generateGameId()` 重新生成。
- `persistIfFinished` 用 `room.gameId` 而不是 `room.id` 作为数据库主键。历史页显示和查询都用对局 ID, 已有数据不需要迁移。

## 二、房间号加入

服务端:
- `GET /api/rooms/:code` → 存在: `200 { roomId, status }`; 不存在: `404 { error: 'not found' }`。

首页(`index.html` + `main.ts`):
- "创建对局"按钮下方加一行: 标签"加入房间"、输入框(`inputmode="numeric"`, `maxlength` 不限制以便粘贴链接)、"加入"按钮、错误提示行。
- 新纯函数 `normalizeRoomCode(input: string): string | null`(`client/src/roomCode.ts`): 去掉首尾空白; 如果包含 `/game/<6位数字>` 就取出这 6 位(支持粘贴整条邀请链接); 否则去掉所有空白后必须正好是 6 位数字, 否则返回 `null`。
- 点击"加入"或在输入框按回车: 校验失败 → 提示"请输入 6 位房间号"; 请求 `/api/rooms/:code`, 404 → 提示"房间不存在或已过期"; 200 → 跳转 `/game/:code`(有空位入座, 满员则观战)。
- 静态 i18n 支持 `data-i18n-placeholder`, 用于输入框占位文字。

对局页:
- 等待面板文案改为"等待对手加入…把房间号或链接发给朋友:", 面板里大字显示房间号。
- 玩法标签后附房间号: `疯狂屋 · 房间 482913`。
- `WsClient` 新增 `onFatal(reason)` 回调: 连接以 1008 关闭(服务端用于"房间不存在"/"路径无效")时不再重连, 调用 `onFatal`。对局页在横幅显示"房间不存在或已过期。"和"回到首页"链接。

## 三、再来一局

服务端 `Room`:
- 把"一盘棋"的状态初始化集中到 `private startNewGame(startFen?: string)`: 生成新 `gameId`、重建局面和 `initialFen`、清空棋谱/走法/重复计数、重置时钟、清空和棋/悔棋/再来一局邀请、`result`/`resultReason`/`finishedAt` 置空、`persisted = false`; 两个座位都有人时 `status = 'playing'` 且 `lastMoveAt = now()`, 否则 `'waiting'`。构造函数调用它。
- 构造时记住 `baseStartFen`(调用方传入的开局 FEN), 再来一局时: 960 调 `generateChess960Fen()` 重新随机; 否则沿用 `baseStartFen`。
- 新字段 `rematchOfferBy: Color | null`。
- `offerRematch(seat)`: 对局未结束 → `game is not finished`; 观战者 → `spectators cannot offer rematch`; 对方已经发起过 → 直接开始新一局; 否则记录 `rematchOfferBy = seat`。
- `respondRematch(seat, accept)`: 对局未结束 → `game is not finished`; 观战者 → `spectators cannot respond`; 没有对方发起的邀请 → `no pending rematch offer for you`; 接受 → 开始新一局; 拒绝 → 清空邀请。
- 开始新一局 = 交换座位(`seats.white` ↔ `seats.black`, 并把 `connections` 里每个连接的座位颜色同步对调)后调用 `startNewGame`。每个人的令牌不变, 只是对应的颜色换了, 所以断线重连后仍然坐在新颜色上。
- `StateSnapshot` 新增 `seat: Seat`(这份快照的观看者座位)和 `rematchOfferBy`。

`wsHandlers.ts`: 新消息 `offerRematch`、`respondRematch { accept }`。

客户端 `game.ts`:
- 每次收到 state 都用 `state.seat` 更新 `mySeat`(再来一局后自动翻转棋盘), `joined` 消息照旧处理。
- 控制区新增"再来一局"按钮: 只有玩家在对局结束后可见; 自己已发起时显示"已邀请再来一局"并禁用。
- 对局结束横幅: 对方发起了再来一局时, 在结果下方附"对手想再来一局 [接受] [拒绝]"。

错误文案新增: `game is not finished` → "对局还没有结束", `no pending rematch offer for you` → "没有待回应的再来一局邀请"。

## 四、顶栏

- 三个页面 `<body>` 第一个元素:
  ```html
  <header class="topbar">
    <a class="brand" href="/"><span class="brand-icon" aria-hidden="true"></span><span>luchess</span></a>
    <button type="button" class="lang-toggle"></button>
  </header>
  ```
- `initPageI18n()` 改为使用页面上已有的 `.lang-toggle`, 不再自己创建。
- 去掉 `.lang-toggle` 的固定定位和上次为手机加的 `body` 顶部留白。
- 图标: 新文件 `client/public/favicon.svg`(棋子图标里白马的 SVG), 顶栏 `.brand-icon` 和 `<link rel="icon">` 都用它。
- 首页去掉原来的 `<h1>luchess</h1>`, 保留标语。
- 对局页棋盘尺寸公式里给顶栏留出高度(`100vh - 17rem` → `100vh - 20rem`)。

## 错误处理

- 房间号格式错误 / 房间不存在: 首页就地提示, 不跳转。
- 直接打开不存在房间的链接: 停止重连, 横幅提示 + 回首页链接。
- 再来一局的非法操作(未结束、观战者、没有邀请): 服务端返回错误, 客户端用已有的错误提示行显示译文。
- 一方断线时发起再来一局: 邀请保留, 对方回来后可以接受。

## 测试

服务端 (vitest):
- `idGen.test.ts`: 房间号是 6 位数字且首位非 0; 对局 ID 8 位安全字符
- `roomManager.test.ts`: 新房间 id 是 6 位数字
- `room.test.ts`: 发起 + 接受 → 新一局(状态 playing、棋谱为空、结果清空、交换颜色、新 gameId、`isPersisted()` 为 false); 双方都发起 → 开始; 拒绝 → 不开始且邀请清空; 未结束时不能发起; 观战者不能发起; 重连令牌在新一局对应新颜色; 自定义开局 FEN 在新一局沿用; 快照 `seat` 字段
- `wsHandlers.test.ts`: 两种新消息的路由
- `integration.test.ts`: 下完一局 → 再来一局 → 双方收到对调后的 `seat` → 第二局结束后历史里有两条记录, 对局 ID 不同且都不等于房间号; `GET /api/rooms/:code` 200 / 404

客户端 (vitest):
- `roomCode.test.ts`: 6 位数字、带空格、粘贴整条链接、非法输入
- `wsClient.test.ts`: 1008 关闭不重连并调用 `onFatal`; 普通关闭照旧重连
- `i18n.test.ts`: 新错误文案
- `htmlPages.test.ts`: 每个页面有指向 `/` 的顶栏链接和 favicon

端到端: 浏览器两个标签页下完一局 → 再来一局(颜色对调) → 首页输入房间号加入 → 输入不存在的房间号看到提示 → 顶栏回首页; 手机尺寸检查顶栏。

## 部署

与上次相同: push → 服务器 `git pull`、安装依赖、构建 client 和 server → `systemctl restart luchess`(会丢失进行中的对局)。
