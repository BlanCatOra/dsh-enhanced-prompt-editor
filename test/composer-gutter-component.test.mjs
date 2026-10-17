/**
 * 驱动**真实的** `ComposerGutter` 组件（离屏 Chromium），验证「接线层」。
 *
 * ## 为什么还要这一层（几何测试已经覆盖了算法）
 *
 * `test/extended-bar-geometry.test.mjs` 测的是**几何算法**（`layoutOf` /
 * `stripeBackgroundOf` / `applyLayout`），它在测试页里手工搭出 gutter 的 DOM。
 * 但历史上真正让用户「什么都看不到」的三次事故，全都在**胶水层**：
 *
 * 1. 找不到输入框就**一次放弃且永不重试** → 符号栏在、行号完全没有；
 * 2. `--dsh-epe-stripe` / `--dsh-epe-line` 没在模式二作用域定义
 *    → 整条 `background-image` 被判无效、静默不显示；
 * 3. 行号 span 的高度算错（按 rect 个数或按 `<p>` 个数）→ 行号整体下移。
 *
 * 这三条都**不会**被「手工搭 DOM」的测试发现，因为被测的不是生产代码。
 * 所以这里把 `src/composer-gutter.js` 的**源码整体**注入测试页（只剥掉
 * import，用极小的 hook 桩替代 React），直接调用生产组件，然后量真实结果。
 *
 * ## 测什么
 *
 * - `ComposerGutter` 在输入框**迟于**组件挂载出现时，仍然会接上（重试）；
 * - portal 落在内核 `.grow` 里（而不是 `document.body`）；
 * - 行号 span 的高度 = 该逻辑行占的视觉行数 × 实测行高；
 * - 行号列右缘与文字列左缘对齐（不压文字）；
 * - 写在输入区上的 `backgroundImage` 真的能解析（不是 none）。
 *
 * 依赖 `/usr/bin/electron`；没有则 skip。
 */
import assert from 'node:assert/strict';
import { makeProbeDir } from './electron-tmp.mjs';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const ELECTRON = '/usr/bin/electron';

/** 取出生产源码：`composer-rows.js` 全文 + `composer-gutter.js` 全文（去掉 import）。 */
async function loadProductionSources() {
  const rows = await readFile(join(root, 'src', 'composer-rows.js'), 'utf8');
  const gutter = await readFile(join(root, 'src', 'composer-gutter.js'), 'utf8');
  const css = (await readFile(join(root, 'src', 'extended-bar.js'), 'utf8'))
    .match(/const CSS = `([\s\S]*?)`;/)[1];
  return {
    rows: rows.replace(/^export /gm, ''),
    gutter: gutter.replace(/^import .*$/gm, '').replace(/^export /gm, ''),
    css,
  };
}

/**
 * 测试页。
 *
 * hook 桩的设计：`useState` 把值存进带下标的槽位，`useRef` 同理，
 * `useLayoutEffect` 把回调排进队列。每次「渲染」重置游标并执行排队的 effect
 * —— 于是 setState 之后的第二次渲染能拿到新值，组件里那条
 * 「找不到宿主就 rAF 重试」的路径被**真实执行**，不是被绕过。
 *
 * `h` 直接建真实 DOM（不是虚拟树），`createPortal` 把节点真的挂进容器 ——
 * 这样量到的就是生产代码最终产出的真实布局。
 */
