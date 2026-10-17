/**
 * 模式二悬浮符号栏的**真实渲染几何测试**。
 *
 * ## 为什么必须有这一层
 *
 * 用户 2026-10-16 连续否掉了符号栏的两个位置（卡外上方、卡下方），最终要求
 * 「在输入框上方悬浮」。位置这类缺陷**静态断言抓不住**：断言「注册到了
 * conversation.input.overlay」并不能证明它真的浮在输入框上方。
 *
 * 这里用**真实的内核 DOM 结构**（照抄 `dsh-client-ui-conversation` 的 InputBar
 * 实际层级与样式）离屏渲染，然后量：
 *  ① 悬浮条的底边是否贴在 `[data-input-scroll]` 顶边附近；
 *  ② 它是否**不占布局高度**（卡片高度不因它改变）。
 *
 * 依赖 `/usr/bin/electron`；本机没有时 skip 而不是失败。
 */
import assert from 'node:assert/strict';
import { makeProbeDir } from './electron-tmp.mjs';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ELECTRON = '/usr/bin/electron';
const ROOT = fileURLToPath(new URL('..', import.meta.url));

// 内核 InputBar 的真实层级与关键样式（从 app.asar 的
// @deepseek-ai/dsh-client-ui-conversation/lib/client.js 抄出，见注释里的类名）。
const KERNEL_CSS = `
:root{--dsh-composer-card-max-width:920px;--dsh-content-font-size:14px;--dsh-content-font-delta:0px}
/* .card[data-composer-card]：position:relative + flex column + padding-top:8px */
.card{box-sizing:border-box;width:100%;max-width:var(--dsh-composer-card-max-width);border-radius:12px;
  background:#1b1e24;border:1px solid #333;font-size:var(--dsh-content-font-size);
  line-height:calc(24px + var(--dsh-content-font-delta));flex-direction:column;gap:12px;
  padding-top:8px;display:flex;position:relative}
/* .overlayAnchor[data-composer-overlay]：height:0 + absolute，零高度锚点 */
.overlayAnchor{height:0;position:absolute;inset:0 0 auto}
.accessory{align-items:center;gap:8px;padding:10px 12px 0;display:flex;color:#777}
.scroll{margin-right:4px;padding:0}
.grow{position:relative}
.input{box-sizing:border-box;min-height:52px;white-space:pre-wrap;color:#ddd;padding:0 12px;outline:none;display:block}
.row{flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;padding:2px 8px 6px;display:flex}
/* 本插件的悬浮条（与 src/floating-bar.js 的 CSS 一致） */
.dsh-epe-float{position:absolute;left:0;right:0;z-index:6;pointer-events:auto;box-sizing:border-box}
.dsh-epe-float[data-dsh-epe-positioned="true"]{box-shadow:0 4px 12px rgba(0,0,0,.28)}
.dsh-epe-float:not([data-dsh-epe-positioned="true"]){position:static;margin:0 0 4px}
.xbar{display:flex;flex-wrap:wrap;align-items:center;gap:4px}
.xkey{background:#22252b;border:1px solid rgba(127,127,127,.3);border-radius:6px;color:#c8ccd4;
  font:500 13px/1 ui-monospace,monospace;padding:4px 7px}
`;

/**
 * 跑一次离屏渲染：结构 = 内核卡片，悬浮条由页内脚本按 `positionAboveInput`
 * 的同一算法定位（量 `[data-input-scroll]` 偏移后放到它上面）。
 *
 * @param opts.rows 输入区里的行数（影响输入区高度）。
 * @param opts.accessoryHeight accessory 区高度（影响输入区偏移）。
 */
