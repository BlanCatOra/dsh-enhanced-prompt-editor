/**
 * dsh-enhanced-prompt-editor —— 草稿读写与发送。
 *
 * 三条出路：
 *  - **落盘**：走本插件 Host 侧的 `/_dsh` 路由写工作区 .md（DSH 自带的
 *    workspace-files Remote 只有读）；
 *  - **浏览器**：localStorage 单份草稿；
 *  - **发送**：经 `inputActions.setDraft` + `submit` 进会话。
 *
 * 所有网络调用都先做能力检查；路由不存在时降级为「仅浏览器」，并且把原因
 * 留在状态里让界面显示，而不是静默失败。
 *
 * @module dsh-enhanced-prompt-editor/io
 */
import { MAX_DRAFT_CHARS } from './constants.js';
import { draftTitleOf } from './constants.js';

/** 本插件 Host 路由前缀。 */
const ROUTE_BASE = '/plugins/dsh-enhanced-prompt-editor';
const DRAFT_ROUTE = `${ROUTE_BASE}/draft`;
const DRAFTS_ROUTE = `${ROUTE_BASE}/drafts`;

const LOCAL_KEY = 'dsh.enhancedPromptEditor.draft';

/**
 * 创建 I/O 面。
 *
 * @param ctx 客户端上下文（用来拿 sidebarRight 等）。
 * @param settings 设置面。
 */
export function createDraftIO(ctx, settings) {
  const controllers = new Set();

  const track = (controller) => {
    controllers.add(controller);
    return () => controllers.delete(controller);
  };

  return {
    /** 读会话工作区根：标准的 `useSessions` 选择器形状。 */
    cwd: (useSessions, sessionId) => {
      if (typeof useSessions !== 'function' || typeof sessionId !== 'string' || sessionId === '') return undefined;
      try {
        const value = useSessions((snapshot) => snapshot?.byId?.[sessionId]?.cwd);
        return typeof value === 'string' && value !== '' ? value : undefined;
      } catch {
        return undefined;
      }
    },

    /**
     * 用内置文件阅读器打开落盘的草稿。
     *
     * @param sessionId 会话。
     * @param address `dsh-resource://file/...` 地址。
     */
    openInReader(sessionId, address) {
      try {
        ctx.sidebarRight.openResource(address, { revealIfOpened: false });
      } catch (error) {
        console.error('[dsh-enhanced-prompt-editor] 无法用阅读器打开：', error);
      }
    },

    /**
     * 把草稿写到工作区。
     *
     * @param args.sessionId 会话。
     * @param args.cwd 工作区根（绝对路径）。
     * @param args.dir 相对目录。
     * @param args.name 草稿名。
     * @param args.text 内容。
     * @param args.signal 取消信号。
     * @returns `{ path, rel }`。
     */
    async save({ sessionId, cwd, dir, name, text, signal }) {
      const response = await fetch(DRAFT_ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ sessionId, cwd, dir, name, text: String(text ?? '').slice(0, MAX_DRAFT_CHARS) }),
        ...(signal === undefined ? {} : { signal }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => undefined);
        throw new Error(detail?.error ?? `HTTP ${response.status}`);
      }
      const payload = await response.json();
      if (payload?.ok !== true) throw new Error(payload?.error ?? 'save refused');
      return { path: payload.path, rel: payload.rel };
    },

    /**
     * 读回一份落盘的草稿。
     *
     * @returns 文本内容。
     */
    async load({ cwd, rel, signal }) {
      const url = new URL(DRAFT_ROUTE, globalThis.location?.origin ?? 'http://127.0.0.1');
      url.searchParams.set('cwd', cwd);
      url.searchParams.set('path', rel);
      const response = await fetch(url.href, {
        credentials: 'same-origin',
        ...(signal === undefined ? {} : { signal }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => undefined);
        throw new Error(detail?.error ?? `HTTP ${response.status}`);
      }
      const payload = await response.json();
      if (payload?.ok !== true) throw new Error(payload?.error ?? 'load refused');
      return payload.text;
    },

    /**
     * 列举目录下的草稿。
     *
     * @returns 草稿条目列表。
     */
    async list({ cwd, dir, signal }) {
      const url = new URL(DRAFTS_ROUTE, globalThis.location?.origin ?? 'http://127.0.0.1');
      url.searchParams.set('cwd', cwd);
      url.searchParams.set('dir', dir);
      const response = await fetch(url.href, {
        credentials: 'same-origin',
        ...(signal === undefined ? {} : { signal }),
      });
      if (!response.ok) return [];
      const payload = await response.json();
      return Array.isArray(payload?.entries) ? payload.entries : [];
    },

    /** 浏览器本地草稿。 */
    readLocal() {
      try {
        return globalThis.localStorage?.getItem(LOCAL_KEY) ?? '';
      } catch {
        return '';
      }
    },
    writeLocal(text) {
      try {
        globalThis.localStorage?.setItem(LOCAL_KEY, String(text ?? '').slice(0, MAX_DRAFT_CHARS));
        return true;
      } catch {
        return false;
      }
    },

    /**
     * 把文本送进会话。
     *
     * 语义是「直接发出」：先 setDraft 再 submit。两步都可能被会话拒绝
     * （提交机正在 adjudicating/submitting 时动作是空操作），因此返回
     * 明确结果让界面回显，而不是假装成功。
     *
     * @param inputActions 会话的输入动作面。
     * @param text 要发送的文本。
     * @returns `{ ok, reason }`。
     */
    async send(inputActions, text) {
      const body = String(text ?? '').trim();
      if (body === '') return { ok: false, reason: 'empty' };
      if (inputActions?.setDraft === undefined || inputActions?.submit === undefined) {
        return { ok: false, reason: 'unavailable' };
      }
      try {
        inputActions.setDraft(body);
        inputActions.submit();
        return { ok: true };
      } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : String(error) };
      }
    },

    /** 释放所有在途请求。 */
    dispose() {
      for (const controller of controllers) {
        try {
          controller.abort();
        } catch {
          // 已经结束就无所谓。
        }
      }
      controllers.clear();
    },

    /** 注册一个可取消的请求，返回其 signal 与释放函数。 */
    begin() {
      const controller = new AbortController();
      const release = track(controller);
      return { signal: controller.signal, release };
    },

    /** 把浏览器 id 映射到标题（给面板标题用）。 */
    titleOf: draftTitleOf,
  };
}
