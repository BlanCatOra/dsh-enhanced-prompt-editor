/**
 * dsh-enhanced-prompt-editor —— 模式状态机。
 *
 * 「模式」是本插件 2026-10-16 新增的一等概念：工具行的 T 按钮不再只有
 * 「打开面板」一个动作，而是在若干模式之间循环。
 *
 *   editor   —— 编辑器模式：点 T 打开右侧栏 Markdown 面板；
 *   extended —— 扩展输入框模式：原生输入框向上变高 + 独立 Enter 语义；
 *   native   —— 原生：两个增强都不生效（循环的最后一站，不可勾选）。
 *
 * 这一层只持有「当前是哪个模式」并广播变化，不碰 DOM（那是
 * `native-composer.js` 的事），也不碰 UI（那是各组件的事）。这样三处消费者
 * （T 按钮、扩展输入框控制器、设置卡片）读的是同一份状态，不会各说各话。
 *
 * 模式记在 `localStorage` 里全局一份，而不是每会话一份：它是用户对「T 按钮
 * 干什么」的偏好，不是某次对话的草稿内容。按会话存会让用户每开一个新会话
 * 都要重新按一次 T。
 *
 * @module dsh-enhanced-prompt-editor/mode-controller
 */
import { cycleModes, nextMode, normalizeMode } from './constants.js';

/** 当前模式的存储键。 */
export const MODE_STORAGE_KEY = 'dsh.enhancedPromptEditor.mode';

/**
 * 从存储里读回模式。
 *
 * @param storage localStorage 兼容对象（可能不存在）。
 * @returns 模式；读不到就是 `native`（最保守：不擅自替用户开增强）。
 */
export function readStoredMode(storage) {
  try {
    const raw = storage?.getItem?.(MODE_STORAGE_KEY);
    if (typeof raw !== 'string' || raw === '') return 'native';
    return normalizeMode(raw);
  } catch {
    return 'native';
  }
}

/**
 * 把当前模式收敛到「仍然可用」的状态。
 *
 * 用户在设置里关掉某个增强模式时，正在生效的那个模式可能已经不可用了。
 * 这时**退回原生**，而不是偷偷跳到另一个增强模式——用户刚表达的是「我不想
 * 要这个」，不是「换成那个」。
 *
 * @param current 当前模式。
 * @param modes `cycleModes()` 的结果。
 * @returns 收敛后的模式。
 */
export function reconcileMode(current, modes) {
  const mode = normalizeMode(current);
  if (mode === 'native') return 'native';
  return Array.isArray(modes) && modes.includes(mode) ? mode : 'native';
}

/**
 * 创建模式控制器。
 *
 * @param options.settings 设置面（需要 `get()` 与 `subscribe()`）。
 * @param options.storage localStorage 兼容对象。
 * @param options.switches 「原生输入框增强」两个开关的控制器（客户端存储，
 *        见 `native-switches.js`）。`deckSource` 读它决定原生模式要不要上 deck。
 * @param options.onChange 模式变化后的回调（用于同步 DOM）。
 */
