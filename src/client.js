/**
 * dsh-enhanced-prompt-editor —— 浏览器侧入口。
 *
 * 组装三件事：
 *  1. 输入框左下工具行的 T 按钮（`conversation.input.left`）；
 *  2. 右侧栏的编辑面板 tab（`sidebarRightTabs` + `sidebar.right.pane.tab`）；
 *  3. 设置页（`settings.section`）。
 *
 * 依赖策略：
 *
 *  - **必需**的客户端插件写进 package.json 的 `dsh.client.inject`，模块系统据此
 *    保证加载顺序；**可选**的语音转写用 `ctx.inject(['remote.speech'])` 解析，
 *    因为它可能永远不出现。
 *  - ⚠️ **`dsh.client.inject` 只管模块加载顺序，不管服务访问权限。** cordis 的
 *    `ctx.<service>` 代理要求该服务名出现在插件自己的 `inject` 导出里，否则读它
 *    会**同步抛** `cannot get property "<service>" without inject`。这条异常在
 *    `apply` 里冒出去会把 fiber 打成 FAILED，进而让整个 DSH 启动失败
 *    （`<包名>: failed` / 白屏）。所以下面 `inject` 里的服务名必须和插件真正
 *    用到的 `ctx.*` 服务一一对应：`slots`、`locale`、`sidebarRightTabs`、
 *    `sidebarRight`。
 *
 * ⚠️ **本插件的任何一步都不允许把异常抛出去。** DSH 的 web boot 把每个客户端
 * 插件的 cordis fiber 都当成必须 ACTIVE 的条目：`apply` 里冒出的任何异常都会
 * 让整页启动失败，用户看到的是白屏，而不是「这个插件的某个按钮没了」。尤其
 * 注意 `ctx.slots.inject(key, cb)` 的契约——插槽**已声明**时 cb 是**同步执行**
 * 的，里面的异常会**同步冒泡**出 `apply`。所以每个表面各自包一层 guardStep，
 * 失败只记录、只降级（报告在设置页与 localStorage 都能看到）。
 *
 * 三个表面共享同一份草稿状态与设置面，所以从这一层统一构造后传给各组件。
 *
 * @module dsh-enhanced-prompt-editor/client
 */
import { PLUGIN_ID, SETTINGS_NAMESPACE, TAB_KIND, COMPOSER_SLOT_ID, EXTENDED_BAR_SLOT_ID, nextMode } from './constants.js';
import { createDraftStore, createSnapshotStore } from './store.js';
import { createDraftIO } from './io.js';
import { createSettingsFace } from './settings-face.js';
import { createModeController } from './mode-controller.js';
import { createNativeSwitches } from './native-switches.js';
import { attachEscapeExit } from './escape-exit.js';
import { EXTENDED_CSS, createNativeComposer } from './native-composer.js';
import { ComposerTrigger } from './composer-trigger.js';
import { ExtendedSymbolBar } from './extended-bar.js';
import { FloatingSymbolBar } from './floating-bar.js';
import { PanelBody, PanelTitle } from './panel.js';
import { PluginCard, setNativeSwitches, setPluginContext } from './plugin-card.js';
import { createLocale } from './locale.js';
import { guardStep, writeBootReport } from './boot-diagnostics.js';
import { ensureCss as injectStyle } from './css.js';

export const name = PLUGIN_ID;

/**
 * 必需服务。
 *
 * ⚠️ 这四项必须与 `apply` 里真正用到的 `ctx.*` 服务一一对应：cordis 的
 * `ctx.<service>` 代理只放行写在这里的服务名，漏写会在 apply 里同步抛
 * `cannot get property "<service>" without inject`，把 fiber 打成 FAILED，
 * 最终表现为整个 DSH 启动失败。`sidebarRight` / `sidebarRightTabs` 由内核的
 * `@deepseek-ai/dsh-client-ui-sidebar-right` 提供（package.json 的
 * `dsh.client.inject` 已经把它列为必需模块依赖）。
 *
 * `configForms` **不在**这里：设置面用 `ctx.get('configForms')` 探测
 * （`settings-face.js`），它是可选依赖，写进 inject 就等于把本插件绑死在
 * 设置服务上。同理 `plugins.item` 是插槽名而不是服务，不需要声明。
 */
