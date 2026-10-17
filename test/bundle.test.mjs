/**
 * dsh-enhanced-prompt-editor —— bundle 集成测试。
 *
 * 这不是「测试文件存在」，而是**真的把 lib/client.js 当浏览器那样执行**：
 * 造一个最小的 `window.__ModuleLoader__`、一份 react 桩、一个假的 DSH 上下文，
 * 然后断言：
 *  - bundle 能注册成功；
 *  - apply 后三个表面（工具行按钮、右侧栏 tab、设置页）都完成了注册；
 *  - 工具行按钮的插槽 id/order 正确；
 *  - 回车语义在真实组件上的行为符合设置；
 *  - 发送真的调用了 inputActions.setDraft + submit。
 *
 * 这是本项目唯一的「行为」测试：单元测试证明纯函数对，这里证明接线对。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SYMBOLS } from '../src/edit-ops.js';

const here = dirname(fileURLToPath(import.meta.url));
const bundlePath = join(here, '..', 'lib', 'client.js');

/**
 * `@deepseek-ai/dsh-client-ui-primitives` 的桩。
 *
 * 本插件的 UI 全部走 primitives（用户 2026-10-15 硬规则），所以接线测试必须
 * 提供它——和 `react` 一样，它就是生产里真实存在的宿主契约。
 *
 * 每个组件都渲染成一个可断言的节点（`type` 是 `<Name>` 字符串、`props` 原样
 * 保留），这样测试能验证「用了哪个原语、传了什么」，而不必重实现它的外观。
 */
function makePrimitives(react) {
  const h = react.createElement;
  /**
   * 造一个原语桩。
   *
   * `h(Button, …)` 记录的节点 `type` 是**这个函数本身**（不是字符串），所以
   * 在函数上挂一个 `primitiveName` 标记，测试就能断言「用了哪个原语」。
   * 函数被调用时渲染出的节点 type 才是 `'<Button>'`。
   */
  const make = (name) => {
    const Component = (props) => h(`<${name}>`, props ?? {});
    Component.primitiveName = name;
    return Component;
  };
  const exports = {
    Button: make('Button'),
    Switch: make('Switch'),
    Checkbox: make('Checkbox'),
    Input: make('Input'),
    Menu: make('Menu'),
    Tooltip: make('Tooltip'),
    Toast: make('Toast'),
    Tag: make('Tag'),
    StateDot: make('StateDot'),
    SettingsForm: make('SettingsForm'),
    SettingsValueField: make('SettingsValueField'),
    SettingsSecretField: make('SettingsSecretField'),
    settingsNumberField: (field) => ({
      field,
      format: (value) => (typeof value === 'number' ? String(value) : ''),
      parse: (text) => (text.trim() === '' ? { kind: 'clear' } : { kind: 'set', value: Number(text) }),
    }),
    settingsTextField: (field) => ({
      field,
      format: (value) => (typeof value === 'string' ? value : ''),
      parse: (text) => (text.trim() === '' ? { kind: 'clear' } : { kind: 'set', value: text.trim() }),
    }),
  };
  // 图标：渲染成一个带名字的空节点，便于断言「角标用了哪个图标」。
  for (const icon of [
    'IconPanelLeftOutlineRegular',
    'IconChevronUpOutlineRegular',
    'IconChevronDownOutlineRegular',
    'IconCheckCircleOutlineRegular',
    'IconInfoOutlineRegular',
    'IconEditOutlineRegular',
    'IconCodeOutlineRegular',
    'IconFullscreenOutlineRegular',
  ]) {
    exports[icon] = make(icon);
  }
  // `SettingsFormModel` 是**有状态的真实实现**，不能只是占位：卡片的行为
  // （暂存草稿、只有保存才写、非法草稿阻止保存）都由它决定，桩掉它就等于
  // 把要测的逻辑一起桩掉了。这里按内核 0.2.1-rc.2 的实际语义实现子集。
  exports.SettingsFormModel = class SettingsFormModelStub {
    constructor(scope, specs) {
      this.scope = scope;
      this.specs = new Map(specs.map((spec) => [spec.field, spec]));
      this.staged = new Map();
      this.listeners = new Set();
      this.saving = false;
      this.failed = false;
      this.unsubscribe = scope?.subscribe?.(() => this.publish());
    }
    bind(project) {
      const store = {
        listeners: new Set(),
        value: project(),
        subscribe(listener) {
          this.listeners.add(listener);
          return () => this.listeners.delete(listener);
        },
        set(next) {
          this.value = next;
          for (const listener of [...this.listeners]) listener();
        },
      };
      this.listeners.add(() => store.set(project()));
      return store;
    }
    shell() {
      const snapshot = this.scope?.getSnapshot?.() ?? {};
      const plan = this.plan();
      return {
        available: snapshot.status === 'ready',
        writable: snapshot.writable === true,
        dirty: plan.length > 0,
        invalid: plan.some((item) => item.run === undefined && item.op === undefined),
        saving: this.saving,
        failed: this.failed,
      };
    }
    field(field) {
      const staged = this.staged.get(field);
      const spec = this.specs.get(field);
      if (staged === undefined) {
        return { text: spec.format(this.sectionValue(field)), overridden: this.stored(field), invalid: false };
      }
      const write = staged.clear ? { kind: 'clear' } : spec.parse(staged.text);
      return { text: staged.text, overridden: write?.kind === 'set', invalid: write === undefined };
    }
    actions() {
      return {
        edit: (field, text) => this.stage(field, { text, clear: false }),
        resetField: (field) => this.stage(field, { text: this.specs.get(field).format(this.baseValue(field)), clear: true }),
        save: () => this.save(),
        discard: () => {
          this.staged.clear();
          this.failed = false;
          this.publish();
        },
      };
    }
    async save() {
      const plan = this.plan();
      if (!plan.length || this.saving || this.scope?.getSnapshot?.().writable !== true) return;
      if (plan.some((item) => item.run === undefined && item.op === undefined)) return;
      this.saving = true;
      const ops = plan.flatMap((item) => (item.op === undefined ? [] : [item.op]));
      this.__saved = ops;
      const landed = await this.scope.mutate(ops, this.scope.getSnapshot().revision);
      if (landed) this.staged.clear();
      else this.failed = true;
      this.saving = false;
      this.publish();
    }
    plan() {
      const plan = [];
      for (const [field, staged] of this.staged) {
        const spec = this.specs.get(field);
        if (staged.clear) {
          if (this.stored(field)) plan.push({ field, op: { op: 'unset', path: [field] } });
          continue;
        }
        if (staged.text === spec.format(this.sectionValue(field))) continue;
        const write = spec.parse(staged.text);
        if (write === undefined) plan.push({ field });
        else if (write.kind === 'clear') plan.push({ field, op: { op: 'unset', path: [field] } });
        else plan.push({ field, op: { op: 'set', path: [field], value: write.value } });
      }
      return plan;
    }
    stage(field, edit) {
      this.staged.set(field, edit);
      this.failed = false;
      this.publish();
    }
    sectionValue(field) {
      return this.scope?.getSnapshot?.().value?.[field];
    }
    baseValue(field) {
      return this.scope?.getSnapshot?.().base?.[field];
    }
    stored(field) {
      const user = this.scope?.getSnapshot?.().user;
      return user !== undefined && Object.hasOwn(user, field);
    }
    publish() {
      for (const listener of [...this.listeners]) listener();
    }
    dispose() {
      this.unsubscribe?.();
      this.listeners.clear();
    }
  };
  return exports;
}

/**
 * 一个够用的 React 桩：组件就是「记下 props 与调用」，`useState`/`useEffect`
 * 退化成可用但不做调度的版本——本测试只关心 render 的**输出结构**与
 * 事件回调行为，不重实现 React 的并发渲染。
 */
function makeReact() {
  const created = [];
  const states = [];
  let stateCursor = 0;
  const refs = [];
  let refCursor = 0;

  const createElement = (type, props, ...children) => {
    const node = { type, props: { ...(props ?? {}), children: children.length <= 1 ? children[0] : children } };
    created.push(node);
    return node;
  };
  const Fragment = Symbol('Fragment');

  const react = {
    createElement,
    Fragment,
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    useRef: (initial) => {
      const index = refCursor;
      refCursor += 1;
      if (refs[index] === undefined) refs[index] = { current: initial };
      return refs[index];
    },
    useState: (initial) => {
      const index = stateCursor;
      stateCursor += 1;
      if (states[index] === undefined) states[index] = typeof initial === 'function' ? initial() : initial;
      const setter = (next) => {
        states[index] = typeof next === 'function' ? next(states[index]) : next;
      };
      return [states[index], setter];
    },
    // effect 直接同步执行一次：测试里没有真正的提交阶段。
    useEffect: () => undefined,
    useLayoutEffect: () => undefined,
    useSyncExternalStore: (subscribe, getSnapshot) => {
      subscribe(() => undefined);
      return getSnapshot();
    },
    __created: created,
    /**
     * 重置渲染计数与**已记录节点**。
     *
     * 必须连 `created` 一起清空：只重置游标会让下一次 `entry.component(...)`
     * 的断言读到上一轮的旧节点（`find` 命中旧的那一个），这正是「断言看着通过、
     * 实际测的是上一次渲染」这类假绿。清空后 `react.__created` 只含本次渲染。
     */
    __reset: () => {
      stateCursor = 0;
      refCursor = 0;
      created.length = 0;
    },
    /**
     * 额外清掉 `useRef` 槽位，模拟**重新挂载**。
     *
     * 需要它是因为本插件的插件卡片把 `SettingsFormModel` 缓存在 `useRef` 里
     * （生产里这是对的：重建会丢掉暂存草稿）。测试要复用同一个 react 桩渲染
     * 不同配置时，就得显式重挂，否则第二次渲染会拿第一次的模型。
     * 反过来，测「暂存跨渲染保留」的用例**不能**调这个——那正是要保住的语义。
     */
    __resetRefs: () => {
      refs.length = 0;
    },
  };
  return react;
}

/** 造一个记录调用并支持模型装载的假 DSH 客户端上下文。 */
function makeCtx() {
  const registrations = [];
  const effects = [];
  const localeRegistrations = [];
  const tabTypes = [];
  const shortcutCommands = [];
  const injections = [];
  const signalSubscribers = new Map();

  const makeSlots = () => ({
    inject: (name, register) => {
      injections.push(name);
      // DSH 的 inject 在插槽被声明后回调；这里立即回调。
      return register();
    },
    register: (options, component) => {
      const entry = { options, component };
      registrations.push(entry);
      return () => {
        const at = registrations.indexOf(entry);
        if (at >= 0) registrations.splice(at, 1);
      };
    },
  });

  const ctx = {
    slots: makeSlots(),
    effect: (fn) => {
      const dispose = fn();
      effects.push(dispose);
      return dispose;
    },
    inject: undefined,
    get: (name) => (name === 'configForms' ? ctx.__configForms : undefined),
    locale: {
      register: (ns, dict) => {
        localeRegistrations.push({ ns, dict });
        return () => undefined;
      },
      bind: (ns) => {
        const dict = localeRegistrations.find((entry) => entry.ns === ns)?.dict?.zh ?? {};
        return (key, params) => {
          const raw = dict[key] ?? key;
          if (params === undefined) return raw;
          return raw.replace(/\{(\w+)\}/g, (match, name) => (params[name] === undefined ? match : String(params[name])));
        };
      },
    },
    sidebarRightTabs: {
      register: (definition) => {
        tabTypes.push(definition);
        return () => undefined;
      },
    },
    // 内核 shortcuts 服务：注册的快捷键命令进 `shortcutCommands` 供断言。
    shortcuts: {
      register: (command) => {
        shortcutCommands.push(command);
        return () => {
          const at = shortcutCommands.indexOf(command);
          if (at >= 0) shortcutCommands.splice(at, 1);
        };
      },
      registerFixed: (command) => {
        shortcutCommands.push(command);
        return () => undefined;
      },
    },
    sidebarRight: {
      /**
       * 内核里 `openTab` → `openContent` → `planSetExpanded(state, true)`，
       * 也就是**打开 tab 会展开整列**。桩必须照做，否则「离开编辑器模式时
       * 把列收回去」这条逻辑在测试里永远不会触发。
       */
      openTab: (kind) => {
        ctx.__openedTabs.push(kind);
        ctx.__expanded = true;
        ctx.__tabs = [...ctx.__tabs, { id: `tab-${kind}-${ctx.__tabs.length}`, kind, contentId: 'x', title: 'T' }];
      },
      openResource: (address) => {
        ctx.__openedResources.push(address);
      },
      /**
       * ⚠️ 这几个桩必须**忠实模拟内核语义**，否则本插件那个 bug 测不出来。
       *
       * 尤其：`close(tabId)` 只关 tab，**不**收列。内核里「关掉最后一个停靠
       * tab 会连同整列收起」由 store 的 planner 决定，而停靠面永远至少有一个
       * 引导页，所以我们的 tab 通常不是唯一的 —— 关掉它，列照样开着。
       * 桩里若让 close() 顺手收列，就等于把这个 bug 从测试里抹掉了。
       */
      mounted: { getSnapshot: () => ctx.__mountedSessionId },
      tabsIn: (sessionId) => (sessionId === ctx.__mountedSessionId ? ctx.__tabs : []),
      isExpanded: () => ctx.__expanded,
      toggleExpanded: () => {
        ctx.__expanded = !ctx.__expanded;
      },
      close: (tabId) => {
        ctx.__closedTabs.push(tabId);
        ctx.__tabs = ctx.__tabs.filter((tab) => tab.id !== tabId);
        // 故意**不**动 __expanded：这正是内核的行为。
      },
    },
    /** 测试直接摆屏幕上的会话、已开 tab、列是否展开；默认没有会话。 */
    __mountedSessionId: undefined,
    __tabs: [],
    __closedTabs: [],
    __expanded: false,
    get __openedTabs() {
      return (ctx.__openedTabsStore ??= []);
    },
    get __openedResources() {
      return (ctx.__openedResourcesStore ??= []);
    },
    __registrations: registrations,
    __shortcutCommands: shortcutCommands,
    __tabTypes: tabTypes,
    __injections: injections,
    __effects: effects,
    __localeRegistrations: localeRegistrations,
    __settings: null,
  };
  return ctx;
}

/** 装载 bundle，返回它注册进去的 factory 结果。 */
async function loadBundle(react) {
  const code = await readFile(bundlePath, 'utf8');
  const primitives = makePrimitives(react);
  const registered = [];
  const window = {
    __ModuleLoader__: {
      load: ({ id, factory }) => {
        const require = (name) => {
          if (name === 'react' || name === 'react/jsx-runtime') return react;
          // `react-dom` 与 primitives 一样是前端 seed 表里的冻结基座模块
          //（9 个之一），生产里 require 一定成功。这里只需 createPortal。
          if (name === 'react-dom') return { createPortal: (node) => node };
          // primitives 是前端 seed 表里的冻结基座模块，生产里 require 一定成功。
          if (name === '@deepseek-ai/dsh-client-ui-primitives') return primitives;
          throw new Error(`unexpected external: ${name}`);
        };
        registered.push({ id, exports: factory(require) });
      },
    },
  };
  // eslint-disable-next-line no-new-func
  const run = new Function('window', `${code}\n`);
  run(window);
  assert.equal(registered.length, 1, 'bundle 必须恰好注册一个模块');
  assert.equal(registered[0].id, 'dsh-enhanced-prompt-editor');
  return registered[0].exports;
}

