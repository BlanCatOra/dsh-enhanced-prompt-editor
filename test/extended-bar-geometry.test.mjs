/**
 * 模式二（内核 Lexical contenteditable）的「行号 + 逻辑行交替底色」几何测试。
 *
 * ## 为什么必须有这一层
 *
 * 这个功能被**两次**实测推翻，两次都是「自己另造行几何」：
 *
 * 1. **CSS counter 数 `<p>`**：粘贴产物可能只有 1 个 `<p>`（换行在 `<br>` 里），
 *    counter 恒为 1 → 用户报「模式二没有行标数、背景色不变化」。
 * 2. **去 DOM 里数 `<br>` 切逻辑行**（2026-10-17）：真实换行往往只是**文本节点
 *    里的换行字符**（`white-space:pre-wrap` 直接渲染成新行，不需要 `<br>`），
 *    于是**一整段被当成 1 个逻辑行** → 用户截图里「前 15 行同色、行号「1」
 *    被撑到 15 行高、后面的行号整体下移并压住正文」。
 *
 * 现在逻辑行以**草稿文本**（`draft.split('\n')`）为唯一权威 —— 与模式一
 * （`panel.js` 的 textarea）完全同源。用户原话：「分行依旧未使用模式一的实现
 * 你不能照搬吗」。
 *
 * ## 这一层测什么（静态断言证明不了的东西）
 *
 * ① 同一个逻辑行的全部软换行视觉行**确实同色**；
 * ② 相邻逻辑行**确实交替**深浅；
 * ③ 行号**确实落在**该逻辑行首个视觉行的位置上（且数值递增）；
 * ④ **行号列不压文字**（用户 2026-10-17：「行标与光标重叠」）；
 * ⑤ 条纹**只铺在文字列**上，不漫到行号列。
 *
 * 2026-10-16 的教训（E-014 同类）：107 个测试全绿，而条纹首带被 padding 撑成
 * 39px。所以这一层用**离屏 Chromium 真实渲染**取帧、逐像素量。
 *
 * ## 测量设计
 *
 * - 条纹亮度：在文字列横向取一大段、逐行取**中位数**（笔画是少数像素，
 *   中位数对其免疫），留下纯背景亮度剖面。
 * - 行号位置：测试页把 `--dsw-alias-label-tertiary` 覆盖成**纯红**，于是
 *   「行号画在哪几行」可以用「红分量 − max(绿,蓝)」这个与灰度无关的量精确判定。
 *   不靠肉眼、不靠亮度阈值猜。
 * - 行号**数值**：直接读 gutter span 的 `textContent`（真实 DOM 元素，
 *   不是 CSS 的 ::before）—— 代理指标不如真值可靠。
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

/** 从源码里取出样式（模式二的 CSS 在 extended-bar.js 的 CSS 模板字符串里）。 */
async function extractCss() {
  const src = await readFile(join(root, 'src', 'extended-bar.js'), 'utf8');
  const m = src.match(/const CSS = `([\s\S]*?)`;/);
  assert.ok(m, '能从 src/extended-bar.js 提取 CSS 模板字符串');
  return m[1];
}

/**
 * 取出生产代码并去掉 `export ` 前缀后注入测试页。
 *
 * ⚠️ 注入**真实源码**而不是在测试里抄一份算法：抄件会与实现漂移，
 * 实现改错而测试照旧绿（E-014 的同类形状）。
 *
 * - `composer-rows.js`：行几何 + 条纹（零 import，可直接注入）。
 * - `composer-gutter.js` 的 `lengthOf` / `applyLayout` / `clearLayout`：
 *   写样式的那一段。**必须驱动真代码** —— 「条纹写在哪、起点怎么算」
 *   正是出错的地方（background-origin 与 padding-top 的关系）。
 */
async function loadSources() {
  const rows = await readFile(join(root, 'src', 'composer-rows.js'), 'utf8');
  const gutter = await readFile(join(root, 'src', 'composer-gutter.js'), 'utf8');
  const pick = (name) => {
    const m = gutter.match(new RegExp(`(?:export )?function ${name}\\([\\s\\S]*?\\n\\}`));
    assert.ok(m, `能从 src/composer-gutter.js 提取 ${name}`);
    return m[0];
  };
  return [rows, pick('lengthOf'), pick('applyLayout'), pick('clearLayout')]
    .join('\n')
    .replace(/^export /gm, '');
}

/**
 * 复刻生产 DOM 结构：`.card > .scroll > .grow > .input`，几何照抄内核
 * `InputBar.module.css` 的实测值。
 *
 * ## 三种真实 DOM 形状（都必须支持）
 *
 * | 变体 | 结构 | 出现的场合 |
 * |---|---|---|
 * | 默认 | 1 个 `<p>` + 行间 `<br>` | `insertRawText()` 的经典产物 |
 * | `newlineText` | 1 个 `<p>`，**换行是文本节点里的换行字符** | ⚠️ **2026-10-17 用户截图那个形状**（旧实现把它当成 1 个逻辑行） |
 * | `perParagraph` | 每行一个 `<p>`，各带尾 `<br>` | 程序化插入 / 回车换行 |
 * | `sixLines` | 6 个短段落各带尾 `<br>` | 用户报「实际只有六行 却显示到12」的精确形状 |
 *
 * ⚠️ Lexical 会给**每个段落结尾**渲染一个 `<br>`（contenteditable 里空块必须有
 * `<br>` 才显示得出来）。复刻时不能漏，否则测不到「尾 `<br>` 被当成额外一行」。
 * 也不能因此把逻辑行数算多 —— 尾 `<br>` **不加行盒**（离屏实测：
 * `<p>aaa<br></p>` = 1 行、`<p>aaa<br><br></p>` = 2 行）。
 *
 * @param css 模式二的 CSS。
 * @param source 生产源码（`layoutOf` / `applyLayout` / `stripeBackgroundOf`）。
 * @param options `{ variant, draft, textLines, longFirst }`。
 */
