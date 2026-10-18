/**
 * dsh-enhanced-prompt-editor —— 插件详情页的设置卡片。
 *
 * ⚠️ **注册到 `plugins.bundle.config`（key = 插件包名），不是 `settings.section`，
 * 也不是 `plugins.item`**（用户 2026-10-15 定的 UI 硬规则）。
 * 权威原句（`dsh-client-ui-plugin-manager/README.zh.md`）：
 * 「注册了配置页的插件在这里、在它自己的页面上编辑；设置里只保留只读的插件
 * 列表。」用户路径：侧栏「插件」→「已安装插件」里找到本插件 → 进去配置。
 *
 * ⚠️ 为什么不是 `plugins.item`：2026-10-16 读内核源码
 * （`dsh-client-ui-plugin-manager/lib/client.js`）核实，「插件」页分两组、插槽不同：
 *   - 第三方包（`!pkg.official`）→ `renderGroup("bundles", "已安装插件", …)`
 *     → PackageCard → PackageDetail → **`plugins.bundle.config`**；
 *   - 官方包 → `renderGroup("basic", "内置插件配置", …)`
 *     → ItemCard → ItemDetail → `plugins.item`。
 * 本插件是第三方包。注册到 `plugins.item` 会出现在**「内置插件配置」**分组下。
 *
 * 页面结构照抄官方 `dsh-client-ui-settings-subagent` 的范式：
 *
 *  - `view === 'summary'` 时只渲染一句话（插件列表卡片里的那一行描述）；
 *  - `view === 'page'` 时渲染 `SettingsForm`，**只有点保存才写入**；
 *  - 控件全部来自 `@deepseek-ai/dsh-client-ui-primitives`（用户 2026-10-15
 *    硬规则：开关、下拉、输入框一律用它，不自己写）。具体用法对照内核：
 *      · 布尔 → `Switch`（官方配置页用它，`label` 必填）；
 *      · 枚举 → `Menu` + 一个锚点按钮（官方 `EnterBehaviorRow` 就是这个形状，
 *        primitives 里没有 `Select`）；
 *      · 文本/数值 → `SettingsValueField`（官方 `SubagentLimitsFields` 同款）。
 *
 * 为什么用 `SettingsFormModel` 而不是直接 `scope.set()`：内核的每次设置写入
 * 都是一次**带修订号的文档变更**，即写即存会把一次编辑变成用户没要求的写入、
 * 也无法预览。`SettingsFormModel` 暂存草稿、保存时一次性提交，与官方页面一致。
 *
 * @module dsh-enhanced-prompt-editor/plugin-card
 */
import { createElement as h, useEffect, useRef, useState } from 'react';
import {
  Menu,
  SettingsForm,
  SettingsFormModel,
  SettingsValueField,
  Switch,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { PLUGIN_ID, SETTINGS_NAMESPACE, defaultSettings } from './constants.js';
import { ensureCss as injectStyle } from './css.js';

const CSS_ID = `${PLUGIN_ID}/plugin-card.css`;
const CSS = `
.dsh-epe-card{display:flex;flex-direction:column;gap:20px;min-width:0}
.dsh-epe-card-section{display:flex;flex-direction:column;gap:12px;min-width:0;padding:16px 0 0}
.dsh-epe-card-heading{margin:0;color:var(--dsw-alias-label-primary,currentColor);font:600 13px/20px ui-sans-serif,system-ui,sans-serif}
.dsh-epe-card-help{margin:0;color:var(--dsw-alias-label-tertiary,currentColor);font:400 12px/16px ui-sans-serif,system-ui,sans-serif}
.dsh-epe-card-row{display:flex;flex-direction:column;gap:6px;min-width:0}
.dsh-epe-card-inline{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0}
.dsh-epe-card-inlineText{display:flex;flex-direction:column;gap:2px;min-width:0}
.dsh-epe-card-selector{display:inline-flex;align-items:center;gap:6px;flex:none;height:28px;padding:0 10px;border:0.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.3));border-radius:var(--dsw-radius-sm,8px);background:transparent;color:var(--dsw-alias-label-primary,currentColor);font:400 12px/18px ui-sans-serif,system-ui,sans-serif;cursor:pointer}
.dsh-epe-card-selector:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14))}
.dsh-epe-card-warn{padding:8px 10px;border-radius:8px;background:rgba(217,83,79,.12);color:#d9534f;font:400 12px/16px ui-sans-serif,system-ui,sans-serif}
.dsh-epe-card-warn-list{margin:4px 0 0;padding-left:18px;display:flex;flex-direction:column;gap:2px;word-break:break-word}
.dsh-epe-card-note{padding:8px 10px;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12));color:var(--dsw-alias-label-secondary,currentColor);font:400 12px/16px ui-sans-serif,system-ui,sans-serif}
`;

/**
 * 注入卡片样式。
 *
 * 走共享的容错实现（见 `./css.js`）：插槽渲染器捕获到渲染期异常会永久
 * 撤销该条目，因此注入样式不能有抛出的可能。
 */
function ensureCss() {
  injectStyle(CSS_ID, CSS, PLUGIN_ID);
}

/* ── 字段 spec：`SettingsFormModel` 需要的 format / parse 对 ─────────── */

/**
 * 枚举 spec：解析后必须落在允许集合内，否则视为非法草稿（阻止保存）。
 *
 * `format` 同理在缺失/非法时退回默认值——否则控件会显示成空字符串（一个
 * 空白的选择器），而不是用户实际会得到的那个默认项。
 */
function enumField(field, allowed) {
  const fallback = defaultSettings()[field];
  return {
    field,
    format: (value) => (typeof value === 'string' && allowed.includes(value) ? value : fallback),
    parse: (text) => {
      const trimmed = text.trim();
      if (trimmed === '') return { kind: 'clear' };
      return allowed.includes(trimmed) ? { kind: 'set', value: trimmed } : undefined;
    },
  };
}

/** 自然数 spec：超出区间或非整数一律视为非法草稿。 */
function boundedNumberField(field, min, max) {
  const fallback = defaultSettings()[field];
  return {
    field,
    // 缺失时退回默认高度，而不是空串（空串会让控件显示为空）。
    format: (value) => String(typeof value === 'number' && Number.isFinite(value) ? value : fallback),
    parse: (text) => {
      const trimmed = text.trim();
      if (trimmed === '') return { kind: 'clear' };
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < min || parsed > max) return undefined;
      return { kind: 'set', value: parsed };
    },
  };
}

