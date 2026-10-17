/**
 * dsh-enhanced-prompt-editor —— 按 Esc 从任一增强模式退回原生模式。
 *
 * @module dsh-enhanced-prompt-editor/escape-exit
 *
 * 用户 2026-10-16 要求：「esc 退出模式一或模式二 回退到原生模式 图标状态也同步更改」。
 *
 * ## 挂在哪、什么时候生效
 *
 * 挂在 `document` 的**捕获**阶段，与 `./native-composer.js` 接管回车同一个理由
 * （捕获阶段整体早于任何冒泡监听器，能抢在 Lexical 之前处理）。作用域每次事件
 * 现算：**只有当焦点在输入框里、且当前不是原生模式**时才动作。
 *
 * ## 三条必须守住的规矩
 *
 * 1. **只在输入框内生效**。全局抢 Esc 会把宿主的其它用途（关弹窗、退全屏、
 *    取消菜单）一并吞掉 —— 那是干扰别人，不是加功能。
 * 2. **输入框为空才退**。用户输入到一半按 Esc，多半是想「取消这次编辑/收起草稿」
 *    而不是「换模式」；真按下去就丢了他正在写的内容上下文。所以有草稿时
 *    放行这次按键，交给宿主按原语义处理。
 * 3. **换模式只走 `controller.set('native')`**，由它广播 → T 按钮的角标走
 *    `hooks` 快照源自动重渲染。**不要自己额外去改 DOM 上的角标**：
 *    两处状态源一定会不同步。这就是用户说的「图标状态也同步更改」——
 *    同步靠的是走同一条状态通道，不是手工补一次 UI 更新。
 *
 * 全程 try/catch：事件处理器里抛错会冒到 `window.onerror`。
 */

/** 输入框根元素的选择器（内核公开属性，见 `./native-composer.js` 的同名说明）。 */
const EDITOR_SELECTOR = '[data-composer-input]';

/**
 * 判断这次按键是不是「该由我们处理的 Esc」。
 *
 * 拆成纯函数是为了能直接测：真机上无法可靠地合成带焦点的键盘事件。
 *
 * @param event keydown 事件。
 * @param options.inComposer 焦点是否在输入框内。
 * @param options.mode 当前模式。
 * @param options.hasDraft 输入框里是否有内容。
 * @returns 是否应当由我们接管（吞掉这次按键并退回原生）。
 */
export function shouldExitOnEscape(event, options = {}) {
  try {
    if (event === null || event === undefined) return false;
    if (event.key !== 'Escape' && event.key !== 'Esc') return false;
    // 组合键下的 Esc 是别的东西（如 Ctrl+Esc），不碰。
    if (event.ctrlKey === true || event.metaKey === true || event.altKey === true) return false;
    if (options.inComposer !== true) return false;
    // 已经在原生模式就什么都不做（放行，别吞掉宿主的 Esc）。
    if (options.mode === 'native' || options.mode === undefined || options.mode === null) return false;
    // 有草稿时放行：用户多半想取消编辑，而不是换模式。
    if (options.hasDraft === true) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * 读出输入框里是否有内容。
 *
 * 用 `textContent` 而不是 `innerText`：后者会触发强制重排（在每次按键上做这件事
 * 很浪费），而这里只需要「是否为空」。
 *
 * @returns 有内容返回 true；读不到时返回 true（保守：宁可不动，也不误退）。
 */
function hasDraftIn(doc) {
  try {
    const root = doc?.querySelector?.(EDITOR_SELECTOR) ?? null;
    if (root === null) return true;
    const text = root.textContent ?? '';
    // Lexical 空草稿里可能有零宽字符或占位 <br>，一并视为空。
    return text.replace(/[\u200B\u200C\u200D\uFEFF]/g, '').trim() !== '';
  } catch {
    return true;
  }
}

/**
 * 判断事件目标是否在输入框内。
 *
 * 每次事件现取根元素判断包含关系 —— 宿主会在会话切换时重挂输入区，
 * 缓存下来的引用会失效。
 */
function targetInComposer(doc, target) {
  try {
    if (target === null || target === undefined) return false;
    const root = doc?.querySelector?.(EDITOR_SELECTOR) ?? null;
    if (root === null || typeof root.contains !== 'function') return false;
    return root === target || root.contains(target) === true;
  } catch {
    return false;
  }
}

/**
 * 安装 Esc 退出。
 *
 * @param options.doc 文档对象。
 * @param options.controller 模式控制器（需要 `get()` 与 `set()`）。
 * @param options.onExit 成功退出后的回调（可选，用于记一条诊断）。
 * @returns dispose 函数；不可用时返回 null。
 */
export function attachEscapeExit(options) {
  const doc = options?.doc ?? null;
  const controller = options?.controller ?? null;
  if (doc === null || typeof doc.addEventListener !== 'function') return null;
  if (controller === null || typeof controller.set !== 'function') return null;

  const onKeyDown = (event) => {
    try {
      if (event.key !== 'Escape' && event.key !== 'Esc') return;
      if (!targetInComposer(doc, event.target ?? null)) return;
      const mode = typeof controller.get === 'function' ? controller.get() : null;
      if (!shouldExitOnEscape(event, { inComposer: true, mode, hasDraft: hasDraftIn(doc) })) return;
      if (typeof event.preventDefault === 'function') event.preventDefault();
      // 只 stopPropagation（不 stopImmediatePropagation）：宿主的其它监听器
      // 若依赖这次事件的默认行为，我们已经 preventDefault 了，不需要更狠。
      if (typeof event.stopPropagation === 'function') event.stopPropagation();
      controller.set('native');
      try {
        options?.onExit?.(mode);
      } catch {
        // 诊断回调失败不影响退出本身。
      }
    } catch {
      // 事件处理器里抛错会冒到 window.onerror；自己兜住。
    }
  };

  doc.addEventListener('keydown', onKeyDown, true);
  return () => {
    try {
      doc.removeEventListener('keydown', onKeyDown, true);
    } catch {
      // 移除失败无所谓：文档卸载会一并带走。
    }
  };
}
