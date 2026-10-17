/**
 * 模式二符号快捷栏的**居中**几何测试。
 *
 * ## 为什么单独一条
 *
 * 用户 2026-10-16 反馈「快捷栏没有居中对齐」。这类缺陷是**纯布局**问题：
 * 静态断言（CSS 里有没有 `justify-content:center`）只能证明写了这条规则，
 * 证明不了「按钮组真的在容器里居中」—— 例如把 `flex:1 1 auto`（撑满靠左）
 * 与 `justify-content:center` 同时写上，静态断言照样通过，视觉上却仍然靠左。
 *
 * 所以这里**真实渲染**内核的 `.dock` 布局，量按钮组的左右边距是否对称。
 *
 * 依赖 `/usr/bin/electron`；没有则 skip（本机有）。
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

const KEYS = ['()', '[]', '{}', '""', "''", '`', '()', '「」', '『』', '【】', '《》',
  'B', 'I', 'S', '```', 'H', '•', '❝', 'Link', 'Img', '―――', '→', '←'];

async function extractCss() {
  const src = await readFile(join(root, 'src', 'extended-bar.js'), 'utf8');
  const m = src.match(/const CSS = `([\s\S]*?)`;/);
  assert.ok(m, '能从 src/extended-bar.js 提取 CSS 模板字符串');
  return m[1];
}

/**
 * 复刻内核 `.dock` 的真实布局：
 * `.card`（定宽）→ `.dock{display:flex;justify-content:center}` → 符号栏。
 *
 * ⚠️ `.dock` 必须与 `.card` **同宽且居中**，否则「容器居中」会把测试也带偏：
 * 我们要验的是「按钮组在**输入框宽度**内居中」，不是「在窗口里居中」。
 */
function buildHtml(css, cardWidth) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
:root{
  --dsw-alias-label-primary:#ffffff;
  --dsw-alias-label-secondary:#c8ccd4;
  --dsw-alias-brand-primary:#5686fe;
  --dsw-specific-input-major:#22262c;
  --dsw-alias-border-l1:rgba(127,127,127,.28);
}
body{margin:0;background:#0e1013;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
${css}
.card{box-sizing:border-box;width:${cardWidth}px;margin:10px 0;padding:10px 0;border-radius:12px;
  background:var(--dsw-specific-input-major);color:var(--dsw-alias-label-primary)}
/* 内核 .dock：justify-content:center + 与 card 同宽 → 我们的符号栏在输入框宽度内居中 */
.dock{display:flex;justify-content:center;align-items:center;gap:12px;
  width:${cardWidth}px;max-width:100%;padding-top:4px;box-sizing:border-box}
.xkey{background:#22252b;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;
  color:var(--dsw-alias-label-secondary);font:500 13px/1 ui-monospace,monospace;padding:4px 7px;cursor:pointer}
</style></head><body>
<div class="card"><div style="height:40px"></div></div>
<div class="dock" id="dock">
  <div class="dsh-epe-xbar" id="xbar">
    ${KEYS.map((k) => `<button class="xkey">${k.replace(/[<>&]/g, '')}</button>`).join('')}
  </div>
</div>
</body></html>`;
}

function renderOnce(html, { width = 1000, height = 240 } = {}) {
  const dir = makeProbeDir('epe-center-');
  const script = `
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
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
  await new Promise((r) => setTimeout(r, 1200));
  const geo = await win.webContents.executeJavaScript(\`(() => {
    const xb = document.getElementById('xbar');
    const dock = document.getElementById('dock');
    const keys = [...xb.querySelectorAll('.xkey')];
    const r = (n) => { const b = n.getBoundingClientRect(); return { l: b.left, r: b.right, w: b.width }; };
    const xcs = getComputedStyle(xb);
    return {
      xbar: r(xb), dock: r(dock),
      first: r(keys[0]), last: r(keys[keys.length - 1]),
      keyCount: keys.length,
      justifyContent: xcs.justifyContent,
      width: xcs.width, flexGrow: xcs.flexGrow, flexBasis: xcs.flexBasis,
    };
  })()\`);
  fs.writeFileSync(${JSON.stringify(join(dir, 'geo.json'))}, JSON.stringify(geo));
  if (frames.length) fs.writeFileSync(${JSON.stringify(join(dir, 'shot.png'))}, frames[frames.length - 1].toPNG());
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
  const geo = JSON.parse(execFileSync('node', ['-e',
    `process.stdout.write(require('fs').readFileSync(${JSON.stringify(join(dir, 'geo.json'))},'utf8'))`],
  { encoding: 'utf8', timeout: 20000 }));
  return geo;
}

test('模式二快捷栏：按钮组在输入框宽度内水平居中', { timeout: 120000 }, async (t) => {
  if (!existsSync(ELECTRON)) { t.skip('本机没有 /usr/bin/electron，跳过居中测试'); return; }
  const css = await extractCss();
  const geo = renderOnce(buildHtml(css, 920));

  assert.ok(geo.keyCount >= 20, `应渲染出全部符号按钮，实测 ${geo.keyCount}`);

  // ① 容器必须真的居中（而不是「撑满 + 靠左」）。
  assert.equal(
    geo.justifyContent, 'center',
    `符号栏容器必须 justify-content:center，实测 ${geo.justifyContent}`,
  );
  // ② 容器不能是 flex:1（撑满会把居中变成无效：内容居中=内容靠左）。
  assert.equal(
    Number.parseFloat(geo.flexGrow) || 0, 0,
    `符号栏容器不得 flex-grow（实测 ${geo.flexGrow}）：撑满容器后居中就失去意义了`,
  );

  // ③ 核心断言：首按钮左边距 ≈ 末按钮右边距。
  const leftGap = geo.first.l - geo.xbar.l;
  const rightGap = geo.xbar.r - geo.last.r;
  assert.ok(
    Math.abs(leftGap - rightGap) <= 2,
    `按钮组必须左右对称居中：左边距 ${leftGap.toFixed(1)}px、右边距 ${rightGap.toFixed(1)}px`
    + `（差值 ${Math.abs(leftGap - rightGap).toFixed(1)}px > 2px）。`
    + ' 偏差大说明容器没居中，或按钮组被 flex 拉伸/靠左对齐。',
  );

  // ④ 按钮组不得溢出容器。
  assert.ok(
    geo.first.l >= geo.xbar.l - 0.5 && geo.last.r <= geo.xbar.r + 0.5,
    `按钮组不得溢出容器：容器 [${geo.xbar.l.toFixed(1)}, ${geo.xbar.r.toFixed(1)}]、`
    + `按钮 [${geo.first.l.toFixed(1)}, ${geo.last.r.toFixed(1)}]`,
  );

  // ⑤ 组宽明显小于容器宽（否则「居中」无意义，例如只有一个按钮或撑满）。
  const groupWidth = geo.last.r - geo.first.l;
  assert.ok(
    groupWidth < geo.xbar.w * 0.995,
    `按钮组宽度 ${groupWidth.toFixed(1)} 应小于容器宽 ${geo.xbar.w.toFixed(1)}（否则不是居中而是铺满）`,
  );
});