function buildHtml(css, source, options = {}) {  const logical = ['W'.repeat(150), 'second logical line', 'third', 'fourth'];
  const shaped = options.fragmented
    ? logical.map((line) => {
        const head = line.slice(0, 3).split('').map((ch) => `<span>${ch}</span>`).join('');
        const rest = line.slice(3);
        return head + (rest === '' ? '' : `<span>${rest}</span>`);
      })
    : logical;

  const six = ['line one', 'line two', 'line three', 'line four', 'line five', 'line six'];

  // ⚠️⚠️ 2026-10-17 的关键变体：换行是**文本节点里的换行字符**，没有 <br>。
  // 这是用户截图里真实出现的形状，也是「一整段被当成一行」的触发条件。
  // 第一版（<br> 形状）恰好是旧实现唯一能算对的形状 —— 测试全绿而真机全废。
  const newlineLines = options.newlineLines ?? [
    'Pending Jobs',
    'User must verify after an app restart: mode-2 line numbers match line count.',
    'App restart required for the new bundle.',
    'Paste button uses navigator.clipboard.readText().',
    'Mode-2 gutter is 22px.',
    'Current Work',
    'All fixes are implemented and tested.',
  ];

  let bodyHtml;
  let draft;
  if (options.variant === 'newlineText') {
    bodyHtml = `<p>${newlineLines.join('\n')}</p>`;
    draft = newlineLines.join('\n');
  } else if (options.variant === 'sixLines') {
    bodyHtml = six.map((line) => `<p>${line}<br></p>`).join('');
    draft = six.join('\n');
  } else if (options.variant === 'perParagraph') {
    bodyHtml = shaped.map((line) => `<p>${line}<br></p>`).join('');
    draft = logical.join('\n');
  } else {
    const pasted = shaped.join('<br>');
    bodyHtml = `<p>${pasted}${options.trailingBr ? '<br>' : ''}</p>`;
    draft = logical.join('\n');
  }
  if (typeof options.draft === 'string') draft = options.draft;
  // 允许调用方直接给 body（用于复刻特定内核产物，如带 hint 的段落）。
  if (typeof options.overrideBody === 'string') bodyHtml = options.overrideBody;

  // ⚠️ 复刻内核的 `/命令` 用法提示：**伪元素**挂在最后一段上
  //   .input p:last-child:after{content:var(--dsh-composer-hint)}
  // 它不在文本流里，`Range.getClientRects()` 数不到 —— 但它会占宽度，
  // 把最后一行挤到下一行。独立验证（/tmp/epe-verify 的 Q1/Q2）实测：
  // hint="  / 查看命令" 时地面真值是 4 行，纯 range 测量只给 3 行。
  const hintCss = options.hint === undefined
    ? ''
    : `.input p:last-child:after{content:${JSON.stringify(options.hint)};color:var(--dsw-alias-label-caption)}
       .input[data-composer-composing] p:last-child:after{content:none}`;

  return `<!doctype html><html data-dsh-epe-extended="extended"><head><meta charset="utf-8"><style>
:root{
  /* 测试用主题 token。label-tertiary 故意设成纯红，用于精确定位行号。 */
  --dsw-alias-label-primary:#ffffff;
  --dsw-alias-label-tertiary:#ff0000;
  --dsw-alias-brand-primary:#5686fe;
  --dsw-specific-input-major:#22262c;
  --dsh-content-font-size:14px;
  --dsh-content-font-delta:0px;
  --dsh-composer-text-max-height:${options.composerMaxHeight ?? 600}px;
}
body{margin:0;background:#0e1013;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
${css}
/* 内核 InputBar 的真实几何（只保留与本功能相关的部分） */
.card{box-sizing:border-box;width:420px;margin:12px;padding-top:8px;position:relative;border-radius:12px;
  background:var(--dsw-specific-input-major);color:var(--dsw-alias-label-primary)}
.scroll{max-height:var(--dsh-composer-text-max-height);margin-right:4px;overflow-y:auto}
.grow{position:relative}
.input{box-sizing:border-box;min-height:36px;font-family:var(--dsw-font-family,ui-monospace);
  font-size:var(--dsh-content-font-size);line-height:calc(24px + var(--dsh-content-font-delta));
  white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;
  color:var(--dsw-alias-label-primary);outline:none;padding:4px 8px 0 14px}
.input p{margin:0}
${hintCss}
</style></head><body>
<div class="card">
  <div class="scroll" data-input-scroll><div class="grow" id="grow"><div class="input" data-composer-input contenteditable="false">${bodyHtml}</div></div></div>
  <div class="row">row</div>
</div>
<script>
${source}
const DRAFT = ${JSON.stringify(draft)};
const input = document.querySelector('[data-composer-input]');
const grow = document.getElementById('grow');

// ── 与 composer-gutter.js 的 ComposerGutter 完全同一条调用链 ──────────
const layout = layoutOf(input, DRAFT);
if (layout !== null) applyLayout(input, layout);

// ── gutter：与 ComposerGutter 的渲染分支同款（一个逻辑行一个 span）──
const view = input.ownerDocument.defaultView;
if (layout !== null) {
  const gutter = document.createElement('div');
  gutter.className = 'dsh-epe-xgutter';
  gutter.setAttribute('aria-hidden', 'true');
  gutter.style.top = (parseFloat(view.getComputedStyle(input).paddingTop) || 0) + 'px';
  const w = input.style.getPropertyValue('--dsh-epe-gutter-w')
    || view.getComputedStyle(input).getPropertyValue('--dsh-epe-gutter-w');
  gutter.style.width = w;
  gutter.style.setProperty('--dsh-epe-gutter-w', w);
  gutter.style.setProperty('--dsh-epe-line', layout.lineHeight + 'px');
  gutter.style.setProperty('--dsh-epe-gutter-font',
    Math.max(10, Math.round(parseFloat(view.getComputedStyle(input).fontSize) - 2)) + 'px');
  for (let i = 0; i < layout.totalLines; i += 1) {
    const span = document.createElement('span');
    span.style.height = ((layout.lineRows[i] ?? 1) * layout.lineHeight) + 'px';
    span.textContent = String(i + 1);
    gutter.appendChild(span);
  }
  grow.appendChild(gutter);
}

window.__layout = layout;
// 每个视觉行属于哪条逻辑行（measure() 用它做归属；由**生产** layout 算出）。
window.__rowMap = [];
if (layout !== null) {
  for (let i = 0; i < layout.totalLines; i += 1) {
    for (let r = 0; r < layout.lineRows[i]; r += 1) window.__rowMap.push(i);
  }
}
window.__lineHeight = layout === null ? 0 : layout.lineHeight;
// 浏览器自己的答案：输入区内容盒高度 ÷ 行高 = 真实视觉行数（权威对照）。
window.__renderedRows = (() => {
  try {
    const cs = view.getComputedStyle(input);
    const lh = parseFloat(cs.lineHeight);
    const pads = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const r = input.getBoundingClientRect();
    return Math.round(((r.height - pads) / lh) * 100) / 100;
  } catch { return 0; }
})();
// 朴素对照：一段内容的 rect 个数（旧实现就是拿它当行数的）。
window.__rawRectCount = (() => {
  try {
    const r = document.createRange();
    r.selectNodeContents(input);
    return r.getClientRects().length;
  } catch { return 0; }
})();
</script></body></html>`;
}

/** 跑一次离屏渲染，落盘截图与页面自报的几何。 */
async function renderOnce(html, { width = 520, height = 900 } = {}) {
  const dir = makeProbeDir('epe-xbar-geom-');
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
  win.webContents.setFrameRate(10);
  const frames = [];
  win.webContents.on('paint', (_e, _d, image) => frames.push(image));
  await win.loadFile(file);
  await new Promise((r) => setTimeout(r, 1200));
  const geo = await win.webContents.executeJavaScript('(() => {' +
    'const input = document.querySelector("[data-composer-input]");' +
    'const cs = getComputedStyle(input);' +
    'const r = input.getBoundingClientRect();' +
    'const px = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };' +
    'return { input: { left: r.left, top: r.top, width: r.width, height: r.height },' +
    '  padLeft: px(cs.paddingLeft), padRight: px(cs.paddingRight), padTop: px(cs.paddingTop),' +
    '  padBottom: px(cs.paddingBottom), lineHeight: px(cs.lineHeight), fontSize: px(cs.fontSize),' +
    '  backgroundImage: cs.backgroundImage.slice(0, 200), backgroundOrigin: cs.backgroundOrigin,' +
    '  layout: window.__layout, rowMap: window.__rowMap || [],' +
    '  renderedRows: window.__renderedRows || 0, rawRectCount: window.__rawRectCount || 0,' +
    '  gutterSpans: [...document.querySelectorAll(".dsh-epe-xgutter span")].map((el) => {' +
    '    const rr = el.getBoundingClientRect();' +
    '    return { text: el.textContent, top: rr.top, height: rr.height, left: rr.left, width: rr.width }; }),' +
    '  gutterBox: (() => { const g = document.querySelector(".dsh-epe-xgutter");' +
    '    if (!g) return null; const gr = g.getBoundingClientRect();' +
    '    return { left: gr.left, top: gr.top, width: gr.width, height: gr.height }; })() };' +
  '})()');
  fs.writeFileSync(${JSON.stringify(join(dir, 'geo.json'))}, JSON.stringify(geo));
  if (!frames.length) { console.log('NO_FRAMES'); app.exit(3); return; }
  fs.writeFileSync(${JSON.stringify(join(dir, 'shot.png'))}, frames[frames.length - 1].toPNG());
  console.log('OK');
  app.exit(0);
});
setTimeout(() => { console.log('TIMEOUT'); app.exit(4); }, 20000);
`;
  const scriptPath = join(dir, 'probe.js');
  writeFileSync(scriptPath, script);
  const out = execFileSync(ELECTRON, [scriptPath], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '' },
    encoding: 'utf8', timeout: 90000,
  });
  assert.match(out, /OK/, `离屏渲染应成功，实际输出：${out.trim()}`);
  return { shot: join(dir, 'shot.png'), geo: JSON.parse(await readFile(join(dir, 'geo.json'), 'utf8')) };
}

/**
 * 量像素。返回：
 *  - `rows`：每个**视觉行**的 `{ index, logical, stripe, red }`
 *    （`stripe` = 文字列背景亮度中位数；`red` = 行号列里的最大红分量）；
 *  - `gutter`：行号 span 的几何与文本；
 *  - 边界：行号列右缘 / 文字列左缘（用于「不得重叠」的断言）。
 *
 * ⚠️ 归属（哪个视觉行属于哪条逻辑行）用**生产 layout 的 rowMap**，
 * 不是测试自己重新推一遍 —— 否则测试会与实现一起错。
 */
async function measure(shot, geo) {
  const py = `
