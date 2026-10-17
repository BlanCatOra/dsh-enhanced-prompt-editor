/**
 * 「原生输入框增强」两个开关的**客户端**存储。
 *
 * ## 为什么存客户端而不是宿主设置
 *
 * 用户 2026-08 要求这两个开关（原生模式也上 deck / 也接管回车）。它们只改变
 * **浏览器侧**的行为，宿主完全不消费；但放在宿主设置里时，本机实测遇到了
 * 一个与本功能无关的既有故障：**该命名空间的任何写入都被宿主拒绝**
 * （连 `panelHeight` 这种老字段的空写都拒 —— 卡片上的「空写探针=rejected」
 * 就是证据，失败点在 `reconcileProfilePatches` 把新配置应用回 loader 之后，
 * 有 loader 条目没激活，内核据此回滚并报「宿主拒绝了这次写入」）。
 *
 * 结果是：走宿主设置的话，开关**永远存不进去**。所以这两个开关改成客户端
 * 持久化 —— 与「当前模式」（native / editor / extended）同一种做法，
 * 写 `localStorage`，立刻生效、跨重启保留，不依赖宿主写入通道。
 *
 * 宿主 schema 里的 `nativeDeck` / `nativeEnter` 字段仍然保留（保留位），
 * 将来宿主写入修好后可以再搬回去，客户端读法不用变。
 *
 * @module dsh-enhanced-prompt-editor/native-switches
 */

/** 存储键。改它等于让所有用户的选择回到默认值。 */
export const SWITCHES_STORAGE_KEY = 'dsh-enhanced-prompt-editor:native-switches';

/** 三个客户端值的默认值：两个开关都关；回车策略 `undefined` = 跟随宿主设置。 */
export function defaultSwitches() {
  return { nativeDeck: false, nativeEnter: false, extendedEnter: undefined };
}

/**
 * 把任意值收敛成两个布尔。
 *
 * @param value 可能是存储里读出来的 JSON、也可能是设置面给的值。
 * @returns `{ nativeDeck, nativeEnter }`，非 `true` 一律算关。
 */
function normalizeSwitches(value) {
  return {
    nativeDeck: value?.nativeDeck === true,
    nativeEnter: value?.nativeEnter === true,
    // 回车策略：只有显式存过才生效，未存过时保持 undefined（由调用方回退到宿主值）。
    extendedEnter: value?.extendedEnter === 'newline' || value?.extendedEnter === 'inherit'
      ? value.extendedEnter
      : undefined,
  };
}

/**
 * 从 localStorage 兼容对象读取开关。
 *
 * 存储不可用、内容损坏、字段缺失 —— 一律退回默认值（两个关），
 * **绝不抛错**：这是渲染前的读路径，抛一下就是白屏。
 *
 * @param storage `localStorage` 兼容对象（可能不存在）。
 * @returns `{ nativeDeck, nativeEnter }`
 */
export function readStoredSwitches(storage) {
  const fallback = defaultSwitches();
  try {
    const raw = storage?.getItem?.(SWITCHES_STORAGE_KEY);
    if (typeof raw !== 'string' || raw === '') return fallback;
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return fallback;
    return normalizeSwitches(parsed);
  } catch {
    return fallback;
  }
}

/**
 * 写回 localStorage。写失败（隐私模式、配额满）只降级：本次仍然生效，
 * 只是重启后回到默认值。
 *
 * @param storage `localStorage` 兼容对象。
 * @param value 两个开关的当前值。
 */
export function writeStoredSwitches(storage, value) {
  try {
    storage?.setItem?.(SWITCHES_STORAGE_KEY, JSON.stringify(normalizeSwitches(value)));
  } catch {
    // 存不下就算了：内存里的值仍然生效。
  }
}

/**
 * 建一个开关控制器：读写 + 订阅，与 `mode-controller` 同一个形状。
 *
 * `deckSource` 这类插槽 hooks 快照源需要**同步**读当前值，所以值放在闭包里，
 * 每次 `set` 之后广播。
 *
 * @param options.storage `localStorage` 兼容对象（可能不存在）。
 * @returns `{ get, set, subscribe }`
 */
export function createNativeSwitches(options) {
  const storage = options?.storage;
  /** 未存过策略时的回退值：宿主设置里那份（可能来自 profile patch）。 */
  const policyFallback = options?.policyFallback;
  let current = readStoredSwitches(storage);
  const listeners = new Set();

  const publish = () => {
    for (const listener of [...listeners]) {
      try {
        listener(current);
      } catch {
        // 一个订阅者坏了不该影响其它订阅者。
      }
    }
  };

  /** 对外暴露的值：策略未存过时回退到宿主设置。 */
  const view = () => ({
    nativeDeck: current.nativeDeck,
    nativeEnter: current.nativeEnter,
    extendedEnter: current.extendedEnter ?? (typeof policyFallback === 'function' ? policyFallback() : policyFallback),
  });

  return {
    /** 当前值（稳定引用，直到下一次 `set` 改变它）。 */
    get: () => view(),

    /**
     * 改一个或两个开关。值没变就不广播（幂等）。
     *
     * @param next 允许只给其中一个字段。
     */
    set(next) {
      const merged = normalizeSwitches({ ...current, ...next });
      if (
        merged.nativeDeck === current.nativeDeck
        && merged.nativeEnter === current.nativeEnter
        && merged.extendedEnter === current.extendedEnter
      ) return;
      current = merged;
      writeStoredSwitches(storage, current);
      publish();
    },

    /**
     * 订阅变化。
     *
     * @param listener 值变化时的回调。
     * @returns 退订函数。
     */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
