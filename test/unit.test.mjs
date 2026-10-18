/**
 * dsh-enhanced-prompt-editor —— 单元测试。
 *
 * 只测纯逻辑（路径安全、回车语义、WAV 编码、标题、规范化），
 * 因为这几处是「错了会静默出错」的地方：越界写文件、按错键就发送、
 * 编出宿主认不了的音频。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import { assertInside, draftFileName, toDraftEntries } from '../src/paths.js';
import {
  clampExtendedHeight,
  clampPanelHeight,
  cycleModes,
  defaultSettings,
  draftTitleOf,
  nextMode,
  normalizeEnterMode,
  normalizeExtendedEnter,
  normalizeMode,
  normalizeStorageMode,
  resolveEnterAction,
  resolveExtendedEnter,
  safeDraftDir,
  safeDraftName,
} from '../src/constants.js';
import { createModeController, reconcileMode } from '../src/mode-controller.js';
import {
  SYMBOLS,
  applySymbol,
  insertPlain,
  isAlternateLine,
  prefixLines,
  wrapSelection,
} from '../src/edit-ops.js';
import {
  EXTENDED_CSS,
  HEIGHT_VAR,
  MARK_ATTR,
  composerHeightFor,
  editorOf,
  findComposerEditor,
  findComposerSeat,
  insertNewline,
  createNativeComposer,
} from '../src/native-composer.js';

/* ── 共用的 DOM/Lexical 桩（多个原生输入框用例复用，避免夹具漂移）── */
/** 造一个够用的元素桩（带 style / attrs）。 */
function makeElement() {
  const element = {
    attrs: {},
    style: {
      values: {},
      setProperty(name, value) {
        this.values[name] = value;
      },
      removeProperty(name) {
        delete this.values[name];
      },
    },
  };
  element.setAttribute = (name, value) => {
    element.attrs[name] = value;
  };
  element.removeAttribute = (name) => {
    delete element.attrs[name];
  };
  return element;
}

/**
 * 造一个够用的 document：`<html>` + seat + 输入框根 + 事件派发。
 *
 * ⚠️ 标记挂在 `documentElement` 上而不是 seat 上：seat 会被宿主在会话切换时
 * 重新挂载，挂在它上面的东西会跟着丢。`<html>` 不会。
 */
function makeDoc(rootEditor) {
  const listeners = [];
  const seat = makeElement();
  const html = makeElement();
  const root = {
    __lexicalEditor: rootEditor,
    contains: (node) => node === root || node?.inside === true,
  };
  const doc = {
    documentElement: html,
    addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture }),
    removeEventListener: (type, fn) => {
      const at = listeners.findIndex((item) => item.type === type && item.fn === fn);
      if (at >= 0) listeners.splice(at, 1);
    },
    querySelector: (selector) => {
      if (selector === '[data-composer-seat]') return seat;
      if (selector === '[data-composer-input]') return root;
      return null;
    },
  };
  return { doc, seat, html, root, listeners };
}

/** 一个记录调用的 Lexical 编辑器桩。 */
function makeEditor(log) {
  return {
    update: (fn) => fn(),
    getEditorState: () => ({
      _selection: {
        insertParagraph: () => log.push('paragraph'),
      },
    }),
  };
}

const plainEnter = { key: 'Enter', code: 'Enter', isComposing: false, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, target: { inside: true } };
import { encodeWave } from '../src/audio.js';

/* ── 路径安全 ──────────────────────────────────────────────────────── */

test('draftFileName 把危险输入退回 draft.md', () => {
  assert.equal(draftFileName('我的长prompt'), '我的长prompt.md');
  assert.equal(draftFileName('my-prompt_1.2'), 'my-prompt_1.2.md');
  assert.equal(draftFileName('already.md'), 'already.md');
  assert.equal(draftFileName(''), 'draft.md');
  assert.equal(draftFileName('..'), 'draft.md');
  assert.equal(draftFileName('.'), 'draft.md');
  assert.equal(draftFileName('sub/dir'), 'draft.md');
  assert.equal(draftFileName('sub\\dir'), 'draft.md');
  assert.equal(draftFileName('a\u0000b'), 'draft.md');
  assert.equal(draftFileName('x'.repeat(200)), 'draft.md');
  assert.equal(draftFileName('bad?name'), 'draft.md');
});

test('assertInside 拒绝越界，放行工作区内路径', () => {
  const root = resolve(tmpdir(), 'pe-ws');
  assert.equal(assertInside(root, 'a.md'), join(root, 'a.md'));
  assert.equal(assertInside(root, '.dsh/prompts/a.md'), join(root, '.dsh/prompts/a.md'));
  assert.equal(assertInside(root, 'a/../b.md'), join(root, 'b.md'));
  assert.throws(() => assertInside(root, '../escape.md'), /escapes the workspace/);
  assert.throws(() => assertInside(root, '../../etc/passwd'), /escapes the workspace/);
  assert.throws(() => assertInside(root, '/etc/passwd'), /escapes the workspace/);
  assert.throws(() => assertInside('relative/path', 'a.md'), /absolute/);
  assert.throws(() => assertInside(root, 'a/../../x'), /escapes the workspace/);
  // 前缀相同但不是子目录的兄弟目录不能被误判为内部。
  assert.throws(() => assertInside(root, `../${'pe-ws-evil'}/x.md`), /escapes the workspace/);
});

test('toDraftEntries 只收 .md 文件并按时间倒序', async () => {
  const dir = '/ws/.dsh/prompts';
  const files = [
    { name: 'older.md', isFile: () => true },
    { name: 'newer.md', isFile: () => true },
    { name: 'note.txt', isFile: () => true },
    { name: 'subdir.md', isFile: () => false },
  ];
  const statOf = async (path) => {
    if (path.endsWith('older.md')) return { mtimeMs: 100, size: 10 };
    if (path.endsWith('newer.md')) return { mtimeMs: 200, size: 20 };
    throw new Error('missing');
  };
  const entries = await toDraftEntries(files, dir, statOf);
  assert.deepEqual(entries.map((e) => e.name), ['newer', 'older']);
  assert.equal(entries[0].bytes, 20);
});

/* ── 规范化 ────────────────────────────────────────────────────────── */

test('safeDraftDir 拒绝遍历并保留合法子目录', () => {
  assert.equal(safeDraftDir('.dsh/prompts'), '.dsh/prompts');
  assert.equal(safeDraftDir('/abs/path/'), 'abs/path');
  assert.equal(safeDraftDir(''), '.dsh/prompts');
  assert.equal(safeDraftDir('../evil'), '.dsh/prompts');
  assert.equal(safeDraftDir('a/../../b'), '.dsh/prompts');
  assert.equal(safeDraftDir('a\\b'), 'a/b');
});

test('clampPanelHeight 夹进区间', () => {
  assert.equal(clampPanelHeight(420), 420);
  assert.equal(clampPanelHeight(10), 180);
  assert.equal(clampPanelHeight(99999), 1400);
  assert.equal(clampPanelHeight('abc'), 420);
  assert.equal(clampPanelHeight(undefined), 420);
});

test('存储与回车模式收敛到受支持值', () => {
  assert.equal(normalizeStorageMode('browser'), 'browser');
  assert.equal(normalizeStorageMode('bogus'), 'workspace');
  assert.equal(normalizeEnterMode('send'), 'send');
  assert.equal(normalizeEnterMode('bogus'), 'newline');
});

test('safeDraftName 与 draftFileName 规则一致', () => {
  assert.equal(safeDraftName('ok'), 'ok');
  assert.equal(safeDraftName('x/y'), 'draft');
  assert.equal(safeDraftName(''), 'draft');
});

/* ── 回车语义 ──────────────────────────────────────────────────────── */

const key = (over = {}) => ({ key: 'Enter', code: 'Enter', ...over });

test('默认模式：回车换行，主修饰键发送', () => {
  assert.equal(resolveEnterAction(key(), 'newline'), 'newline');
  assert.equal(resolveEnterAction(key({ metaKey: true }), 'newline'), 'send');
  assert.equal(resolveEnterAction(key({ ctrlKey: true }), 'newline'), 'send');
});

