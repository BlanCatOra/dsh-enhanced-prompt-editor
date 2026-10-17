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
export const MEASURE_CLASS = 'dsh-epe-measure';

/** 镜像宿主的类名：0 尺寸、绝对定位，只为让 React 拥有一个可以挂镜像的容器。 */
export const MEASURE_HOST_CLASS = 'dsh-epe-measureHost';

/** 把任意外部输入收敛成「每个逻辑行占几个物理行」的数组。 */
export function normalizeRowCounts(rowCounts) {
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
export function contentWidthOf(editor) {
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
export function rowsOf(mirror) {
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
export function attachMeasurer(host) {
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
export function stripeSpansOf(rowCounts) {
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
export function stripeBackgroundOf(spans, options = {}) {
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
export function gutterHeightsOf(rowCounts, lineHeightPx) {
  if (!Number.isFinite(lineHeightPx) || lineHeightPx <= 0) return null;
  return normalizeRowCounts(rowCounts).map((rows) => rows * lineHeightPx);
}
