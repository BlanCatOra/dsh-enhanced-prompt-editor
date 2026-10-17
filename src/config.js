/**
 * dsh-enhanced-prompt-editor —— Host 配置 schema。
 *
 * `volatile()` 的语义（本机实测确认，不是照猜）：被标记的字段在插值结果里
 * 不是普通值，而是一个 `{ get(), [write] }` 活引用——`Config({})` 对 `storage`
 * 返回的是 `{get: fn}` 而不是 `'workspace'`。读取时必须 `.get()`，否则拿到的
 * 是个对象，比较与赋值全都不成立（这是「设置页改了没反应」类缺陷的根源）。
 *
 * 所以本模块导出两样东西：
 *  - `Config`：交给 DSH 的 settings 服务（它自己知道怎么处理活引用）；
 *  - `resolveConfig(raw)`：给 Host 代码用的普通值视图，统一剥掉引用。
 *
 * @module dsh-enhanced-prompt-editor/config
 */
import z from '@deepseek-ai/schemastery';
import {
  DEFAULT_EDITOR_FONT_SIZE,
  DEFAULT_EXTENDED_HEIGHT,
  DEFAULT_KEY_SIZE,
  DEFAULT_PANEL_HEIGHT,
  EXTENDED_ENTER_POLICIES,
  MAX_EDITOR_FONT_SIZE,
  MAX_EXTENDED_HEIGHT,
  MAX_KEY_SIZE,
  MAX_PANEL_HEIGHT,
  MIN_EDITOR_FONT_SIZE,
  MIN_EXTENDED_HEIGHT,
  MIN_KEY_SIZE,
  MIN_PANEL_HEIGHT,
  STORAGE_MODES,
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

/** 兼容不支持 volatile() 的 schemastery：原样返回，行为退化为普通字段。 */
function asVolatile(schema) {
  return typeof schema.volatile === 'function' ? schema.volatile() : schema;
}

/** Host 侧配置。 */
export const Config = z.object({
  storage: asVolatile(
    z
      .union(STORAGE_MODES.map((mode) => z.const(mode)))
      .default('workspace')
      .description('草稿存哪里：workspace 写工作区 .md 文件 / browser 只存浏览器 / none 不持久化'),
  ),
  dir: asVolatile(
    z
      .string()
      .default('.dsh/prompts')
      .description('落盘目录，相对于会话工作区根（仅 storage=workspace 时使用）'),
  ),
  enterMode: asVolatile(
    z
      .union([z.const('newline'), z.const('send')])
      .default('newline')
      .description('面板里回车的语义：newline 回车换行、Cmd/Ctrl+Enter 发送；send 反之'),
  ),
  panelHeight: asVolatile(
    z
      .natural()
      .min(MIN_PANEL_HEIGHT)
      .max(MAX_PANEL_HEIGHT)
      .default(DEFAULT_PANEL_HEIGHT)
      .description('面板默认高度（像素）'),
  ),
  editorFontSize: asVolatile(
    z
      .natural()
      .min(MIN_EDITOR_FONT_SIZE)
      .max(MAX_EDITOR_FONT_SIZE)
      .default(DEFAULT_EDITOR_FONT_SIZE)
      .description('编辑区字号（像素）'),
  ),
  keySize: asVolatile(
    z
      .natural()
      .min(MIN_KEY_SIZE)
      .max(MAX_KEY_SIZE)
      .default(DEFAULT_KEY_SIZE)
      .description('快捷键行按钮的缩放（百分比，100 = 基准大小）'),
  ),
  browseWithReader: asVolatile(
    z.boolean().default(true).description('允许用 DSH 内置文件阅读器打开落盘的草稿'),
  ),
  dictate: asVolatile(
    z.boolean().default(true).description('在面板右下角显示听写按钮（需已安装语音转文字插件）'),
  ),
  modeEditor: asVolatile(
    z
      .boolean()
      .default(true)
      .description('启用「编辑器模式」：工具行 T 按钮打开右侧栏 Markdown 面板'),
  ),
  modeExtended: asVolatile(
    z
      .boolean()
      .default(true)
      .description('启用「扩展输入框模式」：把 DSH 原生输入框向上加高，并可单独设置回车语义'),
  ),
  editorFirst: asVolatile(
    z
      .boolean()
      .default(true)
      .description('两种模式都启用时，T 的循环顺序：开=编辑器在前，关=扩展输入框在前'),
  ),
  extendedEnter: asVolatile(
    z
      .union(EXTENDED_ENTER_POLICIES.map((policy) => z.const(policy)))
      .default('inherit')
      .description('扩展输入框模式下裸回车的语义：inherit 跟随 DSH（回车发送）／newline 回车换行'),
  ),
  extendedHeight: asVolatile(
    z
      .natural()
      .min(MIN_EXTENDED_HEIGHT)
      .max(MAX_EXTENDED_HEIGHT)
      .default(DEFAULT_EXTENDED_HEIGHT)
      .description('扩展输入框模式下输入框的最大高度（像素）'),
  ),
  nativeDeck: asVolatile(
    z
      .boolean()
      .default(false)
      .description('在原生模式的输入框上应用悬浮 deck（符号/缩进工具条）'),
  ),
  nativeEnter: asVolatile(
    z
      .boolean()
      .default(false)
      .description('在原生模式的输入框上启用「高级回车」（复用上面那份回车策略）'),
  ),
});

/** 剥掉一层 volatile 活引用。 */
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

/** 递归剥掉所有 volatile 活引用。 */
export function unwrapDeep(value) {
  const once = unwrap(value);
  if (once === null || typeof once !== 'object') return once;
  if (Array.isArray(once)) return once.map(unwrapDeep);
  const out = {};
  for (const [key, item] of Object.entries(once)) out[key] = unwrapDeep(item);
  return out;
}

/**
 * 把 Host 配置（可能含活引用）变成普通值设置对象。
 *
 * @param raw 行配置或插值后的配置。
 * @returns 规整过的设置，字段一定存在且合法。
 */
export function resolveConfig(raw = {}) {
  const plain = unwrapDeep(raw);
  const base = defaultSettings(plain);
  return {
    storage: normalizeStorageMode(plain?.storage ?? base.storage),
    dir: safeDraftDir(plain?.dir ?? base.dir),
    enterMode: normalizeEnterMode(plain?.enterMode ?? base.enterMode),
    panelHeight: clampPanelHeight(plain?.panelHeight ?? base.panelHeight),
    editorFontSize: clampEditorFontSize(plain?.editorFontSize ?? base.editorFontSize),
    keySize: clampKeySize(plain?.keySize ?? base.keySize),
    browseWithReader:
      typeof plain?.browseWithReader === 'boolean' ? plain.browseWithReader : base.browseWithReader,
    dictate: typeof plain?.dictate === 'boolean' ? plain.dictate : base.dictate,
    modeEditor: typeof plain?.modeEditor === 'boolean' ? plain.modeEditor : base.modeEditor,
    modeExtended: typeof plain?.modeExtended === 'boolean' ? plain.modeExtended : base.modeExtended,
    editorFirst: typeof plain?.editorFirst === 'boolean' ? plain.editorFirst : base.editorFirst,
    extendedEnter: normalizeExtendedEnter(plain?.extendedEnter ?? base.extendedEnter),
    extendedHeight: clampExtendedHeight(plain?.extendedHeight ?? base.extendedHeight),
    nativeDeck: typeof plain?.nativeDeck === 'boolean' ? plain.nativeDeck : base.nativeDeck,
    nativeEnter: typeof plain?.nativeEnter === 'boolean' ? plain.nativeEnter : base.nativeEnter,
  };
}
