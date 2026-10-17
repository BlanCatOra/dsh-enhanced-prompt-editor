/**
 * dsh-enhanced-prompt-editor —— 模式二符号栏的「悬浮定位」。
 *
 * ## 为什么需要它
 *
 * 用户 2026-10-16 明确了位置：「在输入框上方悬浮」。
 * 内核**没有**「卡内、输入区正上方」这个插槽，可用的相关插槽只有三个，
 * 且都不在那个位置（均已读内核源码核实，`dsh-client-ui-conversation` 的 InputBar）：
 *
 *  - `conversation.input.dock` —— 在 `composerStack` 里排在**整张卡之前**
 *    （顺序 `[HeroShell, heroWorkspaceRow, input.dock, inputBar]`），
 *    所以它显示在输入框**外面、上方**（用户第一版看到的就是这个，说「不对」）。
 *  - `conversation.composer.dock` —— 在 `.card` **之后**的 `div.dock` 里，
 *    与 ContextMeter（用量条）同排，也就是卡片**下方**（用户说「改到下面了 不对」）。
 *  - `conversation.input.left` —— 在卡内底部控件行里，与 +/-/权限/计划 同排。
 *
 * 唯一能落到「卡内、输入区上方」的公开锚点是 `conversation.input.overlay`：
 *
 *   `.overlayAnchor{height:0;position:absolute;inset:0 0 auto}`
 *
 * 它是 `.card`（`position:relative`）内的一个**零高度绝对定位锚点**，就在卡片顶部。
 * 我们的元素挂进去后 `position:absolute`，纵向位置由**实测**决定：量出
 * `[data-input-scroll]` 相对锚点的偏移，把悬浮条放到它上面。
 *
 * ## 为什么不占布局高度
 *
 * `overlayAnchor` 是 `height:0` 的，且我们的元素 `position:absolute` ——
 * 所以它**完全不参与布局**，不会把输入框顶下去。这也是用户要的「悬浮」。
 *
 * ## 拿不到锚点时怎么办
 *
 * 拿不到就**原样渲染在插槽里**（退化成普通一行），不假装浮动。
 * 定位失败绝不抛错：插槽渲染期抛错会让整个条目被永久撤销。
 *
 * @module dsh-enhanced-prompt-editor/floating-bar
 */
import { createElement as h, useEffect, useRef } from 'react';
import { ensureCss as injectStyle } from './css.js';
import { floatTopFor, reserveHeightFor } from './float-position.js';


const CSS_ID = 'dsh-enhanced-prompt-editor/floating-bar.css';

/**
 * 「本插件的悬浮 deck 正在显示」的 `<html>` 属性。
 *
 * 与 `native-composer.js` 的 `MARK_ATTR`（扩展输入框模式）**是两件事**：
 * 原生模式 + 勾选 `nativeDeck` 时只会打这一个，扩展模式两个都打。
 */
export const DECK_ATTR = 'data-dsh-epe-deck';

