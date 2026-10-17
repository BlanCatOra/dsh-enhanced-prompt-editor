/**
 * dsh-enhanced-prompt-editor —— 模式二的行号沟槽 + 交替底色。
 *
 * @module dsh-enhanced-prompt-editor/composer-gutter
 *
 * ## 做什么
 *
 * 把「行号」与「交替底色」画到**原生**输入框（`[data-composer-input]`）上，
 * 让模式二和模式一（侧栏编辑器）在视觉上统一。用户 2026-10-16：
 * 「粘贴这么长的提示词 模式一会自动换行 模式二不会 不统一」，随后澄清
 * 「我说的换行是有行标数 背景颜色有变化的那种 不是行内换行」。
 *
 * ## 照搬模式一（用户 2026-10-17：「分行依旧未使用模式一的实现 你不能照搬吗」）
 *
 * 模式一的实现（`panel.js`）只有四件事，本模块**逐条对应**：
 *
 * | 模式一 | 模式二 |
 * |---|---|
 * | 逻辑行 = `text.split('\n')` | 同一个公式，草稿由 `useInput` 取（**权威**） |
 * | 每行占几个视觉行 = 隐藏 textarea 镜像量 | 真 DOM 上按字符区间量 `Range.getClientRects()` |
 * | 行号 = `flex:none` 的**独立一列**，textarea 在它右边 | 输入区 `padding-left` 让出真实列宽 |
 * | 底色 = 整块画在 textarea 的 `backgroundImage` 上 | 整块画在输入区的 `backgroundImage` 上 |
 *
 * ⚠️ 前两版都错在**自己去 DOM 里推逻辑行**：第一版数 `<p>` 的个数（粘贴产物
 * 可能只有 1 个 `<p>`），第二版数 `<br>`（真实换行往往只是文本节点里的
 * 换行字符，`white-space:pre-wrap` 直接把它渲染成新行）。两次都把
 * 「一整段」当成一行，于是行号被撑成十几行高、整体下移并压住正文。
 * **逻辑行的唯一定义只能来自草稿文本。**
 *
 * ## 为什么不改内核 DOM
 *
 * 内核的输入框是 **Lexical contenteditable**，草稿、选区、撤销栈都在它手里
 * （见 `./native-composer.js` 的说明）。所以我们只做两件事：
 *
 *  - **底色**：写输入区自己的 inline `backgroundImage`（不碰子节点）；
 *  - **行号**：往内核 `.grow`（`position:relative`）里 portal 一个绝对定位的
 *    gutter。`pointer-events:none`，不影响内核的命中测试与光标位置。
 *
 * ⚠️ 三条不能省的防护（都会静默出错）：
 *  1. **必须在 `useLayoutEffect` 里量**：要在浏览器绘制前算出几何，
 *     用 `useEffect` 会先闪一帧没有行号的画面。
 *  2. **`ResizeObserver` 要同时观察输入框与它的每个块级子元素**：粘贴、软换行、
 *     窗口缩放都会改变行数，而内核不会因为这些给我们回调。
 *  3. **所有 DOM 操作包 try/catch**：插槽渲染期抛错会让条目被**永久撤销**
 *     （比不显示更糟）。
 */
