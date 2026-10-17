/**
 * 真实渲染几何测试：用离屏 Chromium 渲染真实 CSS，逐像素量条纹带高度。
 *
 * 为什么必须有这一层：`test/bundle.test.mjs` 里的静态断言只能证明
 * 「写了 background-clip:content-box」，证明不了「条纹真的等高了」。
 * 2026-10-16 的事故正是静态断言全绿、肉眼却看到第一条带被撑长。
 * 这里做的是**端到端几何断言**：首条亮带高度必须≈后续亮带高度。
 *
 * 依赖 `/usr/bin/electron`（DSH 桌面版自带）。若环境没有 electron，
 * 测试会 skip 而不是失败——但本机有，所以实际上总会跑。
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

async function extractCss() {
  const src = await readFile(join(root, 'src', 'panel.js'), 'utf8');
  const m = src.match(/const CSS = `([\s\S]*?)`;/);
  assert.ok(m, '能从 src/panel.js 提取 CSS 模板字符串');
  return m[1];
}

/**
 * 跑一次离屏渲染，返回该列上所有亮带的 {start,len}。
 * 用**真实 CSS**，不是重写的近似样式。
 */
async function measureStripes(css, { width = 420, height = 420, fontPx = 16, lineHeightPx = 27 } = {}) {
  const dir = makeProbeDir('epe-geom-');
  // ⚠️ textarea **故意留空**。条纹是 background-image，与文字无关；
  // 放文字只会让"哪条带是条纹、哪条是字形"难以区分（第一版就在这里量歪了）。
  // 空 textarea 依然按 line-height 排版，渐变周期照旧。
  const html = `<!doctype html><html><head><style>
:root{--dsw-alias-label-primary:#e6e6e6;--dsw-alias-brand-primary:#5686fe}
body{margin:0;background:#16181d;color:#e6e6e6}
${css}
.pane{width:${width}px;height:${height}px;position:relative}
</style></head><body>
<!-- 必须复刻生产 DOM 结构：--dsh-epe-font / --dsh-epe-line 设在
     .dsh-epe-body 上（gutter 与 textarea 的共同父节点），不是设在 textarea 上。
     设在 textarea 上时 gutter 继承不到，且行高会退回 CSS 兜底值。 -->
<div class="dsh-epe-body" style="--dsh-epe-font:${fontPx}px;--dsh-epe-line:${lineHeightPx}px;height:${height}px">
  <div class="dsh-epe-gutter" aria-hidden="true"></div>
  <textarea class="dsh-epe-editor" spellcheck="false"></textarea>
</div>
</body></html>`;

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
  // 让页面自己回报精确几何：条纹画在 padding-box 内，所以取样区间和
  // 「铺满」检查的左右边缘都要用元素自身的边界，不能靠 W-30 这类猜测。
  const geo = await win.webContents.executeJavaScript(\`(() => {
    const t = document.querySelector('.dsh-epe-editor');
    const cs = getComputedStyle(t);
    const r = t.getBoundingClientRect();
    const padL = parseFloat(cs.paddingLeft), padR = parseFloat(cs.paddingRight);
    const padT = parseFloat(cs.paddingTop);
    return { padL, padR, padT,
      left: r.left, width: r.width, height: r.height,
      contentW: t.clientWidth - padL - padR,
      lineHeight: parseFloat(cs.lineHeight),
      scrollbarW: t.offsetWidth - t.clientWidth };
  })()\`);
  require('fs').writeFileSync(${JSON.stringify(join(dir, 'geo.json'))}, JSON.stringify(geo));
  if (!frames.length) { console.log('NO_FRAMES'); app.exit(3); return; }
  const png = frames[frames.length - 1].toPNG();
  require('fs').writeFileSync(${JSON.stringify(join(dir, 'shot.png'))}, png);
  console.log('OK');
  app.exit(0);
});
setTimeout(() => { console.log('TIMEOUT'); app.exit(4); }, 20000);
`;
  const scriptPath = join(dir, 'probe.js');
  writeFileSync(scriptPath, script);
  const out = execFileSync(ELECTRON, [scriptPath], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '' },
    encoding: 'utf8', timeout: 60000,
  });
  assert.match(out, /OK/, `离屏渲染应成功，实际输出：${out.trim()}`);
  return { shot: join(dir, 'shot.png'), geo: JSON.parse(await readFile(join(dir, 'geo.json'), 'utf8')) };
}

