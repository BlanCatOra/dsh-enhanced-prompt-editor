/**
 * 面向 agent 的仓库规范自检。
 *
 * ## 规范出处
 *
 * `~/Projects/dsh-plugin-standards/docs/AGENT-FACING-STANDARDS.md`（本机另有软链
 * `~/Projects/dsh-plugin/docs/AGENT-FACING-STANDARDS.md`）。
 * 用户 2026-10-17 定的规矩：**每个会公开的仓库必须有 `AGENTS.md` + `llms.txt`，
 * 且 README 正文靠前处要提示 agent 先看这两个文件。缺一个都算未完成。**
 *
 * ## 为什么把「规范」写成测试
 *
 * 只写在文档里就是纸面要求：忘了没人拦，补了没验证。写成测试后 `npm test`
 * 一跑就知道缺没缺 —— 和本仓库其它「静默失效」守卫同一个思路。
 *
 * ## 断言什么
 *
 * 1. 两个文件都在且有实质内容（不是空文件占位）；
 * 2. 结构合规：`llms.txt` 有唯一 H1 + blockquote 摘要 + 分节链接；
 *    `AGENTS.md` 覆盖规范 §2.2 的 6 个主题，且带实测依据；
 * 3. README（**所有语言版本**）都在正文前 1/3 指路，且链接指向的文件真实存在；
 * 4. 脱敏：这些文件会随仓库公开，不得含本机私有信息。
 *
 * @module dsh-enhanced-prompt-editor/test/agent-facing
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 读仓库根下的文件（不存在则返回 undefined）。 */
async function readIfExists(name) {
  try {
    return await readFile(join(ROOT, name), 'utf8');
  } catch {
    return undefined;
  }
}

const AGENTS = await readIfExists('AGENTS.md');
const LLMS = await readIfExists('llms.txt');
const READMES = {};
for (const name of ['README.md', 'README.en.md']) READMES[name] = await readIfExists(name);

test('仓库根必须有 AGENTS.md，且覆盖规范要求的 6 个主题', () => {
  assert.ok(AGENTS !== undefined, '缺少 AGENTS.md（规范：面向 agent 的仓库必须有）');
  assert.ok(
    AGENTS.trim().length > 500,
    `AGENTS.md 内容过少（${AGENTS.trim().length} 字符），像是占位文件`,
  );

  // 规范 §2.2 的 6 块。用中/英关键词匹配，容忍措辞差异但要求主题在场。
  const required = [
    { key: '验证命令', patterns: [/验证/, /npm test/] },
    { key: '构建产物', patterns: [/产物/, /lib\/client\.js/] },
    { key: '硬性约束', patterns: [/硬性约束/, /seed/i] },
    { key: '禁区', patterns: [/禁区|不许动|不要动/] },
    { key: '提交规范', patterns: [/提交/, /Generated-by/] },
    { key: '本仓库特有的坑', patterns: [/坑|踩过|实测/] },
  ];
  const missing = required
    .filter(({ patterns }) => !patterns.every((re) => re.test(AGENTS)))
    .map(({ key }) => key);
  assert.deepEqual(missing, [], `AGENTS.md 缺少这些必需主题：${missing.join('、')}`);
});

test('AGENTS.md 每条「坑」都要有实测依据（不得是空泛建议）', () => {
  // 规范 §2.3：只写踩过的坑，且带证据。
  assert.match(
    AGENTS,
    /实测|踩过|曾经|已验证/,
    'AGENTS.md 里没有任何「实测/踩过」类证据标记 → 可能写成了通用建议，不符合规范 §2.3',
  );
});