import { createElement as h, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { gutterHeightsOf, layoutOf, stripeBackgroundOf } from './composer-rows.js';

/** gutter 的类名（CSS 在 `./extended-bar.js` 的 CSS_ID 里）。 */
export const GUTTER_CLASS = 'dsh-epe-xgutter';

/** 找不到输入框时最多重试多少帧（≈2 秒 @60fps）。 */
const ATTACH_TICKS = 120;

/**
 * 找到 `[data-composer-input]` 与承载它的 `.grow`。
 *
 * 用**公开属性**选择器（`data-composer-input`），不猜内核的哈希类名。
 * `.grow` 取父元素而不是靠类名 —— 内核的 `.grow` 就是输入框的直接父级，
 * 且它带 `position:relative`（行号绝对定位的落点）。
 */
export function findComposerHosts(doc) {
  try {
    const input = doc?.querySelector?.('[data-composer-input]') ?? null;
    if (input === null) return null;
    const grow = input.parentElement;
    if (grow === null || grow === undefined) return null;
    return { input, grow };
  } catch {
    return null;
  }
}

/** 读一个 CSS 长度（变量或属性），拿不到时退回兜底值。 */
function lengthOf(view, element, name, fallback) {
  try {
    const raw = view.getComputedStyle(element).getPropertyValue(name);
    const value = parseFloat(raw);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  } catch {
    return fallback;
  }
}

/**
 * 把测量结果写成样式。
 *
 * 底色画在**输入区自身**上（与模式一画在 textarea 上完全对应），行高也写在
 * 同一个元素上；gutter 是它的后代（portal 到 `.grow`），可以直接继承。
 *
 * @returns 是否写入成功。
 */
export function applyLayout(input, layout) {
  try {
    input.style.setProperty('--dsh-epe-line', `${layout.lineHeight}px`);
    const view = input.ownerDocument?.defaultView;
    // 渐变起点取决于 `background-origin`（CSS 里设为 content-box）：
    //  · content-box → 渐变从内容盒顶边开始，而行盒也从那里开始 ⇒ 偏移 0；
    //  · 其它值 → 渐变从 padding 盒顶边开始，需整体下移 padding-top。
    // 读回实测值而不是写死，这样 CSS 与 JS 不会各算一套（E-021 同族）。
    let origin = '';
    try {
      origin = view.getComputedStyle(input).backgroundOrigin ?? '';
    } catch {
      origin = '';
    }
    const pad = origin.includes('content-box')
      ? '0px'
      : `${lengthOf(view, input, 'padding-top', 0)}px`;
    const background = stripeBackgroundOf(layout.lineRows, layout.lineTops, {
      pad,
      line: 'var(--dsh-epe-line)',
      stripe: 'var(--dsh-epe-stripe)',
    });
    input.style.backgroundImage = background === 'none' ? '' : background;
    return true;
  } catch {
    return false;
  }
}

/** 清掉我们写在输入区上的样式（退出模式二时必须做，否则底色残留）。 */
export function clearLayout(input) {
  try {
    input.style.removeProperty('background-image');
    input.style.removeProperty('--dsh-epe-line');
    return true;
  } catch {
    return false;
  }
}

/**
 * 行号 gutter + 交替底色控制器。
 *
 * @param props `{ active, draft }`：是否处于扩展输入框模式、当前草稿全文
 *   （逻辑行的权威来源，与模式一同源）。
 */
export function ComposerGutter(props) {
  const active = props?.active === true;
  const draft = typeof props?.draft === 'string' ? props.draft : undefined;
  const [layout, setLayout] = useState(null);
  const [hosts, setHosts] = useState(null);
  const disposerRef = useRef(null);
  // 草稿必须能被观察回调读到**最新值**，而那些回调只注册一次（依赖 [active]），
  // 所以用 ref 传递，避免每敲一个键就把整条观察链拆掉重建。
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useLayoutEffect(() => {
    if (!active) {
      // 退出模式二：把写在输入区上的样式清掉。
      const current = hosts;
      if (current !== null && current !== undefined) clearLayout(current.input);
      disposerRef.current?.();
      disposerRef.current = null;
      setLayout(null);
      return undefined;
    }

    const doc = typeof document === 'undefined' ? null : document;
    if (doc === null) return undefined;

    let disposed = false;
    let stopEverything = null;

    /**
     * 等输入框出现，然后接管。
     *
     * ⚠️⚠️ **不能只在挂载时找一次就放弃。** 用户 2026-10-16 的截图里
     * 符号栏在、行号却完全没有 —— 根因就是这个：模式是从 localStorage 恢复的，
     * `ComposerGutter` 挂载时输入框**往往还没渲染出来**（会话还没画完），
     * 而更早那版 `if (found === null) return undefined;` 直接放弃且**永不重试**。
     * 对比 `FloatingSymbolBar`：它每次渲染都重跑定位，所以符号栏好好的。
     *
     * 现在按 `native-composer.js` 同款的「rAF 首帧后重试」处理：
     * 输入框是被 React 提交后才出现的，所以要等下一帧再找；
     * 连续若干帧都找不到就停（不在错误页面上空转烧 CPU）。
     */
    let ticks = 0;
    let waitHandle = null;

    const schedule = (fn) => {
      if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(fn);
      return setTimeout(fn, 16);
    };
    const unschedule = (handle) => {
      if (handle === null || handle === undefined) return;
      try {
        if (typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(handle);
          return;
        }
      } catch {
        // 落到 clearTimeout。
      }
      try {
        clearTimeout(handle);
      } catch {
        // 无所谓。
      }
    };

    /** 建立观察与样式写入。返回 dispose。 */
    const attach = (found) => {
      setHosts(found);

      const apply = () => {
        try {
          const next = layoutOf(found.input, draftRef.current);
          if (next !== null) {
            applyLayout(found.input, next);
            setLayout(next);
          }
        } catch {
          // 测量是纯增强：任何异常都只降级。
        }
      };
      apply();

      let observer = null;
      try {
        if (typeof ResizeObserver === 'function') {
          observer = new ResizeObserver(apply);
          observer.observe(found.input);
          // ⚠️ 也要观察每个块级子元素：软换行只改变它们的高度、不改输入框宽度。
          for (const child of found.input.children) observer.observe(child);
          observer.observe(found.grow);
        }
        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
          window.addEventListener('resize', apply);
        }
      } catch {
        // 观察器建不起来不影响已经算好的几何。
      }

      // 内核增删节点（粘贴、回车、输入）时重新量。
      let mutator = null;
      try {
        if (typeof MutationObserver === 'function') {
          mutator = new MutationObserver(() => apply());
          mutator.observe(found.input, { childList: true, subtree: true, characterData: true });
        }
      } catch {
        // 同上。
      }

      const dispose = () => {
        try {
          observer?.disconnect?.();
          mutator?.disconnect?.();
          if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
            window.removeEventListener('resize', apply);
          }
        } catch {
          // dispose 期不抛。
        }
        clearLayout(found.input);
      };
      disposerRef.current = dispose;
      return dispose;
    };

    const tryAttach = () => {
      if (disposed) return;
      const found = findComposerHosts(doc);
      if (found === null) {
        ticks += 1;
        // 找不到就等下一帧再试；超过上限就放弃（别在错误页面上空转）。
        if (ticks < ATTACH_TICKS) waitHandle = schedule(tryAttach);
        return;
      }
      stopEverything = attach(found);
    };

    tryAttach();

    return () => {
      disposed = true;
      unschedule(waitHandle);
      try {
        stopEverything?.();
      } catch {
        // dispose 期不抛。
      }
      stopEverything = null;
      disposerRef.current = null;
    };
    // ⚠️ 依赖只有 active：草稿通过 draftRef 进入观察链（见上），
    // 否则每敲一个键都会重建观察器。
  }, [active]);

  if (!active || layout === null || hosts === null) return null;
  if (typeof createPortal !== 'function') return null;

  // 一个逻辑行一个行号；span 高 = 该逻辑行占的视觉行数 × 实测行高，
  // 于是下一个行号自然落在它自己那条逻辑行真正开始的位置（模式一同款算法）。
  const lineHeights = gutterHeightsOf(layout.lineRows, layout.lineHeight);
  const spans = [];
  for (let i = 0; i < layout.totalLines; i += 1) {
    spans.push(
      h(
        'span',
        { key: `ln-${i}`, style: { height: `${lineHeights?.[i] ?? layout.lineHeight}px` } },
        String(i + 1),
      ),
    );
  }

  // ⚠️ gutter 锚在 `.grow` 顶边，而文字从输入区的 `padding-top`（内核 4px）
  // 之下才开始 —— 不补这个偏移，行号会整体高 4px。从输入区自身读实测值，
  // 不写死（内核改版时自动跟随）。
  const view = hosts.input.ownerDocument?.defaultView;
  const padTop = lengthOf(view, hosts.input, 'padding-top', 0);
  // 沟槽宽度取自输入区上的 CSS 变量（在 extended-bar.js 单点定义），
  // 这样「让出的 padding」与 gutter 宽度永远是同一个数。
  const gutterWidth = lengthOf(view, hosts.input, '--dsh-epe-gutter-w', 26);

  // 行号字号：比正文小一号，但不小于 10px（三位数行号也要放得下）。
  const fontSize = (() => {
    try {
      const size = parseFloat(view.getComputedStyle(hosts.input).fontSize);
      if (Number.isFinite(size) && size > 0) return `${Math.max(10, Math.round(size - 2))}px`;
    } catch {
      // 落到兜底。
    }
    return '12px';
  })();

  try {
    return createPortal(
      h('div', {
        className: GUTTER_CLASS,
        'aria-hidden': true,
        style: {
          top: `${padTop}px`,
          width: `${gutterWidth}px`,
          '--dsh-epe-gutter-w': `${gutterWidth}px`,
          '--dsh-epe-line': `${layout.lineHeight}px`,
          '--dsh-epe-gutter-font': fontSize,
        },
      }, spans),
      hosts.grow,
    );
  } catch {
    return null;
  }
}