test('反转模式：回车发送，主修饰键换行', () => {
  assert.equal(resolveEnterAction(key(), 'send'), 'send');
  assert.equal(resolveEnterAction(key({ metaKey: true }), 'send'), 'newline');
  assert.equal(resolveEnterAction(key({ ctrlKey: true }), 'send'), 'newline');
});

test('Shift+Enter 永远是换行；输入法组合期间不拦截', () => {
  assert.equal(resolveEnterAction(key({ shiftKey: true }), 'send'), 'newline');
  assert.equal(resolveEnterAction(key({ shiftKey: true }), 'newline'), 'newline');
  assert.equal(resolveEnterAction(key({ isComposing: true }), 'send'), null);
  assert.equal(resolveEnterAction(key({ keyCode: 229 }), 'newline'), null);
});

test('非回车键一律不拦截', () => {
  assert.equal(resolveEnterAction({ key: 'a', code: 'KeyA' }, 'send'), null);
  assert.equal(resolveEnterAction({ key: 'Escape', code: 'Escape' }, 'newline'), null);
  assert.equal(resolveEnterAction(null, 'newline'), null);
  assert.equal(resolveEnterAction(undefined, 'send'), null);
});

test('小键盘回车同样识别', () => {
  assert.equal(resolveEnterAction({ key: 'Enter', code: 'NumpadEnter' }, 'send'), 'send');
});

/* ── 音频编码 ──────────────────────────────────────────────────────── */

test('encodeWave 产出宿主接受的 16kHz 单声道 PCM16 WAV', () => {
  const samples = new Float32Array([0, 1, -1, 0.5, -0.5]);
  const bytes = encodeWave(samples);
  assert.equal(bytes.length, 44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (at, len) => String.fromCharCode(...bytes.subarray(at, at + len));
  assert.equal(ascii(0, 4), 'RIFF');
  assert.equal(ascii(8, 4), 'WAVE');
  assert.equal(ascii(12, 4), 'fmt ');
  assert.equal(view.getUint16(20, true), 1, 'PCM');
  assert.equal(view.getUint16(22, true), 1, 'mono');
  assert.equal(view.getUint32(24, true), 16000, 'sample rate');
  assert.equal(view.getUint16(34, true), 16, 'bit depth');
  assert.equal(ascii(36, 4), 'data');
  assert.equal(view.getUint32(40, true), samples.length * 2);
  assert.equal(view.getInt16(44, true), 0);
  assert.equal(view.getInt16(46, true), 32767);
  assert.equal(view.getInt16(48, true), -32768);
});

test('encodeWave 把越界采样夹住', () => {
  const bytes = encodeWave(new Float32Array([2, -2]));
  const view = new DataView(bytes.buffer);
  assert.equal(view.getInt16(44, true), 32767);
  assert.equal(view.getInt16(46, true), -32768);
});

/* ── 标题 ──────────────────────────────────────────────────────────── */

test('draftTitleOf 取首个非空行并去掉标题井号', () => {
  assert.equal(draftTitleOf('# 我的标题\n正文'), '我的标题');
  assert.equal(draftTitleOf('\n\n  内容  '), '内容');
  assert.equal(draftTitleOf(''), 'Prompt');
  assert.equal(draftTitleOf('   '), 'Prompt');
  assert.equal(draftTitleOf(undefined), 'Prompt');
  assert.equal(draftTitleOf('#\n#'), 'Prompt');
  const long = draftTitleOf('x'.repeat(100));
  assert.equal(long.length, 43, '截断到 42 + 省略号');
  assert.ok(long.endsWith('…'));
});

/* ── volatile 活引用（本轮真实缺陷的回归守卫） ─────────────────────── */

test('Config({}) 的字段是活引用，resolveConfig 必须剥出普通值', async () => {
  const { Config, resolveConfig, unwrapDeep } = await import('../src/config.js');
  const raw = Config({});
  // 缺陷现场：插值结果是 {get: fn}，直接当字符串用会全线失效。
  assert.equal(typeof raw.storage, 'object', 'volatile 字段插值成活引用');
  assert.equal(typeof raw.storage.get, 'function');

  const resolved = resolveConfig(raw);
  assert.equal(resolved.storage, 'workspace');
  assert.equal(resolved.dir, '.dsh/prompts');
  assert.equal(resolved.enterMode, 'newline');
  assert.equal(resolved.panelHeight, 420);
  assert.equal(resolved.browseWithReader, true);
  assert.equal(resolved.dictate, true);
  for (const value of Object.values(resolved)) {
    assert.notEqual(typeof value, 'object', '解析结果不得残留活引用');
  }
});

test('resolveConfig 接受普通对象、空值与非法值', async () => {
  const { resolveConfig } = await import('../src/config.js');
  assert.equal(resolveConfig({ storage: 'browser' }).storage, 'browser');
  assert.equal(resolveConfig({}).storage, 'workspace');
  assert.equal(resolveConfig(undefined).storage, 'workspace');
  assert.equal(resolveConfig(null).storage, 'workspace');
  assert.equal(resolveConfig({ storage: 'nonsense' }).storage, 'workspace');
  assert.equal(resolveConfig({ panelHeight: 99999 }).panelHeight, 1400);
  assert.equal(resolveConfig({ dir: '../evil' }).dir, '.dsh/prompts');
});

test('unwrapDeep 递归剥引用且不破坏结构', async () => {
  const { unwrapDeep } = await import('../src/config.js');
  const live = (value) => ({ get: () => value });
  const deep = unwrapDeep({ a: live(1), b: { c: live('x') }, d: [live(true)] });
  assert.deepEqual(deep, { a: 1, b: { c: 'x' }, d: [true] });
});

/* ── 样式注入绝不可抛（插槽条目会因渲染期异常被永久撤销） ─────────────── */

test('injectCss 只注入一次，重复调用返回 false', async () => {
  const { injectCss } = await import('../src/css.js');
  const head = { appended: [], appendChild(node) { this.appended.push(node); } };
  const doc = {
    head,
    querySelector: () => null,
    createElement: () => ({ dataset: {} }),
  };
  assert.equal(injectCss(doc, 'x/y.css', 'body{}', 'p'), true);
  assert.equal(head.appended.length, 1);
  assert.equal(head.appended[0].dataset.pluginCss, 'x/y.css');

  // 第二次：假装已经存在同名 style。
  const doc2 = { ...doc, querySelector: () => ({}) };
  assert.equal(injectCss(doc2, 'x/y.css', 'body{}', 'p'), false);
});

test('injectCss 对任何坏文档都返回 false 而不抛错', async () => {
  const { injectCss } = await import('../src/css.js');
  const boom = () => {
    throw new Error('hostile document');
  };
  const cases = [
    ['document 为 undefined', undefined],
    ['document 为 null', null],
    ['querySelector 抛错', { querySelector: boom, head: { appendChild() {} }, createElement: () => ({ dataset: {} }) }],
    ['head 缺失', { querySelector: () => null, createElement: () => ({ dataset: {} }) }],
    ['head.appendChild 不是函数', { querySelector: () => null, head: {}, createElement: () => ({ dataset: {} }) }],
    ['createElement 抛错', { querySelector: () => null, head: { appendChild() {} }, createElement: boom }],
    ['appendChild 抛错', { querySelector: () => null, head: { appendChild: boom }, createElement: () => ({ dataset: {} }) }],
  ];
  for (const [label, doc] of cases) {
    assert.equal(injectCss(doc, 'x/y.css', 'body{}', 'p'), false, `${label} 必须返回 false`);
  }
});

/* ── 启动自检（boot-diagnostics） ───────────────────────────────────── */

/** 造一个可控的 storage 桩，并临时装到 globalThis 上。 */
function withStorage(name, store, run) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { value: store, configurable: true, writable: true });
  try {
    return run();
  } finally {
    if (descriptor === undefined) delete globalThis[name];
    else Object.defineProperty(globalThis, name, descriptor);
  }
}

/** 一个够用的内存 storage。 */
function memoryStorage() {
  const map = new Map();
  return {
    get length() {
      return map.size;
    },
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => void map.set(key, String(value)),
    removeItem: (key) => void map.delete(key),
    __map: map,
  };
}