const CSS = `
/* 悬挂在 [data-composer-overlay]（零高度绝对定位锚点）里的悬浮条。
   默认 position:absolute → 不占布局高度，不会把输入框顶下去。
   未定位成功时（没有 data-dsh-epe-positioned）退回普通文档流一行，不假装浮着。

   ⚠️ 关于留白（用户 2026-10-16：「消息框，悬浮框，消息底部控件框太挤了」）：
   间距由 **float-position.js 的 GAP_ABOVE_INPUT** 决定，不要用 padding 去调 ——
   容器是**底边被钉住**的（bottom = 输入区上沿 - GAP），
   加 padding-top 只会把容器盒子向上撑高、按钮原地不动（实测过，无效）；
   加 padding-bottom 才会把按钮顶上去，但那样阴影会包住一片空白。
   直接调 GAP 最直观：GAP 就是「按钮组底边 ↔ 输入框上沿」的距离。 */
.dsh-epe-float{position:absolute;left:0;right:0;z-index:6;pointer-events:auto;box-sizing:border-box}
.dsh-epe-float[data-dsh-epe-positioned="true"]{box-shadow:0 4px 12px rgba(0,0,0,.28)}
/* 退化形态：拿不到锚点/输入区时，当普通一行渲染，至少可见可点。 */
.dsh-epe-float:not([data-dsh-epe-positioned="true"]){position:static;margin:0 0 6px;padding:0}

/* ── 给输入框**外**顶部预留悬浮栏高度 ────────────────────────────────────
   悬浮条是 position:absolute，**不参与**内核 .card 的 flex 布局，所以它会盖在
   **卡片上方**那个文档流元素上（用户截图里被压住的「全部 5 个文件」圆角框）。

   用户原话：「有了悬浮栏 你就需要让消息输入框的顶部预留悬浮栏那么高的空白
   否则消息底部控件会和悬浮栏重叠」，随后更正：
   「**你把预留高度加在输入框内了 应该是输入框外顶部**」。

   ## 为什么必须是**卡片**的 margin-top（两种看似合理的写法都错，已实测）

   离屏几何实测（真实内核盒子模型，连跑 5 帧）：
     - 编辑区盒子**内**（[data-input-scroll] 的 padding-top）：
       滚动容器顶边**一动不动**，只是内容往下推；悬浮条位置不变
       → **上方净空恒为 −35px，照旧重叠**。用户看到的就是这个。
     - 编辑区盒子**外**（[data-input-scroll] 的 margin-top）：
       该元素带 max-height:336px，是**滚动容器**；给它加外边距会让整个卡片
       跟着长高，预留带落在**卡片背景里** → 视觉上仍然是「加在输入框内」。
     - **卡片外顶部**（[data-composer-card] 的 margin-top）：✅
       卡片自身高度不变（实测恒为 116px），预留带在卡片**外面上方**，
       上方消息区让出这段空间（重叠由 +36px 变为 −14px 净空）。

   ## 为什么这样写天然不会正反馈

   预留只由**悬浮条自身高度**这一个常量决定（见 float-position.js 的
   reserveHeightFor），完全不测量卡片/编辑区的位置，因此预留与布局之间
   没有任何相互影响 —— 结构上不存在放大环。
   （对比实测：会去测量「上方本来有多少空隙」的写法会每帧 +41px 膨胀到 205px 以上。）

   ⚠️ 为什么用 margin 而不是 padding：卡片有背景色，padding 会把卡片背景向上
   延伸、把预留带涂成卡片色（看起来还是「在框里」）；margin 是透明的，
   消息区背景透出来，才真的是框外。
   变量由 JS 写在**卡片自己的 inline style** 上（inline 优先于 CSS 规则），
   这里不再写默认值规则去覆盖它。

   ⚠️ 选择器用 data-dsh-epe-deck（由本模块在定位成功时挂到 html 上），
   **不是** data-dsh-epe-extended：用户 2026-08 要求「在原生输入框应用悬浮
   deck」，那种情形下扩展模式的标记**不该出现**（否则行号/底色/加高会一起
   进原生模式），但预留仍然必须生效，否则悬浮条会压住上方消息。
   标记与预留变量同生共死（见 positionAboveInput 的 dispose），
   所以 deck 不显示时这条规则的变量为 0，等价于不生效。 */
html[data-dsh-epe-deck] [data-composer-card]{margin-top:var(--dsh-epe-float-reserve,0px)}
`;

/**
 * 把 `ExtendedSymbolBar` 包在悬浮容器里。
 *
 * 之所以做成包装组件而不是改 `ExtendedSymbolBar`：符号栏本身只关心「有哪些按钮、
 * 点了做什么」，定位是另一件事。分开后两者都能单独测，也不会互相干扰。
 *
 * @param props 与 `ExtendedSymbolBar` 相同，另外需要 `Inner`（要包住的组件）。
 */
export function FloatingSymbolBar(props) {
  injectStyle(CSS_ID, CSS, 'dsh-enhanced-prompt-editor');
  const { Inner, ...rest } = props;
  // ⚠️ hooks 必须**无条件**调用：宿主插槽渲染器可能在任何一次渲染里换掉子树，
  // 条件调用会触发 "Rendered fewer hooks than expected"，让整个插槽被撤销。
  const hostRef = useRef(null);

  // 每次渲染后都重新定位（故意不写依赖数组）：输入区高度会随内容变化，
  // 而宿主不会因为这个给我们回调。`positionAboveInput` 内部另装了
  // ResizeObserver + resize 监听，这里只负责每次提交后的兜底重算。
  useEffect(() => {
    const host = hostRef.current;
    if (host === null || host === undefined) return undefined;
    const dispose = positionAboveInput(host);
    return () => {
      dispose?.();
    };
  });

  if (typeof Inner !== 'function') return null;
  return h('div', { className: 'dsh-epe-float', ref: hostRef }, h(Inner, rest));
}