test('真实渲染：条纹首带与后续带等高（origin/clip 必须配对）', { timeout: 120000 }, async (t) => {
  if (!existsSync(ELECTRON)) { t.skip('本机没有 /usr/bin/electron，跳过几何测试'); return; }
  const css = await extractCss();
  const { shot, geo } = await measureStripes(css);

  // 用 Python(PIL/numpy) 读回像素并量亮带；避免为测试引入 JS 图像库。
  // 关键：**不取样单列**——单列会撞上文字笔画，量出的"带"其实是字形。
  // 改在元素内横跨取一整段，逐行取中位数：文字只是少数行上的少量像素，
  // 中位数对其免疫，留下的就是纯粹的条纹亮度剖面。
  const x0 = Math.ceil(geo.left + geo.padL + 2);
  const x1 = Math.floor(geo.left + geo.padL + geo.contentW - 2);
  const elLeft = Math.round(geo.left);
  const elRight = Math.round(geo.left + geo.width);
  const py = `
import json
from PIL import Image
import numpy as np
im = Image.open(${JSON.stringify(shot)}).convert('RGB')
lum = np.asarray(im).astype(np.float64).mean(axis=2)
x0, x1 = ${JSON.stringify(x0)}, ${JSON.stringify(x1)}
el_left, el_right = ${JSON.stringify(elLeft)}, ${JSON.stringify(elRight)}
band = lum[:, x0:x1]
col = np.median(band, axis=1)
lo, hi = np.percentile(col, 5), np.percentile(col, 95)
thr = (lo + hi) / 2
b = col > thr
spans = []
start = None
for i, v in enumerate(b):
    if v and start is None: start = i
    if not v and start is not None: spans.append((start, i - start)); start = None
if start is not None: spans.append((start, len(b) - start))
# 丢掉被画布边缘截断的首尾带（不足主体带高的 60% 视为截断）
if spans:
    body = max([ln for _, ln in spans[1:-1]] or [ln for _, ln in spans])
    while spans and spans[0][1] < body * 0.6: spans = spans[1:]
    while spans and spans[-1][1] < body * 0.6: spans = spans[:-1]
bands = [ln for _, ln in spans]
# 铺满检查：取一条主体亮带，在其**垂直中央那一行**量元素左右边界内 3px 的亮度。
# 必须用真实起点 spans，不能把长度累积当成 y —— 带之间有间隙，累积会算错行。
mid = None
if bands:
    body = max(bands)
    for st, ln in spans:
        if ln >= body * 0.6:
            mid = st + ln // 2
            break
left_edge = right_edge = None
if mid is not None:
    row = lum[mid]
    left_edge = float(np.median(row[el_left + 2:el_left + 5]))
    right_edge = float(np.median(row[el_right - 5:el_right - 2]))
# 亚像素周期：用线性插值找所有跨越阈值的精确位置，再取「隔一条」的距离。
# 这比整数带宽敏感得多 —— 小数行高造成的 54/55px 摆动在这里无所遁形。
edges = []
for i in range(len(col) - 1):
    a, bb = col[i], col[i + 1]
    if (a - thr) * (bb - thr) < 0:
        edges.append(i + (thr - a) / (bb - a))
periods = [round(edges[i + 2] - edges[i], 3) for i in range(max(0, len(edges) - 2))]
# 只保留合理区间内的周期，避开被画布截断的部分
if periods:
    med = float(np.median(periods))
    periods = [p for p in periods if abs(p - med) < med * 0.25]
print(json.dumps({'dark': lo, 'bright': hi, 'bands': bands,
  'periods': periods,
  'mid': mid, 'leftEdge': left_edge, 'rightEdge': right_edge,
  'x0': x0, 'x1': x1, 'elLeft': el_left, 'elRight': el_right}))
`;
  const out = execFileSync('python3', ['-c', py], { encoding: 'utf8', timeout: 60000 });
  const { bands, bright, dark, leftEdge, rightEdge, periods } = JSON.parse(out);
  assert.ok(bands.length >= 4, `应量到至少 4 条条纹带，实际 ${bands.length}（${out.trim()}）`);
  assert.ok(bright - dark > 4, `条纹对比度应可见，实际 ${bright - dark}`);

  const [first, ...rest] = bands;
  const maxRest = Math.max(...rest);
  const minRest = Math.min(...rest);
  // 首带不得明显长于后续带。修复前实测 39px vs 27px（1.44x）；
  // 修复后 27 vs 27~28。阈值取 1.15 倍，既有余量又能抓住回归。
  assert.ok(
    first <= maxRest * 1.15,
    `首条条纹带必须与后续带等高：首带 ${first}px，后续带 ${bands.slice(1).join('/')}px。` +
    `首带偏长 = padding-top 区被 clamp 成亮色，说明 background-clip 没跟 origin 配对。`,
  );
  assert.ok(
    minRest >= maxRest * 0.8,
    `后续条纹带也应彼此等高：${bands.slice(1).join('/')}px（可能渐变周期与 line-height 不一致）`,
  );

  // ⚠️ 周期必须**恒定**。用户 2026-10-16 反复报「某条条纹带比别的窄」，
  // 真因是 line-height 用了 1.7em = 27.2px（小数）：渐变周期 54.4px 落不到
  // 整数像素上，光栅化把相邻带抹成 27/28px 交错、周期在 54/55 之间摆动。
  // 整数行高下周期应恒为 lineHeight*2。这里用亚像素边缘量周期并断言离散度。
  assert.deepEqual(
    [...new Set(periods)].length <= 2 && (Math.max(...periods) - Math.min(...periods)) <= 0.2,
    true,
    `条纹周期必须恒定：实测 ${periods.join(', ')}px。周期摆动说明 line-height 不是整数像素`
    + `（应为 ${geo.lineHeight}px；小数行高会让带宽在相邻整数之间跳变）。`,
  );
  assert.ok(
    Math.abs(periods[0] - geo.lineHeight * 2) < 0.5,
    `条纹周期应等于 line-height * 2：实测 ${periods[0]}px，期望 ${geo.lineHeight * 2}px。`,
  );

  // 铺满：条纹必须一直画到 padding-box 边缘。
  // origin/clip 都设 content-box 也能让首带等高，但条纹会四周内缩 padding（12px），
  // 「行背景」不再铺满整行 —— 用户要的是整行交替底色。这里兜住那种改法。
  const fmt = (v) => (v === null ? 'n/a' : v.toFixed(1));
  const midpoint = (bright + dark) / 2;
  assert.ok(
    leftEdge !== null && leftEdge > midpoint && rightEdge !== null && rightEdge > midpoint,
    `条纹必须铺满整行（不能内缩到 content-box）：左边缘 ${fmt(leftEdge)}、右边缘 ${fmt(rightEdge)}，` +
    `应都高于明暗阈值 ${midpoint.toFixed(1)}。内缩说明用了 clip:content-box。`,
  );
});