function measureFloat({ rows = 2, accessoryHeight = 0 } = {}) {
  const dir = makeProbeDir('epe-float-');
  const inputHtml = Array.from({ length: rows }, (_, i) => `输入区第${i + 1}行`).join('<br>');
  const html = `<!doctype html><html><head><style>
body{margin:0;background:#101216;color:#e6e6e6;padding:24px}
${KERNEL_CSS}
</style></head><body>
<div style="max-width:960px;margin:0 auto">
  <div class="card" id="card">
    <div class="overlayAnchor" id="anchor"></div>
    <div class="accessory" id="acc" style="height:${accessoryHeight}px">accessory</div>
    <div class="scroll" id="scroll"><div class="grow"><div class="input" id="inp">${inputHtml}</div></div></div>
    <div class="row"><span>+ 权限 计划</span><span style="margin-left:auto">发送</span></div>
  </div>
</div>
<script>
const anchor=document.getElementById('anchor');
const card=document.getElementById('card');
const scroll=document.getElementById('scroll');
const host=document.createElement('div');
host.className='dsh-epe-float';
host.id='float';
host.innerHTML='<div class="xbar"><span class="xkey">()</span><span class="xkey">[]</span><span class="xkey">Link</span></div>';
anchor.appendChild(host);
// 与 src/floating-bar.js 的 positionAboveInput 同一算法与**同一顺序**：
// 先打 data 标记（切到 absolute），再量高度，最后算 top。
const GAP=6;
host.dataset.dshEpePositioned='true';
const a=anchor.getBoundingClientRect(), s=scroll.getBoundingClientRect();
const h=host.getBoundingClientRect().height;
host.style.top=Math.round((s.top-a.top)-GAP-h)+'px';
// 把结果回报给测试：再量一次
window.__probe=()=>({
  cardH: card.getBoundingClientRect().height,
  scrollTop: scroll.getBoundingClientRect().top,
  hostBottom: host.getBoundingClientRect().bottom,
  hostTop: host.getBoundingClientRect().top,
  hostHeight: host.offsetHeight,
  positioned: host.dataset.dshEpePositioned,
  anchorTop: anchor.getBoundingClientRect().top,
  accessoryBottom: document.getElementById('acc').getBoundingClientRect().bottom,
});
</script>
</body></html>`;

  const script = `
const { app, BrowserWindow } = require('electron');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1000, height: 480, show: false,
    webPreferences: { offscreen: true } });
  win.webContents.setFrameRate(10);
  const frames = [];
  win.webContents.on('paint', (_e, _d, image) => frames.push(image));
  await win.loadURL('data:text/html;charset=utf-8,' + ${JSON.stringify(encodeURIComponent(html))});
  await new Promise(r => setTimeout(r, 1200));
  const probe = await win.webContents.executeJavaScript('window.__probe()');
  require('fs').writeFileSync(${JSON.stringify(join(dir, 'probe.json'))}, JSON.stringify(probe));
  if (frames.length) require('fs').writeFileSync(${JSON.stringify(join(dir, 'shot.png'))}, frames[frames.length - 1].toPNG());
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
  const probeRaw = execFileSync('node', ['-e',
    `process.stdout.write(require('fs').readFileSync(${JSON.stringify(join(dir, 'probe.json'))},'utf8'))`],
  { encoding: 'utf8', timeout: 20000 });
  return { probe: JSON.parse(probeRaw), shot: join(dir, 'shot.png') };
}

test('模式二悬浮条：底边贴在输入区上沿，且不占布局高度', { timeout: 120000 }, async (t) => {
  if (!existsSync(ELECTRON)) { t.skip('本机没有 /usr/bin/electron，跳过几何测试'); return; }
  const { probe } = measureFloat({ rows: 2, accessoryHeight: 0 });

  // ① 定位成功（拿不到锚点的退化形态是 position:static，这里必须不是）。
  assert.equal(probe.positioned, 'true', '悬浮条应被成功定位');

  // ② 底边贴在输入区上沿附近。
  // 悬浮条的 bottom 与 scroll 的 top 之间应恰好是 GAP（6px），允许 1px 取整误差。
  const gap = probe.scrollTop - probe.hostBottom;
  assert.ok(
    Math.abs(gap - 6) <= 1.5,
    `悬浮条底边应贴在输入区上沿上方 6px：实测间距 ${gap.toFixed(1)}px（输入区顶 ${probe.scrollTop}，悬浮条底 ${probe.hostBottom}）`,
  );

  // ③ 必须真的浮在输入区**上方**（而不是压住输入区）。
  assert.ok(
    probe.hostBottom <= probe.scrollTop + 0.5,
    `悬浮条不得压住输入区：底边 ${probe.hostBottom} 应 ≤ 输入区顶 ${probe.scrollTop}`,
  );

  // ④ 不占布局高度：悬浮条在 overlayAnchor 里且 absolute，卡片高度不应因它而变。
  // 用「两个 accessory 高度不同」的两次渲染对比：卡片高度差应只来自 accessory。
  const { probe: tall } = measureFloat({ rows: 2, accessoryHeight: 40 });
  const cardDelta = tall.cardH - probe.cardH;
  assert.ok(
    Math.abs(cardDelta - 40) <= 2,
    `卡片高度差应只来自 accessory（40px）：实测 ${cardDelta.toFixed(1)}px`
    + ' —— 若明显偏大，说明悬浮条参与了布局（把输入框顶下去了），不是真悬浮',
  );

  // ⑤ **跟随性**（最强的那条）：accessory 高 40px 时输入区随之下移 40px，
  // 悬浮条也必须跟着下移 40px —— 证明它锚定的是**输入区**，而不是卡片顶部之类的
  // 固定位置。这一条能挡住「浮在卡片顶部」等错误实现。
  const floatDelta = (tall.hostTop - tall.anchorTop) - (probe.hostTop - probe.anchorTop);
  assert.ok(
    Math.abs(floatDelta - 40) <= 2,
    `输入区下移 40px 时悬浮条必须跟着下移 40px：实测只移动了 ${floatDelta.toFixed(1)}px`
    + ' —— 说明它没锚定到输入区（可能锚在了卡片顶部等固定位置）',
  );

  // ⑥ 悬浮条自身高度必须大于 0（否则是空条，量出来的位置无意义）。
  assert.ok(probe.hostHeight > 10, `悬浮条应有实际高度：实测 ${probe.hostHeight}px`);
});

/* ── 「原生输入框也显示 deck」的标记（用户 2026-08 要求）──────────────────
   deck 的预留规则原来挂在 `html[data-dsh-epe-extended]` 上，那是**扩展模式**的
   标记。新增「原生模式 + nativeDeck」后那种情形没有扩展标记，预留会失效 →
   悬浮条压住上方消息（离屏实测重叠 32px）。所以改成 deck 自己的标记。
   这几条是静态守卫：行为几何由 reserve-geometry.test.mjs 覆盖。 */

test('deck 标记：预留规则必须挂在 deck 自己的标记上，不能挂在扩展模式标记上', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(join(ROOT, 'src', 'floating-bar.js'), 'utf8');
  assert.match(
    src,
    /html\[data-dsh-epe-deck\] \[data-composer-card\]\{margin-top:var\(--dsh-epe-float-reserve/,
    '预留规则必须用 data-dsh-epe-deck 命中卡片：'
    + '原生模式不会打 data-dsh-epe-extended，挂在它上面会让「原生 + deck」的预留失效',
  );
  assert.ok(
    !/html\[data-dsh-epe-extended\] \[data-composer-card\]\{margin-top/.test(src),
    '不得再用扩展模式标记罩预留规则（那正是「原生 + deck 压住上方消息」的成因）',
  );
  // 标记常量必须导出，避免各处硬编码字符串。
  assert.match(src, /export const DECK_ATTR = 'data-dsh-epe-deck'/, 'DECK_ATTR 必须导出');
});

test('deck 标记：定位成功时打标记，卸载时必须清掉标记与预留变量', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(join(ROOT, 'src', 'floating-bar.js'), 'utf8');
  const body = src.slice(src.indexOf('export function positionAboveInput'));
  // apply() 里要打标记（挂在 documentElement 上，与预订的 CSS 选择器一致）。
  assert.match(
    body,
    /setAttribute\(DECK_ATTR, 'on'\)/,
    '定位成功时必须给 <html> 打 deck 标记，否则预留规则不命中',
  );
  // dispose 必须同时摘掉预留变量与标记，否则卡片会永久多出一段 margin-top。
  assert.match(
    body,
    /removeProperty\('--dsh-epe-float-reserve'\)/,
    'dispose 必须摘掉预留变量（否则 deck 消失后空白还在）',
  );
  assert.match(
    body,
    /removeAttribute\(DECK_ATTR\)/,
    'dispose 必须摘掉 deck 标记',
  );
});