test('writeBootReport 写入 ok/failures，并原样返回报告', async () => {
  const { writeBootReport, readBootReport, BOOT_REPORT_KEY } = await import('../src/boot-diagnostics.js');
  const store = memoryStorage();
  withStorage('localStorage', store, () => {
    const report = writeBootReport([{ where: 'sidebar-tab', message: 'boom', stack: '' }], { plugin: 'p' });
    assert.equal(report.ok, false);
    assert.equal(report.failures.length, 1);
    assert.equal(typeof report.at, 'string');
    const back = readBootReport();
    assert.equal(back.ok, false);
    assert.equal(back.failures[0].where, 'sidebar-tab');
    assert.ok(store.__map.has(BOOT_REPORT_KEY), '报告落在约定的 key 上');
  });
});

test('writeBootReport 空失败列表 = ok，且报告可被读回', async () => {
  const { writeBootReport, readBootReport } = await import('../src/boot-diagnostics.js');
  const store = memoryStorage();
  withStorage('localStorage', store, () => {
    writeBootReport([]);
    const back = readBootReport();
    assert.equal(back.ok, true);
    assert.deepEqual(back.failures, []);
  });
});

test('storage 被禁用/抛错时留痕失败但不抛错', async () => {
  const { writeBootReport, readBootReport } = await import('../src/boot-diagnostics.js');
  const hostile = [
    ['访问 length 就抛', {
      get length() {
        throw new Error('SecurityError');
      },
      getItem: () => null,
      setItem: () => undefined,
    }],
    ['setItem 抛（配额）', { length: 0, getItem: () => null, setItem: () => {
      throw new Error('QuotaExceededError');
    } }],
    ['getItem 抛', { length: 0, getItem: () => {
      throw new Error('SecurityError');
    }, setItem: () => undefined }],
    ['getItem 返回坏 JSON', { length: 0, getItem: () => '{not json', setItem: () => undefined }],
    ['storage 是 null', null],
    ['storage 是字符串', 'nope'],
  ];
  for (const [label, store] of hostile) {
    withStorage('localStorage', store, () => {
      withStorage('sessionStorage', store, () => {
        assert.doesNotThrow(() => writeBootReport([{ where: 'x', message: 'y', stack: '' }]), `${label} 不该抛`);
        assert.equal(readBootReport(), undefined, `${label} 读回应该是 undefined`);
      });
    });
  }
});

test('describeBootFailure 收敛非 Error 抛出值并截断超长堆栈', async () => {
  const { describeBootFailure } = await import('../src/boot-diagnostics.js');
  const store = memoryStorage();
  withStorage('localStorage', store, () => {
    withStorage('sessionStorage', store, () => {
      const plain = describeBootFailure('s1', 'just a string');
      assert.equal(plain.where, 's1');
      assert.equal(plain.message, 'just a string');
      assert.equal(plain.stack, '');

      const long = new Error('x');
      long.stack = 'a'.repeat(9000);
      const recorded = describeBootFailure('s2', long, { hint: 'y'.repeat(900) });
      assert.equal(recorded.stack.length, 4000, '堆栈截断到 4000');
      assert.equal(recorded.extra.length, 500, '附加上下文截断到 500');
      assert.equal(recorded.extra[0], '{', '对象型附加上下文走 JSON');

      const stringExtra = describeBootFailure('s4', new Error('x'), 'z'.repeat(900));
      assert.equal(stringExtra.extra.length, 500, '字符串附加上下文同样截断');
      assert.equal(stringExtra.extra[0], 'z');

      const noError = describeBootFailure('s3', undefined);
      assert.equal(noError.message, 'undefined');
    });
  });
});

test('guardStep 吞掉异常并收集记录，绝不外抛', async () => {
  const { guardStep } = await import('../src/boot-diagnostics.js');
  const store = memoryStorage();
  withStorage('localStorage', store, () => {
    withStorage('sessionStorage', store, () => {
      const failures = [];
      assert.equal(guardStep(failures, 'ok', () => 42), 42);
      assert.equal(failures.length, 0);

      assert.equal(guardStep(failures, 'bad', () => {
        throw new Error('boom');
      }), undefined);
      assert.equal(failures.length, 1);
      assert.equal(failures[0].where, 'bad');
      assert.equal(failures[0].message, 'boom');

      assert.equal(guardStep(failures, 'bad2', () => {
        throw new Error('boom2');
      }, () => 'fallback'), 'fallback');
      assert.equal(failures.length, 2);

      // 兜底值工厂自己抛错也不能外抛，且额外记一条。
      assert.equal(guardStep(failures, 'bad3', () => {
        throw new Error('boom3');
      }, () => {
        throw new Error('fallback boom');
      }), undefined);
      assert.equal(failures.length, 4);
      assert.equal(failures[3].where, 'bad3:fallback');
    });
  });
});

/* ── 模式状态机（2026-10-16 新增）────────────────────────────────────
 * 这一层错了会「看起来正常但按 T 没反应」或「点了 T 却跳进用户没要的模式」，
 * 都是静默型缺陷，所以把顺序与收敛规则钉死。
 */

test('cycleModes：按勾选与排序产出循环序列', () => {
  // 两个都启用，默认编辑器在前。
  assert.deepEqual(cycleModes({ modeEditor: true, modeExtended: true, editorFirst: true }), [
    'editor',
    'extended',
  ]);
  // 两个都启用，反序。
  assert.deepEqual(cycleModes({ modeEditor: true, modeExtended: true, editorFirst: false }), [
    'extended',
    'editor',
  ]);
  // 只启用一个：顺序本来唯一，editorFirst 不应产生影响。
  assert.deepEqual(cycleModes({ modeEditor: true, modeExtended: false, editorFirst: false }), ['editor']);
  assert.deepEqual(cycleModes({ modeEditor: false, modeExtended: true, editorFirst: true }), ['extended']);
  // 两个都关掉：没有可选项。
  assert.deepEqual(cycleModes({ modeEditor: false, modeExtended: false }), []);
  // 空/非对象输入按「全默认」处理（两个都启用）。
  assert.deepEqual(cycleModes(null), ['editor', 'extended']);
  assert.deepEqual(cycleModes(undefined), ['editor', 'extended']);
});

test('nextMode：在「已启用模式 + 原生兜底」之间循环', () => {
  const both = ['editor', 'extended'];
  assert.equal(nextMode('editor', both), 'extended');
  assert.equal(nextMode('extended', both), 'native');
  assert.equal(nextMode('native', both), 'editor');

  // 只启用一个：该模式 ↔ 原生。
  assert.equal(nextMode('editor', ['editor']), 'native');
  assert.equal(nextMode('native', ['editor']), 'editor');

  // 没有启用的增强：永远停在原生（不崩、不跳）。
  assert.equal(nextMode('native', []), 'native');

  // 当前模式已不可用（用户刚关掉它）：落到序列第一项，而不是卡住。
  assert.equal(nextMode('extended', ['editor']), 'editor');
});

test('reconcileMode：被关掉的模式退回原生，不偷偷换到另一个', () => {
  // 扩展输入框被关掉时，正在生效的 extended 退回 native —— 「我不想要这个」
  // 不等于「换成那个」。
  assert.equal(reconcileMode('extended', ['editor']), 'native');
  assert.equal(reconcileMode('editor', ['extended']), 'native');
  // 仍在序列里的保持不变。
  assert.equal(reconcileMode('editor', ['editor', 'extended']), 'editor');
  // 原生本来就合法。
  assert.equal(reconcileMode('native', []), 'native');
});

test('normalizeMode 把任意输入收敛到受支持模式', () => {
  assert.equal(normalizeMode('editor'), 'editor');
  assert.equal(normalizeMode('extended'), 'extended');
  assert.equal(normalizeMode('native'), 'native');
  assert.equal(normalizeMode('nope'), 'native');
  assert.equal(normalizeMode(undefined), 'native');
});

