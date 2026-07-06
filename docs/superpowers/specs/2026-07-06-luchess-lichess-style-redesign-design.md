# luchess Lichess风格重设计 — 设计文档

日期: 2026-07-06

## 背景 / 目标

`2026-07-02-luchess-ui-polish-design.md`完成了第一版深色主题美化(见`client/public/style.css`), 但整体还是单栏卡片、原生下拉框的朴素样式。用户反馈想要"简单大方, 又不缺失功能"的进一步美化, 明确参照方向是lichess.org的视觉语言。

本设计在上一版基础上做第二轮迭代: 配色/字体细节向lichess靠拢, 对局页/历史页改为桌面双栏布局(棋盘+侧边栏), 移动端(<900px)保持单栏堆叠, 棋盘宽度改为响应式。纯前端CSS+HTML结构调整, 不改协议/后端。

## 范围

包含:
- 三个页面(首页/对局页/历史页)的配色变量微调(向lichess的暖黑背景/绿色强调色靠拢), 按钮/select的视觉细化(自定义下拉箭头, focus态)。
- 对局页/历史页在`≥900px`视口下改为CSS Grid双栏布局: 左列棋盘(含双方计时器/吃子/变体标签), 右列侧边栏(走子列表/操作按钮/求和悔棋横幅/邀请面板)。`<900px`自动降级为原有单栏纵向堆叠。
- 棋盘容器`.cg-wrap`宽高从固定`480px`改为`min(480px, 92vw)`, 让手机端不溢出屏幕。
- 走子列表(`#move-list`)从简单flex换行改为"回合号+两步"的行式布局, 交替底色, 可滚动。
- 历史页游戏列表(`#games-list`)行样式细化(hover态轻微上浮阴影)。
- 按钮hover态过渡效果微调(现有transition基础上统一时长/曲线), 不引入JS驱动的动画。

不包含:
- 协议(WebSocket消息格式)、状态机(`room.ts`)、数据库改动——与上一版一致。
- 棋盘方格/棋子皮肤更换(继续用chessground自带brown+cburnett)。
- 亮色模式/双主题切换(用户已确认仅暗色)。
- 用`<select>`之外的自定义组件(如分段按钮)替换现有表单控件——保留原生`<select>`, 只改样式, 避免改动`main.ts`的DOM查询逻辑。
- 走子高亮"当前步"等需要额外状态追踪的功能(YAGNI, 现有`state`里没有"最后一步"标记字段, 加这个属于功能扩展而非纯视觉重排)。

## 技术方案

**CSS**: 继续在`client/public/style.css`的`:root`里扩展/调整变量, 新增`--danger`(认输按钮用)。新增一组`@media (min-width: 900px)`规则, 把`.game-layout`和历史页容器从`flex-direction: column`改为`display: grid; grid-template-columns: auto 320px`(棋盘列宽度由`.cg-wrap`的`min(480px, 92vw)`自然撑开, 侧边栏固定320px)。`<900px`时这组grid规则不生效, 退回现有`flex column`布局, 保证移动端行为等价于当前版本。

**HTML结构调整**: `game.html`和`games.html`内部新增一层包装元素做布局分组(例如`<div class="board-col">`包棋盘+计时器+吃子+变体标签, `<div class="side-col">`包走子列表+按钮+横幅), 但**不改变、不删除任何现有id**(`board`/`clock-top`/`clock-bottom`/`move-list`/`resign-btn`/`draw-btn`/`undo-btn`/`invite-panel`/`invite-link`/`copy-invite-btn`/`variant-label`/`captured-top`/`captured-bottom`/`offer-banner`/`games-list`/`replay-board`/`replay-prev`/`replay-next`), 保证`game.ts`/`games.ts`/`main.ts`的`document.getElementById`调用全部不受影响, 无需改动任何`.ts`文件。

**走子列表**: `.move-list`从`display:flex;flex-wrap:wrap`改为CSS Grid(`grid-template-columns: auto 1fr 1fr`每行一个回合号+两步), 配合`moveListEl.innerHTML`现有的每步一个`<li>`结构——这里需要小改`game.ts`里`moveListEl.innerHTML`的拼接逻辑, 把"回合号+白方步+黑方步"归组到同一行(目前是每个半步一个`<li>`, 回合号只加在偶数索引前缀里, 视觉上仍能通过flex-wrap接受, 但grid双列排布需要每行两个格子对齐, 因此需要把生成逻辑从"每半步一个li"改为"每回合一个li, 内部两个span")。这是本设计唯一涉及`.ts`文件的改动, 逻辑不变(仍是纯渲染`state.historySan`), 只改DOM拼接方式。

## 组件设计

