/**
 * dsh-enhanced-prompt-editor —— Host 侧。
 *
 * 职责只有两件：
 *  1. 声明本插件的 Config（设置页可编辑的字段），并把「改动立即生效」的
 *     语义交给 DSH 的设置服务；
 *  2. 提供一条 loopback-only 的同源路由，供面板把草稿落成工作区里的 .md
 *     文件（DSH 自带的 workspace-files Remote 只有读，没有写）。
 *
 * 路由的路径包含检查是**在这里**做的，而不是相信浏览器传来的目录：
 * 客户端传 `cwd`（会话工作区根）与相对 `dir`，Host 解析后确认最终路径仍在
 * `cwd` 之内才落盘。因此即使页面被塞了恶意参数，也写不出工作区。
 *
 * @module dsh-enhanced-prompt-editor
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { Config as ConfigSchema, resolveConfig } from './config.js';
import { assertInside, listDrafts, draftFileName } from './paths.js';

export const name = 'dsh-enhanced-prompt-editor';
/** 模块级必需依赖为空：settings 与 webServer 都在 apply 内按需解析。 */
export const inject = [];
export const Config = ConfigSchema;

/** 落盘与回读草稿的同源路由。 */
export const DRAFT_ROUTE = '/plugins/dsh-enhanced-prompt-editor/draft';
/** 列出某目录下草稿的同源路由。 */
export const DRAFTS_ROUTE = '/plugins/dsh-enhanced-prompt-editor/drafts';

/** 单次请求体上限：草稿是文本，超过 1 MiB 的 body 直接拒绝。 */
const MAX_BODY_BYTES = 1024 * 1024;