test('模式控制器：循环、持久化、订阅；越界值不广播', () => {
  const writes = [];
  const storage = {
    getItem: () => null,
    setItem: (key, value) => writes.push([key, value]),
  };
  let settingsValue = { modeEditor: true, modeExtended: true, editorFirst: true };
  const settings = {
    get: () => settingsValue,
    subscribe: () => () => undefined,
  };

  const controller = createModeController({ settings, storage });
  // 初始：存储里没有 → 原生。
  assert.equal(controller.get(), 'native');
  const seen = [];
  controller.subscribe((mode) => seen.push(mode));

  assert.equal(controller.cycle(), 'editor');
  assert.equal(controller.cycle(), 'extended');
  assert.equal(controller.cycle(), 'native');
  assert.deepEqual(seen, ['editor', 'extended', 'native'], '每次真实变化都广播');
  assert.equal(writes.length, 3, '每次都落盘');
  assert.equal(writes[0][0], 'dsh.enhancedPromptEditor.mode');
  controller.dispose();
});

test('模式控制器：只有一个模式时，T 停在「自己 ↔ 原生」', () => {
  const storage = { getItem: () => null, setItem: () => undefined };
  const settings = { get: () => ({ modeEditor: true, modeExtended: false }), subscribe: () => () => undefined };
  const controller = createModeController({ settings, storage });
  assert.equal(controller.get(), 'native');
  assert.equal(controller.cycle(), 'editor');
  assert.equal(controller.cycle(), 'native');
  assert.equal(controller.cycle(), 'editor');
  controller.dispose();
});

test('模式控制器：存储里是坏值时退回原生', () => {
  const settings = { get: () => ({}), subscribe: () => () => undefined };
  const controller = createModeController({
    settings,
    storage: { getItem: () => 'javascript:alert(1)', setItem: () => undefined },
  });
  assert.equal(controller.get(), 'native');
  controller.dispose();
});

test('模式控制器：存储抛错不影响功能', () => {
  const settings = { get: () => ({ modeEditor: true }), subscribe: () => () => undefined };
  const hostile = {
    getItem: () => {
      throw new Error('denied');
    },
    setItem: () => {
      throw new Error('denied');
    },
  };
  const controller = createModeController({ settings, storage: hostile });
  assert.equal(controller.get(), 'native');
  assert.equal(controller.cycle(), 'editor', '存不进去也要能切');
  controller.dispose();
});

test('不变量：defaultSettings 的每个字段都必须活过 resolveConfig 与设置面 normalize', async () => {
  // ⚠️⚠️ 本机实测踩过的**静默失效**模式（2026-08）：
  // 字段清单在三处**各自手写** —— `constants.js` 的 defaultSettings、
  // `config.js` 的 resolveConfig、`settings-face.js` 的 normalize。
  // 新增字段时漏掉任何一处，后果是：
  //   - 设置卡片能渲染、能保存（因为卡片走 configForms 的 scope）；
  //   - 但 `settings.get()` 里没有这个字段 → 客户端逻辑永远读不到 → **功能静默失效**，
  //     而所有其它测试仍然全绿。
  // 实测：漏掉 nativeDeck/nativeEnter 时「原生模式显示 deck」完全不生效。
  // 这条不变量专门守三处清单的一致性。
  const { defaultSettings } = await import('../src/constants.js');
  const { resolveConfig } = await import('../src/config.js');
  const { createSettingsFace } = await import('../src/settings-face.js');
  const defaults = defaultSettings();
  const keys = Object.keys(defaults).sort();
  assert.ok(keys.length > 0, 'defaultSettings 不该是空的');

  // ① resolveConfig：不含任何字段时也要把全部字段补齐。
  assert.deepEqual(Object.keys(resolveConfig({})).sort(), keys, 'resolveConfig 必须覆盖全部字段');

  // ② 设置面 normalize：用一个"什么都不含"的 scope，字段也必须齐。
  const ctx = {
    get: () => ({
      get: () => ({
        getSnapshot: () => ({ status: 'ready', writable: true, value: {}, base: {}, user: {}, revision: 1 }),
        get: () => ({}),
        value: {},
        subscribe: () => () => undefined,
        mutate: async () => true,
      }),
    }),
    effect: (fn) => fn(),
  };
  const face = createSettingsFace(ctx, () => undefined);
  assert.deepEqual(
    Object.keys(face.get()).sort(),
    keys,
    '⚠️ 设置面 normalize 漏字段 → `settings.get()` 读不到它，功能静默失效（本机踩过）',
  );

  // ③ 非默认值也必须真的透过来（否则开关"能点但没用"）。
  const ctx2 = {
    get: () => ({
      get: () => ({
        getSnapshot: () => ({
          status: 'ready', writable: true, base: {}, user: {}, revision: 1,
          value: { nativeDeck: true, nativeEnter: true },
        }),
        get: () => ({ nativeDeck: true, nativeEnter: true }),
        value: { nativeDeck: true, nativeEnter: true },
        subscribe: () => () => undefined,
        mutate: async () => true,
      }),
    }),
    effect: (fn) => fn(),
  };
  const face2 = createSettingsFace(ctx2, () => undefined);
  assert.equal(face2.get().nativeDeck, true, 'nativeDeck=true 必须透到 settings.get()');
  assert.equal(face2.get().nativeEnter, true, 'nativeEnter=true 必须透到 settings.get()');
});

/* ── 「原生输入框增强」的两个开关（用户 2026-08 要求）────────────────── */

test('native-switches：默认都关、坏数据不抛、写入即持久化、值不变不广播', async () => {
  const {
    SWITCHES_STORAGE_KEY,
    createNativeSwitches,
    readStoredSwitches,
    writeStoredSwitches,
  } = await import('../src/native-switches.js');

  const mkStorage = (initial) => {
    const map = new Map(Object.entries(initial ?? {}));
    return {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      raw: map,
    };
  };

  const OFF = { nativeDeck: false, nativeEnter: false, shortcutEnabled: true, extendedEnter: undefined };

  // ① 没存过 / 存储不存在 → 两个原生增强都关、快捷键开，且绝不抛错。
  assert.deepEqual(readStoredSwitches(undefined), OFF);
  assert.deepEqual(readStoredSwitches(mkStorage()), OFF);

  // ② 坏数据（非 JSON / 非对象 / 缺字段）一律退回「关」：这是渲染前的读路径，
  //    抛一下就是白屏。
  assert.deepEqual(readStoredSwitches(mkStorage({ [SWITCHES_STORAGE_KEY]: '{不是 json' })), OFF);
  assert.deepEqual(readStoredSwitches(mkStorage({ [SWITCHES_STORAGE_KEY]: 'null' })), OFF);
  assert.deepEqual(readStoredSwitches(mkStorage({ [SWITCHES_STORAGE_KEY]: '{"nativeDeck":"yes"}' })), OFF
  , '⚠️ 只认严格 true：字符串 "yes" 不能被当成都开');

  // ②b 快捷键开关：**缺字段算开**（老版本存储里没有这一项，升级后不能丢）；
  //     只有显式存过 `false` 才算关。
  assert.equal(
    readStoredSwitches(mkStorage({ [SWITCHES_STORAGE_KEY]: '{"nativeDeck":true}' })).shortcutEnabled,
    true,
    '⚠️ 老版本存储（没有 shortcutEnabled 字段）必须按默认「开」，否则升级会静默丢掉 Ctrl+T',
  );
  assert.equal(
    readStoredSwitches(mkStorage({ [SWITCHES_STORAGE_KEY]: '{"shortcutEnabled":false}' })).shortcutEnabled,
    false,
    '显式关了就必须关',
  );
  assert.equal(
    readStoredSwitches(mkStorage({ [SWITCHES_STORAGE_KEY]: '{"shortcutEnabled":"no"}' })).shortcutEnabled,
    true,
    '只认严格 false：字符串 "no" 不能被当成关',
  );

  // ③ 写入后能读回来；只存两个布尔（不塞垃圾）。
  const storage = mkStorage();
  writeStoredSwitches(storage, { nativeDeck: true, nativeEnter: false, junk: 1 });
  assert.deepEqual(readStoredSwitches(storage), { ...OFF, nativeDeck: true });
  assert.equal(
    storage.raw.get(SWITCHES_STORAGE_KEY),
    '{"nativeDeck":true,"nativeEnter":false,"shortcutEnabled":true}',
  );

  // ④ 控制器：set 之后广播 + 持久化；同值不广播（避免无谓重渲染）。
  //    用一份**干净**存储建控制器（上一段的存储里已经是 open 状态了）。
  const fresh = mkStorage();
  const switches = createNativeSwitches({ storage: fresh });
  const seen = [];
  const off = switches.subscribe((value) => seen.push(value));
  switches.set({ nativeDeck: true });
  assert.equal(seen.length, 1, '值变了要广播');
  assert.deepEqual(readStoredSwitches(fresh), { ...OFF, nativeDeck: true }, 'set 必须持久化');
  switches.set({ nativeDeck: true });
  assert.equal(seen.length, 1, '值没变不广播');
  switches.set({ nativeEnter: true });
  assert.equal(seen.length, 2);
  assert.deepEqual(switches.get(), { ...OFF, nativeDeck: true, nativeEnter: true }, 'set 只覆盖给出的字段');
  off();
  switches.set({ nativeDeck: false });
  assert.equal(seen.length, 2, '退订后不再收到');

  // ⑤ 存储写失败（隐私模式/配额满）不能冒到调用方：本次仍生效。
  const throwing = {
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  };
  const resilient = createNativeSwitches({ storage: throwing });
  assert.doesNotThrow(() => resilient.set({ nativeDeck: true }));
  assert.equal(resilient.get().nativeDeck, true, '存不下也要在本次生效');

  // ⑥ 关掉快捷键也要能持久化：这是「设置里是否启用这个快捷键」的存储基础。
  switches.set({ shortcutEnabled: false });
  assert.equal(switches.get().shortcutEnabled, false, '关掉快捷键必须立刻生效');
  assert.equal(readStoredSwitches(fresh).shortcutEnabled, false, '关掉快捷键必须持久化');
  switches.set({ shortcutEnabled: true });
  assert.equal(switches.get().shortcutEnabled, true, '再打开也要能恢复');
});

