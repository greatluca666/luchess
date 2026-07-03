# luchess — 复杂变体棋 (Atomic + Antichess + Racing Kings + Horde) 设计文档

日期: 2026-07-04

## 背景 / 目标

子项目2(Chess960/三check/King of the Hill)已上线。本设计是子项目3: 支持lichess剩余的4个非Crazyhouse变体——**Atomic**(爆炸棋)、**Antichess**(反棋)、**Racing Kings**(赛王棋)、**Horde**(蜂群棋)。

原始5子项目拆分时曾把这4个归为"档2: chess.js做不了、需要换引擎"的重量级工作。但子项目1已经把引擎换成chessops, 而chessops原生完整支持这4种规则(走子合法性、胜负判定全部内置), 所以实际工作量比最初预估轻得多, 跟子项目2(3check/KotH)是同一个量级——`Room`只需要能把`rules`参数传给chessops, 不需要写任何自定义规则逻辑。

真正需要处理的是两处: (1) Horde/RacingKings的非标准开局局面——不同于Chess960的"随机生成", 这两个是chessops自带的固定局面(`defaultPosition(rules)`直接给出), 更简单; (2) 吃子展示区(`capturedPieces.ts`)原来假设"双方标准16子", Horde开局白方30+个兵会让这个假设完全失效, 需要按每局真实开局动态计算基准, 而不是写死标准局面。

## 范围

包含:
- `server/src/app.ts`的variant字符串解析新增4个值(`atomic`/`antichess`/`racingkings`/`horde`), 直接映射到同名chessops规则(不需要FEN生成器, chessops的`defaultPosition(rules)`自动给出Horde/RacingKings的正确固定非标准开局、Atomic/Antichess的标准开局)
- `Room.getSnapshot()`新增`startFen`字段(暴露已有的`getInitialFen()`), 供客户端实时计算吃子展示用
- `client/src/capturedPieces.ts`的`computeCapturedPieces`签名从`(fen)`改为`(fen, startFen)`, 按每局真实开局动态算基准(而非写死的标准16子常量), 兼容Horde这种极端兵力局面
- `client/src/game.ts`: `variantLabel`新增4种展示名(Atomic/Antichess/Racing Kings/Horde, 沿用Chess960先例不做中文翻译), `renderCaptured`调用改传`state.startFen`
- 首页玩法下拉框新增4个选项
- 历史页`VARIANT_LABELS`新增4个映射

不包含(明确排除):
- Crazyhouse(子项目4, 需要吃子收纳盒UI+打子走法, 是唯一走子模型本身不同的变体)
- Atomic爆炸的视觉动画、将军高亮针对不同变体的特殊处理——直接信任chessops的`isCheck()`按变体自身语义返回合理值, 客户端不做特判
- Chess960式的随机开局生成器(Horde/RacingKings用chessops自带的固定局面, 不需要)
- 完整lichess风布局(子项目5, 会替换掉现在这个临时下拉框)

## 技术方案

**服务端**: `Room`的`rules`字段类型本来就是chessops完整的`Rules`联合类型(`'chess'|'antichess'|'kingofthehill'|'3check'|'atomic'|'horde'|'racingkings'|'crazyhouse'`), 未做限定, 因此`Room`/`chessRules.ts`不需要任何代码改动即可支持这4个新规则值。`app.ts`的variant解析逻辑扩展:
```
if (variant === 'chess960') { chess960=true; startFen=generateChess960Fen(); }
else if (['3check','kingofthehill','atomic','antichess','racingkings','horde'].includes(variant)) { rules = variant; }
// 否则兜底 rules='chess', chess960=false
```
`Room`创建时若无`startFen`则调用`createGame(rules)`(不传fen), chessops的`defaultPosition(rules)`内部按规则自动选择正确开局——Horde/RacingKings拿到各自固定的非标准开局, Atomic/Antichess拿到标准开局。

`StateSnapshot`新增`startFen: string`字段, 取自`this.getInitialFen()`(已有方法, 整局不变, 每次广播都带上)。

**客户端**: `computeCapturedPieces(fen: string, startFen: string): CapturedPieces` —— 解析`startFen`的棋子分布得到"这局真正的满编基准"(按角色分白/黑数量), 再跟当前`fen`比对算缺口, 完全替代原来写死的`STARTING_COUNTS`常量。这是破坏性签名变更, 所有调用点(`game.ts`)同步更新传参; 标准棋/Chess960因为满编棋子类型数量本来就跟标准一致, 结果不受影响(纯粹是回归, 不是新行为)。

## 数据流

创建对局(`variant`=4个新值之一) → `app.ts`直接映射`rules`(无需生成器) → `Room`用`createGame(rules)`创建局面(chessops自动选对开局) → 每次`state`广播带上`startFen`(整局不变的初始FEN) → 客户端`renderCaptured`用`computeCapturedPieces(state.fen, state.startFen)`算出该局真实基准下的吃子展示 → 胜负判定全程由chessops的`pos.outcome()`处理, `Room`只做透传(复用`checkGameOver`已有的`variant-end`兜底分支, 不加新代码)。

历史页回放(`games.ts`)本来就已经用每局`startFen`重建棋盘(子项目2加的), 这次不需要额外改动就能正确回放这4个新变体的开局。

## 错误处理 / 边界情况

- `variant`非法值/缺失继续兜底`rules:'chess', chess960:false`, 复用现有防御式校验风格。
- `computeCapturedPieces`签名变更是破坏性改动, 现有调用点(`game.ts`)和现有测试(标准棋回归用例)都要跟着改传`startFen`参数, 用测试确保标准棋场景结果不变。
- Atomic爆炸导致多个棋子同时从棋盘消失、Horde残局兵力锐减到个位数, 都只是`fen`字段的正常刷新, 客户端渲染逻辑(棋盘/吃子展示)无需特殊处理, 会自动正确反映。
- 将军高亮(`localChess.isCheck()`)在这些变体下的行为完全交给chessops自身实现, 客户端不做变体判断——如果某个变体下这个高亮显示得不理想, 留作后续小修, 不阻塞本期。

## 测试

- **服务端**: 每个新变体一条轻量"链路打通"测试(创建对应`rules`的房间, 断言`getSnapshot().variant`正确、初始`fen`符合该规则预期——比如Horde开局白方兵力远超8个、RacingKings开局无兵、Atomic/Antichess用标准开局), 不重复验证chessops自身规则正确性。
- **客户端**: `computeCapturedPieces`现有测试改为显式传入标准开局FEN作为`startFen`参数(断言不变, 验证回归); 新增一条用chessops的Horde固定开局FEN做基准的测试, 验证非标准兵力局面下计算正确。
- **手动验收**: 4个变体各建一局实际走几步棋, 确认走子规则符合预期(比如Antichess强制吃子、RacingKings不能送将)、胜负判定chessops自动处理正确、吃子展示(含Horde大兵力场景)正常、玩法标签正确、历史回放能正确重建这4种变体各自的开局。
