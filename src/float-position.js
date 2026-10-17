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
export const GAP_ABOVE_INPUT = 10;

/**
 * 悬浮条**上方**额外留的呼吸空间（px）。
 *
 * 预留带只按「正好放下悬浮条」时，预留带上沿会紧贴悬浮条顶边，看起来仍像挤在一起；
 * 多出来的这点让预留带比悬浮条大一圈。
 */
export const RESERVE_EXTRA = 6;

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
export function reserveHeightFor(hostHeight) {
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
export function floatTopFor(hostHeight) {
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
