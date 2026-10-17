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
export function injectCss(doc, cssId, css, pluginId) {
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
export function ensureCss(cssId, css, pluginId) {
  return injectCss(typeof document === 'undefined' ? undefined : document, cssId, css, pluginId);
}
