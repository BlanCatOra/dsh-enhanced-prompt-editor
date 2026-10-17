/**
 * dsh-enhanced-prompt-editor —— 扩展输入框模式（模式二）的符号快捷键行。
 *
 * ## 它和面板里那条是什么关系
 *
 * **同一份符号表、同一份行为规则**（`./edit-ops.js`），只是作用对象不同：
 *  - 面板里编辑的是 `textarea`，选区来自 `selectionStart/End`；
 *  - 扩展输入框编辑的是内核的 Lexical contenteditable，写入要走内核 API。
 *
 * 所以这里**不重复实现「包裹」逻辑**：读出选中文字与全文，交给 `edit-ops.js`
 * 的纯函数算出结果，再整体写回。这样「选中文字被框住而不是被替换」这条规则在
 * 两个模式里天然一致，不会各修一份、各错一处。
 *
 * ## 为什么用 inputActions 而不是直接改 Lexical
 *
 * 内核给插件留了**官方程序化插入 API**（`inputActions` 是 session 级插槽的
 * 标准席位）：
 *
 *  - `captureInsertion()` → `{ start, end, draftRev }`，坐标是**全文 detect 坐标**
 *    （不是 Lexical 节点内 offset，跨段落也正确）；
 *  - `insertText(text, span)` → 校验 `draftRev` 后替换该区间，并**自带提交机
 *    防护**（`adjudicating`/`submitting` 阶段返回 `false`）。
 *
 * 直接用 Lexical 的 `_selection.anchor.offset` 是**节点内偏移**，跨段落会算错；
 * 而且绕过提交机在敏感阶段写草稿会被静默拒绝。所以这里走官方通道。
 * `insertText` 返回 `false` 表示这次草稿已变/正在提交，此时**不重试、不硬写**。
 *
 * ## 为什么按钮必须 onMouseDown preventDefault
 *
 * 一旦按钮拿到焦点，contenteditable 的选区就会塌掉，`captureInsertion()` 拿到
 * 的区间会变成末尾的空区间，「包裹选中的文字」就落空了。阻止默认行为能让编辑器
 * 始终持有选区。
 *
 * @module dsh-enhanced-prompt-editor/extended-bar
 */
import { createElement as h, Fragment } from 'react';
import { INDENT_BUTTONS, SYMBOLS, applySymbol, indentLines } from './edit-ops.js';
import { ensureCss as injectStyle } from './css.js';
import { ComposerGutter } from './composer-gutter.js';

