# luchess — Engine Swap (chess.js → chessops) 设计文档

日期: 2026-07-02

## 背景 / 目标

用户想给luchess加lichess风格的布局和lichess的全部变体棋玩法(Chess960/Atomic/Crazyhouse/Horde/RacingKings/KingOfTheHill/ThreeCheck/Antichess)。这是个大范围需求, 已拆成5个独立子项目:

1. **引擎替换(本设计)** — chess.js换成chessops, 行为对用户完全不变, 是后续所有变体的地基
2. 简单变体(Chess960 + 三check + King of the Hill)
3. 复杂变体(Atomic + Antichess + Racing Kings + Horde)
4. Crazyhouse(含吃子收纳盒UI)
5. 布局(顶部导航 + 创建对局面板加玩法选择)

本设计只覆盖第1项。第2-5项各自单独brainstorming、写spec、写plan、实现。

**为什么必须先做引擎替换**: chess.js内部写死了标准国际象棋规则, 无法扩展支持变体走子逻辑(比如Atomic吃子会引爆周围棋子、Crazyhouse吃的子能放回棋盘当自己的子)。`chessops`(lichess官方自己写的TypeScript规则库, 已在跟lichess同款chessground棋盘UI组件搭配使用)原生支持全部lichess变体规则, 通过统一的`Position`接口+`Rules`类型区分玩法。本子项目只做"换引擎", 不开放任何变体选择——对用户来说, 换引擎前后luchess的行为应该完全一样, 唯一的差别是内部实现换了, 并且协议里预留了`variant`/`chess960`字段供后续子项目使用。

## 范围

包含:
- `server/src/chessRules.ts`用chessops重写(`createGame`/`applyMove`/`checkGameOver`签名调整为chessops风格)
- `server/src/room.ts`适配: 自建走子历史数组(chessops不像chess.js自带`history()`/`undo()`/`pgn()`), 悔棋改为"从初始局面重放历史(去掉最后一步)", 三次重复局面/50步和棋自己实现
- `client/src/games.ts`的历史回放解析从`chess.js`的`loadPgn`换成`chessops/pgn`模块, 保证已有对局仍可回放
- `StateSnapshot`新增`variant: Rules`(固定`'chess'`)和`chess960: boolean`(固定`false`)字段, 为子项目2-5占位
- 全套现有server测试作为回归验证基准, 补充三次重复/50步和棋/旧格式PGN兼容三条新用例

不包含(明确排除, 留给后续子项目):
- 任何变体规则选择UI或后端逻辑(Chess960随机开局生成、Atomic爆炸判定、Crazyhouse收纳盒、等等)
- Drop走子类型(打子入局面, Crazyhouse专用)的实际处理逻辑——类型签名预留空间, 但不实现
- 任何前端布局改动

## 技术方案

**依赖变更**: `server/package.json`移除`chess.js`, 新增`chessops`(TypeScript库, 无原生绑定, 纯JS/TS)。`client/package.json`的`chess.js`依赖也要换成`chessops`, 因为`client/src/game.ts`(本地即时合法性提示/将军高亮)和`client/src/games.ts`(历史回放解析PGN)都用到它——这两处都要跟着服务端一起换, 否则客户端和服务端会出现两套不同的规则实现, 尤其回放页解析PGN必须和产生PGN的引擎一致。

**`server/src/chessRules.ts`(重写)**:
- `createGame(rules: Rules = 'chess', fen?: string): Position` — 用chessops的`defaultPosition(rules)`或(给了fen时)`setupPosition(rules, parseFen(fen).unwrap())`创建局面。`Rules`类型来自chessops: `'chess' | 'antichess' | 'kingofthehill' | '3check' | 'atomic' | 'horde' | 'racingkings' | 'crazyhouse'`。本期调用方永远传`'chess'`。
- `applyMove(pos: Position, move: MoveInput): MoveResult` — 用`parseSquare`把`{from,to,promotion}`的算法记号转成chessops的`Move`对象(数字方格+完整角色名), `pos.isLegal(move)`校验, 合法则先`makeSan(pos, move)`拿到SAN(必须在`pos.play()`前调用), 再`pos.play(move)`落子, 返回`{ok:true, san, ...checkGameOver(pos)}`；不合法返回`{ok:false, error:'illegal move'}`。
- `checkGameOver(pos: Position): GameOverResult` — 用`pos.outcome()`(返回`{winner:'white'|'black'|undefined}|undefined`, undefined表示未结束)、`pos.isCheckmate()`、`pos.isStalemate()`、`pos.isInsufficientMaterial()`、`pos.isVariantEnd()`组合判断`resultReason`。