function buildHtml({ rows, gutter, css, draft, bodyHtml, mountDelayFrames }) {
  return `<!doctype html><html data-dsh-epe-extended="extended"><head><meta charset="utf-8"><style>
:root{
  --dsw-alias-label-primary:#ffffff;
  --dsw-alias-label-tertiary:#ff0000;
  --dsw-alias-brand-primary:#5686fe;
  --dsw-specific-input-major:#22262c;
  --dsh-content-font-size:14px;
  --dsh-content-font-delta:0px;
  --dsh-composer-text-max-height:600px;
}
body{margin:0;background:#0e1013;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
${css}
.card{box-sizing:border-box;width:420px;margin:12px;padding-top:8px;position:relative;border-radius:12px;
  background:var(--dsw-specific-input-major);color:var(--dsw-alias-label-primary)}
.scroll{max-height:var(--dsh-composer-text-max-height);margin-right:4px;overflow-y:auto}
.grow{position:relative}
.input{box-sizing:border-box;min-height:36px;font-family:var(--dsw-font-family,ui-monospace);
  font-size:var(--dsh-content-font-size);line-height:calc(24px + var(--dsh-content-font-delta));
  white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;
  color:var(--dsw-alias-label-primary);outline:none;padding:4px 8px 0 14px}
.input p{margin:0}
</style></head><body>
<div class="card">
  <div class="scroll" data-input-scroll><div class="grow" id="grow"></div></div>
</div>
<script>
/* ── 极小的 React 桩（只覆盖本组件用到的四个 API）────────────────── */
const __hooks = { slots: [], cursor: 0, effects: [], lastDeps: new Map(), dirty: false };
function useState(initial) {
  const i = __hooks.cursor++;
  if (!(i in __hooks.slots)) __hooks.slots[i] = typeof initial === 'function' ? initial() : initial;
  const set = (value) => {
    __hooks.slots[i] = typeof value === 'function' ? value(__hooks.slots[i]) : value;
    __hooks.dirty = true;
  };
  return [__hooks.slots[i], set];
}
function useRef(initial) {
  const i = __hooks.cursor++;
  if (!(i in __hooks.slots)) __hooks.slots[i] = { current: initial };
  return __hooks.slots[i];
}
function useLayoutEffect(fn, deps) {
  const i = __hooks.cursor++;
  __hooks.effects.push({ fn, deps, i });
}
function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (k === 'key' || v === undefined || v === null) continue;
      if (k === 'className') el.className = v;
      else if (k === 'style' && typeof v === 'object') {
        for (const [sk, sv] of Object.entries(v)) {
          if (sk.startsWith('--')) el.style.setProperty(sk, String(sv));
          else el.style[sk] = sv;
        }
      } else if (k === 'aria-hidden' || k === 'role' || k.startsWith('data-')) el.setAttribute(k, String(v));
      else el[k] = v;
    }
  }
  for (const child of children.flat(Infinity)) {
    if (child === undefined || child === null || child === false) continue;
    el.appendChild(typeof child === 'object' && child.nodeType ? child : document.createTextNode(String(child)));
  }
  return el;
}
function createPortal(node, container) {
  container.appendChild(node);
  return node;
}
/* ── 生产源码 ─────────────────────────────────────────────────────── */
${rows}
${gutter}

const DRAFT = ${JSON.stringify(draft)};
const TEXT_HTML = ${JSON.stringify(bodyHtml)};

/** 渲染一次（跑完排队的 effect），返回组件返回值。 */
function render() {
  __hooks.cursor = 0;
  __hooks.effects = [];
  const out = ComposerGutter({ active: true, draft: DRAFT });
  for (const effect of __hooks.effects) {
    const prev = __hooks.lastDeps.get(effect.i);
    const changed = prev === undefined
      || effect.deps === undefined
      || effect.deps.some((d, k) => d !== prev[k]);
    if (!changed) continue;
    __hooks.lastDeps.set(effect.i, effect.deps ? [...effect.deps] : undefined);
    const cleanup = effect.fn();
    if (typeof cleanup === 'function') __cleanups.push(cleanup);
  }
  return out;
}
const __cleanups = [];

// 第一次渲染：**输入框还不存在**（复刻「模式从 localStorage 恢复、
// 挂载时会话还没画完」的真实时序）。生产组件的重试逻辑必须能接上。
window.__firstReturn = render();
window.__firstFound = document.querySelector('[data-composer-input]') !== null;

// 隔若干帧后才把输入框插进 DOM —— 只靠「挂载时找一次」的实现会永远错过。
let frames = 0;
const grow = document.getElementById('grow');
function tick() {
  frames += 1;
  if (frames === ${mountDelayFrames}) {
    grow.insertAdjacentHTML('afterbegin', '<div class="input" data-composer-input contenteditable="false">' + TEXT_HTML + '</div>');
  }
  if (frames >= ${mountDelayFrames} + 30) {
    window.__portalReturn = render(); // 重试成功后 setState → 再渲染一次拿到 portal
    window.__done = true;
    return;
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
</script></body></html>`;
}