const CSS_ID = 'dsh-enhanced-prompt-editor/extended-bar.css';
const CSS = `
/* 符号栏容器。
   ⚠️ 居中：用户 2026-10-16 反馈「快捷栏没有居中对齐」。上一版用
   flex:1 1 auto 让它占满剩余宽度、按钮靠左，视觉上整条偏左。
   现在用 width:100% + justify-content:center：容器仍占满输入框宽度，
   但**按钮组在容器内水平居中**（换行后的每一行也居中）。
   不要改成 flex:none + margin:0 auto —— 块级 flex 容器 width:auto
   本来就撑满父级，margin:auto 不起作用，按钮仍会靠左。
   'max-width:100%' + 'flex-wrap' 保证窄窗口下换行而不溢出。 */
/* 按钮高 28px、间距 6px —— 对齐内核底部控件的尺寸基准：
   内核 .add（那个 + 按钮）实测 width:28px;height:28px，底部控件行 min-height:36px。
   原来 24px 高 + 4px 间距在这个尺度下显得很挤
   （用户 2026-10-16：「消息框，悬浮框，消息底部控件框太挤了」）。 */
.dsh-epe-xbar{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:6px;width:100%;max-width:100%;min-width:0;padding:0 0 2px;margin:0}
.dsh-epe-xkey{flex:none;height:28px;min-width:28px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.28));border-radius:7px;background:var(--dsw-specific-input-major,transparent);color:var(--dsw-alias-label-secondary,currentColor);font:500 13px/1 ui-monospace,SFMono-Regular,Menlo,monospace;cursor:pointer}
.dsh-epe-xkey:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));color:var(--dsw-alias-label-primary,currentColor)}
.dsh-epe-xkey:disabled{opacity:.45;cursor:default}
.dsh-epe-xkey:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#5686fe);outline-offset:1px}
/* 分隔条高度跟随按钮（28px）按比例放大：18px 比按钮略矮，视觉上是分隔而不是截断。 */
.dsh-epe-xkeySep{flex:none;width:1px;height:18px;margin:0 4px;background:var(--dsw-alias-border-l1,rgba(127,127,127,.28))}

/* ── 模式二的行号 + 逻辑行交替底色（与模式一同款功能）────────────────────
   模式二的编辑区是**内核的 Lexical contenteditable**，不是我们的 textarea，
   所以既不能给它加 background-image，也没有我们自己的行高变量可用。
   做法（离屏 Chromium 实测可行，见 test/extended-bar-geometry.test.mjs）：

   内核（dsh-client-ui-conversation/lib/client.js）的真实结构与几何：
     .card[data-composer-card]
       .scroll[data-input-scroll]      overflow-y:auto
         .grow{position:relative}
           .input[data-composer-input]  contenteditable
             padding:4px 8px 0 14px; min-height:36px;
             line-height:calc(24px + var(--dsh-content-font-delta,0px))
             p{margin:0}                  一个逻辑行 = 一个 p
   软换行的物理行**没有独立元素**，它们共用那一个 p 的盒子。

   于是：交替底色画在 p 的盒子上。p 的盒高天然等于该逻辑行全部物理行之和，
   所以「同一逻辑行的软换行物理行同色」自动成立，且**不依赖任何行高数值**
   —— 不需要模式一那套整数行高的渐变（这里的行高由内核变量决定，我们读不到
   也不该覆盖它）。行号同理：用 CSS counter 直接数 p 的个数，不用 JS 测量。

   三个必须点：
   1. 段落盒子要横向铺满整个输入区，做法是「负 margin + 等量 padding」相消：
      文字位置一格不动（离屏实测文字仍在 p 的 content box 起点），而盒子边界
      扩到输入框自身的 padding 区。这样条纹才铺满整行，行号也才有地方放。
      ⚠️ 不要用改 input 的 padding 来腾地方 —— 那会把文字整体推右、改变内核
      的换行位置，等于重排宿主输入区（E-011 的同类错误：动了不该动的盒子）。
   2. 行号纵向必须落在该 p 的**第一个物理行**里：::before 用 top:0 且
      line-height:inherit，让它与首行的行盒同高同位，基线自然对齐。
      若改成垂直居中（top:50% / translateY(-50%)），多物理行的行号会跑到中间，
      几何测试会变红。
   3. 内核对齐锚点只用了公开属性 data-composer-input 与
      html 上的 data-dsh-epe-extended（由 native-composer.js 写入），
      不猜内核的哈希类名。
   ⚠️ 本段注释绝不能出现反引号 —— 它落在 CSS 模板字符串内部，会提前闭合字符串。 */
/* ── 行号沟槽 + 交替底色 ─────────────────────────────────────────────
   ⚠️⚠️ 2026-10-16 修正：这里原先用 CSS counter 数 > p
   （counter-reset / counter-increment / nth-of-type(odd)）。**那是错的** ——
   内核的粘贴通道是 insertRawText()，文本里的换行变成 <br>
   （LineBreakNode.createDOM() → "br"），**不是新的 <p>**。
   粘一个 80 行提示词只得到「1 个 p + 79 个 br」，
   counter 恒为 1、nth-of-type(odd) 只命中那唯一的 p
   → 用户报的「模式二没有行标数、背景色不变化」。
   离屏实测真实产物：pCount=1, brCount=7, textLines=8, lineNumbers=1。
   详见 ./composer-rows.js 的模块注释。

   现在改成**按视觉行**：行数由 JS 量真实行盒（composer-rows.js），
   底色写成每个 p 的 inline background-image，行号渲染成绝对定位的 gutter。
   两者都不改内核 DOM。 */

/* ⚠️⚠️ 这两个变量必须在**模式二自己的作用域**里定义。
   --dsh-epe-line / --dsh-epe-stripe 原先只在 panel.js 的 CSS 里定义
   （作用域是侧栏面板），模式二里根本不存在 —— 而 var(--x) 在未定义时
   会让**整条 background-image 被判无效并丢弃**，浏览器不报错。
   实测表现为 getComputedStyle(p).backgroundImage === "none"，
   条纹一条都不显示（与 E-016 同族：静默失效）。
   行高由 JS 按实测值写进 inline style（见 composer-gutter.js）；
   这里的值是首帧 / 降级时的兜底。 */
html[data-dsh-epe-extended] [data-composer-input]{
  --dsh-epe-line:24px;
  --dsh-epe-stripe:color-mix(in srgb,var(--dsw-alias-label-primary,currentColor) 5%,transparent);
  position:relative
}
html[data-dsh-epe-extended] [data-composer-input]:focus{
  --dsh-epe-stripe:color-mix(in srgb,var(--dsw-alias-brand-primary,#5686fe) 7%,transparent)
}
/* ⚠️⚠️ 底色**不再**画在 <p> 上，而是画在**输入区自身**（background-image）。
   用户 2026-10-17：「分行依旧未使用模式一的实现 你不能照搬吗」——
   模式一的底色就是整块画在编辑区元素上的（panel.js 把 backgroundImage
   写在 textarea 的 style 上），行号是**编辑区之外的独立一列**。
   画在 <p> 上会引出一堆特例：粘贴产物可能只有 1 个 <p>（换行全在文本节点
   里）、也可能是 N 个 <p>，还得逐个折算局部行号 —— 那正是前两版错误的来源。
   画在输入区上，几何就只有一套：逻辑行 → 视觉行 → 渐变带。
   ⚠️ background-origin/clip: content-box 让条纹**只铺在文字列**上，
   与模式一一致（模式一的 gutter 是独立一列、不染色）。JS 会读回
   background-origin 决定渐变起点该不该减 padding-top —— 两边不会漂移。 */
html[data-dsh-epe-extended] [data-composer-input]{
  background-repeat:no-repeat;background-origin:content-box;background-clip:content-box
}

/* ⚠️ 行号要占**真实宽度**，不能压在文字上（用户 2026-10-17：「行标与光标重叠」）。
   模式一的布局是 flex 两列：gutter（flex:none）+ textarea —— 行号独占一列，
   文字在它**右边**，永远不会被盖住。这里照搬：
     · 输入区 padding-left = 沟槽宽（行号列，文字列的起点）
     · 行号 gutter 绝对定位在 0..沟槽宽
     · 文字从内容盒左缘（= 沟槽右缘）开始
   ⚠️ 曾经用「<p> 负 margin 把盒子拉回输入区左缘」的写法，那是错的 ——
   文字会被拉回 14px，正好落在 0..26px 的行号列**下面**（用户截图里
   「行标与光标重叠」就是这个）。行号列必须真正把文字挤到右边。
   ⚠️ 三个数**不是同一个值**，写成一个就会再次重叠或推偏文字。 */
html[data-dsh-epe-extended] [data-composer-input]{
  --dsh-epe-gutter-w:26px;
  padding-left:var(--dsh-epe-gutter-w);
}
/* 占位提示（内核 .placeholder）是**独立兄弟节点**，inset 里写死左 14px。
   沟槽加宽后它不跟随 —— 不补这条，占位文字会压在行号列上。
   data-composer-placeholder 是内核公开属性（见 DraftEditor 的 JSX）。 */
html[data-dsh-epe-extended] [data-composer-placeholder]{left:var(--dsh-epe-gutter-w,26px)}

/* 行号 gutter：绝对定位在 .grow 内（内核 .grow 是 position:relative）。
   ⚠️ 它必须是**不接收指针事件**的纯装饰；点击穿透到输入区，光标行为不变。
   span 的高度 = 该逻辑行占的视觉行数 × 实测行高（与模式一同款算法），
   所以下一个行号自然落在它自己那条逻辑行真正开始的视觉行上。 */
.dsh-epe-xgutter{position:absolute;top:0;left:0;width:var(--dsh-epe-gutter-w,26px);
  box-sizing:border-box;padding-right:6px;text-align:right;
  color:var(--dsw-alias-label-tertiary,currentColor);opacity:.55;font-weight:400;
  font-size:var(--dsh-epe-gutter-font,12px);
  line-height:var(--dsh-epe-line,24px);
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-variant-numeric:tabular-nums;
  pointer-events:none;user-select:none;z-index:1;overflow:hidden}
.dsh-epe-xgutter span{display:block;width:100%;text-align:right;white-space:nowrap;overflow:hidden}
`;

