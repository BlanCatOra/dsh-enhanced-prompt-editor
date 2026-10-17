/**
 * 模式二悬浮条「预留加在哪」的**真实渲染几何测试**。
 *
 * ## 为什么单独一个文件
 *
 * 用户 2026-10-16 报：「**你把预留高度加在输入框内了 应该是输入框外顶部**」。
 *
 * 这类缺陷**纯静态断言的测法抓不住** —— 实测证据：把实现里的
 * `margin-top` 改回 `padding-top`（也就是用户报的那个错），
 * `float-position.test.mjs` 里所有断言**照旧全绿**。原因是那些测试只覆盖
 * 纯计算（预留多少像素），而「这个像素加在哪个盒子、哪个方向」是**布局**问题。
 *
 * 两者的差别只有在真实排版里才看得见：
 *   - `padding-top`（盒子内）：滚动容器的**顶边不动**，只是内容往下推；
 *     悬浮条位置不变 → **上方元素照旧被盖住**（实测重叠 28px，一点没减）。
 *     并且因为顶边不动，量到的「上方空隙」永远不变，预留会**每帧叠加**：
 *     实测 41 → 82 → 123 → 164px，输入框无限长高。
 *   - `margin-top`（盒子外顶部）：编辑区整体下推 → 卡片长高 →
 *     卡片底边锚定使卡片顶上升 → 上方元素让开；**第一帧后就稳定**。
 *
 * 本测试跑**生产代码**，不重写近似实现：
 *   - CSS 从 `src/floating-bar.js` 现取（真实的那条 margin-top 规则）；
 *   - 预留算法调用 `src/float-position.js` 的真实导出
 *     （reserveHeightFor / naturalGapOf / appliedReserveOf / floatTopFor）；
 *   - 「编辑区上方空隙」用 `src/floating-bar.js` 的 gapAboveEditorOf 真实源码
 *     （该文件 import react，无法整模块加载，故按 logical-lines.test.mjs 的
 *     同一手法抽取函数源码内联）。
 *
 * 断言的 4 件事：
 *   ① **预留加在盒子外**：`scroll.top − card.top` 必须随预留**变大**；
 *   ② **收敛**：连续 4 帧的预留值必须稳定（复刻 ResizeObserver 反复触发）；
 *   ③ **不重叠**：悬浮条顶边必须落在上方元素底边**之下**；
 *   ④ **没预留时确实重叠**（反向对照）—— 证明③测的是真几何，不是恒真命题。
 *
 * 依赖 `/usr/bin/electron`（DSH 桌面版自带）。没有则 skip。
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
import { GAP_ABOVE_INPUT } from '../src/float-position.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const ELECTRON = '/usr/bin/electron';

/** 真实 CSS（与生产逐字同一份文本）。 */
async function extractCss() {
  const src = await readFile(join(root, 'src', 'floating-bar.js'), 'utf8');
  const m = src.match(/const CSS = `([\s\S]*?)`;/);
  assert.ok(m, '能从 src/floating-bar.js 提取 CSS 模板字符串');
  return m[1];
}

/** 浮条内部按钮的真实样式（决定浮条真有高度 —— 否则几何断言会变成恒真）。 */
async function extractBarCss() {
  const src = await readFile(join(root, 'src', 'extended-bar.js'), 'utf8');
  const m = src.match(/const CSS = `([\s\S]*?)`;/);
  assert.ok(m, '能从 src/extended-bar.js 提取 CSS 模板字符串');
  return m[1];
}

/** float-position.js 去掉 `export ` 前缀内联（它没有 import，可直接内联）。 */
async function inlineFloatPosition() {
  const src = await readFile(join(root, 'src', 'float-position.js'), 'utf8');
  return src.replace(/^export /gm, '');
}

/**
 * 离屏渲染真实排版，复刻 `positionAboveInput` 的 apply 循环跑多帧。
 *
 * @param frames 跑多少帧（复刻 ResizeObserver 反复触发）。
 * @param withReserve 是否应用预留（false 用于反向对照，必须真的重叠）。
 */
