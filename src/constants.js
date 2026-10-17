/**
 * dsh-enhanced-prompt-editor —— 共享常量与纯函数。
 *
 * 这一层不 import 任何 DSH 包，浏览器与 Node 都能加载，因此设置 schema、
 * 客户端面板和单元测试可以共用同一份规则，不会出现两份实现漂移。
 *
 * @module dsh-enhanced-prompt-editor/constants
 */

/** 设置文档命名空间（设置页与该命名空间一一对应）。 */
export const SETTINGS_NAMESPACE = 'dsh-enhanced-prompt-editor';

/** 插槽/类型身份。 */
export const PLUGIN_ID = 'dsh-enhanced-prompt-editor';
export const TAB_KIND = 'enhanced-prompt-editor';
export const COMPOSER_SLOT_ID = 'dsh-enhanced-prompt-editor-trigger';

/**
 * 扩展输入框模式那条符号行的插槽 id。
 *
 * 同样必须是**自有 id**：list/keyed 槽里复用别人的 id 会顶掉对方的格子
 *（去重键是 id，不是注册者身份）。
 */
export const EXTENDED_BAR_SLOT_ID = `${PLUGIN_ID}-extended-bar`;
export const TAB_BODY_KEY = PLUGIN_ID;

/**
 * 存储方式。
 * - `workspace`：写成工作区里的 .md 文件，可多份、可被内置文件阅读器打开。
 * - `browser`：浏览器 localStorage 单份草稿。
 * - `none`：不持久化。
 */
export const STORAGE_MODES = ['workspace', 'browser', 'none'];

/** 回车键语义：回车是换行还是发送。 */
export const ENTER_MODES = ['newline', 'send'];

/** 面板默认高度（px）与允许区间。 */
export const DEFAULT_PANEL_HEIGHT = 420;
export const MIN_PANEL_HEIGHT = 180;
export const MAX_PANEL_HEIGHT = 1400;

/**
 * 编辑区字号（px）与允许区间。
 *
 * 用户 2026-10-16：「字号 图标没有大小设置 我觉得有点小」。做成设置项而不是
 * 写死，因为「有点小」的感受依赖屏幕与视力，只有用户自己知道合适值。
 */
export const DEFAULT_EDITOR_FONT_SIZE = 16;
export const MIN_EDITOR_FONT_SIZE = 11;
export const MAX_EDITOR_FONT_SIZE = 28;

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
export function lineHeightFor(fontSize) {
  const size = Number.isFinite(fontSize) ? fontSize : DEFAULT_EDITOR_FONT_SIZE;
  const clamped = Math.min(MAX_EDITOR_FONT_SIZE, Math.max(MIN_EDITOR_FONT_SIZE, size));
  return Math.round(clamped * 1.7);
}

/** 默认行高（默认字号下），给 CSS 兜底值用。 */
export const DEFAULT_LINE_HEIGHT = lineHeightFor(DEFAULT_EDITOR_FONT_SIZE);

/** 快捷键行按钮的图标/文字缩放（相对基准的百分比）与区间。 */
export const DEFAULT_KEY_SIZE = 100;
export const MIN_KEY_SIZE = 80;
export const MAX_KEY_SIZE = 180;

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
export const MODES = ['editor', 'extended', 'native'];

/** 可被用户在设置里勾选/排序的模式（原生不在其中）。 */
export const TOGGLEABLE_MODES = ['editor', 'extended'];

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
export const EXTENDED_ENTER_POLICIES = ['inherit', 'newline'];

/** 扩展输入框高度（px）默认值与允许区间。 */
export const DEFAULT_EXTENDED_HEIGHT = 640;
export const MIN_EXTENDED_HEIGHT = 240;
export const MAX_EXTENDED_HEIGHT = 2000;

/** 把高度夹进扩展输入框的允许区间；非数字退回默认值。 */
export function clampExtendedHeight(value) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_EXTENDED_HEIGHT;
  return Math.min(MAX_EXTENDED_HEIGHT, Math.max(MIN_EXTENDED_HEIGHT, Math.round(n)));
}

/** 把任意输入收敛到受支持的扩展输入框 Enter 策略。 */
export function normalizeExtendedEnter(value) {
  return EXTENDED_ENTER_POLICIES.includes(value) ? value : 'inherit';
}

/** 把任意输入收敛到一个受支持的模式。 */
export function normalizeMode(value) {
  return MODES.includes(value) ? value : 'native';
}

/**
 * 算出参与 T 循环的模式序列。
 *
 * @param config 形如 `{ modeEditor, modeExtended, editorFirst }` 的设置。
 * @returns 模式数组；两个增强都关掉时返回 `['native']`。
 */
export function cycleModes(config) {
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
export function nextMode(current, modes) {
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
export function resolveExtendedEnter(event, policy) {
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
export const MAX_DRAFT_CHARS = 200000;

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
export function safeDraftName(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  const withoutExt = raw.replace(/\.md$/i, '');
  if (withoutExt === '') return 'draft';
  if (!SAFE_NAME_RE.test(withoutExt)) return 'draft';
  // `.` 与 `..` 是目录遍历，必须挡掉。
  if (withoutExt === '.' || withoutExt === '..') return 'draft';
  return withoutExt;
}

/** 规范化落盘目录：去掉首尾斜杠，拒绝 `..` 段。 */
export function safeDraftDir(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (raw === '') return '.dsh/prompts';
  const normalized = raw.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const segments = normalized.split('/').filter((s) => s !== '' && s !== '.');
  if (segments.length === 0 || segments.some((s) => s === '..')) return '.dsh/prompts';
  return segments.join('/');
}

/** 把一个高度夹进允许区间；非数字退回默认值。 */
export function clampPanelHeight(value) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_PANEL_HEIGHT;
  return Math.min(MAX_PANEL_HEIGHT, Math.max(MIN_PANEL_HEIGHT, Math.round(n)));
}

/** 把编辑区字号夹进允许区间；非数字退回默认值。 */
export function clampEditorFontSize(value) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_EDITOR_FONT_SIZE;
  return Math.min(MAX_EDITOR_FONT_SIZE, Math.max(MIN_EDITOR_FONT_SIZE, Math.round(n)));
}

/** 把快捷键行缩放夹进允许区间；非数字退回默认值。 */
export function clampKeySize(value) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_KEY_SIZE;
  return Math.min(MAX_KEY_SIZE, Math.max(MIN_KEY_SIZE, Math.round(n)));
}

/** 把任意输入收敛到受支持的存储方式。 */
export function normalizeStorageMode(value) {
  return STORAGE_MODES.includes(value) ? value : 'workspace';
}

/** 把任意输入收敛到受支持的回车语义。 */
export function normalizeEnterMode(value) {
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
export function resolveEnterAction(event, enterMode) {
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
export function draftTitleOf(text, fallback = 'Prompt') {
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
export function defaultSettings(config) {
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