test('deckSource：扩展模式恒可见；原生模式只在客户端开关 nativeDeck 勾上时可见', () => {
  const settings = {
    get: () => ({ modeEditor: true, modeExtended: true }),
    subscribe: () => () => undefined,
  };
  // ⚠️ 这两个开关存**客户端**（localStorage），不读 settings：
  // 宿主设置那条写入在本机被整体拒绝，见 native-switches.js 的说明。
  let switchValue = { nativeDeck: false, nativeEnter: false };
  const switchListeners = new Set();
  const switches = {
    get: () => switchValue,
    set(next) {
      switchValue = { ...switchValue, ...next };
      for (const listener of [...switchListeners]) listener(switchValue);
    },
    subscribe: (listener) => {
      switchListeners.add(listener);
      return () => switchListeners.delete(listener);
    },
  };
  const controller = createModeController({
    settings,
    storage: { getItem: () => null, setItem: () => undefined },
    switches,
  });
  const deck = controller.deckSource;
  const extended = controller.extendedSource;

  assert.equal(controller.get(), 'native');
  assert.equal(deck.getSnapshot(), false, '原生 + 未勾选 → deck 不显示');
  assert.equal(extended.getSnapshot(), false);

  switches.set({ nativeDeck: true });
  assert.equal(deck.getSnapshot(), true, '原生 + 勾选 nativeDeck → deck 显示');
  assert.equal(extended.getSnapshot(), false, '⚠️ 但 extended 仍为 false：不该带出行号沟槽');

  switches.set({ nativeDeck: false });
  assert.equal(deck.getSnapshot(), false, '取消勾选后立刻收掉');

  controller.set('extended');
  assert.equal(deck.getSnapshot(), true, '扩展模式：deck 恒显示');
  assert.equal(extended.getSnapshot(), true, '扩展模式：extended 也为真（行号沟槽要画）');

  // ⚠️ extended 与 deck 是**两个**判断：扩展模式下两者都为真，
  // 原生+nativeDeck 时只有 deck 为真 —— 混淆它们会把行号带进原生模式。
  assert.notEqual(
    typeof deck.getSnapshot,
    'undefined',
    'deckSource 必须暴露 getSnapshot（插槽 hooks face 会绑成 useDeck()）',
  );
  controller.dispose();
});

test('deckSource：切换模式/设置都通知订阅者（否则 deck 不会跟着变）', () => {
  const settingsListeners = new Set();
  let settingsValue = { modeEditor: true, modeExtended: true, nativeDeck: false };
  const settings = {
    get: () => settingsValue,
    subscribe: (listener) => {
      settingsListeners.add(listener);
      return () => settingsListeners.delete(listener);
    },
  };
  const controller = createModeController({ settings, storage: { getItem: () => null, setItem: () => undefined } });
  let notified = 0;
  const off = controller.deckSource.subscribe(() => (notified += 1));

  controller.set('extended');
  assert.equal(notified, 1, '切模式必须通知');

  settingsValue = { ...settingsValue, nativeDeck: true };
  for (const listener of settingsListeners) listener();
  assert.equal(notified, 2, '改设置也必须通知（走 settings.subscribe → publish）');

  off();
  controller.set('native');
  assert.equal(notified, 2, '退订后不再通知');
  controller.dispose();
});

/* 客户端开关桩：`nativeEnter` 决定原生模式要不要接管回车（存客户端，不走宿主设置）。 */
const enterOn = { get: () => ({ nativeDeck: false, nativeEnter: true }) };
const enterOff = { get: () => ({ nativeDeck: false, nativeEnter: false }) };

test('原生输入框的高级回车：只装 keydown，**不**打扩展标记、**不**写高度变量', () => {
  const log = [];
  const { doc, html, listeners } = makeDoc(makeEditor(log));
  const composer = createNativeComposer({ document: doc });
  // 原生模式 + 勾选客户端开关 nativeEnter（其余字段用默认）。
  assert.equal(composer.sync({ extendedEnter: 'newline' }, 'native', enterOn), true, '应生效');
  assert.equal(
    html.attrs['data-dsh-epe-extended'],
    undefined,
    '⚠️ 原生模式绝不能打扩展标记：那会把行号/底色/加高一起带进原生输入框',
  );
  assert.equal(html.style.values['--dsh-epe-extended-height'], undefined, '不该写高度变量');
  const keydown = listeners.find((item) => item.type === 'keydown');
  assert.ok(keydown !== undefined, '必须装 keydown');
  assert.equal(keydown.capture, true, '捕获阶段（要早于 Lexical）');

  let prevented = 0;
  keydown.fn({ ...plainEnter, preventDefault: () => (prevented += 1), stopImmediatePropagation: () => undefined });
  assert.equal(prevented, 1, '必须真的接管裸回车');
  assert.deepEqual(log, ['paragraph'], '真的插入了换行');
  composer.dispose();
});

test('原生输入框的高级回车：输入框晚于 sync 挂载时，会自动补装监听（用户实测踩过）', { timeout: 5000 }, async () => {
  // 真实场景：用户在设置页勾选开关 → 设置页替换了会话视图 → composer 不在 DOM 里
  // → 那次 apply() 找不到输入框、静默失败；回到会话后没有任何事件再触发 sync，
  // 于是「开关是开的、回车照旧发送」。
  const log = [];
  const editor = makeEditor(log);
  const docListeners = [];
  let mounted = false;
  const root = {
    __lexicalEditor: editor,
    contains: () => true,
  };
  const doc = {
    documentElement: makeElement(),
    addEventListener: (type, fn, capture) => docListeners.push({ type, fn, capture }),
    removeEventListener: () => undefined,
    // 关键：没挂载时找不到输入框，挂载后找得到。
    querySelector: (selector) => (selector === '[data-composer-input]' && mounted ? root : null),
  };
  const composer = createNativeComposer({ document: doc });
  const switches = { get: () => ({ nativeDeck: false, nativeEnter: true, extendedEnter: 'newline' }) };

  // ① 挂载前 sync：装不上，返回 false，但**必须**记住期望并开始重试。
  assert.equal(composer.sync({}, 'native', switches), false, '输入框不在 DOM 里时装不上');
  assert.equal(composer.isActive(), false);
  assert.equal(docListeners.length, 0, '装不上时不该有监听');

  // ② 稍后输入框挂载（用户回到会话）。
  mounted = true;
  await new Promise((resolve) => setTimeout(resolve, 350));

  // ③ 必须已经自己补装上，且 Enter 被拦截成换行。
  assert.equal(composer.isActive(), true, '⚠️ 输入框挂载后必须自动补装（否则回车会直接发送）');
  const enter = { ...plainEnter, preventDefault: () => log.push('prevented'), stopImmediatePropagation: () => undefined };
  for (const item of docListeners) if (item.type === 'keydown') item.fn(enter);
  assert.ok(log.includes('prevented'), 'Enter 必须被拦截');
  assert.ok(log.includes('paragraph'), 'Enter 必须插入换行');
  composer.dispose();
});