async function measure({ frames = 5, withReserve = true } = {}) {
  const css = await extractCss();
  const barCss = await extractBarCss();
  const floatPosition = await inlineFloatPosition();

  // 内核真实层级（从 app.asar 的 ui-conversation/lib/client.js 抄出）：
  //   scrollBody > [viewArea(消息), seat]
  //   seat(sticky bottom) > stack(gap:6px) > root(padding:0 16px 4px) > [card, dock]
  //   card[data-composer-card] > overlayAnchor(零高度锚点), attachments, scroll(编辑区), row
  // 用户截图里的「全部 5 个文件」就是 attachments（卡片内、编辑区正上方）。
  const html = `<!doctype html><html data-dsh-epe-extended><head><style>
body{margin:0;background:#101216}
.wrap{width:900px;height:460px;display:flex;flex-direction:column;overflow:hidden}
.scrollBody{flex-direction:column;flex:1;min-height:0;display:flex;overflow-y:auto}
.viewArea{flex-direction:column;flex:1;min-height:0;display:flex;justify-content:flex-end}
.msg{background:#2b2f36;border-radius:10px;margin:0 8px 8px;padding:12px;color:#aaa}
.seat{flex:none;flex-direction:column;display:flex;position:sticky;bottom:0;z-index:7}
.stack{gap:6px;flex-direction:column;display:flex}
.root{padding:0 16px 4px;flex-direction:column;align-items:center;display:flex;width:100%;box-sizing:border-box}
/* .card[data-composer-card] 的真实声明 */
.card{box-sizing:border-box;width:100%;border-radius:12px;background:#1b1e24;
  font-size:14px;line-height:24px;flex-direction:column;gap:12px;padding-top:8px;display:flex;position:relative}
.overlayAnchor{height:0;position:absolute;inset:0 0 auto}
.attachments{background:#2b2f36;border-radius:10px;margin:0 8px;padding:12px;color:#aaa}
/* .scroll[data-input-scroll] 的真实声明（max-height 说明它就是编辑区盒子本身） */
.scroll{max-height:336px;margin-right:4px;overflow-y:auto}
.grow{position:relative}
.input{box-sizing:border-box;min-height:36px;color:#ddd;padding:4px 8px 0 14px;display:block}
.row{min-height:36px;display:flex;padding:2px 8px 6px;color:#888}
.dock{display:flex;justify-content:center;padding-top:4px;color:#666}
${css}
${barCss}
</style></head><body>
<div class="wrap"><div class="scrollBody">
  <div class="viewArea"><div class="msg" id="msg">上一条消息的底部控件</div></div>
  <div class="seat"><div class="stack">
    <div class="root">
      <div class="card" id="card" data-composer-card>
        <div class="overlayAnchor" id="anchor"><div class="dsh-epe-float" id="host">
          <div class="dsh-epe-xbar">
            <button class="dsh-epe-xkey">()</button><button class="dsh-epe-xkey">[]</button>
            <button class="dsh-epe-xkey">{}</button><button class="dsh-epe-xkey">""</button>
            <button class="dsh-epe-xkey">B</button><button class="dsh-epe-xkey">I</button>
            <button class="dsh-epe-xkey">Link</button>
          </div>
        </div></div>
        <div class="attachments" id="att">全部 5 个文件</div>
        <div class="scroll" id="scroll" data-input-scroll><div class="grow"><div class="input" data-composer-input>第一行<br>第二行</div></div></div>
        <div class="row">+ 权限 计划 发送</div>
      </div>
      <div class="dock">用量条</div>
    </div>
  </div></div>
</div></div>
<script>
${floatPosition}
const host=document.getElementById('host'),card=document.getElementById('card'),
      anchor=document.getElementById('anchor'),msg=document.getElementById('msg'),
      att=document.getElementById('att'),scroll=document.getElementById('scroll');
const WITH_RESERVE=${withReserve};
const r=(x)=>+Number(x).toFixed(1);
const rect=e=>e.getBoundingClientRect();
function applyOnce(){
  // ⚠️ 与 src/floating-bar.js 的 apply() 完全同一顺序、同一算法。
  host.dataset.dshEpePositioned='true';
  // ⚠️ 生产里还会把 deck 标记挂到 html 上（DECK_ATTR），预留规则用
  // **属性选择器**命中卡片 —— 少了这一步，--dsh-epe-float-reserve 写了也不生效
  // （实测：悬浮条压住上一条消息 32px）。这里必须跟着做，否则测试是失效的镜像。
  document.documentElement.setAttribute('data-dsh-epe-deck','on');
  const hostHeight=rect(host).height||0;
  if(WITH_RESERVE) card.style.setProperty('--dsh-epe-float-reserve', reserveHeightFor(hostHeight));
  host.style.top=floatTopFor(hostHeight);
  return {
    reserve:card.style.getPropertyValue('--dsh-epe-float-reserve')||'',
    hostHeight:r(hostHeight),
    cardTop:r(rect(card).top), cardH:r(rect(card).height),
    scrollTop:r(rect(scroll).top),
    hostTop:r(rect(host).top), hostBottom:r(rect(host).bottom),
    msgBottom:r(rect(msg).bottom), attBottom:r(rect(att).bottom),
    // >0 = 悬浮条盖住了上一条消息的内容
    overlapMsg:r(rect(msg).bottom-rect(host).top),
    // 悬浮条底边与卡片顶边的间距（应恰为 GAP）
    gapToCard:r(rect(card).top-rect(host).bottom),
    // >0 = 预留带整个落在卡片**外面**（悬浮条在卡片上方的净空里）
    barOutsideCard:r(rect(card).top-rect(host).bottom),
  };
}
window.__frames=[];
for(let i=0;i<${frames};i++) window.__frames.push(applyOnce());
</script></body></html>`;

  const dir = makeProbeDir('epe-reserve-');
  writeFileSync(join(dir, 'page.html'), html);
  const script = `
const { app, BrowserWindow } = require('electron');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1000, height: 700, show: false, webPreferences: { offscreen: true } });
  await win.loadFile(${JSON.stringify(join(dir, 'page.html'))});
  await new Promise(r => setTimeout(r, 400));
  const frames = await win.webContents.executeJavaScript('window.__frames');
  require('fs').writeFileSync(${JSON.stringify(join(dir, 'out.json'))}, JSON.stringify(frames));
  console.log('OK');
  app.exit(0);
});
setTimeout(() => { console.log('TIMEOUT'); app.exit(4); }, 20000);
`;
  writeFileSync(join(dir, 'run.js'), script);
  const out = execFileSync(ELECTRON, [join(dir, 'run.js')], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '' },
    encoding: 'utf8', timeout: 60000,
  });
  assert.match(out, /OK/, `离屏渲染应成功，实际输出：${out.trim()}`);
  return JSON.parse(await readFile(join(dir, 'out.json'), 'utf8'));
}

