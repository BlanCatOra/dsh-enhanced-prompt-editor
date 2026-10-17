/**
 * 真实渲染几何测试：逻辑行 → 物理行（软换行）时的**行号位置**与**同色背景**。
 *
 * 为什么要单独一层：静态断言只能证明「写了 height / 写了 background-image」，
 * 证不了「行号 2 真的落在第 4 个物理行上」「一条逻辑行的 3 个物理行真的是同色」
 * —— 这正是用户 2026-10-16 报的两个问题，也正是 E-014 那类「107 个测试全绿、
 * 肉眼看到错位」缺陷的形状。
 *
 * 本测试**跑生产代码**，不重写近似实现：
 *   - CSS 从 `src/panel.js` 现取（真实 .dsh-epe-editor / .dsh-epe-gutter /
 *     .dsh-epe-measure 规则）；
 *   - 测量与几何全部调用 `src/soft-wrap.js` 的真实导出
 *     （attachMeasurer / stripeSpansOf / stripeBackgroundOf / gutterHeightsOf）；
 *   - 只有「组件把这两样接到 DOM 上」那两行由本页复刻，那两行另由源码断言钉住
 *     （见文件末尾的 wiring 测试）——否则改坏组件反而测不出来。
 *
 * 断言的 4 件事：
 *   ① 行号「2」的字形纵向落在**第 4 个物理行**的带内（不是第 2 个）；
 *   ② 物理行 1/2/3（同一逻辑行）背景亮度**相同**，第 4 行不同，第 5 行回到同色；
 *   ③ 文本像素的分布印证「第 1 个逻辑行真的占 3 个物理行」——第 4 个物理行里
 *      没有任何字形（第 2 个逻辑行是空行）。这一条把「测量算错」也堵住；
 *   ④ 镜像测量与真实 textarea 的换行**总数一致**（长文档交叉核对）。
 *
 * 依赖 `/usr/bin/electron`（DSH 桌面版自带）。没有则 skip。
 */
import assert from 'node:assert/strict';
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

const PANE_W = 420;
const PANE_H = 400;

/** 从 panel.js 现取真实 CSS（与生产完全同一份文本）。 */
async function extractCss() {
  const src = await readFile(join(root, 'src', 'panel.js'), 'utf8');
  const m = src.match(/const CSS = `([\s\S]*?)`;/);
  assert.ok(m, '能从 src/panel.js 提取 CSS 模板字符串');
  return m[1];
}

/**
 * 取 soft-wrap.js 的源码，去掉 `export ` 前缀后作为内联 module 注入页面。
 *
 * 这样页面里跑的就是**生产那份实现**（同一个文件、逐字未改），而不是测试里
 * 另写一份近似实现 —— 后者正是「测试全绿、真机全废」的经典成因。
 */
async function inlineSoftWrap() {
  const src = await readFile(join(root, 'src', 'soft-wrap.js'), 'utf8');
  return src.replace(/^export /gm, '');
}

/**
 * 从 panel.js 里**原样抽出组件把几何接到 DOM 上的那两段表达式**。
 *
 * 为什么要抽，而不是在测试里另写：
 * 离屏页面里没有 React（本机没装），所以没法真的渲染组件。如果测试自己写
 * `span.style.height = heights[i]`，那么「把组件里的接线删掉」这种变异**不会**
 * 让像素测试变红 —— 像素测的只是测试自己那份复刻实现，是个假守卫
 * （本项目 E-014 就是「测试全绿、真机错位」的教训）。
 * 这里改为把**生产源码里的表达式逐字取出来求值**，于是：
 *   - 组件不再设置行号高度 → 抽出的表达式里没有 height → 页面里行号回到等距 → 像素测试红；
 *   - 组件不再设置背景 → 抽出的表达式里没有 backgroundImage → 回到 CSS 降级条纹 → 像素测试红。
 */
