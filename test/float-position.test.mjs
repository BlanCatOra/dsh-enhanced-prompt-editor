/**
 * 悬浮定位的**纯函数**测试。
 *
 * 与 `reserve-geometry.test.mjs`（真实渲染几何测试）互补：
 *  - 这里测算法本身（边界、脏输入、语义方向），跑得快、无浏览器依赖；
 *  - 那边测真实排版结果（悬浮条真的落在卡片上方、预留带真在框外、多帧收敛）。
 *
 * 两者都直接测**生产代码**（`src/float-position.js` 是真导入，不是复刻），
 * 所以实现改错时两边都会红。
 *
 * 设计要点（见 float-position.js 的注释）：函数只收「悬浮条高度」这一个量。
 * 刻意**不**去测量卡片/编辑区的位置 —— 那会让预留反过来影响测量值，
 * 形成「预留变大 → 布局变 → 量出的值变 → 预留再变」的正反馈。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GAP_ABOVE_INPUT, RESERVE_EXTRA, floatTopFor, reserveHeightFor } from '../src/float-position.js';

const px = (s) => Number(String(s).replace('px', ''));

test('floatTopFor：把悬浮条放到锚点（卡片顶边）**上方** GAP + 高度 处', () => {
  // 锚点 [data-composer-overlay] 就在卡片顶边上，所以 top 是负数 ——
  // 悬浮条完全落在卡片**外面、上方**。
  assert.equal(px(floatTopFor(30)), -(GAP_ABOVE_INPUT + 30));
  // 语义复核：以锚点为原点，悬浮条占据 [top, top + 高度]，
  // 其底边必须恰好在锚点（卡片顶边）之上 GAP 处。
  for (const h of [20, 34, 48, 72]) {
    const top = px(floatTopFor(h));
    const absoluteBottom = top + h;
    assert.equal(-absoluteBottom, GAP_ABOVE_INPUT, `高度 ${h}：底边与卡片顶边的距离必须正好是 GAP`);
  }
});

test('floatTopFor：悬浮条永远在锚点上方，绝不探进卡片（不压住输入框）', () => {
  for (const h of [0, 1, 20, 34, 48, 100]) {
    const top = px(floatTopFor(h));
    assert.ok(top <= 0, `高度 ${h}：top 必须 ≤ 0（负数＝在卡片上方），实际 ${top}`);
    assert.ok(top + h <= 0, `高度 ${h}：底边必须不越过卡片顶边，实际 ${top + h}`);
  }
});

test('floatTopFor：只依赖悬浮条高度（不碰布局量，因此不存在反馈环）', () => {
  // 同样的高度必须得到同样的 top —— 与卡片/编辑区当前位置无关。
  // 若将来有人把「编辑区 rect」之类的布局量加回入参，这条会立刻失效：
  // 那正是曾经导致预留每帧 +41px 无限膨胀的成因。
  assert.equal(floatTopFor.length, 1, 'floatTopFor 只能收一个入参（高度）');
  assert.equal(floatTopFor(34), floatTopFor(34));
});

test('floatTopFor：脏输入不产生 NaN', () => {
  for (const bad of [undefined, null, {}, Number.NaN, 'abc']) {
    const out = floatTopFor(bad);
    assert.match(String(out), /^-?\d+px$/, `脏输入 ${String(bad)} 应得到整数 px，实际 ${out}`);
    assert.ok(!String(out).includes('NaN'), '绝不能输出 NaN —— 那会让 CSS 失效、元素跑到错位置');
  }
});

test('floatTopFor：数字字符串也能正确处理', () => {
  assert.equal(floatTopFor(30), floatTopFor('30'));
});

test('reserveHeightFor：预留 = GAP + 悬浮条高度 + 呼吸空间', () => {
  assert.equal(px(reserveHeightFor(34)), GAP_ABOVE_INPUT + 34 + RESERVE_EXTRA);
  assert.equal(px(reserveHeightFor(0)), GAP_ABOVE_INPUT + RESERVE_EXTRA, '高度为 0 时仍留出 GAP 与呼吸空间');
});

test('reserveHeightFor：预留必须 ≥ GAP + 悬浮条高度（否则仍会重叠）', () => {
  // 这是「不再重叠」的充要条件：预留带要装得下 GAP + 悬浮条本身。
  for (const h of [24, 34, 48, 72]) {
    assert.ok(
      px(reserveHeightFor(h)) >= GAP_ABOVE_INPUT + h,
      `悬浮条高 ${h} 时预留 ${px(reserveHeightFor(h))} 必须 ≥ GAP(${GAP_ABOVE_INPUT}) + ${h}，否则会盖住上方元素`,
    );
  }
});

test('reserveHeightFor：只依赖悬浮条高度（入参唯一，结构上无法形成反馈）', () => {
  assert.equal(reserveHeightFor.length, 1, 'reserveHeightFor 只能收一个入参（高度）');
  // 多帧迭代必须是常量（真实循环里 ResizeObserver 会反复触发）。
  const height = 34;
  const seen = [];
  for (let i = 0; i < 8; i += 1) seen.push(px(reserveHeightFor(height)));
  assert.ok(
    seen.every((v) => v === seen[0]),
    `预留必须恒定，实际序列 ${seen.join(' → ')} —— 变大说明又去测量了会被预留影响的布局量`,
  );
});

test('reserveHeightFor：脏输入不产生 NaN，且恒为正', () => {
  for (const bad of [undefined, null, Number.NaN, -5, {}, 'abc']) {
    const out = reserveHeightFor(bad);
    assert.match(String(out), /^\d+px$/, `脏输入 ${String(bad)} 应得到非负整数 px，实际 ${out}`);
  }
  assert.equal(px(reserveHeightFor(-5)), GAP_ABOVE_INPUT + RESERVE_EXTRA, '负数高度按 0 处理');
});
