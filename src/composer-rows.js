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
export function layoutOf(input, draft) {
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
export function stripeBackgroundOf(lineRows, lineTops, options = {}) {
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
export function gutterHeightsOf(lineRows, lineHeightPx) {
  if (!Number.isFinite(lineHeightPx) || lineHeightPx <= 0) return null;
  if (!Array.isArray(lineRows) || lineRows.length === 0) return null;
  return lineRows.map((rows) => Math.max(1, Math.round(toFinite(rows))) * lineHeightPx);
}