async function extractWiring() {
  const src = await readFile(join(root, 'src', 'panel.js'), 'utf8');
  // ① 行号 span 的 props 对象字面量（在生产源码里紧跟着 h('span', …) 的那一段）。
  const span = src.match(/h\(\s*'span',\s*(\{[\s\S]*?\}),\s*String\(index \+ 1\)\s*\)/);
  assert.ok(span, '能从 panel.js 抽出「行号 span 的 props 表达式」（接线被改写时这里会失败）');
  // ② 编辑区 textarea 的 style 对象字面量。
  const editor = src.match(/className:\s*'dsh-epe-editor'[\s\S]*?style:\s*(\{[^{}]*\})/);
  assert.ok(editor, '能从 panel.js 抽出「编辑区 style 表达式」（接线被改写时这里会失败）');
  return { spanProps: span[1], editorStyle: editor[1] };
}

/** 生成离屏渲染用的页面：真实 CSS + 真实 soft-wrap 实现 + 生产源码里的接线表达式。 */
function buildPage(css, softWrapSrc, wiring) {
  return `<!doctype html><html><head><style>
:root{--dsw-alias-label-primary:#e6e6e6;--dsw-alias-label-tertiary:#c8ccd4;--dsw-alias-brand-primary:#5686fe;--dsw-alias-bg-base:#16181d}
html,body{margin:0;background:#16181d;color:#e6e6e6}
${css}
.pane{width:${PANE_W}px;height:${PANE_H}px;position:relative;background:#16181d}
</style></head><body>
<div class="pane"><div class="dsh-epe-panel">
  <!-- 与 PanelBody 同形：gutter / editor / 测量宿主 三个子节点 -->
  <div class="dsh-epe-body" style="--dsh-epe-font:16px;--dsh-epe-line:27px;--dsh-epe-key-scale:1;height:${PANE_H}px">
    <div class="dsh-epe-gutter" aria-hidden="true"><span>1</span><span>2</span><span>3</span></div>
    <textarea class="dsh-epe-editor" spellcheck="false"></textarea>
    <div class="dsh-epe-measureHost" aria-hidden="true"></div>
  </div>
</div></div>
<script type="module">
${softWrapSrc}
window.EPE = { MEASURE_CLASS, MEASURE_HOST_CLASS, normalizeRowCounts, contentWidthOf, rowsOf,
  attachMeasurer, stripeSpansOf, stripeBackgroundOf, gutterHeightsOf };
// ── 生产源码里的接线表达式（逐字抽出），在页面里用真实函数求值 ──
window.WIRING = {
  spanProps: (index, gutterHeights) => (${wiring.spanProps}),
  editorStyle: (stripeBackground) => (${wiring.editorStyle}),
};
</script>
</body></html>`;
}

