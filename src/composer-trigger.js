/**
 * dsh-enhanced-prompt-editor —— 输入框工具行的 T 按钮。
 *
 * 位置：注册进 `conversation.input.left`（session 级 list 插槽），因此它
 * 与「权限」「计划」控件同排，排在它们之后。DSH 没有提供「加号与权限控件
 * 之间」的插槽，这不是取舍而是唯一稳定的接入点。
 *
 * 形态：一个 28px 圆钮，主体是大写字形 T，右下角一枚小角标**表示当前模式**：
 *   - 编辑器模式   → 面板图标
 *   - 扩展输入框   → 向上箭头
 *   - 原生         → 无角标（按钮整体压暗）
 *
 * ⚠️ **不再有悬停提示框**（用户 2026-10-16：「指针在 T 上悬浮会显示一个你的
 * 窗口 是我们的中文名字 去掉」）。之前用的是原生 `title` 属性，浏览器会弹
 * 一个显示插件中文名的系统提示框。现在改为：模式由角标直接表达，可访问名称
 * 走 `aria-label`（不产生视觉浮层），切到扩展输入框时另有一条明确的横幅提醒。
 *
 * 图标与 Button 一律来自 `@deepseek-ai/dsh-client-ui-primitives`（用户
 * 2026-10-15 定的 UI 硬规则：禁止自己写 UI 组件），本文件不内联任何 SVG。
 *
 * @module dsh-enhanced-prompt-editor/composer-trigger
 */
import { createElement as h, useCallback, useState } from 'react';
import {
  Button,
  IconChevronUpOutlineRegular,
  IconPanelLeftOutlineRegular,
  Toast,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { PLUGIN_ID } from './constants.js';
import { ensureCss as injectStyle } from './css.js';

/** 按钮样式只注入一次。 */
const CSS_ID = `${PLUGIN_ID}/composer-trigger.css`;
const CSS = `
.dsh-epe-trigger{position:relative;flex:none;width:28px;height:28px;padding:0;border-radius:999px;color:var(--dsw-alias-label-primary,currentColor)}
.dsh-epe-trigger[data-mode="native"]{color:var(--dsw-alias-label-tertiary,currentColor)}
.dsh-epe-trigger[data-mode="editor"]{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14))}
.dsh-epe-trigger[data-mode="extended"]{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14))}
.dsh-epe-trigger-glyph{font:600 14px/1 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:0}
.dsh-epe-trigger-badge{position:absolute;right:-1px;bottom:-1px;display:grid;place-items:center;width:12px;height:12px;border-radius:3px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-base,#fff));color:var(--dsw-alias-label-secondary,currentColor);box-shadow:0 0 0 1px var(--dsw-alias-border-l1,rgba(127,127,127,.3))}
`;

/**
 * 注入本段样式。
 *
 * 走共享的容错实现（见 `./css.js`）而不是就地写：DSH 的插槽渲染器一旦
 * 捕获到渲染期异常，会**永久撤销该条目**（`abdicate`），所以这里绝不能抛。
 */
function ensureCss() {
  injectStyle(CSS_ID, CSS, PLUGIN_ID);
}

/** 当前模式的角标图标；原生态没有角标。 */
function ModeBadge({ mode }) {
  if (mode === 'editor') {
    return h(
      'span',
      { className: 'dsh-epe-trigger-badge', 'aria-hidden': true },
      h(IconPanelLeftOutlineRegular, { size: 9 }),
    );
  }
  if (mode === 'extended') {
    return h(
      'span',
      { className: 'dsh-epe-trigger-badge', 'aria-hidden': true },
      h(IconChevronUpOutlineRegular, { size: 9 }),
    );
  }
  return null;
}

/**
 * 工具行按钮组件。
 *
 * ⚠️ `mode` / `canCycle` 不是普通 prop，而是**渲染器绑定的 hook**
 * （`useMode()` / `useCanCycle()`）：插槽渲染器把 `entry.inject()` 的返回值按
 * `(entry, binding)` 缓存进 WeakMap 且永不失效，所以 inject 里给不了「会变的
 * 值」，只能给快照源（`hooks` face），由渲染器绑成 hook、组件在渲染期调用。
 * 直接当普通 prop 读会**永久停在第一帧**，点 T 角标不动。
 *
 * @param props 由插槽框架注入：`t`、`useMode`、`useCanCycle`、`next`、`cycle`。
 */
export function ComposerTrigger(props) {
  ensureCss();
  const { t, useMode, useCanCycle, next, cycle } = props;
  // 这两个 hook 必须**无条件**在顶层调用（Rules of Hooks）；渲染器保证它们
  // 始终存在（即使 face 里没写，也是返回 undefined 的空 hook）。
  const mode = useMode((value) => value);
  const canCycle = useCanCycle((value) => value);
  // 只有真的「切到扩展输入框」这个动作才提醒，所以用一次性 state 承载横幅，
  // 而不是让每个渲染都挂一个 Toast。
  const [notice, setNotice] = useState(null);

  const modeLabel = (value) => t?.(`trigger.mode.${value}`) ?? value;

  const onClick = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (canCycle !== true) return;
      const landed = cycle?.();
      if (landed === 'extended') setNotice({ key: `${Date.now()}` });
    },
    [canCycle, cycle],
  );

  const label =
    canCycle === true
      ? (t?.('trigger.mode', { mode: modeLabel(mode), next: modeLabel(next) }) ?? t?.('trigger.label') ?? 'T')
      : (t?.('trigger.disabled') ?? 'No enhanced mode is enabled');

  return h(
    'span',
    { className: 'dsh-epe-trigger-wrap', style: { display: 'contents' } },
    h(
      Button,
      {
        variant: 'ghost',
        size: 'sm',
        className: 'dsh-epe-trigger',
        'data-mode': mode,
        // 可访问名称走 aria-label：它不产生视觉浮层，因此替代了原来的
        // title 提示框，又保留鼠标用户之外的可达性。
        'aria-label': label,
        disabled: canCycle !== true,
        onMouseDown: (event) => event.preventDefault(),
        onClick,
      },
      h('span', { className: 'dsh-epe-trigger-glyph', 'aria-hidden': true }, 'T'),
      h(ModeBadge, { mode }),
    ),
    notice === null
      ? null
      : h(Toast, {
          key: notice.key,
          text: t?.('notice.extended', { send: sendKeyLabel() }) ?? 'Tall composer on',
          holdMs: 6000,
          onDone: () => setNotice(null),
        }),
  );
}

/** 发送键位显示文案：跟随平台惯用修饰键。 */
function sendKeyLabel() {
  const platform = globalThis.navigator?.platform ?? '';
  return /mac|iphone|ipad/i.test(platform) ? '⌘↵' : 'Ctrl+Enter';
}