export const inject = ['slots', 'locale', 'sidebarRightTabs', 'sidebarRight', 'shortcuts'];

/**
 * 本地兜底翻译器。
 *
 * `locale` 服务不可用时（服务没起来、命名空间被顶掉），标签仍要读得懂，
 * 而不是在界面上暴露 `trigger.label` 这种裸 key。用的是同一份中文字典，
 * 所以兜底文案不会与正式文案漂移。
 *
 * @returns `(key, params?) => string`。
 */
function createLocalTranslator() {
  const dict = createLocale().zh;
  return (key, params) => {
    const template = typeof dict[key] === 'string' ? dict[key] : key;
    if (params === undefined) return template;
    return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
  };
}

/** 采集一点启动环境信息，便于事后定位报告来自哪次启动。 */
function bootContext() {
  try {
    return {
      plugin: PLUGIN_ID,
      href: typeof globalThis.location?.href === 'string' ? globalThis.location.href : '',
      ua:
        typeof globalThis.navigator?.userAgent === 'string'
          ? globalThis.navigator.userAgent.slice(0, 160)
          : '',
    };
  } catch {
    return { plugin: PLUGIN_ID };
  }
}

/** 注册全部表面。**无论内部出什么错，本函数都不会向外抛异常。** */
export function apply(ctx) {
  /** 本次启动累积的失败记录；最后一次性写进 localStorage。 */
  const failures = [];

  // 插件配置卡片需要宿主 ctx：保存被拒时直接调 `remote.settings.mutate`
  // 把宿主原文原因捞出来（内核 `SettingsFormModel.save()` 会把它丢掉）。
  // 交接口本身不会抛错，失败也不影响插件启动。
  guardStep(failures, 'settings-diagnostics', () => setPluginContext(ctx));

  try {
    applySources(ctx, failures);
  } catch (error) {
    // 兜底：applySources 内部已经逐步 guard 过，这里只防它自己出错。
    guardStep(failures, 'apply', () => {
      throw error;
    });
  } finally {
    guardStep(failures, 'report', () => writeBootReport(failures, bootContext()));
  }
}

/**
 * 逐个注册三个表面。
 *
 * 每个表面一条独立记录线：某一面接线失败只丢那一面，其余照常工作。
 *
 * @param ctx 客户端上下文。
 * @param failures 失败记录收集数组。
 */