/** 页面里跑的探针：用真实实现测量 → 按组件同形落到 DOM → 回报精确几何。 */
const PROBE = `(() => {
  const EPE = window.EPE;
  const ta = document.querySelector('.dsh-epe-editor');
  const gutter = document.querySelector('.dsh-epe-gutter');
  const spans = [...gutter.querySelectorAll('span')];
  const host = document.querySelector('.dsh-epe-measureHost');
  const measurer = EPE.attachMeasurer(host);
  const cs = getComputedStyle(ta);
  const line = parseFloat(cs.lineHeight);
  const pad = parseFloat(cs.paddingTop);

  // 搜索 N，让第 1 个逻辑行**恰好**占 3 个物理行（不依赖任何硬编码字宽）。
  // 搜索与最终渲染用**同一套 overflow 条件**：长文本会让 textarea 出纵向滚动条，
  // 而滚动条会吃掉十几像素宽度、改变换行宽度 —— 条件不同就会搜到一个 N，
  // 实际渲染时又是另一个换行数（这类假绿非常难查，所以这里显式统一）。
  ta.style.overflowY = 'scroll';
  let n = 10;
  while (n < 6000) {
    const counts = measurer.rowCounts(ta, ['M'.repeat(n)]);
    if (counts !== null && counts[0] === 3) break;
    n += 1;
  }
  const searchW = EPE.contentWidthOf(ta);

  // 最终文档：逻辑行 1 = 刚好 3 个物理行的长串；逻辑行 2 = **空行**；
  // 逻辑行 3 = 短文本。空行是关键：第 4 个物理行里应当一个字形都没有，
  // 这样就能用像素证明「逻辑行 1 真的只占 3 个物理行」。
  const line1 = 'M'.repeat(n);
  const text = line1 + '\\n' + '\\n' + 'third';
  ta.value = text;
  const finalW = EPE.contentWidthOf(ta);
  const lines = text.split('\\n');
  const counts = measurer.rowCounts(ta, lines);

  // 与组件的接线同形 —— **表达式从 panel.js 现抽**（见 extractWiring），
  // 所以「组件没接线」会让这段几何退回旧行为，像素测试随之变红。
  // ⚠️ React 会给数值型的非 unitless 属性自动补 px（height 就是这种）；
  // 这里是裸 DOM，必须自己补，否则 style.height = 81 会被直接丢弃（假红）。
  const cssValue = (v) => (typeof v === 'number' ? v + 'px' : v);
  // ① 行号 span 的高度 = 该逻辑行的物理行数 × 行高
  const heights = EPE.gutterHeightsOf(counts, line);
  spans.forEach((span, i) => {
    const props = window.WIRING.spanProps(i, heights);
    const height = props && props.style ? props.style.height : undefined;
    span.style.height = height === undefined || height === null ? '' : cssValue(height);
  });
  // ② 编辑区背景 = 按逻辑行分段的渐变
  const stripeBg = EPE.stripeBackgroundOf(EPE.stripeSpansOf(counts));
  const editorStyle = window.WIRING.editorStyle(stripeBg);
  const bg = editorStyle ? editorStyle.backgroundImage : undefined;
  ta.style.backgroundImage = bg === undefined || bg === null ? '' : cssValue(bg);

  // ── 交叉核对：镜像 vs 真实 textarea 的换行行数 ───────────────────
  // 用**逐行递增长度**的语料（30/60/…/900 个 M 加中英混排），逐条比对。
  // 这比「整篇文档总行数」敏感得多：镜像宽度只要差 24px（例如忘了减 padding），
  // 单行就会少算一行 —— 总行数抽查常常恰好相等，逐行扫则必然暴露
  //（实测：宽度 403px 的坏镜像在第 4/8/12… 条上全线少 1 行；干净版 379px 全等）。
  const prevH = ta.style.height;
  ta.style.overflowY = 'hidden';
  ta.style.height = '1px';
  const corpus = [];
  for (let i = 1; i <= 30; i += 1) corpus.push('M'.repeat(30 * i));
  corpus.push('a line with several words inside it here to wrap');
  corpus.push('这是一段中文内容用来触发自动换行以及更多内容');
  corpus.push('        leading spaces then a long tail '.repeat(3));
  const mismatches = [];
  for (const one of corpus) {
    ta.value = one;
    void ta.offsetHeight;
    const real = Math.max(1, Math.round((ta.scrollHeight - 2 * pad) / line));
    const mirror = measurer.rowCounts(ta, [one])[0];
    if (real !== mirror) mismatches.push(one.slice(0, 16) + ': 实测 ' + real + ' vs 镜像 ' + mirror);
  }
  // 整篇文档总行数也核一次（聚合口径，防止逐行偏差恰好互相抵消）
  const filler = [];
  for (let i = 0; i < 40; i += 1) {
    const list = ['M'.repeat(90), 'a line with several words inside it', '这是一段中文内容用来触发自动换行', '', '   leading spaces ' + 'W'.repeat(30)];
    filler.push(list[i % list.length] + " " + i);
  }
  const doc = filler.join('\\n');
  ta.value = doc;
  void ta.offsetHeight;
  const realRows = Math.round((ta.scrollHeight - 2 * pad) / line);
  // ⚠️ 镜像必须与真实测量**同时同条件**取宽（这里都是 overflow:hidden、无滚动条）。
  // 先恢复滚动条再量镜像会让两者宽度不同，得到 72 vs 64 这种假性不一致。
  const mirrorTotal = measurer.rowCounts(ta, doc.split('\\n')).reduce((a, b) => a + b, 0);
  ta.style.height = prevH;
  // 回到与最终渲染一致的滚动条条件（搜索期就是 scroll）
  ta.style.overflowY = 'scroll';
  // 交叉核对之后再放回最终文本，保证截图拍到的就是断言的那个文档
  ta.value = text;

  // 最终排布读数（供 python 换算像素带位置）
  const taRect = ta.getBoundingClientRect();
  const gutterRect = gutter.getBoundingClientRect();
  return JSON.stringify({
    n, text, counts, heights, line, pad,
    searchW, finalW,
    realRows, mirrorTotal, mismatches,
    contentW: finalW,
    stripe: ta.style.backgroundImage.slice(0, 200),
    scrollbarW: ta.offsetWidth - ta.clientWidth,
    ta: { left: taRect.left, top: taRect.top, right: taRect.right, bottom: taRect.bottom, height: taRect.height },
    gutter: { left: gutterRect.left, top: gutterRect.top, right: gutterRect.right, bottom: gutterRect.bottom },
  });
})()`;