const px = (s) => Number(String(s).replace('px', ''));

test('模式二预留：加在输入框**外**顶部、多帧收敛、且不压住上方内容', { timeout: 120000 }, async (t) => {
  if (!existsSync(ELECTRON)) { t.skip('本机没有 /usr/bin/electron，跳过几何测试'); return; }
  const frames = await measure({ frames: 5 });
  const first = frames[0];
  const last = frames[frames.length - 1];

  // ① 悬浮条必须真的有高度（否则下面所有几何断言都可能恒真）。
  assert.ok(first.hostHeight > 10, `悬浮条应有实际高度，实测 ${first.hostHeight}px`);

  // ② 定位成功且落在卡片**上方**：底边与卡片顶边之间恰好是 GAP。
  assert.ok(first.hostTop < first.cardTop, `悬浮条必须在卡片上方：hostTop ${first.hostTop} < cardTop ${first.cardTop}`);
  assert.ok(
    Math.abs(first.gapToCard - GAP_ABOVE_INPUT) <= 1.5,
    `悬浮条底边应距卡片顶边 ${GAP_ABOVE_INPUT}px，实测 ${first.gapToCard}px`,
  );

  // ③ 不重叠：悬浮条顶边必须低于上一条消息内容的底边。
  //    ⚠️ 这条是冲着用户报的「消息底部控件和悬浮栏重叠」来的。
  assert.ok(
    first.overlapMsg < 0,
    `悬浮条不得盖住上方消息内容：悬浮条顶 ${first.hostTop} 应低于消息底 ${first.msgBottom}`
    + `（实测重叠 ${first.overlapMsg}px）`,
  );

  // ④ 收敛：多帧后预留与卡片高度都必须稳定。
  //    ⚠️ 这条是冲着「预留会无限膨胀」来的：曾经按布局量计算预留的实现
  //    实测每帧 +41px（41 → 82 → 123 → 164 → 205px），输入框越长越高。
  const reserve = px(first.reserve);
  assert.ok(reserve > 0, `应产生正预留，实际 ${JSON.stringify(first.reserve)}`);
  assert.equal(
    px(last.reserve), reserve,
    `预留必须第一帧后稳定：实测序列 ${frames.map((f) => px(f.reserve)).join(' → ')}px`,
  );
  assert.ok(
    frames.every((f) => Math.abs(f.cardH - first.cardH) <= 1),
    `卡片高度必须稳定（不能被预留顶高）：实测 ${frames.map((f) => f.cardH).join(' → ')}`,
  );

  // ⑤ 预留带必须装得下悬浮条 + GAP（这是③的算术依据）。
  assert.ok(
    reserve >= GAP_ABOVE_INPUT + first.hostHeight,
    `预留 ${reserve} 必须 ≥ GAP(${GAP_ABOVE_INPUT}) + 悬浮条高 ${first.hostHeight}`,
  );
});