/**
 * 布尔 spec：草稿只有 `'true'` / `'false'` 两种合法值。
 *
 * ⚠️ `format` 必须在字段**缺失**时退回该字段的默认值，而不是 `false`：
 * `SettingsFormModel.field()` 走的是 `spec.format(scope.value[field])`，而
 * scope 只含 Host 真的服务出来的字段。宿主 schema 尚未重载（刚装完插件、还没
 * 重启）时新模式字段整批缺失，naive 的 `value === true ? 'true' : 'false'` 会
 * 让界面把「默认为开」显示成「关」——静默的界面谎报。
 */
function booleanField(field) {
  const fallback = defaultSettings()[field] === true;
  return {
    field,
    format: (value) => ((typeof value === 'boolean' ? value : fallback) ? 'true' : 'false'),
    parse: (text) => {
      if (text === 'true') return { kind: 'set', value: true };
      if (text === 'false') return { kind: 'set', value: false };
      return undefined;
    },
  };
}

/** 自由文本 spec（落盘目录）。 */
function textField(field) {
  const fallback = defaultSettings()[field];
  return {
    field,
    format: (value) => (typeof value === 'string' ? value : fallback),
    parse: (text) => (text.trim() === '' ? { kind: 'clear' } : { kind: 'set', value: text.trim() }),
  };
}

/** 卡片可编辑的全部字段。顺序无关，`SettingsFormModel` 按 field 建索引。 */
const SPECS = [
  enumField('storage', ['workspace', 'browser', 'none']),
  textField('dir'),
  enumField('enterMode', ['newline', 'send']),
  boundedNumberField('panelHeight', 180, 1400),
  boundedNumberField('editorFontSize', 11, 28),
  boundedNumberField('keySize', 80, 180),
  booleanField('browseWithReader'),
  booleanField('dictate'),
  booleanField('modeEditor'),
  booleanField('modeExtended'),
  booleanField('editorFirst'),
  boundedNumberField('extendedHeight', 240, 2000),
  // 原生模式下的两个增强开关（用户 2026-08 要求）。
];

/** 面板高度与扩展输入框高度的允许区间（与 `constants.js` 保持一致）。 */
const RANGES = {
  panelHeight: { min: 180, max: 1400, step: 10 },
  extendedHeight: { min: 240, max: 2000, step: 20 },
  editorFontSize: { min: 11, max: 28, step: 1 },
  keySize: { min: 80, max: 180, step: 10 },
};

/**
 * 取 scope 上折叠后的普通值，并**补齐缺失字段的默认值**。
 *
 * 为什么必须补默认值：`scope.value` 只含 Host 真的服务出来的字段。宿主 schema
 * 尚未重载（刚装完插件、还没重启）时，新模式字段可能整批缺失，而
 * `booleanField.format(undefined)` 会得到 `'false'` —— 界面显示「关」，但真实
 * 默认是「开」。这是**静默的界面谎报**，比少渲染一个控件更糟。
 *
 * 所以这里统一过一遍 `defaultSettings()`：缺失字段补默认，非法值也一并收敛。
 */