/** 跑一次离屏渲染：返回截图路径 + 页面回报的几何。 */
async function renderPage({ width = PANE_W, height = PANE_H } = {}) {
  const css = await extractCss();
  const softWrapSrc = await inlineSoftWrap();
  const wiring = await extractWiring();
  const html = buildPage(css, softWrapSrc, wiring);
  const dir = mkdtempSync(join(tmpdir(), 'epe-lines-'));

  const script = `
const { app, BrowserWindow } = require('electron');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
const html = ${JSON.stringify(html)};
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: ${width}, height: ${height}, show: false,
    webPreferences: { offscreen: true } });
  win.webContents.setFrameRate(10);
  const frames = [];
  win.webContents.on('paint', (_e, _d, image) => frames.push(image));
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise(r => setTimeout(r, 1200));
  const geo = await win.webContents.executeJavaScript(${JSON.stringify(PROBE)});
  require('fs').writeFileSync(${JSON.stringify(join(dir, 'geo.json'))}, geo);
  // ⚠️ 必须**在探针跑完之后**再等一帧并主动重绘。探针是加载后 1.2s 才执行的，
  // 而 offscreen 的 paint 事件只在有帧被绘制时触发 —— 直接取 frames 的最后一帧
  // 会拿到**探针之前**的画面（实测：行号还是三行等距的旧样子，测试读到的
  // bands 全是一行亮一行暗）。这是"量到了上一帧"这类假绿，肉眼看不出。
  await new Promise(r => setTimeout(r, 900));
  win.webContents.invalidate();
  await new Promise(r => setTimeout(r, 900));
  if (!frames.length) { console.log('NO_FRAMES'); app.exit(3); return; }
  require('fs').writeFileSync(${JSON.stringify(join(dir, 'shot.png'))}, frames[frames.length - 1].toPNG());
  console.log('OK frames=' + frames.length);
  app.exit(0);
});
setTimeout(() => { console.log('TIMEOUT'); app.exit(4); }, 60000);
`;
  const scriptPath = join(dir, 'probe.js');
  writeFileSync(scriptPath, script);
  const out = execFileSync(ELECTRON, [scriptPath], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '' },
    encoding: 'utf8', timeout: 120000,
  });
  assert.match(out, /OK/, `离屏渲染应成功，实际输出：${out.trim()}`);
  return { shot: join(dir, 'shot.png'), geo: JSON.parse(await readFile(join(dir, 'geo.json'), 'utf8')) };
}

