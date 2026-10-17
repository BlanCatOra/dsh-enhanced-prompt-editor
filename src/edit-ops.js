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
export const SYMBOLS = [
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
export const INDENT_BUTTONS = [
  { key: 'indent', label: '→', outdent: false },
  { key: 'outdent', label: '←', outdent: true },
];

/**
 * 把下标夹进合法范围。
 *
 * 选择区的下标来自 DOM，可能是 `null`、越界、或反序（有些输入法会这样），
 * 直接用会让 `slice` 静默产出错内容。
 */
export function clampRange(text, start, end) {
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
export function wrapSelection(text, start, end, before, after) {
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
export function prefixLines(text, start, end, prefix) {
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
export function insertPlain(text, start, end, insert) {
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
export function applySymbol(text, start, end, symbol) {
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
export const INDENT = '  ';

export function indentLines(text, start, end, outdent = false) {
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
export function isAlternateLine(index) {
  return index % 2 === 1;
}