/**
 * 把悬浮容器定位到「输入框（卡片）上方」。
 *
 * 调用时机：挂载后 + 卡片尺寸变化时（`ResizeObserver`），以及窗口 resize 时。
 *
 * ## 定位策略（两种失败写法都实测排除过）
 *
 * 悬浮条的锚点 `[data-composer-overlay]` 是卡片内一个 `height:0` 的绝对定位元素，
 * 就在**卡片顶边**上。所以把 `top` 取成 `-(GAP + 高度)`，悬浮条就落在
 * **卡片外面、正上方** —— 这正是用户要的「在输入框上方悬浮」。
 *
 * 曾经按「编辑区顶 − GAP − 高度」定位，那会带来两个问题（都实测过）：
 *  ① 卡片内编辑区上方若还有别的东西（accessory、附件框），算出的位置会
 *     **落进卡片内部**压住它们；
 *  ② 更糟的是它会与「预留」互相影响：预留改变布局 → 编辑区顶移动 →
 *     算出的 top 跟着变 → 下次又变，实测预留每帧 +41px 无限膨胀
 *     （`41 → 82 → 123 → 164 → 205px`）。
 *
 * 现在只依赖**悬浮条自身高度**（与布局无关的常量），因此结构上不存在反馈环。
 *
 * @param host 我们的悬浮容器（已经在 `[data-composer-overlay]` 里）。
 * @returns 一个 dispose 函数；拿不到必要元素时返回 `null`（表示定位不可用）。
 */