/** 只接受来自本机页面的请求；该路由能写文件，绝不能被跨站页面驱动。 */
function loopbackOrigin(req) {
  const origin = req.headers.origin;
  if (typeof origin !== 'string' || origin === '') return true; // 同源 fetch 可能不带 Origin
  try {
    const { hostname } = new URL(origin);
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolvePromise, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function safeMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 装配 Host 侧：注册路由。
 *
 * @param ctx Host 上下文。
 * @param config 行配置（cordis.patch.yml / 设置服务折叠后的值）。
 */
export function apply(ctx, config = {}) {
  // 本插件自带设置页，因此关掉按 schema 自动生成的表单，
  // 让设置服务只负责持有值与写入，不接管呈现。
  // 设置 schema 通过本模块导出的 `Config` 被设置服务发现，无需显式注册。
  if (typeof ctx.inject === 'function') {
    ctx.inject(['settings'], (settingsCtx) => {
      if (typeof settingsCtx.settings?.configure === 'function') {
        settingsCtx.effect(
          () => settingsCtx.settings.configure({ auto: false }, ctx.fiber),
          'dsh-enhanced-prompt-editor: settings policy',
        );
      }
    });
  }

  // 路由需要 webServer；用 ctx.inject 而不是把它写进模块级 `inject`，
  // 这样缺少 HTTP 服务的组合里插件仍能加载（只是落盘功能不可用），
  // 而不是整个条目被静默挂起。
  const mount = (webCtx) => {
    /**
     * 当前生效的设置（普通值）。
     *
     * 关键：`describe()` 返回的行值是**含 volatile 活引用**的，所以必须经
     * `resolveConfig` 剥一层 `.get()`，否则拿到的永远是对象、读不出字符串。
     * 设置服务尚未就绪时退回行配置。
     */
    const currentConfig = () => {
      try {
        const row = webCtx.get?.('settings')?.describe?.().find((item) => item.ns === name);
        if (row?.value !== undefined) return resolveConfig(row.value);
      } catch {
        // 设置服务不可用：用行配置。
      }
      return resolveConfig(config);
    };

    const disposeDraft = webCtx.webServer.register({
      kind: 'exact',
      path: DRAFT_ROUTE,
      handler: async (req, res) => {
        if (!loopbackOrigin(req)) return json(res, 403, { ok: false, error: 'origin-not-trusted' });
        try {
          if (req.method === 'GET') {
            const url = new URL(req.url ?? '/', 'http://127.0.0.1');
            const cwd = url.searchParams.get('cwd') ?? '';
            const rel = url.searchParams.get('path') ?? '';
            if (cwd === '' || rel === '') return json(res, 400, { ok: false, error: 'cwd and path are required' });
            const target = assertInside(cwd, rel);
            const text = await readFile(target, 'utf8');
            return json(res, 200, { ok: true, text, path: target });
          }
          if (req.method !== 'POST') {
            res.setHeader('Allow', 'GET, POST');
            return json(res, 405, { ok: false, error: 'use GET or POST' });
          }
          const raw = await readBody(req);
          let body;
          try {
            body = JSON.parse(raw);
          } catch {
            return json(res, 400, { ok: false, error: 'body must be JSON' });
          }
          const cwd = typeof body?.cwd === 'string' ? body.cwd : '';
          const dir = typeof body?.dir === 'string' && body.dir !== '' ? body.dir : currentConfig().dir;
          const name$ = typeof body?.name === 'string' ? body.name : '';
          const text = typeof body?.text === 'string' ? body.text : '';
          if (cwd === '') return json(res, 400, { ok: false, error: 'cwd is required' });
          if (!isAbsolute(cwd)) return json(res, 400, { ok: false, error: 'cwd must be absolute' });

          const dirRel = join(dir === '' ? '.' : dir, draftFileName(name$));
          const target = assertInside(cwd, dirRel);
          await mkdir(resolve(target, '..'), { recursive: true });
          await writeFile(target, text, 'utf8');
          return json(res, 200, { ok: true, path: target, rel: relative(resolve(cwd), target).split(sep).join('/') });
        } catch (error) {
          return json(res, 500, { ok: false, error: safeMessage(error) });
        }
      },
    });

    const disposeDrafts = ctx.webServer.register({
      kind: 'exact',
      path: DRAFTS_ROUTE,
      handler: async (req, res) => {
        if (!loopbackOrigin(req)) return json(res, 403, { ok: false, error: 'origin-not-trusted' });
        if (req.method !== 'GET') {
          res.setHeader('Allow', 'GET');
          return json(res, 405, { ok: false, error: 'use GET' });
        }
        try {
          const url = new URL(req.url ?? '/', 'http://127.0.0.1');
          const cwd = url.searchParams.get('cwd') ?? '';
          const dir = url.searchParams.get('dir') ?? currentConfig().dir;
          if (cwd === '') return json(res, 400, { ok: false, error: 'cwd is required' });
          if (!isAbsolute(cwd)) return json(res, 400, { ok: false, error: 'cwd must be absolute' });
          const target = assertInside(cwd, dir === '' ? '.' : dir);
          let entries = [];
          try {
            entries = await listDrafts(readdir, target);
          } catch {
            // 目录还不存在就等于「还没有草稿」，不是错误。
            entries = [];
          }
          return json(res, 200, { ok: true, entries });
        } catch (error) {
          return json(res, 500, { ok: false, error: safeMessage(error) });
        }
      },
    });

    return () => {
      disposeDraft();
      disposeDrafts();
    };
  };

  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (webCtx) => webCtx.effect(() => mount(webCtx), 'dsh-enhanced-prompt-editor: web routes'));
  } else if (ctx.get?.('webServer') !== undefined) {
    // ⚠️ 不能直接写 `ctx.webServer`：cordis 的服务代理只放行 inject 里声明过的
    // 服务名，未声明时读它会抛 `cannot get property "..." without inject`。
    // 这条分支只在非 cordis 上下文里走到，但两个分支都别留这个坑。
    ctx.effect(() => mount(ctx), 'dsh-enhanced-prompt-editor: web routes');
  }
}