/**
 * 把插槽 face 里的 `hooks` 绑成组件 prop —— 等价于内核 renderer 做的事。
 *
 * 插槽渲染器把 `entry.inject()` 的结果按 `(entry, binding)` 缓存进 WeakMap
 * 且永不失效，所以 inject 只能提供**快照源**；渲染器负责把它绑成组件能调用的
 * hook（`useMode(selector)`）。测试必须复制这一步，否则测的是一个不存在的契约。
 *
 * @param face `inject()` 的返回值。
 * @returns 把 `hooks` 换成 `useXxx` props 之后的新 face。
 */
function bindHooks(face) {
  if (face === null || typeof face !== 'object') return face;
  const { hooks, ...rest } = face;
  if (hooks === undefined) return face;
  const bound = { ...rest };
  for (const [name, source] of Object.entries(hooks)) {
    const hookName = `use${name[0].toUpperCase()}${name.slice(1)}`;
    // 内核的 selector Hook：本测试只关心值，直接取快照。
    bound[hookName] = (selector) =>
      typeof selector === 'function' ? selector(source.getSnapshot()) : source.getSnapshot();
  }
  return bound;
}

/** 从一批 createElement 结果里按 className 找节点。 */
function findByClass(created, className) {
  return created.find((node) => typeof node?.props?.className === 'string' && node.props.className.includes(className));
}

/**
 * 按 primitives 名字找节点。
 *
 * 两种形态都要认：
 *  - `type` 是桩函数本身（原语被 `h(Button, …)` 直接引用）；
 *  - `type` 是 `'<Button>'` 字符串（桩被调用后渲染出的节点）。
 */
/**
 * 渲染面板并把内部的 `SymbolBar` 子组件展开。
 *
 * react 桩不递归渲染函数组件，而符号按钮现在都在 `SymbolBar` 里，
 * 所以要显式调用一次才能看到按钮。
 */
function renderSymbolBar(entry, face, react) {
  react.__reset();
  entry.component(face);
  const { inner, innerProps } = takeBarInner(react);
  if (inner === undefined) return { keys: [], nodes: react.__created };
  react.__reset();
  inner(innerProps);
  const keys = react.__created.filter((node) => node?.props?.className === 'dsh-epe-key');
  return { keys, nodes: react.__created };
}

/**
 * 从已渲染的树里取出「真正的符号栏组件」。
 *
 * 模式二的插槽组件是 `FloatingSymbolBar`（负责悬浮定位），它把真正的按钮组件
 * 放在 props.Inner（= ExtendedSymbolBar）里。测试要验的是按钮行为，所以要
 * 穿透这一层；同时兼容没有包装层的形态（直接是 SymbolBar 组件）。
 *
 * @returns `{ inner, innerProps }` —— inner 是要执行的组件函数，已剥掉 Inner 字段。
 */
function takeBarInner(react) {
  const wrapper = react.__created.find((node) => node?.props?.Inner !== undefined);
  if (wrapper !== undefined) {
    const innerProps = { ...wrapper.props };
    delete innerProps.Inner;
    return { inner: wrapper.props.Inner, innerProps };
  }
  const bar = react.__created.find((node) => node?.type?.name === 'SymbolBar');
  if (bar !== undefined) return { inner: bar.type, innerProps: bar.props };
  // 没有包装层也没有 SymbolBar：可能已经是按钮组件本身。
  const direct = react.__created.find((node) => node?.type?.name === 'ExtendedSymbolBar');
  if (direct !== undefined) return { inner: direct.type, innerProps: direct.props };
  return { inner: undefined, innerProps: undefined };
}

function findByPrimitive(created, name) {
  return created.find((node) => node?.type?.primitiveName === name || node?.type === `<${name}>`);
}

test('bundle 注册成功并导出 apply/inject', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  assert.equal(typeof exports.apply, 'function');
  assert.ok(Array.isArray(exports.inject));
  assert.ok(exports.inject.includes('slots'));
  assert.ok(exports.inject.includes('locale'));
});

test('apply 注册三个表面：工具行按钮、tab 类型、插件卡片', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  exports.apply(ctx);

  const byName = (name) => ctx.__registrations.filter((entry) => entry.options.name === name);

  const trigger = byName('conversation.input.left');
  assert.equal(trigger.length, 1, '工具行按钮注册一次');
  assert.equal(trigger[0].options.id, 'dsh-enhanced-prompt-editor-trigger');
  assert.equal(trigger[0].options.order, 20);

  const body = byName('sidebar.right.pane.tab');
  assert.equal(body.length, 1, '面板正文注册一次');
  assert.equal(body[0].options.key, 'dsh-enhanced-prompt-editor');

  const title = byName('sidebar.right.pane.tab.title');
  assert.equal(title.length, 1, '面板标题注册一次');

  // ⚠️ 设置注册在 `plugins.bundle.config`（**插件详情页**的配置区），
  // **不是** `settings.section`，也**不是** `plugins.item`。
  //
  // 2026-10-16 读内核源码（`dsh-client-ui-plugin-manager/lib/client.js`）核实：
  //   `const mine = listed.filter((pkg) => !pkg.official);`        ← 第三方包
  //   `renderGroup("bundles", t("bundlesTitle"), mine.map(packageCard));`
  //   `renderGroup("basic",   t("basicTitle"),   basicCards);`     ← 官方包
  // 第三方包走 PackageCard → PackageDetail → `plugins.bundle.config`（key = 包名）；
  // `plugins.item` 属于「内置插件配置」那一组，是给官方包用的。
  const card = byName('plugins.bundle.config');
  assert.equal(card.length, 1, '插件配置卡片注册一次');
  // keyed 槽的身份在 `key` 上，必须等于包名 —— 内核用
  // `ledger.bundles.has(pkg.name)` 判断该包有没有配置页，对不上会**静默不渲染**。
  assert.equal(card[0].options.key, 'dsh-enhanced-prompt-editor');
  assert.equal(byName('settings.section').length, 0, '不得注册到 settings.section');
  assert.equal(byName('plugins.item').length, 0, '第三方包不得注册到 plugins.item（那是官方插件的分组）');

  assert.equal(ctx.__tabTypes.length, 1, 'tab 类型注册一次');
  assert.equal(ctx.__tabTypes[0].kind, 'enhanced-prompt-editor');
  assert.notEqual(ctx.__tabTypes[0].multiple, true, '面板每会话一个，不设 multiple');
});

test('工具行按钮：渲染 T 与模式角标，点击循环模式', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  exports.apply(ctx);

  const entry = ctx.__registrations.find((item) => item.options.name === 'conversation.input.left');
  const t = ctx.locale.bind('dsh-enhanced-prompt-editor');
  react.__reset();

  // 走**真实**的 inject() + renderer 那一步 hook 绑定，而不是自己造一份 face：
  // 自己造的话，测的是测试自己写的形状，接错线也发现不了。
  const face = () => bindHooks(entry.options.inject());

  // ── 编辑器模式：角标是面板图标，且**没有** title 悬浮提示框 ──────────
  const calls = [];
  const realCycle = face().cycle;
  const editorFace = face();
  editorFace.cycle = () => {
    calls.push('cycle');
    return realCycle();
  };
  // 先切到编辑器模式，好让渲染出来的角标是「面板」那个。
  realCycle();
  let tree = entry.component({ ...editorFace });
  const button = tree.props.children.find((node) => node?.props?.className === 'dsh-epe-trigger');
  assert.ok(button !== undefined, '渲染出 T 按钮节点');
  assert.equal(button.type.primitiveName, 'Button', '按钮来自 primitives，不是自写 button');
  assert.equal(button.props['data-mode'], 'editor');
  // 用户 2026-10-16：悬浮不得再弹显示插件中文名的提示框。
  assert.equal(button.props.title, undefined, '不得设置 title（那正是要删掉的悬浮窗口）');
  assert.ok(typeof button.props['aria-label'] === 'string', '改用 aria-label 保留可达性');
  // 主体字形是大写 T。
  const glyph = findByClass(react.__created, 'dsh-epe-trigger-glyph');
  assert.ok(glyph !== undefined, '存在字形节点');
  assert.equal(glyph.props.children, 'T');
  // 角标：本模块内的子组件，type 是函数，调用它验证渲染结果。
  const badgeNode = react.__created.find((node) => typeof node?.type === 'function' && node.type.name === 'ModeBadge');
  assert.ok(badgeNode !== undefined, '按钮里包含模式角标子组件');
  const badgeTree = badgeNode.type(badgeNode.props);
  assert.ok(
    typeof badgeTree?.props?.className === 'string' && badgeTree.props.className.includes('dsh-epe-trigger-badge'),
    '角标节点带 dsh-epe-trigger-badge 类名',
  );
  assert.equal(badgeTree.props.children.type.primitiveName, 'IconPanelLeftOutlineRegular', '编辑器模式角标用面板图标');

  // 点击 → 调 cycle（不再直接开面板；开面板是切到扩展模式那一步的副作用）。
  // 注意这次点击**真的**把模式从 editor 推进到了 extended。
  button.props.onClick({ preventDefault: () => undefined, stopPropagation: () => undefined });
  assert.deepEqual(calls, ['cycle'], '点击调用 cycle');

  // ── 扩展输入框模式：角标换成向上箭头（上一步点击已经切到这里）──────
  react.__reset();
  tree = entry.component(face());
  const extendedButton = tree.props.children.find((node) => node?.props?.className === 'dsh-epe-trigger');
  assert.equal(extendedButton.props['data-mode'], 'extended');
  const badge2 = react.__created.find((node) => typeof node?.type === 'function' && node.type.name === 'ModeBadge');
  const badge2Tree = badge2.type(badge2.props);
  assert.equal(badge2Tree.props.children.type.primitiveName, 'IconChevronUpOutlineRegular', '扩展输入框模式角标用向上箭头');

  // ── 原生模式：没有角标 ────────────────────────────────────────────
  realCycle(); // extended → native
  react.__reset();
  tree = entry.component(face());
  const nativeButton = tree.props.children.find((node) => node?.props?.className === 'dsh-epe-trigger');
  assert.equal(nativeButton.props['data-mode'], 'native');
  const badge3 = react.__created.find((node) => typeof node?.type === 'function' && node.type.name === 'ModeBadge');
  assert.equal(badge3.type(badge3.props), null, '原生模式没有角标');
});

test('T 角标跟随模式变化（inject 缓存不得把它冻住）', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  const store = memoryStorage();

  withStorage('localStorage', store, () => {
    withStorage('sessionStorage', undefined, () => {
      exports.apply(ctx);
    });
  });

  const entry = ctx.__registrations.find((item) => item.options.name === 'conversation.input.left');
  // ⚠️ 这一步是重点：**只取一次 face**，之后模拟 renderer 的 WeakMap 缓存
  // （inject 的返回值永不重算）。若模式被当成普通值塞进 face，下面第二次渲染
  // 就会读到旧值 —— 那正是用户会看到的「点了 T 角标不动」。
  const frozenFace = bindHooks(entry.options.inject());
  const readMode = () => {
    react.__reset();
    const tree = entry.component(frozenFace);
    return tree.props.children.find((node) => node?.props?.className === 'dsh-epe-trigger').props['data-mode'];
  };

  assert.equal(readMode(), 'native', '初始为原生');
  frozenFace.cycle();
  assert.equal(readMode(), 'editor', '切到编辑器后角标必须跟着变（不能被缓存冻住）');
  frozenFace.cycle();
  assert.equal(readMode(), 'extended', '切到扩展输入框后角标继续跟着变');
  frozenFace.cycle();
  assert.equal(readMode(), 'native', '回到原生');
});

test('T 按钮：两个增强都关掉时禁用，并说明原因', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  ctx.__configForms = {
    whileServed: (_ns, register) => register(),
    get: () => ({
      getSnapshot: () => ({
        status: 'ready',
        writable: true,
        value: { modeEditor: false, modeExtended: false },
        base: {},
        user: {},
        revision: 1,
      }),
      subscribe: () => () => undefined,
      mutate: async () => true,
    }),
  };
  const store = memoryStorage();

  withStorage('localStorage', store, () => {
    withStorage('sessionStorage', undefined, () => {
      exports.apply(ctx);
    });
  });

  const entry = ctx.__registrations.find((item) => item.options.name === 'conversation.input.left');
  const t = ctx.locale.bind('dsh-enhanced-prompt-editor');
  react.__reset();
  const tree = entry.component(bindHooks(entry.options.inject()));
  const offButton = tree.props.children.find((node) => node?.props?.className === 'dsh-epe-trigger');
  assert.equal(offButton.props.disabled, true, '没有可切换目标时按钮禁用');
  assert.match(offButton.props['aria-label'], /关闭/, '禁用时给出原因');
});

test('面板：回车按设置换行/发送，发送真的调用 setDraft + submit', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  exports.apply(ctx);

  const entry = ctx.__registrations.find((item) => item.options.name === 'sidebar.right.pane.tab');
  const t = ctx.locale.bind('dsh-enhanced-prompt-editor');

  // 造一份「设置全是默认值」的设置面，避免依赖真实 configForms。
  const stubSettings = {
    get: () => ({
      storage: 'none',
      dir: '.dsh/prompts',
      enterMode: 'newline',
      panelHeight: 420,
      browseWithReader: true,
      dictate: true,
    }),
    subscribe: () => () => undefined,
    writable: () => false,
    set: async () => false,
  };
  const sent = [];
  const inputActions = {
    setDraft: (text) => sent.push(text),
    submit: () => sent.push('__submit__'),
  };
  const store = {
    snapshot: { getSnapshot: () => ({ revision: 0 }), subscribe: () => () => undefined },
    of: () => ({ text: 'hello', name: null, path: null, status: 'idle', error: null, drafts: [], height: null }),
    patch: () => undefined,
    setText: () => undefined,
    dispose: () => undefined,
    notifySettings: () => undefined,
  };
  const io = {
    cwd: () => undefined,
    begin: () => ({ signal: undefined, release: () => undefined }),
    readLocal: () => '',
    writeLocal: () => true,
    list: async () => [],
    load: async () => '',
    save: async () => ({ path: '', rel: '' }),
    openInReader: () => undefined,
    send: async (actions, text) => {
      const body = String(text ?? '').trim();
      if (body === '') return { ok: false, reason: 'empty' };
      actions.setDraft(body);
      actions.submit();
      return { ok: true };
    },
    dispose: () => undefined,
    titleOf: () => 'x',
  };

  react.__reset();
  const tree = entry.component({
    t,
    sessionId: 's1',
    store,
    settings: stubSettings,
    io,
    inputActions,
    speech: undefined,
    useSessions: undefined,
  });

  // 找到编辑区与发送按钮。
  const textarea = findByClass(react.__created, 'dsh-epe-editor');
  assert.ok(textarea !== undefined, '存在编辑区');
  assert.equal(textarea.props.value, 'hello');

  const sendBtn = react.__created.find(
    (node) => node?.props?.className === 'dsh-epe-btn' && node.props['data-primary'] === true,
  );
  assert.ok(sendBtn !== undefined, '存在主发送按钮');

  // 默认 newline 模式：裸回车 → 换行（不发送）。
  let prevented = 0;
  textarea.props.onKeyDown({
    key: 'Enter',
    code: 'Enter',
    isComposing: false,
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    preventDefault: () => {
      prevented += 1;
    },
    currentTarget: { value: 'hello', selectionStart: 5, selectionEnd: 5 },
  });
  assert.equal(prevented, 1, '回车被接管');
  assert.equal(sent.length, 0, '裸回车不发送');

  // Cmd/Ctrl+Enter → 发送。
  textarea.props.onKeyDown({
    key: 'Enter',
    code: 'Enter',
    isComposing: false,
    shiftKey: false,
    metaKey: true,
    ctrlKey: false,
    preventDefault: () => undefined,
    currentTarget: { value: 'hello', selectionStart: 5, selectionEnd: 5 },
  });
  // send 是 async，让微任务跑完。
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(sent, ['hello', '__submit__'], '先 setDraft 再 submit');

  // 点发送按钮同样走这条路。
  sent.length = 0;
  sendBtn.props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(sent, ['hello', '__submit__']);
});