export function createModeController(options) {
  const settings = options?.settings;
  const storage = options?.storage;
  const switches = options?.switches;
  const listeners = new Set();
  let mode = readStoredMode(storage);

  /** 当前可用序列（设置变化时可能变）。 */
  const modes = () => cycleModes(settings?.get?.() ?? {});

  const publish = () => {
    for (const listener of [...listeners]) {
      try {
        listener(mode);
      } catch (error) {
        // 一个监听器坏掉不该影响其余监听器，也不该冒到调用方。
        console.error('[dsh-enhanced-prompt-editor] 模式监听器失败：', error);
      }
    }
    try {
      options?.onChange?.(mode);
    } catch (error) {
      console.error('[dsh-enhanced-prompt-editor] 模式切换回调失败：', error);
    }
  };

  const write = (next) => {
    const previous = mode;
    mode = next;
    try {
      storage?.setItem?.(MODE_STORAGE_KEY, mode);
    } catch {
      // 存不进去只影响下次启动的初始值，不影响本次会话。
    }
    // 值没变就不广播：T 的点击在单模式配置下会「循环到自己」，
    // 无谓地刷一次提醒横幅是打扰。
    if (previous !== mode) publish();
    return mode;
  };

  // 设置变化后立刻收敛一次：用户刚在设置里关掉的模式不能还挂着。
  const offSettings = settings?.subscribe?.(() => {
    const reconciled = reconcileMode(mode, modes());
    if (reconciled !== mode) write(reconciled);
    else publish();
  });

  // 客户端开关（原生模式也上 deck / 也接管回车）变化后也要广播：
  // `deckSource` 是 hooks 快照源，不广播的话切换了也不重渲染。
  const offSwitches = switches?.subscribe?.(() => publish());

  return {
    /** 当前模式。 */
    get: () => mode,
    /**
     * 给插槽 `inject` 的 `hooks` face 用的只读快照源。
     *
     * ⚠️ **为什么必须有它**：插槽渲染器把 `entry.inject()` 的返回值按
     * `(entry, binding)` **缓存进 WeakMap 且永不失效**（`cachedSessionInject`）。
     * 所以 `inject()` 里直接放 `mode: <当前值>` 会**永久冻在第一帧** ——
     * 点 T 切了模式，角标却一直显示旧值。
     *
     * 正确做法（官方 `dsh-client-ui-settings-subagent` 同款）：把**快照源**
     * 放进 `hooks` face，渲染器会把它绑成组件 prop `useMode()`，组件在渲染期
     * 调用它就能拿到最新值并自动订阅。
     */
    source: {
      getSnapshot: () => mode,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },

    /**
     * 另两个快照源（同样给 `hooks` face 用）。
     *
     * `canCycle` 要看**当前的可用模式序列**（它随设置变化），`next` 看两者的
     * 组合。都必须在渲染期可读，所以都得是快照源而不是值。
     */
    /**
     * 「当前是否处于扩展输入框模式」的快照源。
     *
     * 给模式二那条符号行用：它只在该模式下出现，而插槽的 inject 结果被
     * **永久缓存**，所以「是否可见」必须走快照源，不能传值。
     */
    extendedSource: {
      getSnapshot: () => mode === 'extended',
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },

    /**
     * 「悬浮 deck（符号/缩进工具条）是否可见」的快照源。
     *
     * = **扩展输入框模式** 或者 **原生模式 + 勾选了 `nativeDeck`**。
     *
     * ⚠️ 与 `extendedSource` 是**两个不同的判断**，别合并：
     *  - 扩展模式：deck 与行号沟槽都要（沟槽仍由 `extendedSource` 控制）；
     *  - 原生 + nativeDeck：**只要 deck**，不要行号/底色/加高。
     *
     * 设置变化会经上面那条 `settings.subscribe → publish()` 通知出去，
     * 所以这里在渲染期读 `settings.get()` 拿到的是最新值（快照源会重算）。
     */
    deckSource: {
      // 原生模式是否也上 deck：读**客户端**存储的开关（`native-switches.js`）。
      // 不走宿主设置的原因见那个模块的注释：本机实测该命名空间的宿主写入
      // 会整个被拒，而这两个开关只影响浏览器侧行为，放客户端才是可靠路径。
      getSnapshot: () =>
        mode === 'extended' || (mode === 'native' && switches?.get?.()?.nativeDeck === true),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },

    canCycleSource: {
      getSnapshot: () => modes().length > 0,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    /** 当前可用序列（不含原生兜底）。 */
    modes,
    /** 循环到下一个模式；返回新模式。 */
    cycle() {
      return write(nextMode(mode, modes()));
    },
    /** 直接设置模式（设置卡片用）。 */
    set(next) {
      return write(normalizeMode(next));
    },
    /** 订阅模式变化。 */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      try {
        offSettings?.();
      offSwitches?.();
      } catch {
        // 已退订就无所谓。
      }
      listeners.clear();
    },
  };
}
