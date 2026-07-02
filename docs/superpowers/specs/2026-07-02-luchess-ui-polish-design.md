# luchess UI Polish + Invite Link — 设计文档

日期: 2026-07-02

## 背景 / 目标

luchess核心功能已上线部署。当前UI是无样式的裸HTML(见`client/public/style.css`), 用户反馈两点:

1. 视觉太粗糙, 想要美化。
2. 创建对局后直接跳到棋盘页, 没有任何提示告诉创建者要把链接发给朋友——邀请流程不直观。

本设计覆盖这两块, 都是纯前端改动, 不涉及协议/后端/数据库改动。

## 范围

包含:
- 三个页面(首页/对局页/历史页)的深色主题CSS重写: 深灰背景+翻译绿强调色, 系统字体栈, 卡片式布局, 按钮/表单/走子列表/求和悔棋横幅的样式化。
- 棋盘本身保持chessground自带的brown棋盘+cburnett棋子不变, 只重新设计棋盘周围的chrome。
- 对局页新增"邀请面板": 房间状态为`waiting`时显示分享链接+复制按钮, 对手加入(状态变`playing`)后自动隐藏。

不包含:
- 任何协议(WebSocket消息格式)、状态机(`room.ts`)、数据库改动。
- 二维码分享、多语言、亮色模式切换、动画库等额外依赖。
- 棋盘方格/棋子皮肤更换。

## 技术方案

**CSS**: 用CSS自定义属性(`:root`里定义`--bg`/`--card`/`--accent`/`--text`等变量)重写`client/public/style.css`, 系统字体栈(`-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`), 不引入任何构建期依赖或外部字体请求。

**HTML**: 三个`public/*.html`文件加少量包装元素(如外层`<div class="page">`卡片容器), 不删除/不改名任何现有id(`create-btn`/`board`/`clock-top`/`resign-btn`/`games-list`等), 保证`main.ts`/`game.ts`/`games.ts`的DOM查询全部不受影响。

**邀请面板(新)**: `game.html`新增:
```html
<div id="invite-panel" class="invite-panel" hidden>
  <p>等待对手加入... 分享链接给你朋友:</p>
  <div class="invite-row">
    <input id="invite-link" type="text" readonly />
    <button id="copy-invite-btn">复制邀请链接</button>
  </div>
</div>
```
`game.ts`的`applyState(state)`函数末尾新增一段: 当`state.status === 'waiting'`时, 显示该面板并把`invite-link`的value设为`location.href`; 否则隐藏。`copy-invite-btn`绑定一次性click监听器, 调用`navigator.clipboard.writeText(location.href)`, 成功后按钮文案临时变为"已复制!", 2秒后用`setTimeout`还原为"复制邀请链接"。

## 组件设计

**配色变量** (`:root`):
```css
--bg: #1a1a1a;
--card: #242424;
--border: #333333;
--text: #e8e8e8;
--text-muted: #9a9a9a;
--accent: #629924;
--accent-hover: #7ab52e;
```

**布局**: 三页统一用居中卡片容器(`max-width` 限制, 圆角, 轻微box-shadow, `var(--card)`背景), 顶部标题小号加粗。首页表单纵向排列, label/select样式化(深色select, 圆角边框, focus态强调色描边)。对局页棋盘居中, 计时器数字用等宽字体+较大字号, 按钮组水平排列圆角按钮(认输用中性灰边框, 求和/悔棋用强调色边框), 走子列表用等宽字体网格。历史页列表项卡片化, hover态高亮。

**offer-banner / invite-panel**: 都用`var(--accent)`半透明背景+左侧色条强调, 圆角, 轻微fade-in(`opacity`+`transform`的CSS transition, 无需JS/动画库)。

## 数据流

无新数据流——`invite-panel`的显示/隐藏完全由已有的`state.status`字段驱动(WebSocket `state`广播里已经有这个字段), 复制链接是纯客户端`navigator.clipboard`调用, 不涉及网络请求。

## 错误处理 / 边界情况

- `navigator.clipboard.writeText`在非HTTPS/非localhost环境下可能不可用(权限受限于安全上下文)。luchess当前通过`http://`裸IP:端口访问(非HTTPS), 因此调用可能抛错。需要`try/catch`包裹, 失败时退化为选中输入框文字(`inviteLinkInput.select()`)方便用户手动Ctrl+C, 而不是静默失败。
- 复制成功但用户没注意到按钮文案变化: 按钮文案变化已经是最小可行反馈, 不额外加toast(YAGNI, 避免过度设计)。

## 测试

- **手动验收**: 桌面浏览器分别打开首页/对局页(等待态+对局中态+结束态)/历史页, 确认新样式渲染正常, 所有现有交互(创建对局/走子/认输/求和/悔棋/观战/历史回放)照常工作(样式改动不应影响任何既有自动化测试, 因为DOM id不变)。额外验证: 创建对局后等待面板正确显示分享链接, 点击复制按钮后文案变化, 对手加入后面板自动消失; 在当前HTTP部署环境下测试`clipboard.writeText`失败时的降级行为(手动选中文字)是否生效。
- **不需要新增/修改自动化测试**: 现有`server`测试(33个)和`client`测试(clock/wsClient共7个)覆盖的都是逻辑而非样式, 本次改动不触碰这些逻辑, 预期这些测试保持全绿。若`renderInvitePanel`包含可独立测试的纯函数逻辑(如根据`status`判断面板显示/隐藏的布尔值), 可以为其加一个轻量单元测试, 但不强制要求覆盖`navigator.clipboard`调用本身(浏览器API, 手动验收已覆盖)。
