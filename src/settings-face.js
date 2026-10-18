/**
 * dsh-enhanced-prompt-editor —— 设置读取与写入面。
 *
 * 浏览器侧的设置真源是 `ctx.configForms`（DSH 的 settings 服务镜像）。这里
 * 把它包装成一个窄接口：读当前生效值、写单个字段，并在任何一环缺失时退回
 * 「本地默认值 + 只读」，绝不抛错——一个读不到设置的插件不该让整个页面挂掉。
 *
 * `whileServed` 是必须的：镜像由异步的 `settings.describe()` 填充，`apply`
 * 时通常还没有我们的命名空间。旧版本（4.3.0 那次缺陷）就栽在「启动时读一次
 * 快照、之后再不看」。这里跟随服务的上线/下线边沿重新绑定。
 *
 * @module dsh-enhanced-prompt-editor/settings-face
 */
import {
  SETTINGS_NAMESPACE,
  clampEditorFontSize,
  clampExtendedHeight,
  clampKeySize,
  clampPanelHeight,
  defaultSettings,
  normalizeEnterMode,
  normalizeExtendedEnter,
  normalizeStorageMode,
  safeDraftDir,
} from './constants.js';

/** 把 Host 值规整成设置形状（Host 未提供时用行配置兜底）。 */
function normalize(value, fallback) {
  const base = fallback ?? defaultSettings();
  if (value === null || typeof value !== 'object') return base;
  return {
    storage: normalizeStorageMode(value.storage ?? base.storage),
    dir: safeDraftDir(value.dir ?? base.dir),
    enterMode: normalizeEnterMode(value.enterMode ?? base.enterMode),
    panelHeight: clampPanelHeight(value.panelHeight ?? base.panelHeight),
    editorFontSize: clampEditorFontSize(value.editorFontSize ?? base.editorFontSize),
    keySize: clampKeySize(value.keySize ?? base.keySize),
    browseWithReader: typeof value.browseWithReader === 'boolean' ? value.browseWithReader : base.browseWithReader,
    dictate: typeof value.dictate === 'boolean' ? value.dictate : base.dictate,
    // 模式与扩展输入框字段：`defaultSettings` 已经做过收敛，这里同样走它，
    // 避免「设置面与卡片各自实现一套默认值」。
    modeEditor: typeof value.modeEditor === 'boolean' ? value.modeEditor : base.modeEditor,
    modeExtended: typeof value.modeExtended === 'boolean' ? value.modeExtended : base.modeExtended,
    editorFirst: typeof value.editorFirst === 'boolean' ? value.editorFirst : base.editorFirst,
    extendedEnter: normalizeExtendedEnter(value.extendedEnter ?? base.extendedEnter),
    extendedHeight: clampExtendedHeight(value.extendedHeight ?? base.extendedHeight),
    // ⚠️ 新增字段**必须**同步加进这个手写清单，否则设置面里没有它：
    // 开关能渲染、能保存，但 `settings.get()` 永远拿不到 → 功能静默失效
    //（实测：漏了 nativeDeck / nativeEnter 时 deck 在原生模式下始终不显示）。
    // test/unit.test.mjs 有一条不变量测试专门守这里。
    nativeDeck: typeof value.nativeDeck === 'boolean' ? value.nativeDeck : base.nativeDeck,
    nativeEnter: typeof value.nativeEnter === 'boolean' ? value.nativeEnter : base.nativeEnter,
    shortcutEnabled: typeof value.shortcutEnabled === 'boolean' ? value.shortcutEnabled : base.shortcutEnabled,
  };
}

/** schemastery 的 volatile 字段在值里是一个 `{ get() }` 引用，读时剥一层。 */
function unwrap(value) {
  if (value !== null && typeof value === 'object' && typeof value.get === 'function') {
    try {
      return value.get();
    } catch {
      return undefined;
    }
  }
  return value;
}

function unwrapDeep(value) {
  const once = unwrap(value);
  if (once === null || typeof once !== 'object') return once;
  if (Array.isArray(once)) return once.map(unwrapDeep);
  const out = {};
  for (const [key, item] of Object.entries(once)) out[key] = unwrapDeep(item);
  return out;
}