test('模式二预留的反向对照：不预留时确实重叠（证明上一条不是恒真）', { timeout: 120000 }, async (t) => {
  if (!existsSync(ELECTRON)) { t.skip('本机没有 /usr/bin/electron，跳过几何测试'); return; }
  const frames = await measure({ frames: 2, withReserve: false });
  const f = frames[0];
  // 没有预留时悬浮条必然探进上方消息内容 —— 这正是用户报的现象。
  // 若这条不成立，说明上面的「不重叠」断言测不出东西（恒真），必须警惕。
  assert.ok(
    f.overlapMsg > 0,
    `不预留时必须能观测到重叠（否则上一条断言恒真）：悬浮条顶 ${f.hostTop} vs 消息底 ${f.msgBottom}，`
    + `实测重叠 ${f.overlapMsg}px`,
  );
});

/**
 * 接线层守卫：上面两条几何测试是在页面里**按生产算法重放** apply 循环的。
 * 盲区是：把 `positionAboveInput` 里的预留整段删掉，几何测试**照旧全绿**。
 * 所以这里对**真实源码**做结构断言，挡住「整段删掉 / 忘了接线」这类退化。
 */
test('接线守卫：positionAboveInput 真的写了预留变量、且用 floatTopFor 定位', async () => {
  const src = await readFile(join(root, 'src', 'floating-bar.js'), 'utf8');
  const start = src.indexOf('export function positionAboveInput(');
  assert.ok(start >= 0, '能找到 positionAboveInput');
  const body = src.slice(start);

  assert.match(
    body,
    /card\.style\.setProperty\('--dsh-epe-float-reserve', reserveHeightFor\(hostHeight\)\)/,
    '必须把 reserveHeightFor 的结果真的写进卡片的 --dsh-epe-float-reserve',
  );
  assert.match(body, /host\.style\.top = floatTopFor\(hostHeight\)/, '必须用 floatTopFor 设 top');
  // 不得再引入「测量卡片/编辑区布局再算预留」的写法：那正是导致无限膨胀的成因。
  // ⚠️ 量**悬浮条自身高度**是合法的（入参就只有它）；量卡片/编辑区则非法。
  const applyBody = body.slice(body.indexOf('const apply'));
  assert.ok(
    !/querySelector\('\[data-input-scroll\]'\)/.test(applyBody),
    'positionAboveInput 不得再去查编辑区 —— 那会把预留与布局耦合起来（正反馈）',
  );
  assert.ok(
    !/closest\('\[data-composer-overlay\]'\)/.test(applyBody),
    'apply 循环里不得再读锚点位置',
  );
});

test('接线守卫：预留规则必须加在卡片**外**（margin-top，不是编辑区的 padding-top）', async () => {
  const css = await extractCss();
  // 用户 2026-10-16：「你把预留高度加在输入框内了 应该是输入框外顶部」。
  assert.match(
    css,
    /\[data-composer-card\]\{margin-top:var\(--dsh-epe-float-reserve/,
    '预留必须是卡片自己的 margin-top（卡片外面、顶部）',
  );
  assert.ok(
    !/\[data-input-scroll\]\{[^}]*padding-top:var\(--dsh-epe-float-reserve/.test(css),
    '不得把预留写成编辑区的 padding-top（那就是用户报的「加在输入框内」）',
  );
  assert.ok(
    !/\[data-input-scroll\]\{[^}]*margin-top:var\(--dsh-epe-float-reserve/.test(css),
    '也不得写成编辑区的 margin-top（是滚动容器，会把卡片顶高，预留带仍落在卡片背景里）',
  );
});