function plainOf(scope) {
  let raw;
  try {
    raw = scope?.getSnapshot?.()?.value;
  } catch {
    raw = undefined;
  }
  return defaultSettings(raw);
}

/** 最近一次保存失败的诊断现场（同一插件只有一个卡片实例）。 */
let lastSaveFailure = null;

/**
 * 插件自身的 Host 侧 ctx（由 `client.js` 在 apply 时交进来）。
 *
 * 为什么需要它：内核 `ConfigForm.mutate()` 把宿主 RPC 的失败包成 `false`，
 * 连 `error.message` 都丢掉；而这条 message 里恰恰带着宿主**为什么**拒绝
 * （例如 `dsh: warning: 1 entry did not activate …`）。直接调一次同一条 RPC
 * 就能把原文读出来。
 */
let pluginContext = null;

/** Host 侧 ctx 交接口（`client.js` 的 apply 里调用一次）。 */
export function setPluginContext(ctx) {
  pluginContext = ctx;
}

/**
 * 「原生输入框增强」两个开关的控制器（`client.js` 的 apply 里交进来）。
 *
 * 这两个开关存**客户端**（localStorage），不走宿主设置：本机实测该命名空间
 * 的宿主写入被整体拒绝（连老字段的空写都拒），而它们只影响浏览器侧行为。
 * 详见 `native-switches.js`。
 */
let nativeSwitches = null;

/** 交接口：`client.js` 建好控制器后调用一次。 */
export function setNativeSwitches(controller) {
  nativeSwitches = controller;
}

/** 写开关：存储写失败只降级（本次仍生效），绝不冒到渲染层。 */
function guardSwitchWrite(run) {
  try {
    run();
  } catch (error) {
    try {
      console.error('[dsh-enhanced-prompt-editor] 原生开关写入失败：', error);
    } catch {
      // 控制台不可用就只降级。
    }
  }
}

/** 读两个开关的当前值（控制器缺席时按默认「都关」）。 */
function currentSwitches() {
  try {
    const value = nativeSwitches?.get?.();
    return {
      nativeDeck: value?.nativeDeck === true,
      nativeEnter: value?.nativeEnter === true,
      // 缺字段按「开」：老版本存储里没有这一项，不能让升级把快捷键弄丢。
      shortcutEnabled: value?.shortcutEnabled !== false,
      extendedEnter: value?.extendedEnter === 'newline' || value?.extendedEnter === 'inherit'
        ? value.extendedEnter
        : undefined,
    };
  } catch {
    return { nativeDeck: false, nativeEnter: false, shortcutEnabled: true, extendedEnter: undefined };
  }
}

/**
 * 直接调一次 `remote.settings.mutate`，把宿主给出的原文原因捞出来。
 *
 * 走 `ctx.get('remote')` 而不是 `ctx.remote`：后者受 `inject` 服务代理限制，
 * 而本插件的 inject 里没有 `remote.settings`（也不该为了诊断把它变成必需依赖
 * —— 那会让整个插件在缺少该服务的组合里挂起）。
 *
 * @returns `{ ok: true }` 写入成功；`{ ok: false, message }` 宿主给了原因；
 *          `undefined` 拿不到通道（此时保持原判）。
 */
async function probeRawRpc(namespace, ops, expectedRevision) {
  try {
    const remote = pluginContext?.get?.('remote');
    const call = remote?.settings?.mutate;
    if (typeof call !== 'function') return undefined;
    const response = await call.call(remote.settings, namespace, ops, expectedRevision);
    if (response?.ok === true) return { ok: true };
    const message = response?.error?.message ?? response?.error?.code ?? String(response?.error ?? '');
    return { ok: false, message: String(message) };
  } catch (error) {
    return { ok: false, message: String(error?.message ?? error) };
  }
}

/** 读 scope 快照，读不到就返回 null（保存失败路径上不能因为探测再抛一次）。 */
function safeSnapshot(scope) {
  try {
    return scope?.getSnapshot?.() ?? null;
  } catch {
    return null;
  }
}

/**
 * 探针：把 `panelHeight` 写成**它当前的值**，看这个命名空间到底能不能写。
 *
 * 之所以要有这一步：宿主拒绝写入时客户端拿不到原因，而「拒绝」至少有两种
 * 完全不同的病因 —— 字段没被宿主接受（旧 schema）、或者整个命名空间写不进去
 * （文档落盘、条目状态）。两者的修法毫无关系，必须能区分开。
 *
 * @returns `'ok'` 能写 / `'rejected'` 宿主拒了 / `'threw'` 抛错 / `'skipped'` 没探
 */
async function probeWritePath(scope) {
  const current = safeSnapshot(scope)?.value?.panelHeight;
  if (typeof current !== 'number') return 'skipped';
  try {
    const ok = await scope.mutate([{ op: 'set', path: ['panelHeight'], value: current }], undefined);
    return ok === true ? 'ok' : 'rejected';
  } catch {
    return 'threw';
  }
}