**配色变量** (`:root`, 在现有基础上调整/新增):
```css
--bg: #14140f;       /* 原#1a1a1a, 更接近lichess暖黑背景 */
--card: #1e1d18;     /* 原#242424 */
--border: #38352c;   /* 原#333333, 略带暖色 */
--text: #e9e8e6;
--text-muted: #9b9a95;
--accent: #7fae00;   /* 原#629924, 更贴近lichess绿 */
--accent-hover: #96c412;
--danger: #c33;      /* 新增, 认输按钮描边色 */
--radius: 8px;        /* 原10px, 略收紧 */
```

**首页**: 卡片布局不变, 微调间距/字号层级, 主按钮(`#create-btn`)加大内边距+字重, `<select>`自定义箭头(CSS `appearance:none`+背景SVG箭头)+更明显的focus描边。

**对局页(≥900px双栏)**:
```
grid-template-columns: auto 320px;
grid-template-areas:
  "board side";
```
左列(`board-col`): 邀请面板/变体标签/对方计时器+吃子/棋盘/己方计时器+吃子, 纵向居中排列。
右列(`side-col`): 走子列表(可滚动, `max-height`限制+`overflow-y:auto`)在上, 操作按钮组+求和悔棋横幅在下, 侧边栏整体`position:sticky`跟随滚动(棋盘区域较矮时体验更像lichess)。
`<900px`: 两列合并为一列, 顺序沿用现有DOM顺序(邀请面板→变体标签→吃子→棋盘→按钮→横幅→走子列表), 走子列表放最后, `max-height`限制配合可滚动, 避免页面无限拉长。

**走子列表行式布局**:
```css
.move-list {
  display: grid;
  grid-template-columns: 2.5rem 1fr 1fr;
  max-height: 320px;
  overflow-y: auto;
}
.move-list li { display: contents; }
.move-list .move-num { color: var(--text-muted); }
```
`game.ts`里`moveListEl.innerHTML`按回合拼接, 例如:
```ts
const rows: string[] = [];
for (let i = 0; i < state.historySan.length; i += 2) {
  const num = i / 2 + 1;
  const white = state.historySan[i] ?? '';
  const black = state.historySan[i + 1] ?? '';
  rows.push(`<li><span class="move-num">${num}.</span><span>${white}</span><span>${black}</span></li>`);
}
moveListEl.innerHTML = rows.join('');
```

**历史页(≥900px双栏)**: 左列`#games-list`(固定宽度, 可滚动), 右列回放棋盘+上一步/下一步按钮。`<900px`退回单栏, 列表在上棋盘在下(与现状一致)。

**按钮hover/微动画**: 统一`transition: border-color .15s ease, background .15s ease, transform .1s ease`, hover态增加`transform: translateY(-1px)`轻微上浮; `#games-list li a`hover态加`box-shadow`轻微投影, 过渡同参数, 不引入额外JS或动画库。

## 数据流

无新数据流。走子列表拼接从"半步为单位"改为"整回合为单位", 数据源仍是`state.historySan`(服务端WebSocket广播的既有字段), 只是客户端渲染时的分组方式变化。

## 错误处理 / 边界情况

- **奇数步数(轮到黑方走完但白方还未走, 即当前是黑方等待/白方刚走完一步)**: `state.historySan[i+1]`可能是`undefined`, 上面代码用`?? ''`兜底为空字符串, 该回合行黑方格子留空, 不会抛错。
- **窄屏棋盘缩放**: `min(480px, 92vw)`保证棋盘不会比视口宽, 但在`320px`宽的极小屏幕上棋盘会缩到约294px, chessground本身按容器尺寸自适应缩放, 不需要额外处理。
- **侧边栏sticky在矮棋盘/长走子列表时的滚动交互**: 用`overflow-y:auto`限制在`.move-list`内部滚动, 不影响整页滚动, 避免sticky侧边栏和页面滚动打架。

## 测试

- **自动化**: `client`目录下`npm test`须保持全绿(现有`clock`/`wsClient`/`capturedPieces`/`invitePanel`/`pgnReplay`测试不测DOM渲染细节, 预期不受影响)。`game.ts`里走子列表拼接逻辑改动较小, 若现有测试未覆盖这段, 可视情况加一个纯函数级单元测试(把拼接逻辑抽成可测的小函数), 不强制。
- **手动验收**: 用`run`技能起本地服务, 分别在桌面宽度(>900px)和手机宽度(iPhone尺寸模拟)下过一遍: 首页创建对局(各种玩法/时限组合)、对局页等待态(邀请面板)、双人对局中(两个标签页模拟双方, 验证走子列表分行、计时器、吃子图标、认输/求和/悔棋横幅)、对局结束态、历史页列表+回放翻页。截图对比现有`*.png`截图确认无功能性回归(所有交互行为不变, 只是布局/配色变化)。