test('面板：编辑区必须真的带上「按逻辑行分段」的 inline 背景', async () => {
  // ⚠️ 这条是**运行时**断言，用来补 `test/logical-lines.test.mjs` 的缺口。
  // 那边的接线测试只查源码文本里有没有 `backgroundImage: stripeBackground`，
  // 而把**赋值**改成 `const stripeBackground = null` 时正则照样匹配 →
  // 组件就不再写 inline 背景、回落到 CSS 里那条「按物理行交替」的降级渐变，
  // 于是软换行时同一个逻辑行又被切成两种底色（用户报的 bug 复活），测试却全绿。
  // 这里真的渲染组件，断言传进 textarea 的值是有效字符串。
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  exports.apply(ctx);

  const entry = ctx.__registrations.find((item) => item.options.name === 'sidebar.right.pane.tab');
  const t = ctx.locale.bind('dsh-enhanced-prompt-editor');
  const { store } = panelFace(() => '一\n二\n三');
  const stubSettings = {
    get: () => ({
      storage: 'none', dir: '.dsh/prompts', enterMode: 'newline', panelHeight: 420,
      browseWithReader: true, dictate: true, editorFontSize: 16, keySize: 100,
    }),
    subscribe: () => () => undefined,
  };
  const io = { cwd: () => undefined, begin: () => ({ signal: undefined, release: () => undefined }), dispose: () => undefined, titleOf: () => 'x' };

  react.__reset();
  entry.component({ t, sessionId: 's1', store, settings: stubSettings, io, inputActions: {}, speech: undefined, useSessions: undefined });

  const editor = findByClass(react.__created, 'dsh-epe-editor');
  assert.ok(editor !== undefined, '存在编辑区');

  const bg = editor.props.style?.backgroundImage;
  assert.equal(
    typeof bg, 'string',
    `编辑区的 inline backgroundImage 必须是字符串（实际 ${typeof bg}：${String(bg)}）。`
    + '为 null/undefined 时 React 会跳过该样式，编辑区回落到 CSS 里按**物理行**交替的'
    + '降级渐变 —— 软换行时同一逻辑行会被切成两种底色，正是用户报的问题。',
  );
  assert.ok(bg.length > 0, 'inline 背景不得是空字符串');
  assert.match(
    bg, /linear-gradient/,
    '按逻辑行分段的背景必须由 linear-gradient 生成（段边界按累积物理行数算）',
  );
  // 分段渐变必须有**多个色标**：只有一个色标说明退回成整片单色/单一周期了。
  const stops = (bg.match(/,/g) ?? []).length;
  assert.ok(stops >= 4, `分段渐变应有多个色标（实测逗号 ${stops} 个）：${bg.slice(0, 120)}`);

  // 行号 span 的高度也必须来自物理行数测量（而不是 CSS 里的固定一行高）。
  // 生产写法：h('span', { style: { height: gutterHeights?.[index] } }, String(index + 1))
  const spans = react.__created.filter((node) => {
    if (node?.type !== 'span') return false;
    const h = node.props?.style?.height;
    return typeof h === 'string' || typeof h === 'number';
  });
  assert.ok(spans.length >= 3, `每个行号 span 都应带 height（实测 ${spans.length} 个）`);
  // 三个逻辑行各占 1 个物理行 → 每个 span 高度应等于行高（16px 字号 → 27px 整数）。
  // 高度来自 `gutterHeightsOf(rowCounts, lineHeightPx)`（数值乘法），所以是数字。
  for (const span of spans) {
    const h = Number(span.props.style.height);
    assert.ok(
      Number.isFinite(h) && h > 0,
      `行号 span 高度应是正数（实测 ${span.props.style.height}）`,
    );
    assert.equal(
      h, Math.round(h),
      `行号 span 高度必须是整数像素（实测 ${span.props.style.height}）`
      + ' —— 小数行高会让条纹带宽在相邻整数间跳变',
    );
  }
});

test('面板：storage=none 时不显示保存按钮与草稿列表', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  exports.apply(ctx);
  const entry = ctx.__registrations.find((item) => item.options.name === 'sidebar.right.pane.tab');
  const t = ctx.locale.bind('dsh-enhanced-prompt-editor');

  const mkProps = (storage) => ({
    t,
    sessionId: 's1',
    store: {
      snapshot: { getSnapshot: () => ({ revision: 0 }), subscribe: () => () => undefined },
      of: () => ({ text: '', name: null, path: null, status: 'idle', error: null, drafts: [], height: null }),
      patch: () => undefined,
      setText: () => undefined,
      dispose: () => undefined,
      notifySettings: () => undefined,
    },
    settings: {
      get: () => ({ storage, dir: '.dsh/prompts', enterMode: 'newline', panelHeight: 420, browseWithReader: true, dictate: true }),
      subscribe: () => () => undefined,
      writable: () => true,
      set: async () => true,
    },
    io: { cwd: () => undefined, begin: () => ({ release: () => undefined }), send: async () => ({ ok: false, reason: 'empty' }), titleOf: () => 'x' },
    inputActions: undefined,
    speech: undefined,
    useSessions: undefined,
  });

  react.__reset();
  entry.component(mkProps('none'));
  const labels = react.__created
    .filter((node) => node.type === 'button' && node.props?.className === 'dsh-epe-btn')
    .map((node) => JSON.stringify(node.props.children));
  assert.ok(!labels.some((label) => label.includes('保存')), 'none 模式没有保存按钮');

  react.__reset();
  entry.component(mkProps('workspace'));
  const labelsWs = react.__created
    .filter((node) => node.type === 'button' && node.props?.className === 'dsh-epe-btn')
    .map((node) => JSON.stringify(node.props.children));
  assert.ok(labelsWs.some((label) => label.includes('保存')), 'workspace 模式有保存按钮');
});

test('插件卡片：渲染模式开关与各模式字段，缺设置服务时显示不可用', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  exports.apply(ctx);
  const entry = ctx.__registrations.find((item) => item.options.name === 'plugins.bundle.config');
  const t = ctx.locale.bind('dsh-enhanced-prompt-editor');

  /** 造一个 scope 桩：`getSnapshot()` 返回 Host 形状的快照。 */
  const mkScope = (value, writable = true) => ({
    getSnapshot: () => ({ status: 'ready', writable, value, base: {}, user: {}, revision: 1 }),
    subscribe: () => () => undefined,
    mutate: async () => true,
  });

  const full = {
    storage: 'workspace',
    dir: '.dsh/prompts',
    enterMode: 'newline',
    panelHeight: 420,
    browseWithReader: true,
    dictate: true,
    modeEditor: true,
    modeExtended: true,
    editorFirst: true,
    extendedEnter: 'inherit',
    extendedHeight: 640,
  };

  // ── summary 视图：只有一行描述，不渲染表单 ──────────────────────────
  react.__reset();
  const summary = entry.component({ t, view: 'summary', scope: mkScope(full) });
  assert.equal(typeof summary, 'string', 'summary 视图是一行文字');
  assert.ok(summary.length > 0, 'summary 非空（否则插件列表卡片标题下是空的）');

  // ── page 视图：两个模式开关 + 扩展输入框 + 编辑器模式字段 ────────────
  react.__reset();
  entry.component({ t, view: 'page', scope: mkScope(full) });
  const nodes = react.__created;
  assert.ok(findByPrimitive(nodes, 'SettingsForm') !== undefined, '用 primitives 的 SettingsForm');
  // 两个模式开关（Switch），且引用了正确的文案 key。
  const switches = nodes.filter((node) => node.type.primitiveName === 'Switch');
  assert.ok(switches.length >= 2, `渲染出模式开关，实际 ${switches.length} 个`);
  const switchLabels = switches.map((node) => node.props.label);
  assert.ok(switchLabels.includes(t('settings.mode.editor')), '有编辑器模式开关');
  assert.ok(switchLabels.includes(t('settings.mode.extended')), '有扩展输入框模式开关');
  // 枚举控件走 Menu（primitives 里没有 Select）。Menu 在本地 `Chooser` 组件里，
  // 而 react 桩不递归渲染函数组件，所以要把 Chooser 手动渲染出来再断言 ——
  // 只检查「本次新增」的节点切片，不重置整个记录数组（那会一并清空 `nodes`）。
  const chooserNode = nodes.find((node) => node?.type?.name === 'Chooser');
  assert.ok(chooserNode !== undefined, '渲染出枚举选择器');
  const before = react.__created.length;
  chooserNode.type(chooserNode.props);
  const chooserNodes = react.__created.slice(before);
  assert.ok(
    findByPrimitive(chooserNodes, 'Menu') !== undefined,
    '枚举用 primitives 的 Menu',
  );
  // 高度用 SettingsValueField（官方限制页同款）。
  assert.ok(findByPrimitive(nodes, 'SettingsValueField') !== undefined, '数字字段用 SettingsValueField');
  // 不得再出现自写下拉/滑块。
  assert.equal(findByClass(nodes, 'dsh-epe-select'), undefined, '不得自写 select');
  assert.equal(findByClass(nodes, 'dsh-epe-range'), undefined, '不得自写 range');

  // ── 关掉扩展输入框：它的字段整段消失 ────────────────────────────────
  react.__reset();
  react.__resetRefs();
  entry.component({ t, view: 'page', scope: mkScope({ ...full, modeExtended: false }) });
  const withoutExtended = react.__created;
  const extendedTitle = t('settings.mode.extended');
  const sectionHeadings = withoutExtended
    .filter((node) => node.type === 'h3')
    .map((node) => node.props.children);
  assert.ok(!sectionHeadings.includes(extendedTitle), '关闭后不显示扩展输入框分区');

  // ── 两个都关掉：给出"至少启用一个"的说明 ────────────────────────────
  react.__reset();
  react.__resetRefs();
  entry.component({ t, view: 'page', scope: mkScope({ ...full, modeEditor: false, modeExtended: false }) });
  assert.ok(
    react.__created.some((node) => node.props?.className === 'dsh-epe-card-note'),
    '两个都关掉时给出说明',
  );

  // ── scope 拿不到（设置服务缺失）：渲染不可用提示，不抛错 ─────────────
  react.__reset();
  react.__resetRefs();
  const unavailable = entry.component({ t, view: 'page', scope: undefined });
  // 仍走 SettingsForm（它自己会渲染 labels.unavailable 那一段），而不是崩掉
  // 或渲染空白。
  assert.equal(unavailable.type?.primitiveName, 'SettingsForm', 'scope 缺失时仍渲染 SettingsForm');
  assert.equal(findByClass(react.__created, 'dsh-epe-card-warn'), undefined, '不把"缺服务"当成启动失败');
});

test('插件卡片：两个原生开关走客户端存储（切换即生效），回车策略必须选得到', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  const store = memoryStorage();
  // ⚠️ 必须在 localStorage 桩**之内** apply：开关控制器在 apply 时取存储，
  // 拿不到就退化成「只存内存」，切换后读不到、重启即丢。
  withStorage('localStorage', store, () => {
    withStorage('sessionStorage', undefined, () => {
      exports.apply(ctx);
    });
  });
  const entry = ctx.__registrations.find((item) => item.options.name === 'plugins.bundle.config');
  const t = ctx.locale.bind('dsh-enhanced-prompt-editor');

  const mkScope = (value) => ({
    getSnapshot: () => ({ status: 'ready', writable: true, value, base: {}, user: {}, revision: 1 }),
    subscribe: () => () => undefined,
    mutate: async () => true,
  });
  const base = {
    storage: 'workspace', dir: '.dsh/prompts', enterMode: 'newline', panelHeight: 420,
    modeEditor: true, modeExtended: true, editorFirst: true,
    extendedEnter: 'inherit', extendedHeight: 640,
  };
  const render = async (patch) => {
    react.__reset();
    entry.component({ t, view: 'page', scope: mkScope({ ...base, ...patch }) });
    return react.__created;
  };
  const switchesIn = (nodes) => nodes.filter((node) => node.type.primitiveName === 'Switch');
  const enterChoosersIn = (nodes) =>
    nodes.filter((node) => node?.type?.name === 'Chooser' && node.props.label === t('settings.extendedEnter'));

  // ① 两个开关必须出现在设置卡片里（用户要求的「加一项勾选」）。
  const nodes = await render({});
  const labels = switchesIn(nodes).map((node) => node.props.label);
  assert.ok(labels.includes(t('settings.nativeDeck')), '有「原生应用悬浮 deck」开关');
  assert.ok(labels.includes(t('settings.nativeEnter')), '有「原生启用高级回车」开关');

  // ② 切换**立即写入 localStorage**（不走宿主设置：那条通道在本机被整体系拒绝）。
  const deckSwitch = switchesIn(nodes).find((node) => node.props.label === t('settings.nativeDeck'));
  deckSwitch.props.onChange(true);
  const stored = JSON.parse(store.getItem('dsh-enhanced-prompt-editor:native-switches') ?? '{}');
  assert.equal(stored.nativeDeck, true, '⚠️ 切开关必须立刻持久化到客户端存储（否则重启就丢）');

  // ③ ⚠️ 扩展开着时，回车策略在扩展那节出现。
  assert.equal(enterChoosersIn(await render({ modeExtended: true })).length, 1, '扩展模式下有且仅有一个回车选择器');

  // ④ ⚠️ 关掉扩展模式、只勾「原生高级回车」时，回车策略**必须**仍然出现：
  //    否则用户开了开关却选不到策略，而默认的 inherit 等于什么都不做 —— 哑开关。
  assert.equal(
    enterChoosersIn(await render({ modeExtended: false })).length,
    1,
    '关掉扩展模式、只勾原生高级回车时，回车策略仍必须能被选到',
  );
});