/** 用 Python(PIL/numpy) 量像素：物理行带亮度、字形分布、行号字形纵向位置。 */
function analyze(shot, geo) {
  const py = `
import json
from PIL import Image
import numpy as np
im = Image.open(${JSON.stringify(shot)}).convert('RGB')
lum = np.asarray(im).astype(np.float64).mean(axis=2)
geo = json.loads(${JSON.stringify(JSON.stringify(geo))})
line, pad = geo['line'], geo['pad']
taL, taT, taR = geo['ta']['left'], geo['ta']['top'], geo['ta']['right']
gR = geo['gutter']['right']
def row_top(k):          # 第 k 个物理行（1 基）的顶边 y
    return taT + pad + (k - 1) * line
# ── 背景亮度：取该行带**中段 60% 高度**、编辑区**左侧 padding 条**上的横向中位数。
# ⚠️ 不能取内容区：逻辑行 1 是 77 个 M，字形覆盖了大部分横向像素，中位数会被
# 字形拉亮（实测 rows 1/2 = 58.7/59.7，而真实底色只有 36）——量到的是文字不是背景。
# 条纹画在 padding-box 上（background-clip:padding-box），所以左 padding 那条
# 12px 宽的区域一定有底色、且永远不会被文字覆盖，是干净的取样窗口。
bands = {}
for k in range(1, 7):
    y0 = int(round(row_top(k) + line * 0.2))
    y1 = int(round(row_top(k) + line * 0.8))
    x0 = int(round(taL + 3)); x1 = int(round(taL + pad - 3))
    bands[k] = float(np.median(lum[y0:y1, x0:x1]))
# ── 行内**均匀性**：把每个物理行按高度切成 12 条横向细带，逐条取中位数。
# ⚠️ 为什么必须加这一条：只采「每行中心附近」的中位数抓不住**渐变污染**。
# 实测过的 bug：亮段结束处没有同位置的 transparent 色标，CSS 于是在
# 「亮段终点」与下一个色标之间线性插值 —— 亮色多铺了整整一个物理行，
# 且那行是一条从亮到暗的斜坡。斜坡的**中点**仍接近暗色，所以
# 「第 4 行与第 1 行不同色」照样成立、测试全绿，而肉眼看到的是
# 「背景错位 + 一条渐变带」。逐条采样子带就能看见斜坡（行内极差很大）。
slices = {}
for k in range(1, 7):
    vals = []
    for j in range(12):
        sy0 = int(round(row_top(k) + line * j / 12.0)) + 1
        sy1 = int(round(row_top(k) + line * (j + 1) / 12.0)) - 1
        if sy1 <= sy0: sy1 = sy0 + 1
        vals.append(float(np.median(lum[sy0:sy1, x0:x1])))
    slices[k] = vals
# ── 编辑区里的字形分布：每行带有多少「明显亮于背景」的像素。
# ⚠️ 取样区间必须**排除右侧滚动条**：滚动条滑块是亮灰色，会被算成字形
#（实测第 4 个空行因此量到 50 个"字形"像素，误报成"测量少算了一行"）。
bg = float(np.median(list(bands.values())))
contentR = taR - geo['scrollbarW']
glyph = {}
for k in range(1, 7):
    y0 = int(round(row_top(k) + 1)); y1 = int(round(row_top(k) + line - 1))
    x0 = int(round(taL + pad + 1)); x1 = int(round(contentR - pad - 1))
    glyph[k] = int((lum[y0:y1, x0:x1] > bg + 30).sum())
# ── 行号字形：gutter 内容区右端的数字列，逐行取最大值找连续亮段。
# gutter 的 width 由内容决定（3 位数会变宽），所以用几何定界：
# 右 padding 6px，再往里留 4px 余量，取 12px 宽的一条。
x0 = int(round(gR - 18)); x1 = int(round(gR - 6))
gcol = lum[:, x0:x1].max(axis=1)
gbg = float(np.median(gcol))
runs = []
start = None
for i, v in enumerate(gcol):
    hit = v > gbg + 30
    if hit and start is None: start = i
    if not hit and start is not None: runs.append((start, i - start)); start = None
if start is not None: runs.append((start, len(gcol) - start))
# 丢掉被截断的 1px 噪点
runs = [r for r in runs if r[1] >= 3]
print(json.dumps({
  'bands': bands, 'glyph': glyph, 'bg': bg, 'slices': slices,
  'runs': [{'start': s, 'len': l, 'center': s + l / 2.0} for s, l in runs],
  'rows': [{'k': k, 'top': row_top(k), 'bottom': row_top(k) + line} for k in range(1, 7)],
  'gutterX': [x0, x1], 'taX': [taL, taR],
}))
`;
  const out = execFileSync('python3', ['-c', py], { encoding: 'utf8', timeout: 60000 });
  return JSON.parse(out);
}