/** 跑一次离屏渲染。 */
async function renderComponent(html, { width = 520, height = 900 } = {}) {
  const dir = makeProbeDir('epe-gutter-cmp-');
  const script = `
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
const file = ${JSON.stringify(join(dir, 'page.html'))};
fs.writeFileSync(file, ${JSON.stringify(html)});
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: ${width}, height: ${height}, show: false,
    webPreferences: { offscreen: true } });
  win.webContents.setFrameRate(20);
  const frames = [];
  win.webContents.on('paint', (_e, _d, image) => frames.push(image));
  await win.loadFile(file);
  // 等页面里的 rAF 循环跑完（它自己会置 __done）。
  for (let i = 0; i < 60; i += 1) {
    const done = await win.webContents.executeJavaScript('window.__done === true');
    if (done) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  await new Promise((r) => setTimeout(r, 300));
  const geo = await win.webContents.executeJavaScript('(() => {' +
    'const input = document.querySelector("[data-composer-input]");' +
    'const grow = document.getElementById("grow");' +
    'const cs = input ? getComputedStyle(input) : null;' +
    'const px = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };' +
    'const r = input ? input.getBoundingClientRect() : null;' +
    'return { done: window.__done === true, firstFound: window.__firstFound,' +
    '  firstReturnIsNull: window.__firstReturn === null || window.__firstReturn === undefined,' +
    '  portalReturnIsNull: window.__portalReturn === null || window.__portalReturn === undefined,' +
    '  frames: frames,' +
    '  gutterParentClass: (() => { const g = document.querySelector(".dsh-epe-xgutter");' +
    '    return g && g.parentElement ? g.parentElement.className : null; })(),' +
    '  gutterInGrow: (() => { const g = document.querySelector(".dsh-epe-xgutter");' +
    '    return !!(g && grow && grow.contains(g)); })(),' +
    '  input: input ? { left: r.left, top: r.top, width: r.width, height: r.height,' +
    '    padLeft: px(cs.paddingLeft), padTop: px(cs.paddingTop), padBottom: px(cs.paddingBottom),' +
    '    lineHeight: px(cs.lineHeight),' +
    '    backgroundImage: cs.backgroundImage } : null,' +
    '  spans: [...document.querySelectorAll(".dsh-epe-xgutter span")].map((el) => {' +
    '    const rr = el.getBoundingClientRect();' +
    '    return { text: el.textContent, top: rr.top, height: rr.height }; }),' +
    '  gutterBox: (() => { const g = document.querySelector(".dsh-epe-xgutter");' +
    '    if (!g) return null; const gr = g.getBoundingClientRect();' +
    '    return { left: gr.left, top: gr.top, width: gr.width, height: gr.height }; })() };' +
  '})()');
  fs.writeFileSync(${JSON.stringify(join(dir, 'geo.json'))}, JSON.stringify(geo));
  if (frames.length) fs.writeFileSync(${JSON.stringify(join(dir, 'shot.png'))}, frames[frames.length - 1].toPNG());
  console.log('OK');
  app.exit(0);
});
setTimeout(() => { console.log('TIMEOUT'); app.exit(4); }, 30000);
`;
  const scriptPath = join(dir, 'probe.js');
  writeFileSync(scriptPath, script);
  const out = execFileSync(ELECTRON, [scriptPath], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '' },
    encoding: 'utf8', timeout: 90000,
  });
  assert.match(out, /OK/, `离屏渲染应成功，实际输出：${out.trim()}`);
  return JSON.parse(await readFile(join(dir, 'geo.json'), 'utf8'));
}

const DRAFT_7 = [
  'Pending Jobs',
  'User must verify after an app restart: mode-2 line numbers match line count.',
  'App restart required for the new bundle.',
  'Paste button uses navigator.clipboard.readText().',
  'Mode-2 gutter is 22px.',
  'Current Work',
  'All fixes are implemented and tested.',
].join('\n');

test('真实组件：输入框比组件晚出现时，ComposerGutter 必须重试并最终接上', { timeout: 120000 }, async (t) => {
  if (!existsSync(ELECTRON)) { t.skip('本机没有 /usr/bin/electron，跳过组件测试'); return; }
  const sources = await loadProductionSources();
  const geo = await renderComponent(buildHtml({
    ...sources,
    draft: DRAFT_7,
    bodyHtml: `<p>${DRAFT_7.replace(/\n/g, '\n')}</p>`,
    mountDelayFrames: 5,
  }));

  // 前置条件：第一次渲染时输入框确实还不存在（否则这条测试没测到重试）。
  assert.equal(geo.firstFound, false, '前置条件：首次渲染时输入框必须还不存在');
  assert.equal(geo.firstReturnIsNull, true, '前置条件：首次渲染应返回 null（还没有宿主）');
  // 核心断言：重试之后接上了。
  assert.equal(geo.done, true, '页面的 rAF 循环应跑完');
  assert.equal(geo.portalReturnIsNull, false, '重试成功后组件必须返回 portal（不再是 null）');
  assert.ok(geo.gutterBox !== null, '行号 gutter 最终必须真的出现在 DOM 里（这是「行号完全没有」的回归守卫）');
  assert.equal(geo.gutterInGrow, true, 'gutter 必须 portal 到内核的 .grow 里（而不是别处）');
});