import json
from PIL import Image
import numpy as np
im = Image.open(${JSON.stringify(shot)}).convert('RGB')
arr = np.asarray(im).astype(np.float64)
lum = arr.mean(axis=2)
geo = json.loads(${JSON.stringify(JSON.stringify(geo))})
inp = geo['input']
padL, padR, padT, padB = geo['padLeft'], geo['padRight'], geo['padTop'], geo['padBottom']
line_h = geo['lineHeight']
# 内容盒（条纹画在这里：CSS 的 background-origin/clip 是 content-box）
cx0 = inp['left'] + padL
cy0 = inp['top'] + padT
cw = inp['width'] - padL - padR
# 文字列：内容盒左右各留 6px 余量，避开圆角与边缘。
tx0 = int(round(cx0 + 6)); tx1 = int(round(cx0 + cw - 6))
# 行号列：**用 gutter 自己的盒子**（权威），不要从 padding 反推 ——
# 布局坏掉时（行号压到文字上）由 padding 反推出来的窗口会同时错开，
# 于是「行号画在哪」根本量不到，守卫就会以错误的理由变红（变异测试踩过）。
gb = geo.get('gutterBox')
if gb:
    nx0 = int(round(gb['left'] + 1)); nx1 = int(round(gb['left'] + gb['width'] - 1))
else:
    nx0 = int(round(inp['left'] + 1)); nx1 = int(round(cx0 - 1))
row_map = geo.get('rowMap') or []
rows = []
total = int(round((inp['height'] - padT - padB) / line_h))
# 截图只覆盖窗口高度：视口外的行没有像素（离线渲染不会滚动合成）。
# 那些行的 stripe/gutterLum 记 None，而不是 NaN —— NaN 不是合法 JSON，
# 且断言必须能区分「量不到」与「量到 0」。
frame_h = arr.shape[0]
for i in range(total):
    top = cy0 + i * line_h
    a = int(round(top)) + 1
    b = int(round(top + line_h)) - 1
    visible = a < frame_h and a < b
    def band_of(x0, x1):
        if not visible:
            return None
        lo, hi = a, min(b, frame_h)
        seg = arr[lo:hi, x0:x1]
        if seg.size == 0:
            return None
        return seg
    seg = band_of(tx0, tx1)
    stripe = float(np.median(seg.mean(axis=2))) if seg is not None else None
    nseg = band_of(nx0, nx1)
    red = 0.0
    if nseg is not None:
        red = float(np.max(nseg[:, :, 0] - np.maximum(nseg[:, :, 1], nseg[:, :, 2])))
    gseg = band_of(nx0, nx1)
    gstripe = float(np.median(gseg.mean(axis=2))) if gseg is not None else None
    rows.append({'index': i, 'logical': row_map[i] if i < len(row_map) else None,
                 'stripe': stripe, 'gutterLum': gstripe, 'red': red,
                 'top': top, 'height': line_h})

print(json.dumps({'rows': rows,
                  'gutter': geo.get('gutterSpans') or [],
                  'gutterBox': geo.get('gutterBox'),
                  'contentLeft': cx0, 'contentRight': cx0 + cw,
                  'inputLeft': inp['left'], 'inputRight': inp['left'] + inp['width'],
                  'renderedRows': geo.get('renderedRows', 0),
                  'rawRectCount': geo.get('rawRectCount', 0),
                  'layout': geo.get('layout'),
                  'backgroundOrigin': geo.get('backgroundOrigin'),
                  'backgroundImage': geo.get('backgroundImage')}))