/**
 * 给 `SettingsFormModel` 一层诊断用 scope：行为原样透传，只额外做两件事。
 *
 * 1. **记下保存被拒的现场。** 内核 `SettingsFormModel.save()` 会把
 *    `scope.mutate()` 的失败吞成一句泛泛的「宿主拒绝了这次写入」，真实原因
 *    （revision 冲突？字段不被认可？）不落到任何地方 —— 真机上无法排查。
 *    这里把 ops、我们发出的 revision、以及当前快照的 revision 记下来，
 *    由卡片渲染成一行可读的诊断。
 *
 * 2. **revision 冲突自愈。** `save()` 发出的是「**第一次编辑时**抓到的
 *    revision」；宿主只在 revision 完全一致时才收（`SettingsConflictError`），
 *    只要期间设置文档被改写过一次（哪怕只是宿主自己重写了同一份文件），
 *    这次写入就会被判成「changed since it was read」，而且**重试也永远失败**
 *    —— 因为草稿与 revision 都还在旧值上。内核自己的单字段通道
 *    （`ConfigForm.set`）恰恰是**不带 revision** 写的，语义等价、不会覆盖
 *    别人改的其他字段。所以这里在第一次失败后再写一次，退化成同样的语义。
 *
 * @param scope `configForms.get(ns)` 给的 ConfigForm 实例。
 * @param report 收到诊断现场时的回调。
 * @returns 可直接交给 `SettingsFormModel` 的 scope 形状对象。
 */
function diagnosedScope(scope, report) {
  if (scope === null || typeof scope !== 'object') return scope;
  return {
    getSnapshot: () => scope.getSnapshot(),
    subscribe: (listener) => scope.subscribe(listener),
    set: (field, value) => scope.set(field, value),
    unset: (field) => scope.unset(field),
    mutate: async (ops, expectedRevision) => {
      const before = safeSnapshot(scope);
      let first;
      try {
        first = await scope.mutate(ops, expectedRevision);
      } catch (error) {
        report({
          kind: 'throw',
          ops,
          expectedRevision,
          snapshotRevision: before?.revision,
          message: String(error?.message ?? error),
        });
        throw error;
      }
      if (first === true) return true;
      // 失败后 `ConfigForm` 已经 `recover()` 重新拉过一次宿主状态，
      // 此刻的快照 revision 是新的 —— 丢掉旧 revision 再试一次。
      const after = safeSnapshot(scope);
      let retried;
      try {
        retried = await scope.mutate(ops, undefined);
      } catch (error) {
        report({
          kind: 'throw',
          ops,
          expectedRevision,
          snapshotRevision: after?.revision,
          retried: true,
          message: String(error?.message ?? error),
        });
        throw error;
      }
      if (retried === true) {
        report({
          kind: 'recovered',
          ops,
          expectedRevision,
          snapshotRevision: after?.revision,
          retried: true,
        });
        return true;
      }
      // 两次都被拒 → 再做一次**同值空写**探针，区分两种完全不同的病因：
      //   探针成功 = 这个命名空间能写，是**这两个字段本身**不被宿主接受
      //              （典型：运行中的 Host 还是旧 schema，不认识新字段）；
      //   探针失败 = 这个命名空间**整体**写不进去（文档落盘 / 条目状态之类），
      //              与本次新增的字段无关。
      // 探针写的是 `panelHeight` 的**当前值**（本来就写在 profile patch 里），
      // 语义上是空操作，不会改动任何设置。
      const canary = await probeWritePath(scope);
      const hostValueAtFail = after?.value;
      // 最后再直接调一次同一条 RPC，把宿主**原文**原因捞出来。
      // 内核把它丢了，而这才是唯一能定位「为什么拒绝」的东西。
      const raw = await probeRawRpc(SETTINGS_NAMESPACE, ops, undefined);
      if (raw?.ok === true) {
        report({ kind: 'recovered', ops, expectedRevision, snapshotRevision: after?.revision, retried: true });
        return true;
      }
      report({
        kind: 'rejected',
        ops,
        expectedRevision,
        snapshotRevision: after?.revision,
        retried: true,
        canary,
        hostMessage: raw?.message,
        hostKnows: hostValueAtFail !== null && typeof hostValueAtFail === 'object'
          ? Object.hasOwn(hostValueAtFail, 'nativeDeck')
          : undefined,
      });
      return false;
    },
  };
}

/**
 * 插件配置卡片组件。
 *
 * @param props 由插槽框架注入：`t`、`view`、`scope`、`bootFailures`。
 */