test('原生输入框的高级回车：没勾选时什么都不做（原生保持原生）', () => {
  const log = [];
  const { doc, listeners } = makeDoc(makeEditor(log));
  const composer = createNativeComposer({ document: doc });
  assert.equal(composer.sync({ extendedEnter: 'newline' }, 'native', enterOff), false);
  assert.equal(listeners.length, 0, '不装任何监听');
  assert.equal(composer.isActive(), false);
  composer.dispose();
});

test('从扩展模式切到「原生+高级回车」：标记摘掉、keydown 留着', () => {
  const log = [];
  const { doc, html, listeners } = makeDoc(makeEditor(log));
  const composer = createNativeComposer({ document: doc });
  composer.sync({ extendedEnter: 'newline', extendedHeight: 720 }, 'extended');
  assert.equal(html.attrs['data-dsh-epe-extended'], 'extended');
  assert.equal(html.style.values['--dsh-epe-extended-height'], '720px');

  // 切到原生，但仍勾着「原生输入框的高级回车」。
  assert.equal(composer.sync({ extendedEnter: 'newline' }, 'native', enterOn), true);
  assert.equal(html.attrs['data-dsh-epe-extended'], undefined, '扩展标记必须摘掉（行号/加高随之失效）');
  assert.equal(html.style.values['--dsh-epe-extended-height'], undefined, '高度变量必须摘掉');
  assert.equal(listeners.length, 1, '⚠️ keydown 必须留着（这正是这个开关的意义）');
  assert.equal(composer.isActive(), true);
  composer.dispose();
});

test('关闭「原生输入框的高级回车」：keydown 与标记都摘干净', () => {
  const log = [];
  const { doc, html, listeners } = makeDoc(makeEditor(log));
  const composer = createNativeComposer({ document: doc });
  composer.sync({ extendedEnter: 'newline' }, 'native', enterOn);
  assert.equal(listeners.length, 1);
  // 先升到扩展模式（打标记），再整体关掉 —— 标记不能因为「已 applied」而漏摘。
  composer.sync({ extendedEnter: 'newline', extendedHeight: 600 }, 'extended', enterOn);
  assert.equal(html.attrs['data-dsh-epe-extended'], 'extended');
  assert.equal(composer.sync({ extendedEnter: 'newline' }, 'native', enterOff), false);
  assert.equal(listeners.length, 0, 'keydown 摘掉');
  assert.equal(html.attrs['data-dsh-epe-extended'], undefined, '标记摘掉');
  assert.equal(html.style.values['--dsh-epe-extended-height'], undefined, '高度变量摘掉');
  assert.equal(composer.isActive(), false);
  composer.dispose();
});

/* ── 扩展输入框的 Enter 策略 ───────────────────────────────────────── */

test('resolveExtendedEnter：inherit 不拦截，newline 才吞裸回车', () => {
  const enter = { key: 'Enter', code: 'Enter', isComposing: false, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false };
  assert.equal(resolveExtendedEnter(enter, 'inherit'), null, '跟随 DSH：不拦截');
  assert.equal(resolveExtendedEnter(enter, 'newline'), 'newline', '改成换行');

  // 任何修饰键组合都保留宿主语义。
  for (const mod of ['shiftKey', 'ctrlKey', 'metaKey', 'altKey']) {
    assert.equal(
      resolveExtendedEnter({ ...enter, [mod]: true }, 'newline'),
      null,
      `${mod} + Enter 必须交还宿主`,
    );
  }

  // 输入法组合期间的回车是候选词确认，绝不拦截。
  assert.equal(resolveExtendedEnter({ ...enter, isComposing: true }, 'newline'), null);
  assert.equal(resolveExtendedEnter({ ...enter, keyCode: 229 }, 'newline'), null);

  // 非回车键。
  assert.equal(resolveExtendedEnter({ ...enter, key: 'a', code: 'KeyA' }, 'newline'), null);
  // 小键盘回车同样识别。
  assert.equal(resolveExtendedEnter({ ...enter, key: 'Enter', code: 'NumpadEnter' }, 'newline'), 'newline');
  // 空输入。
  assert.equal(resolveExtendedEnter(null, 'newline'), null);
  // 非法策略收敛到 inherit。
  assert.equal(resolveExtendedEnter(enter, 'bogus'), null);
});

test('normalizeExtendedEnter 与 clampExtendedHeight 收敛非法值', () => {
  assert.equal(normalizeExtendedEnter('newline'), 'newline');
  assert.equal(normalizeExtendedEnter('inherit'), 'inherit');
  assert.equal(normalizeExtendedEnter('send'), 'inherit', '不支持的策略退回 inherit');
  assert.equal(normalizeExtendedEnter(undefined), 'inherit');

  assert.equal(clampExtendedHeight(640), 640);
  assert.equal(clampExtendedHeight(100), 240, '低于下限夹到下限');
  assert.equal(clampExtendedHeight(99999), 2000, '高于上限夹到上限');
  assert.equal(clampExtendedHeight('abc'), 640, '非数字退回默认');
});

test('defaultSettings 覆盖全部新旧字段', () => {
  const defaults = defaultSettings();
  assert.deepEqual(Object.keys(defaults).sort(), [
    'browseWithReader',
    'dictate',
    'dir',
    'editorFirst',
    'editorFontSize',
    'enterMode',
    'extendedEnter',
    'extendedHeight',
    'keySize',
    'modeEditor',
    'modeExtended',
    'nativeDeck',
    'nativeEnter',
    'panelHeight',
    'shortcutEnabled',
    'storage',
  ]);
  assert.equal(defaults.modeEditor, true);
  assert.equal(defaults.modeExtended, true);
  assert.equal(defaults.editorFirst, true);
  assert.equal(defaults.extendedEnter, 'inherit');
  assert.equal(defaults.extendedHeight, 640);
  // 原生模式的两个增强默认**关**：不勾选时原生输入框保持原样。
  assert.equal(defaults.nativeDeck, false);
  assert.equal(defaults.nativeEnter, false);
  // 快捷键默认**开**：用户没主动关就照旧生效。
  assert.equal(defaults.shortcutEnabled, true);
});

/* ── 扩展输入框：DOM 探测与 Lexical 接入 ───────────────────────────── */

test('扩展输入框：只在精确的宿主锚点上工作，找不到就返回 null', () => {
  const seat = { tag: 'seat' };
  const editor = { tag: 'editor' };
  const doc = {
    querySelector: (selector) => {
      if (selector === '[data-composer-seat]') return seat;
      if (selector === '[data-composer-input]') return editor;
      return null;
    },
  };
  assert.equal(findComposerSeat(doc), seat);
  assert.equal(findComposerEditor(doc), editor);

  // 坏文档一律 null，绝不抛。
  for (const bad of [undefined, null, {}, { querySelector: () => { throw new Error('x'); } }]) {
    assert.equal(findComposerSeat(bad), null);
    assert.equal(findComposerEditor(bad), null);
  }
});

test('editorOf 只在拿到可用的 Lexical 实例时才返回它', () => {
  assert.equal(editorOf(null), null);
  assert.equal(editorOf({}), null, '没有 __lexicalEditor');
  assert.equal(editorOf({ __lexicalEditor: null }), null, '内核卸载时会置回 null');
  assert.equal(editorOf({ __lexicalEditor: {} }), null, '没有 update 方法');
  const real = { update: () => undefined };
  assert.equal(editorOf({ __lexicalEditor: real }), real);
});

