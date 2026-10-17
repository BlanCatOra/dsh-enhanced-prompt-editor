/**
 * dsh-enhanced-prompt-editor —— 跨表面共享的草稿状态。
 *
 * 三个表面（工具行按钮、右侧栏面板、设置页）读写同一份状态，因此这里用
 * 一个极小的快照 store：`getSnapshot` 返回稳定引用、`subscribe` 在变更后
 * 通知。这与 DSH 自己 `createSnapshotStore` 的契约一致，因此可以直接喂给
 * 那些期望该契约的宿主钩子。
 *
 * @module dsh-enhanced-prompt-editor/store
 */
import { MAX_DRAFT_CHARS } from './constants.js';

/** 创建一个快照 store。 */
export function createSnapshotStore(initial) {
  let snapshot = initial;
  const listeners = new Set();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next) {
      if (Object.is(next, snapshot)) return;
      snapshot = next;
      for (const listener of [...listeners]) listener();
    },
  };
}

/** 会话级草稿状态：每会话一条草稿、一份保存状态。 */
export function createDraftStore() {
  const sessions = new Map();
  const store = createSnapshotStore({ revision: 0, bySession: {} });
  let disposed = false;

  const publish = () => {
    if (disposed) return;
    const bySession = {};
    for (const [sessionId, state] of sessions) bySession[sessionId] = state;
    store.set({ revision: store.getSnapshot().revision + 1, bySession });
  };

  /** 取（或初始化）某会话的状态。 */
  const of = (sessionId) => {
    const key = typeof sessionId === 'string' && sessionId !== '' ? sessionId : '__none__';
    let state = sessions.get(key);
    if (state === undefined) {
      state = {
        text: '',
        /** 面板当前打开的草稿名（null 表示还没落盘过）。 */
        name: null,
        /** 落盘后的绝对路径，用于「用阅读器打开」。 */
        path: null,
        /** 'idle' | 'saving' | 'saved' | 'error'。 */
        status: 'idle',
        error: null,
        /** 已存在的草稿列表（storage=workspace 时由 Host 路由返回）。 */
        drafts: [],
        /** 面板高度（设置页可改，这里持有本会话的临时覆盖）。 */
        height: null,
      };
      sessions.set(key, state);
    }
    return state;
  };

  return {
    /** 供宿主钩子使用：整个 store 的快照面。 */
    snapshot: {
      getSnapshot: store.getSnapshot,
      subscribe: store.subscribe,
    },
    /** 读某会话状态（稳定引用）。 */
    of,
    /** 局部更新某会话状态并通知。 */
    patch(sessionId, patch) {
      const state = of(sessionId);
      Object.assign(state, patch);
      publish();
    },
    /** 追加文本（听写用），并保证不超上限。 */
    append(sessionId, text) {
      const state = of(sessionId);
      const next = `${state.text}${text}`.slice(0, MAX_DRAFT_CHARS);
      state.text = next;
      publish();
      return next;
    },
    /** 整体替换文本。 */
    setText(sessionId, text) {
      const state = of(sessionId);
      state.text = typeof text === 'string' ? text.slice(0, MAX_DRAFT_CHARS) : '';
      publish();
      return state.text;
    },
    /** 配置变更后触发一次渲染（值本身由 settings face 持有）。 */
    notifySettings: publish,
    /** 丢弃某会话状态。 */
    forget(sessionId) {
      sessions.delete(sessionId);
      publish();
    },
    dispose() {
      disposed = true;
      sessions.clear();
    },
  };
}