test('插件卡片：revision 冲突时自动重试一次（丢掉旧 revision），保存仍然成功', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  exports.apply(ctx);
  const entry = ctx.__registrations.find((item) => item.options.name === 'plugins.bundle.config');
  const t = ctx.locale.bind('dsh-enhanced-prompt-editor');

  // 模拟宿主的真实行为：带了 revision 就判冲突（说明客户端抓到的是旧 revision），
  // 不带 revision（undefined）则接受。
  const attempts = [];
  let revision = 9;
  const scope = {
    getSnapshot: () => ({
      status: 'ready', writable: true, revision, base: {}, user: {},
      value: { modeEditor: true, modeExtended: true, nativeDeck: false, nativeEnter: false },
    }),
    subscribe: () => () => undefined,
    mutate: async (ops, expected) => {
      attempts.push({ ops, expected });
      if (expected !== undefined) {
        revision += 1; // 宿主状态变了 → 客户端手里的 revision 过期
        return false;
      }
      return true;
    },
  };

  react.__reset();
  entry.component({ t, view: 'page', scope });
  const form = findByPrimitive(react.__created, 'SettingsForm');
  // 用老字段（扩展模式开关）驱动保存：`nativeDeck` 已经改成客户端存储，
  // 不再进设置表单，这里要测的是宿主写入路径的 revision 自愈。
  const extendedSwitch = react.__created
    .filter((node) => node.type.primitiveName === 'Switch')
    .find((node) => node.props.label === t('settings.mode.extended'));
  extendedSwitch.props.onChange(false);
  await form.props.onSave();

  assert.equal(attempts.length, 2, '第一次被拒后必须自动重试一次（否则用户只能眼睁睁看着"宿主拒绝"）');
  assert.equal(attempts[0].expected, 9, '第一次带的是编辑时抓到的 revision');
  assert.equal(attempts[1].expected, undefined, '重试必须丢掉旧 revision，退化成 ConfigForm.set 的语义');
  assert.deepEqual(
    attempts[1].ops,
    [{ op: 'set', path: ['modeExtended'], value: false }],
    '重试写入的内容必须与草稿一致',
  );
});

test('插件卡片：只有保存才写入，且非法草稿阻止保存', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  exports.apply(ctx);
  const entry = ctx.__registrations.find((item) => item.options.name === 'plugins.bundle.config');
  const t = ctx.locale.bind('dsh-enhanced-prompt-editor');

  const mutations = [];
  const scope = {
    getSnapshot: () => ({
      status: 'ready',
      writable: true,
      value: { modeEditor: true, modeExtended: true, editorFirst: true, extendedHeight: 640, extendedEnter: 'inherit' },
      base: {},
      user: {},
      revision: 1,
    }),
    subscribe: () => () => undefined,
    mutate: async (ops) => {
      mutations.push(ops);
      return true;
    },
  };

  react.__reset();
  entry.component({ t, view: 'page', scope });
  const form = findByPrimitive(react.__created, 'SettingsForm');
  const switches = react.__created.filter((node) => node.type.primitiveName === 'Switch');
  const extendedSwitch = switches.find((node) => node.props.label === t('settings.mode.extended'));

  // 点开关 → 只暂存，**不写**。
  extendedSwitch.props.onChange(false);
  assert.equal(mutations.length, 0, '改控件不产生写入（只有保存才写）');

  // 保存 → 才写，且写入的是刚才那一次改动。
  await form.props.onSave();
  assert.equal(mutations.length, 1, '保存时写入一次');
  assert.deepEqual(mutations[0], [{ op: 'set', path: ['modeExtended'], value: false }]);
});

test('插件卡片：非法数字草稿阻止保存', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  exports.apply(ctx);
  const entry = ctx.__registrations.find((item) => item.options.name === 'plugins.bundle.config');
  const t = ctx.locale.bind('dsh-enhanced-prompt-editor');

  const mutations = [];
  const scope = {
    getSnapshot: () => ({
      status: 'ready',
      writable: true,
      value: { modeEditor: true, modeExtended: true, extendedHeight: 640 },
      base: {},
      user: {},
      revision: 1,
    }),
    subscribe: () => () => undefined,
    mutate: async (ops) => {
      mutations.push(ops);
      return true;
    },
  };

  react.__reset();
  entry.component({ t, view: 'page', scope });
  const field = react.__created.find(
    (node) =>
      node.type?.primitiveName === 'SettingsValueField' &&
      node.props.id === 'dsh-enhanced-prompt-editor-extendedHeight',
  );
  assert.ok(field !== undefined, '找到扩展输入框高度字段');

  // 超出区间的草稿：标记非法，且保存被阻止。
  // ⚠️ 这里**不能**清 refs：暂存草稿正是要保留的东西（同一卡片重渲染）。
  field.props.onEdit('99999');
  react.__reset();
  entry.component({ t, view: 'page', scope });
  const form = findByPrimitive(react.__created, 'SettingsForm');
  assert.equal(form.props.state.invalid, true, '非法草稿标记为 invalid');
  await form.props.onSave();
  assert.equal(mutations.length, 0, '非法草稿不得产生写入');
});

/* ── 静态守卫：Rules of Hooks 与外部依赖 ─────────────────────────────
 * 这类缺陷在无渲染器的测试环境里跑不出来，但会在真实浏览器里直接抛错，
 * 所以用静态检查钉住。
 */

test('useSessions 钩子只在渲染期的顶层调用一次', async () => {
  const { readFile: rf } = await import('node:fs/promises');
  const source = await rf(join(here, '..', 'src', 'panel.js'), 'utf8');
  const calls = [...source.matchAll(/io\.cwd\(/g)];
  assert.equal(calls.length, 1, `io.cwd 只能调用一次，实际 ${calls.length} 次`);

  // 那次调用必须缩进为组件体的顶层（两空格），且不在任何回调里。
  const line = source.slice(0, calls[0].index).split('\n').length;
  const text = source.split('\n')[line - 1];
  assert.match(text, /^ {2}const cwd = io\.cwd\(useSessions, sessionId\);/, `调用形状不对：${text}`);

  // 组件内不得出现其它 useSessions 选择器调用。
  const selectorCalls = [...source.matchAll(/useSessions\(/g)].length;
  assert.equal(selectorCalls, 0, 'useSessions 只作为参数传递，不应在组件内直接调用');
});

/* ── 渲染期绝不抛：插槽条目会因异常被永久撤销 ─────────────────────────
 * DSH 的 ui-renderer 给每个插槽条目套了 SlotErrorBoundary；一旦渲染期
 * 抛错就调 reportEntryError(..., { abdicate: kind !== 'chain' })，条目进
 * `abdicated` 集，entriesOfSlot 从此跳过它 —— 症状正是「装了别的插件之后
 * 本插件的控件不见了」。这类缺陷不会被普通测试发现，因为它要求一个
 * **会抛错的 document**。
 */

test('文档对象彻底坏掉时，工具行按钮仍然渲染（不被撤销）', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  exports.apply(ctx);

  const entry = ctx.__registrations.find((item) => item.options.name === 'conversation.input.left');
  const t = ctx.locale.bind('dsh-enhanced-prompt-editor');

  // 一个处处抛错的 document：模拟扩展、CSP、被冻结的 head 等各种现实。
  const hostile = () => {
    throw new Error('hostile document');
  };
  const badDocument = {
    get head() {
      throw new Error('head unavailable');
    },
    querySelector: hostile,
    createElement: hostile,
  };
  const realDocument = globalThis.document;
  globalThis.document = badDocument;
  try {
    react.__reset();
    const tree = entry.component(bindHooks(entry.options.inject()));
    // 按钮现在是 primitives 的 Button，节点 type 是桩标记而不是 'button'。
    const button = tree.props.children.find((node) => node?.props?.className === 'dsh-epe-trigger');
    assert.ok(button !== undefined, '样式注入失败不得影响按钮渲染');
    const glyph = findByClass(react.__created, 'dsh-epe-trigger-glyph');
    assert.equal(glyph?.props?.children, 'T');
  } finally {
    if (realDocument === undefined) delete globalThis.document;
    else globalThis.document = realDocument;
  }
});

test('三个表面在 document 坏掉时都不抛错', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  exports.apply(ctx);
  const t = ctx.locale.bind('dsh-enhanced-prompt-editor');

  const hostile = () => {
    throw new Error('hostile document');
  };
  const realDocument = globalThis.document;
  globalThis.document = { querySelector: hostile, createElement: hostile, head: null };
  try {
    const trigger = ctx.__registrations.find((item) => item.options.name === 'conversation.input.left');
    react.__reset();
    assert.ok(trigger.component(bindHooks(trigger.options.inject())) !== undefined);

    // 插件卡片：scope 也坏掉（方法全抛），渲染仍不得抛错。
    const hostileScope = {
      getSnapshot: hostile,
      subscribe: hostile,
      mutate: hostile,
    };
    const card = ctx.__registrations.find((item) => item.options.name === 'plugins.bundle.config');
    react.__reset();
    assert.ok(card.component({ t, view: 'page', scope: hostileScope }) !== undefined);
  } finally {
    if (realDocument === undefined) delete globalThis.document;
    else globalThis.document = realDocument;
  }
});

test('样式注入集中在容错层，渲染组件里不直接碰 document.head', async () => {
  const { readFile: rf, readdir } = await import('node:fs/promises');
  const srcDir = join(here, '..', 'src');
  // 扫全部客户端源文件，而不是写死三个名字——新增组件自动被覆盖。
  const files = (await readdir(srcDir)).filter((name) => name.endsWith('.js') && name !== 'index.js' && name !== 'css.js');
  assert.ok(files.length > 0, '至少要有客户端侧源文件');
  for (const file of files) {
    const source = await rf(join(srcDir, file), 'utf8');
    assert.ok(
      !/document\.head/.test(source),
      `${file} 不应直接操作 document.head，必须走 css.js 的容错注入`,
    );
  }
});

test('工具行按钮的插槽 id 是自有 id（复用内核 id 会顶掉别人的格子）', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  exports.apply(ctx);
  const entry = ctx.__registrations.find((item) => item.options.name === 'conversation.input.left');
  // 上游契约：list 槽的 id 是「你的格子的键」，自有 id 会并排新增，
  // 复用别人的 id 则进入对方的格子并**替换**它。
  assert.equal(entry.options.id, 'dsh-enhanced-prompt-editor-trigger');
  assert.ok(entry.options.id.startsWith('dsh-enhanced-prompt-editor'), 'id 必须带本插件前缀');
  // 内核与已装插件都在用这些 id，绝不能撞。
  const taken = new Set([
    'activity',
    'usage',
    'dsh-connect-workbuddy-composer-credits',
    'dsh-opendesign-usage',
  ]);
  assert.ok(!taken.has(entry.options.id), '不得复用内核或其它插件的插槽 id');
});