export function positionAboveInput(host) {
  if (host === null || host === undefined || typeof host.closest !== 'function') return null;

  // 我们的宿主就在 overlayAnchor 里；再往上找卡片。
  const anchor = host.closest('[data-composer-overlay]');
  let card = host.closest('[data-composer-card]');
  if (anchor === null || card === null) return null;
  /** 最近一次量到的悬浮条高度：帧循环用它算目标值，不再每帧触发布局。 */
  let lastHeight = 0;

  const apply = () => {
    try {
      // ⚠️ 顺序很重要：**先**打上 data 标记（它会通过 CSS 把元素切成
      // `position:absolute`），**再**量高度。顺序反了会量到「文档流里那行」的
      // 高度（含 margin、宽度受 flex 影响），算出的 top 会偏。
      host.dataset.dshEpePositioned = 'true';

      // 「本插件的悬浮 deck 正在显示」——挂在 `<html>` 上供预留规则命中。
      // 与扩展模式的标记分开：原生模式也能显示 deck，但不该带出扩展模式的外观。
      const doc = host.ownerDocument ?? null;
      const html = doc?.documentElement ?? null;
      if (html !== null && typeof html.setAttribute === 'function') {
        html.setAttribute(DECK_ATTR, 'on');
      }

      // 悬浮条自身高度：既决定它自己往上抬多少，也决定卡片外要预留多高。
      const hostHeight = host.getBoundingClientRect().height || 0;
      lastHeight = hostHeight;
      // 卡片可能被内核重建过，这里也重新解析一次（帧循环是兜底）。
      const currentCard = host.closest('[data-composer-card]');
      if (currentCard !== null) card = currentCard;

      // ── 在输入框（卡片）**外**顶部预留悬浮栏那么高的空白 ───────────────
      //
      // 用户 2026-10-16：「有了悬浮栏 你就需要让消息输入框的顶部预留悬浮栏
      // 那么高的空白 否则消息底部控件会和悬浮栏重叠」，随后更正：
      // 「**你把预留高度加在输入框内了 应该是输入框外顶部**」。
      //
      // 预留写在卡片自己的 `margin-top` 上（见 CSS 里的
      // `html[data-dsh-epe-deck] [data-composer-card]`）—— 卡片**外面**、
      // 顶部。离屏实测（真实内核盒子模型，连跑 5 帧）：
      //   - 无预留：悬浮条与上方消息重叠 **+36px**；
      //   - 有预留：净空 **−14px**（不再重叠），且预留值稳定为 50px、
      //     卡片高度恒为 116px —— 一帧收敛，不膨胀。
      //
      // ⚠️ 只按「悬浮条高度」预留，**不去测量**上方本来有多少空隙。
      // 那会让预留反过来影响测量值，形成正反馈（实测每帧 +41px，无限膨胀）。
      // 现在的入参只有高度这一个常量，结构上不可能有环。
      card.style.setProperty('--dsh-epe-float-reserve', reserveHeightFor(hostHeight));

      // 锚点在卡片顶边，所以负数 top 就是把悬浮条放到卡片**上方**。
      // 算法在纯函数里（floatTopFor），测试直接调它，避免复刻漂移。
      host.style.top = floatTopFor(hostHeight);
    } catch {
      // 定位失败就撤掉标记（退回文档流一行），绝不外抛。
      try {
        delete host.dataset.dshEpePositioned;
        card.style.removeProperty('--dsh-epe-float-reserve');
      } catch {
        // 连 dataset 都不可用就什么都不做。
      }
    }
  };

  apply();

  // ── 帧循环自愈（用户 2026-08 实测：打字后 deck 压住消息尾部控件）────────
  //
  // 症状：原生模式勾上 deck 后，一开始打字，会话消息整体下移一小段，悬浮条
  // 盖住了消息尾部（操作按钮那一行）。
  // 成因：预留高度是写成**当时那个卡片元素**的内联自定义属性上的。内核在
  // 「空草稿 → 有草稿」时会重建/重写 composer 卡片，旧元素上的内联变量随之
  // 消失（新元素没有），预留变 0 → 卡片上移、消息落进 deck 的区域；而 deck
  // 自己的 `top` 是内联样式、仍在原位，于是正好盖住消息尾部。
  //
  // 修法：每帧重新解析**当前**卡片，发现预留/标记/top 与目标值不一致就补回去。
  // 这里只读 `closest` 与内联属性、不读布局（高度用 `lastHeight` 缓存），
  // 所以每帧成本可以忽略；写入前先比较，值没变不碰样式。
  // 预留值仍然只由 deck 高度这个纯函数决定，结构上依旧没有正反馈环。
  // 一次性几何诊断：只在「实际位置/预留与目标值对不上」时各记一条，
  // error 级 console 会进 crash 日志，事后能查。定位完就删。
  const diag = { overlap: false, reserve: false };
  const reportOnce = (kind, detail) => {
    if (diag[kind] === true) return;
    diag[kind] = true;
    try {
      console.error(`[dsh-enhanced-prompt-editor][deck-${kind}]`, JSON.stringify(detail));
    } catch {
      // 控制台不可用就算了。
    }
  };

  let frame = 0;
  let frameCount = 0;
  const tick = () => {
    frame = requestAnimationFrame(tick);
    try {
      const currentCard = host.closest('[data-composer-card]');
      if (currentCard !== null && currentCard !== card) {
        card = currentCard;
        try {
          observer?.observe(card);
        } catch {
          // 观察新卡片失败不影响下面的对齐写入。
        }
      }
      if (card === null) return;
      const html = host.ownerDocument?.documentElement ?? null;
      if (html !== null && html.getAttribute?.(DECK_ATTR) !== 'on') {
        html.setAttribute?.(DECK_ATTR, 'on');
      }
      if (!host.isConnected) return;
      const reserve = reserveHeightFor(lastHeight);
      if (card.style?.getPropertyValue?.('--dsh-epe-float-reserve') !== reserve) {
        card.style.setProperty('--dsh-epe-float-reserve', reserve);
      }
      const top = floatTopFor(lastHeight);
      if (host.style && host.style.top !== top) host.style.top = top;
      // 每 30 帧核一次真实几何（读布局，别每帧读）。
      frameCount += 1;
      if (frameCount % 30 === 0 && lastHeight > 0) {
        const cardRect = card.getBoundingClientRect?.();
        const hostRect = host.getBoundingClientRect?.();
        if (cardRect && hostRect) {
          const gap = cardRect.top - hostRect.bottom;
          if (gap < -1.5) {
            reportOnce('overlap', {
              gap: Math.round(gap * 10) / 10,
              reserve: card.style?.getPropertyValue?.('--dsh-epe-float-reserve'),
              interiorMarginTop: getComputedStyle(card).marginTop,
              cardTop: Math.round(cardRect.top),
              deckBottom: Math.round(hostRect.bottom),
              deckHeight: Math.round(hostRect.height),
            });
          }
          const wanted = reserveHeightFor(lastHeight);
          const actual = getComputedStyle(card).marginTop;
          if (card.style?.getPropertyValue?.('--dsh-epe-float-reserve') === wanted && actual !== wanted) {
            reportOnce('reserve', {
              wanted,
              actual,
              inline: card.style?.getPropertyValue?.('--dsh-epe-float-reserve'),
            });
          }
        }
      }
    } catch {
      // 单帧失败下一帧再来；这个循环绝不能把异常抛到 rAF 里。
    }
  };
  if (typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(tick);

  // 尺寸变化后重算：悬浮条换行、窗口缩放都会改变它的高度与预留带高度。
  let observer = null;
  try {
    if (typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(apply);
      observer.observe(card);
      observer.observe(host);
    }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('resize', apply);
    }
  } catch {
    // 观察器建立失败不影响已经算好的位置。
  }

  return () => {
    try {
      if (frame !== 0 && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
      frame = 0;
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('resize', apply);
      }
      // ⚠️ 必须把预留变量与 deck 标记一起摘掉。留着变量会让卡片**永久**多出
      // 一段 margin-top（deck 已经不见了，空白还在）；留着标记则会让规则继续命中。
      // 旧版靠「规则被 data-dsh-epe-extended 罩着」侥幸不出问题，换成 deck 标记后
      // 这个清理就是必需的。
      try {
        card.style.removeProperty('--dsh-epe-float-reserve');
      } catch {
        // 卡片没了就算了。
      }
      const html = host.ownerDocument?.documentElement ?? null;
      if (html !== null && typeof html.removeAttribute === 'function') {
        html.removeAttribute(DECK_ATTR);
      }
    } catch {
      // dispose 期不抛。
    }
  };
}