export function PluginCard(props) {
  ensureCss();
  const { t, view, scope, bootFailures } = props;

  // `SettingsFormModel` 只建一次：它自己订阅 scope，重建会丢掉暂存草稿。
  const modelRef = useRef(null);
  if (modelRef.current === null) {
    lastSaveFailure = null;
    try {
      modelRef.current = new SettingsFormModel(diagnosedScope(scope, (detail) => {
        // 内核只告诉我们「宿主拒绝了这次写入」，真实原因被它吞掉。
        // 我们自己记下来：① 打到控制台（error 级会进 crash 日志，事后能查）
        // ② 渲染到卡片上，用户截图即可，不必猜。
        lastSaveFailure = detail;
        try {
          console.error('[dsh-enhanced-prompt-editor] 设置写入被拒绝：', JSON.stringify(detail));
        } catch {
          // 控制台不可用就只留卡片上的展示。
        }
      }), SPECS);
    } catch {
      modelRef.current = false; // false = 建不起来，下面渲染只读提示。
    }
  }
  const model = modelRef.current === false ? null : modelRef.current;

  const [, forceRender] = useState(0);
  useEffect(() => {
    if (model === null) return undefined;
    const store = model.bind(() => plainOf(scope));
    const off = store.subscribe(() => forceRender((n) => n + 1));
    return () => {
      off();
      model.dispose();
    };
  }, [model, scope]);

  // 开关变化（含别处调用 set）要驱动卡片重渲染：草稿草稿在 SettingsFormModel 里，
  // 而这两个开关在我们自己的客户端存储里，不订阅就不会更新 UI。
  useEffect(() => {
    if (nativeSwitches === null || typeof nativeSwitches.subscribe !== 'function') return undefined;
    return nativeSwitches.subscribe(() => forceRender((n) => n + 1));
  }, []);

  // 插件列表卡片里的那一行描述：必须有，否则卡片标题下是空的。
  if (view === 'summary') {
    return t?.('settings.summary') ?? 'Enhanced prompt editor';
  }

  if (model === null) {
    return h(
      'div',
      { className: 'dsh-epe-card' },
      h('div', { className: 'dsh-epe-card-warn' }, t?.('settings.unavailable') ?? 'Settings unavailable'),
    );
  }

  const actions = model.actions();
  const shell = model.shell();
  const editable = shell.writable && !shell.saving;
  const draft = (field) => model.field(field);

  /** 一个受控 `Switch`（官方配置页的布尔控件形状）。 */
  const toggle = (field, labelKey, hintKey) =>
    h(
      'div',
      { className: 'dsh-epe-card-inline', key: field },
      h(
        'div',
        { className: 'dsh-epe-card-inlineText' },
        h('span', { className: 'dsh-epe-card-heading' }, t?.(labelKey) ?? labelKey),
        hintKey === undefined ? null : h('p', { className: 'dsh-epe-card-help' }, t?.(hintKey) ?? hintKey),
      ),
      h(Switch, {
        checked: draft(field).text === 'true',
        label: t?.(labelKey) ?? labelKey,
        disabled: !editable,
        onChange: (next) => actions.edit(field, next ? 'true' : 'false'),
      }),
    );

  /**
   * 一个受控枚举选择器。
   *
   * 用 primitives 的 `Menu` + 锚点按钮：primitives 里没有 `Select`，而官方
   * `EnterBehaviorRow` 正是这个形状（`Menu` 的 anchor 是 `<button>`）。
   */
  const chooser = (field, labelKey, hintKey, options) => {
    const current = draft(field).text;
    const selected = options.find((option) => option.value === current);
    return h(Chooser, {
      key: field,
      label: t?.(labelKey) ?? labelKey,
      hint: hintKey === undefined ? undefined : (t?.(hintKey) ?? hintKey),
      value: current,
      selectedLabel: selected?.label ?? current,
      options,
      disabled: !editable,
      onSelect: (value) => actions.edit(field, String(value)),
    });
  };

  /**
   * 一个**立即生效**的开关：切换即写客户端存储 + 广播，不经过设置表单的
   * 草稿/保存流程。
   *
   * 为什么和 `toggle()` 分开：宿主设置那条写入通道在本机被整体拒绝
   * （空写探针也是 rejected），而这两个开关只影响浏览器侧行为，放客户端
   * 才是可靠路径。好处是顺手：勾了就生效，不用再点保存。
   */
  const immediateToggle = (field, on, labelKey, hintKey) =>
    h(
      'div',
      { className: 'dsh-epe-card-inline', key: `immediate-${field}` },
      h(
        'div',
        { className: 'dsh-epe-card-inlineText' },
        h('span', { className: 'dsh-epe-card-heading' }, t?.(labelKey) ?? labelKey),
        hintKey === undefined ? null : h('p', { className: 'dsh-epe-card-help' }, t?.(hintKey) ?? hintKey),
      ),
      h(Switch, {
        checked: on,
        label: t?.(labelKey) ?? labelKey,
        onChange: (next) => {
          guardSwitchWrite(() => nativeSwitches?.set?.({ [field]: next === true }));
          // 卡片自己重渲染（控制器广播也会驱动，但这里立刻响应更跟手）。
          forceRender((n) => n + 1);
        },
      }),
    );

  /**
   * 一个**立即生效**的枚举选择器：切换即写客户端存储 + 广播。
   *
   * 回车策略（`extendedEnter`）也从宿主设置搬到了客户端：宿主写入在本机被整体
   * 拒绝，留在宿主设置里等于「改不动」——用户实测「高级 enter 启用失败」就是
   * 改完没存进去，策略一直是旧的 `newline`，回车永远换行。
   */
  const immediateChooser = (field, value, labelKey, hintKey, options) =>
    h(Chooser, {
      key: `immediate-${field}`,
      label: t?.(labelKey) ?? labelKey,
      hint: hintKey === undefined ? undefined : (t?.(hintKey) ?? hintKey),
      value,
      selectedLabel: (options.find((option) => option.value === value) ?? options[0])?.label ?? '',
      options,
      disabled: false,
      onSelect: (next) => {
        guardSwitchWrite(() => nativeSwitches?.set?.({ [field]: next }));
        forceRender((n) => n + 1);
      },
    });

  /** 一个受控数字字段：用 `SettingsValueField`，与官方限制页同款。 */
  const number = (field, labelKey, hintKey) => {
    const range = RANGES[field];
    const state = draft(field);
    return h(SettingsValueField, {
      key: field,
      id: `${PLUGIN_ID}-${field}`,
      label: t?.(labelKey) ?? labelKey,
      hint: hintKey === undefined ? undefined : (t?.(hintKey) ?? hintKey),
      text: state.text,
      numeric: true,
      invalid: state.invalid,
      invalidLabel: t?.('settings.invalidNumber', { min: range.min, max: range.max }) ?? 'Out of range',
      overridden: state.overridden,
      overriddenLabel: t?.('settings.overridden') ?? 'Overridden',
      resetLabel: t?.('settings.reset') ?? 'Reset',
      disabled: !editable,
      onEdit: (text) => actions.edit(field, text),
      onReset: () => actions.resetField(field),
    });
  };

  const modeEditorOn = draft('modeEditor').text === 'true';
  const modeExtendedOn = draft('modeExtended').text === 'true';
  // 这两个开关存客户端（见 setNativeSwitches 的注释），**不走** SettingsForm 的
  // 草稿/保存流程：切换即生效、即持久化，所以按钮不受 `editable` / 保存态影响。
  const switches = currentSwitches();
  const nativeDeckOn = switches.nativeDeck;
  const nativeEnterOn = switches.nativeEnter;
  /** 「启用 Ctrl/Cmd+T」：同样存客户端，切换即注册/注销（见 client.js 的 sync）。 */
  const shortcutOn = switches.shortcutEnabled;
  /** 当前回车策略（客户端存储优先，未存过回退宿主设置）。 */
  const enterPolicy = switches.extendedEnter ?? 'inherit';
  /**
   * 「回车策略」这个 chooser 只渲染**一处**（避免同一个字段出现两个受控控件）。
   *
   * 优先级：扩展模式开着 → 放在扩展那节（原有位置，语义最贴切）；
   * 否则若勾了「原生输入框的高级回车」→ 放到原生那节（否则用户开了开关却
   * 选不到策略，而默认的 `inherit` 等于什么都不做 —— 那是个静默的哑开关）。
   */
  const enterChooserInExtended = modeExtendedOn;
  const enterChooserInNative = !modeExtendedOn && nativeEnterOn;

  return h(
    SettingsForm,
    {
      state: shell,
      labels: {
        unavailable: t?.('settings.unavailable') ?? 'Settings unavailable',
        readOnly: t?.('settings.readOnly') ?? 'These settings are read-only here.',
        save: t?.('settings.save') ?? 'Save',
        saving: t?.('settings.saving') ?? 'Saving…',
        saveFailed: t?.('settings.saveFailed') ?? 'The host rejected the change.',
      },
      onSave: () => void actions.save(),
      onDiscard: () => actions.discard(),
    },
    renderWarnings(t, bootFailures),
    // ── 工作模式：勾选 + 排序 ────────────────────────────────────────
    h(
      'section',
      { className: 'dsh-epe-card-section' },
      h('h3', { className: 'dsh-epe-card-heading' }, t?.('settings.modes') ?? 'Modes'),
      h('p', { className: 'dsh-epe-card-help' }, t?.('settings.modesHint') ?? ''),
      toggle('modeEditor', 'settings.mode.editor', 'settings.mode.editorHint'),
      toggle('modeExtended', 'settings.mode.extended', 'settings.mode.extendedHint'),
      modeEditorOn && modeExtendedOn
        ? chooser('editorFirst', 'settings.modeOrder', 'settings.modeOrderHint', [
            { value: 'true', label: t?.('settings.modeOrder.editorFirst') ?? 'Editor first' },
            { value: 'false', label: t?.('settings.modeOrder.extendedFirst') ?? 'Tall composer first' },
          ])
        : null,
      modeEditorOn || modeExtendedOn
        ? null
        : h('div', { className: 'dsh-epe-card-note' }, t?.('settings.needOneMode') ?? ''),
    ),
    // ── 原生输入框增强（不需要切模式）────────────────────────────────
    h(
      'section',
      { className: 'dsh-epe-card-section' },
      h('h3', { className: 'dsh-epe-card-heading' }, t?.('settings.native') ?? 'Native composer'),
      h('p', { className: 'dsh-epe-card-help' }, t?.('settings.nativeHint') ?? ''),
      // 这两个开关**立即生效、立即保存**（存客户端），不参与下面的草稿/保存流程。
      // 所以它们不看 `editable`，也不需要点「保存」。
      immediateToggle('nativeDeck', nativeDeckOn, 'settings.nativeDeck', 'settings.nativeDeckHint'),
      immediateToggle('nativeEnter', nativeEnterOn, 'settings.nativeEnter', 'settings.nativeEnterHint'),
      enterChooserInNative
        ? immediateChooser('extendedEnter', enterPolicy, 'settings.extendedEnter', 'settings.extendedEnterHint', [
            { value: 'inherit', label: t?.('settings.extendedEnter.inherit', { send: sendKeyLabel() }) ?? 'Follow DSH' },
            { value: 'newline', label: t?.('settings.extendedEnter.newline', { send: sendKeyLabel() }) ?? 'Enter adds a line' },
          ])
        : null,
    ),
    // ── 快捷键（Ctrl/Cmd+T）───────────────────────────────────────────
    h(
      'section',
      { className: 'dsh-epe-card-section' },
      h('h3', { className: 'dsh-epe-card-heading' }, t?.('settings.shortcut') ?? 'Shortcut'),
      h('p', { className: 'dsh-epe-card-help' }, t?.('settings.shortcutHint') ?? ''),
      // 同样「立即生效、立即保存」：切换后 client.js 会真的注册/注销内核命令。
      immediateToggle('shortcutEnabled', shortcutOn, 'settings.shortcutEnabled', 'settings.shortcutEnabledHint'),
    ),
    // ── 扩展输入框模式 ──────────────────────────────────────────────
    modeExtendedOn
      ? h(
          'section',
          { className: 'dsh-epe-card-section' },
          h('h3', { className: 'dsh-epe-card-heading' }, t?.('settings.mode.extended') ?? 'Tall composer'),
          enterChooserInExtended
            ? immediateChooser('extendedEnter', enterPolicy, 'settings.extendedEnter', 'settings.extendedEnterHint', [
                { value: 'inherit', label: t?.('settings.extendedEnter.inherit', { send: sendKeyLabel() }) ?? 'Follow DSH' },
                { value: 'newline', label: t?.('settings.extendedEnter.newline', { send: sendKeyLabel() }) ?? 'Enter adds a line' },
              ])
            : null,
          number('extendedHeight', 'settings.extendedHeight', 'settings.extendedHeightHint'),
        )
      : null,
    // ── 编辑器模式（面板本身）────────────────────────────────────────
    modeEditorOn
      ? h(
          'section',
          { className: 'dsh-epe-card-section' },
          h('h3', { className: 'dsh-epe-card-heading' }, t?.('settings.mode.editor') ?? 'Editor'),
          chooser('storage', 'settings.storage', 'settings.storageHint', [
            { value: 'workspace', label: t?.('settings.storage.workspace') ?? 'Workspace .md' },
            { value: 'browser', label: t?.('settings.storage.browser') ?? 'Browser only' },
            { value: 'none', label: t?.('settings.storage.none') ?? 'Do not save' },
          ]),
          draft('storage').text === 'workspace'
            ? h(SettingsValueField, {
                id: `${PLUGIN_ID}-dir`,
                label: t?.('settings.dir') ?? 'Draft directory',
                hint: t?.('settings.dirHint') ?? '',
                text: draft('dir').text,
                overridden: draft('dir').overridden,
                overriddenLabel: t?.('settings.overridden') ?? 'Overridden',
                resetLabel: t?.('settings.reset') ?? 'Reset',
                disabled: !editable,
                onEdit: (text) => actions.edit('dir', text),
                onReset: () => actions.resetField('dir'),
              })
            : null,
          chooser('enterMode', 'settings.enterMode', 'settings.enterHint', [
            { value: 'newline', label: t?.('settings.enterMode.newline', { send: sendKeyLabel() }) ?? 'Enter adds a line' },
            { value: 'send', label: t?.('settings.enterMode.send', { send: sendKeyLabel() }) ?? 'Enter sends' },
          ]),
          number('panelHeight', 'settings.height', 'settings.heightHint'),
          number('editorFontSize', 'settings.editorFontSize', 'settings.editorFontSizeHint'),
          number('keySize', 'settings.keySize', 'settings.keySizeHint'),
          toggle('browseWithReader', 'settings.browseWithReader', 'settings.browseWithReaderHint'),
          toggle('dictate', 'settings.dictate', 'settings.dictateHint'),
        )
      : null,
    // ── 保存被拒时的现场 ────────────────────────────────────────────
    // 内核只显示一句「宿主拒绝了这次写入」，真实原因被吞掉。这里把现场摊开，
    // 让下一次失败能直接定位（也能被用户截图出来）。
    lastSaveFailure === null || lastSaveFailure.kind === 'recovered'
      ? null
      : h(
          'p',
          { className: 'dsh-epe-card-warn', role: 'status' },
          `${t?.('settings.saveRejected') ?? '保存被宿主拒绝。'}`
          + `kind=${lastSaveFailure.kind}`
          + ` 字段=${(lastSaveFailure.ops ?? []).map((op) => (op.path ?? []).join('.')).join(',')}`
          + ` 发出revision=${String(lastSaveFailure.expectedRevision)}`
          + ` 当前revision=${String(lastSaveFailure.snapshotRevision)}`
          + ` 重试=${lastSaveFailure.retried === true ? '是' : '否'}`
          + ` 宿主认字段=${lastSaveFailure.hostKnows === true ? '是' : lastSaveFailure.hostKnows === false ? '否' : '未知'}`
          + (lastSaveFailure.canary === undefined ? '' : ` 空写探针=${lastSaveFailure.canary}`)
          + (lastSaveFailure.message === undefined ? '' : ` 错误=${lastSaveFailure.message}`)
          + (lastSaveFailure.hostMessage === undefined || lastSaveFailure.hostMessage === ''
            ? ''
            : ` 宿主原文=${lastSaveFailure.hostMessage}`),
        ),
  );
}

