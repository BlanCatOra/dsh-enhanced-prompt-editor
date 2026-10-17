/**
 * dsh-enhanced-prompt-editor —— 浏览器侧 bundle。
 *
 * 本文件由 build-client.mjs 从 src/ 生成，请勿手改；改 src/ 后重新运行：
 *   node build-client.mjs
 */

window.__ModuleLoader__.load({
	id: "dsh-enhanced-prompt-editor",
	factory: (require) => {
		var __dshRegistry = new Map();
		var __dshCache = new Map();
		/** 宿主基座模块（react 等）由外壳的冻结模块表提供。 */
		function __dshExternal(name) { return require(name); }
		/** 按模块键懒加载；每个模块只执行一次。 */
		function __dshRequire(key) {
			key = key.replace(/^\.\//, "");
			if (__dshCache.has(key)) return __dshCache.get(key);
			var factory = __dshRegistry.get(key);
			if (factory === undefined) throw new Error("dsh-enhanced-prompt-editor: unknown module " + key);
			var exports = {};
			__dshCache.set(key, exports);
			factory(exports);
			return exports;
		}
		__dshRegistry.set("constants.js", (__exports) => {
			var module = { exports: __exports };
			/**
			 * dsh-enhanced-prompt-editor —— 共享常量与纯函数。
			 *
			 * 这一层不 import 任何 DSH 包，浏览器与 Node 都能加载，因此设置 schema、
			 * 客户端面板和单元测试可以共用同一份规则，不会出现两份实现漂移。
			 *
			 * @module dsh-enhanced-prompt-editor/constants
			 */

			/** 设置文档命名空间（设置页与该命名空间一一对应）。 */
			const SETTINGS_NAMESPACE = 'dsh-enhanced-prompt-editor';

			/** 插槽/类型身份。 */
			const PLUGIN_ID = 'dsh-enhanced-prompt-editor';
			const TAB_KIND = 'enhanced-prompt-editor';
			const COMPOSER_SLOT_ID = 'dsh-enhanced-prompt-editor-trigger';

			/**
			 * 扩展输入框模式那条符号行的插槽 id。
			 *
			 * 同样必须是**自有 id**：list/keyed 槽里复用别人的 id 会顶掉对方的格子
			 *（去重键是 id，不是注册者身份）。
			 */
			const EXTENDED_BAR_SLOT_ID = `${PLUGIN_ID}-extended-bar`;
			const TAB_BODY_KEY = PLUGIN_ID;

			/**
			 * 存储方式。
			 * - `workspace`：写成工作区里的 .md 文件，可多份、可被内置文件阅读器打开。
			 * - `browser`：浏览器 localStorage 单份草稿。
			 * - `none`：不持久化。
			 */
			const STORAGE_MODES = ['workspace', 'browser', 'none'];

			/** 回车键语义：回车是换行还是发送。 */
			const ENTER_MODES = ['newline', 'send'];

			/** 面板默认高度（px）与允许区间。 */
			const DEFAULT_PANEL_HEIGHT = 420;
			const MIN_PANEL_HEIGHT = 180;
			const MAX_PANEL_HEIGHT = 1400;

			/**
			 * 编辑区字号（px）与允许区间。
			 *
			 * 用户 2026-10-16：「字号 图标没有大小设置 我觉得有点小」。做成设置项而不是
			 * 写死，因为「有点小」的感受依赖屏幕与视力，只有用户自己知道合适值。
			 */
			const DEFAULT_EDITOR_FONT_SIZE = 16;
			const MIN_EDITOR_FONT_SIZE = 11;
			const MAX_EDITOR_FONT_SIZE = 28;

			/**
			 * 编辑区行高（px），**必须是整数**。
			 *
			 * ⚠️ 2026-10-16 实测教训：原来用 `line-height:1.7em`，16px 下 = **27.2px**。
			 * 小数行高让渐变周期（2 × 27.2 = 54.4px）落不到整数像素上，光栅化把相邻的
			 * 条纹带抹成 27px / 28px 交错，周期在 54/55 之间摆动 —— 用户看到的就是
			 * 「某一条条纹带比别的窄」，反复报「第二行比第一三行矮」。
			 *
			 * 取整后每条带严格相等。1.7 倍是视觉上舒服的行距，四舍五入到整数像素不改变观感。
			 * 行号 gutter 与编辑区必须共用这个值，否则两者会逐行错开。
			 */
			function lineHeightFor(fontSize) {
			  const size = Number.isFinite(fontSize) ? fontSize : DEFAULT_EDITOR_FONT_SIZE;
			  const clamped = Math.min(MAX_EDITOR_FONT_SIZE, Math.max(MIN_EDITOR_FONT_SIZE, size));
			  return Math.round(clamped * 1.7);
			}

			/** 默认行高（默认字号下），给 CSS 兜底值用。 */
			const DEFAULT_LINE_HEIGHT = lineHeightFor(DEFAULT_EDITOR_FONT_SIZE);

			/** 快捷键行按钮的图标/文字缩放（相对基准的百分比）与区间。 */
			const DEFAULT_KEY_SIZE = 100;
			const MIN_KEY_SIZE = 80;
			const MAX_KEY_SIZE = 180;

			/* ── 三种工作模式 ───────────────────────────────────────────────────
			 *
			 * 用户 2026-10-16 定：两种增强模式 + 原生兜底。
			 *   - `editor`   —— 编辑器模式：工具行 T 按钮打开右侧栏 Markdown 面板；
			 *   - `extended` —— 扩展输入框模式：DSH 原生输入框向上变高，并单独控制 Enter；
			 *   - `native`   —— 原生：两个增强都不生效，T 按钮变暗只作状态指示。
			 *
			 * `native` **不可勾选、也不参与排序**，它永远是循环的最后一站：两个增强模式
			 * 都关掉时 T 就没有可切换的目标了，此时保留一个明确的「原生」态比把按钮
			 * 藏起来更可解释（用户明确选择这个方案）。
			 */
			const MODES = ['editor', 'extended', 'native'];

			/** 可被用户在设置里勾选/排序的模式（原生不在其中）。 */
			const TOGGLEABLE_MODES = ['editor', 'extended'];

			/**
			 * 扩展输入框模式下裸回车的策略。
			 *
			 * 只有两项，因为 DSH 原生**没有**「Enter 是换行还是发送」这一设置：实测
			 * `dsh-client-ui-conversation` 的设置命名空间（`ui-conversation`）只有
			 * `busyEnter` 一个字段，管的是**忙碌时** Enter 走 queue 还是 steer，与
			 * 「换行」无关。也就是说原生裸回车恒为发送。所以「自由决定」实际是二选一：
			 *   - `inherit` —— 跟随 DSH：Enter 发送，{send} 换行；
			 *   - `newline` —— Enter 换行，{send} 才发送（本插件为扩展输入框新加的能力）。
			 */
			const EXTENDED_ENTER_POLICIES = ['inherit', 'newline'];

			/** 扩展输入框高度（px）默认值与允许区间。 */
			const DEFAULT_EXTENDED_HEIGHT = 640;
			const MIN_EXTENDED_HEIGHT = 240;
			const MAX_EXTENDED_HEIGHT = 2000;

			/** 把高度夹进扩展输入框的允许区间；非数字退回默认值。 */
			function clampExtendedHeight(value) {
			  const n = typeof value === 'number' ? value : Number(value);
			  if (!Number.isFinite(n)) return DEFAULT_EXTENDED_HEIGHT;
			  return Math.min(MAX_EXTENDED_HEIGHT, Math.max(MIN_EXTENDED_HEIGHT, Math.round(n)));
			}

			/** 把任意输入收敛到受支持的扩展输入框 Enter 策略。 */
			function normalizeExtendedEnter(value) {
			  return EXTENDED_ENTER_POLICIES.includes(value) ? value : 'inherit';
			}

			/** 把任意输入收敛到一个受支持的模式。 */
			function normalizeMode(value) {
			  return MODES.includes(value) ? value : 'native';
			}

			/**
			 * 算出参与 T 循环的模式序列。
			 *
			 * @param config 形如 `{ modeEditor, modeExtended, editorFirst }` 的设置。
			 * @returns 模式数组；两个增强都关掉时返回 `['native']`。
			 */
			function cycleModes(config) {
			  const source = config !== null && typeof config === 'object' ? config : {};
			  const enabled = [];
			  if (source.modeEditor !== false) enabled.push('editor');
			  if (source.modeExtended !== false) enabled.push('extended');
			  // `editorFirst` 是「谁排前面」的开关，与「谁被启用」正交：只对两个都启用
			  // 时有意义。两个都启用时按设置排序，否则顺序本来就唯一。
			  if (enabled.length === 2 && source.editorFirst === false) enabled.reverse();
			  return enabled;
			}

			/**
			 * 循环到下一个模式。
			 *
			 * 序列 = 已勾选的增强模式（按设置排序）+ 末尾的原生兜底。当前模式不在序列里
			 * （设置刚被改过）时落到序列第一项，这样 T 的表现始终是「切到下一个可用模式」，
			 * 而不是卡在一个已经不可用的状态上。
			 *
			 * @param current 当前模式。
			 * @param modes `cycleModes()` 的结果。
			 * @returns 下一个模式。
			 */
			function nextMode(current, modes) {
			  const stops = Array.isArray(modes) && modes.length > 0 ? [...modes, 'native'] : ['native'];
			  const at = stops.indexOf(normalizeMode(current));
			  if (at < 0) return stops[0];
			  return stops[(at + 1) % stops.length];
			}

			/**
			 * 判断扩展输入框模式下的 Enter 应把裸回车改成什么。
			 *
			 * 只回答「裸回车」（无 Shift/Ctrl/Alt/Meta）这一种情况；其余组合键一律交给
			 * 宿主原生处理（Shift+Enter 本来就是换行，Ctrl/Cmd+Enter 本来就是发送/转向）。
			 *
			 * @param event 键事件形状。
			 * @param policy 当前 `extendedEnter` 策略。
			 * @returns 'newline' 表示要改写成换行，null 表示不拦截。
			 */
			function resolveExtendedEnter(event, policy) {
			  if (event === undefined || event === null) return null;
			  if (event.isComposing === true || event.keyCode === 229) return null;
			  // 只处理 Windows/Mac 上真正是「Enter」的那两个 code；NumpadEnter 同样算。
			  const isEnter = event.key === 'Enter' || event.code === 'Enter' || event.code === 'NumpadEnter';
			  if (!isEnter) return null;
			  // 带任何修饰键的组合都保留宿主语义：Shift+Enter 换行、Ctrl/Cmd+Enter 发送。
			  if (event.shiftKey === true || event.ctrlKey === true || event.metaKey === true || event.altKey === true) {
			    return null;
			  }
			  return normalizeExtendedEnter(policy) === 'newline' ? 'newline' : null;
			}

			/** 单个草稿允许的最大字符数（防止把整本书塞进设置/文件）。 */
			const MAX_DRAFT_CHARS = 200000;

			/** 落盘文件名的允许形状：字母数字、下划线、连字符、点、CJK，1-80 字符。 */
			const SAFE_NAME_RE = /^[\p{L}\p{N}._-]{1,80}$/u;

			/**
			 * 规范化一个草稿文件名（不含扩展名）。
			 *
			 * 空、超长、含路径分隔符或控制字符的输入一律退回 `draft`，因此调用方
			 * 永远拿到一个可以安全拼进目录名的片段，不需要在写入前再检查一次。
			 *
			 * @param value 用户输入的原始名字。
			 * @returns 安全的文件名词干。
			 */
			function safeDraftName(value) {
			  const raw = typeof value === 'string' ? value.trim() : '';
			  const withoutExt = raw.replace(/\.md$/i, '');
			  if (withoutExt === '') return 'draft';
			  if (!SAFE_NAME_RE.test(withoutExt)) return 'draft';
			  // `.` 与 `..` 是目录遍历，必须挡掉。
			  if (withoutExt === '.' || withoutExt === '..') return 'draft';
			  return withoutExt;
			}

			/** 规范化落盘目录：去掉首尾斜杠，拒绝 `..` 段。 */
			function safeDraftDir(value) {
			  const raw = typeof value === 'string' ? value.trim() : '';
			  if (raw === '') return '.dsh/prompts';
			  const normalized = raw.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
			  const segments = normalized.split('/').filter((s) => s !== '' && s !== '.');
			  if (segments.length === 0 || segments.some((s) => s === '..')) return '.dsh/prompts';
			  return segments.join('/');
			}

			/** 把一个高度夹进允许区间；非数字退回默认值。 */
			function clampPanelHeight(value) {
			  const n = typeof value === 'number' ? value : Number(value);
			  if (!Number.isFinite(n)) return DEFAULT_PANEL_HEIGHT;
			  return Math.min(MAX_PANEL_HEIGHT, Math.max(MIN_PANEL_HEIGHT, Math.round(n)));
			}

			/** 把编辑区字号夹进允许区间；非数字退回默认值。 */
			function clampEditorFontSize(value) {
			  const n = typeof value === 'number' ? value : Number(value);
			  if (!Number.isFinite(n)) return DEFAULT_EDITOR_FONT_SIZE;
			  return Math.min(MAX_EDITOR_FONT_SIZE, Math.max(MIN_EDITOR_FONT_SIZE, Math.round(n)));
			}

			/** 把快捷键行缩放夹进允许区间；非数字退回默认值。 */
			function clampKeySize(value) {
			  const n = typeof value === 'number' ? value : Number(value);
			  if (!Number.isFinite(n)) return DEFAULT_KEY_SIZE;
			  return Math.min(MAX_KEY_SIZE, Math.max(MIN_KEY_SIZE, Math.round(n)));
			}

			/** 把任意输入收敛到受支持的存储方式。 */
			function normalizeStorageMode(value) {
			  return STORAGE_MODES.includes(value) ? value : 'workspace';
			}

			/** 把任意输入收敛到受支持的回车语义。 */
			function normalizeEnterMode(value) {
			  return ENTER_MODES.includes(value) ? value : 'newline';
			}

			/**
			 * 判断一次按键应触发发送还是换行。
			 *
			 * 规则：把「主修饰键 + Enter」视为发收入口，方向由 `enterMode` 决定。
			 * `enterMode: 'newline'`（默认）时回车换行、Cmd/Ctrl+Enter 发送；
			 * `enterMode: 'send'` 时回车发送、Cmd/Ctrl+Enter 换行。
			 *
			 * 输入法组合期间的回车永远不发送——那是候选词确认，交还浏览器。
			 *
			 * @param event 键事件形状（至少要 code / key / modifier 标记）。
			 * @param enterMode 当前回车语义。
			 * @returns 'send' | 'newline' | null，null 表示不拦截。
			 */
			function resolveEnterAction(event, enterMode) {
			  if (event === undefined || event === null) return null;
			  if (event.isComposing === true || event.keyCode === 229) return null;
			  const isEnter = event.key === 'Enter' || event.code === 'Enter' || event.code === 'NumpadEnter';
			  if (!isEnter) return null;
			  // Shift+Enter 在任何模式下都是换行，这是编辑器的通行约定。
			  if (event.shiftKey === true) return 'newline';
			  const primary = event.metaKey === true || event.ctrlKey === true;
			  const mode = normalizeEnterMode(enterMode);
			  if (primary) return mode === 'newline' ? 'send' : 'newline';
			  return mode === 'newline' ? 'newline' : 'send';
			}

			/** 面板标题：取草稿第一行非空内容，过长则截断。 */
			function draftTitleOf(text, fallback = 'Prompt') {
			  if (typeof text !== 'string') return fallback;
			  for (const line of text.split('\n')) {
			    const trimmed = line.trim();
			    if (trimmed === '') continue;
			    const plain = trimmed.replace(/^#+\s*/, '');
			    if (plain === '') continue;
			    return plain.length > 42 ? `${plain.slice(0, 42)}…` : plain;
			  }
			  return fallback;
			}

			/** 默认设置（设置服务的 base，也是设置页在缺失字段时的兜底）。 */
			function defaultSettings(config) {
			  // 调用方可能传 null / 非对象（未配置、解析失败），这必须当成「全默认」，
			  // 而不是抛错——读不到设置的插件不该让页面挂掉。
			  const source = config !== null && typeof config === 'object' ? config : {};
			  return {
			    storage: normalizeStorageMode(source.storage),
			    dir: safeDraftDir(source.dir),
			    enterMode: normalizeEnterMode(source.enterMode),
			    panelHeight: clampPanelHeight(source.panelHeight),
			    editorFontSize: clampEditorFontSize(source.editorFontSize),
			    keySize: clampKeySize(source.keySize),
			    browseWithReader: source.browseWithReader !== false,
			    dictate: source.dictate !== false,
			    /** 是否启用「编辑器模式」（工具行 T 打开右侧栏面板）。 */
			    modeEditor: source.modeEditor !== false,
			    /** 是否启用「扩展输入框模式」（原生输入框向上变高）。 */
			    modeExtended: source.modeExtended !== false,
			    /** 两种模式都启用时谁排在前面：true = 编辑器优先。 */
			    editorFirst: source.editorFirst !== false,
			    /** 扩展输入框模式下裸回车的策略。 */
			    extendedEnter: normalizeExtendedEnter(source.extendedEnter),
			    /** 扩展输入框的高度（px）。 */
			    extendedHeight: clampExtendedHeight(source.extendedHeight),
			    /**
			     * 是否在**原生模式**的输入框上应用悬浮 deck（符号/缩进工具条）。
			     *
			     * 默认 **false**：原生模式保持原生外观，除非用户显式勾选。
			     */
			    nativeDeck: source.nativeDeck === true,
			    /**
			     * 是否在**原生模式**的输入框上启用「高级回车」设置。
			     *
			     * 复用 `extendedEnter` 那份策略（原生模式下常见的选择是 `newline`：
			     * 回车换行、发送键发送）。默认 **false**：原生模式保持 DSH 原生回车语义。
			     */
			    nativeEnter: source.nativeEnter === true,
			  };
			}


			Object.assign(__exports, { "SETTINGS_NAMESPACE": SETTINGS_NAMESPACE, "PLUGIN_ID": PLUGIN_ID, "TAB_KIND": TAB_KIND, "COMPOSER_SLOT_ID": COMPOSER_SLOT_ID, "EXTENDED_BAR_SLOT_ID": EXTENDED_BAR_SLOT_ID, "TAB_BODY_KEY": TAB_BODY_KEY, "STORAGE_MODES": STORAGE_MODES, "ENTER_MODES": ENTER_MODES, "DEFAULT_PANEL_HEIGHT": DEFAULT_PANEL_HEIGHT, "MIN_PANEL_HEIGHT": MIN_PANEL_HEIGHT, "MAX_PANEL_HEIGHT": MAX_PANEL_HEIGHT, "DEFAULT_EDITOR_FONT_SIZE": DEFAULT_EDITOR_FONT_SIZE, "MIN_EDITOR_FONT_SIZE": MIN_EDITOR_FONT_SIZE, "MAX_EDITOR_FONT_SIZE": MAX_EDITOR_FONT_SIZE, "lineHeightFor": lineHeightFor, "DEFAULT_LINE_HEIGHT": DEFAULT_LINE_HEIGHT, "DEFAULT_KEY_SIZE": DEFAULT_KEY_SIZE, "MIN_KEY_SIZE": MIN_KEY_SIZE, "MAX_KEY_SIZE": MAX_KEY_SIZE, "MODES": MODES, "TOGGLEABLE_MODES": TOGGLEABLE_MODES, "EXTENDED_ENTER_POLICIES": EXTENDED_ENTER_POLICIES, "DEFAULT_EXTENDED_HEIGHT": DEFAULT_EXTENDED_HEIGHT, "MIN_EXTENDED_HEIGHT": MIN_EXTENDED_HEIGHT, "MAX_EXTENDED_HEIGHT": MAX_EXTENDED_HEIGHT, "clampExtendedHeight": clampExtendedHeight, "normalizeExtendedEnter": normalizeExtendedEnter, "normalizeMode": normalizeMode, "cycleModes": cycleModes, "nextMode": nextMode, "resolveExtendedEnter": resolveExtendedEnter, "MAX_DRAFT_CHARS": MAX_DRAFT_CHARS, "safeDraftName": safeDraftName, "safeDraftDir": safeDraftDir, "clampPanelHeight": clampPanelHeight, "clampEditorFontSize": clampEditorFontSize, "clampKeySize": clampKeySize, "normalizeStorageMode": normalizeStorageMode, "normalizeEnterMode": normalizeEnterMode, "resolveEnterAction": resolveEnterAction, "draftTitleOf": draftTitleOf, "defaultSettings": defaultSettings });
		});
		__dshRegistry.set("store.js", (__exports) => {
			var module = { exports: __exports };
			/**
			 * dsh-enhanced-prompt-editor —— 跨表面共享的草稿状态。
			 *
			 * 三个表面（工具行按钮、右侧栏面板、设置页）读写同一份状态，因此这里用
			 * 一个极小的快照 store：`getSnapshot` 返回稳定引用、`subscribe` 在变更后
			 * 通知。这与 DSH 自己 `createSnapshotStore` 的契约一致，因此可以直接喂给
			 * 那些期望该契约的宿主钩子。
			 *
			 * @module dsh-enhanced-prompt-editor/store
			 */
			const { MAX_DRAFT_CHARS } = __dshRequire("./constants.js");

			/** 创建一个快照 store。 */
			function createSnapshotStore(initial) {
			  let snapshot = initial;
			  const listeners = new Set();
			  return {
			    getSnapshot: () => snapshot,
			    subscribe(listener) {
			      listeners.add(listener);
			      return () => listeners.delete(listener);
			    },
			    set(next) {
			      if (Object.is(next, snapshot)) return;
			      snapshot = next;
			      for (const listener of [...listeners]) listener();
			    },
			  };
			}

			/** 会话级草稿状态：每会话一条草稿、一份保存状态。 */
			function createDraftStore() {
			  const sessions = new Map();
			  const store = createSnapshotStore({ revision: 0, bySession: {} });
			  let disposed = false;

			  const publish = () => {
			    if (disposed) return;
			    const bySession = {};
			    for (const [sessionId, state] of sessions) bySession[sessionId] = state;
			    store.set({ revision: store.getSnapshot().revision + 1, bySession });
			  };

			  /** 取（或初始化）某会话的状态。 */
			  const of = (sessionId) => {
			    const key = typeof sessionId === 'string' && sessionId !== '' ? sessionId : '__none__';
			    let state = sessions.get(key);
			    if (state === undefined) {
			      state = {
			        text: '',
			        /** 面板当前打开的草稿名（null 表示还没落盘过）。 */
			        name: null,
			        /** 落盘后的绝对路径，用于「用阅读器打开」。 */
			        path: null,
			        /** 'idle' | 'saving' | 'saved' | 'error'。 */
			        status: 'idle',
			        error: null,
			        /** 已存在的草稿列表（storage=workspace 时由 Host 路由返回）。 */
			        drafts: [],
			        /** 面板高度（设置页可改，这里持有本会话的临时覆盖）。 */
			        height: null,
			      };
			      sessions.set(key, state);
			    }
			    return state;
			  };

			  return {
			    /** 供宿主钩子使用：整个 store 的快照面。 */
			    snapshot: {
			      getSnapshot: store.getSnapshot,
			      subscribe: store.subscribe,
			    },
			    /** 读某会话状态（稳定引用）。 */
			    of,
			    /** 局部更新某会话状态并通知。 */
			    patch(sessionId, patch) {
			      const state = of(sessionId);
			      Object.assign(state, patch);
			      publish();
			    },
			    /** 追加文本（听写用），并保证不超上限。 */
			    append(sessionId, text) {
			      const state = of(sessionId);
			      const next = `${state.text}${text}`.slice(0, MAX_DRAFT_CHARS);
			      state.text = next;
			      publish();
			      return next;
			    },
			    /** 整体替换文本。 */
			    setText(sessionId, text) {
			      const state = of(sessionId);
			      state.text = typeof text === 'string' ? text.slice(0, MAX_DRAFT_CHARS) : '';
			      publish();
			      return state.text;
			    },
			    /** 配置变更后触发一次渲染（值本身由 settings face 持有）。 */
			    notifySettings: publish,
			    /** 丢弃某会话状态。 */
			    forget(sessionId) {
			      sessions.delete(sessionId);
			      publish();
			    },
			    dispose() {
			      disposed = true;
			      sessions.clear();
			    },
			  };
			}

			Object.assign(__exports, { "createSnapshotStore": createSnapshotStore, "createDraftStore": createDraftStore });
		});
		__dshRegistry.set("io.js", (__exports) => {
			var module = { exports: __exports };
			/**
			 * dsh-enhanced-prompt-editor —— 草稿读写与发送。
			 *
			 * 三条出路：
			 *  - **落盘**：走本插件 Host 侧的 `/_dsh` 路由写工作区 .md（DSH 自带的
			 *    workspace-files Remote 只有读）；
			 *  - **浏览器**：localStorage 单份草稿；
			 *  - **发送**：经 `inputActions.setDraft` + `submit` 进会话。
			 *
			 * 所有网络调用都先做能力检查；路由不存在时降级为「仅浏览器」，并且把原因
			 * 留在状态里让界面显示，而不是静默失败。
			 *
			 * @module dsh-enhanced-prompt-editor/io
			 */
			const { MAX_DRAFT_CHARS } = __dshRequire("./constants.js");
			const { draftTitleOf } = __dshRequire("./constants.js");

			/** 本插件 Host 路由前缀。 */
			const ROUTE_BASE = '/plugins/dsh-enhanced-prompt-editor';
			const DRAFT_ROUTE = `${ROUTE_BASE}/draft`;
			const DRAFTS_ROUTE = `${ROUTE_BASE}/drafts`;

			const LOCAL_KEY = 'dsh.enhancedPromptEditor.draft';

			/**
			 * 创建 I/O 面。
			 *
			 * @param ctx 客户端上下文（用来拿 sidebarRight 等）。
			 * @param settings 设置面。
			 */
			function createDraftIO(ctx, settings) {
			  const controllers = new Set();

			  const track = (controller) => {
			    controllers.add(controller);
			    return () => controllers.delete(controller);
			  };

			  return {
			    /** 读会话工作区根：标准的 `useSessions` 选择器形状。 */
			    cwd: (useSessions, sessionId) => {
			      if (typeof useSessions !== 'function' || typeof sessionId !== 'string' || sessionId === '') return undefined;
			      try {
			        const value = useSessions((snapshot) => snapshot?.byId?.[sessionId]?.cwd);
			        return typeof value === 'string' && value !== '' ? value : undefined;
			      } catch {
			        return undefined;
			      }
			    },

			    /**
			     * 用内置文件阅读器打开落盘的草稿。
			     *
			     * @param sessionId 会话。
			     * @param address `dsh-resource://file/...` 地址。
			     */
			    openInReader(sessionId, address) {
			      try {
			        ctx.sidebarRight.openResource(address, { revealIfOpened: false });
			      } catch (error) {
			        console.error('[dsh-enhanced-prompt-editor] 无法用阅读器打开：', error);
			      }
			    },

			    /**
			     * 把草稿写到工作区。
			     *
			     * @param args.sessionId 会话。
			     * @param args.cwd 工作区根（绝对路径）。
			     * @param args.dir 相对目录。
			     * @param args.name 草稿名。
			     * @param args.text 内容。
			     * @param args.signal 取消信号。
			     * @returns `{ path, rel }`。
			     */
			    async save({ sessionId, cwd, dir, name, text, signal }) {
			      const response = await fetch(DRAFT_ROUTE, {
			        method: 'POST',
			        headers: { 'content-type': 'application/json' },
			        credentials: 'same-origin',
			        body: JSON.stringify({ sessionId, cwd, dir, name, text: String(text ?? '').slice(0, MAX_DRAFT_CHARS) }),
			        ...(signal === undefined ? {} : { signal }),
			      });
			      if (!response.ok) {
			        const detail = await response.json().catch(() => undefined);
			        throw new Error(detail?.error ?? `HTTP ${response.status}`);
			      }
			      const payload = await response.json();
			      if (payload?.ok !== true) throw new Error(payload?.error ?? 'save refused');
			      return { path: payload.path, rel: payload.rel };
			    },

			    /**
			     * 读回一份落盘的草稿。
			     *
			     * @returns 文本内容。
			     */
			    async load({ cwd, rel, signal }) {
			      const url = new URL(DRAFT_ROUTE, globalThis.location?.origin ?? 'http://127.0.0.1');
			      url.searchParams.set('cwd', cwd);
			      url.searchParams.set('path', rel);
			      const response = await fetch(url.href, {
			        credentials: 'same-origin',
			        ...(signal === undefined ? {} : { signal }),
			      });
			      if (!response.ok) {
			        const detail = await response.json().catch(() => undefined);
			        throw new Error(detail?.error ?? `HTTP ${response.status}`);
			      }
			      const payload = await response.json();
			      if (payload?.ok !== true) throw new Error(payload?.error ?? 'load refused');
			      return payload.text;
			    },

			    /**
			     * 列举目录下的草稿。
			     *
			     * @returns 草稿条目列表。
			     */
			    async list({ cwd, dir, signal }) {
			      const url = new URL(DRAFTS_ROUTE, globalThis.location?.origin ?? 'http://127.0.0.1');
			      url.searchParams.set('cwd', cwd);
			      url.searchParams.set('dir', dir);
			      const response = await fetch(url.href, {
			        credentials: 'same-origin',
			        ...(signal === undefined ? {} : { signal }),
			      });
			      if (!response.ok) return [];
			      const payload = await response.json();
			      return Array.isArray(payload?.entries) ? payload.entries : [];
			    },

			    /** 浏览器本地草稿。 */
			    readLocal() {
			      try {
			        return globalThis.localStorage?.getItem(LOCAL_KEY) ?? '';
			      } catch {
			        return '';
			      }
			    },
			    writeLocal(text) {
			      try {
			        globalThis.localStorage?.setItem(LOCAL_KEY, String(text ?? '').slice(0, MAX_DRAFT_CHARS));
			        return true;
			      } catch {
			        return false;
			      }
			    },

			    /**
			     * 把文本送进会话。
			     *
			     * 语义是「直接发出」：先 setDraft 再 submit。两步都可能被会话拒绝
			     * （提交机正在 adjudicating/submitting 时动作是空操作），因此返回
			     * 明确结果让界面回显，而不是假装成功。
			     *
			     * @param inputActions 会话的输入动作面。
			     * @param text 要发送的文本。
			     * @returns `{ ok, reason }`。
			     */
			    async send(inputActions, text) {
			      const body = String(text ?? '').trim();
			      if (body === '') return { ok: false, reason: 'empty' };
			      if (inputActions?.setDraft === undefined || inputActions?.submit === undefined) {
			        return { ok: false, reason: 'unavailable' };
			      }
			      try {
			        inputActions.setDraft(body);
			        inputActions.submit();
			        return { ok: true };
			      } catch (error) {
			        return { ok: false, reason: error instanceof Error ? error.message : String(error) };
			      }
			    },

			    /** 释放所有在途请求。 */
			    dispose() {
			      for (const controller of controllers) {
			        try {
			          controller.abort();
			        } catch {
			          // 已经结束就无所谓。
			        }
			      }
			      controllers.clear();
			    },

			    /** 注册一个可取消的请求，返回其 signal 与释放函数。 */
			    begin() {
			      const controller = new AbortController();
			      const release = track(controller);
			      return { signal: controller.signal, release };
			    },

			    /** 把浏览器 id 映射到标题（给面板标题用）。 */
			    titleOf: draftTitleOf,
			  };
			}

			Object.assign(__exports, { "createDraftIO": createDraftIO });
		});
		__dshRegistry.set("settings-face.js", (__exports) => {
			var module = { exports: __exports };
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
			const { SETTINGS_NAMESPACE, clampEditorFontSize, clampExtendedHeight, clampKeySize, clampPanelHeight, defaultSettings, normalizeEnterMode, normalizeExtendedEnter, normalizeStorageMode, safeDraftDir } = __dshRequire("./constants.js");

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
			function createSettingsFace(ctx, onChange) {
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

			Object.assign(__exports, { "createSettingsFace": createSettingsFace });
		});
		__dshRegistry.set("mode-controller.js", (__exports) => {
			var module = { exports: __exports };
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
			const { cycleModes, nextMode, normalizeMode } = __dshRequire("./constants.js");

			/** 当前模式的存储键。 */
			const MODE_STORAGE_KEY = 'dsh.enhancedPromptEditor.mode';

			/**
			 * 从存储里读回模式。
			 *
			 * @param storage localStorage 兼容对象（可能不存在）。
			 * @returns 模式；读不到就是 `native`（最保守：不擅自替用户开增强）。
			 */
			function readStoredMode(storage) {
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
			function reconcileMode(current, modes) {
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
			function createModeController(options) {
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

			Object.assign(__exports, { "MODE_STORAGE_KEY": MODE_STORAGE_KEY, "readStoredMode": readStoredMode, "reconcileMode": reconcileMode, "createModeController": createModeController });
		});
		__dshRegistry.set("native-switches.js", (__exports) => {
			var module = { exports: __exports };
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
			const SWITCHES_STORAGE_KEY = 'dsh-enhanced-prompt-editor:native-switches';

			/** 三个客户端值的默认值：两个开关都关；回车策略 `undefined` = 跟随宿主设置。 */
			function defaultSwitches() {
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
			function readStoredSwitches(storage) {
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
			function writeStoredSwitches(storage, value) {
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
			function createNativeSwitches(options) {
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

			Object.assign(__exports, { "SWITCHES_STORAGE_KEY": SWITCHES_STORAGE_KEY, "defaultSwitches": defaultSwitches, "readStoredSwitches": readStoredSwitches, "writeStoredSwitches": writeStoredSwitches, "createNativeSwitches": createNativeSwitches });
		});
		__dshRegistry.set("escape-exit.js", (__exports) => {
			var module = { exports: __exports };
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
			function shouldExitOnEscape(event, options = {}) {
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
			function attachEscapeExit(options) {
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

			Object.assign(__exports, { "shouldExitOnEscape": shouldExitOnEscape, "attachEscapeExit": attachEscapeExit });
		});
		__dshRegistry.set("native-composer.js", (__exports) => {
			var module = { exports: __exports };
			/**
			 * dsh-enhanced-prompt-editor —— 扩展输入框模式。
			 *
			 * 用户 2026-10-16 定的第二种模式：不动 DSH 的结构，只把**原生输入框**本身
			 * 向上变高，并在该模式下单独决定裸回车的语义。
			 *
			 * ## 为什么是「改 CSS 变量」而不是「插一个自己的输入框」
			 *
			 * 内核 `dsh-client-ui-conversation` 的实测事实（0.2.1-rc.2 复核；alpha.2 时相同）：
			 *
			 *  - 输入框滚动区的高度上限由一个 CSS 变量决定：
			 *    `.scroll{max-height:var(--dsh-composer-text-max-height)}`，
			 *    而该变量定义在 `.composerSeat` 上（默认 `336px`），seat 元素带
			 *    `data-composer-seat` 属性，是公开的稳定锚点。
			 *
			 *    ⚠️ **`max-height` 只是「上限」，不是「高度」**：它默认时输入框只有
			 *    36px 高（`.input{min-height:36px}`），要等内容长到撑满上限才会变高。
			 *    用户 2026-10-16 明确要求「切换到模式二就展开」，所以必须再给它一个
			 *    `min-height` —— **且必须加在 contenteditable 编辑区上，不是滚动容器上**：
			 *    加错层会留下一片点不动的死区（见 {@link EXTENDED_CSS} 的说明）。
			 *  - 输入框自己是一个 **Lexical** contenteditable（`data-composer-input`），
			 *    外部插一个 textarea 会与它的状态机打架（草稿、chip、撤销栈都在它手里）。
			 *
			 * 所以本模块只做「在 seat 上覆盖一个变量值」这一件事：DSH 自己的布局代码
			 * （`ResizeObserver` → `--dsh-composer-height`）会自然跟着变高，不需要我们
			 * 去同步任何尺寸。**绝不重排或改写宿主的 DOM**。
			 *
			 * ## Enter 怎么接管
			 *
			 * 原生输入框的 `keydown` 由 Lexical 经 `registerRootListener` 挂在
			 * contenteditable 根上（**冒泡**阶段）。我们的监听器挂在 `document` 上、
			 * 用**捕获**阶段：捕获阶段整体早于任何冒泡监听器，所以我们能可靠地抢在
			 * Lexical 之前处理这次按键。
			 *
			 *  - 需要「Enter 换行」时：`preventDefault()` + `stopPropagation()` 把这次
			 *    按键彻底吞掉，然后自己往文档里插入一个段落。
			 *  - 其余情况一律不碰，交给宿主原样处理（含 Shift+Enter、Ctrl/Cmd+Enter）。
			 *
			 * 只对**落在输入框内**的事件生效：每次事件现取根元素判断包含关系，
			 * 因此不会影响设置页、侧栏等其它 contenteditable。
			 *
			 * 插入换行不用 `document.execCommand`（已废弃；实测该 bundle 里 0 次使用），
			 * 而是用 Lexical 公开挂在根元素上的 `__lexicalEditor`（内核
			 * `registerRootListener` 里 `rootElement.__lexicalEditor = editor`）→
			 * `editor.update()` → 在 update 内取 `editor.getEditorState()._selection`
			 * （内核自己也这么取，等价于 `$getSelection()`）→ `insertParagraph()`。
			 *
			 * ⚠️ 为什么是 `insertParagraph()` 而不是 `insertText('\n')`：后者走
			 * `spliceText`，会把字面 `\n` 塞进**文本节点**里，Lexical 渲染时并不产生
			 * 换行；`insertParagraph()` 才与内核处理 `beforeinput` 的 `insertParagraph`
			 * 分支一致。这与 Lexical 内部逻辑已逐条核对（`RangeSelection.insertParagraph`）。
			 *
			 * ## 拿不到编辑器时怎么办
			 *
			 * 拿不到（宿主内部结构变了、`__lexicalEditor` 被改名）就**不吞这次回车**、
			 * 只做尺寸扩展，并记一条降级记录——绝不假装成功，也绝不把用户的回车吃掉
			 * 却什么都不插（那会让输入框彻底没法输入）。
			 *
			 * @module dsh-enhanced-prompt-editor/native-composer
			 */
			const { clampExtendedHeight, resolveExtendedEnter } = __dshRequire("./constants.js");

			/**
			 * 扩展输入框高度变量（我们自己的名字）。
			 *
			 * 为什么不复用内核的 `--dsh-composer-text-max-height`：那个变量**声明在
			 * `.composerSeat` 自己身上**，所以从 `documentElement` 覆盖它会被 seat 自己的
			 * 声明盖掉（就近胜出），只有直接写在 seat 的内联样式上才生效——而 seat 会被
			 * 宿主在会话切换时**重新挂载**，内联样式随之丢失，扩展就悄悄没了。
			 */
			const HEIGHT_VAR = '--dsh-epe-extended-height';

			/** 挂在 `documentElement` 上的标记属性：CSS 只在它存在时命中。 */
			const MARK_ATTR = 'data-dsh-epe-extended';

			/**
			 * 扩展输入框的 CSS。
			 *
			 * 两条规则分别作用在**不同的元素**上，这个区分是必须的：
			 *
			 *  1. `[data-input-scroll]`（滚动容器）→ 只设 `max-height`，决定内容超长后
			 *     从哪里开始滚动。直接写在滚动元素上而不是走内核变量：内核
			 *     `.scroll{max-height:var(--dsh-composer-text-max-height)}` 特异性 (0,1,0)，
			 *     我们这条 (0,2,1) 稳赢，不需要 `!important`。
			 *
			 *  2. `[data-composer-input]`（**contenteditable 编辑区本身**）→ 设 `min-height`。
			 *
			 * ⚠️ **`min-height` 必须加在编辑区上，不能加在滚动容器上。** 加错层的后果是
			 * 一整片点不动的死区（用户 2026-10-16 报的「输入框下方一大片区域无法点击」）：
			 *
			 *  - 内核 `.input{min-height:36px}`，编辑区只有 36px 高；
			 *  - 若把 `min-height` 给滚动容器，容器被撑到 N px，而编辑区仍是 36px，
			 *    中间 `N − 36` px 里没有任何可聚焦元素；
			 *  - 内核的 `onCardMouseDown` 里有一句
			 *    `if (scrollRef.current?.contains(target)) return;`
			 *    —— **落在滚动区内的点击宿主直接不管**（它假定滚动区里都是编辑区）。
			 *    于是那一片既不会被宿主聚焦，也不是可点控件，点了完全没反应。
			 *
			 * 把 `min-height` 给编辑区后，编辑区自己就有 N px 高，滚动容器随内容长到 N px，
			 * 两者同高 → 点哪里都落在编辑区上，死区为零。
			 *
			 * 选择器以 `[${MARK_ATTR}]`（挂在 `<html>` 上）开头，于是：标记在，任何**当前
			 * 挂载**的输入框都自动吃到这两条规则；宿主重挂元素也不会丢——这正是它比
			 * 「给 seat 写内联样式」强的地方。
			 */
			const EXTENDED_CSS =
			  `html[${MARK_ATTR}] [data-input-scroll]{max-height:var(${HEIGHT_VAR},0px)}` +
			  `html[${MARK_ATTR}] [data-composer-input]{min-height:var(${HEIGHT_VAR},0px)}`;

			/** 内核给输入框根写的属性，用它精确锁定宿主那个 contenteditable。 */
			const EDITOR_ATTR = 'data-composer-input';

			/** 扩展输入框模式下生效的高度值（CSS 长度）。 */
			function composerHeightFor(settings) {
			  return `${clampExtendedHeight(settings?.extendedHeight)}px`;
			}

			/**
			 * 读当前 Lexical 选区里的纯文本（用于「包裹选中文字」）。
			 *
			 * ⚠️ 必须在 `editor.update()` **内部**读 `_selection`：内核自己也这么做
			 * （`applyDOMRange`），在 update 之外读到的可能是上一帧的选区。
			 *
			 * @returns 选中的文本；没有选区/不可读时返回 `null`（调用方据此降级）。
			 */
			function selectionText(editor) {
			  if (editor === null || editor === undefined || typeof editor.update !== 'function') return null;
			  let text = null;
			  try {
			    editor.update(() => {
			      const selection = editor.getEditorState?.()._selection ?? null;
			      if (selection === null || typeof selection.getTextContent !== 'function') return;
			      const content = selection.getTextContent();
			      if (typeof content === 'string') text = content;
			    });
			  } catch {
			    return null;
			  }
			  return text;
			}

			/**
			 * 在原生输入框里插入文本（或包裹选中文字）。
			 *
			 * 用 `RangeSelection.insertText(text)`：内核实现里它会**先 `removeText()`**
			 * （删掉当前选中的内容）再插入新文本 —— 这正是「把选中文字框在符号内」需要的
			 * 语义（把选区换成 `符号 + 原文 + 符号`）。
			 *
			 * 插入后把光标/选区恢复到 `符号` 之后，与面板里的行为一致。
			 *
			 * @returns 是否成功。
			 */
			function insertTextIntoComposer(editor, text) {
			  if (editor === null || editor === undefined || typeof editor.update !== 'function') return false;
			  if (typeof text !== 'string' || text === '') return false;
			  try {
			    let ok = false;
			    editor.update(() => {
			      const selection = editor.getEditorState?.()._selection ?? null;
			      if (selection === null || typeof selection.insertText !== 'function') return;
			      selection.insertText(text);
			      ok = true;
			    });
			    return ok;
			  } catch {
			    return false;
			  }
			}

			/**
			 * 找当前会话的输入卡容器（seat）。
			 *
			 * 取 `data-composer-seat` 而不是猜类名：内核给 seat 同时写了
			 * `data-composer-seat` 与 `data-conversation-region="composer"`。
			 *
			 * @param doc 文档对象。
			 * @returns seat 元素，找不到返回 null。
			 */
			function findComposerSeat(doc) {
			  if (doc === undefined || doc === null || typeof doc.querySelector !== 'function') return null;
			  try {
			    return doc.querySelector('[data-composer-seat]');
			  } catch {
			    return null;
			  }
			}

			/**
			 * 找输入框的 contenteditable 根。
			 *
			 * @param doc 文档对象。
			 * @returns 根元素，找不到返回 null。
			 */
			function findComposerEditor(doc) {
			  if (doc === undefined || doc === null || typeof doc.querySelector !== 'function') return null;
			  try {
			    return doc.querySelector(`[${EDITOR_ATTR}]`);
			  } catch {
			    return null;
			  }
			}

			/**
			 * 从根元素取 Lexical 编辑器实例。
			 *
			 * 这是**内部字段**，所以整条路径都必须容错：拿不到就返回 null。
			 *
			 * @param root contenteditable 根元素。
			 * @returns 编辑器实例或 null。
			 */
			function editorOf(root) {
			  if (root === null || root === undefined) return null;
			  try {
			    const editor = root.__lexicalEditor;
			    if (editor === null || typeof editor !== 'object') return null;
			    if (typeof editor.update !== 'function') return null;
			    return editor;
			  } catch {
			    return null;
			  }
			}

			/**
			 * 在光标处插入一个段落（= 一次换行）。
			 *
			 * 选区必须**在 `editor.update()` 内部**读取：`getEditorState()` 在 update
			 * 期间返回 pending state，其 `_selection` 就是当前活动选区（等同于
			 * `$getSelection()`）；在 update 之外读到的可能是过期对象。
			 *
			 * @param editor Lexical 编辑器。
			 * @returns 是否真的插入了。
			 */
			function insertNewline(editor) {
			  try {
			    let applied = false;
			    editor.update(() => {
			      const selection = editor.getEditorState()?._selection ?? null;
			      if (selection === null) return;
			      if (typeof selection.insertParagraph !== 'function') return;
			      selection.insertParagraph();
			      applied = true;
			    });
			    return applied;
			  } catch {
			    return false;
			  }
			}

			/** 判断一次按键是不是需要被本模块改写的那一种。 */
			function wantsNewline(event, policy) {
			  return resolveExtendedEnter(event, policy) === 'newline';
			}

			/**
			 * 「扩展输入框」控制器。
			 *
			 * 生命周期由 `apply` 持有：`sync()` 幂等地把当前设置套到 DOM 上，
			 * `dispose()` 摘掉监听与变量覆盖。**任何一步都不抛异常**——这个模块碰的是
			 * 宿主 DOM 与宿主内部字段，出错只能降级、只记录；把异常抛回 `apply` 会让
			 * 整个 DSH 白屏（见 `client.js` 顶部注释）。
			 */
			function createNativeComposer(options) {
			  const doc = options?.document ?? (typeof document === 'undefined' ? undefined : document);
			  const notes = [];
			  const note = (where, message) => {
			    // 同一处只记一次，避免每次按键刷屏。
			    if (notes.some((item) => item.where === where)) return;
			    notes.push({ where, message });
			    options?.onDegrade?.(where, message);
			  };

			  let applied = false;
			  /** `<html>` 上的扩展标记与高度变量是否已写（与 keydown 分开记账）。 */
			  let marked = false;
			  /**
			   * 期望的展开形态：`true` 扩展模式 / `false` 只装 keydown / `null` 不需要生效。
			   *
			   * 为什么要有它：`sync()` 可能在**输入框还没挂载**时被调用（典型场景：用户
			   * 在设置页里勾选开关 —— 设置页替换了会话视图，composer 此刻不在 DOM 里）。
			   * 那次 `apply()` 会因找不到输入框而返回 false，而回到会话后**没有任何事件**
			   * 会再触发一次 sync —— 结果就是「开关是开的、回车照旧发送」（用户 2026-08
			   * 实测）。所以记下期望形态，挂载晚了也要自己补上。
			   */
			  let wantExpand = null;
			  /** 重试定时器（只在「想生效但还没装上」时跑；仅作没有 MutationObserver 时的兜底）。 */
			  let retryTimer = null;
			  /** 监听 composer 挂载的观察器（事件驱动，优先于定时器）。 */
			  let retryObserver = null;
			  let activePolicy = 'inherit';
			  let activeHeight = null;
			  let root = null;

			  /**
			   * 捕获阶段的 keydown。
			   *
			   * 挂在 document 上而不是根元素上：既保证早于 Lexical 的冒泡监听器，又不必
			   * 担心根元素被宿主重挂后我们的监听器随之消失。作用域靠「事件目标是否在
			   * 输入框内」在每次事件里现算。
			   */
			  const onKeyDown = (event) => {
			    try {
			      if (!wantsNewline(event, activePolicy)) return;
			      const editorRoot = findComposerEditor(doc);
			      const target = event?.target ?? null;
			      if (editorRoot === null || target === null || typeof editorRoot.contains !== 'function') return;
			      if (editorRoot !== target && editorRoot.contains(target) !== true) return;
			      const editor = editorOf(editorRoot);
			      if (editor === null) {
			        // 不吞：宁可让宿主按原生语义发送，也不能吃掉用户的回车却什么都不插。
			        note('extended-enter', 'Lexical editor instance unavailable on the composer root');
			        return;
			      }
			      if (typeof event.preventDefault === 'function') event.preventDefault();
			      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
			      else if (typeof event.stopPropagation === 'function') event.stopPropagation();
			      if (!insertNewline(editor)) note('extended-enter', 'Lexical paragraph insertion was refused');
			    } catch (error) {
			      // 事件处理器里抛错会冒到 window.onerror；这里必须自己兜住。
			      note('extended-enter', error instanceof Error ? error.message : String(error));
			    }
			  };

			  let offKeyDown;

			  /**
			   * 装监听（幂等），并按需打标记。
			   *
			   * **标记挂在 `<html>` 上，不是 seat 上。** 原因见 {@link EXTENDED_CSS}：
			   * seat 会被宿主在会话切换时重新挂载，挂在它上面的东西会跟着丢；`<html>` 不会。
			   * 规则本身用属性选择器命中「当前挂载的那个」输入框，因此重挂后自动继续生效。
			   *
			   * ⚠️ **keydown 与标记是分开的**（用户 2026-08 新增「原生输入框的高级回车」）：
			   *  - `expand === true`（扩展输入框模式）：打标记 + 写高度变量 + 装 keydown，
			   *    于是输入框加高、行号沟槽与悬浮 deck 的预留规则一并生效；
			   *  - `expand === false`（**原生模式**下只勾了「高级回车」）：**只**装 keydown。
			   *    绝不能打标记 —— 那会把行号、底色、加高一起带进原生模式。
			   *
			   * @param expand 是否按「扩展输入框模式」展开（标记 + 高度变量）。
			   */
			  const apply = (expand) => {
			    const editorRoot = findComposerEditor(doc);
			    if (editorRoot === null) return false;
			    const html = doc?.documentElement ?? null;
			    if (html === null || typeof html.setAttribute !== 'function') return false;
			    try {
			      if (expand === true) {
			        html.setAttribute(MARK_ATTR, 'extended');
			        // 高度写成单个变量，由 EXTENDED_CSS 同时喂给 min-height 与 max-height：
			        // 「切到该模式就展开」靠 min-height，内容超长后滚动靠 max-height。
			        html.style.setProperty(HEIGHT_VAR, composerHeightFor({ extendedHeight: activeHeight }));
			        marked = true;
			      } else if (marked) {
			        // 从扩展模式切到「原生 + 高级回车」：标记必须摘掉，keydown 留着。
			        html.removeAttribute(MARK_ATTR);
			        html.style.removeProperty(HEIGHT_VAR);
			        marked = false;
			      }
			      root = editorRoot;
			      if (!applied && doc !== undefined && doc !== null && typeof doc.addEventListener === 'function') {
			        doc.addEventListener('keydown', onKeyDown, true);
			        offKeyDown = () => doc.removeEventListener('keydown', onKeyDown, true);
			        applied = true;
			      }
			      return true;
			    } catch (error) {
			      note('extended-apply', error instanceof Error ? error.message : String(error));
			      return false;
			    }
			  };

			  /** 停掉重试（观察器与定时器都收掉）。 */
			  const stopRetry = () => {
			    if (retryObserver !== null) {
			      try {
			        retryObserver.disconnect();
			      } catch {
			        // 已经断开就无所谓。
			      }
			      retryObserver = null;
			    }
			    if (retryTimer === null) return;
			    try {
			      clearInterval(retryTimer);
			    } catch {
			      // 环境没有 clearInterval 就让它自然失效。
			    }
			    retryTimer = null;
			  };

			  /**
			   * 想生效、但还没装上时，低级轮询补装。
			   *
			   * 用 200ms 的定时器而不是 rAF：这个等待可能跨越「用户还在设置页」的整段时间，
			   * 每帧 querySelector 没必要；200ms 对「回到会话后立刻能用」已经足够。
			   */
			  const ensure = () => {
			    if (wantExpand === null || applied) {
			      stopRetry();
			      return;
			    }
			    if (apply(wantExpand)) stopRetry();
			  };

			  const startRetry = () => {
			    if (retryTimer !== null || retryObserver !== null) return;
			    // 没有 document 就没有「挂载」这回事（Node 测试环境）：别空转。
			    if (doc === undefined || doc === null) return;
			    // 首选 MutationObserver：composer 一挂进来就补装，**不产生定时器**。
			    // （曾经用 setInterval，结果把 Node 测试进程钉住不退出，整份 bundle 测试
			    //  跑到超时 —— 事件驱动没有这个问题。）
			    if (typeof MutationObserver === 'function' && doc.documentElement !== undefined) {
			      try {
			        retryObserver = new MutationObserver(() => ensure());
			        retryObserver.observe(doc.documentElement, { childList: true, subtree: true });
			        ensure();
			        return;
			      } catch {
			        retryObserver = null;
			      }
			    }
			    // 兜底：轮询（浏览器里 setInterval 返回数字；Node 里 unref 掉避免钉住进程）。
			    const timer = typeof setInterval === 'function' ? setInterval : null;
			    if (timer === null) return;
			    retryTimer = timer(ensure, 200);
			    try {
			      retryTimer?.unref?.();
			    } catch {
			      // 老环境没有 unref 就算了。
			    }
			  };

			  /** 摘掉监听与标记（幂等）。 */
			  const revert = () => {
			    wantExpand = null;
			    stopRetry();
			    if (typeof offKeyDown === 'function') {
			      try {
			        offKeyDown();
			      } catch {
			        // 文档已经没了就无所谓。
			      }
			      offKeyDown = undefined;
			    }
			    applied = false;
			    root = null;
			    // ⚠️ 标记与 keydown 分开记账，不能因为 `applied` 已经为 false 就跳过摘标记：
			    // 否则「原生 + 高级回车 → 关闭该设置」会留下一套展开中的 CSS。
			    if (!marked) return;
			    marked = false;
			    try {
			      const html = doc?.documentElement ?? null;
			      if (html !== null) {
			        html.removeAttribute(MARK_ATTR);
			        html.style.removeProperty(HEIGHT_VAR);
			      }
			    } catch {
			      // 摘不掉不影响功能，下次 sync 会再试。
			    }
			  };

			  return {
			    /**
			     * 按当前模式与设置同步 DOM。
			     *
			     * 三种情形：
			     *  - `extended`：完整展开（标记 + 高度变量 + keydown）；
			     *  - `native` 且**客户端开关** `nativeEnter === true`：**只**装 keydown
			     *    （原生输入框借走「高级回车」，外观与高度保持原生）；
			     *  - 其余：全部摘掉。
			     *
			     * @param settings 规整过的设置。
			     * @param mode 当前模式。
			     * @param switches 客户端开关控制器（`native-switches.js`），决定原生模式
			     *        要不要接管回车。**不读 `settings.nativeEnter`**：那个字段在本机
			     *        存不进宿主（写入被整体拒绝），走客户端存储才可靠。
			     * @returns 本模式是否处于「已生效」状态。
			     */
			    sync(settings, mode, switches) {
			      // 回车策略读**客户端**存储（宿主设置那条写入在本机被整体拒绝，
			      // 改策略改不动 —— 用户实测「高级 enter 启用失败」就是这个）。
			      activePolicy = switches?.get?.()?.extendedEnter ?? settings?.extendedEnter ?? 'inherit';
			      activeHeight = clampExtendedHeight(settings?.extendedHeight);
			      const extended = mode === 'extended';
			      const enterActive = extended || (mode === 'native' && switches?.get?.()?.nativeEnter === true);
			      if (!enterActive) {
			        revert();
			        return false;
			      }
			      // 记下期望形态：这一刻输入框可能还没挂载（例如用户还在设置页），装不上就轮询补。
			      wantExpand = extended;
			      // 座位/输入框可能还没挂上（会话切换、Hero 态、用户正在设置页）。
			      // 挂不上不算失败，但要**自己补**：轮询到输入框出现为止。
			      const ok = apply(extended);
			      if (!ok) startRetry();
			      else stopRetry();
			      return ok;
			    },

			    /** 当前是否已生效（供状态回显）。 */
			    isActive: () => applied,
			    /** 运行期降级记录（只读）。 */
			    notes: () => notes.slice(),

			    dispose() {
			      stopRetry();
			      revert();
			    },
			  };
			}

			Object.assign(__exports, { "HEIGHT_VAR": HEIGHT_VAR, "MARK_ATTR": MARK_ATTR, "EXTENDED_CSS": EXTENDED_CSS, "composerHeightFor": composerHeightFor, "selectionText": selectionText, "insertTextIntoComposer": insertTextIntoComposer, "findComposerSeat": findComposerSeat, "findComposerEditor": findComposerEditor, "editorOf": editorOf, "insertNewline": insertNewline, "createNativeComposer": createNativeComposer });
		});
		__dshRegistry.set("css.js", (__exports) => {
			var module = { exports: __exports };
			/**
			 * dsh-enhanced-prompt-editor —— 样式注入（共享，且绝不抛错）。
			 *
			 * 为什么单独抽一层并把失败吞掉：DSH 的插槽渲染器给每个条目套了
			 * `SlotErrorBoundary`，而**渲染期抛出的异常会让该条目被永久撤销**
			 * （`reportEntryError(..., { abdicate: kind !== 'chain' })` → 条目进
			 * `abdicated` 集 → `entriesOfSlot` 从此跳过它）。也就是说，注入样式这种
			 * 边缘动作一旦抛错，代价是「按钮/面板从此再不出现」，而不是掉一个样式。
			 *
			 * 所以这里把 `document` 当**不可信输入**处理：拿不到 head、head 被冻结、
			 * createElement 被改写，都只是返回 false，调用方的渲染照常完成。
			 *
			 * @module dsh-enhanced-prompt-editor/css
			 */

			/**
			 * 往文档里注入一段 `<style>`，已注入过则跳过。
			 *
			 * @param doc 文档对象；允许为 undefined（非浏览器环境）。
			 * @param cssId 本段样式的唯一标识，写进 `data-plugin-css`。
			 * @param css 样式文本。
			 * @param pluginId 插件身份，写进 `data-plugin`。
			 * @returns 是否真的插入了新标签；任何异常都返回 false。
			 */
			function injectCss(doc, cssId, css, pluginId) {
			  if (doc === undefined || doc === null) return false;
			  try {
			    const selector = `style[data-plugin-css=${JSON.stringify(cssId)}]`;
			    if (typeof doc.querySelector === 'function' && doc.querySelector(selector) !== null) return false;
			    const head = doc.head;
			    if (head === undefined || head === null || typeof head.appendChild !== 'function') return false;
			    const tag = doc.createElement('style');
			    tag.dataset.plugin = pluginId;
			    tag.dataset.pluginCss = cssId;
			    tag.textContent = css;
			    head.appendChild(tag);
			    return true;
			  } catch {
			    // 样式是锦上添花，绝不能因为它让插槽条目被撤销。
			    return false;
			  }
			}

			/**
			 * 浏览器环境下的便捷入口：自己取 `document`。
			 *
			 * @param cssId 本段样式的唯一标识。
			 * @param css 样式文本。
			 * @param pluginId 插件身份。
			 * @returns 是否插入了新标签。
			 */
			function ensureCss(cssId, css, pluginId) {
			  return injectCss(typeof document === 'undefined' ? undefined : document, cssId, css, pluginId);
			}

			Object.assign(__exports, { "injectCss": injectCss, "ensureCss": ensureCss });
		});
		__dshRegistry.set("composer-trigger.js", (__exports) => {
			var module = { exports: __exports };
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
			const { createElement: h, useCallback, useState } = __dshExternal("react");
			const { Button, IconChevronUpOutlineRegular, IconPanelLeftOutlineRegular, Toast } = __dshExternal("@deepseek-ai/dsh-client-ui-primitives");
			const { PLUGIN_ID } = __dshRequire("./constants.js");
			const { ensureCss: injectStyle } = __dshRequire("./css.js");

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
			function ComposerTrigger(props) {
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

			Object.assign(__exports, { "ComposerTrigger": ComposerTrigger });
		});
		__dshRegistry.set("edit-ops.js", (__exports) => {
			var module = { exports: __exports };
			/**
			 * dsh-enhanced-prompt-editor —— 编辑器里的纯文本编辑操作。
			 *
			 * 抽成纯函数（而不是写在组件事件里）的原因：这几处规则错了都是**静默错**——
			 * 选中文字后点符号，若实现成「替换」用户的文字就没了；若实现成「插在前面」，
			 * 符号又落在错的位置。这类行为必须能被单测钉住。
			 *
			 * ## 三种符号的行为（用户 2026-10-16 明确要求）
			 *
			 * 1. `pair`（成对符号：括号 / 引号 / 反引号 / 书名号…）
			 *    - **有选中文字** → 把文字**框在**符号内：`选中 → (选中)`，
			 *      并保持这段文字仍被选中（用户能立刻看到包住的是哪些，也方便继续叠加）。
			 *      ⚠️ **不是**「把框选的文字改成符号」—— 那会丢掉用户的内容。
			 *    - 没有选中 → 插入一对符号，光标落在**中间**：`(|)`。
			 * 2. `prefix`（行前缀：`# ` / `- ` / `> `）
			 *    - 给选区覆盖的每一行加前缀；没有选区就给当前行加。
			 * 3. `plain`（整块插入：`---`）
			 *    - 在光标处插入，**不删除**已选文字（避免误点毁掉内容）。
			 *
			 * 所有函数都接受并返回**普通字符串与下标**，不碰 DOM，因此可以在非浏览器环境
			 * 直接单测。
			 *
			 * @module dsh-enhanced-prompt-editor/edit-ops
			 */

			/**
			 * 工具栏上的符号表。
			 *
			 * `label` 是按钮上显示的文本（就是符号本身，自解释）；`key` 用来取文案
			 * （`symbol.<key>`）。`kind` 决定调用哪个操作，见模块头部的三种行为。
			 */
			const SYMBOLS = [
			  // ── 成对符号：把选中文字框住 ─────────────────────────────────────
			  { key: 'paren', label: '()', kind: 'pair', before: '(', after: ')' },
			  { key: 'bracket', label: '[]', kind: 'pair', before: '[', after: ']' },
			  { key: 'brace', label: '{}', kind: 'pair', before: '{', after: '}' },
			  { key: 'quote', label: '""', kind: 'pair', before: '"', after: '"' },
			  { key: 'single', label: "''", kind: 'pair', before: "'", after: "'" },
			  { key: 'backtick', label: '`', kind: 'pair', before: '`', after: '`' },
			  { key: 'fullParen', label: '（）', kind: 'pair', before: '（', after: '）' },
			  { key: 'corner', label: '「」', kind: 'pair', before: '「', after: '」' },
			  { key: 'whiteCorner', label: '『』', kind: 'pair', before: '『', after: '』' },
			  { key: 'lenticular', label: '【】', kind: 'pair', before: '【', after: '】' },
			  { key: 'bookTitle', label: '《》', kind: 'pair', before: '《', after: '》' },
			  // ── Markdown 常用符号 ───────────────────────────────────────────
			  // Markdown 标记：`**` `*` `~~` 在小字号下**几乎分不出来**（`~~` 尤其会被看成
			  // 三个波浪）。用户 2026-10-16 直接问「后面几个是不是有问题」——所以这几个
			  // 不用纯符号当标签，改成「符号 + 用途首字」，一眼可辨。
			  { key: 'bold', label: 'B', kind: 'pair', before: '**', after: '**' },
			  { key: 'italic', label: 'I', kind: 'pair', before: '*', after: '*' },
			  { key: 'strike', label: 'S', kind: 'pair', before: '~~', after: '~~' },
			  { key: 'codeBlock', label: '```', kind: 'pair', before: '```\n', after: '\n```' },
			  { key: 'heading', label: 'H', kind: 'prefix', prefix: '# ' },
			  { key: 'bullet', label: '•', kind: 'prefix', prefix: '- ' },
			  { key: 'quoteBlock', label: '❝', kind: 'prefix', prefix: '> ' },
			  { key: 'link', label: 'Link', kind: 'pair', before: '[', after: '](url)' },
			  { key: 'image', label: 'Img', kind: 'pair', before: '![', after: '](url)' },
			  { key: 'divider', label: '―――', kind: 'plain', insert: '---' },
			];

			/**
			 * 缩进类按钮（用户 2026-10-16：「一键缩进也没有添加」）。
			 *
			 * 缩进不属于 {@link SYMBOLS}（它不是「插入符号」而是「改行首」），单独一张表。
			 */
			const INDENT_BUTTONS = [
			  { key: 'indent', label: '→', outdent: false },
			  { key: 'outdent', label: '←', outdent: true },
			];

			/**
			 * 把下标夹进合法范围。
			 *
			 * 选择区的下标来自 DOM，可能是 `null`、越界、或反序（有些输入法会这样），
			 * 直接用会让 `slice` 静默产出错内容。
			 */
			function clampRange(text, start, end) {
			  const length = typeof text === 'string' ? text.length : 0;
			  const rawStart = Number.isFinite(start) ? Math.trunc(start) : length;
			  const rawEnd = Number.isFinite(end) ? Math.trunc(end) : rawStart;
			  const from = Math.min(Math.max(rawStart, 0), length);
			  const to = Math.min(Math.max(rawEnd, 0), length);
			  return from <= to ? { start: from, end: to } : { start: to, end: from };
			}

			/**
			 * 成对符号：**把选中文字框在符号内**，而不是替换它。
			 *
			 * @returns `{ text, selStart, selEnd }`，`sel*` 是操作后应当恢复的选区。
			 */
			function wrapSelection(text, start, end, before, after) {
			  // text 可能是 undefined（store 尚未初始化、会话刚切）。当成空串处理而不是
			  // 让它抛到渲染期——插槽渲染期抛错会让整个条目被永久撤销。
			  const source = typeof text === 'string' ? text : '';
			  const open = typeof before === 'string' ? before : '';
			  const close = typeof after === 'string' ? after : '';
			  const range = clampRange(source, start, end);
			  const head = source.slice(0, range.start);
			  const tail = source.slice(range.end);
			  if (range.start === range.end) {
			    // 没有选中：插入一对，光标停在中间。
			    const caret = range.start + open.length;
			    return { text: `${head}${open}${close}${tail}`, selStart: caret, selEnd: caret };
			  }
			  // 有选中：符号包在外面，原来的文字仍在里面，并且**保持选中**。
			  const inner = source.slice(range.start, range.end);
			  return {
			    text: `${head}${open}${inner}${close}${tail}`,
			    selStart: range.start + open.length,
			    selEnd: range.end + open.length,
			  };
			}

			/**
			 * 行前缀（`# ` / `- ` / `> `）：给选区覆盖的每一行加前缀。
			 *
			 * 只给「选区真正覆盖到的行」加，不会因为选区末尾正好落在换行符上而多给下一行
			 * 加一次（那是很常见的 off-by-one）。
			 */
			function prefixLines(text, start, end, prefix) {
			  const source = typeof text === 'string' ? text : '';
			  const lead = typeof prefix === 'string' ? prefix : '';
			  const range = clampRange(source, start, end);
			  const lineStart = source.lastIndexOf('\n', Math.max(0, range.start - 1)) + 1;
			  // 选区末尾若正好在行首（即它前面是换行符），那一行不算被覆盖。
			  let effectiveEnd = range.end;
			  if (effectiveEnd > lineStart && source[effectiveEnd - 1] === '\n') effectiveEnd -= 1;
			  const lineEndRaw = source.indexOf('\n', effectiveEnd);
			  const lineEnd = lineEndRaw === -1 ? source.length : lineEndRaw;

			  const segment = source.slice(lineStart, lineEnd);
			  const prefixed = segment
			    .split('\n')
			    .map((line) => `${lead}${line}`)
			    .join('\n');

			  return {
			    text: `${source.slice(0, lineStart)}${prefixed}${source.slice(lineEnd)}`,
			    selStart: lineStart,
			    selEnd: lineStart + prefixed.length,
			  };
			}

			/**
			 * 普通插入：在光标处插入，**不删除**已选文字。
			 *
			 * 对 `---` 这类整块符号，误点一下就把用户选中的段落删掉是不可接受的；所以这里
			 * 选择「插在选区起点、保留内容」而不是「替换选区」。
			 */
			function insertPlain(text, start, end, insert) {
			  const source = typeof text === 'string' ? text : '';
			  const added = typeof insert === 'string' ? insert : '';
			  const range = clampRange(source, start, end);
			  const caret = range.start + added.length;
			  return {
			    text: `${source.slice(0, range.start)}${added}${source.slice(range.start)}`,
			    selStart: caret,
			    selEnd: caret,
			  };
			}

			/**
			 * 按符号定义派发到对应操作。
			 *
			 * @param text 当前全文。
			 * @param start 选区起点。
			 * @param end 选区终点。
			 * @param symbol {@link SYMBOLS} 里的一项。
			 */
			function applySymbol(text, start, end, symbol) {
			  if (symbol?.kind === 'prefix') return prefixLines(text, start, end, symbol.prefix ?? '');
			  if (symbol?.kind === 'plain') return insertPlain(text, start, end, symbol.insert ?? '');
			  return wrapSelection(text, start, end, symbol?.before ?? '', symbol?.after ?? '');
			}

			/**
			 * 缩进 / 反缩进：给选区覆盖的每一行加/减一层缩进。
			 *
			 * 用户 2026-10-16 要求「一键缩进」。用**两个空格**而不是 Tab：Markdown 里
			 * 两空格是惯用缩进，且不会在别的渲染器里变成 8 列宽跳格。
			 *
			 * 反缩进时每行只削一层（最多 `INDENT` 长度），且**只削真的存在的那部分**——
			 * 对没缩进的行不动，避免把内容顶掉。
			 *
			 * @param outdent `true` 时反缩进。
			 */
			const INDENT = '  ';

			function indentLines(text, start, end, outdent = false) {
			  const source = typeof text === 'string' ? text : '';
			  const range = clampRange(source, start, end);
			  const lineStart = source.lastIndexOf('\n', Math.max(0, range.start - 1)) + 1;
			  let effectiveEnd = range.end;
			  if (effectiveEnd > lineStart && source[effectiveEnd - 1] === '\n') effectiveEnd -= 1;
			  const lineEndRaw = source.indexOf('\n', effectiveEnd);
			  const lineEnd = lineEndRaw === -1 ? source.length : lineEndRaw;

			  const segment = source.slice(lineStart, lineEnd);
			  const lines = segment.split('\n');
			  let deltaFirstLine = 0;
			  const next = lines
			    .map((line, index) => {
			      if (outdent === true) {
			        // 只削真的存在的缩进量。
			        let cut = 0;
			        while (cut < INDENT.length && line[cut] === ' ') cut += 1;
			        if (index === 0) deltaFirstLine = -cut;
			        return line.slice(cut);
			      }
			      if (index === 0) deltaFirstLine = INDENT.length;
			      return `${INDENT}${line}`;
			    })
			    .join('\n');

			  return {
			    text: `${source.slice(0, lineStart)}${next}${source.slice(lineEnd)}`,
			    selStart: Math.max(lineStart, range.start + deltaFirstLine),
			    selEnd: lineStart + next.length,
			  };
			}

			/**
			 * 第 `index` 行是否用「深一档」的背景。
			 *
			 * 0 基下标，奇数行染色 → 视觉上深浅交替，便于逐行扫读（用户 2026-10-16 要求）。
			 */
			function isAlternateLine(index) {
			  return index % 2 === 1;
			}

			Object.assign(__exports, { "SYMBOLS": SYMBOLS, "INDENT_BUTTONS": INDENT_BUTTONS, "clampRange": clampRange, "wrapSelection": wrapSelection, "prefixLines": prefixLines, "insertPlain": insertPlain, "applySymbol": applySymbol, "INDENT": INDENT, "indentLines": indentLines, "isAlternateLine": isAlternateLine });
		});
		__dshRegistry.set("composer-rows.js", (__exports) => {
			var module = { exports: __exports };
			/**
			 * dsh-enhanced-prompt-editor —— 扩展输入框模式（模式二）的**行几何**测量。
			 *
			 * @module dsh-enhanced-prompt-editor/composer-rows
			 *
			 * ## 为什么两次重写（改代码前先读这段）
			 *
			 * 本模块被**两次**实测推翻，两次都是「另造一套行几何」的错：
			 *
			 * ### 第一次：CSS counter 数 `<p>`
			 *
			 * 原实现 `counter-reset` / `counter-increment` / `nth-of-type(odd)`。
			 * 内核 `insertRawText()` 把粘贴文本里的 `\n` 交给 `linebreak: () => push(qi())`，
			 * `qi()` 是 `LineBreakNode`、`createDOM()` 返回 `createElement("br")`
			 * —— 即**换行未必是新的 `<p>`**。一个 80 行的提示词可能只得到
			 * 「1 个 `<p>` + N 个 `<br>`」，counter 恒为 1。
			 *
			 * ### 第二次（2026-10-17）：去 DOM 里数 `<br>` 切逻辑行
			 *
			 * 改成「按 `<br>` 切段 + 数 rect」后仍然错。用户截图（模式二）实测：
			 * **前 15 行被算成 1 个逻辑行**（整块同色、行号「1」被撑成 15 行高、
			 * 后面的行号整体下移并压住正文）。
			 *
			 * 根因：**真实 DOM 里的换行往往是文本节点内的换行字符** —— 输入区是
			 * `white-space:pre-wrap`，换行字符直接渲染成新行，**根本不需要 `<br>`**。
			 * 于是整段被当成一段。而「有几个 rect」只能说明渲染成几行，
			 * **不能说明哪里是逻辑行的边界**。
			 *
			 * ## 现在的做法：逻辑行以「草稿文本」为唯一权威（= 照搬模式一）
			 *
			 * 模式一（侧栏面板，原生 `textarea`）为什么是对的：它**不枚举 DOM**，
			 * 而是拿 `text.split('\n')` 当逻辑行，软换行只在「量每行占几个视觉行」
			 * 时才需要测量。模式二必须用**同一份权威**，否则两个模式的口径必然漂移
			 * —— 用户 2026-10-16 的原话就是「模式一会自动换行 模式二不会 不统一」，
			 * 2026-10-17 再次指出「分行依旧未使用模式一的实现 你不能照搬吗」。
			 *
			 * 所以：
			 *
			 * 1. **逻辑行切分** = `draft.split('\n')`（调用方传入草稿，与模式一同源）；
			 * 2. **每条逻辑行占几个视觉行** = 把 DOM 摊平成字符流（文本节点按原样、
			 *    `<br>` 记 1 个换行、块级元素结束后记 1 个换行），算出第 k 条逻辑行的
			 *    字符区间，再用 `Range.getClientRects()` 数**去重后的 `top` 个数**；
			 * 3. 摊平结果与草稿不一致时标记 `aligned: false`（调用方据此降级），
			 *    绝不用错的几何硬画 —— 错的行号比没有行号更糟。
			 *
			 * ⚠️ **绝不可以用 `getClientRects()` 的个数当行数**：实测一行文字被 Lexical
			 * 拆成 4 个文本节点时，同一视觉行上返回 **8 个 rect**（`distinctTops=1`）；
			 * 4 行返回 31 个 rect。必须按 `Math.round(rect.top)` 去重。
			 *
			 * ⚠️ 为什么不用模式一的 textarea 镜像（`soft-wrap.js` 的 `attachMeasurer`）：
			 * 那个镜像只能测「同一段文字在 textarea 上会怎么断」，而 contenteditable 的
			 * 断行算法与 textarea **实测不同**（见 soft-wrap.js 模块注释里的 div/textarea
			 * 对照实验）。所以视觉行数必须在真 DOM 上量 —— 但**逻辑行的边界**
			 * 必须来自草稿文本。
			 */

			/** 会被当成「一行结束」的块级标签。 */
			const BLOCK_TAGS = new Set([
			  'P', 'DIV', 'LI', 'UL', 'OL', 'BLOCKQUOTE', 'PRE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
			  'SECTION', 'ARTICLE', 'TABLE', 'TR', 'FIGURE', 'HR',
			]);

			/** 位置表里的三类定位方式。 */
			const SLOT_TEXT = 0;
			const SLOT_BR = 1;
			const SLOT_AFTER_BLOCK = 2;

			/** 收敛成有限数字（非有限值按 0）。 */
			function toFinite(value) {
			  const n = Number(value);
			  return Number.isFinite(n) ? n : 0;
			}

			/**
			 * 把输入框的 DOM 摊平成「字符流 + 位置表」。
			 *
			 * 映射规则（与草稿文本的语义对齐）：
			 *  - 文本节点：每个字符占 1 格，位置指向 `(文本节点, 字符偏移)`；
			 *  - `<br>`：占 1 格（= 一个换行字符），位置指向该 `<br>`；
			 *  - 块级元素**结束**后：占 1 格（= 一个换行字符），位置用
			 *    「容器 + 子索引」表达（这样该块后面没有兄弟节点也能定位）。
			 *
			 * ⚠️⚠️ **块尾那个 `<br>` 不额外占位**。浏览器实测（离屏 Chromium，行高 24px，
			 * 见 probe19）：`<p>aaa<br></p>` 只有 **1** 行；`<p>aaa<br><br></p>` 是 2 行
			 * —— 即**最后一个** `<br>` 不加行盒。它是 contenteditable 的占位产物
			 * （空块必须有 `<br>` 才显示得出来），与块的结束换行语义重复。
			 * 不排掉它，摊平流就会比草稿多出换行，第 2 条起全部错位。
			 *
			 * @returns `{ chars, slots }`；遍历失败时返回 null。
			 */
			function flatten(root) {
			  const chars = [];
			  const slots = [];
			  /** 每个字符属于哪个**顶层块**（0 基）；不在任何块里的（输入区直排文本）为 -1。 */
			  const blockOf = [];
			  // 顶层块元素（内核里就是 `<p>`）。块下标按它们在 root.children 里的顺序。
			  const blocks = [];
			  for (const child of root.children) {
			    if (BLOCK_TAGS.has(child.tagName)) blocks.push(child);
			  }
			  const indexOfBlock = new Map(blocks.map((el, i) => [el, i]));

			  /**
			   * @param container 容器元素。
			   * @param block 该容器是否是块级（块级容器结尾的 `<br>` 才是占位产物）。
			   * @param top 该容器所属的顶层块下标（-1 = 不在块里）。
			   */
			  const walkChildren = (container, block, top) => {
			    const children = [...container.childNodes];
			    // 最后一个「有内容」的孩子（元素，或非空白文本）。只有它才可能是占位 `<br>`。
			    let last = -1;
			    for (let i = children.length - 1; i >= 0; i -= 1) {
			      const child = children[i];
			      if (child.nodeType === 1) {
			        last = i;
			        break;
			      }
			      if (child.nodeType === 3 && (child.nodeValue ?? '').trim() !== '') {
			        last = i;
			        break;
			      }
			    }

			    for (let i = 0; i < children.length; i += 1) {
			      const child = children[i];
			      if (child.nodeType === 3) {
			        const value = child.nodeValue ?? '';
			        for (let k = 0; k < value.length; k += 1) {
			          chars.push(value[k]);
			          slots.push({ kind: SLOT_TEXT, node: child, offset: k });
			          blockOf.push(top);
			        }
			        continue;
			      }
			      if (child.nodeType !== 1) continue;
			      if (child.tagName === 'BR') {
			        // 块尾占位 `<br>`：不占位（见上）。
			        if (block && i === last) continue;
			        chars.push('\n');
			        slots.push({ kind: SLOT_BR, node: child });
			        blockOf.push(top);
			        continue;
			      }
			      const childIsBlock = BLOCK_TAGS.has(child.tagName);
			      const inner = childIsBlock && indexOfBlock.has(child) ? indexOfBlock.get(child) : top;
			      walkChildren(child, childIsBlock, inner);
			      if (childIsBlock) {
			        chars.push('\n');
			        slots.push({ kind: SLOT_AFTER_BLOCK, parent: container, index: i + 1 });
			        blockOf.push(inner);
			      }
			    }
			  };

			  try {
			    walkChildren(root, true, -1);
			  } catch {
			    return null;
			  }
			  return { chars, slots, blockOf, blocks };
			}

			/** 去掉首尾空白后比较用（只用于尾部对齐判断）。 */
			function trimEnd(value) {
			  return value.replace(/[\s\u200b]+$/, '');
			}

			/**
			 * 把摊平流与草稿对齐。
			 *
			 * 正常情况下两者**逐字符相同**。差异只可能出现在**尾部**：内核会给每个块
			 * 渲染尾 `<br>`、也可能在末尾留一个空块。这里只修剪尾部，并且以**草稿**的
			 * 尾部形状为准（草稿才是权威）；中间有任何差异就返回 `ok: false`，
			 * 让调用方知道几何不可信。
			 *
			 * @returns `{ chars, ok }`。
			 */
			function alignWithDraft(chars, draft) {
			  const text = chars.join('');
			  if (text === draft) return { chars, ok: true };
			  if (trimEnd(text) !== trimEnd(draft)) return { chars, ok: false };
			  // 尾部形状按草稿补齐：草稿里那些没有 DOM 对应物的尾部字符
			  // （换行 / 空白）没有 rect，几何上按空行处理。
			  const kept = trimEnd(text).length;
			  const rebuilt = chars.slice(0, kept);
			  for (let i = kept; i < draft.length; i += 1) rebuilt.push(draft[i]);
			  return { chars: rebuilt, ok: true };
			}

			/**
			 * 由字符区间构造 `Range`。
			 *
			 * 区间退化（`from === to`，即空逻辑行）时返回 null —— 调用方按 1 行处理。
			 */
			function rangeOf(doc, slots, from, to) {
			  if (!(to > from)) return null;
			  const start = slots[Math.min(from, slots.length - 1)];
			  const end = slots[Math.min(to - 1, slots.length - 1)];
			  if (start === undefined || end === undefined) return null;
			  const range = doc.createRange();
			  const place = (slot, isStart) => {
			    if (slot.kind === SLOT_TEXT) {
			      const node = slot.node;
			      const length = node.nodeValue?.length ?? 0;
			      const offset = isStart ? slot.offset : Math.min(slot.offset + 1, length);
			      range[isStart ? 'setStart' : 'setEnd'](node, Math.max(0, Math.min(offset, length)));
			      return true;
			    }
			    if (slot.kind === SLOT_BR) {
			      range[isStart ? 'setStartBefore' : 'setEndAfter'](slot.node);
			      return true;
			    }
			    const parent = slot.parent;
			    if (parent === null || parent === undefined) return false;
			    const index = Math.max(0, Math.min(slot.index, parent.childNodes.length));
			    range[isStart ? 'setStart' : 'setEnd'](parent, index);
			    return true;
			  };
			  try {
			    if (!place(start, true) || !place(end, false)) return null;
			  } catch {
			    return null;
			  }
			  return range;
			}

			/**
			 * 数一个 `Range` 覆盖的视觉行数。
			 *
			 * ⚠️ 按 `rect.top` 去重 —— 见模块注释（`getClientRects()` 的个数不是行数）。
			 * 量不到时返回 0（调用方按 1 行兜底）。
			 */
			function rowsOfRange(range) {
			  if (range === null) return 0;
			  try {
			    const rects = range.getClientRects();
			    const tops = new Set();
			    for (const rect of rects) {
			      if (rect.height <= 0) continue;
			      tops.add(Math.round(rect.top));
			    }
			    return tops.size;
			  } catch {
			    return 0;
			  }
			}

			/**
			 * 量出编辑区当前的行几何。
			 *
			 * @param input `[data-composer-input]` 元素。
			 * @param draft 草稿全文 —— **逻辑行的唯一权威**，与模式一同源
			 *   （模式一：`text.split('\n')`）。传 `undefined` 时退回「按 DOM 换行切分」
			 *   的保底路径（会与模式一漂移，仅在拿不到草稿时使用）。
			 * @returns 下列对象；量不到时返回 null（调用方降级）。
			 *
			 * ```
			 * {
			 *   lineRows:  [3, 1, 2, ...],   // 每条逻辑行占几个视觉行
			 *   lineTops:  [0, 3, 4, ...],   // 每条逻辑行的起始视觉行号（0 基）
			 *   totalRows,                    // 视觉行总数
			 *   totalLines,                   // 逻辑行数
			 *   lineHeight,                   // 实测行高（px）
			 *   source,                       // 实际使用的行切分来源：'draft' | 'dom'
			 *   aligned,                      // 摊平流是否与草稿一致
			 * }
			 * ```
			 */
			function layoutOf(input, draft) {
			  if (input === null || input === undefined) return null;
			  const doc = input.ownerDocument;
			  const view = doc?.defaultView;
			  if (doc === null || doc === undefined || view === null || view === undefined) return null;

			  try {
			    // 行高必须**实测**：内核 `.input` 是 `line-height:inherit`，而 `.card` 是
			    // `calc(24px + var(--dsh-content-font-delta))` —— 随用户设置变。
			    // 写死 24px 会在放大字号时逐行错位。
			    const lineHeight = (() => {
			      const cs = view.getComputedStyle(input);
			      const lh = parseFloat(cs.lineHeight);
			      if (Number.isFinite(lh) && lh > 0) return lh;
			      const fs = parseFloat(cs.fontSize);
			      return Number.isFinite(fs) && fs > 0 ? fs * 1.7 : 24;
			    })();

			    const flat = flatten(input);
			    if (flat === null) return null;
			    const domText = flat.chars.join('');

			    // 草稿是权威。只有「草稿是空串而 DOM 有内容」时才退回 DOM
			    //（说明调用方没拿到 draft，此时用 DOM 比用空串更接近真实）。
			    const useDraft = typeof draft === 'string' && (draft.length > 0 || domText.length === 0);
			    const source = useDraft ? 'draft' : 'dom';
			    const text = useDraft ? draft : domText;
			    // ⚠️ 对齐失败时**仍然**用草稿的行数（草稿是内容的真值），但把
			    // `aligned: false` 暴露给调用方 —— 静默用错位的几何画行号比不画更糟。
			    // 尾部差异由 alignWithDraft 归一（内核的尾 <br> / 末尾空块）。
			    const aligned = useDraft ? alignWithDraft(flat.chars, draft) : { ok: true };
			    // 位置表沿用 DOM 自己的（对齐只修剪尾部）：尾部那些没有 DOM 对应物的
			    // 字符会被 rangeOf 的越界钳制落到最后一个已知位置，几何上等价于空行。
			    const slots = flat.slots;

			    const lines = text.split('\n');
			    const lineRows = [];
			    // 每条逻辑行落在哪个顶层块上（-1 = 不在块里）；后面用它做块级校正。
			    const lineBlock = [];
			    let cursor = 0;
			    for (const line of lines) {
			      const rows = rowsOfRange(rangeOf(doc, slots, cursor, cursor + line.length));
			      // 空逻辑行（区间退化）至少占 1 行 —— 空行在编辑器里确实占一行高。
			      lineRows.push(Math.max(1, rows));
			      lineBlock.push(cursor < flat.blockOf.length ? flat.blockOf[cursor] : -1);
			      cursor += line.length + 1; // +1 跳过该行末尾的换行字符
			    }

			    if (lineRows.length === 0) return null;

			    // ── 块级校正（⚠️ 这条是实测算出来的，别删）────────────────────────────
			    // 内核在最后一段上挂了一个**伪元素**提示：
			    //   .input p:last-child:after{content:var(--dsh-composer-hint)}
			    // （`/命令` 的用法提示，见 DraftEditor 的 `--dsh-composer-hint` 内联变量）。
			    // 伪元素**不在文本流里**，`Range.getClientRects()` 数不到它 —— 于是它把
			    // 最后一行挤到下一行时，我们的行数会比浏览器少 1。
			    // 独立验证（/tmp/epe-verify 的 Q1/Q2）实测：`hint="  / 查看命令"` 时
			    // 地面真值是 4 行，而纯 range 测量给出 3 行。
			    //
			    // 校正方式：**块自己的盒子高度**是浏览器给的权威值。若某块内只有一个
			    // 逻辑行（内核的常态：无硬换行），就直接采用「块高 ÷ 行高」而不是 range
			    // 的结论 —— 这样伪元素、装饰节点、任何行内不可见内容都被天然算进去。
			    // 块内有多个逻辑行时无法这样分摊（伪元素只影响最后一行），保留 range 结果。
			    const rowsByBlock = new Map();
			    for (let i = 0; i < lineRows.length; i += 1) {
			      const b = lineBlock[i];
			      if (b < 0) continue;
			      rowsByBlock.set(b, (rowsByBlock.get(b) ?? 0) + 1);
			    }
			    for (const [b, count] of rowsByBlock) {
			      if (count !== 1) continue;
			      const el = flat.blocks[b];
			      let measured = 0;
			      try {
			        const cs = view.getComputedStyle(el);
			        const pads = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
			        const border = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
			        measured = Math.max(0, el.getBoundingClientRect().height - pads - border);
			      } catch {
			        measured = 0;
			      }
			      if (!(measured > 0)) continue;
			      const rows = Math.max(1, Math.round(measured / lineHeight));
			      const index = lineRows.findIndex((_r, i) => lineBlock[i] === b);
			      if (index >= 0) lineRows[index] = rows;
			    }

			    const lineTops = [];
			    let acc = 0;
			    for (const rows of lineRows) {
			      lineTops.push(acc);
			      acc += rows;
			    }

			    return {
			      lineRows,
			      lineTops,
			      totalRows: acc,
			      totalLines: lineRows.length,
			      lineHeight,
			      source,
			      aligned: aligned.ok,
			    };
			  } catch {
			    return null;
			  }
			}

			/**
			 * 生成「按逻辑行交替」的条纹 `background-image`（**与模式一同一算法**）。
			 *
			 * 模式一用 `soft-wrap.js` 的 `stripeBackgroundOf(stripeSpansOf(rowCounts))`：
			 * 第 1、3、5… 条逻辑行（0 基偶数下标）着底色，同一条逻辑行的全部软换行
			 * 视觉行**同色**。这里用完全相同的相位与硬边规则，只是色标位置由
			 * `lineTops`（每条逻辑行的起始视觉行）算出。
			 *
			 * ⚠️ 亮段**两端**都要一对「同位置、不同色」的色标才是硬边；只在终点补
			 * `transparent` 会让上一段到本段之间**线性插值**成一整片渐变
			 * （实测：亮色多铺整整一个视觉行，81px 变成 108px）—— 这是模式一
			 * 2026-10-16 报的「模式一的背景错误了 颜色错误」。
			 *
			 * ⚠️ 色标里的颜色**必须**是 `var(--dsh-epe-stripe)`：裸写变量名时那个位置
			 * 既不是颜色也不是长度，整条 `background-image` 会被判无效并回落到 `none`
			 * —— 条纹一条都不显示，且控制台不报错（E-016 同族）。
			 *
			 * @param lineRows 每条逻辑行占的视觉行数。
			 * @param lineTops 每条逻辑行的起始视觉行号（0 基）。
			 * @param options `{ pad, line, stripe }`（CSS 字符串）。
			 * @returns `linear-gradient(...)`；没有要着色的行时返回 `"none"`。
			 */
			function stripeBackgroundOf(lineRows, lineTops, options = {}) {
			  const rows = Array.isArray(lineRows) ? lineRows : [];
			  if (rows.length === 0) return 'none';
			  const pad = options.pad ?? '0px';
			  const line = options.line ?? 'var(--dsh-epe-line)';
			  const stripe = options.stripe ?? 'var(--dsh-epe-stripe)';
			  const at = (row) => `calc(${pad} + ${line} * ${row})`;

			  const stops = ['transparent 0'];
			  let end = 0;
			  let any = false;
			  for (let index = 0; index < rows.length; index += 1) {
			    if (index % 2 !== 0) continue; // 0 基偶数 = 第 1、3、5… 条逻辑行
			    const start = Math.max(0, Math.round(toFinite(lineTops?.[index] ?? 0)));
			    const span = Math.max(1, Math.round(toFinite(rows[index] ?? 1)));
			    // 亮段起点与终点各要一对同位置色标（硬边），中间的空隙先封成透明。
			    stops.push(`transparent ${at(start)}`, `${stripe} ${at(start)}`, `${stripe} ${at(start + span)}`, `transparent ${at(start + span)}`);
			    end = start + span;
			    any = true;
			  }
			  if (!any) return 'none';
			  stops.push(`transparent ${at(end)}`);
			  return `linear-gradient(to bottom,${stops.join(',')})`;
			}

			/**
			 * 行号 gutter 里每个行号 span 的高度（px）—— 与模式一同一款式。
			 *
			 * 逻辑行占 N 个视觉行 → 那个行号的高度是 N × 行高，于是下一个行号自然落在
			 * 它自己那条逻辑行**实际开始**的视觉行上（模式一同名函数的语义）。
			 *
			 * @returns 高度数组；行高或行数非法时返回 null（调用方退回 CSS 的 min-height）。
			 */
			function gutterHeightsOf(lineRows, lineHeightPx) {
			  if (!Number.isFinite(lineHeightPx) || lineHeightPx <= 0) return null;
			  if (!Array.isArray(lineRows) || lineRows.length === 0) return null;
			  return lineRows.map((rows) => Math.max(1, Math.round(toFinite(rows))) * lineHeightPx);
			}

			Object.assign(__exports, { "layoutOf": layoutOf, "stripeBackgroundOf": stripeBackgroundOf, "gutterHeightsOf": gutterHeightsOf });
		});
		__dshRegistry.set("composer-gutter.js", (__exports) => {
			var module = { exports: __exports };
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
			const { createElement: h, useLayoutEffect, useRef, useState } = __dshExternal("react");
			const { createPortal } = __dshExternal("react-dom");
			const { gutterHeightsOf, layoutOf, stripeBackgroundOf } = __dshRequire("./composer-rows.js");

			/** gutter 的类名（CSS 在 `./extended-bar.js` 的 CSS_ID 里）。 */
			const GUTTER_CLASS = 'dsh-epe-xgutter';

			/** 找不到输入框时最多重试多少帧（≈2 秒 @60fps）。 */
			const ATTACH_TICKS = 120;

			/**
			 * 找到 `[data-composer-input]` 与承载它的 `.grow`。
			 *
			 * 用**公开属性**选择器（`data-composer-input`），不猜内核的哈希类名。
			 * `.grow` 取父元素而不是靠类名 —— 内核的 `.grow` 就是输入框的直接父级，
			 * 且它带 `position:relative`（行号绝对定位的落点）。
			 */
			function findComposerHosts(doc) {
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
			function applyLayout(input, layout) {
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
			function clearLayout(input) {
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
			function ComposerGutter(props) {
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

			Object.assign(__exports, { "GUTTER_CLASS": GUTTER_CLASS, "findComposerHosts": findComposerHosts, "applyLayout": applyLayout, "clearLayout": clearLayout, "ComposerGutter": ComposerGutter });
		});
		__dshRegistry.set("extended-bar.js", (__exports) => {
			var module = { exports: __exports };
			/**
			 * dsh-enhanced-prompt-editor —— 扩展输入框模式（模式二）的符号快捷键行。
			 *
			 * ## 它和面板里那条是什么关系
			 *
			 * **同一份符号表、同一份行为规则**（`./edit-ops.js`），只是作用对象不同：
			 *  - 面板里编辑的是 `textarea`，选区来自 `selectionStart/End`；
			 *  - 扩展输入框编辑的是内核的 Lexical contenteditable，写入要走内核 API。
			 *
			 * 所以这里**不重复实现「包裹」逻辑**：读出选中文字与全文，交给 `edit-ops.js`
			 * 的纯函数算出结果，再整体写回。这样「选中文字被框住而不是被替换」这条规则在
			 * 两个模式里天然一致，不会各修一份、各错一处。
			 *
			 * ## 为什么用 inputActions 而不是直接改 Lexical
			 *
			 * 内核给插件留了**官方程序化插入 API**（`inputActions` 是 session 级插槽的
			 * 标准席位）：
			 *
			 *  - `captureInsertion()` → `{ start, end, draftRev }`，坐标是**全文 detect 坐标**
			 *    （不是 Lexical 节点内 offset，跨段落也正确）；
			 *  - `insertText(text, span)` → 校验 `draftRev` 后替换该区间，并**自带提交机
			 *    防护**（`adjudicating`/`submitting` 阶段返回 `false`）。
			 *
			 * 直接用 Lexical 的 `_selection.anchor.offset` 是**节点内偏移**，跨段落会算错；
			 * 而且绕过提交机在敏感阶段写草稿会被静默拒绝。所以这里走官方通道。
			 * `insertText` 返回 `false` 表示这次草稿已变/正在提交，此时**不重试、不硬写**。
			 *
			 * ## 为什么按钮必须 onMouseDown preventDefault
			 *
			 * 一旦按钮拿到焦点，contenteditable 的选区就会塌掉，`captureInsertion()` 拿到
			 * 的区间会变成末尾的空区间，「包裹选中的文字」就落空了。阻止默认行为能让编辑器
			 * 始终持有选区。
			 *
			 * @module dsh-enhanced-prompt-editor/extended-bar
			 */
			const { createElement: h, Fragment } = __dshExternal("react");
			const { INDENT_BUTTONS, SYMBOLS, applySymbol, indentLines } = __dshRequire("./edit-ops.js");
			const { ensureCss: injectStyle } = __dshRequire("./css.js");
			const { ComposerGutter } = __dshRequire("./composer-gutter.js");

			const CSS_ID = 'dsh-enhanced-prompt-editor/extended-bar.css';
			const CSS = `
			/* 符号栏容器。
			   ⚠️ 居中：用户 2026-10-16 反馈「快捷栏没有居中对齐」。上一版用
			   flex:1 1 auto 让它占满剩余宽度、按钮靠左，视觉上整条偏左。
			   现在用 width:100% + justify-content:center：容器仍占满输入框宽度，
			   但**按钮组在容器内水平居中**（换行后的每一行也居中）。
			   不要改成 flex:none + margin:0 auto —— 块级 flex 容器 width:auto
			   本来就撑满父级，margin:auto 不起作用，按钮仍会靠左。
			   'max-width:100%' + 'flex-wrap' 保证窄窗口下换行而不溢出。 */
			/* 按钮高 28px、间距 6px —— 对齐内核底部控件的尺寸基准：
			   内核 .add（那个 + 按钮）实测 width:28px;height:28px，底部控件行 min-height:36px。
			   原来 24px 高 + 4px 间距在这个尺度下显得很挤
			   （用户 2026-10-16：「消息框，悬浮框，消息底部控件框太挤了」）。 */
			.dsh-epe-xbar{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:6px;width:100%;max-width:100%;min-width:0;padding:0 0 2px;margin:0}
			.dsh-epe-xkey{flex:none;height:28px;min-width:28px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.28));border-radius:7px;background:var(--dsw-specific-input-major,transparent);color:var(--dsw-alias-label-secondary,currentColor);font:500 13px/1 ui-monospace,SFMono-Regular,Menlo,monospace;cursor:pointer}
			.dsh-epe-xkey:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));color:var(--dsw-alias-label-primary,currentColor)}
			.dsh-epe-xkey:disabled{opacity:.45;cursor:default}
			.dsh-epe-xkey:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#5686fe);outline-offset:1px}
			/* 分隔条高度跟随按钮（28px）按比例放大：18px 比按钮略矮，视觉上是分隔而不是截断。 */
			.dsh-epe-xkeySep{flex:none;width:1px;height:18px;margin:0 4px;background:var(--dsw-alias-border-l1,rgba(127,127,127,.28))}

			/* ── 模式二的行号 + 逻辑行交替底色（与模式一同款功能）────────────────────
			   模式二的编辑区是**内核的 Lexical contenteditable**，不是我们的 textarea，
			   所以既不能给它加 background-image，也没有我们自己的行高变量可用。
			   做法（离屏 Chromium 实测可行，见 test/extended-bar-geometry.test.mjs）：

			   内核（dsh-client-ui-conversation/lib/client.js）的真实结构与几何：
			     .card[data-composer-card]
			       .scroll[data-input-scroll]      overflow-y:auto
			         .grow{position:relative}
			           .input[data-composer-input]  contenteditable
			             padding:4px 8px 0 14px; min-height:36px;
			             line-height:calc(24px + var(--dsh-content-font-delta,0px))
			             p{margin:0}                  一个逻辑行 = 一个 p
			   软换行的物理行**没有独立元素**，它们共用那一个 p 的盒子。

			   于是：交替底色画在 p 的盒子上。p 的盒高天然等于该逻辑行全部物理行之和，
			   所以「同一逻辑行的软换行物理行同色」自动成立，且**不依赖任何行高数值**
			   —— 不需要模式一那套整数行高的渐变（这里的行高由内核变量决定，我们读不到
			   也不该覆盖它）。行号同理：用 CSS counter 直接数 p 的个数，不用 JS 测量。

			   三个必须点：
			   1. 段落盒子要横向铺满整个输入区，做法是「负 margin + 等量 padding」相消：
			      文字位置一格不动（离屏实测文字仍在 p 的 content box 起点），而盒子边界
			      扩到输入框自身的 padding 区。这样条纹才铺满整行，行号也才有地方放。
			      ⚠️ 不要用改 input 的 padding 来腾地方 —— 那会把文字整体推右、改变内核
			      的换行位置，等于重排宿主输入区（E-011 的同类错误：动了不该动的盒子）。
			   2. 行号纵向必须落在该 p 的**第一个物理行**里：::before 用 top:0 且
			      line-height:inherit，让它与首行的行盒同高同位，基线自然对齐。
			      若改成垂直居中（top:50% / translateY(-50%)），多物理行的行号会跑到中间，
			      几何测试会变红。
			   3. 内核对齐锚点只用了公开属性 data-composer-input 与
			      html 上的 data-dsh-epe-extended（由 native-composer.js 写入），
			      不猜内核的哈希类名。
			   ⚠️ 本段注释绝不能出现反引号 —— 它落在 CSS 模板字符串内部，会提前闭合字符串。 */
			/* ── 行号沟槽 + 交替底色 ─────────────────────────────────────────────
			   ⚠️⚠️ 2026-10-16 修正：这里原先用 CSS counter 数 > p
			   （counter-reset / counter-increment / nth-of-type(odd)）。**那是错的** ——
			   内核的粘贴通道是 insertRawText()，文本里的换行变成 <br>
			   （LineBreakNode.createDOM() → "br"），**不是新的 <p>**。
			   粘一个 80 行提示词只得到「1 个 p + 79 个 br」，
			   counter 恒为 1、nth-of-type(odd) 只命中那唯一的 p
			   → 用户报的「模式二没有行标数、背景色不变化」。
			   离屏实测真实产物：pCount=1, brCount=7, textLines=8, lineNumbers=1。
			   详见 ./composer-rows.js 的模块注释。

			   现在改成**按视觉行**：行数由 JS 量真实行盒（composer-rows.js），
			   底色写成每个 p 的 inline background-image，行号渲染成绝对定位的 gutter。
			   两者都不改内核 DOM。 */

			/* ⚠️⚠️ 这两个变量必须在**模式二自己的作用域**里定义。
			   --dsh-epe-line / --dsh-epe-stripe 原先只在 panel.js 的 CSS 里定义
			   （作用域是侧栏面板），模式二里根本不存在 —— 而 var(--x) 在未定义时
			   会让**整条 background-image 被判无效并丢弃**，浏览器不报错。
			   实测表现为 getComputedStyle(p).backgroundImage === "none"，
			   条纹一条都不显示（与 E-016 同族：静默失效）。
			   行高由 JS 按实测值写进 inline style（见 composer-gutter.js）；
			   这里的值是首帧 / 降级时的兜底。 */
			html[data-dsh-epe-extended] [data-composer-input]{
			  --dsh-epe-line:24px;
			  --dsh-epe-stripe:color-mix(in srgb,var(--dsw-alias-label-primary,currentColor) 5%,transparent);
			  position:relative
			}
			html[data-dsh-epe-extended] [data-composer-input]:focus{
			  --dsh-epe-stripe:color-mix(in srgb,var(--dsw-alias-brand-primary,#5686fe) 7%,transparent)
			}
			/* ⚠️⚠️ 底色**不再**画在 <p> 上，而是画在**输入区自身**（background-image）。
			   用户 2026-10-17：「分行依旧未使用模式一的实现 你不能照搬吗」——
			   模式一的底色就是整块画在编辑区元素上的（panel.js 把 backgroundImage
			   写在 textarea 的 style 上），行号是**编辑区之外的独立一列**。
			   画在 <p> 上会引出一堆特例：粘贴产物可能只有 1 个 <p>（换行全在文本节点
			   里）、也可能是 N 个 <p>，还得逐个折算局部行号 —— 那正是前两版错误的来源。
			   画在输入区上，几何就只有一套：逻辑行 → 视觉行 → 渐变带。
			   ⚠️ background-origin/clip: content-box 让条纹**只铺在文字列**上，
			   与模式一一致（模式一的 gutter 是独立一列、不染色）。JS 会读回
			   background-origin 决定渐变起点该不该减 padding-top —— 两边不会漂移。 */
			html[data-dsh-epe-extended] [data-composer-input]{
			  background-repeat:no-repeat;background-origin:content-box;background-clip:content-box
			}

			/* ⚠️ 行号要占**真实宽度**，不能压在文字上（用户 2026-10-17：「行标与光标重叠」）。
			   模式一的布局是 flex 两列：gutter（flex:none）+ textarea —— 行号独占一列，
			   文字在它**右边**，永远不会被盖住。这里照搬：
			     · 输入区 padding-left = 沟槽宽（行号列，文字列的起点）
			     · 行号 gutter 绝对定位在 0..沟槽宽
			     · 文字从内容盒左缘（= 沟槽右缘）开始
			   ⚠️ 曾经用「<p> 负 margin 把盒子拉回输入区左缘」的写法，那是错的 ——
			   文字会被拉回 14px，正好落在 0..26px 的行号列**下面**（用户截图里
			   「行标与光标重叠」就是这个）。行号列必须真正把文字挤到右边。
			   ⚠️ 三个数**不是同一个值**，写成一个就会再次重叠或推偏文字。 */
			html[data-dsh-epe-extended] [data-composer-input]{
			  --dsh-epe-gutter-w:26px;
			  padding-left:var(--dsh-epe-gutter-w);
			}
			/* 占位提示（内核 .placeholder）是**独立兄弟节点**，inset 里写死左 14px。
			   沟槽加宽后它不跟随 —— 不补这条，占位文字会压在行号列上。
			   data-composer-placeholder 是内核公开属性（见 DraftEditor 的 JSX）。 */
			html[data-dsh-epe-extended] [data-composer-placeholder]{left:var(--dsh-epe-gutter-w,26px)}

			/* 行号 gutter：绝对定位在 .grow 内（内核 .grow 是 position:relative）。
			   ⚠️ 它必须是**不接收指针事件**的纯装饰；点击穿透到输入区，光标行为不变。
			   span 的高度 = 该逻辑行占的视觉行数 × 实测行高（与模式一同款算法），
			   所以下一个行号自然落在它自己那条逻辑行真正开始的视觉行上。 */
			.dsh-epe-xgutter{position:absolute;top:0;left:0;width:var(--dsh-epe-gutter-w,26px);
			  box-sizing:border-box;padding-right:6px;text-align:right;
			  color:var(--dsw-alias-label-tertiary,currentColor);opacity:.55;font-weight:400;
			  font-size:var(--dsh-epe-gutter-font,12px);
			  line-height:var(--dsh-epe-line,24px);
			  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-variant-numeric:tabular-nums;
			  pointer-events:none;user-select:none;z-index:1;overflow:hidden}
			.dsh-epe-xgutter span{display:block;width:100%;text-align:right;white-space:nowrap;overflow:hidden}
			`;

			/**
			 * 扩展输入框模式的符号行（也是「原生 + 悬浮 deck」时复用的那个 deck）。
			 *
			 * @param props 由插槽注入：`t`、`useVisible()`（deck 是否可见：扩展模式
			 *   **或** 原生模式勾选了「原生应用悬浮 deck」）、`useExtended()`
			 *   （是否真的处于扩展输入框模式 —— 决定要不要画行号沟槽）、
			 *   `inputActions`（标准席位，官方程序化插入通道）、`useInput()`
			 *   （标准席位，读草稿全文）。
			 */
			function ExtendedSymbolBar(props) {
			  injectStyle(CSS_ID, CSS, 'dsh-enhanced-prompt-editor');
			  const { t, useVisible, useExtended, inputActions, useInput } = props;

			  // 草稿全文来自标准席位 useInput（投影里的 `draft`）。必须放在组件顶层
			  // （Rules of Hooks），不能塞进事件回调。
			  const draft = useInput === undefined ? '' : useInput((state) => state?.draft ?? '');

			  // ⚠️ `visible` 必须走快照源绑定出来的 hook：插槽渲染器把 inject 的结果按
			  // (entry, binding) 缓存且永不失效，传值会把它冻在第一帧，切回原生后这条还在。
			  const visible = useVisible((value) => value);
			  /**
			   * 是否处于**扩展输入框模式**（决定要不要画行号沟槽 + 隔行底色）。
			   *
			   * ⚠️ 与 `visible` 是两个判断：`visible` 还包含「原生 + 悬浮 deck」，
			   * 而那种情形**只要 deck**，不要行号。
			   *
			   * ⚠️ hook 必须**无条件按同一位置**调用。注入面一定给 `useExtended`，
			   * 但万一没给（旧宿主/单测面），退回到 `useVisible` —— 两者内部 hook 数量
			   * 一致，因此不会破坏 Rules of Hooks，也不会让整条插槽被撤销。
			   */
			  const extendedHook = typeof useExtended === 'function' ? useExtended : useVisible;
			  const extended = extendedHook((value) => value) === true;
			  if (visible !== true) return null;

			  /**
			   * 对原生输入框做一次「整块替换」编辑。
			   *
			   * @param compute `(text, start, end) => { text, selStart, selEnd }`，
			   *   由 `edit-ops.js` 的纯函数提供。
			   */
			  const apply = (compute) => {
			    if (inputActions === undefined || inputActions === null) return;
			    let span;
			    try {
			      span = inputActions.captureInsertion?.();
			    } catch {
			      return;
			    }
			    if (span === undefined || span === null) return;

			    // `captureInsertion()` 给的是**全文 detect 坐标**下的区间（与 draft 的
			    // 字符下标一致），不是 Lexical 节点内 offset——所以直接拿它切 draft 是对的。
			    const full = typeof draft === 'string' ? draft : '';
			    const start = Number.isFinite(span.start) ? span.start : full.length;
			    const end = Number.isFinite(span.end) ? span.end : start;
			    const selected = full.slice(Math.min(start, end), Math.max(start, end));

			    // 关键：`insertText(text, span)` 的语义是**用 text 替换该 span**（内核
			    // `$replaceDetectSpanWithText` → `selection.insertText`，会先 removeText）。
			    // 所以「包裹」= 传入 `符号 + 选中文字 + 符号`。
			    // 这里用 edit-ops 的纯函数算出这串文本，与面板共用同一份规则。
			    const wrapped = compute(selected, 0, selected.length);
			    if (wrapped === undefined || wrapped === null) return;
			    const payload = wrapped.text;
			    if (payload === selected) return; // 没有变化就不写。

			    try {
			      // `insertText` 自己校验 draftRev；返回 false 说明草稿已变或在提交中，
			      // 此时**不重试**——重试会拿过期区间去改新草稿，反而破坏内容。
			      inputActions.insertText?.(payload, span);
			    } catch {
			      // 插槽渲染期抛错会让条目被永久撤销；这里必须自己兜住。
			    }
			  };

			  const key = (keyName, label, title, onClick) =>
			    h(
			      'button',
			      {
			        key: keyName,
			        type: 'button',
			        className: 'dsh-epe-xkey',
			        title,
			        'aria-label': title,
			        // 阻止抢焦点：否则 contenteditable 选区塌掉，captureInsertion 落到末尾。
			        onMouseDown: (event) => event.preventDefault(),
			        onClick,
			      },
			      label,
			    );

			  // 行号 gutter + 交替底色：portal 到内核编辑区里，不改内核 DOM。
			  // ⚠️ 必须把 `draft` 传进去：逻辑行以**草稿文本**为唯一权威
			  //（与模式一的 `text.split('\n')` 同源），见 composer-gutter.js 的模块注释。
			  // ⚠️ 只属于**扩展输入框模式**：原生模式勾选「应用悬浮 deck」时只借这条 deck，
			  // 不加行号、不改原生外观（`extended` 与 `visible` 的差别）。
			  // 与符号栏并列返回（Fragment），两者各自独立失败互不影响。
			  const gutter = extended ? h(ComposerGutter, { active: true, draft }) : null;

			  return h(
			    Fragment,
			    null,
			    gutter,
			    h(
			    'div',
			    {
			      className: 'dsh-epe-xbar',
			      role: 'toolbar',
			      'aria-label': t?.('panel.keys') ?? 'Insert',
			    },
			    SYMBOLS.map((symbol) =>
			      key(symbol.key, symbol.label, `${t?.(`symbol.${symbol.key}`) ?? symbol.label} ${symbol.label}`, () =>
			        apply((text, start, end) => applySymbol(text, start, end, symbol)),
			      ),
			    ),
			    h('span', { className: 'dsh-epe-xkeySep', 'aria-hidden': true }),
			    INDENT_BUTTONS.map((button) =>
			      key(button.key, button.label, t?.(`panel.${button.key}`) ?? button.label, () =>
			        apply((text, start, end) => indentLines(text, start, end, button.outdent)),
			      ),
			    ),
			    ),
			  );
			}

			Object.assign(__exports, { "ExtendedSymbolBar": ExtendedSymbolBar });
		});
		__dshRegistry.set("float-position.js", (__exports) => {
			var module = { exports: __exports };
			/**
			 * dsh-enhanced-prompt-editor —— 悬浮定位的**纯计算**部分。
			 *
			 * 单独成模块（不 import react / 不碰 DOM）是为了**能被测试直接导入**。
			 * `./floating-bar.js` 依赖 react，测试无法整模块加载它；若把算法抄一份进测试，
			 * 抄件与实现会漂移 —— 本项目已经吃过「测试复刻实现，实现改错而测试照旧绿」的亏
			 *（见 `~/.dsh/TASTE.md` 的 E-014 与 stripe-geometry 那一轮）。
			 *
			 * @module dsh-enhanced-prompt-editor/float-position
			 */

			/**
			 * 悬浮条底边与输入框上沿之间的间距（px）。
			 *
			 * 用户 2026-10-16：「消息框，悬浮框，消息底部控件框太挤了」。
			 * 10px 让三块（消息区 / 符号栏 / 输入框）之间有明显分界，又不显得空。
			 * 这是唯一该调的「间距」旋钮。
			 */
			const GAP_ABOVE_INPUT = 10;

			/**
			 * 悬浮条**上方**额外留的呼吸空间（px）。
			 *
			 * 预留带只按「正好放下悬浮条」时，预留带上沿会紧贴悬浮条顶边，看起来仍像挤在一起；
			 * 多出来的这点让预留带比悬浮条大一圈。
			 */
			const RESERVE_EXTRA = 6;

			/**
			 * 算出「输入框顶部之外需要预留的空白高度」。
			 *
			 * 用户 2026-10-16 的两次原话（后者是对前者的更正）：
			 *  1. 「有了悬浮栏 你就需要让消息输入框的顶部预留悬浮栏那么高的空白
			 *      否则消息底部控件会和悬浮栏重叠」
			 *  2. 「**你把预留高度加在输入框内了 应该是输入框外顶部**」
			 *
			 * ## 为什么这里只需一个入参（这是刻意的）
			 *
			 * 曾经的实现会去**测**「输入框上方本来有多少空隙」，再拿它去算预留。
			 * 那个做法有个致命缺陷：**预留本身会改变布局**，于是「量到的空隙」在下一帧变了，
			 * 预留跟着再变 —— 离屏实测该实现每帧 +41px，序列
			 * `41 → 82 → 123 → 164 → 205px` **无限膨胀**，输入框会越长越高。
			 *
			 * 现在的做法在结构上消除了这个环：预留只由**悬浮条自身高度**决定
			 * （`GAP + 高度 + 呼吸`），这是一个**常量**，与卡片/编辑区的位置无关，
			 * 因此不可能形成反馈。代价只是预留带比「按需计算」略宽一点点
			 * （自然空隙那几像素会叠加），而用户要的就是「预留悬浮栏**那么高**的空白」。
			 *
			 * ## 恒等式（测试断言的就是它）
			 *
			 * `预留 ≥ GAP + 悬浮条高度`
			 * —— 这正是「悬浮条不覆盖上方内容」的充要条件。
			 *
			 * @param hostHeight 悬浮条实测高度。
			 * @returns 形如 `"50px"` 的字符串；脏输入按 0 处理，结果恒为正。
			 */
			function reserveHeightFor(hostHeight) {
			  const height = toNonNegative(hostHeight);
			  return `${Math.round(GAP_ABOVE_INPUT + height + RESERVE_EXTRA)}px`;
			}

			/**
			 * 算出悬浮条应设的 `top` 值（相对 `[data-composer-overlay]` 锚点）。
			 *
			 * ## 语义：底边贴在**输入框（卡片）上沿**之上 `GAP` 处
			 *
			 * `[data-composer-overlay]` 是卡片内一个 `height:0;position:absolute;inset:0 0 auto`
			 * 的锚点，就在**卡片顶边**上。所以把 `top` 取成 `-(GAP + 高度)`，
			 * 悬浮条的底边就落在卡片顶边之上 `GAP` 处 —— 即「悬浮在输入框**上方**」。
			 *
			 * ## 为什么不锚定编辑区（曾经那么做过）
			 *
			 * 内核渲染顺序是 `卡片 > [overlayAnchor, accessory, attachments, 编辑区, 控件行]`。
			 * 若按「编辑区顶 − GAP − 高度」定位，当卡片里编辑区上方还有别的东西
			 * （accessory、`conversation.input.attachments` 的附件框）时，
			 * 算出来的位置会**落进卡片内部**，压住那些元素 —— 而预留加在卡片外就救不了它。
			 * 锚定卡片顶边则恒定在**输入框外面、上方**，与卡片内部结构无关。
			 *
			 * @param hostHeight 悬浮条自身高度。⚠️ 必须在元素已是 `position:absolute`
			 *   **之后**再量，否则量到的是它在文档流里的高度（含 margin），算出的 top 会偏。
			 * @returns 形如 `"-44px"` 的字符串。脏输入（undefined/NaN）按 0 处理，绝不产生 NaN。
			 */
			function floatTopFor(hostHeight) {
			  const height = toNonNegative(hostHeight);
			  return `${-Math.round(GAP_ABOVE_INPUT + height)}px`;
			}

			/**
			 * 把任意输入收敛成有限数字；非有限值一律当 0。
			 *
			 * 用 `Number()` 而不是直接 `Number.isFinite`：`getBoundingClientRect()` 给的是
			 * 数字，但测试或将来的调用方可能传数字字符串（`"160"`），直接判 `isFinite`
			 * 会把它误当 0。`Number('')` 是 0、`Number(undefined)` 是 NaN，两者都落到 0。
			 */
			function toFinite(value) {
			  const n = Number(value);
			  return Number.isFinite(n) ? n : 0;
			}

			/**
			 * 同 {@link toFinite}，但把负数也收敛成 0。
			 *
			 * 用于「物理上不可能为负」的量（长度）。负数只会来自量到错位的盒子或脏输入，
			 * 放行会算出比实际需要更小的预留（甚至为负），让悬浮条压住上方内容。
			 */
			function toNonNegative(value) {
			  return Math.max(0, toFinite(value));
			}

			Object.assign(__exports, { "GAP_ABOVE_INPUT": GAP_ABOVE_INPUT, "RESERVE_EXTRA": RESERVE_EXTRA, "reserveHeightFor": reserveHeightFor, "floatTopFor": floatTopFor });
		});
		__dshRegistry.set("floating-bar.js", (__exports) => {
			var module = { exports: __exports };
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
			const { createElement: h, useEffect, useRef } = __dshExternal("react");
			const { ensureCss: injectStyle } = __dshRequire("./css.js");
			const { floatTopFor, reserveHeightFor } = __dshRequire("./float-position.js");


			const CSS_ID = 'dsh-enhanced-prompt-editor/floating-bar.css';

			/**
			 * 「本插件的悬浮 deck 正在显示」的 `<html>` 属性。
			 *
			 * 与 `native-composer.js` 的 `MARK_ATTR`（扩展输入框模式）**是两件事**：
			 * 原生模式 + 勾选 `nativeDeck` 时只会打这一个，扩展模式两个都打。
			 */
			const DECK_ATTR = 'data-dsh-epe-deck';

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
			function FloatingSymbolBar(props) {
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
			function positionAboveInput(host) {
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

			Object.assign(__exports, { "DECK_ATTR": DECK_ATTR, "FloatingSymbolBar": FloatingSymbolBar, "positionAboveInput": positionAboveInput });
		});
		__dshRegistry.set("audio.js", (__exports) => {
			var module = { exports: __exports };
			/**
			 * dsh-enhanced-prompt-editor —— 浏览器侧音频采集（纯函数 + 采集器）。
			 *
			 * 与 DSH 语音插件共用同一份宿主契约：16 kHz 单声道 PCM16 WAV，base64
			 * 走 JSON Remote。这里不 import 任何 DSH 包，因此可以独立单测。
			 *
			 * @module dsh-enhanced-prompt-editor/audio
			 */

			/** 采集失败的原因码，由调用方本地化。 */
			class RecordingError extends Error {
			  constructor(kind) {
			    super(kind);
			    this.kind = kind;
			    this.name = 'RecordingError';
			  }
			}

			/**
			 * 把浮点采样编成 Host 接受的规范 PCM16 WAV。
			 *
			 * @param samples 16 kHz 单声道、范围 [-1,1] 的采样。
			 * @returns 完整的 little-endian WAV 字节。
			 */
			function encodeWave(samples) {
			  const bytes = new Uint8Array(44 + samples.length * 2);
			  const view = new DataView(bytes.buffer);
			  const writeAscii = (at, value) => {
			    for (let i = 0; i < value.length; i += 1) bytes[at + i] = value.charCodeAt(i);
			  };
			  writeAscii(0, 'RIFF');
			  view.setUint32(4, bytes.length - 8, true);
			  writeAscii(8, 'WAVE');
			  writeAscii(12, 'fmt ');
			  view.setUint32(16, 16, true);
			  view.setUint16(20, 1, true); // PCM
			  view.setUint16(22, 1, true); // mono
			  view.setUint32(24, 16000, true);
			  view.setUint32(28, 32000, true);
			  view.setUint16(32, 2, true);
			  view.setUint16(34, 16, true);
			  writeAscii(36, 'data');
			  view.setUint32(40, samples.length * 2, true);
			  for (let i = 0; i < samples.length; i += 1) {
			    const value = Math.max(-1, Math.min(1, samples[i]));
			    view.setInt16(44 + i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
			  }
			  return bytes;
			}

			/** 把二进制录音编码为 Remote 用的 base64（不带 data URL 前缀）。 */
			function audioBase64(bytes) {
			  let text = '';
			  for (let i = 0; i < bytes.length; i += 8192) {
			    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
			  }
			  return btoa(text);
			}

			/** 浏览器是否具备录音能力。 */
			function canRecord(nav = globalThis.navigator) {
			  return typeof MediaRecorder !== 'undefined' && nav?.mediaDevices?.getUserMedia !== undefined;
			}

			/**
			 * 一次麦克风采集。
			 *
			 * 生命周期与语音插件保持一致：`start` 拿到轨道后开始录，`stop` 停止并
			 * 重采样成 16 kHz 单声道，`dispose` 释放轨道与 AudioContext。任何路径
			 * 都保证释放一次。
			 */
			class Recording {
			  constructor({ deviceId, onError } = {}) {
			    this.deviceId = deviceId;
			    this.onError = onError;
			    this.chunks = [];
			    this.stream = undefined;
			    this.recorder = undefined;
			    this.context = undefined;
			    this.disposal = undefined;
			    this.abort = new AbortController();
			  }

			  /** 开始采集；权限被拒或设备不可用时抛 RecordingError。 */
			  async start() {
			    try {
			      const constraints = { audio: this.deviceId !== undefined ? { deviceId: { exact: this.deviceId } } : true };
			      const stream = await navigator.mediaDevices.getUserMedia(constraints);
			      if (this.abort.signal.aborted) {
			        for (const track of stream.getTracks()) track.stop();
			        throw new RecordingError('cancelled');
			      }
			      this.stream = stream;
			      const recorder = new MediaRecorder(stream);
			      this.recorder = recorder;
			      recorder.ondataavailable = (event) => {
			        if (event.data?.size > 0) this.chunks.push(event.data);
			      };
			      recorder.onerror = () => {
			        this.onError?.(new RecordingError('interrupted'));
			      };
			      recorder.start();
			    } catch (error) {
			      await this.dispose();
			      if (error instanceof RecordingError) throw error;
			      const message = error instanceof Error ? error.message : String(error);
			      throw new RecordingError(/denied|not allowed/i.test(message) ? 'permission' : 'unavailable');
			    }
			  }

			  /**
			   * 结束采集并返回 WAV 字节。
			   *
			   * @param maxDurationSeconds 宿主声明的时长上限；超时部分直接截断。
			   * @returns 完整的 WAV 字节。
			   */
			  async stop(maxDurationSeconds) {
			    const recorder = this.recorder;
			    if (recorder === undefined || recorder.state !== 'recording') {
			      await this.dispose();
			      throw new RecordingError('empty');
			    }
			    try {
			      await new Promise((resolvePromise, reject) => {
			        recorder.onstop = () => resolvePromise();
			        recorder.onerror = () => reject(new RecordingError('empty'));
			        recorder.stop();
			      });
			      for (const track of this.stream?.getTracks() ?? []) track.stop();
			      const blob = new Blob(this.chunks, { type: recorder.mimeType });
			      if (blob.size === 0) throw new RecordingError('empty');
			      const AudioContextCtor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
			      const context = new AudioContextCtor();
			      this.context = context;
			      const decoded = await context.decodeAudioData(await blob.arrayBuffer());
			      const seconds = Math.max(1, Math.floor(Math.min(decoded.duration, maxDurationSeconds) * 16000));
			      const offline = new OfflineAudioContext(1, seconds, 16000);
			      const source = offline.createBufferSource();
			      source.buffer = decoded;
			      source.connect(offline.destination);
			      source.start();
			      const resampled = await offline.startRendering();
			      return encodeWave(resampled.getChannelData(0));
			    } finally {
			      await this.dispose();
			    }
			  }

			  /** 释放轨道、录制器与 AudioContext（幂等）。 */
			  dispose() {
			    if (this.disposal === undefined) {
			      this.abort.abort();
			      this.disposal = (async () => {
			        try {
			          if (this.recorder !== undefined && this.recorder.state !== 'inactive') {
			            try {
			              this.recorder.stop();
			            } catch {
			              // 已经停掉就无所谓。
			            }
			          }
			          for (const track of this.stream?.getTracks() ?? []) {
			            try {
			              track.stop();
			            } catch {
			              // 轨道可能已被系统回收。
			            }
			          }
			          if (this.context !== undefined) await this.context.close().catch(() => undefined);
			        } finally {
			          this.stream = undefined;
			          this.recorder = undefined;
			          this.context = undefined;
			        }
			      })();
			    }
			    return this.disposal;
			  }
			}

			Object.assign(__exports, { "RecordingError": RecordingError, "encodeWave": encodeWave, "audioBase64": audioBase64, "canRecord": canRecord, "Recording": Recording });
		});
		__dshRegistry.set("soft-wrap.js", (__exports) => {
			var module = { exports: __exports };
			/**
			 * dsh-enhanced-prompt-editor —— 软换行测量，以及「按逻辑行」的条纹 / 行号几何。
			 *
			 * ## 这个模块解决什么
			 *
			 * 编辑区是原生 `textarea`，一条**逻辑行**（一个 `\n` 之间的片段）在容器里
			 * 可能占多个**物理行**（自动换行）。用户 2026-10-16 报的两个错位都来自
			 * 「按逻辑行算、按物理行画」这个不一致：
			 *
			 * 1. 行号：逻辑行 1 占了 3 个物理行时，行号「2」必须出现在**第 4 个物理行**
			 *    的高度上（旧实现每个行号固定一行高 → 「2」浮在第 2 个物理行）。
			 * 2. 条纹：同一个逻辑行占的 3 个物理行必须**同色**（旧实现是
			 *    repeating-linear-gradient 按物理行交替 → 一条逻辑行被切成两种底色）。
			 *
			 * ## 为什么零 import、为什么测量要放在这里
			 *
			 * 这两个能力都必须在**真实 Chromium** 里做几何测试，而且测试必须跑
			 * **逐字未改的生产代码**，不能在测试里重写一份近似实现 —— 「测试里那份实现
			 * 与生产那份不一样」正是 E-014 事故（条纹首带被 padding 撑长、107 个测试全绿
			 * 而 bug 健在）的成因。零依赖让测试可以把本文件当普通 ES 模块直接 import 进
			 * 离屏页面。因此**不要**给本文件加 import。
			 *
			 * ## 测量方式：隐藏镜像（与生产 textarea 同字体、同宽）
			 *
			 * 在编辑区所在容器里挂一个**隐藏的镜像 textarea**（absolute 定位，脱离 flex
			 * 流，不影响布局），宽度设成编辑区的内容宽度，然后逐逻辑行 `value = 行文本`
			 * 后读 `scrollHeight`。实测（离屏 Chromium，ui-monospace 16px/27px，内容宽
			 * 369px）与真实 textarea 在 22 组语料上**逐行完全一致**：纯 ASCII 长串、
			 * 中英混排、CJK、长 URL、连续空格、前导空格、tab、emoji、HTML 实体都覆盖。
			 *
			 * ⚠️ 两个已验证的坑，改测量方式时别踩回去：
			 *
			 * 1. **不能用 div 当镜像**。div 的 `overflow-wrap:break-word` 对「无空格的
			 *    超长 token」不会在任意字符处断行，同一容器宽度下比 textarea **少算 1
			 *    行**（实测 200 个 M：textarea 5 行、div 6 行）。textarea 视口宽度的换行
			 *    是另一套算法。
			 * 2. **镜像宽度必须是 textarea 的 content 宽度**（`clientWidth-2*padding`，
			 *    并扣掉占宽的滚动条），不是 `clientWidth`。差 24px 时同一段文本
			 *    textarea 量到 80 字符/行、镜像 40 字符/行 —— 行号会整篇错位。
			 * 3. 每次改 `value` 后要**强制重排**（读一次 `offsetHeight`）。不读时
			 *    Chromium 会把上一次的 `scrollHeight` 回给你（表现为「相邻两行同色」）。
			 *
			 * ## 降级
			 *
			 * 容器还没布局（宽度为 0）时 `rowCounts` 返回 `null`，调用方退回
			 * 「每个逻辑行占 1 个物理行」的旧几何（行号等距、条纹按物理行交替）。
			 * 这时**不会**比较错行到 0/负数，也不会抛错。
			 *
			 * @module dsh-enhanced-prompt-editor/soft-wrap
			 */

			/** 镜像元素的类名。⚠️ 与 panel.js 的 CSS 里那两条规则必须一致（有测试钉住）。 */
			const MEASURE_CLASS = 'dsh-epe-measure';

			/** 镜像宿主的类名：0 尺寸、绝对定位，只为让 React 拥有一个可以挂镜像的容器。 */
			const MEASURE_HOST_CLASS = 'dsh-epe-measureHost';

			/** 把任意外部输入收敛成「每个逻辑行占几个物理行」的数组。 */
			function normalizeRowCounts(rowCounts) {
			  if (!Array.isArray(rowCounts) || rowCounts.length === 0) return [1];
			  return rowCounts.map((rows) => (Number.isFinite(rows) && rows >= 1 ? Math.round(rows) : 1));
			}

			/**
			 * 测编辑区**内容宽度**（textarea 用它换行的那一条宽度）。
			 *
			 * `clientWidth` 是取整过的，且包含 padding、不含占宽的滚动条；这里用
			 * `getBoundingClientRect().width`（亚像素）减边框、padding、滚动条，
			 * 让镜像拿到与 textarea 真正一致的换行宽度。
			 *
			 * @returns 内容宽度（px）；容器还没布局（宽度 <= 0）时返回 null。
			 */
			function contentWidthOf(editor) {
			  if (editor === null || editor === undefined) return null;
			  const view = editor.ownerDocument?.defaultView;
			  if (view === null || view === undefined) return null;
			  const cs = view.getComputedStyle(editor);
			  const px = (value) => {
			    const n = parseFloat(value);
			    return Number.isFinite(n) ? n : 0;
			  };
			  const borders = px(cs.borderLeftWidth) + px(cs.borderRightWidth);
			  const pads = px(cs.paddingLeft) + px(cs.paddingRight);
			  // offsetWidth 与 clientWidth 都是取整值，但两者之差就是占宽的滚动条宽度。
			  const scrollbar = Math.max(0, (editor.offsetWidth ?? 0) - (editor.clientWidth ?? 0));
			  const width = editor.getBoundingClientRect().width - borders - pads - scrollbar;
			  return width > 0 ? width : null;
			}

			/**
			 * 镜像元素当前占几个物理行。
			 *
			 * `scrollHeight` 含 padding 但不含边框，所以减掉镜像自身的上下 padding 才是
			 * 内容高度；除以 `line-height`（整数 px，见 constants.js 的 lineHeightFor）
			 * 四舍五入即物理行数。空内容也至少 1 行。
			 */
			function rowsOf(mirror) {
			  if (mirror === null || mirror === undefined) return 1;
			  const view = mirror.ownerDocument?.defaultView;
			  if (view === null || view === undefined) return 1;
			  const cs = view.getComputedStyle(mirror);
			  const line = parseFloat(cs.lineHeight);
			  if (!Number.isFinite(line) || line <= 0) return 1;
			  const vpad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
			  const content = mirror.scrollHeight - (Number.isFinite(vpad) ? vpad : 0);
			  return Math.max(1, Math.round(content / line));
			}

			/**
			 * 在宿主里挂一个隐藏镜像 textarea，并返回测量句柄。
			 *
			 * 镜像由本函数创建、由 React 不管辖（宿主是 React 拥有的空 div），
			 * 所以这里往宿主里 appendChild 不会打乱 React 的子节点。
			 *
			 * @param host 宿主元素（`.dsh-epe-measureHost`）。
			 */
			function attachMeasurer(host) {
			  const doc = host.ownerDocument;
			  const mirror = doc.createElement('textarea');
			  mirror.className = MEASURE_CLASS;
			  mirror.setAttribute('aria-hidden', 'true');
			  mirror.setAttribute('tabindex', '-1');
			  mirror.spellcheck = false;
			  mirror.readOnly = true;
			  host.appendChild(mirror);

			  let width = null;
			  return {
			    /**
			     * 逐逻辑行测物理行数。
			     *
			     * @param editor 真实编辑区（textarea）。
			     * @param lines 逻辑行数组（`text.split('\n')`）。
			     * @returns 行数数组；宽度还取不到时返回 null（调用方降级，不要当成 0 行）。
			     */
			    rowCounts(editor, lines) {
			      const next = contentWidthOf(editor);
			      if (next === null) return null;
			      if (next !== width) {
			        width = next;
			        mirror.style.width = `${next}px`;
			      }
			      const list = Array.isArray(lines) && lines.length > 0 ? lines : [''];
			      const counts = [];
			      for (const line of list) {
			        mirror.value = String(line ?? '');
			        // 强制重排：不读这一下，scrollHeight 可能还是上一次的（实测过）。
			        void mirror.offsetHeight;
			        counts.push(rowsOf(mirror));
			      }
			      return counts;
			    },
			    /** 卸载时清掉镜像（宿主通常随组件一起消失，这里是保险）。 */
			    dispose() {
			      mirror.remove();
			    },
			  };
			}

			/**
			 * 把「每行几个物理行」换算成条纹段。
			 *
			 * 相位与修复前的 repeating-linear-gradient 一致：**第 1、3、5… 个逻辑行
			 * （0 基偶数下标）着底色**，这样不换行的文档视觉上与之前完全一样。
			 *
			 * @param rowCounts `rowCounts` 的结果（或直接用 `normalizeRowCounts` 处理）。
			 * @returns `[{ start, rows }]`，`start` 是 0 基物理行号。
			 */
			function stripeSpansOf(rowCounts) {
			  const counts = normalizeRowCounts(rowCounts);
			  const spans = [];
			  let start = 0;
			  for (let index = 0; index < counts.length; index += 1) {
			    if (index % 2 === 0) spans.push({ start, rows: counts[index] });
			    start += counts[index];
			  }
			  return spans;
			}

			/**
			 * 生成条纹的 `background-image`。
			 *
			 * 用**一段 `linear-gradient`**（不是 repeating）：每个着底色的逻辑行
			 * 写一对色标，位置 = `calc(pad + line * 累积物理行号)`。这样软换行的逻辑行
			 * 整块同色，而无换行的文档展开后与原来的重复渐变逐像素一致。
			 *
			 * ⚠️ 色标里的颜色**必须**是 `var(--dsh-epe-stripe)`：裸写变量名时那个位置
			 * 既不是颜色也不是长度，整条 background-image 会被判无效并回落到 none ——
			 * 条纹一条都不显示，且控制台不报错（E-016）。
			 *
			 * 末尾补一段透明：否则最后一段的颜色会一直铺到元素底部，编辑器下端那一大片
			 * 空白会被涂成底色。
			 */
			function stripeBackgroundOf(spans, options = {}) {
			  const pad = options.padVar ?? 'var(--dsh-epe-pad,12px)';
			  const line = options.lineVar ?? 'var(--dsh-epe-line)';
			  const stripe = options.stripeVar ?? 'var(--dsh-epe-stripe)';
			  const at = (row) => `calc(${pad} + ${line} * ${row})`;
			  const stops = [`transparent 0`, `transparent ${pad}`];
			  let end = 0;
			  for (const span of Array.isArray(spans) ? spans : []) {
			    // 亮段之前若有间隔，先补透明把间隔「封口」。
			    if (span.start > end) stops.push(`transparent ${at(span.start)}`);
			    const from = at(span.start);
			    const to = at(span.start + span.rows);
			    // ⚠️⚠️ 亮段结束处**必须在同一位置再补一个 `transparent` 色标**，
			    // 否则 CSS 会在「亮段终点」和「下一个色标」之间**线性插值**：
			    // 实测亮色会多铺整整一个物理行（81px 的段变成 108px），
			    // 而且边界是一条从亮到暗的渐变带 —— 用户 2026-10-16 报的
			    // 「模式一的背景错误了 颜色错误」就是它。
			    // 同一位置两个不同颜色的色标 = 硬边，这才是我们要的。
			    stops.push(`${stripe} ${from}`, `${stripe} ${to}`, `transparent ${to}`);
			    end = span.start + span.rows;
			  }
			  stops.push(`transparent ${at(end)}`);
			  return `linear-gradient(to bottom,${stops.join(',')})`;
			}

			/**
			 * 行号 gutter 里每个行号 span 的高度（px）。
			 *
			 * 逻辑行占 N 个物理行 → 那个行号的高度是 N × 行高，于是下一个行号自然落在
			 * 它自己那行文字**实际开始**的物理行上（用户报的错位就是这么修掉的）。
			 *
			 * @returns 高度数组；行高非法（拿不到整数 px 行高）时返回 null，调用方
			 *   退回 CSS 的 `min-height: var(--dsh-epe-line)`。
			 */
			function gutterHeightsOf(rowCounts, lineHeightPx) {
			  if (!Number.isFinite(lineHeightPx) || lineHeightPx <= 0) return null;
			  return normalizeRowCounts(rowCounts).map((rows) => rows * lineHeightPx);
			}

			Object.assign(__exports, { "MEASURE_CLASS": MEASURE_CLASS, "MEASURE_HOST_CLASS": MEASURE_HOST_CLASS, "normalizeRowCounts": normalizeRowCounts, "contentWidthOf": contentWidthOf, "rowsOf": rowsOf, "attachMeasurer": attachMeasurer, "stripeSpansOf": stripeSpansOf, "stripeBackgroundOf": stripeBackgroundOf, "gutterHeightsOf": gutterHeightsOf });
		});
		__dshRegistry.set("panel.js", (__exports) => {
			var module = { exports: __exports };
			/**
			 * dsh-enhanced-prompt-editor —— 右侧栏编辑面板。
			 *
			 * 结构：
			 *   ┌─ 工具栏：草稿名 · 保存 · 用阅读器打开 · 已有草稿 ─┐
			 *   │  大编辑区（回车语义由设置决定）                    │
			 *   └─ 状态栏：字数 · 保存状态 · [听写] [发送] ──────────┘
			 *
			 * 回车语义由本组件自己的 `onKeyDown` 全权决定：拦截 Enter 并按设置
			 * 换成换行或发送，因此 DSH 内置的 Composer Enter 设置不会互相影响。
			 *
			 * 发送是「直接发出」：`inputActions.setDraft` + `inputActions.submit`。
			 *
			 * @module dsh-enhanced-prompt-editor/panel
			 */
			const { createElement: h, useCallback, useEffect, useMemo, useRef, useState } = __dshExternal("react");
			const { PLUGIN_ID } = __dshRequire("./constants.js");
			const { MAX_DRAFT_CHARS, resolveEnterAction } = __dshRequire("./constants.js");
			const { lineHeightFor } = __dshRequire("./constants.js");
			const { draftTitleOf } = __dshRequire("./constants.js");
			const { Recording, canRecord, audioBase64 } = __dshRequire("./audio.js");
			const { ensureCss: injectStyle } = __dshRequire("./css.js");
			const { INDENT_BUTTONS, SYMBOLS, applySymbol, indentLines } = __dshRequire("./edit-ops.js");
			const { MEASURE_HOST_CLASS, attachMeasurer, gutterHeightsOf, stripeBackgroundOf, stripeSpansOf } = __dshRequire("./soft-wrap.js");

			const CSS_ID = `${PLUGIN_ID}/panel.css`;
			const CSS = `
			.dsh-epe-panel{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base,transparent)}
			.dsh-epe-bar{display:flex;align-items:center;gap:8px;flex:none;padding:8px 12px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.18));min-width:0}
			.dsh-epe-name{flex:1 1 auto;min-width:0;font:500 13px/20px ui-sans-serif,system-ui,sans-serif;color:var(--dsw-alias-label-primary,currentColor);background:transparent;border:none;outline:none;padding:2px 4px;border-radius:6px}
			.dsh-epe-name:focus{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}
			.dsh-epe-name::placeholder{color:var(--dsw-alias-label-tertiary,currentColor);opacity:.7}
			.dsh-epe-btn{display:inline-flex;align-items:center;gap:5px;flex:none;height:26px;padding:0 9px;border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.28));border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary,currentColor);font:500 12px/1 ui-sans-serif,system-ui,sans-serif;cursor:pointer}
			.dsh-epe-btn:disabled{opacity:.45;cursor:default}
			.dsh-epe-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#5686fe);outline-offset:1px}
			/* 次要按钮的悬浮底色。⚠️ 这条的选择器特异性必须**低于**下面的 primary 规则，
			   否则会把主按钮的悬浮背景也一起换掉（见下）。用 :where() 把特异性压到
			   (0,2,0) 的好处是：primary 的 hover 规则写 (0,2,0) 也能靠后声明胜出，
			   不必堆 !important。 */
			.dsh-epe-btn:where(:hover):not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14))}
			/* 主发送按钮。token 取自内核自己的发送按钮（InputBar 的 .primary）：
			   background:--dsw-alias-button-info-fill / hover:--dsw-alias-button-info-hover。
			   之前用的是 --dsw-alias-brand-primary，它在深色主题下解析成近白色，
			   于是「纯白底 + 白字」；而通用 hover 规则的特异性 (0,3,0) 又高过这一条
			   (0,2,0)，悬浮时背景被换成中性灰、文字仍是白色 → 「黑底白字」。
			   现在两者都用官方 token，且 hover 规则同特异性、靠后声明生效。 */
			.dsh-epe-btn[data-primary]{background:var(--dsw-alias-button-info-fill,#5686fe);border-color:transparent;color:#fff}
			.dsh-epe-btn[data-primary]:where(:hover):not(:disabled){background:var(--dsw-alias-button-info-hover,#4a76e0);filter:none}
			.dsh-epe-btn[data-recording]{background:#d9534f;border-color:transparent;color:#fff}
			/* ── 编辑区 ────────────────────────────────────────────────────────
			   行底色**用一段 linear-gradient 画在 textarea 上**，而不是把 textarea 拆成
			   「每行一个 div」的 contenteditable。

			   为什么不拆：textarea 原生的光标移动、跨行选择、IME 组合输入、粘贴多行、
			   undo/redo 全部是免费的，拆成逐行元素就得逐条自己实现（且很难做对）。
			   而条纹只要行高固定，就能用渐变精确画出来——功能零风险。

			   ⚠️ 2026-10-16 起，**生效的**渐变由 JS 按逻辑行逐段生成后写成 textarea 的
			   inline style（见 soft-wrap.js 的 stripeBackgroundOf）；CSS 里保留的
			   repeating-linear-gradient 只是测量跑完之前的降级兜底。原因：软换行时一条
			   逻辑行占多个**物理行**，而 repeating 渐变的周期是固定的——同一条逻辑行会被
			   切成两种底色（用户原话：「自动换行后实际同一行的内容要用同色背景」）。
			   不换行的文档展开后与重复渐变逐像素一致（相位没变：第 1、3、5… 行上色）。

			   ⚠️ 渐变里的色标**必须写 var(--dsh-epe-stripe)**。写成裸的
			   --dsh-epe-stripe（漏了 var()）时，那个位置既不是颜色也不是长度，
			   整条 background-image 会被判无效并回落到 none —— 表现是「条纹完全不见」，
			   而且控制台不报任何错。第一版就是这么错的。
			   对齐要点：--dsh-epe-line 必须与 font 里的 line-height 一致（1.7）；
			   条纹起点必须与**首行文字顶**对齐——也就是要跳过 padding-top，
			   做法是：在渐变里内置一段 padding-top 长的透明补偿段（见 soft-wrap.js），
			   并把 origin/clip 都设为 padding-box。
			   background-attachment:local 让条纹随内容滚动。

			   ⚠️ 千万不要写成 origin:content-box 而 clip 留默认（border-box）。
			   两者不一致时，padding-top 那 12px 落在渐变的**负坐标区**，
			   渐变的第一个 tile 之前会被 clamp 到第一个色标（那时是亮色），
			   于是第一条亮带被撑成 padding-top + line-height ≈ 39px，后面每条都是 27.2px。
			   表现正是「第一二三行高度目测不一致」——用户 2026-10-16 就是这么发现的。
			   离屏 Chromium 实测：不修 → 首带 39px；修好 → 27px，与后续带一致。

			   另一个坑：origin/clip 都设 content-box 也能让首带变 27px，但条纹会**四周内缩
			   12px**（padding 区不上色），行背景不再铺满整行。所以最终选的是
			   「padding-box + 渐变内补偿段」：首带 27px 且铺满。
			   ⚠️ 本段注释**绝不能出现反引号**——它落在 CSS 模板字符串内部，会提前闭合字符串。 */
			/* 行号沟槽：与编辑区同字号、同行高、同 padding-top，滚动同步由 JS 做。
			   用 flex 容器把「行号列 + textarea」并排，两者共享 --dsh-epe-line。 */
			.dsh-epe-body{--dsh-epe-pad:12px;--dsh-epe-line:27px;flex:1 1 auto;min-height:0;display:flex;min-width:0;position:relative}
			/* ⚠️ line-height 必须走 --dsh-epe-line（整数 px），**不能**写 1.7em。
			   1.7em 在 16px 下 = 27.2px（小数），渐变周期 54.4px 落不到整数像素上，
			   光栅化会把相邻的带抹成 27px / 28px 交错 —— 用户看到的就是
			   「某一条条纹带比别的窄」。实测带高 27.0/27.98/26.96/26.96/28.02 交错，
			   周期在 54/55 之间摆动。取整后每条带严格相等。
			   行号 gutter 与编辑区**必须共用**这个值，否则两者会逐行错开。 */
			.dsh-epe-gutter{flex:none;overflow:hidden;padding:var(--dsh-epe-pad) 6px var(--dsh-epe-pad) 10px;text-align:right;color:var(--dsw-alias-label-tertiary,currentColor);opacity:.55;font-weight:400;font-size:var(--dsh-epe-font,16px);line-height:var(--dsh-epe-line);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;user-select:none;pointer-events:none;background:transparent;border-right:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.14))}
			.dsh-epe-gutter span{display:block;min-height:var(--dsh-epe-line)}
			/* 隐藏的软换行镜像：与编辑区**同字体、同行高、同 tab 宽度**，宽度由 JS 设成
			   编辑区的内容宽度（见 soft-wrap.js 的 attachMeasurer）。
			   ⚠️ 必须 absolute 定位脱离 flex 流——它是 .dsh-epe-body 的第三个子节点，
			   参与布局就会把编辑区挤窄，测量宽度与真实宽度从此不一致。 */
			.dsh-epe-measure{position:absolute;left:0;top:0;box-sizing:border-box;padding:0;margin:0;border:0;resize:none;background:none;color:transparent;font-weight:400;font-size:var(--dsh-epe-font,16px);line-height:var(--dsh-epe-line);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;tab-size:2;white-space:pre-wrap;overflow-wrap:break-word;word-break:normal;overflow:hidden;height:1px;min-height:0;display:block;visibility:hidden;pointer-events:none}
			/* 镜像宿主：0 尺寸、不参与交互，只为让 React 拥有一个可挂镜像的容器。 */
			.dsh-epe-measureHost{position:absolute;left:0;top:0;width:0;height:0;overflow:hidden;pointer-events:none}
			.dsh-epe-editor{flex:1 1 auto;min-height:0;width:100%;resize:none;box-sizing:border-box;padding:var(--dsh-epe-pad,12px);border:none;outline:none;color:var(--dsw-alias-label-primary,currentColor);font-weight:400;font-size:var(--dsh-epe-font,16px);line-height:var(--dsh-epe-line);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;tab-size:2;overflow:auto;
			  background-color:transparent;
			  /* ⚠️ 这条是**降级兜底**：测量还没跑完（首帧）或容器还没布局时按物理行交替，
			     与修复前的视觉一致。测量成功后 JS 会用 inline style（按逻辑行逐段生成的
			     linear-gradient，见 soft-wrap.js 的 stripeBackgroundOf）盖掉这条。
			     渐变里**内置 padding-top 的透明补偿段**：周期严格 = --dsh-epe-line * 2，
			     亮段从 --dsh-epe-pad 起、长 --dsh-epe-line，正好覆盖第 1、3、5… 行。 */
			  background-image:repeating-linear-gradient(to bottom,
			    transparent 0,
			    transparent var(--dsh-epe-pad,12px),
			    var(--dsh-epe-stripe) var(--dsh-epe-pad,12px),
			    var(--dsh-epe-stripe) calc(var(--dsh-epe-pad,12px) + var(--dsh-epe-line)),
			    transparent calc(var(--dsh-epe-pad,12px) + var(--dsh-epe-line)),
			    transparent calc(var(--dsh-epe-line) * 2));
			  /* padding-box 才是对的裁剪框：既铺满（含 padding 区），又与渐变原点一致。
			     绝不能写 origin:content-box + clip 默认(border-box) —— 见上方注释。 */
			  background-origin:padding-box;
			  background-clip:padding-box;
			  background-attachment:local;
			  /* 用 label-primary 的极低透明度当条纹色：浅色主题下变深、深色主题下变浅，
			     两个主题都成立，且不必硬编码颜色。 */
			  --dsh-epe-stripe:color-mix(in srgb, var(--dsw-alias-label-primary,currentColor) 5%, transparent);}
			.dsh-epe-editor:focus{--dsh-epe-stripe:color-mix(in srgb, var(--dsw-alias-brand-primary,#5686fe) 7%, transparent)}
			/* ── 底部快捷键行 ──────────────────────────────────────────────── */
			.dsh-epe-keys{display:flex;flex-wrap:wrap;align-items:center;gap:4px;flex:none;padding:6px 12px;border-top:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.18));min-width:0}
			/* 按钮尺寸乘一个缩放系数：字号设置能一起带动图标与按钮，用户才觉得"不那么大/小"。
			   用 calc 而不是改 px 值，这样基准只写一次。 */
			.dsh-epe-key{flex:none;height:calc(24px * var(--dsh-epe-key-scale,1));min-width:calc(24px * var(--dsh-epe-key-scale,1));padding:0 calc(7px * var(--dsh-epe-key-scale,1));border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.28));border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,currentColor);font:500 calc(13px * var(--dsh-epe-key-scale,1))/1 ui-monospace,SFMono-Regular,Menlo,monospace;cursor:pointer}
			.dsh-epe-key:where(:hover):not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));color:var(--dsw-alias-label-primary,currentColor)}
			.dsh-epe-key:disabled{opacity:.45;cursor:default}
			.dsh-epe-key:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#5686fe);outline-offset:1px}
			.dsh-epe-keySep{flex:none;width:1px;height:16px;margin:0 3px;background:var(--dsw-alias-border-l1,rgba(127,127,127,.28))}
			.dsh-epe-editor::placeholder{color:var(--dsw-alias-label-tertiary,currentColor);opacity:.7}
			.dsh-epe-foot{display:flex;align-items:center;gap:8px;flex:none;padding:8px 12px;border-top:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.18));min-width:0}
			.dsh-epe-meta{flex:1 1 auto;min-width:0;font:400 12px/16px ui-sans-serif,system-ui,sans-serif;color:var(--dsw-alias-label-tertiary,currentColor);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
			.dsh-epe-meta[data-error]{color:#d9534f}
			.dsh-epe-drafts{flex:none;display:flex;flex-direction:column;max-height:132px;overflow:auto;border-top:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.18))}
			.dsh-epe-draft{display:flex;align-items:center;gap:8px;padding:6px 12px;border:none;background:transparent;color:var(--dsw-alias-label-secondary,currentColor);font:400 12px/16px ui-sans-serif,system-ui,sans-serif;cursor:pointer;text-align:left}
			.dsh-epe-draft:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}
			.dsh-epe-draft span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
			.dsh-epe-empty{padding:10px 12px;font:400 12px/16px ui-sans-serif,system-ui,sans-serif;color:var(--dsw-alias-label-tertiary,currentColor)}
			`;

			/**
			 * 注入面板样式。
			 *
			 * 走共享的容错实现（见 `./css.js`）：插槽渲染器捕获到渲染期异常会永久
			 * 撤销该条目，因此注入样式不能有抛出的可能。
			 */
			function ensureCss() {
			  injectStyle(CSS_ID, CSS, PLUGIN_ID);
			}

			/** 发送键位显示文案：跟随平台惯用修饰键。 */
			function sendKeyLabel() {
			  const platform = globalThis.navigator?.platform ?? '';
			  return /mac|iphone|ipad/i.test(platform) ? '⌘↵' : 'Ctrl+Enter';
			}

			/**
			 * 符号按钮的悬浮提示。
			 *
			 * 显示「中文名 符号」，例如 `圆括号 ()`、`加粗 **`。两者都给的理由：
			 * 中文名说清用途、符号本身说清会插入什么 —— 用户 2026-10-16 要求
			 * 「指针悬浮显示简单易懂的中文名」。
			 *
			 * ⚠️ 不要退回成读某个 `.hint` key：上一版用的是 `symbol.<key>.hint`，
			 * 那个 key **不存在**，于是悬浮显示裸 key（`symbol.paren.hint`）。
			 */
			function symbolTip(t, symbol) {
			  const name = t?.(`symbol.${symbol.key}`);
			  if (typeof name !== 'string' || name === '' || name.startsWith('symbol.')) return symbol.label;
			  return `${name} ${symbol.label}`;
			}

			/**
			 * 面板正文。
			 *
			 * @param props 插槽框架注入：`t`、`sessionId`、`store`、`settings`、`io`、
			 *   `speech`（可选，来自语音插件），以及会话标准席位 `inputActions`、
			 *   `useProjection`。
			 */
			function PanelBody(props) {
			  ensureCss();
			  const { t, sessionId, store, settings, io, inputActions, speechStore, useSessions } = props;
			  const [, forceRender] = useState(0);
			  const [recording, setRecording] = useState(false);
			  const [phase, setPhase] = useState('idle');
			  const [notice, setNotice] = useState(null);
			  // 每行占几个物理行（软换行测量结果）。null = 还没测出（首帧、容器未布局）。
			  const [rowCounts, setRowCounts] = useState(null);
			  const recordingRef = useRef(undefined);
			  const textareaRef = useRef(null);
			  const gutterRef = useRef(null);
			  const measureHostRef = useRef(null);

			  // 状态订阅：草稿或设置变化都重渲染。
			  useEffect(() => {
			    const offStore = store.snapshot.subscribe(() => forceRender((n) => n + 1));
			    const offSettings = settings.subscribe(() => forceRender((n) => n + 1));
			    const offSpeech = speechStore?.subscribe?.(() => forceRender((n) => n + 1));
			    return () => {
			      offStore();
			      offSettings();
			      offSpeech?.();
			    };
			  }, [store, settings, speechStore]);

			  // 语音 remote 可能在任意时刻出现；每次渲染从快照源现读，不做身份缓存。
			  const speech = speechStore?.getSnapshot?.();

			  const state = store.of(sessionId);
			  const config = settings.get();
			  /**
			   * 会话工作区根。**必须是渲染期的顶层 hook 调用**：`useSessions` 是 React
			   * 选择器钩子，放进 effect 或事件回调里会违反 Rules of Hooks（hook 调用数量
			   * 随分支变化），React 会直接抛错。因此在这里读一次，后面各处复用。
			   */
			  const cwd = io.cwd(useSessions, sessionId);
			  const isWorkspace = config.storage === 'workspace';
			  const sendKey = useMemo(() => sendKeyLabel(), []);
			  const title = draftTitleOf(state.text, t?.('panel.title') ?? 'Prompt');

			  // 首次挂载：按存储方式载入草稿。
			  useEffect(() => {
			    if (typeof sessionId !== 'string' || sessionId === '') return undefined;
			    let cancelled = false;
			    if (config.storage === 'browser') {
			      const local = io.readLocal();
			      if (local !== '' && state.text === '') store.setText(sessionId, local);
			      return undefined;
			    }
			    if (config.storage === 'none' || !isWorkspace) return undefined;
			    if (cwd === undefined) return undefined;
			    const { signal, release } = io.begin();
			    io.list({ cwd, dir: config.dir, signal })
			      .then((entries) => {
			        if (cancelled) return;
			        store.patch(sessionId, { drafts: Array.isArray(entries) ? entries : [] });
			        const first = entries?.[0];
			        if (first !== undefined && state.text === '') {
			          store.patch(sessionId, { name: first.name, path: first.path });
			          return io.load({ cwd, rel: first.file, signal }).then((text) => {
			            if (!cancelled) store.setText(sessionId, text);
			          });
			        }
			        return undefined;
			      })
			      .catch(() => undefined)
			      .finally(release);
			    return () => {
			      cancelled = true;
			      release();
			    };
			    // 只在会话或存储方式改变时重新载入。
			    // eslint-disable-next-line react-hooks/exhaustive-deps
			  }, [sessionId, config.storage, config.dir, isWorkspace, cwd]);

			  /** 保存当前草稿。 */
			  const save = useCallback(
			    async (nameOverride) => {
			      if (!isWorkspace) {
			        if (config.storage === 'browser') {
			          io.writeLocal(state.text);
			          store.patch(sessionId, { status: 'saved', error: null });
			          return;
			        }
			        store.patch(sessionId, { status: 'idle', error: null });
			        return;
			      }
			      if (cwd === undefined) {
			        store.patch(sessionId, { status: 'error', error: t?.('panel.needSession') ?? 'no session cwd' });
			        return;
			      }
			      store.patch(sessionId, { status: 'saving', error: null });
			      const { signal, release } = io.begin();
			      try {
			        const name = nameOverride ?? state.name ?? draftTitleOf(state.text, 'draft');
			        const result = await io.save({ sessionId, cwd, dir: config.dir, name, text: state.text, signal });
			        store.patch(sessionId, { status: 'saved', name, path: result.path, error: null });
			      } catch (error) {
			        store.patch(sessionId, {
			          status: 'error',
			          error: (t?.('panel.errorSave', { message: error.message }) ?? error.message),
			        });
			      } finally {
			        release();
			      }
			    },
			    [config.dir, cwd, io, isWorkspace, sessionId, state.name, state.text, store, t],
			  );

			  /** 发送：直接进会话。 */
			  const send = useCallback(async () => {
			    const result = await io.send(inputActions, state.text);
			    if (result.ok) {
			      store.patch(sessionId, { status: 'idle', error: null });
			      setNotice(null);
			      if (config.storage === 'browser') io.writeLocal(state.text);
			      else if (isWorkspace) void save();
			      return;
			    }
			    setNotice(t?.('panel.errorSend', { message: result.reason }) ?? result.reason);
			  }, [config.storage, inputActions, io, isWorkspace, save, sessionId, state.text, store, t]);

			  /** 编辑器按键：回车语义与快捷键。 */
			  const onKeyDown = useCallback(
			    (event) => {
			      const action = resolveEnterAction(event, config.enterMode);
			      if (action === null) return;
			      event.preventDefault();
			      if (action === 'send') void send();
			      else {
			        // 手动插入换行：textarea 的默认行为已被 preventDefault 吃掉。
			        const el = event.currentTarget;
			        const start = el.selectionStart;
			        const end = el.selectionEnd;
			        const next = `${el.value.slice(0, start)}\n${el.value.slice(end)}`;
			        store.setText(sessionId, next);
			        // 光标落到换行之后。没有 rAF 的环境（测试、非浏览器）同步设置即可。
			        const place = () => {
			          const node = textareaRef.current;
			          if (node !== null && node !== undefined) node.setSelectionRange(start + 1, start + 1);
			        };
			        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(place);
			        else place();
			      }
			    },
			    [config.enterMode, send, sessionId, store],
			  );

			  /**
			   * 插入符号 / 包裹选中文字。
			   *
			   * ⚠️ 用户 2026-10-16 明确要求：**选中一段文字后点成对符号，是把文字框在
			   * 符号内，不是把框选的文字改成符号**（后者会丢掉用户的内容）。具体规则在
			   * `./edit-ops.js` 的三个纯函数里，这里只负责读/写选区。
			   *
			   * 选区必须**在点击按钮前**读——按钮一旦拿到焦点，textarea 的
			   * `selectionStart/End` 在某些浏览器里会归零。所以用 `onMouseDown`
			   * `preventDefault()` 阻止按钮抢焦点（见下面的渲染），这样选区一直在
			   * textarea 上，点完还能恢复。
			   */
			  const insertSymbol = useCallback(
			    (symbol) => {
			      const node = textareaRef.current;
			      const current = store.of(sessionId).text;
			      // 没有 DOM（测试环境）时退回「追加到末尾」，仍然不留死路。
			      const start = node?.selectionStart ?? current.length;
			      const end = node?.selectionEnd ?? current.length;
			      const result = applySymbol(current, start, end, symbol);
			      store.setText(sessionId, result.text);
			      // 光标/选区落回预期位置。
			      const place = () => {
			        const el = textareaRef.current;
			        if (el === null || el === undefined) return;
			        el.focus();
			        el.setSelectionRange(result.selStart, result.selEnd);
			      };
			      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(place);
			      else place();
			    },
			    [sessionId, store],
			  );

			  /**
			   * 粘贴：把剪贴板文本插进**当前光标处**，替换选区。
			   *
			   * 用 `navigator.clipboard.readText()`（需要用户手势 + 权限，点击按钮满足前者）。
			   * 读不到就退回提示，不静默失败——用户点了没反应会以为按钮坏了。
			   */
			  const pasteAtCaret = useCallback(async () => {
			    let text = '';
			    try {
			      text = (await globalThis.navigator?.clipboard?.readText?.()) ?? '';
			    } catch (error) {
			      setNotice(t?.('panel.errorPaste', { message: error?.message ?? 'denied' }) ?? 'paste denied');
			      return;
			    }
			    if (text === '') {
			      setNotice(t?.('panel.errorPasteEmpty') ?? 'clipboard is empty');
			      return;
			    }
			    const node = textareaRef.current;
			    const current = store.of(sessionId).text;
			    const start = node?.selectionStart ?? current.length;
			    const end = node?.selectionEnd ?? current.length;
			    const next = `${current.slice(0, start)}${text}${current.slice(end)}`;
			    store.setText(sessionId, next);
			    setNotice(null);
			    const caret = start + text.length;
			    const place = () => {
			      const el = textareaRef.current;
			      if (el === null || el === undefined) return;
			      el.focus();
			      el.setSelectionRange(caret, caret);
			    };
			    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(place);
			    else place();
			  }, [sessionId, store, t]);

			  /** 一键缩进 / 反缩进（用户 2026-10-16 要求）。 */
			  const indentSelection = useCallback(
			    (outdent) => {
			      const node = textareaRef.current;
			      const current = store.of(sessionId).text;
			      const start = node?.selectionStart ?? current.length;
			      const end = node?.selectionEnd ?? current.length;
			      const result = indentLines(current, start, end, outdent);
			      store.setText(sessionId, result.text);
			      const place = () => {
			        const el = textareaRef.current;
			        if (el === null || el === undefined) return;
			        el.focus();
			        el.setSelectionRange(result.selStart, result.selEnd);
			      };
			      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(place);
			      else place();
			    },
			    [sessionId, store],
			  );

			  /** 听写：录音 → 转写 → 追加到草稿。 */
			  const dictate = useCallback(async () => {
			    if (speech === undefined) {
			      setNotice(t?.('panel.errorDictate', { message: 'speech unavailable' }) ?? 'speech unavailable');
			      return;
			    }
			    if (recording) {
			      setPhase('transcribing');
			      try {
			        const active = recordingRef.current;
			        recordingRef.current = undefined;
			        setRecording(false);
			        if (active === undefined) return;
			        const bytes = await active.record.stop(active.maxDurationSeconds);
			        const result = await speech.transcribe({
			          audioBase64: audioBase64(bytes),
			          providerId: active.providerId,
			        });
			        if (result?.ok !== true) throw new Error(result?.error?.message ?? 'transcribe failed');
			        const text = result.value?.text ?? '';
			        if (text !== '') store.setText(sessionId, `${store.of(sessionId).text}${text}`);
			      } catch (error) {
			        setNotice(t?.('panel.errorDictate', { message: error.message }) ?? error.message);
			      } finally {
			        setPhase('idle');
			      }
			      return;
			    }
			    if (!canRecord()) {
			      setNotice(t?.('panel.errorDictate', { message: 'no microphone support' }) ?? 'no microphone support');
			      return;
			    }
			    try {
			      const catalog = await speech?.catalog?.();
			      const active = new Recording({});
			      await active.start();
			      recordingRef.current = {
			        record: active,
			        maxDurationSeconds: catalog?.maxDurationSeconds ?? 60,
			        providerId: catalog?.selection?.providerId,
			      };
			      setRecording(true);
			    } catch (error) {
			      setNotice(t?.('panel.errorDictate', { message: error.kind ?? error.message }) ?? error.message);
			    }
			  }, [recording, sessionId, speech, store, t]);

			  // 卸载时释放录音资源。
			  useEffect(
			    () => () => {
			      recordingRef.current?.record?.dispose?.().catch(() => undefined);
			      recordingRef.current = undefined;
			    },
			    [],
			  );

			  const status = (() => {
			    if (state.status === 'saving') return t?.('panel.saving') ?? '…';
			    if (state.status === 'saved') return t?.('panel.saved') ?? 'saved';
			    return '';
			  })();

			  // 行号数量：按实际行数算（末尾换行也算一行，与编辑器的感觉一致）。
			  // 空文档也显示 1 行，避免沟槽突然消失导致编辑区横向跳动。
			  const text = String(state.text ?? '');
			  const lines = text.split('\n');
			  const lineNumbers = Math.max(1, lines.length);

			  /**
			   * 软换行测量 + 条纹重算。
			   *
			   * 依赖里放的是 `text`（内容）而不是 `state`（每次渲染都是新对象），
			   * 否则 effect 每帧都会跑一遍。滚动/高度变化不改内容，但会改换行宽度，
			   * 所以还要监听 window resize 与 RS 的尺寸变化。
			   *
			   * 测量失败（拿不到宽度、DOM 不在）时保留上一次结果而不是清空 —— 清空会让
			   * 用户看到条纹闪一下再回来；真的没有结果时渲染侧会退回降级几何。
			   */
			  useEffect(() => {
			    const host = measureHostRef.current;
			    const editor = textareaRef.current;
			    if (host === null || editor === null) return undefined;
			    let measurer = null;
			    let cancelled = false;
			    const run = () => {
			      if (cancelled) return;
			      try {
			        if (measurer === null) measurer = attachMeasurer(host);
			        const counts = measurer.rowCounts(editor, lines);
			        if (counts !== null) setRowCounts(counts);
			      } catch (error) {
			        // 测量是纯增强：任何异常都只降级，绝不能抛到渲染期
			        //（插槽渲染器捕获到异常会永久撤销该条目）。
			        console.error(`[${PLUGIN_ID}] soft-wrap measure failed:`, error);
			      }
			    };
			    run();
			    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(run) : null;
			    observer?.observe(editor);
			    globalThis.addEventListener?.('resize', run);
			    return () => {
			      cancelled = true;
			      observer?.disconnect();
			      globalThis.removeEventListener?.('resize', run);
			      measurer?.dispose();
			    };
			    // lines 由 text 派生，两者同步变化；用 text 当依赖即可。
			    // eslint-disable-next-line react-hooks/exhaustive-deps
			  }, [text]);

			  // 几何：行号高度按物理行数拉伸（行号「2」因此落在它自己那行的物理行上），
			  // 条纹按逻辑行分段（同一条逻辑行的所有物理行同色）。
			  const rowCountsSafe = rowCounts ?? lines.map(() => 1);
			  const lineHeightPx = lineHeightFor(config.editorFontSize ?? 16);
			  const gutterHeights = gutterHeightsOf(rowCountsSafe, lineHeightPx);
			  const stripeBackground = stripeBackgroundOf(stripeSpansOf(rowCountsSafe));

			  const canDictate = config.dictate && speech !== undefined;

			  return h(
			    'div',
			    { className: 'dsh-epe-panel' },
			    h(
			      'div',
			      { className: 'dsh-epe-bar' },
			      h('input', {
			        className: 'dsh-epe-name',
			        value: state.name ?? '',
			        placeholder: t?.('panel.nameLabel') ?? 'Draft name',
			        onChange: (event) => store.patch(sessionId, { name: event.target.value }),
			        'aria-label': t?.('panel.nameLabel') ?? 'Draft name',
			      }),
			      isWorkspace
			        ? h(
			            'button',
			            { type: 'button', className: 'dsh-epe-btn', onClick: () => void save(), disabled: state.status === 'saving' },
			            status !== '' ? status : (t?.('panel.save') ?? 'Save'),
			          )
			        : null,
			      isWorkspace && state.path !== null && config.browseWithReader
			        ? h(
			            'button',
			            {
			              type: 'button',
			              className: 'dsh-epe-btn',
			              onClick: () => {
			                const address = fileAddressOf(sessionId, state.path);
			                if (address !== undefined) io.openInReader(sessionId, address);
			              },
			            },
			            t?.('panel.openInReader') ?? 'Open in viewer',
			          )
			        : null,
			      h(
			        'button',
			        {
			          type: 'button',
			          className: 'dsh-epe-btn',
			          onClick: () => {
			            store.setText(sessionId, '');
			            setNotice(null);
			          },
			        },
			        t?.('panel.clear') ?? 'Clear',
			      ),
			    ),
			    // 行号 + 编辑区并排。行号用纯展示的 span 列表（不是 DOM 行），
			    // 与 textarea 共享同一个行高变量，滚动时按 scrollTop 同步偏移。
			    // ⚠️ --dsh-epe-font 与 --dsh-epe-key-scale 必须设在**共用的 .dsh-epe-body**
			    // 上，不能只设在 textarea 的 style 里：行号 gutter 是 textarea 的**兄弟节点**，
			    // 设在 textarea 上的自定义属性它继承不到，只会用 CSS 里的兜底值 16px
			    // —— 字号一改成非 16px，行号就按 16px 排版、文字按新字号排版，逐行错位。
			    h(
			      'div',
			      {
			        className: 'dsh-epe-body',
			        style: {
			          '--dsh-epe-font': `${config.editorFontSize ?? 16}px`,
			          // 行高取整数像素（见 constants.js 的 lineHeightFor）：
			          // 小数行高会让条纹带宽度在 27/28px 之间摆动，看起来「某条带更窄」。
			          // gutter 与 textarea 都在这个父节点下，共用同一个值。
			          '--dsh-epe-line': `${lineHeightFor(config.editorFontSize ?? 16)}px`,
			          '--dsh-epe-key-scale': String((config.keySize ?? 100) / 100),
			        },
			      },
			      lineNumbers > 0
			        ? h(
			            'div',
			            { className: 'dsh-epe-gutter', 'aria-hidden': true, ref: gutterRef },
			            Array.from({ length: lineNumbers }, (_unused, index) =>
			              // 每个行号的高度 = 该逻辑行占的**物理行数 × 行高**。
			              // 这样它下面的行号就落在「自己那行文字真正开始」的物理行上
			              //（逻辑行 1 占 3 个物理行时，行号 2 出现在第 4 个物理行）。
			              // 拿不到行高时退回 null，由 CSS 的 min-height 兜底成一行高。
			              // eslint-disable-next-line react/no-array-index-key
			              h('span', { key: `ln-${index + 1}`, style: { height: gutterHeights?.[index] ?? undefined } }, String(index + 1)),
			            ),
			          )
			        : null,
			      h('textarea', {
			        ref: textareaRef,
			        className: 'dsh-epe-editor',
			        // 字号与缩放由父层 .dsh-epe-body 上的 CSS 变量提供（见上），
			        // 这样行号 gutter 与编辑区用的是**同一个字号**，行高才不会错位。
			        value: state.text,
			        spellCheck: false,
			        // 按逻辑行生成的条纹（同一条逻辑行的所有物理行同色）。写 inline style
			        // 才能带进「每行占几个物理行」这个运行时信息；拿不到测量时退回 CSS
			        // 里那条按物理行交替的降级渐变（不写 background-image 即可）。
			        style: { backgroundImage: stripeBackground },
			        placeholder: (t?.('panel.placeholder', { send: sendKey }) ?? 'Write here…'),
			        onChange: (event) => store.setText(sessionId, event.target.value),
			        onKeyDown,
			        onScroll: (event) => {
			          // 行号沟槽跟着编辑区滚动，否则长文里行号会错位。
			          const gutter = gutterRef.current;
			          if (gutter !== null && gutter !== undefined) gutter.scrollTop = event.currentTarget.scrollTop;
			        },
			        'aria-label': t?.('panel.title') ?? 'Prompt',
			      }),
			      // 软换行测量用的隐藏镜像宿主。必须**由 React 拥有**（镜像由 JS 自己
			      // append 进来），这样不会在 React 的 diff 里打架；它 absolute + 0 尺寸，
			      // 不参与布局也不影响编辑区宽度。
			      h('div', { className: MEASURE_HOST_CLASS, 'aria-hidden': true, ref: measureHostRef }),
			    ),
			    // ── 快捷键行（用户 2026-10-16 要求：放在发送按钮行的空白处）──────
			    h(SymbolBar, {
			      t,
			      scale: (config.keySize ?? 100) / 100,
			      onSymbol: insertSymbol,
			      onIndent: indentSelection,
			      onPaste: () => void pasteAtCaret(),
			    }),
			    !isWorkspace || config.storage === 'none'
			      ? null
			      : state.drafts.length === 0
			        ? null
			        : h(
			            'div',
			            { className: 'dsh-epe-drafts' },
			            state.drafts.map((draft) =>
			              h(
			                'button',
			                {
			                  key: draft.file,
			                  type: 'button',
			                  className: 'dsh-epe-draft',
			                  onClick: () => {
			                    if (cwd === undefined) return;
			                    const { signal, release } = io.begin();
			                    io.load({ cwd, rel: draft.file, signal })
			                      .then((text) => store.patch(sessionId, { text, name: draft.name, path: draft.path }))
			                      .catch(() => undefined)
			                      .finally(release);
			                  },
			                },
			                h('span', null, draft.name),
			              ),
			            ),
			          ),
			    h(
			      'div',
			      { className: 'dsh-epe-foot' },
			      h(
			        'div',
			        { className: 'dsh-epe-meta', ...(notice !== null ? { 'data-error': true } : {}) },
			        notice ?? `${t?.('panel.runes', { count: state.text.length }) ?? `${state.text.length} chars`}${config.storage === 'workspace' ? ` · ${t?.('panel.storageWorkspace') ?? ''}` : config.storage === 'browser' ? ` · ${t?.('panel.storageBrowser') ?? ''}` : ` · ${t?.('panel.storageNone') ?? ''}`}`,
			      ),
			      canDictate
			        ? h(
			            'button',
			            {
			              type: 'button',
			              className: 'dsh-epe-btn',
			              ...(recording ? { 'data-recording': true } : {}),
			              onClick: () => void dictate(),
			              disabled: phase === 'transcribing',
			              title: t?.('panel.dictate') ?? 'Dictate',
			            },
			            phase === 'transcribing'
			              ? (t?.('panel.transcribing') ?? '…')
			              : recording
			                ? (t?.('panel.dictating') ?? 'Stop')
			                : (t?.('panel.dictate') ?? 'Dictate'),
			          )
			        : null,
			      h(
			        'button',
			        {
			          type: 'button',
			          className: 'dsh-epe-btn',
			          'data-primary': true,
			          onClick: () => void send(),
			          disabled: state.text.trim() === '',
			          title: `${t?.('panel.send') ?? 'Send'} (${sendKey})`,
			        },
			        t?.('panel.send') ?? 'Send',
			      ),
			    ),
			  );
			}

			/**
			 * 符号快捷键行（**两个模式共用**）。
			 *
			 * 抽成独立组件的原因：用户 2026-10-16 要求「这个快捷行也加到模式二」。两处用
			 * 同一份实现，就不会出现「面板里修好了、扩展输入框里还是旧的」。
			 *
			 * ⚠️ 每个按钮都必须 `onMouseDown` + `preventDefault()`：一旦按钮拿到焦点，
			 * 编辑区（textarea / Lexical）的选区就可能归零，那样「包裹选中文字」与
			 * 「按行缩进」都会落空——它们都依赖 `selectionStart/End` 或当前选区。
			 *
			 * @param props `t`、`scale`（缩放系数）、`onSymbol`、`onIndent`、`onPaste`。
			 */
			function SymbolBar(props) {
			  ensureCss();
			  const { t, scale, onSymbol, onIndent, onPaste } = props;
			  const style = { '--dsh-epe-key-scale': String(scale ?? 1) };

			  /** 一个符号按钮的统一样式与事件绑定。 */
			  const key = (keyName, label, title, onClick) =>
			    h(
			      'button',
			      {
			        key: keyName,
			        type: 'button',
			        className: 'dsh-epe-key',
			        title,
			        'aria-label': title,
			        onMouseDown: (event) => event.preventDefault(),
			        onClick,
			      },
			      label,
			    );

			  return h(
			    'div',
			    {
			      className: 'dsh-epe-keys',
			      role: 'toolbar',
			      'aria-label': t?.('panel.keys') ?? 'Insert',
			      style,
			    },
			    SYMBOLS.map((symbol) =>
			      key(
			        symbol.key,
			        symbol.label,
			        // 悬浮显示「中文名 符号」。⚠️ 不要退回读 `symbol.<key>.hint`：
			        // 那个 key 不存在，会显示裸 key。
			        symbolTip(t, symbol),
			        () => onSymbol?.(symbol),
			      ),
			    ),
			    INDENT_BUTTONS.map((button) =>
			      key(
			        button.key,
			        button.label,
			        `${t?.(`panel.${button.key}`) ?? button.label} ${button.label}`,
			        () => onIndent?.(button.outdent),
			      ),
			    ),
			    h('span', { className: 'dsh-epe-keySep', 'aria-hidden': true }),
			    // 粘贴按钮：可见文字与可访问名都用简短名，详细说明只放 title。
			    (() => {
			      const label = t?.('panel.paste') ?? 'Paste';
			      return h(
			        'button',
			        {
			          key: 'paste',
			          type: 'button',
			          className: 'dsh-epe-key',
			          title: t?.('panel.pasteHint') ?? label,
			          'aria-label': label,
			          onMouseDown: (event) => event.preventDefault(),
			          onClick: () => onPaste?.(),
			        },
			        label,
			      );
			    })(),
			  );
			}

			/** 面板 tab 的标题：取草稿首行。 */
			function PanelTitle(props) {
			  const { store } = props;
			  const [, forceRender] = useState(0);
			  useEffect(() => store.snapshot.subscribe(() => forceRender((n) => n + 1)), [store]);
			  const title = draftTitleOf(store.of(props.sessionId).text, 'Prompt');
			  return h('span', null, title);
			}

			/**
			 * 造 `dsh-resource://file/...` 地址。
			 *
			 * 与 `@deepseek-ai/dsh-util-workspace-path` 的 `fileAddressFor` 同规则：
			 * 工作区内的绝对路径折叠成 session 作用域的相对路径段。
			 */
			function fileAddressOf(sessionId, path) {
			  if (typeof path !== 'string' || path === '') return undefined;
			  const normalized = path.replace(/\\/g, '/');
			  const encoded = normalized
			    .split('/')
			    .map((segment) => encodeURIComponent(segment).replace(/%3A/gi, ':'))
			    .join('/');
			  return `dsh-resource://file/session/${encodeURIComponent(sessionId)}/${encoded}`;
			}

			Object.assign(__exports, { "PanelBody": PanelBody, "SymbolBar": SymbolBar, "PanelTitle": PanelTitle });
		});
		__dshRegistry.set("plugin-card.js", (__exports) => {
			var module = { exports: __exports };
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
			const { createElement: h, useEffect, useRef, useState } = __dshExternal("react");
			const { Menu, SettingsForm, SettingsFormModel, SettingsValueField, Switch } = __dshExternal("@deepseek-ai/dsh-client-ui-primitives");
			const { PLUGIN_ID, SETTINGS_NAMESPACE, defaultSettings } = __dshRequire("./constants.js");
			const { ensureCss: injectStyle } = __dshRequire("./css.js");

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
			function setPluginContext(ctx) {
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
			function setNativeSwitches(controller) {
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
			      extendedEnter: value?.extendedEnter === 'newline' || value?.extendedEnter === 'inherit'
			        ? value.extendedEnter
			        : undefined,
			    };
			  } catch {
			    return { nativeDeck: false, nativeEnter: false, extendedEnter: undefined };
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
			function PluginCard(props) {
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

			Object.assign(__exports, { "setPluginContext": setPluginContext, "setNativeSwitches": setNativeSwitches, "PluginCard": PluginCard });
		});
		__dshRegistry.set("locale.js", (__exports) => {
			var module = { exports: __exports };
			/**
			 * dsh-enhanced-prompt-editor —— 文案。
			 *
			 * @module dsh-enhanced-prompt-editor/locale
			 */

			/** 中英文案（键必须一一对应）。 */
			function createLocale() {
			  return {
			    zh: {
			      'trigger.label': '增强的提示词编辑器',
			      'trigger.hint': '写长 prompt',
			      'trigger.mode': '当前：{mode}。点击切换到「{next}」。',
			      'trigger.mode.native': '原生',
			      'trigger.mode.editor': '编辑器',
			      'trigger.mode.extended': '扩展输入框',
			      'trigger.disabled': '两种增强模式都已关闭，T 不做任何事；在「插件」页里开启。',
			      'notice.extended': '已进入扩展输入框模式：原生输入框会向上加高，回车行为按你的设置；再点一次 T 回到原生。',
			      'panel.title': 'Prompt',
			      'panel.guide': '在右侧栏里写长 prompt，写完直接发送或用内置阅读器查看。',
			      'panel.placeholder': '在这里写长 prompt…回车换行，{send} 发送。',
			      'panel.send': '发送',
			      'panel.sending': '发送中…',
			      'panel.dictate': '语音听写',
			      'panel.dictating': '录音中…点此停止',
			      'panel.transcribing': '识别中…',
			      'panel.clear': '清空',
			      'panel.save': '保存',
			      'panel.saving': '保存中…',
			      'panel.saved': '已保存',
			      'panel.saveAs': '另存为',
			      'panel.openInReader': '用阅读器打开',
			      'panel.listDrafts': '已有草稿',
			      'panel.noDrafts': '还没有草稿',
			      'panel.nameLabel': '草稿名',
			      'panel.storageWorkspace': '存到工作区 .md',
			      'panel.storageBrowser': '只存浏览器',
			      'panel.storageNone': '不保存',
			      'panel.readerOff': '落盘功能已关闭',
			      'panel.readerHint': '在设置里启用「允许用内置阅读器打开」后可用。',
			      'panel.errorSend': '发送失败：{message}',
			      'panel.errorSave': '保存失败：{message}',
			      'panel.errorDictate': '听写失败：{message}',
			      'panel.needSession': '请先打开一个会话。',
			      'panel.keys': '插入符号',
			      'panel.paste': '粘贴',
			      'panel.pasteHint': '在光标处粘贴剪贴板内容',
			      'panel.errorPaste': '粘贴失败：{message}',
			      'panel.errorPasteEmpty': '剪贴板是空的',
			      'symbol.paren': '圆括号',
			      'symbol.bracket': '方括号',
			      'symbol.brace': '花括号',
			      'symbol.quote': '双引号',
			      'symbol.single': '单引号',
			      'symbol.backtick': '反引号（行内代码）',
			      'symbol.fullParen': '全角圆括号',
			      'symbol.corner': '直角引号',
			      'symbol.whiteCorner': '白直角引号',
			      'symbol.lenticular': '方头括号',
			      'symbol.bookTitle': '书名号',
			      'symbol.bold': '加粗',
			      'symbol.italic': '斜体',
			      'symbol.strike': '删除线',
			      'symbol.codeBlock': '代码块',
			      'symbol.heading': '标题',
			      'symbol.bullet': '无序列表',
			      'symbol.quoteBlock': '引用',
			      'symbol.link': '链接',
			      'symbol.image': '图片',
			      'symbol.divider': '分隔线',
			      'panel.indent': '增加缩进',
			      'panel.indentHint': '给选中的每一行增加两个空格缩进',
			      'panel.outdent': '减少缩进',
			      'panel.outdentHint': '去掉选中行最前面的两个空格',
			      'settings.editorFontSize': '编辑区字号',
			      'settings.editorFontSizeHint': '编辑器模式里正文的字号（像素）',
			      'settings.keySize': '快捷键按钮大小',
			      'settings.keySizeHint': '编辑区下方那排符号按钮的缩放（100 = 基准）',
			      'panel.runes': '{count} 字',
			      'settings.title': '增强的提示词编辑器',
			      'settings.storage': '草稿存储',
			      'settings.storageHint': '决定长 prompt 写在哪里。改完立即生效。',
			      'settings.storage.workspace': '工作区 .md 文件（可用内置阅读器打开，支持多份）',
			      'settings.storage.browser': '仅浏览器本地（单份，不落地）',
			      'settings.storage.none': '不保存（每次打开都是空的）',
			      'settings.dir': '落盘目录',
			      'settings.dirHint': '相对于会话工作区根。仅「工作区 .md」模式使用。',
			      'settings.enterMode': '回车键行为',
			      'settings.enterHint': '只影响本插件的面板；DSH 自己的输入框请在「设置 → 通用」里改。',
			      'settings.enterMode.newline': '回车换行，{send} 发送',
			      'settings.enterMode.send': '回车发送，{send} 换行',
			      'settings.height': '面板高度',
			      'settings.heightHint': '像素。',
			      'settings.browseWithReader': '允许用内置阅读器打开',
			      'settings.browseWithReaderHint': '关闭后只在本面板里编辑，不写工作区文件。',
			      'settings.dictate': '显示听写按钮',
			      'settings.dictateHint': '需要已安装语音转文字插件；未安装时按钮本来就不会出现。',
			      'settings.unavailable': 'DSH 设置服务不可用，这里的改动不会保存。',
			      'settings.readOnly': '当前部署下这些设置是只读的。',
			      'settings.save': '保存',
			      'settings.saving': '保存中…',
			      'settings.saveFailed': '宿主拒绝了这次写入，草稿已保留。',
			      'settings.overridden': '已覆盖',
			      'settings.reset': '重置',
			      'settings.invalidNumber': '请输入 {min}–{max} 之间的整数。',
			      'settings.summary': '写长 prompt：工具行 T 打开右侧栏编辑器，或把原生输入框向上加高。',
			      'settings.bootFailed': '插件启动时有步骤失败，已自动降级（详情）：',
			      'settings.modes': '工作模式',
			      'settings.modesHint': '勾选要启用的模式。点击输入框工具行的 T 会在已启用的模式之间循环，最后回到「原生」。',
			      'settings.mode.editor': '编辑器模式',
			      'settings.mode.editorHint': '点 T 在右侧栏打开 Markdown 编辑面板，可落盘成工作区 .md。',
			      'settings.mode.extended': '扩展输入框模式',
			      'settings.mode.extendedHint': '把 DSH 原生输入框向上加高，并按下面的设置决定回车。',
			      'settings.modeOrder': '循环顺序',
			      'settings.modeOrderHint': '只在两个模式都启用时生效。',
			      'settings.modeOrder.editorFirst': '编辑器 → 扩展输入框',
			      'settings.modeOrder.extendedFirst': '扩展输入框 → 编辑器',
			      'settings.extendedEnter': '扩展输入框的回车',
			      'settings.extendedEnterHint':
			        '只影响扩展输入框模式下的原生输入框。DSH 自带的输入框没有「回车换行」这个选项（它的「回车行为」只管智能体忙碌时的排队/插话）。',
			      'settings.extendedEnter.inherit': '跟随 DSH：回车发送，{send} 换行',
			      'settings.extendedEnter.newline': '回车换行，{send} 发送',
			      'settings.extendedHeight': '扩展输入框高度',
			      'settings.extendedHeightHint': '像素。这是输入框向上扩展的最大高度。',
			      'settings.needOneMode': '至少启用一个模式，否则 T 只会停在「原生」。',
			      'settings.native': '原生输入框增强（不用切模式）',
			      'settings.nativeHint':
			        '下面两项直接在「原生」模式下生效，不需要点 T 切模式；也不改变输入框的高度与外观。'
			        + '切换即时生效、立即保存（不用点保存按钮）。',
			      'settings.nativeDeck': '在原生输入框应用悬浮 deck',
			      'settings.nativeDeckHint':
			        '在输入框上方悬浮显示符号/缩进工具条（与扩展模式用的是同一条 deck）。',
			      'settings.nativeEnter': '在原生输入框启用高级回车',
			      'settings.nativeEnterHint':
			        '让「原生」模式也用下面的回车策略（例如回车换行、发送键发送）。回车策略与扩展模式共用同一个设置。',
			      'settings.hostStale':
			        '当前运行中的宿主还不认识这两个字段（只重载了插件前端，宿主侧没有）。勾选后保存会被宿主拒绝 —— '
			        + '请完全退出并重新启动 DSH 再试。',
			      'settings.saveRejected': '保存被宿主拒绝。',
			    },
			    en: {
			      'trigger.label': 'Enhanced Prompt Editor',
			      'trigger.hint': 'Write a long prompt',
			      'trigger.mode': 'Current: {mode}. Click to switch to “{next}”.',
			      'trigger.mode.native': 'Native',
			      'trigger.mode.editor': 'Editor',
			      'trigger.mode.extended': 'Tall composer',
			      'trigger.disabled': 'Both enhanced modes are off, so T does nothing. Enable one on the Plugins page.',
			      'notice.extended': 'Tall composer on: the native composer grows upward and Enter follows your setting. Click T again to return to Native.',
			      'panel.title': 'Prompt',
			      'panel.guide': 'Write a long prompt in the sidebar, then send it or read it with the built-in viewer.',
			      'panel.placeholder': 'Write your long prompt here… Enter adds a line, {send} sends.',
			      'panel.send': 'Send',
			      'panel.sending': 'Sending…',
			      'panel.dictate': 'Dictate',
			      'panel.dictating': 'Recording… click to stop',
			      'panel.transcribing': 'Transcribing…',
			      'panel.clear': 'Clear',
			      'panel.save': 'Save',
			      'panel.saving': 'Saving…',
			      'panel.saved': 'Saved',
			      'panel.saveAs': 'Save as',
			      'panel.openInReader': 'Open in viewer',
			      'panel.listDrafts': 'Existing drafts',
			      'panel.noDrafts': 'No drafts yet',
			      'panel.nameLabel': 'Draft name',
			      'panel.storageWorkspace': 'Workspace .md',
			      'panel.storageBrowser': 'Browser only',
			      'panel.storageNone': 'Do not save',
			      'panel.readerOff': 'Saving is turned off',
			      'panel.readerHint': 'Enable "Allow opening in the built-in viewer" in settings.',
			      'panel.errorSend': 'Send failed: {message}',
			      'panel.errorSave': 'Save failed: {message}',
			      'panel.errorDictate': 'Dictation failed: {message}',
			      'panel.needSession': 'Open a session first.',
			      'panel.keys': 'Insert',
			      'panel.paste': 'Paste',
			      'panel.pasteHint': 'Paste the clipboard at the caret',
			      'panel.errorPaste': 'Paste failed: {message}',
			      'panel.errorPasteEmpty': 'The clipboard is empty',
			      'symbol.paren': 'Parentheses',
			      'symbol.bracket': 'Square brackets',
			      'symbol.brace': 'Braces',
			      'symbol.quote': 'Double quote',
			      'symbol.single': 'Single quote',
			      'symbol.backtick': 'Backtick (inline code)',
			      'symbol.fullParen': 'Full-width parentheses',
			      'symbol.corner': 'Corner brackets',
			      'symbol.whiteCorner': 'White corner brackets',
			      'symbol.lenticular': 'Lenticular brackets',
			      'symbol.bookTitle': 'Book title marks',
			      'symbol.bold': 'Bold',
			      'symbol.italic': 'Italic',
			      'symbol.strike': 'Strikethrough',
			      'symbol.codeBlock': 'Code block',
			      'symbol.heading': 'Heading',
			      'symbol.bullet': 'Bullet list',
			      'symbol.quoteBlock': 'Blockquote',
			      'symbol.link': 'Link',
			      'symbol.image': 'Image',
			      'symbol.divider': 'Divider',
			      'panel.indent': 'Indent',
			      'panel.indentHint': 'Add two spaces to every selected line',
			      'panel.outdent': 'Outdent',
			      'panel.outdentHint': 'Remove two leading spaces from the selected lines',
			      'settings.editorFontSize': 'Editor font size',
			      'settings.editorFontSizeHint': 'Body text size inside Editor mode (pixels)',
			      'settings.keySize': 'Shortcut button size',
			      'settings.keySizeHint': 'Scale of the symbol row under the editor (100 = base)',
			      'panel.runes': '{count} chars',
			      'settings.title': 'Enhanced Prompt Editor',
			      'settings.storage': 'Draft storage',
			      'settings.storageHint': 'Where long prompts are kept. Takes effect immediately.',
			      'settings.storage.workspace': 'Workspace .md file (readable in the built-in viewer, multiple drafts)',
			      'settings.storage.browser': 'Browser local only (single draft, never written to disk)',
			      'settings.storage.none': 'Do not save (empty every time)',
			      'settings.dir': 'Draft directory',
			      'settings.dirHint': 'Relative to the session workspace root. Only used by "Workspace .md".',
			      'settings.enterMode': 'Enter key',
			      'settings.enterHint': 'Affects this panel only; change DSH\u2019s own composer under Settings → General.',
			      'settings.enterMode.newline': 'Enter adds a line, {send} sends',
			      'settings.enterMode.send': 'Enter sends, {send} adds a line',
			      'settings.height': 'Panel height',
			      'settings.heightHint': 'Pixels.',
			      'settings.browseWithReader': 'Allow opening in the built-in viewer',
			      'settings.browseWithReaderHint': 'When off, drafts stay in this panel and no workspace file is written.',
			      'settings.dictate': 'Show the dictate button',
			      'settings.dictateHint': 'Requires the speech-to-text plugin; without it the button never renders anyway.',
			      'settings.unavailable': 'The DSH settings service is unavailable; changes here will not be saved.',
			      'settings.readOnly': 'These settings are read-only in this deployment.',
			      'settings.save': 'Save',
			      'settings.saving': 'Saving…',
			      'settings.saveFailed': 'The host rejected this write; your draft was kept.',
			      'settings.overridden': 'Overridden',
			      'settings.reset': 'Reset',
			      'settings.invalidNumber': 'Enter a whole number between {min} and {max}.',
			      'settings.summary': 'Write long prompts: T opens a sidebar editor, or make the native composer grow upward.',
			      'settings.bootFailed': 'Some startup steps failed and were skipped (details):',
			      'settings.modes': 'Modes',
			      'settings.modesHint': 'Check the modes to enable. Clicking T in the composer tool row cycles the enabled modes and ends on Native.',
			      'settings.mode.editor': 'Editor mode',
			      'settings.mode.editorHint': 'T opens a Markdown panel in the sidebar, saveable as a workspace .md file.',
			      'settings.mode.extended': 'Tall composer mode',
			      'settings.mode.extendedHint': 'Makes the native DSH composer grow upward, with its own Enter behavior below.',
			      'settings.modeOrder': 'Cycle order',
			      'settings.modeOrderHint': 'Only matters when both modes are enabled.',
			      'settings.modeOrder.editorFirst': 'Editor → Tall composer',
			      'settings.modeOrder.extendedFirst': 'Tall composer → Editor',
			      'settings.extendedEnter': 'Enter in the tall composer',
			      'settings.extendedEnterHint':
			        'Affects the native composer only in tall-composer mode. DSH has no “Enter inserts a newline” option of its own (its Enter setting only picks queue vs. steer while the agent is busy).',
			      'settings.extendedEnter.inherit': 'Follow DSH: Enter sends, {send} adds a line',
			      'settings.extendedEnter.newline': 'Enter adds a line, {send} sends',
			      'settings.extendedHeight': 'Tall composer height',
			      'settings.extendedHeightHint': 'Pixels. The maximum height the composer grows to.',
			      'settings.needOneMode': 'Enable at least one mode; otherwise T only ever stays on Native.',
			      'settings.native': 'Native composer enhancements (no mode switch)',
			      'settings.nativeHint':
			        'The two options below apply directly in Native mode — no need to press T, and they do not change the composer’s height or looks. '
			        + 'They apply and save immediately (no Save button needed).',
			      'settings.nativeDeck': 'Show the floating deck on the native composer',
			      'settings.nativeDeckHint':
			        'Floats the symbol/indent toolbar above the composer (the same deck tall-composer mode uses).',
			      'settings.nativeEnter': 'Enable advanced Enter on the native composer',
			      'settings.nativeEnterHint':
			        'Lets Native mode use the Enter behavior below too (e.g. Enter adds a line, the send key sends). Tall-composer mode shares the same setting.',
			      'settings.hostStale':
			        'The running Host does not know these two fields yet (only the client bundle reloaded). '
			        + 'Saving them will be rejected by the Host — fully quit and restart DSH, then try again.',
			      'settings.saveRejected': 'The Host rejected this save.',
			    },
			  };
			}

			Object.assign(__exports, { "createLocale": createLocale });
		});
		__dshRegistry.set("boot-diagnostics.js", (__exports) => {
			var module = { exports: __exports };
			/**
			 * dsh-enhanced-prompt-editor —— 启动自检与失败留痕。
			 *
			 * 为什么需要这一层：DSH 的 web boot 把**每个客户端插件**的 cordis fiber 都
			 * 当成必须 ACTIVE 的条目；`apply` 里冒出来的任何异常都会把该 fiber 置为
			 * FAILED，于是整页启动直接抛 `web boot: N entry did not activate` 而白屏。
			 * 用户能看到的只有 `dsh-enhanced-prompt-editor: failed` 这一行——**没有堆栈、
			 * 没有出错位置**（cordis 把它交给了 logger，而渲染进程的 logger 不落盘）。
			 *
			 * 所以本模块做两件事：
			 *  1. 提供一个「绝不抛错」的步骤包装，让单个表面的接线失败不再拖垮整页；
			 *  2. 把失败步骤、消息、堆栈写进 `localStorage`，因为渲染进程里**唯一**
			 *     事后能从磁盘读回来的地方就是它（`~/.config/@deepseek-ai/dsh-desktop`
			 *     下的 Local Storage leveldb 是可读的纯文本），
			 *     顺带 `console.error` 一份（真崩了会进 crash log 的 renderer console 段）。
			 *
			 * @module dsh-enhanced-prompt-editor/boot-diagnostics
			 */

			/** 留痕键。读法：在 leveldb 的 .log/.ldb 里 grep 这个键。 */
			const BOOT_REPORT_KEY = 'dsh.enhanced-prompt-editor.boot';

			/**
			 * 取一个可用的 Web Storage，取不到就返回 undefined。
			 *
			 * 把存储当**不可信输入**：无痕模式、存储被策略禁用、Node 里没有该全局、
			 * 访问 `length` 就抛 SecurityError——全部按「没有存储」处理。
			 *
			 * @param kind 全局名（`localStorage` / `sessionStorage`）。
			 * @returns 可用的 storage，或 undefined。
			 */
			function safeStorage(kind) {
			  try {
			    const store = globalThis[kind];
			    if (store === undefined || store === null) return undefined;
			    // 读一次属性：被禁用时异常就抛在这里，而不是抛在后面的 setItem 里。
			    void store.length;
			    return store;
			  } catch {
			    return undefined;
			  }
			}

			/** 把附加上下文收敛成短字符串：优先 JSON，退化到 String，最后截断。 */
			function stringifyExtra(extra) {
			  if (extra === undefined) return undefined;
			  if (typeof extra === 'string') return extra.slice(0, 500);
			  try {
			    const json = JSON.stringify(extra);
			    if (typeof json === 'string') return json.slice(0, 500);
			  } catch {
			    // 循环引用之类：退到 String。
			  }
			  return String(extra).slice(0, 500);
			}

			/** 把一次失败收敛成可 JSON 化的记录（消息与堆栈都可能缺失或非字符串）。 */
			function describe(where, error, extra) {
			  const message = error instanceof Error ? error.message : String(error);
			  const stack = error instanceof Error && typeof error.stack === 'string' ? error.stack : '';
			  const detail = stringifyExtra(extra);
			  return {
			    where: String(where),
			    message,
			    // 截断：localStorage 有配额，且我们要的只是前几帧。
			    stack: stack.slice(0, 4000),
			    ...(detail === undefined ? {} : { extra: detail }),
			  };
			}

			/**
			 * 写一份启动报告。**任何一步失败都只吞掉，绝不外抛。**
			 *
			 * @param failures 本次启动累积的失败记录（空数组表示全部步骤成功）。
			 * @param context 额外的环境信息（版本号之类），可选。
			 * @returns 写进去的报告对象（便于测试断言）。
			 */
			function writeBootReport(failures, context) {
			  const report = {
			    at: new Date().toISOString(),
			    ok: failures.length === 0,
			    ...(context === undefined ? {} : { context }),
			    failures,
			  };
			  for (const kind of ['localStorage', 'sessionStorage']) {
			    const store = safeStorage(kind);
			    if (store === undefined) continue;
			    try {
			      store.setItem(BOOT_REPORT_KEY, JSON.stringify(report));
			    } catch {
			      // 配额耗尽、序列化失败、存储被拒——留痕失败不该影响启动。
			    }
			  }
			  return report;
			}

			/**
			 * 读回最近一次启动报告。
			 *
			 * @param kind 读哪个 storage；默认 localStorage。
			 * @returns 报告对象；没有、损坏或读不到时返回 undefined。
			 */
			function readBootReport(kind = 'localStorage') {
			  const store = safeStorage(kind);
			  if (store === undefined) return undefined;
			  try {
			    const raw = store.getItem(BOOT_REPORT_KEY);
			    if (typeof raw !== 'string') return undefined;
			    const parsed = JSON.parse(raw);
			    return parsed !== null && typeof parsed === 'object' ? parsed : undefined;
			  } catch {
			    return undefined;
			  }
			}

			/**
			 * 记录一个启动步骤的失败：`console.error` 一份，并返回记录对象。
			 *
			 * 调用方负责把返回值收集起来，最后交给 {@link writeBootReport} 一次写入
			 * （避免每个步骤各写一次存储）。
			 *
			 * @param where 步骤标识（例如 `sidebar-tab`）。
			 * @param error 抛出的值。
			 * @param extra 额外上下文，可选。
			 * @returns 失败记录。
			 */
			function describeBootFailure(where, error, extra) {
			  const entry = describe(where, error, extra);
			  try {
			    console.error(`[dsh-enhanced-prompt-editor] 启动步骤「${entry.where}」失败：`, error);
			  } catch {
			    // 连 console 都不可用就没什么能做的了。
			  }
			  return entry;
			}

			/**
			 * 包一个启动步骤：抛错时记一条失败记录并返回 `undefined`，**绝不外抛**。
			 *
			 * @param failures 失败记录收集数组（会被就地追加）。
			 * @param where 步骤标识。
			 * @param run 步骤本体。
			 * @param onError 失败时的兜底值工厂，可选。
			 * @returns `run()` 的返回值；失败时是 `onError?.()` 或 undefined。
			 */
			function guardStep(failures, where, run, onError) {
			  try {
			    return run();
			  } catch (error) {
			    failures.push(describeBootFailure(where, error));
			    if (onError === undefined) return undefined;
			    try {
			      return onError(error);
			    } catch (nested) {
			      failures.push(describeBootFailure(`${where}:fallback`, nested));
			      return undefined;
			    }
			  }
			}

			Object.assign(__exports, { "BOOT_REPORT_KEY": BOOT_REPORT_KEY, "writeBootReport": writeBootReport, "readBootReport": readBootReport, "describeBootFailure": describeBootFailure, "guardStep": guardStep });
		});
		__dshRegistry.set("client.js", (__exports) => {
			var module = { exports: __exports };
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
			const { PLUGIN_ID, SETTINGS_NAMESPACE, TAB_KIND, COMPOSER_SLOT_ID, EXTENDED_BAR_SLOT_ID, nextMode } = __dshRequire("./constants.js");
			const { createDraftStore, createSnapshotStore } = __dshRequire("./store.js");
			const { createDraftIO } = __dshRequire("./io.js");
			const { createSettingsFace } = __dshRequire("./settings-face.js");
			const { createModeController } = __dshRequire("./mode-controller.js");
			const { createNativeSwitches } = __dshRequire("./native-switches.js");
			const { attachEscapeExit } = __dshRequire("./escape-exit.js");
			const { EXTENDED_CSS, createNativeComposer } = __dshRequire("./native-composer.js");
			const { ComposerTrigger } = __dshRequire("./composer-trigger.js");
			const { ExtendedSymbolBar } = __dshRequire("./extended-bar.js");
			const { FloatingSymbolBar } = __dshRequire("./floating-bar.js");
			const { PanelBody, PanelTitle } = __dshRequire("./panel.js");
			const { PluginCard, setNativeSwitches, setPluginContext } = __dshRequire("./plugin-card.js");
			const { createLocale } = __dshRequire("./locale.js");
			const { guardStep, writeBootReport } = __dshRequire("./boot-diagnostics.js");
			const { ensureCss: injectStyle } = __dshRequire("./css.js");

			const name = PLUGIN_ID;

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
			const inject = ['slots', 'locale', 'sidebarRightTabs', 'sidebarRight'];

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
			function apply(ctx) {
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

			Object.assign(__exports, { "name": name, "inject": inject, "apply": apply });
		});
		var __entry = __dshRequire("client.js");
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		exports.apply = __entry.apply;
		exports.inject = __entry.inject ?? [];
		return module.exports;
	},
});
