/**
 * dsh-enhanced-prompt-editor —— 扩展输入框模式。
 *
 * 用户 2026-10-16 定的第二种模式：不动 DSH 的结构，只把**原生输入框**本身
 * 向上变高，并在该模式下单独决定裸回车的语义。
 *
 * ## 为什么是「改 CSS 变量」而不是「插一个自己的输入框」
 *
 * 内核 `dsh-client-ui-conversation` 的实测事实（0.2.1-alpha.2）：
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
import { clampExtendedHeight, resolveExtendedEnter } from './constants.js';

/**
 * 扩展输入框高度变量（我们自己的名字）。
 *
 * 为什么不复用内核的 `--dsh-composer-text-max-height`：那个变量**声明在
 * `.composerSeat` 自己身上**，所以从 `documentElement` 覆盖它会被 seat 自己的
 * 声明盖掉（就近胜出），只有直接写在 seat 的内联样式上才生效——而 seat 会被
 * 宿主在会话切换时**重新挂载**，内联样式随之丢失，扩展就悄悄没了。
 */
export const HEIGHT_VAR = '--dsh-epe-extended-height';

/** 挂在 `documentElement` 上的标记属性：CSS 只在它存在时命中。 */
export const MARK_ATTR = 'data-dsh-epe-extended';

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
export const EXTENDED_CSS =
  `html[${MARK_ATTR}] [data-input-scroll]{max-height:var(${HEIGHT_VAR},0px)}` +
  `html[${MARK_ATTR}] [data-composer-input]{min-height:var(${HEIGHT_VAR},0px)}`;

/** 内核给输入框根写的属性，用它精确锁定宿主那个 contenteditable。 */
const EDITOR_ATTR = 'data-composer-input';

/** 扩展输入框模式下生效的高度值（CSS 长度）。 */
export function composerHeightFor(settings) {
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
export function selectionText(editor) {
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
export function insertTextIntoComposer(editor, text) {
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
export function findComposerSeat(doc) {
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
export function findComposerEditor(doc) {
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
export function editorOf(root) {
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
export function insertNewline(editor) {
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
export function createNativeComposer(options) {
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