test('真实组件：span 高度 = 逻辑行视觉行数 × 实测行高；行号列不压文字；渐变有效', { timeout: 120000 }, async (t) => {
  if (!existsSync(ELECTRON)) { t.skip('本机没有 /usr/bin/electron，跳过组件测试'); return; }
  const sources = await loadProductionSources();
  // 内容与草稿一致（逻辑行 = 草稿的 7 行）。用真实换行字符，不带 <br>。
  const geo = await renderComponent(buildHtml({
    ...sources,
    draft: DRAFT_7,
    bodyHtml: `<p>${DRAFT_7}</p>`,
    mountDelayFrames: 2,
  }));

  assert.ok(geo.input, '输入框必须存在');
  assert.ok(geo.gutterBox, 'gutter 必须存在');

  // 行号：7 条逻辑行 → 7 个 span，文本 1..7。
  assert.deepEqual(
    geo.spans.map((s) => s.text),
    ['1', '2', '3', '4', '5', '6', '7'],
    '行号必须按逻辑行递增（数量不对 = 逻辑行切分错了）',
  );
  // 每个 span 的高度必须是行高的整数倍，且总和 = 输入区内容高度。
  const lh = geo.input.lineHeight;
  assert.ok(lh > 0, `必须量到实测行高，实际 ${lh}`);
  for (const span of geo.spans) {
    const multiple = span.height / lh;
    assert.ok(
      Math.abs(multiple - Math.round(multiple)) < 0.02 && Math.round(multiple) >= 1,
      `行号 ${span.text} 的高度必须是行高的整数倍（实测 ${span.height}px / 行高 ${lh}px = ${multiple}）`,
    );
  }
  const contentHeight = geo.input.height - geo.input.padTop - geo.input.padBottom;
  const sum = geo.spans.reduce((s, x) => s + x.height, 0);
  assert.ok(
    Math.abs(sum - contentHeight) <= 1.5,
    `行号总高必须等于输入区内容高：行号合计 ${sum.toFixed(1)}，内容高 ${contentHeight.toFixed(1)}`,
  );
  // 行号列右缘必须与文字列左缘对齐（不压文字、也不留空档）。
  const gutterRight = geo.gutterBox.left + geo.gutterBox.width;
  const contentLeft = geo.input.left + geo.input.padLeft;
  assert.ok(
    Math.abs(gutterRight - contentLeft) <= 1.5,
    `行号列右缘 ${gutterRight.toFixed(1)} 必须与文字列左缘 ${contentLeft.toFixed(1)} 对齐 `
    + `（偏差 ${(gutterRight - contentLeft).toFixed(1)}px；这正是「行标与光标重叠」的守卫）`,
  );
  assert.ok(
    gutterRight <= contentLeft + 0.5,
    `行号列不得伸进文字列（右缘 ${gutterRight.toFixed(1)} > 文字左缘 ${contentLeft.toFixed(1)}）`,
  );
  // 渐变色必须真的解析出来（不是 none）—— 变量未定义时会被静默丢弃。
  assert.notEqual(geo.input.backgroundImage, 'none', '行号/条纹要求的 backgroundImage 必须真的生效（不能是 none）');
  assert.match(geo.input.backgroundImage, /linear-gradient/, 'backgroundImage 必须是生成的渐变');
  assert.ok(
    !/rgba\(0, 0, 0, 0\) 0px, rgba\(0, 0, 0, 0\) 0px\)?$/.test(geo.input.backgroundImage),
    `渐变不得整条退化成透明（变量没定义时会这样）：${geo.input.backgroundImage.slice(0, 160)}`,
  );
});

test('真实组件（变异）：去掉重试（找不到就永久放弃）→ 守卫必须变红', { timeout: 120000 }, async (t) => {
  if (!existsSync(ELECTRON)) { t.skip('本机没有 /usr/bin/electron，跳过组件测试'); return; }
  const sources = await loadProductionSources();
  // 忠实复刻「一次放弃」的旧实现：找到 null 就直接 return（不排重试）。
  const mutated = sources.gutter.replace(
    /if \(ticks < ATTACH_TICKS\) waitHandle = schedule\(tryAttach\);/,
    '/* 变异：不重试 */;',
  );
  assert.notEqual(mutated, sources.gutter, '变异必须真的改到源码（重试那行被移除）');
  const geo = await renderComponent(buildHtml({
    ...sources,
    gutter: mutated,
    draft: DRAFT_7,
    bodyHtml: `<p>${DRAFT_7}</p>`,
    mountDelayFrames: 5,
  }));
  // 输入框晚 5 帧出现 → 不重试的实现永远接不上，gutter 不会存在。
  assert.equal(geo.gutterBox, null, '「找不到就永久放弃」的实现必须接不上（否则这条守卫是空的）');
  assert.equal(geo.portalReturnIsNull, true, '「找不到就永久放弃」的实现不得产出 portal');
});