test('insertNewline 在 update 内取选区并调 insertParagraph；失败返回 false', () => {
  let calls = 0;
  let sawInsideUpdate = false;
  const selection = {
    insertParagraph: () => {
      calls += 1;
      sawInsideUpdate = inUpdate;
    },
  };
  let inUpdate = false;
  const editor = {
    getEditorState: () => ({ _selection: selection }),
    update: (fn) => {
      inUpdate = true;
      try {
        fn();
      } finally {
        inUpdate = false;
      }
    },
  };
  assert.equal(insertNewline(editor), true);
  assert.equal(calls, 1);
  assert.equal(sawInsideUpdate, true, '选区必须在 update 内部读取');

  // 没有选区 → false（调用方据此不吞这次回车）。
  assert.equal(insertNewline({ update: (fn) => fn(), getEditorState: () => ({ _selection: null }) }), false);
  // 选区没有 insertParagraph → false。
  assert.equal(insertNewline({ update: (fn) => fn(), getEditorState: () => ({ _selection: {} }) }), false);
  // update 抛错 → false，不外抛。
  assert.equal(
    insertNewline({
      update: () => {
        throw new Error('boom');
      },
      getEditorState: () => ({ _selection: selection }),
    }),
    false,
  );
});

test('扩展输入框高度映射到 CSS 长度', () => {
  assert.equal(composerHeightFor({ extendedHeight: 720 }), '720px');
  assert.equal(composerHeightFor({ extendedHeight: 99999 }), '2000px');
  assert.equal(composerHeightFor({}), '640px');
});

test('扩展输入框的 CSS：min-height 给编辑区、max-height 给滚动区（加错层＝死区）', () => {
  // ⚠️ 这条测试是冲着**用户 2026-10-16 报的死区**来的，别把它放宽。
  //
  // 内核 DOM：.scroll[data-input-scroll] > .grow > .input[data-composer-input]
  // 内核 `onCardMouseDown` 里有一句 `if (scrollRef.current?.contains(target)) return;`
  // —— 落在滚动区内、又不在编辑区上的点击，宿主**故意不处理**（它假定滚动区里
  // 都是编辑区）。所以若把 min-height 加在滚动容器上：
  //   容器被撑高，编辑区仍是 36px，中间那一大片点不动，也没法聚焦 → 死区。
  // 正确做法：min-height 给编辑区，让编辑区自己就有那么高，两者同高、死区为零。
  const rules = EXTENDED_CSS;

  // ① max-height 必须落在滚动容器上（内容超长时在那里滚动）。
  const scrollRule = rules.match(/\[data-input-scroll\]\{([^}]*)\}/)?.[1] ?? '';
  assert.match(scrollRule, /max-height:var\(--dsh-epe-extended-height/, '滚动区要有 max-height');
  assert.ok(
    !/min-height/.test(scrollRule),
    '滚动区**不得**有 min-height：那会把容器撑高而编辑区仍是 36px，下面全是点不动的死区',
  );

  // ② min-height 必须落在 contenteditable 编辑区上。
  const inputRule = rules.match(/\[data-composer-input\]\{([^}]*)\}/)?.[1] ?? '';
  assert.ok(inputRule !== '', '必须有一条命中 [data-composer-input] 的规则');
  assert.match(
    inputRule,
    /min-height:var\(--dsh-epe-extended-height/,
    'min-height 必须给编辑区（[data-composer-input]），否则「切过去就展开」会留下死区',
  );

  // ③ 标记挂在 <html> 上：seat 会被宿主重挂，挂在 seat 上会丢。
  assert.ok(rules.startsWith(`html[${MARK_ATTR}]`), '选择器必须挂在 html 的标记上');
  // ④ 不允许 !important：靠特异性 (0,2,1) 胜过内核 .scroll 的 (0,1,0)。
  assert.ok(!rules.includes('!important'), '不该用 !important');
});

