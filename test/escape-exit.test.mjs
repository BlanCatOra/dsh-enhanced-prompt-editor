/**
 * Esc 退回原生模式（用户 2026-10-16 要求：「esc 退出模式一或模式二
 * 回退到原生模式 图标状态也同步更改」）。
 *
 * 真机上无法可靠合成「带焦点的键盘事件」，所以这里分两层：
 *  - `shouldExitOnEscape` 是纯函数，直接穷举各种按键与状态组合；
 *  - `attachEscapeExit` 用一个最小 `document` 桩验证「真的挂了监听、
 *    真的调了 controller.set('native')、且 dispose 真的摘掉了监听」。
 *
 * ⚠️ 只断言「调了 set('native')」，不断言「角标变了」——
 * 角标由 `hooks` 快照源驱动（T 按钮那一侧已有测试钉住）。用户要的
 * 「图标状态同步」靠的就是走同一条状态通道，而不是在 Esc 处手工补一次 UI。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldExitOnEscape, attachEscapeExit } from '../src/escape-exit.js';

/** 最小 document 桩：记录监听器，`querySelector` 返回一个假的输入框。 */
function makeDoc(options = {}) {
  const listeners = new Map();
  const input = {
    textContent: options.draft ?? '',
    contains: (node) => node === inner || options.contains === true,
  };
  const inner = { name: 'inner' };
  return {
    listeners,
    input,
    inner,
    addEventListener: (type, fn, capture) => {
      listeners.set(type, { fn, capture });
    },
    removeEventListener: (type) => {
      listeners.delete(type);
    },
    querySelector: (selector) => (selector === '[data-composer-input]' ? input : null),
    fire(type, event) {
      const entry = listeners.get(type);
      if (entry) entry.fn(event);
    },
  };
}

test('shouldExitOnEscape：只有「输入框内 + 非原生 + 无草稿 + 裸 Esc」才接管', () => {
  const base = { key: 'Escape' };
  assert.equal(shouldExitOnEscape(base, { inComposer: true, mode: 'extended', hasDraft: false }), true);
  assert.equal(shouldExitOnEscape(base, { inComposer: true, mode: 'editor', hasDraft: false }), true);
  // 已在原生：放行，不吞宿主的 Esc。
  assert.equal(shouldExitOnEscape(base, { inComposer: true, mode: 'native', hasDraft: false }), false);
  // 不在输入框内：绝不抢（否则会吞掉宿主关弹窗/退全屏的 Esc）。
  assert.equal(shouldExitOnEscape(base, { inComposer: false, mode: 'extended', hasDraft: false }), false);
  // 有草稿：放行 —— 用户多半想取消这次编辑，不是换模式。
  assert.equal(shouldExitOnEscape(base, { inComposer: true, mode: 'extended', hasDraft: true }), false);
  // 组合键：是别的东西。
  for (const mod of ['ctrlKey', 'metaKey', 'altKey']) {
    assert.equal(
      shouldExitOnEscape({ key: 'Escape', [mod]: true }, { inComposer: true, mode: 'extended', hasDraft: false }),
      false,
      `${mod}+Esc 不该被我们接管`,
    );
  }
  // 别的键。
  for (const key of ['Enter', 'e', 'Esc', undefined, null]) {
    const expected = key === 'Esc';
    assert.equal(
      shouldExitOnEscape({ key }, { inComposer: true, mode: 'extended', hasDraft: false }),
      expected,
      `key=${String(key)} 的处理应当${expected ? '接管' : '放行'}`,
    );
  }
  // 脏输入绝不抛。
  for (const bad of [undefined, null, {}, 'x']) {
    assert.doesNotThrow(() => shouldExitOnEscape(bad, {}));
    assert.equal(shouldExitOnEscape(bad, {}), false);
  }
});

test('attachEscapeExit：真的挂监听、真的切回原生、dispose 真的摘掉', () => {
  const doc = makeDoc();
  const calls = [];
  const controller = { get: () => 'extended', set: (mode) => calls.push(mode) };
  const dispose = attachEscapeExit({ doc, controller });
  assert.equal(typeof dispose, 'function', '必须返回 dispose');
  assert.ok(doc.listeners.has('keydown'), '必须真的挂上 keydown');
  assert.equal(doc.listeners.get('keydown').capture, true, '必须在捕获阶段（要抢在 Lexical 之前）');

  let prevented = 0;
  let stopped = 0;
  doc.fire('keydown', {
    key: 'Escape',
    target: doc.inner,
    preventDefault: () => { prevented += 1; },
    stopPropagation: () => { stopped += 1; },
  });
  assert.deepEqual(calls, ['native'], 'Esc 必须切回原生模式（走同一条状态通道 → 角标自动同步）');
  assert.equal(prevented, 1, '必须 preventDefault');
  assert.equal(stopped, 1, '必须 stopPropagation');

  // 有草稿时不动作。
  doc.input.textContent = '用户正在写的内容';
  calls.length = 0;
  doc.fire('keydown', { key: 'Escape', target: doc.inner, preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(calls, [], '有草稿时不得换模式（否则丢掉用户正在写的内容）');

  dispose();
  assert.equal(doc.listeners.has('keydown'), false, 'dispose 必须摘掉监听');
});

test('attachEscapeExit：缺 document / controller 时返回 null，不抛', () => {
  assert.equal(attachEscapeExit({ doc: null, controller: { set() {} } }), null);
  assert.equal(attachEscapeExit({ doc: makeDoc(), controller: null }), null);
  assert.equal(attachEscapeExit({}), null);
  assert.equal(attachEscapeExit({ doc: {}, controller: { set() {} } }), null);
});

test('attachEscapeExit：document 坏掉时不抛（必须自己兜住）', () => {
  const doc = makeDoc();
  const controller = { get: () => { throw new Error('boom'); }, set: () => { throw new Error('boom'); } };
  const dispose = attachEscapeExit({ doc, controller });
  assert.doesNotThrow(() => {
    doc.fire('keydown', { key: 'Escape', target: doc.inner, preventDefault() {}, stopPropagation() {} });
  });
  dispose();
});