/**
 * 一个受控的枚举选择器（`Menu` + 锚点按钮）。
 *
 * 抽成组件是因为 `Menu` 自己持有 `open` 状态，写在 `PluginCard` 里会让
 * 每个枚举共用一个 open 标志（官方 `EnterBehaviorRow` 也是独立组件）。
 */
function Chooser(props) {
  const { label, hint, value, selectedLabel, options, disabled, onSelect } = props;
  const [open, setOpen] = useState(false);
  const listId = `${PLUGIN_ID}-${label}`;
  return h(
    'div',
    { className: 'dsh-epe-card-row' },
    h(
      'div',
      { className: 'dsh-epe-card-inline' },
      h(
        'div',
        { className: 'dsh-epe-card-inlineText' },
        h('span', { className: 'dsh-epe-card-heading', id: `${listId}-label` }, label),
        hint === undefined ? null : h('p', { className: 'dsh-epe-card-help' }, hint),
      ),
      h(Menu, {
        open,
        onClose: () => setOpen(false),
        items: options.map((option) => ({ id: option.value, label: option.label })),
        selectedId: value,
        align: 'end',
        portal: true,
        onSelect: (id) => {
          setOpen(false);
          onSelect(id);
        },
        anchor: h(
          'button',
          {
            type: 'button',
            className: 'dsh-epe-card-selector',
            'aria-haspopup': 'menu',
            'aria-expanded': open,
            'aria-labelledby': `${listId}-label`,
            disabled,
            onClick: () => setOpen((current) => !current),
          },
          selectedLabel,
        ),
      }),
    ),
  );
}

/**
 * 启动降级提示。
 *
 * 本插件启动时任一步骤抛错都只降级（见 `./client.js` 的 guardStep），页面上
 * 必须说出来——否则用户只会看到「按钮不见了」而无从判断。
 */
function renderWarnings(t, bootFailures) {
  const failures = Array.isArray(bootFailures) ? bootFailures : [];
  if (failures.length === 0) return null;
  return h(
    'div',
    { className: 'dsh-epe-card-warn' },
    h('div', null, t?.('settings.bootFailed') ?? 'Some startup steps failed:'),
    h(
      'ul',
      { className: 'dsh-epe-card-warn-list' },
      failures.map((failure, index) =>
        h(
          'li',
          { key: `${failure?.where ?? 'unknown'}-${index}` },
          `${failure?.where ?? 'unknown'}: ${failure?.message ?? ''}`,
        ),
      ),
    ),
  );
}

/** 与面板共用同一份平台判断。 */
function sendKeyLabel() {
  const platform = globalThis.navigator?.platform ?? '';
  return /mac|iphone|ipad/i.test(platform) ? '⌘↵' : 'Ctrl+Enter';
}