function applySources(ctx, failures) {
  /* ── 0. 文案 ─────────────────────────────────────────────────────── */
  const localT = createLocalTranslator();
  const t =
    guardStep(failures, 'locale', () => {
      ctx.effect(() => ctx.locale.register(PLUGIN_ID, createLocale()), `${PLUGIN_ID}: copy`);
      return ctx.locale.bind(PLUGIN_ID);
    }) ?? localT;

  /* ── 0. 共享状态（三面共用，建不起来就没有后续） ─────────────────── */
  const shared = guardStep(failures, 'state', () => {
    const store = createDraftStore();
    const settings = createSettingsFace(ctx, () => store.notifySettings());
    const io = createDraftIO(ctx, settings);

    /**
     * 模式控制器：**先于**任何表面建立，因为 T 按钮、扩展输入框、设置卡片
     * 都读它。它的存储是 `localStorage`（用户对「T 干什么」的偏好，不是某次
     * 会话的草稿），所以是全局一份。
     */
    // 「原生输入框增强」两个开关：客户端存储（见 native-switches.js 的说明：
    // 该命名空间的宿主写入在本机被整体拒绝，这两个开关只影响浏览器侧行为）。
    const nativeSwitches = createNativeSwitches({
      storage: guardStep(failures, 'switch-storage', () => globalThis.localStorage) ?? undefined,
      // 策略没在客户端存过时，回退到宿主设置（可能来自 profile patch）。
      policyFallback: () => settings.get()?.extendedEnter,
    });
    guardStep(failures, 'native-switches:card', () => setNativeSwitches(nativeSwitches));

    const modes = createModeController({
      settings,
      storage: guardStep(failures, 'mode-storage', () => globalThis.localStorage) ?? undefined,
      switches: nativeSwitches,
    });

    /** Esc 监听的 dispose 集合（在 state 的 ctx.effect 清理里统一调用）。 */
    const escapeDisposers = [];

    /**
     * 扩展输入框控制器。
     *
     * 它要跟着「设置变化」与「模式切换」两个来源同步 DOM，所以两个订阅都挂上。
     * `sync` 内部幂等，重复调用无害。
     */
    // 扩展输入框的 min-height 规则只注入一次。注入失败只降级（css.js 自己兜住），
    // 后果是「切到扩展模式不展开」而不是崩页。
    injectStyle(`${PLUGIN_ID}/native-composer.css`, EXTENDED_CSS, PLUGIN_ID);

    const nativeComposer = createNativeComposer({
      onDegrade: (where, message) => {
        // 运行期降级也留痕：它同样属于「某个增强没生效」。
        guardStep(failures, `native-composer:${where}`, () => {
          throw new Error(message);
        });
      },
    });
    const syncComposer = () => {
      guardStep(failures, 'native-composer', () =>
        nativeComposer.sync(settings.get(), modes.get(), nativeSwitches),
      );
    };
    modes.subscribe(() => syncComposer());
    settings.subscribe(() => syncComposer());
    nativeSwitches.subscribe(() => syncComposer());

    /**
     * Esc 退回原生模式（用户 2026-10-16 要求）。
     *
     * 走 `modes.set('native')` 这**同一条状态通道** —— 于是广播会同时驱动
     * 扩展输入框收起、符号栏消失、以及 T 按钮角标重渲染（角标走 `hooks`
     * 快照源）。**不要在这里额外手工改一次角标**：两个状态源必然不同步，
     * 用户要的「图标状态同步更改」靠的就是走同一条通道。
     */
    guardStep(failures, 'escape-exit', () => {
      const doc = guardStep(failures, 'escape-exit:document', () => globalThis.document);
      if (doc === undefined || doc === null) return;
      const dispose = attachEscapeExit({
        doc,
        controller: modes,
        onExit: (from) => console.info(`[${PLUGIN_ID}] Esc 退出 ${from} 模式`),
      });
      if (typeof dispose === 'function') escapeDisposers.push(dispose);
    });

    /**
     * 语音转写（可选）。两个约束决定这里的形状：
     *  1. 语音插件可能晚于本插件加载，因此不能在 apply 时读一次；
     *  2. 插槽的 inject face 被渲染器**按对象身份缓存**，所以不能把 remote
     *     直接塞进 face——那会在第一次求值时冻成 undefined，之后再也不会变。
     * 用一个小快照 store 承载它，面板订阅该 store，出现/消失都能反映。
     */
    const speechStore = createSnapshotStore(undefined);
    if (typeof ctx.inject === 'function') {
      try {
        ctx.inject(['remote.speech'], (speechCtx) => {
          speechStore.set(speechCtx.remote?.speech);
          return () => speechStore.set(undefined);
        });
      } catch (error) {
        console.warn(`[${PLUGIN_ID}] 语音转写不可用（听写按钮不会出现）：`, error);
      }
    }

    ctx.effect(
      () => () => {
        for (const dispose of escapeDisposers.splice(0)) {
          try {
            dispose();
          } catch {
            // 单个取消失败不影响其余清理。
          }
        }
        nativeComposer.dispose();
        modes.dispose();
        store.dispose();
        io.dispose();
      },
      `${PLUGIN_ID}: state`,
    );

    return { store, settings, io, speechStore, modes, nativeComposer, syncComposer };
  });

  if (shared === undefined) {
    // 共享状态都建不起来，后面的表面没有可用的 face，直接收工。
    return;
  }

  // 首帧之后再同步一次：`apply` 时输入框通常还没挂上（会话还没渲染），
  // 而扩展输入框模式要求 `data-composer-seat` / `data-composer-input` 已经存在。
  // 用 rAF 而不是 setTimeout，让它在下一帧布局之后跑。
  guardStep(failures, 'native-composer:initial-sync', () => {
    const schedule = globalThis.requestAnimationFrame;
    if (typeof schedule === 'function') schedule(() => shared.syncComposer());
    else shared.syncComposer();
  });

  const face = () => ({ ...shared, t, bootFailures: failures });

  /**
   * 切换模式时同步「看得见的表面」。
   *
   * 两个方向都要管，用户 2026-10-16 报的 bug 就是只做了前者：
   *
   *  - **进入编辑器模式** → 打开面板 tab；
   *  - **离开编辑器模式** → **关掉面板 tab**。否则切到模式二（扩展输入框）
   *    之后右侧栏还挂着编辑器，两个增强同时占着地方，用户看到的是
   *    「切换到模式二没有自动关闭模式一的编辑器」。
   *
   * 关面板要按 dockkit 的 **tabId** 关，而不是我们的 `kind`：`closeIn(sessionId,
   * tabId)` 收的是 layout 记录里的 `id`。所以先 `screen()` 拿当前会话，
   * 再从 `tabsIn()` 里挑出 `kind === TAB_KIND` 的那条。
   *
   * 关掉面板**不会丢草稿**：草稿是 `store` 里的共享状态，切回来还在。
   */
  /**
   * 进入编辑器模式前，右侧栏**本来**是否已经展开。
   *
   * 只在「因为我们才展开」的情况下，离开时才有权把列收回去；用户自己开着
   * 侧栏时不该被我们擅自收起。`null` = 还没进入过编辑器模式。
   */
  let sidebarWasExpandedBeforeEditor = null;

  const applyModeSurfaces = (mode) => {
    guardStep(failures, 'mode-surfaces', () => {
      const right = ctx.sidebarRight;
      if (right === undefined || right === null) return;
      // `mounted` 是「屏幕上的会话」的可观察值（README「跨插件面」一节明确列出）。
      // 没有会话在屏幕上时下面这些命令会 throw，所以先自己判断并安静跳过——
      // 「还没渲染」不是失败，不该污染启动报告。
      const sessionId = right.mounted?.getSnapshot?.();
      if (sessionId === undefined) return;

      if (mode === 'editor') {
        // `openTab` 内部就是 `planSetExpanded(state, true)`（会展开整列）。
        // 先记下进入前的状态，离开时才知道该不该收回去。
        if (sidebarWasExpandedBeforeEditor === null) {
          sidebarWasExpandedBeforeEditor = right.isExpanded?.() === true;
        }
        right.openTab(TAB_KIND);
        return;
      }

      // ── 非编辑器模式：收掉我们自己的面板 ──────────────────────────
      //
      // ⚠️ **关 tab ≠ 收列**。README《默认页与关闭规则》原文：
      // 「（停靠面）最后一个 tab 还多带一条规则…**仅当**它是唯一停靠 tab 时，
      //   关闭才会连同整列一起收起」。
      // 而停靠面**永远不为空**（内核会自动填充引导页），所以我们的 tab 通常
      // 不是唯一的 —— `close(tabId)` 只关掉 tab，右侧栏那一列照样开着，
      // 用户看到的正是「编辑器关了、侧栏没关」。
      // 因此这里必须**自己**把列收回去。
      const tabs = right.tabsIn?.(sessionId) ?? [];
      for (const tab of tabs) {
        if (tab?.kind !== TAB_KIND) continue;
        right.close(tab.id);
      }
      // 只有「进入编辑器模式时才展开的」列才由我们收回去；
      // 用户本来就开着的侧栏保持不动。
      if (sidebarWasExpandedBeforeEditor === false && right.isExpanded?.() === true) {
        right.toggleExpanded();
      }
      sidebarWasExpandedBeforeEditor = null;
    });
  };

  // 模式的**唯一**副作用出口：订在这里，任何来源的变化都走同一条路径 ——
  // T 的循环、以及用户在设置卡片里关掉某个模式时的 reconcile（那时也必须把
  // 面板收掉，否则「关掉编辑器模式」后右侧栏还挂着编辑器）。
  // 同时把扩展输入框的 DOM 同步也挂上。
  guardStep(failures, 'mode-subscription', () => {
    ctx.effect(
      () =>
        shared.modes.subscribe((mode) => {
          shared.syncComposer();
          applyModeSurfaces(mode);
        }),
      `${PLUGIN_ID}: mode subscription`,
    );
  });

  /* ── 0. 快捷键 Ctrl+T：等价于点 T 控件 ──────────────────────────── */
  //
  // 用内核的 shortcuts 服务注册（**不要自己抢 keydown**）：它自带
  //   - 冲突检测（与内核/其它插件同键会拒绝注册，而不是两方都触发）；
  //   - 上下文判定（region: page/editable/terminal；modal）；
  //   - 「快捷键」设置页里可见、且用户可改键。
  //
  // ⚠️ region 必须包含 `editable`：用户就是在输入框里按的。缺了它，
  //    在 composer 里按 Ctrl+T 会被判成「不匹配」直接放过（静默不生效）。
  // ⚠️ 用 `primary` 而不是 `control`：primary 在 macOS 上映射 meta(Cmd)、
  //    其余平台映射 control —— 与内核既有命令（Ctrl/Cmd+/ 打开快捷键表）一致。
  guardStep(failures, 'shortcut:cycle-mode', () => {
    ctx.effect(
      () =>
        ctx.shortcuts.register({
          id: 'dsh-enhanced-prompt-editor.cycle-mode',
          label: () => t('trigger.label'),
          aliases: ['enhanced prompt editor', 'cycle mode', '切换输入框模式'],
          // ⚠️ **只能声明 desktop:*，绝对不能带 web:***。
          // 内核 `isWebBindingAllowed()` 对 web 端只放行三种组合
          // （primary+Slash / primary+Shift+Comma / primary+Shift+Period），
          // 单修饰键 + KeyT 会被判 unsupported-browser；而 register() 是
          // **逐组校验、任一组失败则整条命令注册失败**。
          // 实测踩过：带上 web:* 后整条命令被拒（启动报告里是
          // `Unsupported Web shortcut: ...cycle-mode`），Ctrl+T 于是落到
          // 内核「打开侧栏浏览器」的绑定上 —— 看起来像被内核占了，其实是自己没注册上。
          defaults: {
            'desktop:macos': { code: 'KeyT', modifiers: ['primary'] },
            'desktop:windows': { code: 'KeyT', modifiers: ['primary'] },
            'desktop:linux': { code: 'KeyT', modifiers: ['primary'] },
          },
          // 三个 region 全要：输入框（editable）/ 页面（page）/ 终端（terminal）
          regions: ['page', 'editable', 'terminal'],
          resolve: () => ({ status: 'handled', run: () => void shared.modes.cycle() }),
        }),
      `${PLUGIN_ID}: shortcut cycle-mode`,
    );
  });

  /* ── 1. 输入框工具行的 T 按钮 ─────────────────────────────────────── */
  guardStep(failures, 'composer-trigger', () => {
    ctx.slots.inject('conversation.input.left', () =>
      ctx.slots.register(
        {
          name: 'conversation.input.left',
          id: COMPOSER_SLOT_ID,
          order: 20,
          locale: PLUGIN_ID,
          /**
           * T 的三个动作来源都在这里给全：
           *  - `mode` / `next` / `canCycle` 由设置与当前模式算出（用于角标与提示）；
           *  - `cycle` 切换模式并按需打开面板。
           *
           * ⚠️ 这里**不再有** `open`：T 的语义已经变成「切换模式」，不再是
           * 「打开面板」。编辑器模式下切到该模式的动作本身就要打开面板。
           */
          /**
           * ⚠️ 这里**必须**用 `hooks` 传模式，不能传值。
           *
           * 插槽渲染器把 `inject()` 的返回值按 `(entry, binding)` 缓存进
           * WeakMap 且**永不失效**（内核 `cachedSessionInject`），所以
           * `mode: <当前值>` 会永久冻在第一帧——点 T 切了模式，角标不动。
           * `hooks` face 里的快照源会被渲染器绑成组件 prop `useMode()`，
           * 组件渲染期调用即拿到最新值并自动订阅（官方
           * `dsh-client-ui-settings-subagent` 正是这个形状）。
           *
           * `canCycle` / `next` 也依赖模式序列，同样走 hooks。
           */
          inject: () => ({
            ...face(),
            hooks: {
              mode: shared.modes.source,
              canCycle: shared.modes.canCycleSource,
            },
            next: () => nextModeOf(shared.modes),
            cycle: () => shared.modes.cycle(),
          }),
        },
        ComposerTrigger,
      ),
    );
  });

  /* ── 1b. 扩展输入框模式的符号行（悬浮在输入框上方） ──────────────── */
  //
  // 用户 2026-10-16 的需求演进（三次定位）：
  //   1. 「这个快捷行也加到模式二，就模式二的底部控件上面」
  //   2. 「模式二的快捷栏位置不对」—— 挂 `conversation.input.dock` 时它出现在
  //      **整张输入卡的上方**（卡外）。
  //   3. 「改到下面了 不对」—— 换 `conversation.composer.dock` 后跑到卡**下方**。
  //   最终明确：「**在输入框上方悬浮**」。
  //
  // ⚠️ 落点必须读内核源码定，不能凭名字猜。内核
  // `@deepseek-ai/dsh-client-ui-conversation` 的 InputBar 实测（0.2.1-rc.2；
  // alpha.2 时结论相同，升级后已复核）：
  //  - `composerStack` 的 children 顺序是
  //    `[HeroShell, heroWorkspaceRow, conversation.input.dock, inputBar]`
  //    → `input.dock` 在**整张卡之前**（卡外上方）。
  //  - `conversation.composer.dock` 渲染在 `.card` **之后**的 `div.dock` 里
  //    → 卡下方，与 ContextMeter（用量条）同排。
  //  - `.card` 内**第一个**子节点是
  //    `.overlayAnchor[data-composer-overlay]{height:0;position:absolute;inset:0 0 auto}`
  //    —— 一个零高度的绝对定位锚点，内部渲染 `conversation.input.overlay`，
  //    它就是为浮层准备的。挂这里 + `position:absolute` 能落在卡内，
  //    且**不占布局高度**（真·悬浮，不会把输入框顶下去）。
  //
  // 纵向位置由 `./floating-bar.js` 实测 `[data-input-scroll]` 的偏移决定，
  // 把它贴到输入区正上方；拿不到锚点时退化为普通一行，不会假装浮着。
  guardStep(failures, 'extended-bar', () => {
    ctx.slots.inject('conversation.input.overlay', () =>
      ctx.slots.register(
        {
          name: 'conversation.input.overlay',
          id: EXTENDED_BAR_SLOT_ID,
          order: 30,
          locale: PLUGIN_ID,
          /**
           * 什么时候显示这条 deck：
           *  - **扩展输入框模式**：显示（含行号沟槽与加高）；
           *  - **原生模式 + 设置里勾了「原生应用悬浮 deck」**：也显示，
           *    但**不带**行号沟槽、不改原生外观（靠下面那个 `extended` 源区分）。
           *
           * ⚠️ 与 T 按钮同理：插槽渲染器把 `inject()` 的结果缓存进 WeakMap 且
           * **永不失效**，所以「当前模式」必须走 `hooks` 快照源，不能传值 ——
           * 否则切回原生后这条还会一直挂着。
           */
          inject: () => ({
            t,
            hooks: {
              // deck 可见性 = 扩展模式 或（原生模式 且 nativeDeck 已勾选）。
              visible: shared.modes.deckSource,
              // 行号沟槽 / 隔行底色只属于扩展模式，所以**另给**一个源。
              extended: shared.modes.extendedSource,
            },
            // 定位逻辑与符号栏分开：FloatingSymbolBar 负责「挂在哪、怎么浮」，
            // ExtendedSymbolBar 只管「有哪些按钮、点了做什么」。
            Inner: ExtendedSymbolBar,
          }),
        },
        FloatingSymbolBar,
      ),
    );
  });

  /* ── 2. 右侧栏 tab：类型 + 正文 + 标题 ───────────────────────────── */
  // 正文与标题注册在该 type 的生命周期内：类型被撤掉时它们一起走，
  // 不会留下渲染不出来的孤儿插槽。注册到一半失败时先把已拿到的
  // disposer 退掉再抛，由 guardStep 记录，避免半成品条目挂在那里。
  guardStep(failures, 'sidebar-tab', () => {
    ctx.effect(() => {
      const disposers = [];
      try {
        disposers.push(
          ctx.sidebarRightTabs.register({
            id: PLUGIN_ID,
            kind: TAB_KIND,
            priority: 'extension',
            title: () => t('panel.title'),
            guide: [
              {
                id: 'compose',
                order: 30,
                title: () => t('panel.title'),
                description: () => t('panel.guide'),
              },
            ],
          }),
        );

        disposers.push(
          ctx.slots.inject('sidebar.right.pane.tab', () =>
            ctx.slots.register(
              {
                name: 'sidebar.right.pane.tab',
                key: PLUGIN_ID,
                locale: PLUGIN_ID,
                inject: (sessionId) => ({ ...face(), sessionId }),
              },
              PanelBody,
            ),
          ),
        );

        disposers.push(
          ctx.slots.inject('sidebar.right.pane.tab.title', () =>
            ctx.slots.register(
              {
                name: 'sidebar.right.pane.tab.title',
                key: PLUGIN_ID,
                locale: PLUGIN_ID,
                inject: () => ({ store: shared.store }),
              },
              PanelTitle,
            ),
          ),
        );
      } catch (error) {
        for (const dispose of disposers.reverse()) {
          try {
            dispose();
          } catch {
            // 回滚失败不影响真正的失败原因，交给下面的 rethrow。
          }
        }
        throw error;
      }

      return () => {
        for (const dispose of disposers.reverse()) {
          try {
            dispose();
          } catch (error) {
            console.error(`[${PLUGIN_ID}] 卸载右侧栏 tab 失败：`, error);
          }
        }
      };
    }, `${PLUGIN_ID}: sidebar tab`);
  });

  /* ── 3. 插件详情页的设置卡片 ─────────────────────────────────────── */
  //
  // ⚠️ 注册到 `plugins.bundle.config`（**key = 插件包名**），不是 `settings.section`，
  // 也不是 `plugins.item`。
  //
  // 用户 2026-10-15 定的规则（权威原句见
  // `dsh-client-ui-plugin-manager/README.zh.md`）：「注册了配置页的插件在这里、
  // 在它自己的页面上编辑；设置里只保留只读的插件列表」——所以要注册到「插件」页。
  //
  // ⚠️ 但「插件」页里分**两组**，用两个不同插槽。2026-10-16 读内核源码
  // （`dsh-client-ui-plugin-manager/lib/client.js`）核实：
  //   const mine = listed.filter((pkg) => !pkg.official);          // 第三方包
  //   renderGroup("bundles", t("bundlesTitle"), mine.map(packageCard));
  //   renderGroup("basic",   t("basicTitle"),   basicCards);       // 官方包
  // 两个分组标题分别是「已安装插件」与「内置插件配置」。
  //
  //   - 第三方包 → PackageCard → PackageDetail
  //     → renderSlot("plugins.bundle.config", { view: "page" }, { entryKey: pkg.name })
  //     门控：`configured: ledger.bundles.has(openPkg.name)` —— **key 必须是包名**。
  //   - 官方包 → ItemCard → ItemDetail
  //     → renderSlot("plugins.item", { view: "page" }, { only: item.id })
  //     内核注释原文：*"An official plugin's page"*。
  //
  // 本插件是第三方包（`mine` 那一组），所以必须用 `plugins.bundle.config`。
  // ⚠️ 若注册到 `plugins.item`，会落进**「内置插件配置」**分组（`ItemCard` 只遍历
  // `ledger.items`），用户实测反馈过这个错位。
  // `~/Projects/dsh-plugin-standards/docs/UI-STANDARDS.md` 与 skill 里写的
  // `plugins.item` 是**过时建议**，以内核源码为准。
  guardStep(failures, 'plugin-card', () => {
    const registerCard = () =>
      ctx.slots.inject('plugins.bundle.config', () =>
        ctx.slots.register(
          {
            name: 'plugins.bundle.config',
            // keyed 槽：key = 插件包名，必须与 `package.json` 的 name 完全一致。
            // 写错的表现是**静默不渲染** —— 内核用 `ledger.bundles.has(pkg.name)`
            // 判断「这个包有没有自带配置页」，对不上就当作没有，不报错。
            key: PLUGIN_ID,
            order: 40,
            label: () => t('settings.title'),
            locale: PLUGIN_ID,
            // `bootFailures` 是 apply 期间就地累积的数组：卡片渲染时 boot 早已
            // 结束，所以读到的必然是本轮完整结果（比再读一次存储更可靠——
            // 这个 inject 回调可能在 apply 中途就被同步执行）。
            //
            // `scope` 是共享的配置表单（`configForms.get(<entry id>)`）；拿不到
            // 时卡片自己渲染只读提示，不会抛错。
            inject: () => ({ t, scope: shared.settings.formScope(), bootFailures: failures }),
          },
          PluginCard,
        ),
      );

    /**
     * `configForms` 是可选服务（用 `ctx.get` 探测，见 `settings-face.js`）。
     * 它可用时，用 `whileServed([NS], …)` 跟着「该命名空间是否被宿主服务」
     * 的边沿走：命名空间迟到时才注册卡片，那时 `formScope()` 必定已经能拿到
     * 真正的表单——**不能**在 `apply` 时读一次就定死（官方
     * `dsh-client-ui-settings-subagent` 正是这个形状，本机
     * `dsh-connect-workbuddy` 的 4.3.0 缺陷就是没这么做）。
     *
     * `configForms` 不可用（非 Web 组合）时直接注册，卡片会自己渲染只读提示。
     */
    const forms = guardStep(failures, 'plugin-card:config-forms', () => ctx.get?.('configForms'));
    if (typeof forms?.whileServed === 'function') {
      ctx.effect(
        () => forms.whileServed([SETTINGS_NAMESPACE], () => registerCard()),
        `${PLUGIN_ID}: plugin card`,
      );
    } else {
      registerCard();
    }
  });
}

/**
 * 算出「下一个模式」（只用于按钮提示文案，不产生副作用）。
 *
 * 与 `mode-controller.cycle()` 共用同一套规则，但**不写存储**：提示文案不该
 * 改变状态。
 */
function nextModeOf(controller) {
  return nextMode(controller.get(), controller.modes());
}