/**
 * 扩展输入框模式的符号行（也是「原生 + 悬浮 deck」时复用的那个 deck）。
 *
 * @param props 由插槽注入：`t`、`useVisible()`（deck 是否可见：扩展模式
 *   **或** 原生模式勾选了「原生应用悬浮 deck」）、`useExtended()`
 *   （是否真的处于扩展输入框模式 —— 决定要不要画行号沟槽）、
 *   `inputActions`（标准席位，官方程序化插入通道）、`useInput()`
 *   （标准席位，读草稿全文）。
 */
export function ExtendedSymbolBar(props) {
  injectStyle(CSS_ID, CSS, 'dsh-enhanced-prompt-editor');
  const { t, useVisible, useExtended, inputActions, useInput } = props;

  // 草稿全文来自标准席位 useInput（投影里的 `draft`）。必须放在组件顶层
  // （Rules of Hooks），不能塞进事件回调。
  const draft = useInput === undefined ? '' : useInput((state) => state?.draft ?? '');

  // ⚠️ `visible` 必须走快照源绑定出来的 hook：插槽渲染器把 inject 的结果按
  // (entry, binding) 缓存且永不失效，传值会把它冻在第一帧，切回原生后这条还在。
  const visible = useVisible((value) => value);
  /**
   * 是否处于**扩展输入框模式**（决定要不要画行号沟槽 + 隔行底色）。
   *
   * ⚠️ 与 `visible` 是两个判断：`visible` 还包含「原生 + 悬浮 deck」，
   * 而那种情形**只要 deck**，不要行号。
   *
   * ⚠️ hook 必须**无条件按同一位置**调用。注入面一定给 `useExtended`，
   * 但万一没给（旧宿主/单测面），退回到 `useVisible` —— 两者内部 hook 数量
   * 一致，因此不会破坏 Rules of Hooks，也不会让整条插槽被撤销。
   */
  const extendedHook = typeof useExtended === 'function' ? useExtended : useVisible;
  const extended = extendedHook((value) => value) === true;
  if (visible !== true) return null;

  /**
   * 对原生输入框做一次「整块替换」编辑。
   *
   * @param compute `(text, start, end) => { text, selStart, selEnd }`，
   *   由 `edit-ops.js` 的纯函数提供。
   */
  const apply = (compute) => {
    if (inputActions === undefined || inputActions === null) return;
    let span;
    try {
      span = inputActions.captureInsertion?.();
    } catch {
      return;
    }
    if (span === undefined || span === null) return;

    // `captureInsertion()` 给的是**全文 detect 坐标**下的区间（与 draft 的
    // 字符下标一致），不是 Lexical 节点内 offset——所以直接拿它切 draft 是对的。
    const full = typeof draft === 'string' ? draft : '';
    const start = Number.isFinite(span.start) ? span.start : full.length;
    const end = Number.isFinite(span.end) ? span.end : start;
    const selected = full.slice(Math.min(start, end), Math.max(start, end));

    // 关键：`insertText(text, span)` 的语义是**用 text 替换该 span**（内核
    // `$replaceDetectSpanWithText` → `selection.insertText`，会先 removeText）。
    // 所以「包裹」= 传入 `符号 + 选中文字 + 符号`。
    // 这里用 edit-ops 的纯函数算出这串文本，与面板共用同一份规则。
    const wrapped = compute(selected, 0, selected.length);
    if (wrapped === undefined || wrapped === null) return;
    const payload = wrapped.text;
    if (payload === selected) return; // 没有变化就不写。

    try {
      // `insertText` 自己校验 draftRev；返回 false 说明草稿已变或在提交中，
      // 此时**不重试**——重试会拿过期区间去改新草稿，反而破坏内容。
      inputActions.insertText?.(payload, span);
    } catch {
      // 插槽渲染期抛错会让条目被永久撤销；这里必须自己兜住。
    }
  };

  const key = (keyName, label, title, onClick) =>
    h(
      'button',
      {
        key: keyName,
        type: 'button',
        className: 'dsh-epe-xkey',
        title,
        'aria-label': title,
        // 阻止抢焦点：否则 contenteditable 选区塌掉，captureInsertion 落到末尾。
        onMouseDown: (event) => event.preventDefault(),
        onClick,
      },
      label,
    );

  // 行号 gutter + 交替底色：portal 到内核编辑区里，不改内核 DOM。
  // ⚠️ 必须把 `draft` 传进去：逻辑行以**草稿文本**为唯一权威
  //（与模式一的 `text.split('\n')` 同源），见 composer-gutter.js 的模块注释。
  // ⚠️ 只属于**扩展输入框模式**：原生模式勾选「应用悬浮 deck」时只借这条 deck，
  // 不加行号、不改原生外观（`extended` 与 `visible` 的差别）。
  // 与符号栏并列返回（Fragment），两者各自独立失败互不影响。
  const gutter = extended ? h(ComposerGutter, { active: true, draft }) : null;

  return h(
    Fragment,
    null,
    gutter,
    h(
    'div',
    {
      className: 'dsh-epe-xbar',
      role: 'toolbar',
      'aria-label': t?.('panel.keys') ?? 'Insert',
    },
    SYMBOLS.map((symbol) =>
      key(symbol.key, symbol.label, `${t?.(`symbol.${symbol.key}`) ?? symbol.label} ${symbol.label}`, () =>
        apply((text, start, end) => applySymbol(text, start, end, symbol)),
      ),
    ),
    h('span', { className: 'dsh-epe-xkeySep', 'aria-hidden': true }),
    INDENT_BUTTONS.map((button) =>
      key(button.key, button.label, t?.(`panel.${button.key}`) ?? button.label, () =>
        apply((text, start, end) => indentLines(text, start, end, button.outdent)),
      ),
    ),
    ),
  );
}