test('bundle 只依赖前端 seed 表里的 9 个冻结基座模块', async () => {
  const { readFile: rf } = await import('node:fs/promises');
  const code = await rf(bundlePath, 'utf8');
  const externals = [...new Set([...code.matchAll(/__dshExternal\("([^"]+)"\)/g)].map((m) => m[1]))];
  // 逐字来自内核 `dsh-web-frontend` 的 `function gM()`（staticModules）。
  const allowed = new Set([
    'react',
    'react/jsx-runtime',
    'react-dom',
    'react-dom/client',
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-client-store',
    '@deepseek-ai/dsh-client-ui-slots',
    '@deepseek-ai/dsh-client-ui-primitives',
    '@deepseek-ai/dsh-client-ui-dockkit',
  ]);
  assert.ok(externals.length > 0, '必须至少请求一个外部模块（否则这条守卫是空转）');
  for (const name of externals) {
    assert.ok(allowed.has(name), `bundle 请求了 seed 表之外的模块：${name}`);
  }
  // UI 组件必须走 primitives（用户 2026-10-15 硬规则）。
  assert.ok(externals.includes('@deepseek-ai/dsh-client-ui-primitives'), 'UI 必须用 primitives');
});

test('构建期产物守卫真的会拦下坏产物（不是空转）', async () => {
  const { assertBundleShape } = await import('../src/build-client.mjs');
  // ① 合法产物通过。
  assert.doesNotThrow(() => assertBundleShape('__dshExternal("react");'));
  // ② seed 表外的模块必须变红。
  assert.throws(
    () => assertBundleShape('__dshExternal("@deepseek-ai/dsh-client-ui-sidebar-right");'),
    /seed 表之外/,
    '表外 require 必须被拦下',
  );
  // ③ 语法坏掉必须变红。
  assert.throws(() => assertBundleShape('function ( {'), /语法坏掉/);
  // ④ 反引号提前闭合模板字符串（真机表现是白屏 + import failed，无堆栈）。
  assert.throws(() => assertBundleShape('const s = `a ` b`;'), /语法坏掉/);
});

test('客户端清单声明的 inject 都是真实的 DSH 客户端包名', async () => {
  const { readFile: rf } = await import('node:fs/promises');
  const pkg = JSON.parse(await rf(join(here, '..', 'package.json'), 'utf8'));
  const inject = pkg.dsh?.client?.inject ?? [];
  assert.ok(inject.length > 0, '至少声明一个必需客户端插件');
  for (const name of inject) {
    assert.match(name, /^@deepseek-ai\/dsh-/, `依赖必须是 DSH 官方包：${name}`);
  }
  // 这三个是本插件确实要用的：会话输入框插槽、右侧栏、设置页。
  assert.ok(inject.includes('@deepseek-ai/dsh-client-ui-conversation'));
  assert.ok(inject.includes('@deepseek-ai/dsh-client-ui-sidebar-right'));
  assert.ok(inject.includes('@deepseek-ai/dsh-client-ui-settings'));
  // 语音转写是可选依赖，绝不能写进必需清单（没装它就整个不加载了）。
  assert.ok(!inject.some((name) => /speech|voice/.test(name)), '语音插件不得写进必需依赖');
});

test('main 与 client 导出指向真实存在的文件', async () => {
  const { readFile: rf, access } = await import('node:fs/promises');
  const pkg = JSON.parse(await rf(join(here, '..', 'package.json'), 'utf8'));
  for (const [key, rel] of Object.entries(pkg.exports)) {
    if (typeof rel !== 'string' || !rel.endsWith('.js') && !rel.endsWith('.yml')) continue;
    await access(join(here, '..', rel)).catch(() => {
      throw new Error(`exports["${key}"] 指向不存在的文件：${rel}`);
    });
  }
  // client 必须指向生成物而不是源码，否则浏览器会拿到未打包的 ESM 分模块。
  assert.equal(pkg.exports['./client'], './lib/client.js');
});

/**
 * 插件展示元信息（标题/描述/图标）。
 *
 * 规范和回退链的权威依据是内核 `dsh-app-boot` 的 `readPluginMeta()`：
 *   - **发现入口是 `locale/en.json`**（不是 `meta.en.json` 之类），
 *     其它语言同名放在**同一个目录**（宿主会断言 `dirname(file)` 与英文的一致，
 *     不一致直接抛错）；
 *   - 形状是 `{ meta: { title, description } }`，两者都必须是非空字符串；
 *   - 图标字段是 `package.json` 顶层的 `icon`，文件必须在包内、≤256 KiB。
 * 缺字段时宿主**静默回退**（title → 包名、description → package.json 的
 * description、icon → 默认插画），所以必须有断言，否则退化了也没人发现。
 */
test('插件展示元信息：locale/en.json 是发现入口，meta.title/description 非空', async () => {
  const { readFile: rf, readdir } = await import('node:fs/promises');
  const root = join(here, '..');
  const localeDir = join(root, 'locale');

  // ① 发现入口必须叫 en.json。
  const files = await readdir(localeDir);
  assert.ok(
    files.includes('en.json'),
    'locale/en.json 是官方指定的发现入口（文件名写错宿主找不到，会静默回退到包名）',
  );

  // ② 每个语言文件都必须是 { meta: { title, description } } 且非空。
  for (const file of files.filter((f) => f.endsWith('.json'))) {
    const parsed = JSON.parse(await rf(join(localeDir, file), 'utf8'));
    assert.ok(parsed.meta !== undefined, `locale/${file} 必须有 meta`);
    assert.equal(typeof parsed.meta.title, 'string', `locale/${file}: meta.title 必须是字符串`);
    assert.ok(parsed.meta.title.trim() !== '', `locale/${file}: meta.title 不得为空`);
    assert.equal(typeof parsed.meta.description, 'string', `locale/${file}: meta.description 必须是字符串`);
    assert.ok(parsed.meta.description.trim() !== '', `locale/${file}: meta.description 不得为空`);
  }

  // ③ 中英标题都要有且不同（相同说明没翻译）。
  const zh = JSON.parse(await rf(join(localeDir, 'zh.json'), 'utf8'));
  const en = JSON.parse(await rf(join(localeDir, 'en.json'), 'utf8'));
  assert.notEqual(zh.meta.title, en.meta.title, 'zh 与 en 的标题应当不同（否则是没翻译）');
});

test('插件展示元信息：icon 在包内、≤256 KiB、是合法 SVG/图片', async () => {
  const { readFile: rf, stat } = await import('node:fs/promises');
  const root = join(here, '..');
  const pkg = JSON.parse(await rf(join(root, 'package.json'), 'utf8'));

  // ① 顶层 icon 字段必须在，且是包内相对路径。
  assert.equal(typeof pkg.icon, 'string', 'package.json 必须有顶层 icon 字段');
  assert.ok(!/^[a-z]+:\/\//i.test(pkg.icon), 'icon 不能是 URL');
  assert.ok(!pkg.icon.startsWith('/'), 'icon 不能是绝对路径');
  const iconPath = join(root, pkg.icon.replace(/^\.\//, ''));

  // ② 大小限制 256 KiB。
  const info = await stat(iconPath);
  assert.ok(info.isFile(), `icon 必须是文件：${pkg.icon}`);
  assert.ok(info.size > 0, 'icon 不得是空文件');
  assert.ok(info.size <= 256 * 1024, `icon 必须 ≤256 KiB，实际 ${info.size} 字节`);

  // ③ 必须是可解析的 SVG 或真实图片魔数（解码失败会静默回退默认插画）。
  const bytes = await rf(iconPath);
  const isSvg = /<svg[\s>]/i.test(bytes.toString('utf8').slice(0, 400));
  const isPng = bytes.slice(0, 4).toString('latin1') === '\x89PNG';
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  assert.ok(isSvg || isPng || isJpeg, 'icon 必须是 SVG/PNG/JPEG 之一');

  // ④ 打包白名单与导出必须覆盖 icon / locale，否则发布后宿主读不到。
  assert.ok(pkg.files.includes('icon.svg'), 'files 必须包含 icon.svg');
  assert.ok(pkg.files.includes('locale'), 'files 必须包含 locale');
  assert.ok(pkg.exports['./package.json'] !== undefined, 'exports 必须开放 ./package.json');
  assert.ok(pkg.exports['./locale/*.json'] !== undefined, 'exports 必须开放 ./locale/*.json');
});

/* ── 启动健壮性（本插件曾经把整个 DSH 启动拖挂在这里） ──────────────── */

/**
 * 临时把 globalThis 上的 storage 换成桩。
 *
 * DSH 的 web boot 会因为我们 apply 抛错而整页失败，所以「失败只降级、
 * 且留下可事后读取的痕迹」是硬性要求，必须在这里真的跑一遍。
 */
function withStorage(name, store, run) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { value: store, configurable: true, writable: true });
  try {
    return run();
  } finally {
    if (descriptor === undefined) delete globalThis[name];
    else Object.defineProperty(globalThis, name, descriptor);
  }
}

function memoryStorage() {
  const map = new Map();
  return {
    get length() {
      return map.size;
    },
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => void map.set(key, String(value)),
    removeItem: (key) => void map.delete(key),
    __map: map,
    /** 已写入内容的普通对象视图（断言用）。 */
    __raw: () => Object.fromEntries(map),
  };
}

/** 读回 apply 写下的启动报告。 */
function bootReportOf(store) {
  const raw = store.__map.get('dsh.enhanced-prompt-editor.boot');
  return typeof raw === 'string' ? JSON.parse(raw) : undefined;
}

test('apply 在「所有服务都抛错」的 ctx 上也不外抛，并留下失败报告', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  const store = memoryStorage();
  const boom = (label) => () => {
    throw new Error(`boom:${label}`);
  };
  const ctx = {
    slots: { inject: boom('slots.inject'), register: boom('slots.register') },
    locale: { register: boom('locale.register'), bind: boom('locale.bind') },
    sidebarRightTabs: { register: boom('sidebarRightTabs.register') },
    sidebarRight: { openTab: boom('sidebarRight.openTab'), openResource: boom('sidebarRight.openResource') },
    effect: boom('effect'),
    get: boom('get'),
    inject: boom('inject'),
  };

  withStorage('localStorage', store, () => {
    withStorage('sessionStorage', undefined, () => {
      assert.doesNotThrow(() => exports.apply(ctx), 'apply 绝不能把异常抛给 web boot');
    });
  });

  const report = bootReportOf(store);
  assert.ok(report !== undefined, '必须写下启动报告');
  assert.equal(report.ok, false);
  assert.ok(
    report.failures.some((failure) => failure.where === 'locale'),
    '必须记录文案步骤失败',
  );
  assert.ok(report.failures.every((failure) => typeof failure.stack === 'string'), '每条都带堆栈字段');
});

test('apply 在空 ctx 上也不外抛', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  assert.doesNotThrow(() => exports.apply({}), '缺服务时 apply 也不能抛');
});

test('某一面接线失败只丢那一面，其余两面照常注册', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  ctx.sidebarRightTabs.register = () => {
    throw new Error('boom:sidebarRightTabs');
  };
  const store = memoryStorage();

  withStorage('localStorage', store, () => {
    withStorage('sessionStorage', undefined, () => {
      assert.doesNotThrow(() => exports.apply(ctx));
    });
  });

  const names = ctx.__registrations.map((entry) => entry.options.name);
  assert.ok(names.includes('conversation.input.left'), '工具行按钮仍在');
  assert.ok(names.includes('plugins.bundle.config'), '插件卡片仍在');
  assert.ok(!names.includes('sidebar.right.pane.tab'), '坏掉的那一面没有半成品条目');

  const report = bootReportOf(store);
  assert.equal(report.failures.length, 1, '只记录一条失败');
  assert.equal(report.failures[0].where, 'sidebar-tab');
});

test('slots.inject 全挂时三面都记失败，但 apply 仍然不抛', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  ctx.slots.inject = () => {
    throw new Error('boom:slots.inject');
  };
  const store = memoryStorage();

  withStorage('localStorage', store, () => {
    withStorage('sessionStorage', undefined, () => {
      assert.doesNotThrow(() => exports.apply(ctx));
    });
  });

  const report = bootReportOf(store);
  const wheres = report.failures.map((failure) => failure.where);
  assert.ok(wheres.includes('composer-trigger'));
  assert.ok(wheres.includes('sidebar-tab'));
  assert.ok(wheres.includes('plugin-card'));
  assert.equal(ctx.__registrations.length, 0, '没有任何条目被注册');
});

test('locale 服务挂掉时用本地文案兜底，标签不是裸 key', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  ctx.locale.register = () => {
    throw new Error('boom:locale.register');
  };
  const store = memoryStorage();

  withStorage('localStorage', store, () => {
    withStorage('sessionStorage', undefined, () => {
      assert.doesNotThrow(() => exports.apply(ctx));
    });
  });

  assert.equal(bootReportOf(store).failures.length, 1);
  const trigger = ctx.__registrations.find((entry) => entry.options.name === 'conversation.input.left');
  const face = trigger.options.inject();
  assert.equal(face.t('trigger.label'), '增强的提示词编辑器', '兜底文案来自同一份字典');
  assert.equal(face.t('nonexistent.key'), 'nonexistent.key', '缺键时退回 key');
});

test('插件卡片渲染出启动降级提示（逐条列出出错步骤）', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  ctx.sidebarRightTabs.register = () => {
    throw new Error('boom:sidebarRightTabs');
  };
  const store = memoryStorage();

  withStorage('localStorage', store, () => {
    withStorage('sessionStorage', undefined, () => {
      exports.apply(ctx);
    });
  });

  const card = ctx.__registrations.find((entry) => entry.options.name === 'plugins.bundle.config');
  const face = card.options.inject();
  react.__reset();
  const tree = card.component({ ...face, view: 'page' });

  const warn = findByClass(react.__created, 'dsh-epe-card-warn');
  assert.ok(warn !== undefined, '存在告警块');
  const text = JSON.stringify(react.__created.map((node) => node?.props?.children));
  assert.ok(text.includes('sidebar-tab'), '告警里点名了失败的步骤');
  assert.ok(text.includes('boom:sidebarRightTabs'), '告警里带上了原始错误消息');
  assert.ok(tree !== undefined);
});

test('启动报告不含敏感信息：只有步骤、消息、堆栈与环境', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  const store = memoryStorage();

  withStorage('localStorage', store, () => {
    withStorage('sessionStorage', undefined, () => {
      exports.apply(ctx);
    });
  });

  const report = bootReportOf(store);
  assert.equal(report.ok, true, '全部成功时 ok=true');
  assert.deepEqual(report.failures, []);
  assert.deepEqual(Object.keys(report).sort(), ['at', 'context', 'failures', 'ok']);
  assert.equal(report.context.plugin, 'dsh-enhanced-prompt-editor');
  // 报告会落进渲染进程的 localStorage，所以不允许把整个 ctx / 配置塞进去。
  assert.ok(!JSON.stringify(report).includes('configForms'));
});

/**
 * 去掉注释与字符串字面量，只留代码。
 *
 * 必需：`ctx.configForms` 在 `settings-face.js` 的文档注释里出现过，而真正
 * 的代码走的是 `ctx.get('configForms')`（字符串，不受服务代理约束）。不剥注释
 * 就会误报。
 */
function stripCommentsAndStrings(code) {
  let out = '';
  let mode = 'code';
  let index = 0;
  while (index < code.length) {
    const char = code[index];
    const next = code[index + 1];
    if (mode === 'code') {
      if (char === '/' && next === '*') {
        mode = 'block';
        index += 2;
        continue;
      }
      if (char === '/' && next === '/') {
        mode = 'line';
        index += 2;
        continue;
      }
      if (char === '"' || char === "'" || char === '`') {
        mode = char;
        out += ' ';
        index += 1;
        continue;
      }
      out += char;
      index += 1;
      continue;
    }
    if (mode === 'block') {
      if (char === '*' && next === '/') {
        mode = 'code';
        index += 2;
        continue;
      }
      index += 1;
      continue;
    }
    if (mode === 'line') {
      if (char === '\n') {
        mode = 'code';
        out += '\n';
      }
      index += 1;
      continue;
    }
    // 字符串/模板字面量内部
    if (char === '\\') {
      index += 2;
      continue;
    }
    if (char === mode) mode = 'code';
    index += 1;
  }
  return out;
}


test('Ctrl+T 注册为官方快捷键命令：等价于点 T 控件，且在输入框里生效', async () => {
  // 用户 2026-10-18 要求「注册一个 dsh 内快捷键 ctrl+t，效果等同点了 t 控件」。
  //
  // 为什么必须走 `ctx.shortcuts` 而不是自己监听 keydown：
  //   - 官方服务自带冲突检测（与内核同键会拒绝注册，而不是两方都触发）；
  //   - 自带上下文判定（region / modal），不会在设置弹窗里误触发；
  //   - 会出现在「快捷键」设置页里，用户还能改键。
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  const store = memoryStorage();
  withStorage('localStorage', store, () => {
    withStorage('sessionStorage', undefined, () => {
      exports.apply(ctx);
    });
  });

  const commands = ctx.__shortcutCommands ?? [];
  const command = commands.find((item) => item.id === 'dsh-enhanced-prompt-editor.cycle-mode');
  assert.ok(command !== undefined, '必须注册 id 为 dsh-enhanced-prompt-editor.cycle-mode 的快捷键命令');

  // ① 键位：Ctrl+T（跨平台用 primary：macOS 映射 Cmd，其余映射 Ctrl）
  for (const runtime of ['desktop', 'web']) {
    for (const platform of ['macos', 'windows', 'linux']) {
      const binding = command.defaults?.[`${runtime}:${platform}`];
      assert.ok(binding !== undefined, `缺少 ${runtime}:${platform} 的默认键位`);
      assert.equal(binding.code, 'KeyT', `${runtime}:${platform} 的物理键必须是 KeyT`);
      assert.deepEqual(binding.modifiers, ['primary'], '修饰键必须是 primary（Ctrl/Cmd）');
    }
  }

  // ② ⚠️ region 必须包含 editable：用户就是在输入框里按的。
  //    缺了它，在 composer 里按 Ctrl+T 会被判「不匹配」而静默不生效（本仓库踩过同类坑）。
  assert.ok(Array.isArray(command.regions), '必须声明 regions');
  for (const region of ['page', 'editable', 'terminal']) {
    assert.ok(command.regions.includes(region), `regions 必须包含 ${region}（否则该区域按了没反应）`);
  }
  assert.ok(command.regions.includes('editable'), '⚠️ 缺 editable 会让输入框里的 Ctrl+T 静默失效');

  // ③ 触发时必须真的切模式（等价于点 T 控件），而不是弹面板或什么都不做
  const resolved = command.resolve({ region: 'editable', modal: null });
  assert.equal(resolved?.status, 'handled', '在输入框里按 Ctrl+T 必须被当作已处理');
  assert.equal(typeof resolved?.run, 'function', 'handled 必须带 run 回调');

  const trigger = ctx.__registrations.find((entry) => entry.options.name === 'conversation.input.left');
  const face = bindHooks(trigger.options.inject());
  assert.equal(face.useMode((v) => v), 'native', '初始应为原生模式');
  resolved.run();
  assert.notEqual(face.useMode((v) => v), 'native', '⚠️ 触发快捷键后模式必须切换（等价于点 T 控件）');
});

test('导出 inject 必须覆盖源码里用到的每一个 ctx 服务（漏写会打挂整个 DSH 启动）', async () => {
  const { readFile: rf, readdir } = await import('node:fs/promises');
  const exports = await loadBundle(makeReact());

  // Context 自带的方法/属性，不经过服务代理，不需要写进 inject。
  const CONTEXT_MEMBERS = new Set([
    'effect', 'inject', 'get', 'on', 'off', 'emit', 'plugin', 'fiber', 'logger',
    'reflect', 'provide', 'waterfall', 'set', 'start', 'stop', 'scope', 'isolate',
    'extend', 'config', 'registry', 'root', 'intercept', 'parallel', 'serial', 'bail',
  ]);

  const srcDir = join(here, '..', 'src');
  const files = (await readdir(srcDir)).filter((name) => name.endsWith('.js') && name !== 'index.js');
  assert.ok(files.length > 0, '至少要有客户端侧源文件');

  const needed = new Set();
  for (const name of files) {
    const code = stripCommentsAndStrings(await rf(join(srcDir, name), 'utf8'));
    for (const match of code.matchAll(/\bctx\.([A-Za-z_$][A-Za-z0-9_$]*)/g)) {
      if (!CONTEXT_MEMBERS.has(match[1])) needed.add(match[1]);
    }
  }

  assert.ok(needed.size > 0, '静态扫描必须真的扫到服务访问（否则这条守卫是空转）');
  for (const service of needed) {
    assert.ok(
      exports.inject.includes(service),
      `ctx.${service} 被使用了，但没写进 inject —— cordis 会同步抛 ` +
        `"cannot get property \\"${service}\\" without inject"，把 apply 打挂、进而让整个 DSH 启动失败`,
    );
  }
  // 反向：inject 里不要留用不到的服务（多余声明会把本插件绑死在别人的可用性上）。
  for (const service of exports.inject) {
    assert.ok(needed.has(service), `inject 里的 ${service} 已经没人用了，删掉`);
  }
});