test('仓库根必须有 llms.txt，且结构符合规范（H1 + 摘要 + 分节链接）', () => {
  assert.ok(LLMS !== undefined, '缺少 llms.txt（规范：面向 agent 的仓库必须有）');

  const lines = LLMS.split('\n');
  const h1 = lines.filter((line) => /^# /.test(line));
  assert.equal(h1.length, 1, `llms.txt 必须恰好有一个 H1（项目名），实际 ${h1.length} 个`);
  assert.match(h1[0], /dsh-enhanced-prompt-editor/, 'llms.txt 的 H1 应为项目名');

  assert.match(LLMS, /^> /m, 'llms.txt 缺少 blockquote 摘要（规范 §3.2：H1 后紧跟 1-3 句摘要）');

  const h2Count = lines.filter((line) => /^## /.test(line)).length;
  assert.ok(h2Count >= 1, 'llms.txt 至少要有一个 ## 分节');

  const links = [...LLMS.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1]);
  assert.ok(links.length >= 2, `llms.txt 的分节应是指向文档的链接列表，实际只有 ${links.length} 条`);
  assert.ok(
    links.some((link) => /\.md(#|$)/.test(link)),
    'llms.txt 至少应有一条指向本地 markdown 文档的链接',
  );

  // 规范 §3.2：文件本身要小到能塞进上下文。
  assert.ok(LLMS.length < 8000, `llms.txt 过长（${LLMS.length} 字符），规范要求能塞进上下文`);
});

test('README 的所有语言版本都要指路（AGENTS.md + llms.txt）', () => {
  const names = Object.keys(READMES);
  assert.ok(names.length >= 1, '一个 README 都没找到');
  for (const [name, content] of Object.entries(READMES)) {
    assert.ok(content !== undefined, `${name} 不存在`);
    assert.match(content, /AGENTS\.md/, `${name} 正文没有提到 AGENTS.md → agent 不会去读它`);
    assert.match(content, /llms\.txt/, `${name} 正文没有提到 llms.txt → agent 不会去读它`);
  }
});

test('README 的指路必须在正文靠前处（不能只放文件末尾）', () => {
  // 规范 §4.1：人和 agent 都常只读前半屏。
  for (const [name, content] of Object.entries(READMES)) {
    if (content === undefined) continue;
    const idx = content.indexOf('AGENTS.md');
    assert.ok(idx >= 0, `${name} 未提到 AGENTS.md`);
    const ratio = idx / content.length;
    assert.ok(
      ratio < 0.34,
      `${name} 的 AGENTS.md 指路出现在 ${(ratio * 100).toFixed(0)}% 处，太靠后（要求前 1/3）`,
    );
  }
});

test('指路引用的文件真实存在（相对链接不能写错）', async () => {
  for (const [name, content] of Object.entries(READMES)) {
    if (content === undefined) continue;
    for (const target of ['AGENTS.md', 'llms.txt']) {
      if (!content.includes(target)) continue;
      const exists = await stat(join(ROOT, target)).then(() => true).catch(() => false);
      assert.ok(exists, `${name} 指向 ./${target}，但该文件不存在`);
    }
  }
});

test('README 不得写死「有多少项测试」这类会自动过期的数字', () => {
  // 实测踩过（2026-10-17）：README 里写着「全部 87 项测试」，而当时实际已是
  // 183 项 —— 写的时候是对的，加测试后就自动过期，且**没有任何测试守它**，
  // 属于典型的静默失效型不实信息。
  //
  // 约定：README 只说「全部测试」，不写具体数字。想写数量就改成链接到
  // test/ 目录，让读者自己看当前值。
  const pattern = /(\d+)\s*(?:项测试|tests\b)/g;
  const hits = [];
  for (const [name, content] of Object.entries(READMES)) {
    if (content === undefined) continue;
    for (const match of content.matchAll(pattern)) {
      // 允许 "1 tests" 这种明显是别的语境吗？不允许 —— 一律要求改成不带数字。
      hits.push(`${name}: 「${match[0].trim()}」`);
    }
  }
  assert.deepEqual(
    hits,
    [],
    `README 里出现了会过期的测试数量（请改成「全部测试」或链到 test/ 目录）：\n${hits.join('\n')}`,
  );
});

test('README 里链接的本地文档必须真实存在（含长 prompt 示例）', async () => {
  // 实测踩过：README 里引用 `docs/demo-long-prompt.md`，而那时 docs/ 目录
  // 根本不存在 —— 链接点了 404，且没有任何测试守它。
  for (const [name, content] of Object.entries(READMES)) {
    if (content === undefined) continue;
    const links = [...content.matchAll(/\]\((\.?\/?(?:docs|test)\/[^)\s#]+)\)/g)].map((m) => m[1]);
    for (const link of links) {
      const rel = link.replace(/^\.\//, '');
      const exists = await stat(join(ROOT, rel)).then(() => true).catch(() => false);
      assert.ok(exists, `${name} 链接到 ${link}，但该文件不存在（点了会 404）`);
    }
  }
});

test('README 里的截图必须真实存在，且体积合理（不能把仓库撑爆）', async () => {
  // 截图是公开仓库的常见事故点：路径写错 → 图裂；原图直传 → 仓库体积暴涨。
  for (const [name, content] of Object.entries(READMES)) {
    if (content === undefined) continue;
    const images = [...content.matchAll(/!\[[^\]]*\]\(([^)]+\.(?:png|jpe?g|webp))\)/gi)].map((m) => m[1]);
    for (const src of images) {
      const rel = src.replace(/^\.\//, '');
      const info = await stat(join(ROOT, rel)).then((st) => st).catch(() => undefined);
      assert.ok(info !== undefined, `${name} 引用了 ${src}，但文件不存在（图会裂）`);
      assert.ok(
        info.size <= 400 * 1024,
        `${name} 引用的 ${src} 有 ${Math.round(info.size / 1024)}KB，超过 400KB 上限（请先压缩）`,
      );
    }
  }
});

test('发布清单 docs/RELEASING.md 必须存在且含推前硬闸', async () => {
  const releasing = await readIfExists('docs/RELEASING.md');
  assert.ok(releasing !== undefined, '缺少 docs/RELEASING.md（发布清单）');
  assert.match(releasing, /npm test/, 'RELEASING.md 必须写明发布前要跑的验证命令');
  assert.match(releasing, /pre-push|钩子/, 'RELEASING.md 必须说明推送前硬闸');
  assert.match(releasing, /dsh-plugin/, 'RELEASING.md 必须说明靠 GitHub topic 被收录');
  assert.match(releasing, /脱敏|私有信息/, 'RELEASING.md 必须有脱敏检查项');
  // 仓库级清单必须挂到上游规范，否则两份文档会各自漂移。
  assert.match(
    releasing,
    /RELEASE-STANDARDS/,
    'RELEASING.md 必须回链上游规范 RELEASE-STANDARDS（发布六步流程），避免两份文档漂移',
  );
});

test('这些会公开的文件不得含本机私有信息（脱敏）', () => {
  const forbidden = [
    // ⚠️ 不写死具体私人邮箱：本测试文件本身是公开的，把要防的地址原文写进来
    //    等于自己泄漏一次。改为「任何非 agent 的 qq.com 邮箱」这种泛化判据，
    //    并显式放行全局规范指定的公开通讯邮箱。
    { re: /[\w.+-]+@qq\.com/g, what: '非 agent 的 qq.com 邮箱', allow: ['blancatora@agent.qq.com'] },
    { re: /192\.168\.\d+\.\d+/, what: '内网 IP' },
    { re: /\/home\/[a-z][\w-]*\b/, what: '本机绝对路径（含用户名）' },
  ];
  const files = { 'AGENTS.md': AGENTS, 'llms.txt': LLMS, ...READMES };
  const hits = [];
  for (const [name, content] of Object.entries(files)) {
    if (content === undefined) continue;
    for (const { re, what, allow } of forbidden) {
      const pattern = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
      for (const match of content.matchAll(pattern)) {
        const hit = match[0];
        if (allow !== undefined && allow.includes(hit)) continue;
        hits.push(`${name} 含${what}：${hit}`);
      }
    }
  }
  assert.deepEqual(hits, [], `公开文件里出现私有信息：\n${hits.join('\n')}`);
});