/**
 * 创建设置面。
 *
 * @param ctx 客户端上下文。
 * @param onChange 值变化后的通知回调（用于让组件重渲染）。
 * @returns 读/写接口。
 */
export function createSettingsFace(ctx, onChange) {
  const fallback = defaultSettings();
  let forms;
  let scope;
  let bound = false;
  let current = fallback;
  const listeners = new Set();

  const readScope = () => {
    if (scope === undefined) return fallback;
    try {
      const raw = unwrapDeep(scope.getSnapshot?.().value ?? scope.get?.() ?? scope.value);
      return normalize(raw, fallback);
    } catch {
      return fallback;
    }
  };

  const refresh = () => {
    const next = readScope();
    const changed = JSON.stringify(next) !== JSON.stringify(current);
    current = next;
    if (changed) {
      for (const listener of [...listeners]) listener();
      onChange?.();
    }
  };

  /** 订阅 scope 的变更；重复绑定时先退掉上一次，避免监听器堆积。 */
  let unsubscribeScope;
  const bind = () => {
    if (bound) return;
    bound = true;
    try {
      scope = forms.get(SETTINGS_NAMESPACE);
    } catch {
      scope = undefined;
    }
    if (scope?.subscribe !== undefined) unsubscribeScope = scope.subscribe(refresh);
    refresh();
  };

  const unbind = () => {
    bound = false;
    try {
      unsubscribeScope?.();
    } catch {
      // 已经退掉就无所谓。
    }
    unsubscribeScope = undefined;
    scope = undefined;
  };

  // 服务本身要先拿到：`whileServed` 是它上面的方法，所以顺序不能颠倒
  // （先判断 whileServed、再解析 forms 会让判断永远为假）。
  try {
    forms = ctx.get?.('configForms');
  } catch {
    forms = undefined;
  }

  // 命名空间可能晚于 apply 到达（镜像由异步 describe 填充）。whileServed 在
  // 「未被服务 → 被服务」的边上回调，退出时撤销绑定；这不是一次性读快照。
  try {
    if (typeof forms?.whileServed !== 'function') {
      if (forms !== undefined && typeof forms.get === 'function') bind();
    } else {
      ctx.effect(
        () =>
          forms.whileServed([SETTINGS_NAMESPACE], () => {
            unbind();
            bound = false;
            bind();
            return unbind;
          }),
        'dsh-enhanced-prompt-editor: settings namespace binding',
      );
    }
  } catch (error) {
    console.warn('[dsh-enhanced-prompt-editor] 设置绑定失败，使用默认值：', error);
  }

  return {
    /** 当前生效设置（稳定引用）。 */
    get: () => current,

    /**
     * 原始配置表单 scope（`configForms.get(ns)`），供 `SettingsFormModel` 使用。
     *
     * - `configForms.get()` 由服务**按命名空间缓存**，所以同一命名空间每次返回
     *   同一个 `ConfigFormController`（身份稳定），未上线时它的快照是
     *   `status: 'loading'` / `writable: false`——`SettingsForm` 会据此显示不可用，
     *   而不是抛错。
     * - 服务本身缺失（非 Web 组合、设置插件没挂）时返回 `undefined`，卡片渲染
     *   只读提示。
     *
     * 与 `get()` 的区别：`get()` 给的是**规整后的值视图**（剥过 volatile、填过
     * 默认值），`formScope()` 给的是**能写入的原始表单**（暂存/保存/修订号都
     * 打在它上面）。
     */
    formScope: () => {
      if (scope !== undefined) return scope;
      if (forms === undefined) return undefined;
      try {
        scope = forms.get(SETTINGS_NAMESPACE);
        return scope;
      } catch {
        return undefined;
      }
    },
    /** 订阅变化。 */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** 是否可写。 */
    writable: () => scope?.getSnapshot?.().writable === true,
    /**
     * 写一个字段。失败时返回 false 并保留原值。
     *
     * @param field 字段名。
     * @param value 新值。
     * @returns 是否被 Host 接受。
     */
    async set(field, value) {
      if (scope === undefined || typeof scope.set !== 'function') return false;
      try {
        const ok = await scope.set(field, value);
        refresh();
        return ok !== false;
      } catch (error) {
        console.error('[dsh-enhanced-prompt-editor] 设置写入失败：', error);
        return false;
      }
    },
  };
}