test('客户端清单必须声明提供 slots/locale 的官方包（保证服务先于本插件就位）', async () => {
  const { readFile: rf } = await import('node:fs/promises');
  const pkg = JSON.parse(await rf(join(here, '..', 'package.json'), 'utf8'));
  const inject = pkg.dsh.client.inject;
  assert.ok(inject.includes('@deepseek-ai/dsh-client-ui-slots'), 'slots 服务的提供方');
  assert.ok(inject.includes('@deepseek-ai/dsh-client-locale'), 'locale 服务的提供方');
});

/* ── 模式切换的端到端接线 ──────────────────────────────────────────
 * 这两条覆盖的是"按 T 到底发生了什么"：模式真的切了、以及切到编辑器模式
 * 时面板真的被打开。它们必须走 `inject()` 拿到的那个真实 face，而不是在
 * 测试里重写一遍逻辑——否则测的是测试自己。
 */

test('T 的 cycle：真的切换模式，并持久化到 localStorage', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  const store = memoryStorage();

  withStorage('localStorage', store, () => {
    withStorage('sessionStorage', undefined, () => {
      exports.apply(ctx);
    });
  });

  // 面板操作需要「屏幕上有会话」，否则会被安静跳过（那是正确行为，不是 bug）。
  ctx.__mountedSessionId = 's1';
  ctx.__tabs = [];
  ctx.__expanded = false;

  const trigger = ctx.__registrations.find((entry) => entry.options.name === 'conversation.input.left');
  const face = bindHooks(trigger.options.inject());

  // 默认两个模式都启用、编辑器在前 → 原生 → 编辑器 → 扩展输入框 → 原生。
  // `mode` / `canCycle` 由快照源提供，face 上是 hook（已由 bindHooks 绑定）。
  assert.equal(face.useMode((v) => v), 'native', '初始为原生');
  assert.equal(face.useCanCycle((v) => v), true, '有可切换的目标');

  assert.equal(face.cycle(), 'editor', '第一次切到编辑器模式');
  // 切到编辑器模式必须真的打开面板（否则该模式等于没有效果）。
  assert.deepEqual(ctx.__openedTabs, ['enhanced-prompt-editor'], '编辑器模式打开面板');

  assert.equal(face.cycle(), 'extended', '第二次切到扩展输入框');
  assert.equal(ctx.__openedTabs.length, 1, '扩展输入框模式不再开面板');

  assert.equal(face.cycle(), 'native', '第三次回到原生');
  assert.equal(ctx.__openedTabs.length, 1);

  // 模式要落盘（下次启动能接着用）。
  assert.equal(store.__raw()['dsh.enhancedPromptEditor.mode'], 'native', '模式已持久化');
});

test('T 的 cycle：两个增强都关掉时不做任何事', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  // 让设置面读出来的是「两个都关掉」。
  ctx.__configForms = {
    whileServed: (_ns, register) => register(),
    get: () => ({
      getSnapshot: () => ({
        status: 'ready',
        writable: true,
        value: { modeEditor: false, modeExtended: false },
        base: {},
        user: {},
        revision: 1,
      }),
      subscribe: () => () => undefined,
      mutate: async () => true,
    }),
  };
  const store = memoryStorage();

  withStorage('localStorage', store, () => {
    withStorage('sessionStorage', undefined, () => {
      exports.apply(ctx);
    });
  });

  const trigger = ctx.__registrations.find((entry) => entry.options.name === 'conversation.input.left');
  const face = bindHooks(trigger.options.inject());
  assert.equal(face.useCanCycle((v) => v), false, '没有可切换的目标');
  assert.equal(face.cycle(), 'native', 'cycle 只停在原生');
  assert.deepEqual(ctx.__openedTabs, [], '不打开任何面板');
});

test('插件卡片：宿主 schema 尚未重载（字段整批缺失）时显示真正的默认值', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  exports.apply(ctx);
  const entry = ctx.__registrations.find((item) => item.options.name === 'plugins.bundle.config');
  const t = ctx.locale.bind('dsh-enhanced-prompt-editor');

  // 刚装完插件、还没重启时，Host 只服务旧的字段集：新模式字段一个都没有。
  // 这是真实会发生的中间态，界面**不得**把「默认为开」显示成「关」。
  const legacyScope = {
    getSnapshot: () => ({
      status: 'ready',
      writable: true,
      value: { storage: 'workspace', dir: '.dsh/prompts', enterMode: 'newline', panelHeight: 420, browseWithReader: true, dictate: true },
      base: {},
      user: {},
      revision: 1,
    }),
    subscribe: () => () => undefined,
    mutate: async () => true,
  };

  react.__reset();
  react.__resetRefs();
  entry.component({ t, view: 'page', scope: legacyScope });
  const switches = react.__created.filter((node) => node.type?.primitiveName === 'Switch');
  const editorSwitch = switches.find((node) => node.props.label === t('settings.mode.editor'));
  const extendedSwitch = switches.find((node) => node.props.label === t('settings.mode.extended'));
  assert.ok(editorSwitch !== undefined && extendedSwitch !== undefined, '两个模式开关都渲染');
  assert.equal(editorSwitch.props.checked, true, '模式字段缺失时按默认「开」显示，而不是「关」');
  assert.equal(extendedSwitch.props.checked, true, '模式字段缺失时按默认「开」显示，而不是「关」');
});

/* ── 切模式时「看得见的表面」要跟着走 ──────────────────────────────
 * 用户 2026-10-16 报的 bug：切到模式二（扩展输入框）时，模式一的编辑器
 * **没有关掉**，两个增强同时占着界面。这条测试钉死两个方向。
 */

test('切模式：进入编辑器模式开面板，离开时自动关掉', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  const store = memoryStorage();

  withStorage('localStorage', store, () => {
    withStorage('sessionStorage', undefined, () => {
      exports.apply(ctx);
    });
  });

  // 当前会话已挂载；右侧栏本来是**收起的**。
  ctx.__mountedSessionId = 's1';
  ctx.__expanded = false;
  const trigger = ctx.__registrations.find((entry) => entry.options.name === 'conversation.input.left');
  const face = bindHooks(trigger.options.inject());
  assert.equal(face.useMode((v) => v), 'native');

  // ── 切到编辑器模式：开面板，列被展开 ──────────────────────────────
  assert.equal(face.cycle(), 'editor', '第一次切到编辑器模式');
  assert.deepEqual(ctx.__openedTabs, ['enhanced-prompt-editor'], '编辑器模式打开面板');
  assert.equal(ctx.__expanded, true, '打开 tab 会展开整列');
  assert.equal(ctx.__tabs.length, 1, '面板 tab 已在');

  // ── 切到扩展输入框：关掉 tab **并且把列收回去** ────────────────────
  // 这是用户 2026-10-16 报的 bug：只关了 tab，右侧栏那一列还开着。
  // 内核「关最后一个 tab 会收列」的规则在这里不生效，因为停靠面永远
  // 至少有一个引导页，我们的 tab 从来不是唯一的。
  assert.equal(face.cycle(), 'extended', '第二次切到扩展输入框');
  assert.equal(ctx.__closedTabs.length, 1, '离开编辑器模式时关掉了面板');
  assert.deepEqual(ctx.__tabs, [], '面板记录已移除');
  assert.equal(ctx.__expanded, false, '右侧栏那一列也必须收起来（否则只有 tab 关了）');

  // ── 回到原生：保持关闭，不再开 ────────────────────────────────────
  assert.equal(face.cycle(), 'native', '第三次回到原生');
  assert.equal(ctx.__closedTabs.length, 1, '没有多关一次');
  assert.equal(ctx.__expanded, false, '仍然是收起的');
});

test('切模式：用户本来就开着侧栏时，离开编辑器模式不擅自收起', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  const store = memoryStorage();

  withStorage('localStorage', store, () => {
    withStorage('sessionStorage', undefined, () => {
      exports.apply(ctx);
    });
  });

  // 用户自己已经把侧栏开着了（比如在看文件树）。
  ctx.__mountedSessionId = 's1';
  ctx.__expanded = true;
  ctx.__tabs = [{ id: 'tab-guide', kind: 'guide', contentId: 'g', title: 'Guide' }];

  const trigger = ctx.__registrations.find((entry) => entry.options.name === 'conversation.input.left');
  const face = bindHooks(trigger.options.inject());

  face.cycle(); // native → editor：在我们之前就已经展开，记下来
  face.cycle(); // editor → extended：关掉我们的 tab

  assert.equal(ctx.__closedTabs.length, 1, '我们的面板 tab 关了');
  assert.equal(ctx.__expanded, true, '但用户自己开着的侧栏保持展开，不擅自收起');
  assert.deepEqual(ctx.__tabs.map((tab) => tab.id), ['tab-guide'], '别人的 tab 不动');
});

test('切模式：只关自己的面板，不动别人的 tab', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  const store = memoryStorage();

  withStorage('localStorage', store, () => {
    withStorage('sessionStorage', undefined, () => {
      exports.apply(ctx);
    });
  });

  ctx.__mountedSessionId = 's1';
  ctx.__expanded = false;
  ctx.__tabs = [{ id: 'tab-other', kind: 'some-other-plugin', contentId: 'y', title: 'Other' }];

  const trigger = ctx.__registrations.find((entry) => entry.options.name === 'conversation.input.left');
  const face = bindHooks(trigger.options.inject());

  face.cycle(); // native → editor（我们的 tab 加在别人的后面）
  face.cycle(); // editor → extended
  assert.deepEqual(ctx.__closedTabs, ['tab-enhanced-prompt-editor-1'], '只关自己那条');
  assert.deepEqual(ctx.__tabs.map((tab) => tab.id), ['tab-other'], '别人的 tab 留着');
});

test('切模式：没有会话时不抛错（面板还没挂载）', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  const store = memoryStorage();

  withStorage('localStorage', store, () => {
    withStorage('sessionStorage', undefined, () => {
      exports.apply(ctx);
    });
  });

  ctx.__mountedSessionId = undefined; // 没有会话
  const trigger = ctx.__registrations.find((entry) => entry.options.name === 'conversation.input.left');
  const face = bindHooks(trigger.options.inject());
  assert.doesNotThrow(() => {
    face.cycle();
    face.cycle();
    face.cycle();
  }, '没有会话时切模式也不能抛（插槽渲染期抛错会永久撤销条目）');
});

test('切模式：在设置里关掉编辑器模式时，也把面板收掉', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  const store = memoryStorage();

  // 设置面：先两个都开，之后可以改。
  let settingsValue = { modeEditor: true, modeExtended: true, editorFirst: true };
  const listeners = new Set();
  ctx.__configForms = {
    whileServed: (_ns, register) => register(),
    get: () => ({
      getSnapshot: () => ({ status: 'ready', writable: true, value: settingsValue, base: {}, user: {}, revision: 1 }),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      mutate: async () => true,
    }),
  };

  withStorage('localStorage', store, () => {
    withStorage('sessionStorage', undefined, () => {
      exports.apply(ctx);
    });
  });

  ctx.__mountedSessionId = 's1';
  ctx.__tabs = [];
  const trigger = ctx.__registrations.find((entry) => entry.options.name === 'conversation.input.left');
  const face = bindHooks(trigger.options.inject());

  // 切到编辑器模式 → 开面板；宿主的 tabs 里随后出现这条记录。
  assert.equal(face.cycle(), 'editor');
  ctx.__tabs = [{ id: 'tab-epe-9', kind: 'enhanced-prompt-editor', contentId: 'x', title: 'T' }];

  // 用户在设置里关掉编辑器模式 → 设置面通知 → 模式收敛为原生 → 面板必须收起。
  settingsValue = { modeEditor: false, modeExtended: true, editorFirst: true };
  for (const listener of [...listeners]) listener();

  assert.equal(face.useMode((v) => v), 'native', '模式收敛回原生');
  assert.deepEqual(ctx.__closedTabs, ['tab-epe-9'], '关掉编辑器模式时面板被收掉');
});

/* ── 快捷键行：符号按钮与粘贴 ───────────────────────────────────────
 * 用户 2026-10-16 要求「在发送按钮行的空白放这一行快捷按键」。
 * 这里测的是**接线**：按钮渲染出来了、点击真的改了草稿、以及
 * 「选中文字被框住而不是被替换」这条在真实组件里也成立。
 */

/** 造一份面板用的最小 face（与既有面板测试同形，抽出来复用）。 */
function panelFace(reactBackedText) {
  const written = [];
  const store = {
    snapshot: { getSnapshot: () => ({ revision: 0 }), subscribe: () => () => undefined },
    of: () => ({
      text: reactBackedText(),
      name: null, path: null, status: 'idle', error: null, drafts: [], height: null,
    }),
    patch: () => undefined,
    setText: (_sessionId, text) => written.push(text),
    dispose: () => undefined,
    notifySettings: () => undefined,
  };
  return { written, store };
}

/* ── 行号 gutter 与编辑区必须同字号 ──────────────────────────────────
 * 用户 2026-10-16 反馈「第二行比第一三行矮」。
 * 真因之一：--dsh-epe-font 原本只设在 textarea 的 style 上，
 * 而行号 gutter 是 textarea 的**兄弟节点**，继承不到 → 字号 ≠16px 时
 * 行号按 16px 排版、文字按新字号排版，逐行错位。
 * 这里断言变量设在**两者共同的父节点** .dsh-epe-body 上。
 */