**`server/src/room.ts`(适配)**:
- 新增私有字段`private moveHistorySan: string[] = []`和`private initialFen: string`(创建时记录, 本期永远是标准开局FEN, 为子项目2的Chess960随机开局做准备)。
- `move()`: 校验通过后, `applyMove`返回的`san`推入`moveHistorySan`；同时用`makeFen(pos.toSetup(), {epd:true})`算出局面key, 在`private repetitionCounts = new Map<string, number>()`里计数, 达到3次时补一个`resultReason:'threefold-repetition'`的结束判断(chessops的`isVariantEnd`/`outcome`不含重复局面判断, 这是本期新增的、room.ts自己负责的逻辑)。
- `respondUndo`接受时: 用`createGame('chess', this.initialFen)`重建局面, 把`moveHistorySan`去掉最后一步(注意: 重放需要的是走子本身、不是SAN字符串——所以要么额外存一份`Move[]`原始走子数组, 要么从SAN反解析。设计决定: 额外维护`private moves: Move[] = []`和`moveHistorySan`同步增长, 悔棋时重放`moves`数组而非解析SAN, 更直接可靠)。
- `getPgn()`: 不再调用`chess.pgn()`, 自己用`initialFen`(若非标准起始局面则加`[FEN "..."]`头, 本期`initialFen`固定是标准开局, 不需要该头) + `moveHistorySan`拼PGN走子文本。
- `getSnapshot()`新增两个固定字段: `variant: 'chess'`, `chess960: false`。

**`client/src/games.ts`(适配)**: `chess.loadPgn(pgn)` → 用`chessops/pgn`的`parsePgn`+`makeSanAndPlay`风格重放PGN文本重建每一步的局面(具体走法在实施计划里给出), 保证`/games`历史页仍能回放`server/data/games.sqlite`里已存的、由旧chess.js版本产生的PGN——两者都是标准PGN语法, 用一条测试显式验证兼容。

**`client/src/game.ts`(适配)**: 本地即时合法性提示/将军高亮从`chess.js`换成`chessops`等价调用(`pos.isLegal`/`pos.dests`替代原来的`chess.moves({verbose:true})`+`chess.inCheck()`), 客户端行为(哪些格子能拖、将军高亮)不变。

## 数据流

不变——WebSocket协议里的`move`消息格式(`{type:'move', from, to, promotion}`)、`state`广播的字段集合(只是新增`variant`/`chess960`两个此期固定值字段, 不影响现有客户端渲染逻辑)完全兼容现有客户端。持久化到SQLite的字段(`pgn`/`result`/`resultReason`等)格式不变, 只是`pgn`内容现在由新引擎生成(但仍是标准PGN文本, 旧记录仍可读)。

## 错误处理 / 边界情况

- 升变角色: 客户端仍发单字母('q'/'r'/'b'/'n'), 服务端`applyMove`内部映射成chessops的完整角色名('queen'/'rook'/'bishop'/'knight'), 未知/缺失值默认按'queen'处理(与现在chess.js默认行为一致)。
- `MoveInput`类型本期仍只覆盖普通走子(`from`/`to`/`promotion`), 不含`DropMove`(打子), 后者的实际处理逻辑留给子项目4(Crazyhouse), 但`applyMove`函数签名设计成后续加`DropMove`分支时不用改调用方。
- 三次重复局面判断的key用`makeFen(pos.toSetup(),{epd:true})`(局面+轮次+易位权+吃过路兵目标, 不含回合计数), 这与国际象棋规则对"重复局面"的标准定义一致。
- 50步和棋直接读`pos.halfmoves >= 100`(chessops的`Setup`本身维护这个计数器, 不用自己数)。
- 已部署环境`data/games.sqlite`里可能已有旧chess.js产生的PGN记录——用一条测试显式验证新引擎的PGN解析器(`client/src/games.ts`的回放逻辑)能正确读取这些旧记录, 这是本期"零行为变化"承诺覆盖的范围, 不能遗漏。

## 测试

- **回归为主**: 现有`server/test/chessRules.test.ts`(4个)、`server/test/room.test.ts`(15个)、`server/test/integration.test.ts`(1个)的所有断言(合法走子/非法走子/将死判定/和棋判定/悔棋/求和/超时/座位分配/重连)必须继续通过——允许改测试代码里调用chessops API的写法, 但不允许改断言的预期行为。
- **新增3条**: 三次重复局面判和; 50步和棋; 用一段写死的、chess.js格式产生的旧PGN字符串验证`client/src/games.ts`新回放逻辑能正确解析并重建每一步局面。
- **客户端**: `client/test/`目前没有直接测试`game.ts`/`games.ts`的自动化用例(这两个文件本来就是DOM重的、手动验收覆盖), 引擎切换后同样走手动验收, 不新增自动化测试覆盖这两个文件本身。
- **手动验收**: 走一整局(含悔棋/求和/历史回放), 确认与切换引擎前的luchess体验完全一致，特别验证`/games`页面能正常回放数据库里已有的历史对局。