test('真实渲染：行号按物理行定位 + 同一逻辑行的物理行同色', { timeout: 180000 }, async (t) => {
  if (!existsSync(ELECTRON)) { t.skip('本机没有 /usr/bin/electron，跳过几何测试'); return; }
  const { shot, geo } = await renderPage();
  const m = analyze(shot, geo);
  const dbg = JSON.stringify({ counts: geo.counts, heights: geo.heights, bands: m.bands, glyph: m.glyph, runs: m.runs });

  // 前置：测量必须给出「第 1 行占 3 个物理行」（搜索循环本就是为了找这样的文本）
  assert.deepEqual(geo.counts, [3, 1, 1], `第 1 个逻辑行应占 3 个物理行，实测 ${JSON.stringify(geo.counts)}`);
  // 搜索期与最终期的换行宽度必须一致，否则 N 白搜（滚动条导致的宽度变化）
  assert.ok(
    Math.abs(geo.searchW - geo.finalW) < 0.5,
    `搜索期与最终期的内容宽度必须一致：${geo.searchW} vs ${geo.finalW}（差值是滚动条吃掉的宽度）`,
  );
  const contrast = Math.abs(m.bands['1'] - m.bands['4']);
  assert.ok(contrast > 3, `条纹对比度应可见（实测 ${contrast.toFixed(1)}）：${dbg}`);
  const same = (a, b) => Math.abs(m.bands[String(a)] - m.bands[String(b)]) <= Math.max(1.5, contrast * 0.25);

  // ② 同一逻辑行（物理行 1/2/3）同色；第 4 行（逻辑行 2）不同；第 5 行（逻辑行 3）回到同色。
  assert.ok(same(1, 2) && same(1, 3), `逻辑行 1 的 3 个物理行必须同色：${dbg}`);
  assert.ok(
    !same(1, 4) && !same(2, 4) && !same(3, 4),
    `第 4 个物理行（逻辑行 2）必须换一种底色：${dbg}`,
  );
  assert.ok(same(1, 5), `第 5 个物理行（逻辑行 3）应与逻辑行 1 同相：${dbg}`);

  // ②b 行内**必须均匀**（不能是渐变斜坡）。
  // 这条是补上来的：只比「每行中心点的中位数」时，亮段结束处缺少硬边色标
  // 造成的**线性插值**会溜过去 —— 那行中点仍接近暗色，`!same(1,4)` 照样成立。
  // 逐条细带采样后，斜坡的行内极差会非常大（实测 bug 版第 4 行跨度 ~200 亮度）。
  for (const k of [1, 2, 3, 4]) {
    const vals = m.slices[String(k)] ?? m.slices[k];
    assert.ok(Array.isArray(vals) && vals.length >= 8, `应有第 ${k} 行的细分带采样`);
    const spread = Math.max(...vals) - Math.min(...vals);
    assert.ok(
      spread <= Math.max(4, contrast * 0.2),
      `第 ${k} 个物理行内部必须是**均匀底色**，不能是渐变斜坡：`
      + `行内亮度极差 ${spread.toFixed(1)}（阈值 ${Math.max(4, contrast * 0.2).toFixed(1)}），采样 ${JSON.stringify(vals.map((v) => Math.round(v)))}。`
      + ' 极差大 = 亮段结束处缺同位置的 transparent 色标，CSS 在插值，'
      + '表现为「背景错位 + 一条渐变带」（用户 2026-10-16 报的「颜色错误」）。',
    );
  }

  // ③ 字形分布印证「逻辑行 1 只占 3 个物理行」：第 1/2/3 行有字，第 4 行（空行）没有。
  // 这一条把「测量算错」也堵住 —— 条纹同色只能证明「按测量结果画对了」，
  // 证明不了「测量结果本身对」。第 3 行可能只剩最后一个字符，所以阈值取小值。
  assert.ok(m.glyph['1'] > 100 && m.glyph['2'] > 100,
    `第 1-2 个物理行应密布字形：${dbg}`);
  assert.ok(m.glyph['3'] > 5, `第 3 个物理行应有字形（逻辑行 1 的结尾）：${dbg}`);
  assert.equal(m.glyph['4'], 0,
    `第 4 个物理行是空行，不应有任何字形（有字说明测量少算了行数）：${dbg}`);
  assert.ok(m.glyph['5'] > 10, `第 5 个物理行是逻辑行 3 的短文本，应有字形：${dbg}`);

  // ① 行号：三个行号的字形必须分别落在物理行 1 / 4 / 5 的带内。
  assert.equal(m.runs.length, 3, `gutter 里应量到 3 段行号字形：${dbg}`);
  const inRow = (center, k) => center >= m.rows[k - 1].top - 2 && center <= m.rows[k - 1].bottom + 2;
  const where = m.runs.map((r, i) => `#${i + 1}@${r.center.toFixed(1)}px`);
  assert.ok(inRow(m.runs[0].center, 1), `行号 1 应在第 1 个物理行：${where} ${dbg}`);
  assert.ok(
    inRow(m.runs[1].center, 4),
    `行号 2 必须落在第 4 个物理行（第 1 个逻辑行占 3 行后，第 2 个逻辑行从这里开始）：` +
    `${where}；第 4 行带 = [${m.rows[3].top.toFixed(1)}, ${m.rows[3].bottom.toFixed(1)}]。${dbg}`,
  );
  assert.ok(inRow(m.runs[2].center, 5), `行号 3 应在第 5 个物理行：${where} ${dbg}`);
  // 反向：行号 2 绝不能还在第 2 个物理行上（那正是修复前的行为）。
  assert.ok(!inRow(m.runs[1].center, 2), `行号 2 不得停在旧位置（第 2 个物理行）：${where}`);

  // ④ 测量保真：镜像与真实 textarea 的换行行数必须**逐行**一致
  //（排除 div 镜像、宽度算错、以及按 clientWidth 量这类偏差）。
  assert.deepEqual(
    geo.mismatches, [],
    `镜像测量的换行行数必须与真实 textarea 一致：${JSON.stringify(geo.mismatches)}`,
  );
  assert.equal(
    geo.mirrorTotal, geo.realRows,
    `镜像测量的换行总数必须与真实 textarea 一致：镜像 ${geo.mirrorTotal} vs 实测 ${geo.realRows}`,
  );
});