test('行号 gutter：字号变量必须设在 gutter 与 editor 的共同父节点上', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  exports.apply(ctx);

  const entry = ctx.__registrations.find((item) => item.options.name === 'sidebar.right.pane.tab');
  const t = ctx.locale.bind('dsh-enhanced-prompt-editor');
  const { store } = panelFace(() => '一\n二\n三');
  const stubSettings = {
    get: () => ({
      storage: 'none', dir: '.dsh/prompts', enterMode: 'newline', panelHeight: 420,
      browseWithReader: true, dictate: true, editorFontSize: 22, keySize: 130,
    }),
    subscribe: () => () => undefined,
  };
  const io = { cwd: () => undefined, begin: () => ({ signal: undefined, release: () => undefined }), dispose: () => undefined, titleOf: () => 'x' };

  react.__reset();
  entry.component({ t, sessionId: 's1', store, settings: stubSettings, io, inputActions: {}, speech: undefined, useSessions: undefined });

  const body = findByClass(react.__created, 'dsh-epe-body');
  assert.ok(body !== undefined, '存在 .dsh-epe-body 容器');

  const bodyStyle = body.props.style ?? {};
  assert.equal(
    bodyStyle['--dsh-epe-font'], '22px',
    '--dsh-epe-font 必须设在 .dsh-epe-body 上：gutter 与 textarea 都是它的子节点，'
    + '设在 textarea 上时 gutter 继承不到（会退回 CSS 兜底 16px），字号一改就逐行错位',
  );
  assert.equal(
    bodyStyle['--dsh-epe-key-scale'], '1.3',
    '--dsh-epe-key-scale 同样要设在共同父节点上',
  );

  // ⚠️ 行高必须是**整数像素**。用户 2026-10-16 反复报「某条条纹带比别的窄」，
  // 真因是 line-height 用 1.7em = 27.2px（小数）：渐变周期 54.4px 落不到整数
  // 像素上，光栅化把相邻带抹成 27/28px、周期在 54/55 之间摆动。
  // 几何测试（stripe-geometry.test.mjs）用的是硬编码行高，抓不到「JS 忘了取整」
  // —— 那条链路由这里的断言补上。
  assert.match(
    String(bodyStyle['--dsh-epe-line']), /^\d+px$/,
    `--dsh-epe-line 必须是整数 px（实测 ${bodyStyle['--dsh-epe-line']}）。`
    + '小数行高会让条纹带宽度在相邻整数之间跳变，看起来「某条带更窄」。',
  );
  assert.equal(
    bodyStyle['--dsh-epe-line'], '37px',
    '22px 字号下 1.7 倍行高应四舍五入为整数 37px',
  );

  // gutter 与 textarea 都必须是 .dsh-epe-body 的直接子节点（否则上面的继承不成立）。
  const children = (body.props.children ?? []).flat(Infinity).filter((n) => n && typeof n === 'object');
  const gutter = children.find((n) => n?.props?.className === 'dsh-epe-gutter');
  const editor = children.find((n) => n?.props?.className === 'dsh-epe-editor');
  assert.ok(gutter !== undefined, 'gutter 是 .dsh-epe-body 的子节点');
  assert.ok(editor !== undefined, 'editor 是 .dsh-epe-body 的子节点');

  // 反向断言：textarea 自己**不得**再单独设字号变量（否则两处可能不同步）。
  assert.equal(
    (editor.props.style ?? {})['--dsh-epe-font'], undefined,
    '字号变量不应重复设在 textarea 上：单一来源才不会与 gutter 失同步',
  );
});

test('快捷键行：渲染出全部符号按钮 + 粘贴按钮，点击真的写入草稿', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  exports.apply(ctx);

  const entry = ctx.__registrations.find((item) => item.options.name === 'sidebar.right.pane.tab');
  const t = ctx.locale.bind('dsh-enhanced-prompt-editor');

  let text = 'hello world';
  const { written, store } = panelFace(() => text);
  const stubSettings = {
    get: () => ({ storage: 'none', dir: '.dsh/prompts', enterMode: 'newline', panelHeight: 420, browseWithReader: true, dictate: true }),
    subscribe: () => () => undefined,
  };
  const io = { cwd: () => undefined, begin: () => ({ signal: undefined, release: () => undefined }), dispose: () => undefined, titleOf: () => 'x' };

  const { keys, nodes: barNodes } = renderSymbolBar(
    entry,
    { t, sessionId: 's1', store, settings: stubSettings, io, inputActions: {}, speech: undefined, useSessions: undefined },
    react,
  );
  assert.ok(keys.length >= SYMBOLS.length, `应渲染出全部符号按钮（实际 ${keys.length}，符号 ${SYMBOLS.length}）`);
  assert.ok(findByClass(barNodes, 'dsh-epe-keys') !== undefined, '存在快捷键行容器');
  assert.ok(
    keys.some((node) => node.props['aria-label'] === t('panel.paste')),
    '存在粘贴按钮',
  );
  // 悬浮提示必须是「中文名 符号」的中文，**不得**是裸 key。
  const parenNode = keys.find((node) => node.props['aria-label'] === `${t('symbol.paren')} ()`);
  assert.ok(parenNode !== undefined, '圆括号按钮的提示应是「圆括号 ()」');
  assert.ok(
    !keys.some((node) => String(node.props.title).includes('symbol.')),
    '悬浮提示不得出现裸 key（symbol.paren.hint 那类）',
  );

  // 点击「()」：无 DOM 选区时按「追加到末尾」处理，但**必须真的写草稿**。
  const paren = keys.find((node) => node.props['aria-label'].startsWith(t('symbol.paren')));
  assert.ok(paren !== undefined, '存在圆括号按钮');
  paren.props.onClick();
  assert.equal(written.length, 1, '点击后写了一次草稿');
  assert.equal(written[0], 'hello world()', '把一对符号插到了末尾（无选区时）');

  // 断言按钮阻止了默认行为，否则 textarea 会失焦、选区归零，
  // 「包裹选中文字」就永远拿不到用户的选择。
  let prevented = 0;
  paren.props.onMouseDown({ preventDefault: () => (prevented += 1) });
  assert.equal(prevented, 1, '符号按钮必须 onMouseDown preventDefault，否则编辑区失去焦点、选区丢失');
});

test('快捷键行：选中文字后点成对符号 → 文字被框住（不丢内容）', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  exports.apply(ctx);

  const entry = ctx.__registrations.find((item) => item.options.name === 'sidebar.right.pane.tab');
  const t = ctx.locale.bind('dsh-enhanced-prompt-editor');

  let text = 'hello world';
  const { written, store } = panelFace(() => text);
  const stubSettings = {
    get: () => ({ storage: 'none', dir: '.dsh/prompts', enterMode: 'newline', panelHeight: 420, browseWithReader: true, dictate: true }),
    subscribe: () => () => undefined,
  };
  const io = { cwd: () => undefined, begin: () => ({ signal: undefined, release: () => undefined }), dispose: () => undefined, titleOf: () => 'x' };

  // 先渲染一次拿到 textarea 的 ref 槽，把「用户选中了 world」塞进去。
  react.__reset();
  const tree = entry.component({ t, sessionId: 's1', store, settings: stubSettings, io, inputActions: {}, speech: undefined, useSessions: undefined });
  const refNode = react.__refs?.find?.((r) => r && typeof r === 'object' && 'current' in r);
  const fakeSelection = { selectionStart: 6, selectionEnd: 11, focus: () => undefined, setSelectionRange: () => undefined };
  if (refNode !== undefined) refNode.current = fakeSelection;
  assert.ok(findByClass(react.__created, 'dsh-epe-editor') !== undefined, '有编辑区');

  const bar = react.__created.find((node) => node?.type?.name === 'SymbolBar');
  assert.ok(bar !== undefined, '有快捷键行组件');
  react.__reset();
  bar.type(bar.props);
  const keys = react.__created.filter((node) => node?.props?.className === 'dsh-epe-key');
  const corner = keys.find((node) => node.props['aria-label'].startsWith(t('symbol.corner')));
  assert.ok(corner !== undefined, '存在直角引号按钮');
  corner.props.onClick();

  assert.equal(written.length, 1, '点击后写入一次');
  if (refNode !== undefined) {
    assert.equal(written[0], 'hello 「world」', '选中的 world 被框在「」内，且文字未丢失');
  }
});

/* ── 面板 CSS：主题 token 与特异性 ──────────────────────────────────
 * 用户 2026-10-16 报：「dark theme 下发送按钮显示纯白，悬浮时黑底白字」。
 * 两个根因都是纯 CSS 的，组件测试抓不到，所以直接对样式文本断言。
 * 这类断言看似"测字符串"，但它是唯一能防住这两个回归的手段——
 * 颜色错了不会抛错、不会改变任何 props，只会让用户在深色主题下看见白块。
 */

