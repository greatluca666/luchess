# luchess — 简单变体棋 (Chess960 + 三check + King of the Hill) 设计文档

日期: 2026-07-03

## 背景 / 目标

用户想让luchess支持lichess的全部变体棋玩法。已拆成5个子项目, 子项目1(chessops引擎替换)已完成上线。本设计是子项目2: 支持**Chess960**、**三check**、**King of the Hill**这三种"轻量"变体——之所以轻量, 是因为chessops已经原生实现了这三者的走子合法性与胜负判定(`Rules`类型里的`'3check'`/`'kingofthehill'`, 以及`'chess'`规则本身就能承载Chess960的随机开局+对应易位权), luchess不需要自己写任何规则判断逻辑, 只需要把"选哪种规则创建对局"这条链路打通、以及配套的客户端展示。

这次顺带做两件相关小事(用户在brainstorming中提出):
1. 首页创建对局面板加一个最简"玩法"下拉选择(非子项目5的完整lichess风布局, 只是临时可用入口, 子项目5会用更完整的选择器替换)。
2. 棋盘页加吃子物料展示区(目前完全没有), 三check模式下额外在吃子展示旁加被将军次数的王图标(模仿lichess)。

## 范围

包含:
- Chess960随机开局生成器(纯函数, Fischer Random标准约束)
- `Room`支持按`rules`(`'chess'`/`'3check'`/`'kingofthehill'`)+可选`startFen`创建对局
- `POST /api/games`接受`variant`字段, 驱动上述选择(非法值兜底为`'chess'`)
- `StateSnapshot`新增`variant`/`chess960`(已在子项目1占位, 这次填真值)+`checksRemaining`(三check专用, 直接来自chessops)
- 数据库`games`表新增`variant`+`start_fen`两列, 含生产库安全迁移
- 首页玩法下拉选择器(4选1: 标准/Chess960/三check/King of the Hill)
- 棋盘页: 玩法标签展示 + 吃子物料展示区(纯客户端从FEN反推) + 三check王图标计数
- 历史页: 回放时用对局实际`start_fen`重建局面(而非写死标准开局), 列表显示玩法标签

不包含(留给后续子项目):
- Atomic/Antichess/RacingKings/Horde(子项目3, 需要非标准起始局面+特殊走子逻辑)
- Crazyhouse(子项目4, 需要吃子收纳盒UI+打子走法)
- 完整lichess风布局/顶部导航(子项目5, 会替换掉这次临时加的玩法下拉框)
- Chess960与三check/King of the Hill的组合玩法(lichess允许组合, 本期只做4选1互斥选项)

## 技术方案

**Chess960生成器**: 纯函数, 按经典算法随机生成合法的back-rank排布(先随机放两个异色格的象, 再放皇后, 再放两个马, 剩余三格从左到右放車-王-車), 拼出完整FEN(黑白双方后排相同排布, 兵行不变), castling权限字段按实际车的位置编码(chessops的`Setup.castlingRights`是车所在格的`SquareSet`, 不是简化的KQkq字母, 具体FEN写法在实施计划里用真实chessops API核实)。

**Room改造**: 构造函数新增第6个参数`rules: Rules = 'chess'`(保持第5个参数`startFen`位置不变, 不破坏子项目1里已有的测试调用方式), 内部`createGame(this.rules, startFen)`创建局面。`getSnapshot()`新增:
- `variant: 'chess' | '3check' | 'kingofthehill'`(直接是`this.rules`)
- `chess960: boolean`(独立字段, 只在`variant==='chess'`时有意义)
- `checksRemaining: { white: number; black: number } | null`(`variant==='3check'`时读`this.chess.toSetup().remainingChecks`, 否则`null`)

胜负判定完全复用`checkGameOver`已有的`variant-end`兜底分支, `Room`不加任何自定义规则代码。

**API层**: `app.ts`的`POST /api/games`新增`variant`字段解析(`'chess'|'chess960'|'3check'|'kingofthehill'`, 非法值/缺失兜底`'chess'`), 若为`'chess960'`则调用生成器产出`startFen`并以`rules:'chess', chess960:true`创建房间, 否则以对应`rules`(`chess960`场景外`rules`直接等于`variant`, 因为`'3check'`/`'kingofthehill'`本身就是合法的chessops `Rules`值)、`chess960:false`创建。

**数据库迁移**: `db.ts`的`openDb()`在建表后检查(`PRAGMA table_info(games)`)是否已有`variant`/`start_fen`列, 没有则`ALTER TABLE games ADD COLUMN ...`(默认值分别是`'chess'`和标准开局FEN), 保证已上线的生产库和历史数据不受影响、旧记录读出来能拿到合理默认值。

**客户端**:
- `client/public/index.html`+`main.ts`: 新增"玩法"`<select>`(4个选项), 创建请求带上`variant`。
- `client/src/game.ts`: 新增玩法标签渲染(基于`state.variant`/`state.chess960`); 新增吃子展示区——纯函数从`state.fen`解析出的局面, 和满编16子(每方各8兵2车2马2象1后1王)比对, 缺的就是被吃的子, 用unicode棋子符号(♟♞♝♜♛等)渲染; 三check模式下额外根据`state.checksRemaining`渲染被将军次数的小王图标。
- `client/src/games.ts`: 回放改用`GET /api/games/:id`返回的`startFen`重建初始局面(而非写死`Chess.default()`), 历史列表每项显示玩法标签。

## 数据流

创建对局(带`variant`) → 服务端解析出`rules`+`startFen`(chess960需要生成器) → `Room`用这两者创建chessops局面 → 每次`state`广播带上`variant`/`chess960`/`checksRemaining` → 客户端据此渲染标签/吃子区/王图标, 走子合法性/胜负判定全程由chessops处理, `Room`只做透传。对局结束后落盘时`variant`/`start_fen`一起存进`games`表, `/games`历史页拿这两个字段渲染列表标签+驱动回放的初始局面重建。

## 错误处理 / 边界情况

- 生产库迁移必须安全幂等(先查列是否存在再ALTER), 旧记录默认标准规则+标准开局, 保证已有历史对局回放不受影响。
- `variant`字段非法或缺失时兜底`'chess'`, 与现有`colorPref`防御式校验同一套路, 不因为坏输入让创建对局接口报错。
- Chess960生成器必须保证输出局面合法(象异色格、王在两车之间), 靠测试覆盖而非人工检查。
- `checksRemaining`在非三check对局是`null`, 客户端要能安全跳过渲染分支, 不能因字段不存在报错。
- 吃子展示遇到升变会有局限(升变后的皇后被吃时不知道它本来是兵)——这跟lichess自己的吃子展示逻辑一样简化, 是可接受的已知局限, 不算bug。

## 测试

- **服务端**: Chess960生成器纯函数测试(多次生成验证象异色格、王在两车间、结果合法且有随机性); `Room`按`rules`创建后三check/King of the Hill各自能触发`variant-end`判负的集成级测试(验证链路打通, 不重复测chessops自己的规则正确性); 数据库迁移测试(打开一个不含新列的旧db文件, 确认`openDb`安全加列, 旧记录读出来variant/start_fen有默认值)。
- **客户端**: 吃子展示的纯函数(比如`computeCapturedPieces(fen)`)用不同FEN输入做单元测试。
- **手动验收**: 玩法选择器创建4种对局各测一遍(尤其Chess960的随机开局+易位、三check打到3次将军自动结束、King of the Hill王走到中心自动获胜)、吃子展示区实时更新、历史页正确回放Chess960对局(非标准开局)、旧格式历史记录(本次迁移前的记录)依然能正常显示和回放。