/* ── 接线断言（组件把测量结果接到 DOM 的那两行）─────────────────────
 * 离屏几何测试跑的是 soft-wrap 的真实实现 + 真实 CSS，但「组件把它们挂到
 * gutter span / textarea 上」那两行是页面复刻的。若只做像素测试，把组件里的
 * 接线改坏（例如退回等距行号）反而不会变红 —— 那是假守卫。
 * 这里对源码做定向断言，补上那一环。
 */
test('面板接线：行号高度按物理行、编辑区背景按逻辑行', async () => {
  const source = await readFile(join(root, 'src', 'panel.js'), 'utf8');

  // 行号 span 必须带 height（值来自 gutterHeightsOf），否则回到「每行号一行高」的错位。
  assert.match(
    source,
    /h\(\s*'span',\s*\{[\s\S]{0,200}?height:\s*gutterHeights\?\.\[index\]/,
    '行号 span 必须把高度设成「该逻辑行的物理行数 × 行高」（gutterHeights[index]）',
  );
  // 编辑区必须写 inline 的 background-image（按逻辑行分段），不能只靠 CSS 里那条
  // 按物理行交替的降级渐变。
  assert.match(
    source,
    /className:\s*'dsh-epe-editor'[\s\S]{0,900}?style:\s*\{\s*backgroundImage:\s*stripeBackground\s*\}/,
    '编辑区必须把按逻辑行生成的渐变写进 inline background-image（否则软换行时被切成两种底色）',
  );
  // 必须在真实 DOM 上测量，而不是按字符数估算。
  assert.match(source, /attachMeasurer\(host\)/, '必须用隐藏镜像实测物理行数（attachMeasurer）');
  assert.match(source, /measurer\.rowCounts\(editor,\s*lines\)/, '必须逐逻辑行测物理行数（rowCounts）');
  // 降级路径：拿不到测量结果时不能崩，也不能把「1 行」当成 0 行。
  assert.match(source, /rowCounts\s*\?\?\s*lines\.map\(\(\)\s*=>\s*1\)/, '测量缺失时必须退回每行 1 个物理行');
});