test('发送按钮：用内核同款 button-info token，不用 brand-primary', async () => {
  const { readFile: rf } = await import('node:fs/promises');
  const source = await rf(join(here, '..', 'src', 'panel.js'), 'utf8');

  // 主按钮必须用内核发送按钮（InputBar 的 .primary）那两个 token。
  assert.match(
    source,
    /\[data-primary\]\{background:var\(--dsw-alias-button-info-fill/,
    '主按钮底色必须用 --dsw-alias-button-info-fill（内核发送按钮同款）',
  );
  assert.match(
    source,
    /\[data-primary\][^{]*\{background:var\(--dsw-alias-button-info-hover/,
    '主按钮悬浮必须用 --dsw-alias-button-info-hover',
  );
  // ⚠️ brand-primary 在深色主题下是近白色 —— 用了就是"纯白按钮"。
  const primaryRules = source.match(/\[data-primary\][^\n]*/g) ?? [];
  for (const rule of primaryRules) {
    assert.ok(
      !/brand-primary/.test(rule),
      `主按钮不得使用 brand-primary（深色主题下解析成近白色）：${rule}`,
    );
  }
});

test('按钮悬浮：primary 的特异性必须高于通用规则（否则黑底白字）', async () => {
  const { readFile: rf } = await import('node:fs/promises');
  const source = await rf(join(here, '..', 'src', 'panel.js'), 'utf8');

  // 通用 hover 规则必须把 :hover 包进 :where()（权重 0），这样它的特异性
  // 才低于 primary 的 hover 规则；否则通用规则会盖掉主按钮背景，
  // 而主按钮文字是白色 → 深色主题下成为「黑底白字」。
  const generic = source.match(/\.dsh-epe-btn[^\n{]*hover[^\n{]*\{/g) ?? [];
  const genericHover = generic.filter((sel) => !sel.includes('[data-primary]'));
  assert.ok(genericHover.length > 0, '存在通用悬浮规则');
  for (const sel of genericHover) {
    assert.ok(
      sel.includes(':where(:hover)'),
      `通用悬浮规则必须用 :where(:hover) 压低特异性，否则会盖过主按钮：${sel}`,
    );
  }
  // 主按钮自己要有独立的 hover 规则。
  assert.ok(
    /\.dsh-epe-btn\[data-primary\][^\n{]*hover[^\n{]*\{[^}]*button-info-hover/.test(source),
    '主按钮必须有自己的悬浮规则（不能被通用规则代管）',
  );
});

test('编辑区：条纹用重复渐变，且不拆成逐行元素', async () => {
  const { readFile: rf } = await import('node:fs/promises');
  const source = await rf(join(here, '..', 'src', 'panel.js'), 'utf8');

  // 交替行底色：必须是 repeating-linear-gradient（保住 textarea 的原生
  // 光标/选择/IME/undo 行为），**不是**把 textarea 拆成每行一个元素。
  assert.match(source, /repeating-linear-gradient/, '必须用重复渐变画条纹');
  // ⚠️ 色标里的颜色**必须写成 var(--dsh-epe-stripe)**。
  // 漏掉 var() 时（裸写 --dsh-epe-stripe），那个位置既不是颜色也不是长度，
  // 整条 background-image 会被判无效并回落到 none —— 条纹一条都不显示，
  // 而且控制台不报错。用户 2026-10-16 报的「行背景也没有」就是这个。
  const gradient = source.match(/background-image:(repeating-linear-gradient\([^;]+\))/)?.[1] ?? '';
  assert.ok(gradient !== '', '取到 background-image 的渐变');
  assert.match(
    gradient,
    /var\(--dsh-epe-stripe\)/,
    '渐变色标必须用 var(--dsh-epe-stripe)；裸写变量名会让整条 background-image 失效（条纹完全不显示）',
  );
  // 反向：不得存在裸的 `--dsh-epe-stripe 0` 这种色标（缺 var()）。
  assert.ok(
    !/(?<!var\()--dsh-epe-stripe\s+\d/.test(gradient.replace(/var\(--dsh-epe-stripe\)/g, '')),
    '色标里不得出现漏掉 var() 的裸变量名',
  );
  assert.match(source, /background-origin:padding-box/, 'origin 必须是 padding-box：条纹要铺满整行，且与 clip 配对');
  // ⚠️ 硬约束：origin 与 clip 必须都是 padding-box。
  // 写成 origin:content-box + clip 默认(border-box) 时，padding-top 那 12px 落在
  // 渐变的负坐标区，repeating-linear-gradient 把「第一个 tile 之前」clamp 到第一个
  // 色标（亮色），首条亮带被撑成 padding-top + line-height ≈ 39px，后面的带 27px
  // —— 用户 2026-10-16 报的「第一二三行高度目测不一致」就是这个。
  // 离屏 Chromium 实测：不修 → 首带 39px；修好 → 27px（见 stripe-geometry.test.mjs
  // 的端到端几何断言，那才是真正兜住这个 bug 的守卫）。
  assert.match(source, /background-clip:padding-box/, 'clip 必须与 origin 一致为 padding-box，否则首条条纹被 padding 撑长');
  // 渐变里必须内置 padding-top 长的透明补偿段，条纹起点才会与首行文字顶对齐。
  assert.match(
    source,
    /transparent var\(--dsh-epe-pad,12px\)/,
    '渐变必须内置 padding 补偿段，否则条纹与首行文字错位',
  );
  assert.match(source, /background-attachment:local/, '必须 local，否则滚动时条纹不动');
  // 条纹透明度要低（"深一些/浅一些"而不是高对比）。
  assert.match(source, /--dsh-epe-stripe:color-mix\([^;]*5%/, '条纹应是低透明度叠加');
});

/* ── 模式二：扩展输入框里的符号行 ───────────────────────────────────
 * 用户 2026-10-16：「这个快捷行也加到模式二」。
 * 这里测接线：注册到了正确的插槽、只在扩展模式出现、点击真的走
 * inputActions 的官方插入通道（而不是硬写草稿）。
 */

test('原生输入框：勾选 nativeDeck 后 deck 显示，但**不**显示行号沟槽', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  // ⚠️ nativeDeck = true，模式保持默认的「原生」。
  ctx.__configForms = {
    whileServed: (_ns, register) => register(),
    get: () => ({
      getSnapshot: () => ({
        status: 'ready',
        writable: true,
        value: { modeEditor: true, modeExtended: true, nativeDeck: true, nativeEnter: false },
        base: {},
        user: {},
        revision: 1,
      }),
      subscribe: () => () => undefined,
      mutate: async () => true,
    }),
  };
  const store = memoryStorage();
  // deck 可见性现在读**客户端**存储的开关（宿主设置那条写入在本机被整体系拒绝）。
  store.setItem('dsh-enhanced-prompt-editor:native-switches', JSON.stringify({ nativeDeck: true }));
  withStorage('localStorage', store, () => {
    withStorage('sessionStorage', undefined, () => {
      exports.apply(ctx);
    });
  });

  const bar = ctx.__registrations.find((entry) => entry.options.name === 'conversation.input.overlay');
  const face = bindHooks(bar.options.inject());
  // 插槽 hooks face 必须同时给出两个源：`visible`（deck 可见）与
  // `extended`（是否真的在扩展模式 —— 行号沟槽的开关）。
  assert.equal(typeof face.useVisible, 'function', 'deck 可见性走 useVisible');
  assert.equal(typeof face.useExtended, 'function', '必须单独给 useExtended（行号沟槽的开关）');

  // 原生模式 + nativeDeck：deck 要显示……
  assert.equal(face.useVisible((v) => v), true, '原生模式下勾选 nativeDeck → deck 必须显示');
  // ……但行号沟槽不能显示（那是扩展模式的东西，带进原生会改原生外观）。
  assert.equal(
    face.useExtended((v) => v),
    false,
    '⚠️ 原生 + nativeDeck 时 extended 必须为 false：不许把行号沟槽/隔行底色带进原生输入框',
  );

  // 切到扩展模式：两者都为真。
  const trigger = ctx.__registrations.find((entry) => entry.options.name === 'conversation.input.left');
  const triggerFace = bindHooks(trigger.options.inject());
  triggerFace.cycle(); // native → editor
  triggerFace.cycle(); // editor → extended
  assert.equal(face.useVisible((v) => v), true, '扩展模式下 deck 仍显示');
  assert.equal(face.useExtended((v) => v), true, '扩展模式下 extended 为真（行号沟槽要画）');
});

test('原生输入框：没勾 nativeDeck 时原生模式不显示 deck（保持原生外观）', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  ctx.__configForms = {
    whileServed: (_ns, register) => register(),
    get: () => ({
      getSnapshot: () => ({
        status: 'ready',
        writable: true,
        value: { modeEditor: true, modeExtended: true, nativeDeck: false },
        base: {},
        user: {},
        revision: 1,
      }),
      subscribe: () => () => undefined,
      mutate: async () => true,
    }),
  };
  const store = memoryStorage();
  withStorage('localStorage', store, () => {
    withStorage('sessionStorage', undefined, () => {
      exports.apply(ctx);
    });
  });
  const bar = ctx.__registrations.find((entry) => entry.options.name === 'conversation.input.overlay');
  const face = bindHooks(bar.options.inject());
  assert.equal(face.useVisible((v) => v), false, '默认（未勾选）原生模式必须保持原生，不显示 deck');
});

test('模式二符号行：注册到 conversation.input.overlay（悬浮在输入框上方），且只在扩展模式显示', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  const store = memoryStorage();

  withStorage('localStorage', store, () => {
    withStorage('sessionStorage', undefined, () => {
      exports.apply(ctx);
    });
  });

  const bar = ctx.__registrations.find((entry) => entry.options.name === 'conversation.input.overlay');
  assert.ok(bar !== undefined, '注册了扩展输入框模式的符号行');
  assert.equal(bar.options.id, 'dsh-enhanced-prompt-editor-extended-bar', '必须是自有 id（复用别人的会顶格）');

  // ⚠️ 位置守卫：符号栏必须落在**输入框上方悬浮**的位置，即
  // `conversation.input.overlay`（`.card` 内的零高度绝对定位锚点）。
  //
  // 用户 2026-10-16 连续否掉了两个位置（都已实测）：
  //  - `conversation.input.dock` → 出现在**整张输入卡之外的上方**。
  //    内核 `composerStack` 的 children 顺序是
  //    `[HeroShell, heroWorkspaceRow, conversation.input.dock, inputBar]`，
  //    所以它排在卡**之前**（卡外）。
  //  - `conversation.composer.dock` → 出现在**卡片下方**，
  //    与 ContextMeter（用量条）同排（内核把它渲染在 `.card` 之后的 `div.dock` 里）。
  // 两个都写下断言，防止以后再改回去。
  for (const wrong of ['conversation.input.dock', 'conversation.composer.dock']) {
    assert.equal(
      ctx.__registrations.some((entry) => entry.options.name === wrong),
      false,
      `符号行不得注册到 ${wrong}：`
      + 'input.dock 在整张输入卡**之外的上方**，composer.dock 在**卡片下方**，'
      + '都不是用户要的「输入框上方悬浮」',
    );
  }

  const face = bindHooks(bar.options.inject());
  // 默认模式是原生 → 不显示。
  assert.equal(face.useVisible((v) => v), false, '原生模式下不显示');
});

test('模式二符号行：切到扩展模式后显示，且点击走 inputActions 官方通道', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  const store = memoryStorage();

  withStorage('localStorage', store, () => {
    withStorage('sessionStorage', undefined, () => {
      exports.apply(ctx);
    });
  });

  ctx.__mountedSessionId = 's1';
  const trigger = ctx.__registrations.find((entry) => entry.options.name === 'conversation.input.left');
  const triggerFace = bindHooks(trigger.options.inject());
  triggerFace.cycle(); // native → editor
  triggerFace.cycle(); // editor → extended

  const bar = ctx.__registrations.find((entry) => entry.options.name === 'conversation.input.overlay');
  const face = bindHooks(bar.options.inject());
  assert.equal(face.useVisible((v) => v), true, '扩展模式下显示');

  // 造一份用户选中了「world」的输入框状态。
  const calls = [];
  const inputActions = {
    captureInsertion: () => ({ start: 6, end: 11, draftRev: 1 }),
    insertText: (text, span) => {
      calls.push({ text, span });
      return true;
    },
  };
  const useInput = (selector) => selector({ draft: 'hello world' });

  // 穿透 FloatingSymbolBar 包装层，渲染真正的按钮组件。
  react.__reset();
  bar.component({ ...face, inputActions, useInput });
  const wrapped = takeBarInner(react);
  react.__reset();
  const tree = wrapped.inner === undefined ? null : wrapped.inner({ ...wrapped.innerProps, inputActions, useInput });
  assert.ok(tree !== null && tree !== undefined, '扩展模式下渲染出符号行');

  const keys = react.__created.filter((node) => node?.props?.className === 'dsh-epe-xkey');
  assert.ok(keys.length >= SYMBOLS.length, `渲染出符号按钮（实际 ${keys.length}）`);

  // 点直角引号：应把选中的 world 换成 「world」再交给 insertText。
  const corner = keys.find((node) => node.props['aria-label'].includes('「」'));
  assert.ok(corner !== undefined, '有直角引号按钮');
  corner.props.onClick();
  assert.equal(calls.length, 1, '调用了一次官方插入通道');
  assert.equal(calls[0].text, '「world」', '选中的文字被框在符号内（不是被替换成符号）');
  assert.equal(calls[0].span.start, 6, '区间起点透传');
  assert.equal(calls[0].span.end, 11, '区间终点透传');
});

test('原生输入框 + deck：渲染 deck 但**不**渲染行号沟槽（extended=false）', async () => {
  // ⚠️ 「原生模式应用悬浮 deck」只借 deck，不加行号沟槽/隔行底色 ——
  // 那是扩展输入框模式的东西，带进原生就改变了原生外观。
  // 这条测的是**渲染结果**：extended=false 时不许出现 ComposerGutter。
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  const store = memoryStorage();
  // 勾选客户端开关（deck 可见性现在读客户端存储，不读宿主设置）。
  store.setItem('dsh-enhanced-prompt-editor:native-switches', JSON.stringify({ nativeDeck: true }));
  withStorage('localStorage', store, () => {
    withStorage('sessionStorage', undefined, () => {
      exports.apply(ctx);
    });
  });

  const bar = ctx.__registrations.find((entry) => entry.options.name === 'conversation.input.overlay');
  const face = bindHooks(bar.options.inject());
  const useInput = (selector) => selector({ draft: 'line one\nline two' });

  // ── 场景 A：原生 + deck（visible=true, extended=false）→ 有 deck、无沟槽 ──
  react.__reset();
  const faceNative = { ...face, useVisible: () => true, useExtended: () => false, inputActions: {}, useInput };
  bar.component(faceNative);
  const wrappedNative = takeBarInner(react);
  assert.ok(wrappedNative.inner !== undefined, '必须能拿到 deck 组件');
  const beforeA = react.__created.length;
  wrappedNative.inner(wrappedNative.innerProps);
  const nodesA = react.__created.slice(beforeA);
  const gutterA = nodesA.find((node) => node?.type?.name === 'ComposerGutter');
  assert.equal(
    gutterA,
    undefined,
    '⚠️ 原生 + nativeDeck 时**不得**渲染 ComposerGutter（行号沟槽只属于扩展模式）',
  );
  assert.ok(
    nodesA.some((node) => typeof node?.props?.className === 'string' && node.props.className.includes('dsh-epe-xbar')),
    'deck 工具条本身必须渲染出来',
  );

  // ── 场景 B：扩展模式（visible=true, extended=true）→ 有沟槽 ──
  react.__reset();
  const faceExtended = { ...face, useVisible: () => true, useExtended: () => true, inputActions: {}, useInput };
  bar.component(faceExtended);
  const wrappedExtended = takeBarInner(react);
  const beforeB = react.__created.length;
  wrappedExtended.inner(wrappedExtended.innerProps);
  const nodesB = react.__created.slice(beforeB);
  assert.ok(
    nodesB.some((node) => node?.type?.name === 'ComposerGutter'),
    '扩展模式下必须渲染行号沟槽（否则模式二就没有行号了）',
  );

  // ── 场景 C：都不显示时整条为 null ──
  react.__reset();
  bar.component({ ...face, useVisible: () => false, useExtended: () => false, inputActions: {}, useInput });
  const wrappedHidden = takeBarInner(react);
  assert.equal(
    wrappedHidden.inner(wrappedHidden.innerProps),
    null,
    '不可见时（原生且未勾 nativeDeck）必须整条返回 null',
  );
});

test('模式二符号行：没有选区时点成对符号 → 插入一对', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  const store = memoryStorage();

  withStorage('localStorage', store, () => {
    withStorage('sessionStorage', undefined, () => {
      exports.apply(ctx);
    });
  });
  ctx.__mountedSessionId = 's1';
  const trigger = ctx.__registrations.find((entry) => entry.options.name === 'conversation.input.left');
  const triggerFace = bindHooks(trigger.options.inject());
  triggerFace.cycle();
  triggerFace.cycle();

  const bar = ctx.__registrations.find((entry) => entry.options.name === 'conversation.input.overlay');
  const face = bindHooks(bar.options.inject());

  const calls = [];
  const inputActions = {
    captureInsertion: () => ({ start: 5, end: 5, draftRev: 1 }),
    insertText: (text, span) => {
      calls.push({ text, span });
      return true;
    },
  };
  const useInput = (selector) => selector({ draft: 'hello' });

  react.__reset();
  react.__reset();
  bar.component({ ...face, inputActions, useInput });
  const wrapped = takeBarInner(react);
  react.__reset();
  if (wrapped.inner !== undefined) wrapped.inner({ ...wrapped.innerProps, inputActions, useInput });
  const keys = react.__created.filter((node) => node?.props?.className === 'dsh-epe-xkey');
  const paren = keys.find((node) => node.props['aria-label'].includes('()'));
  paren.props.onClick();
  assert.equal(calls[0].text, '()', '无选区时插入一对符号');
});

test('模式二符号行：inputActions 不存在时不抛错（非会话环境）', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  const store = memoryStorage();
  withStorage('localStorage', store, () => {
    withStorage('sessionStorage', undefined, () => {
      exports.apply(ctx);
    });
  });
  // 必须先切到扩展模式，否则组件返回 null（不显示）。
  ctx.__mountedSessionId = 's1';
  const trigger = ctx.__registrations.find((entry) => entry.options.name === 'conversation.input.left');
  const triggerFace = bindHooks(trigger.options.inject());
  triggerFace.cycle();
  triggerFace.cycle();

  const bar = ctx.__registrations.find((entry) => entry.options.name === 'conversation.input.overlay');
  const face = bindHooks(bar.options.inject());
  assert.equal(face.useVisible((v) => v), true, '前提：处于扩展模式');
  const useInput = (selector) => selector({ draft: '' });

  react.__reset();
  react.__reset();
  bar.component({ ...face, inputActions: undefined, useInput });
  const wrapped = takeBarInner(react);
  react.__reset();
  if (wrapped.inner !== undefined) wrapped.inner({ ...wrapped.innerProps, inputActions: undefined, useInput });
  const keys = react.__created.filter((node) => node?.props?.className === 'dsh-epe-xkey');
  assert.ok(keys.length > 0, '渲染出按钮（但没有可用的插入通道）');
  assert.doesNotThrow(() => {
    for (const node of keys) node.props.onClick();
  }, '没有 inputActions 时点击不得抛错（插槽渲染期抛错会让条目被永久撤销）');
});

test('符号按钮的悬浮提示：中文名 + 符号，且绝不含裸 key', async () => {
  const react = makeReact();
  const exports = await loadBundle(react);
  const ctx = makeCtx();
  exports.apply(ctx);

  const entry = ctx.__registrations.find((item) => item.options.name === 'sidebar.right.pane.tab');
  const t = ctx.locale.bind('dsh-enhanced-prompt-editor');
  let text = 'x';
  const { store } = panelFace(() => text);
  const stubSettings = {
    get: () => ({ storage: 'none', dir: '.dsh/prompts', enterMode: 'newline', panelHeight: 420, browseWithReader: true, dictate: true, editorFontSize: 16, keySize: 100 }),
    subscribe: () => () => undefined,
  };
  const io = { cwd: () => undefined, begin: () => ({ signal: undefined, release: () => undefined }), dispose: () => undefined, titleOf: () => 'x' };

  const { keys } = renderSymbolBar(
    entry,
    { t, sessionId: 's1', store, settings: stubSettings, io, inputActions: {}, speech: undefined, useSessions: undefined },
    react,
  );
  assert.ok(keys.length > 0, '有符号按钮');

  for (const node of keys) {
    const title = String(node.props.title ?? '');
    // 用户 2026-10-16：「指针悬浮显示的不是简单易懂的中文名」。
    // 之前 title 读的是 `symbol.<key>.hint`，那个 key 不存在 → 显示裸 key。
    assert.ok(
      !title.includes('symbol.') && !title.includes('panel.'),
      `悬浮提示不得是裸 key，实际是「${title}」`,
    );
    assert.ok(title.length > 0, '每个按钮都要有悬浮提示');
  }
  // 抽查几个：中文名必须真的在（而不是只回退到符号本身）。
  const byTitle = (needle) => keys.find((node) => String(node.props.title).includes(needle));
  assert.ok(byTitle(t('symbol.paren')) !== undefined, '圆括号按钮带中文名「圆括号」');
  assert.ok(byTitle(t('symbol.bookTitle')) !== undefined, '书名号按钮带中文名');
});

test('产物必须比源码新（否则就是「改了 src 忘了 build」）', async () => {
  // ⚠️ 2026-10-16 血亏教训：浏览器执行的是 `lib/client.js`，**不是** `src/`。
  // 我连续几轮改了 `src/` 就 `cp` 到 profile，忘了 `npm run build`
  // —— 产物还是旧的，用户看到的行为一直没变，于是反复说「还是没用」。
  // 这条断言把「源码比产物新」变成机器可查的红灯。
  const { stat, readdir } = await import('node:fs/promises');
  const root = join(here, '..');
  const libInfo = await stat(join(root, 'lib', 'client.js'));
  const srcFiles = (await readdir(join(root, 'src'))).filter((f) => f.endsWith('.js') || f.endsWith('.mjs'));
  const stale = [];
  for (const file of srcFiles) {
    const info = await stat(join(root, 'src', file));
    // 允许 1 秒容差（构建与写入可能同秒）。
    if (info.mtimeMs > libInfo.mtimeMs + 1000) stale.push(file);
  }
  assert.deepEqual(
    stale,
    [],
    `以下源码比 lib/client.js 新，说明改完没跑 npm run build：${stale.join(', ')}`
    + '（浏览器执行的是产物，不是 src/）',
  );
});
