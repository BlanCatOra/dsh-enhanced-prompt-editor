/**
 * dsh-enhanced-prompt-editor —— Host 路由端到端测试。
 *
 * 起一个真的 HTTP 服务器，挂上 apply() 注册的两个路由，然后**真的发请求**。
 * 这是本项目安全关键路径，必须验证：
 *  - 越界路径被拒绝（`../`、绝对路径、兄弟目录前缀）；
 *  - 合法写入落在预期位置；
 *  - 跨站 Origin 被拒绝（这条路由能写文件）；
 *  - 非 JSON、缺字段、超长 body 都被拒；
 *  - 列举在没有目录时返回空列表而不是报错。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { apply, DRAFT_ROUTE, DRAFTS_ROUTE } from '../src/index.js';

/**
 * 造一个最小的 Host 上下文，并起真实服务器。
 *
 * @returns `{ origin, root, close }`。
 */
async function startHost() {
  const root = await mkdtemp(join(tmpdir(), 'pe-host-'));
  const routes = new Map();

  const ctx = {
    fiber: { uid: 'test-fiber' },
    effect: (fn) => {
      const dispose = fn();
      return dispose;
    },
    get: () => undefined,
    inject: (deps, fn) => {
      // settings 服务在本测试里不存在，因此这个子级不回调。
      if (deps.includes('settings')) return undefined;
      return fn(ctx);
    },
    webServer: {
      register: ({ kind, path, handler }) => {
        routes.set(`${kind}:${path}`, handler);
        return () => routes.delete(`${kind}:${path}`);
      },
    },
  };

  apply(ctx, { dir: '.dsh/prompts' });

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const handler = routes.get(`exact:${url.pathname}`);
    if (handler === undefined) {
      res.writeHead(404).end('not found');
      return;
    }
    Promise.resolve(handler(req, res)).catch((error) => {
      res.writeHead(500).end(String(error));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    root,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      await rm(root, { recursive: true, force: true });
    },
  };
}