test('扩展输入框控制器：按策略吞回车、拿不到编辑器时不吞', async () => {

  // ── 需要改成换行时：preventDefault + 真的插入段落 ────────────────────
  {
    const log = [];
    const { doc, html, listeners } = makeDoc(makeEditor(log));
    const composer = createNativeComposer({ document: doc });
    assert.equal(composer.sync({ extendedEnter: 'newline', extendedHeight: 720 }, 'extended'), true, '已生效');
    assert.equal(html.style.values['--dsh-epe-extended-height'], '720px', '高度变量写在 <html> 上');
    assert.equal(html.attrs['data-dsh-epe-extended'], 'extended', '标记挂在 <html> 上（seat 会被重挂）');
    // 这个变量同时喂给 CSS 的 min-height 与 max-height —— min 才是「切过去就展开」。
    assert.match(EXTENDED_CSS, /min-height:var\(--dsh-epe-extended-height/, 'CSS 用它当 min-height');
    assert.match(EXTENDED_CSS, /max-height:var\(--dsh-epe-extended-height/, 'CSS 也用它当 max-height');
    const keydown = listeners.find((item) => item.type === 'keydown');
    assert.ok(keydown !== undefined, '装了 keydown 监听');
    assert.equal(keydown.capture, true, '必须是捕获阶段（要早于 Lexical 的冒泡监听器）');

    let prevented = 0;
    let stopped = 0;
    keydown.fn({ ...plainEnter, preventDefault: () => (prevented += 1), stopImmediatePropagation: () => (stopped += 1) });
    assert.equal(prevented, 1, '必须 preventDefault');
    assert.equal(stopped, 1, '必须 stopImmediatePropagation（不能只 stopPropagation）');
    assert.deepEqual(log, ['paragraph'], '真的插入了换行');
    composer.dispose();
  }

  // ── inherit 策略：什么都不做，交还宿主 ──────────────────────────────
  {
    const log = [];
    const { doc, listeners } = makeDoc(makeEditor(log));
    const composer = createNativeComposer({ document: doc });
    composer.sync({ extendedEnter: 'inherit', extendedHeight: 720 }, 'extended');
    const keydown = listeners.find((item) => item.type === 'keydown');
    let prevented = 0;
    keydown.fn({ ...plainEnter, preventDefault: () => (prevented += 1), stopImmediatePropagation: () => undefined });
    assert.equal(prevented, 0, '不拦截');
    assert.deepEqual(log, [], '不插换行');
    composer.dispose();
  }

  // ── 拿不到编辑器：**不吞**这次回车（否则输入框变砖）─────────────────
  {
    const { doc, listeners } = makeDoc(null);
    const degradations = [];
    const composer = createNativeComposer({ document: doc, onDegrade: (where, msg) => degradations.push([where, msg]) });
    composer.sync({ extendedEnter: 'newline', extendedHeight: 720 }, 'extended');
    const keydown = listeners.find((item) => item.type === 'keydown');
    let prevented = 0;
    keydown.fn({ ...plainEnter, preventDefault: () => (prevented += 1), stopImmediatePropagation: () => undefined });
    assert.equal(prevented, 0, '拿不到编辑器时必须放行（不能吃掉用户的回车）');
    assert.equal(degradations.length, 1, '记一条降级');
    assert.match(degradations[0][1], /unavailable/);
    composer.dispose();
  }

  // ── 事件落在输入框之外：不碰 ────────────────────────────────────────
  {
    const log = [];
    const { doc, listeners } = makeDoc(makeEditor(log));
    const composer = createNativeComposer({ document: doc });
    composer.sync({ extendedEnter: 'newline', extendedHeight: 720 }, 'extended');
    const keydown = listeners.find((item) => item.type === 'keydown');
    let prevented = 0;
    keydown.fn({ ...plainEnter, target: { inside: false }, preventDefault: () => (prevented += 1), stopImmediatePropagation: () => undefined });
    assert.equal(prevented, 0, '输入框外的回车不归本插件管');
    assert.deepEqual(log, []);
    composer.dispose();
  }

  // ── 切离 extended：变量与监听都要摘干净 ─────────────────────────────
  {
    const log = [];
    const { doc, html, listeners } = makeDoc(makeEditor(log));
    const composer = createNativeComposer({ document: doc });
    composer.sync({ extendedEnter: 'newline', extendedHeight: 720 }, 'extended');
    assert.equal(composer.isActive(), true);
    composer.sync({ extendedEnter: 'newline', extendedHeight: 720 }, 'native');
    assert.equal(composer.isActive(), false, '切离后不再生效');
    assert.equal(html.style.values['--dsh-epe-extended-height'], undefined, '高度变量已摘掉');
    assert.equal(html.attrs['data-dsh-epe-extended'], undefined, '标记属性已摘掉');
    assert.equal(listeners.length, 0, '监听已摘掉');
    composer.dispose();
  }
});

test('文案：中英键集一致，且源码引用的 key 都在字典里', async () => {
  const { readFile, readdir } = await import('node:fs/promises');
  const { createLocale } = await import('../src/locale.js');
  const here = dirname(fileURLToPath(import.meta.url));
  const dict = createLocale();
  const zh = new Set(Object.keys(dict.zh));
  const en = new Set(Object.keys(dict.en));

  // ① 中英必须一一对应（少一个就会在切换语言时露出裸 key）。
  assert.deepEqual([...zh].filter((k) => !en.has(k)), [], '有 key 只在中文里');
  assert.deepEqual([...en].filter((k) => !zh.has(k)), [], '有 key 只在英文里');

  // ② 源码里静态引用的每个 key 都必须在字典里。
  //    只扫 `t('...')` / `t?.('...')`，不扫 `ctx.get?.(...)`：后者的参数是服务名。
  const files = (await readdir(join(here, '..', 'src'))).filter((f) => f.endsWith('.js'));
  const missing = [];
  for (const file of files) {
    const code = await readFile(join(here, '..', 'src', file), 'utf8');
    for (const match of code.matchAll(/\bt\??\.\(\s*'([a-z][\w.]*)'/g)) {
      if (!zh.has(match[1])) missing.push(`${file}: ${match[1]}`);
    }
  }
  assert.deepEqual(missing, [], '源码引用了字典里没有的 key');

  // ③ 模板拼接出来的 key（设置里的枚举项）也逐个核对。
  const dynamic = [
    'settings.storage.workspace',
    'settings.storage.browser',
    'settings.storage.none',
    'settings.enterMode.newline',
    'settings.enterMode.send',
    'settings.extendedEnter.inherit',
    'settings.extendedEnter.newline',
    'trigger.mode.native',
    'trigger.mode.editor',
    'trigger.mode.extended',
  ];
  assert.deepEqual(dynamic.filter((k) => !zh.has(k)), [], '动态拼接的 key 缺失');
});

/* ── 编辑操作：符号包裹 / 行前缀 / 插入 ─────────────────────────────
 * 用户 2026-10-16 明确要求：「选择一段文字后，点击成对符号按键，不是把框选的
 * 文字改成符号，而是自动把文字框在符号内」。错成"替换"会**删掉用户的内容**，
 * 是数据损失型缺陷，所以每条都钉死。
 */

test('成对符号：选中文字后被**框住**，而不是被替换', () => {
  // 用户原文的场景：选中 abc，点「()」→ 得到 (abc)，abc 一个字都不能少。
  assert.deepEqual(wrapSelection('abc', 0, 3, '(', ')'), {
    text: '(abc)', selStart: 1, selEnd: 4,
  });
  // 中间一段。
  assert.deepEqual(wrapSelection('hello world', 6, 11, '「', '」'), {
    text: 'hello 「world」', selStart: 7, selEnd: 12,
  });
  // 加粗 **：文字必须还在里面。
  assert.deepEqual(wrapSelection('bold', 0, 4, '**', '**'), {
    text: '**bold**', selStart: 2, selEnd: 6,
  });
  // 关键否证：绝不能出现「把选中文字换成符号」的结果。
  const result = wrapSelection('abc', 0, 3, '(', ')');
  assert.ok(result.text.includes('abc'), 'abc 必须仍在结果里（不能被符号替换掉）');
  assert.notEqual(result.text, '()', '不得把框选的文字改成符号');
});

test('成对符号：没有选中时插入一对并把光标放在中间', () => {
  assert.deepEqual(wrapSelection('ab', 1, 1, '(', ')'), {
    text: 'a()b', selStart: 2, selEnd: 2,
  });
  // 空文档。
  assert.deepEqual(wrapSelection('', 0, 0, '`', '`'), {
    text: '``', selStart: 1, selEnd: 1,
  });
});

test('成对符号：包裹后仍选中内层文字（方便继续叠加）', () => {
  const once = wrapSelection('abc', 0, 3, '(', ')');
  assert.equal(once.text.slice(once.selStart, once.selEnd), 'abc', '恢复的选区应正好是原文字');
  // 再包一层（比如再点一次加粗）仍然作用于同一段文字。
  const twice = wrapSelection(once.text, once.selStart, once.selEnd, '**', '**');
  assert.equal(twice.text, '(**abc**)');
});

test('成对符号：非法/反序选区被收敛，不产出错内容', () => {
  // 反序（某些输入法会给这种）。
  assert.deepEqual(wrapSelection('abc', 3, 1, '(', ')'), {
    text: 'a(bc)', selStart: 2, selEnd: 4,
  });
  // 越界。
  assert.equal(wrapSelection('abc', 99, 99, '(', ')').text, 'abc()');
  assert.equal(wrapSelection('abc', -5, 1, '[', ']').text, '[a]bc');
  // 非数字。
  assert.equal(wrapSelection('abc', undefined, undefined, '<', '>').text, 'abc<>');
  // 空 text 不炸。
  assert.equal(wrapSelection(undefined, 0, 0, '(', ')').text, '()');
});

test('行前缀：给选区覆盖的每一行加前缀', () => {
  // 单行中部。
  assert.deepEqual(prefixLines('hello', 2, 2, '# '), {
    text: '# hello', selStart: 0, selEnd: 7,
  });
  // 多行：每行都加。
  assert.equal(prefixLines('a\nb\nc', 0, 5, '- ').text, '- a\n- b\n- c');
  // 只覆盖第 2 行时，第 1/3 行不受影响。
  assert.equal(prefixLines('a\nb\nc', 2, 3, '> ').text, 'a\n> b\nc');
  // 选区末尾正好落在换行符上：**不得**多给下一行加一次（常见 off-by-one）。
  assert.equal(prefixLines('a\nb', 0, 2, '- ').text, '- a\nb');
});

test('普通插入：不删除已选文字（避免误点毁内容）', () => {
  // 用户选了一段，点 ---：插入而不替换，内容保留。
  const result = insertPlain('abc', 0, 3, '---');
  assert.equal(result.text, '---abc', '选中内容必须保留');
  assert.ok(result.text.includes('abc'));
  // 光标处插入。
  assert.equal(insertPlain('ab', 1, 1, 'X').text, 'aXb');
});

test('applySymbol 按 kind 正确派发', () => {
  const byKey = (k) => SYMBOLS.find((s) => s.key === k);
  assert.equal(applySymbol('abc', 0, 3, byKey('paren')).text, '(abc)');
  assert.equal(applySymbol('abc', 0, 3, byKey('bold')).text, '**abc**');
  assert.equal(applySymbol('abc', 0, 0, byKey('heading')).text, '# abc');
  assert.equal(applySymbol('abc', 1, 1, byKey('divider')).text, 'a---bc');
  // 每个符号都能安全作用（不抛、不丢内容）。
  for (const symbol of SYMBOLS) {
    const out = applySymbol('keep me', 0, 4, symbol);
    assert.ok(typeof out.text === 'string', `${symbol.key} 应产出字符串`);
    assert.ok(out.text.includes('keep'), `${symbol.key} 不得丢掉已选文字`);
    assert.ok(out.selStart >= 0 && out.selEnd >= out.selStart, `${symbol.key} 的选区不合法`);
  }
});

test('符号表：key 唯一、必备符号齐全', () => {
  const keys = SYMBOLS.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length, 'key 必须唯一（用作 React key 与文案 key）');
  for (const required of ['paren', 'bracket', 'brace', 'quote', 'backtick', 'corner', 'bookTitle', 'bold', 'codeBlock', 'heading', 'bullet', 'quoteBlock', 'link', 'divider']) {
    assert.ok(keys.includes(required), `缺少符号：${required}`);
  }
});

test('交替行：偶数行不染、奇数行染', () => {
  assert.equal(isAlternateLine(0), false);
  assert.equal(isAlternateLine(1), true);
  assert.equal(isAlternateLine(2), false);
  assert.equal(isAlternateLine(3), true);
});