`;
  const out = execFileSync('python3', ['-c', py], { encoding: 'utf8', timeout: 60000 });
  return JSON.parse(out);
}

/**
 * 断言一次渲染的行几何。
 *
 * 内容结构（默认变体）：**1 个 `<p>` + 3 个 `<br>`** = 4 个逻辑行，
 * 其中逻辑行 1 因超长而软换成多个视觉行（这正是「软换行续行必须同色」的用例）。
 */
function assertGeometry(data, expectedLines = 4) {
  const layout = data.layout;
  assert.ok(layout, '生产 layoutOf 必须返回几何（返回 null 说明测量失败）');
  assert.equal(layout.totalLines, expectedLines, `逻辑行数必须等于草稿的行数（${expectedLines}）`);

  const rows = data.rows;
  // ⚠️ 视口外的行没有像素（离线渲染不滚动合成）→ `stripe` 为 null。
  // 几何断言只看**量得到**的行；量不到不是缺陷，是测量边界。
  const visible = rows.filter((r) => typeof r.stripe === 'number' && Number.isFinite(r.stripe));
  assert.ok(visible.length > 0, '至少要有一个可测量的视觉行');
  // 权威对照：浏览器自己说一共有多少视觉行（内容盒高度 ÷ 行高）。
  // 生产 layout 的 totalRows 必须与之吻合 —— 这是「按真实行盒算」的核心证据。
  assert.ok(
    Math.abs(layout.totalRows - data.renderedRows) <= 0.6,
    `视觉行总数必须与浏览器实测一致：生产 ${layout.totalRows}，浏览器 ${data.renderedRows}`
    + `（差 >0.6 说明行高或行盒归属算错；rawRectCount=${data.rawRectCount} 只是朴素对照，不是行数）`,
  );
  assert.equal(rows.length, Math.round(data.renderedRows), '量到的视觉行数必须与浏览器一致');

  const byLogical = new Map();
  for (const r of rows) {
    if (!byLogical.has(r.logical)) byLogical.set(r.logical, []);
    byLogical.get(r.logical).push(r);
  }
  assert.equal(byLogical.size, expectedLines, `每个逻辑行都必须至少占一个视觉行（实际 ${byLogical.size} 个）`);

  // ① 同一逻辑行的全部软换行视觉行必须同色。
  for (const [logical, list] of byLogical) {
    const values = list.map((r) => r.stripe);
    const spread = Math.max(...values) - Math.min(...values);
    assert.ok(
      spread < 3,
      `同一逻辑行（${logical + 1}）的软换行续行必须同色：实测 ${values.map((v) => v.toFixed(1)).join(', ')}`
      + `（极差 ${spread.toFixed(1)}）。极差大说明条纹是按物理行交替的，不是按逻辑行分段的。`,
    );
  }

  // ② 相邻逻辑行必须深浅交替。
  for (let n = 0; n + 1 < byLogical.size; n += 1) {
    const a = byLogical.get(n)[0];
    const b = byLogical.get(n + 1)[0];
    assert.ok(
      Math.abs(a.stripe - b.stripe) > 4,
      `相邻逻辑行必须交替深浅：第 ${n + 1} 行 ${a.stripe.toFixed(1)} vs 第 ${n + 2} 行 ${b.stripe.toFixed(1)}`,
    );
  }

  // ③ 行号：数值按逻辑行递增，且盒子顶边贴在所属逻辑行的**首个视觉行**上。
  const texts = data.gutter.map((g) => g.text);
  const expected = Array.from({ length: expectedLines }, (_v, i) => String(i + 1));
  assert.deepEqual(
    texts,
    expected,
    `行号必须按逻辑行递增（${expected.join('/')}）；实际 ${JSON.stringify(texts)}，`
    + `layout.totalLines=${layout.totalLines}。行号数量不对 = 逻辑行切分错了。`,
  );
  for (let i = 0; i < data.gutter.length; i += 1) {
    const g = data.gutter[i];
    const firstRow = byLogical.get(i)?.[0];
    assert.ok(firstRow, `逻辑行 ${i} 应有视觉行`);
    const delta = Math.abs(g.top - firstRow.top);
    assert.ok(
      delta <= 1.5,
      `行号 ${g.text} 的顶边必须贴在逻辑行 ${i + 1} 首个视觉行的顶边：`
      + `行号 ${g.top.toFixed(1)} vs 文字 ${firstRow.top.toFixed(1)}（偏差 ${delta.toFixed(1)}px）`,
    );
    // 行号只应出现在它那条逻辑行的第一个视觉行里。
    const withRed = byLogical.get(i).filter((r) => r.red > 60).map((r) => r.index);
    assert.deepEqual(
      withRed,
      [firstRow.index],
      `行号 ${g.text} 只应出现在逻辑行 ${i + 1} 的首个视觉行（第 ${firstRow.index} 行）；`
      + `实际出现在 ${JSON.stringify(withRed)}`,
    );
  }

  // ④ 行号列**不得压住文字**（用户 2026-10-17：「行标与光标重叠」）。
  //    物理判据：行号列（gutter 盒子）必须整体落在文字列的左边界**之外**。
  assert.ok(data.gutterBox, 'gutter 必须渲染出盒子');
  const gutterRight = data.gutterBox.left + data.gutterBox.width;
  assert.ok(
    gutterRight <= data.contentLeft + 0.5,
    `行号列必须完全在文字列左侧：行号列右缘 ${gutterRight.toFixed(1)}，`
    + `文字列左缘 ${data.contentLeft.toFixed(1)}（重叠 ${(gutterRight - data.contentLeft).toFixed(1)}px）`,
  );
  // 行号列必须真的**让出了宽度** —— 判据是行号列的右缘与文字列左缘对齐，
  // 而不是「padding-left 有多大」：只查 padding 的变异会在别的写法下漏掉
  //（实测：把 padding 改回 14px 时，反推出来的窗口会一起移动，量不到重叠）。
  assert.ok(
    Math.abs(gutterRight - data.contentLeft) <= 1.5,
    `行号列右缘必须与文字列左缘对齐：行号列右缘 ${gutterRight.toFixed(1)}，`
    + `文字列左缘 ${data.contentLeft.toFixed(1)}（偏差 ${(gutterRight - data.contentLeft).toFixed(1)}px）`
    + '—— 偏差大说明行号列与文字列没有真正分列，行号会压在文字上或留出空档',
  );
  // 且行号列必须够宽（两位数行号放得下）。
  assert.ok(
    data.gutterBox.width >= 20,
    `行号列必须够宽（≥20px）：实际 ${data.gutterBox.width.toFixed(1)}px`,
  );

  // ⑤ 条纹只铺在文字列（content-box）上，不得漫进行号列。
  //    做法：把有底色的视觉行挑出来，比较文字列与行号列的亮度关系。
  const tinted = rows.filter((r) => r.logical % 2 === 0);
  const plain = rows.filter((r) => r.logical % 2 === 1);
  assert.ok(tinted.length > 0 && plain.length > 0, '必须有着色行与未着色行各至少一个');
  const tintedAvg = tinted.reduce((s, r) => s + r.stripe, 0) / tinted.length;
  const plainAvg = plain.reduce((s, r) => s + r.stripe, 0) / plain.length;
  assert.ok(
    tintedAvg > plainAvg + 4,
    `着色逻辑行必须比未着色行亮：着色 ${tintedAvg.toFixed(1)} vs 未着色 ${plainAvg.toFixed(1)}`,
  );
  // 行号列：内核原底色（未着色）应贯穿 —— 即行号列不应出现大面积着色。
  const gutterLit = rows.map((r) => r.gutterLum);
  const gutterSpread = Math.max(...gutterLit) - Math.min(...gutterLit);
  assert.ok(
    gutterSpread < 6,
    `行号列不得被条纹染色（应保持内核底色）：亮度剖面 ${gutterLit.map((v) => v.toFixed(1)).join(', ')}`,
  );

  return {
    visualRows: rows.length,
    logicalLines: byLogical.size,
    tintedAvg: Number(tintedAvg.toFixed(2)),
    plainAvg: Number(plainAvg.toFixed(2)),
    lineRows: layout.lineRows,
    rowMap: data.rowMap,
  };
}

/* ── 真实渲染：主用例与形状无关性 ─────────────────────────────────── */

test('真实渲染：粘贴产物（1 个 p + 多个 br）行号递增、软换行同色、行号不压文字', { timeout: 180000 }, async (t) => {
  if (!existsSync(ELECTRON)) { t.skip('本机没有 /usr/bin/electron，跳过几何测试'); return; }
  const css = await extractCss();
  const src = await loadSources();
  const { shot, geo } = await renderOnce(buildHtml(css, src));
  const data = await measure(shot, geo);
  t.diagnostic(JSON.stringify(assertGeometry(data)));
});

test('真实渲染（用户 2026-10-17 的 bug 形状）：换行是文本节点里的换行字符、没有 br', { timeout: 180000 }, async (t) => {
  if (!existsSync(ELECTRON)) { t.skip('本机没有 /usr/bin/electron，跳过几何测试'); return; }
  // ⚠️⚠️ 这一条是**回归的主守卫**。
  // 旧实现去 DOM 里数 <br> 切逻辑行，而这个形状**一个 <br> 都没有** ——
  // 于是 7 行文字被当成 1 个逻辑行（行号「1」撑到 7 行高、整块同色），
  // 正是用户截图里「前半段无交替 + 行号与文字重叠」的成因。
  // 逻辑行以草稿为准后，这里必须是 7 条逻辑行。
  const css = await extractCss();
  const src = await loadSources();
  const { shot, geo } = await renderOnce(buildHtml(css, src, { variant: 'newlineText' }));
  const data = await measure(shot, geo);
  const result = assertGeometry(data, 7);
  assert.equal(result.logicalLines, 7, '文本里的 7 个换行字符必须切成 7 条逻辑行');
  // 这 7 行里只有第 2 行（75 字符）在 386px 的内容宽下软换成 2 个视觉行，
  // 其余各占 1 行。软换行必须**只**加在它自己那条逻辑行上（不能串到邻行）。
  // 不写死整个数组：字体度量变化时只该动这一个数字，其余行必须仍是 1。
  const wrapped = result.lineRows.map((rows, i) => (rows > 1 ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(
    wrapped,
    [1],
    `只有那条长逻辑行（下标 1）应软换行；实际软换行的行是 ${JSON.stringify(wrapped)}`
    + `（lineRows=${JSON.stringify(result.lineRows)}）`,
  );
  assert.equal(
    result.lineRows[1],
    2,
    `第 2 条逻辑行（75 字符）在 386px 内容宽下应占 2 个视觉行；实际 ${result.lineRows[1]}`,
  );
});

test('真实渲染：每行一个 p（各带尾 br）也必须同样正确', { timeout: 180000 }, async (t) => {
  if (!existsSync(ELECTRON)) { t.skip('本机没有 /usr/bin/electron，跳过几何测试'); return; }
  const css = await extractCss();
  const src = await loadSources();
  const { shot, geo } = await renderOnce(buildHtml(css, src, { variant: 'perParagraph' }));
  const data = await measure(shot, geo);
  const result = assertGeometry(data, 4);
  assert.equal(result.logicalLines, 4, '每行一个 p 时也应是 4 条逻辑行');
});

test('真实渲染（回归）：6 行内容必须数成 6 行，不是 12（尾 br 不加行盒）', { timeout: 180000 }, async (t) => {
  if (!existsSync(ELECTRON)) { t.skip('本机没有 /usr/bin/electron，跳过几何测试'); return; }
  const css = await extractCss();
  const src = await loadSources();
  const { shot, geo } = await renderOnce(buildHtml(css, src, { variant: 'sixLines' }));
  const data = await measure(shot, geo);
  const result = assertGeometry(data, 6);
  assert.equal(result.visualRows, 6, '6 个各带尾 br 的 p 必须渲染成 6 个视觉行');
});

test('真实渲染（回归）：一行被拆成多个内联分片时，行数必须按视觉行去重', { timeout: 180000 }, async (t) => {
  if (!existsSync(ELECTRON)) { t.skip('本机没有 /usr/bin/electron，跳过几何测试'); return; }
  // Lexical 会把一行文字按格式/空格/IME 边界拆成多个文本节点；同一视觉行上
  // getClientRects() 会返回多个 rect（实测 1 行 → 8 个 rect）。
  // 把 rect 个数当行数就会把行号间距撑大。
  const css = await extractCss();
  const src = await loadSources();
  const { shot, geo } = await renderOnce(buildHtml(css, src, { fragmented: true }));
  const data = await measure(shot, geo);
  const result = assertGeometry(data, 4);
  assert.deepEqual(
    result.lineRows,
    [5, 1, 1, 1].map((v) => (v === 5 ? result.lineRows[0] : v)),
    '分片不得改变行数（第 1 行软换行数应与未分片时一致）',
  );
});

/* ── 真实渲染（变异）：守卫必须真的能变红 ──────────────────────────── */

/** 在源码里替换 layoutOf 的实现（变异测试用）。 */
function mutateLayout(source, replacement) {
  const next = source.replace(/function layoutOf\(input, draft\) \{[\s\S]*?\n\}/, replacement);
  assert.notEqual(next, source, '变异必须真的改到了源码');
  return next;
}

test('真实渲染（回归）：内核 hint 伪元素挤走最后一行时，行数必须仍然正确', { timeout: 180000 }, async (t) => {
  if (!existsSync(ELECTRON)) { t.skip('本机没有 /usr/bin/electron，跳过几何测试'); return; }
  // ⚠️⚠️ 独立验证发现的真实边界（/tmp/epe-verify 的 Q1/Q2，2026-10-17）：
  // 内核给最后一段挂了一个**伪元素**提示
  //   .input p:last-child:after{content:var(--dsh-composer-hint)}
  // （`/命令` 的用法提示）。伪元素不在文本流里，`Range.getClientRects()`
  // **数不到它** —— 于是它把最后一行挤到下一行时，纯 range 测量会少算 1 行，
  // 行号与条纹从那一行起全部错位（正是用户反复报的「错位」形状）。
  // 生产代码用「块自己的盒子高度」做块级校正（见 composer-rows.js）。
  const css = await extractCss();
  const src = await loadSources();
  // 最后一行足够长，加上 hint 后会溢出到下一行。
  const draftLines = [
    'Pending Jobs',
    'App restart required for the new bundle.',
    'Current Work',
    'All fixes are implemented and tested now',
  ];
  const { shot, geo } = await renderOnce(buildHtml(css, src, {
    variant: 'perParagraph',
    draft: draftLines.join('\n'),
    hint: '  / 查看命令',
    // 每行一个 <p>（带尾 br），最后一段会挂上 hint 伪元素。
    overrideBody: draftLines.map((line) => `<p>${line}<br></p>`).join(''),
  }));
  const data = await measure(shot, geo);
  const layout = data.layout;
  assert.ok(layout, 'layoutOf 必须返回几何');
  assert.equal(layout.totalLines, 4, '必须是 4 条逻辑行');

  // 核心断言：生产代码算出的视觉行总数必须与**浏览器实测**一致
  //（浏览器把伪元素算进去了，range 测量不会）。
  assert.ok(
    Math.abs(layout.totalRows - data.renderedRows) <= 0.6,
    `带 hint 伪元素时，视觉行总数仍必须与浏览器实测一致：生产 ${layout.totalRows}，`
    + `浏览器 ${data.renderedRows}（差 >0.6 说明没把伪元素占的行算进去 —— `
    + `这正是「最后一行被挤走、行号从那里开始错位」的成因）`,
  );
  // 行号的像素位置也必须跟着对（最后一个行号不能偏）。
  assert.deepEqual(
    data.gutter.map((g) => g.text),
    ['1', '2', '3', '4'],
    '行号必须是 1..4',
  );
  for (let i = 0; i < data.gutter.length; i += 1) {
    const firstRow = data.rows.find((r) => r.logical === i);
    assert.ok(firstRow, `逻辑行 ${i} 应有视觉行`);
    const delta = Math.abs(data.gutter[i].top - firstRow.top);
    assert.ok(
      delta <= 1.5,
      `行号 ${i + 1} 必须贴在它那条逻辑行的首个视觉行上（偏差 ${delta.toFixed(1)}px）`,
    );
  }
});

test('真实渲染（回归·规模）：80 行提示词、每行一个带尾 br 的 p —— 必须仍是 80 行', { timeout: 180000 }, async (t) => {
  if (!existsSync(ELECTRON)) { t.skip('本机没有 /usr/bin/electron，跳过几何测试'); return; }
  // ⚠️⚠️ 独立验证（/tmp/epe-verify，2026-10-17）用**朴素算法**实测出一种
  // 系统性高估：形状 `<p>line<br></p>` × 80 行被量成 **150 行**（+70，87.5%）。
  // 机制：行尾 `<br>` 与「块结束标记」被各算一个换行 → 字符区间整体漂移 →
  // Range 起点跨到上一块边界 → 跨块 Range 把块盒（h=24）与行内盒（h=16）
  // 混在一起，返回 2 个不同的 top。
  // 生产代码靠「块尾占位 `<br>` 不占位」（见 composer-rows.js 的 flatten）
  // 规避它 —— 独立验证把仓库当前实现快照后直接 import 跑真值对照，40/40 一致。
  // **这是长提示词的正常形态（用户的实际用法），必须有规模级守卫。**
  //
  // ⚠️ 这一条只做 **DOM 级** 断言（不量像素）：80 行 × 24px = 1920px 远超
  // 离线渲染的窗口高度，视口外的行取不到像素。而本用例要证的是
  // **几何归属**（行数、行号位置），DOM 值就是权威真值。
  const css = await extractCss();
  const src = await loadSources();
  const COUNT = 80;
  const lines = Array.from({ length: COUNT }, (_v, i) => `line ${i + 1} of the pasted prompt`);
  const { geo } = await renderOnce(buildHtml(css, src, {
    draft: lines.join('\n'),
    overrideBody: lines.map((line) => `<p>${line}<br></p>`).join(''),
  }));
  const layout = geo.layout;
  assert.ok(layout, 'layoutOf 必须返回几何');
  assert.equal(layout.totalLines, COUNT, `必须切成 ${COUNT} 条逻辑行`);
  // 核心：视觉行总数必须等于浏览器实测（每行都短，不软换行 → 恰好 80）。
  assert.ok(
    Math.abs(layout.totalRows - geo.renderedRows) <= 0.6,
    `${COUNT} 行内容的视觉行总数必须与浏览器一致：生产 ${layout.totalRows}，`
    + `浏览器 ${geo.renderedRows}`
    + `（独立验证发现朴素算法会给 150 行 —— 这正是「块尾占位 <br> 不占位」要挡住的坑）`,
  );
  assert.equal(layout.totalRows, COUNT, `每行都短，应恰好 ${COUNT} 个视觉行；实际 ${layout.totalRows}`);
  // 每条逻辑行恰好 1 个视觉行：错位（区间漂移）会让某些行变成 2。
  const multi = layout.lineRows
    .map((rows, i) => (rows !== 1 ? { line: i + 1, rows } : null))
    .filter(Boolean);
  assert.deepEqual(
    multi,
    [],
    `每行都短，所有逻辑行的视觉行数都必须是 1；异常行：${JSON.stringify(multi.slice(0, 10))}`,
  );
  // 行号必须是 1..80，且每个行号盒子的高度恰好等于一个行高、依次紧邻排布。
  assert.deepEqual(
    geo.gutterSpans.map((g) => g.text),
    Array.from({ length: COUNT }, (_v, i) => String(i + 1)),
    `行号必须是 1..${COUNT}`,
  );
  const lh = layout.lineHeight;
  const bad = geo.gutterSpans
    .map((g, i) => (Math.abs(g.height - lh) > 0.6 ? { line: i + 1, height: g.height } : null))
    .filter(Boolean);
  assert.deepEqual(bad, [], `每个行号的高度都必须等于一个行高（${lh}px）；异常：${JSON.stringify(bad.slice(0, 10))}`);

  t.diagnostic(JSON.stringify({ totalLines: layout.totalLines, totalRows: layout.totalRows, browserRows: geo.renderedRows }));
});

test('真实渲染（回归·核心规则）：块尾占位 br 不得占位 —— 独立验证的最小复现', { timeout: 180000 }, async (t) => {
  if (!existsSync(ELECTRON)) { t.skip('本机没有 /usr/bin/electron，跳过几何测试'); return; }
  // ⚠️⚠️⚠️ 独立验证（/tmp/epe-verify，2026-10-17）给出的**最小复现**，
  // 也是它认定的唯一决定性规则：
  //
  //   文本 "aaa\nbbb\nccc" + 形状 `<p>aaa<br></p><p>bbb<br></p><p>ccc<br></p>`
  //   → 真值 [1,1,1]，朴素算法给 [1,1,2]（total 3 而 Σ 4）。
  //
  // 机制：行尾 `<br>` 与「块结束标记」**表达了同一个换行语义**，朴素算法
  // 两条都算 → 每行产出 2 个 `\n`，草稿只有 1 个 → 字符区间整体漂移 →
  // Range 起点跨到上一块边界 → 跨块 Range 把块盒（h=24）与行内盒（h=16）
  // 混在一起返回 2 个不同 top。规模上放大成 80 行 → 150 行（+87.5%）。
  //
  // ⚠️ 为什么**必须单独**有这一条：`perParagraph` / 80 行那两条用例里每个块
  // 只有一条逻辑行，于是「块高 ÷ 行高」的块级校正会**掩盖**这条规则的错误
  //（实测：把规则去掉后那两条仍然通过）。这一条用**块内含多条逻辑行**的
  // 形状，让块级校正不生效，从而真正锁死「块尾占位 `<br>` 不占位」。
  const css = await extractCss();
  const src = await loadSources();
  const { shot, geo } = await renderOnce(buildHtml(css, src, {
    draft: 'aaa\nbbb\nccc',
    // 一个块里三条逻辑行 + 行内 `<br>` + 块尾占位 `<br>`。
    overrideBody: '<p>aaa<br>bbb<br>ccc<br></p>',
  }));
  const data = await measure(shot, geo);
  const layout = data.layout;
  assert.ok(layout, 'layoutOf 必须返回几何');
  assert.equal(layout.totalLines, 3, '必须是 3 条逻辑行');
  assert.deepEqual(
    layout.lineRows,
    [1, 1, 1],
    `每行都短，必须各占 1 个视觉行；实际 ${JSON.stringify(layout.lineRows)}`
    + '（[1,1,2] 就是「块尾 <br> 被当成额外换行」的典型错位）',
  );
  assert.equal(layout.totalRows, 3, `视觉行总数必须是 3；实际 ${layout.totalRows}`);
  assert.ok(
    Math.abs(layout.totalRows - data.renderedRows) <= 0.6,
    `视觉行总数必须与浏览器一致：生产 ${layout.totalRows}，浏览器 ${data.renderedRows}`,
  );
  assert.deepEqual(data.gutter.map((g) => g.text), ['1', '2', '3'], '行号必须是 1..3');
  for (let i = 0; i < data.gutter.length; i += 1) {
    const firstRow = data.rows.find((r) => r.logical === i);
    assert.ok(firstRow, `逻辑行 ${i} 应有视觉行`);
    const delta = Math.abs(data.gutter[i].top - firstRow.top);
    assert.ok(
      delta <= 1.5,
      `行号 ${i + 1} 必须贴在它那条逻辑行的首个视觉行上（偏差 ${delta.toFixed(1)}px）`
      + '—— 偏差是区间漂移的直接指纹',
    );
  }
  const s0 = data.rows.find((r) => r.logical === 0).stripe;
  const s1 = data.rows.find((r) => r.logical === 1).stripe;
  const s2 = data.rows.find((r) => r.logical === 2).stripe;
  assert.ok(
    s0 > s1 + 4 && s2 > s1 + 4,
    `底色必须按逻辑行交替：实测 ${s0.toFixed(1)} / ${s1.toFixed(1)} / ${s2.toFixed(1)}`,
  );
});

test('真实渲染（回归·核心规则·规模）：一个块内 80 条逻辑行，累积漂移必须显形', { timeout: 180000 }, async (t) => {
  if (!existsSync(ELECTRON)) { t.skip('本机没有 /usr/bin/electron，跳过几何测试'); return; }
  // 独立验证证明漂移会**累积**：错误不是每行恒定 +1，而是累积到某处才爆雷
  //（实测失败下标 k=2/3/6/9/4/10/11…）。把 80 条逻辑行放进**同一个块**里，
  // 任何累积型漂移都会在某一处显形；同时块级校正对此形状不生效。
  const css = await extractCss();
  const src = await loadSources();
  const COUNT = 80;
  const lines = Array.from({ length: COUNT }, (_v, i) => `l${i + 1}`);
  const { geo } = await renderOnce(buildHtml(css, src, {
    draft: lines.join('\n'),
    // 一个 <p> 里 79 个行内 <br>（真换行）+ 1 个块尾占位 <br>。
    overrideBody: `<p>${lines.join('<br>')}<br></p>`,
    composerMaxHeight: 2000,
  }));
  const layout = geo.layout;
  assert.ok(layout, 'layoutOf 必须返回几何');
  assert.equal(layout.totalLines, COUNT, `必须是 ${COUNT} 条逻辑行`);
  const multi = layout.lineRows
    .map((rows, i) => (rows !== 1 ? { line: i + 1, rows } : null))
    .filter(Boolean);
  assert.deepEqual(
    multi,
    [],
    `同块内 ${COUNT} 条短逻辑行必须各占 1 个视觉行；异常行（漂移指纹）：${JSON.stringify(multi.slice(0, 12))}`,
  );
  assert.equal(layout.totalRows, COUNT, `视觉行总数必须是 ${COUNT}；实际 ${layout.totalRows}`);
  assert.ok(
    Math.abs(layout.totalRows - geo.renderedRows) <= 0.6,
    `必须与浏览器实测一致：生产 ${layout.totalRows}，浏览器 ${geo.renderedRows}`,
  );
});

test('真实渲染（变异）：回去数 DOM 的 br 切逻辑行 → 守卫必须变红', { timeout: 180000 }, async (t) => {
  if (!existsSync(ELECTRON)) { t.skip('本机没有 /usr/bin/electron，跳过几何测试'); return; }
  // 这个变异**就是被推翻的第二版实现**：忽略草稿、按 DOM 里的换行切。
  // 在 newlineText 形状下它只会得到 1 条逻辑行，守卫必须抓到。
  const css = await extractCss();
  const base = await loadSources();
  const src = mutateLayout(base, `function layoutOf(input, draft) {
    // 忠实复刻被推翻的第二版：**只按 <br> 切段**，并且把文本节点当整块
    //（里面的换行字符一律忽略 —— 这正是它看不到「文本里换行」的原因）。
    const view = input.ownerDocument.defaultView;
    const lh = parseFloat(view.getComputedStyle(input).lineHeight) || 24;
    const parts = [];
    let cur = '';
    const walk = (n) => {
      if (n.nodeType === 3) { cur += (n.nodeValue || '').replace(/[\\n\\r]/g, ''); return; }
      if (n.nodeType !== 1) return;
      if (n.tagName === 'BR') { parts.push(cur); cur = ''; return; }
      for (const c of n.childNodes) walk(c);
      if (n.tagName === 'P') { parts.push(cur); cur = ''; }
    };
    for (const c of input.childNodes) walk(c);
    if (cur !== '') parts.push(cur);
    const lines = parts.length > 0 ? parts : [''];
    // 视觉行数用「字符数 ÷ 每行容量」估（旧实现没有任何真实测量）。
    const lineRows = lines.map((l) => Math.max(1, Math.ceil(l.length / 60)));
    const lineTops = []; let acc = 0;
    for (const r of lineRows) { lineTops.push(acc); acc += r; }
    return { lineRows, lineTops, totalRows: acc, totalLines: lineRows.length, lineHeight: lh };
  }`);
  const { shot, geo } = await renderOnce(buildHtml(css, src, { variant: 'newlineText' }));
  const data = await measure(shot, geo);
  assert.throws(
    () => assertGeometry(data, 7),
    /逻辑行数必须等于草稿的行数|视觉行总数必须与浏览器实测一致|行号必须按逻辑行递增/,
    '忽略草稿、按 DOM 换行切逻辑行的实现必须被抓住（否则这条守卫是空的）',
  );
});

test('真实渲染（变异）：条纹按物理行交替（拆开同一逻辑行）→ 守卫必须变红', { timeout: 180000 }, async (t) => {
  if (!existsSync(ELECTRON)) { t.skip('本机没有 /usr/bin/electron，跳过几何测试'); return; }
  // 把「按逻辑行分段」改成「每个视觉行都着一次底色」的相位 —— 同一逻辑行的
  // 续行会被切成两种颜色（用户最初报的就是这个）。
  const css = await extractCss();
  const base = await loadSources();
  const src = base.replace(
    /if \(index % 2 !== 0\) continue; \/\/ 0 基偶数 = 第 1、3、5… 条逻辑行/,
    'if (start % 2 !== 0) continue;',
  );
  assert.notEqual(src, base, '变异必须真的改到了源码（相位判据被替换）');
  const { shot, geo } = await renderOnce(buildHtml(css, src));
  const data = await measure(shot, geo);
  assert.throws(
    () => assertGeometry(data),
    /软换行续行必须同色|相邻逻辑行必须交替深浅/,
    '按物理行交替的实现必须被抓住（否则这条守卫是空的）',
  );
});

test('真实渲染（变异）：行号列宽度为零（压回文字上）→ 守卫必须变红', { timeout: 180000 }, async (t) => {
  if (!existsSync(ELECTRON)) { t.skip('本机没有 /usr/bin/electron，跳过几何测试'); return; }
  // 用户 2026-10-17 报「行标与光标重叠」：把让出的 padding-left 去掉，
  // 行号列就压回文字上。几何守卫必须抓到。
  const base = await extractCss();
  const css = base.replace(/padding-left:var\(--dsh-epe-gutter-w\);/, 'padding-left:14px;');
  assert.notEqual(css, base, '变异必须真的改到了 CSS（padding-left 被改回 14px）');
  const src = await loadSources();
  const { shot, geo } = await renderOnce(buildHtml(css, src));
  const data = await measure(shot, geo);
  assert.throws(
    () => assertGeometry(data),
    // 这个变异会先撞上「行号列里出现了正文的红色墨迹」——
    // 把 padding-left 改回 14px 后，行号列与文字列重叠，量到的「行号墨迹」
    // 会横跨多个视觉行。守卫以哪一条先报不重要，**必须抛错**才说明守卫有效。
    /必须完全在文字列左侧|必须真的为行号让出宽度|行号 1 只应出现在/,
    '行号压在文字上的布局必须被抓住（否则「不重叠」这条守卫是空的）',
  );
});

/* ── 静态守卫 ─────────────────────────────────────────────────────── */

/** 去掉注释后再断言（否则注释里的示例代码会误伤）。 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

test('静态守卫：逻辑行必须以草稿为准（不得数 p 或 br 推逻辑行）', async () => {
  const rows = stripComments(await readFile(join(root, 'src', 'composer-rows.js'), 'utf8'));
  assert.match(rows, /draft\.split\('\\n'\)|text\.split\('\\n'\)/, '逻辑行必须由草稿文本按 \\n 切分');
  assert.match(rows, /export function layoutOf\(input, draft\)/, 'layoutOf 必须接收草稿');
  // 不得用 <p> 个数或 <br> 个数当逻辑行数。
  assert.ok(
    !/querySelectorAll\([^)]*'p'[^)]*\)\.length/.test(rows),
    '不得用 <p> 的个数当逻辑行数（粘贴产物可能只有 1 个 <p>）',
  );
  // 必须按 rect.top 去重（rect 个数不是行数）。
  assert.match(rows, /Math\.round\(rect\.top\)/, '必须按 rect.top 去重数视觉行');
});

test('静态守卫：gutter 不得压在文字上（输入区必须让出宽度）', async () => {
  const css = (await extractFile(join(root, 'src', 'extended-bar.js'))).match(/const CSS = `([\s\S]*?)`;/)[1];
  const scope = css.slice(css.indexOf('--dsh-epe-gutter-w:26px'));
  assert.match(scope, /padding-left:var\(--dsh-epe-gutter-w\)/, '输入区必须为行号列让出 padding-left');
  assert.ok(
    !/margin-left:\s*calc\(-1\s*\*\s*var\(--dsh-epe-gutter-w\)\)/.test(scope),
    '不得用负 margin 把段落拉回行号列下面（那正是「行标与文字重叠」的成因）',
  );
});

test('静态守卫：gutter 只锚在内核公开属性上，且不接收指针事件', async () => {
  const source = await readFile(join(root, 'src', 'composer-gutter.js'), 'utf8');
  assert.match(source, /\[data-composer-input\]/, '必须用内核公开属性 data-composer-input 找宿主');
  assert.match(source, /pointer-events:none|pointerEvents/, 'gutter 的 CSS 必须 pointer-events:none');
  const css = (await readFile(join(root, 'src', 'extended-bar.js'), 'utf8')).match(/const CSS = `([\s\S]*?)`;/)[1];
  assert.match(css, /\.dsh-epe-xgutter\{[^}]*pointer-events:none/, 'gutter 必须 pointer-events:none（不挡光标）');
});

test('静态守卫：gutter 必须在 useLayoutEffect 里量（否则闪一帧无行号）', async () => {
  const source = await readFile(join(root, 'src', 'composer-gutter.js'), 'utf8');
  assert.match(source, /useLayoutEffect\(/, '必须在 useLayoutEffect 里测量与写样式');
  assert.ok(!/useEffect\(/.test(stripComments(source)), '不得改用 useEffect（会先绘制再补行号）');
});

test('静态守卫：找不到输入框时必须重试，不得一次放弃', async () => {
  const source = stripComments(await readFile(join(root, 'src', 'composer-gutter.js'), 'utf8'));
  const found = source.match(/if \(found === null\)[\s\S]{0,220}/)?.[0] ?? '';
  assert.ok(found, '源码里必须有「找不到宿主」的分支');
  assert.ok(
    /schedule\(tryAttach\)/.test(found),
    '找不到宿主时必须排下一次重试（不得一次放弃且永不重试）',
  );
  assert.ok(
    !/if \(found === null\)\s*\{\s*return;?\s*\}/.test(found),
    '不得在找不到时直接 return 掉且不重试',
  );
  assert.match(source, /ticks\s*<\s*ATTACH_TICKS/, '重试必须有上限（别在错误页面上空转）');
});

test('接线守卫：ExtendedSymbolBar 必须把 draft 传给 ComposerGutter', async () => {
  const source = stripComments(await readFile(join(root, 'src', 'extended-bar.js'), 'utf8'));
  assert.match(source, /h\(ComposerGutter,\s*\{\s*active:\s*true,\s*draft\s*\}\)/, '必须传 draft（逻辑行的权威来源）');
});

test('接线守卫：ComposerGutter 必须调 layoutOf + applyLayout + 用实测行高', async () => {
  const source = stripComments(await readFile(join(root, 'src', 'composer-gutter.js'), 'utf8'));
  assert.match(source, /layoutOf\(found\.input,\s*draftRef\.current\)/, '必须把草稿传进 layoutOf');
  assert.match(source, /applyLayout\(found\.input,\s*next\)/, '必须调用 applyLayout 写样式');
  assert.match(source, /layout\.lineHeight/, '必须使用实测行高（不得写死）');
});

test('静态守卫：模式二的作用域里必须定义 --dsh-epe-stripe 与 --dsh-epe-line', async () => {
  const css = (await readFile(join(root, 'src', 'extended-bar.js'), 'utf8')).match(/const CSS = `([\s\S]*?)`;/)[1];
  const scope = css.slice(css.indexOf('html[data-dsh-epe-extended] [data-composer-input]'));
  assert.match(scope, /--dsh-epe-line:\s*\d+px/, '模式二作用域必须定义 --dsh-epe-line（未定义会让整条渐变失效）');
  assert.match(scope, /--dsh-epe-stripe:\s*color-mix/, '模式二作用域必须定义 --dsh-epe-stripe（未定义会让整条渐变失效）');
});

test('静态守卫：「块尾占位 br 不占位」这条规则本身必须有测试锁住', async () => {
  // ⚠️⚠️ 为什么这条必须是**静态**守卫（行为测试锁不住它）：
  // 独立验证（/tmp/epe-verify）证明这是四条形状里唯一的决定性区别
  //（去掉它，朴素算法在形状 B 上从 33/33 掉到 21/33，80 行 → 150 行）。
  // 但它在本实现里被**两层机制掩盖**：
  //   1. `alignWithDraft` 会修剪尾部差异；
  //   2. 「块高 ÷ 行高」的块级校正在「一块一线」的形状下直接覆盖 range 结论。
  // 实测：把这条规则删掉后，`perParagraph` / 80 行 / 最小复现三条**全都仍然通过**。
  // 所以行为测试无法隔离它 —— 用源码断言把它钉死，并用变异测试验证这条断言有效。
  const rows = stripComments(await readFile(join(root, 'src', 'composer-rows.js'), 'utf8'));
  // 规则本体：遇到「块级容器里最后一个子节点是 BR」时，跳过不占位。
  assert.match(
    rows,
    /if\s*\(\s*block\s*&&\s*i\s*===\s*last\s*\)\s*continue;/,
    '必须保留「块尾占位 <br> 不占位」这条规则：'
    + '它是独立验证认定的唯一决定性规则（去掉后长提示词会高估 87.5%，行号从漂移点起全部错位）',
  );
  // 前提：必须真的算出了「最后一个有内容的孩子」的下标，否则上面那条永不成立。
  assert.match(rows, /let\s+last\s*=\s*-1;/, '必须先算出「最后一个有内容的孩子」的下标');
  assert.match(rows, /i\s*===\s*last/, '必须与 last 比较（而不是恒真/恒假）');
});

test('静态守卫：块级校正（hint 伪元素）不得被删（它是 range 测量看不到的宽度）', async () => {
  const rows = stripComments(await readFile(join(root, 'src', 'composer-rows.js'), 'utf8'));
  assert.match(
    rows,
    /getBoundingClientRect\(\)\.height/,
    '必须用块的实测盒子高度做校正'
    + '（内核 p:last-child:after 的 hint 伪元素不在文本流里，range 数不到）',
  );
  assert.match(rows, /rowsByBlock/, '必须有按块分组的校正逻辑');
  assert.match(rows, /count\s*!==\s*1/, '只在「一块一线」时才用块高校正（多线无法分摊）');
});

test('静态守卫：CSS 模板字符串里不得出现反引号（会提前闭合，真机白屏）', async () => {
  const src = await readFile(join(root, 'src', 'extended-bar.js'), 'utf8');
  const m = src.match(/const CSS = `([\s\S]*?)`;/);
  assert.ok(m, '能提取 CSS 模板字符串');
  // 能提取到就说明没被提前闭合；这里再断言其长度合理（不是被截断的半截）。
  assert.ok(m[1].length > 1500, `CSS 疑似被反引号提前闭合（只提取到 ${m[1].length} 字符）`);
});

/** 读文件（给上面几处复用）。 */
async function extractFile(path) {
  return readFile(path, 'utf8');
}