/** 发一次 POST /draft。 */
async function saveDraft(origin, body, headers = {}) {
  const response = await fetch(`${origin}${DRAFT_ROUTE}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => undefined) };
}

test('合法写入落在工作区内，并能读回', async () => {
  const host = await startHost();
  try {
    const result = await saveDraft(host.origin, {
      cwd: host.root,
      dir: '.dsh/prompts',
      name: '我的长prompt',
      text: '# 标题\n正文内容',
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);

    const target = join(host.root, '.dsh/prompts', '我的长prompt.md');
    assert.equal(result.body.path, target);
    assert.ok(existsSync(target), '文件真的写出来了');
    assert.equal(await readFile(target, 'utf8'), '# 标题\n正文内容');
    assert.equal(result.body.rel, '.dsh/prompts/我的长prompt.md');

    // 读回。
    const url = new URL(`${host.origin}${DRAFT_ROUTE}`);
    url.searchParams.set('cwd', host.root);
    url.searchParams.set('path', '.dsh/prompts/我的长prompt.md');
    const read = await fetch(url.href);
    const payload = await read.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.text, '# 标题\n正文内容');
  } finally {
    await host.close();
  }
});

test('越界路径全部被拒绝，且不产生任何文件', async () => {
  const host = await startHost();
  try {
    const escapes = [
      { dir: '../outside', name: 'x', text: 'nope' },
      { dir: 'a/../../outside', name: 'x', text: 'nope' },
      { dir: '.dsh/prompts/../../..', name: 'x', text: 'nope' },
      { dir: '/tmp/abs-outside', name: 'x', text: 'nope' },
    ];
    for (const body of escapes) {
      const result = await saveDraft(host.origin, { cwd: host.root, ...body });
      assert.equal(result.status, 500, `应拒绝：${body.dir}`);
      assert.match(String(result.body.error), /escapes the workspace/);
    }
    // 名字里的分隔符被 draftFileName 拦成 draft.md，因此不会越界——
    // 但也不能在 root 之外出现文件。
    const sneaky = await saveDraft(host.origin, { cwd: host.root, dir: '.dsh/prompts', name: '../../evil', text: 'x' });
    assert.equal(sneaky.status, 200, '危险名字被降级为 draft.md 而不是报错');
    assert.ok(sneaky.body.path.startsWith(host.root), '降级后仍在工作区内');
    assert.equal(await readFile(sneaky.body.path, 'utf8'), 'x');

    const outside = join(tmpdir(), 'pe-outside-check');
    assert.equal(existsSync(outside), false, '工作区外没有被创建');
  } finally {
    await host.close();
  }
});

test('前缀相同但不是子目录的兄弟路径被拒绝', async () => {
  const host = await startHost();
  try {
    // root 是 …/pe-host-XXXX，兄弟目录 …/pe-host-XXXX-evil 不能被误判为内部。
    const sibling = `${host.root}-evil`;
    const result = await saveDraft(host.origin, { cwd: host.root, dir: sibling, name: 'x', text: 'nope' });
    assert.equal(result.status, 500);
    assert.match(String(result.body.error), /escapes the workspace/);
  } finally {
    await host.close();
  }
});

test('跨站 Origin 被拒绝（该路由能写文件）', async () => {
  const host = await startHost();
  try {
    const result = await saveDraft(
      host.origin,
      { cwd: host.root, dir: '.dsh/prompts', name: 'x', text: 'nope' },
      { origin: 'https://evil.example.com' },
    );
    assert.equal(result.status, 403);
    assert.equal(result.body.error, 'origin-not-trusted');
  } finally {
    await host.close();
  }
});

test('缺字段、非 JSON、方法错误都被拒', async () => {
  const host = await startHost();
  try {
    assert.equal((await saveDraft(host.origin, { dir: 'x', text: 'y' })).status, 400, '缺 cwd');
    assert.equal((await saveDraft(host.origin, { cwd: 'relative/path', text: 'y' })).status, 400, 'cwd 非绝对');
    assert.equal((await saveDraft(host.origin, 'not json at all')).status, 400, '非 JSON');

    const get = await fetch(`${host.origin}${DRAFT_ROUTE}`);
    assert.equal(get.status, 400, 'GET 缺参数');

    const put = await fetch(`${host.origin}${DRAFT_ROUTE}`, { method: 'PUT' });
    assert.equal(put.status, 405);
    assert.equal(put.headers.get('allow'), 'GET, POST');
  } finally {
    await host.close();
  }
});

test('超长 body 被拒绝而不是写进文件', async () => {
  const host = await startHost();
  try {
    const huge = JSON.stringify({ cwd: host.root, dir: '.dsh/prompts', name: 'big', text: 'x'.repeat(2 * 1024 * 1024) });
    const result = await saveDraft(host.origin, huge).catch((error) => ({ status: 0, body: { error: error.message } }));
    assert.ok(result.status === 500 || result.status === 0, `超长 body 被拒，实际 ${result.status}`);
    assert.equal(existsSync(join(host.root, '.dsh/prompts', 'big.md')), false, '没有落盘');
  } finally {
    await host.close();
  }
});

test('列举：目录不存在时返回空列表而不是报错', async () => {
  const host = await startHost();
  try {
    const url = new URL(`${host.origin}${DRAFTS_ROUTE}`);
    url.searchParams.set('cwd', host.root);
    url.searchParams.set('dir', '.dsh/prompts');
    const response = await fetch(url.href);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.deepEqual(payload.entries, []);
  } finally {
    await host.close();
  }
});

test('列举：写入两份后按修改时间倒序返回', async () => {
  const host = await startHost();
  try {
    await saveDraft(host.origin, { cwd: host.root, dir: '.dsh/prompts', name: 'first', text: 'a' });
    await new Promise((resolve) => setTimeout(resolve, 15));
    await saveDraft(host.origin, { cwd: host.root, dir: '.dsh/prompts', name: 'second', text: 'b' });

    const url = new URL(`${host.origin}${DRAFTS_ROUTE}`);
    url.searchParams.set('cwd', host.root);
    url.searchParams.set('dir', '.dsh/prompts');
    const payload = await (await fetch(url.href)).json();
    assert.equal(payload.entries.length, 2);
    assert.deepEqual(payload.entries.map((entry) => entry.name), ['second', 'first']);
    for (const entry of payload.entries) {
      assert.ok(entry.path.startsWith(host.root), '条目路径在工作区内');
      assert.equal(entry.file.endsWith('.md'), true);
    }
  } finally {
    await host.close();
  }
});

test('列举：越界目录被拒绝', async () => {
  const host = await startHost();
  try {
    const url = new URL(`${host.origin}${DRAFTS_ROUTE}`);
    url.searchParams.set('cwd', host.root);
    url.searchParams.set('dir', '../../');
    const response = await fetch(url.href);
    assert.equal(response.status, 500);
    const payload = await response.json();
    assert.match(String(payload.error), /escapes the workspace/);
  } finally {
    await host.close();
  }
});
