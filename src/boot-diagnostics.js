/**
 * dsh-enhanced-prompt-editor —— 启动自检与失败留痕。
 *
 * 为什么需要这一层：DSH 的 web boot 把**每个客户端插件**的 cordis fiber 都
 * 当成必须 ACTIVE 的条目；`apply` 里冒出来的任何异常都会把该 fiber 置为
 * FAILED，于是整页启动直接抛 `web boot: N entry did not activate` 而白屏。
 * 用户能看到的只有 `dsh-enhanced-prompt-editor: failed` 这一行——**没有堆栈、
 * 没有出错位置**（cordis 把它交给了 logger，而渲染进程的 logger 不落盘）。
 *
 * 所以本模块做两件事：
 *  1. 提供一个「绝不抛错」的步骤包装，让单个表面的接线失败不再拖垮整页；
 *  2. 把失败步骤、消息、堆栈写进 `localStorage`，因为渲染进程里**唯一**
 *     事后能从磁盘读回来的地方就是它（`~/.config/@deepseek-ai/dsh-desktop`
 *     下的 Local Storage leveldb 是可读的纯文本），
 *     顺带 `console.error` 一份（真崩了会进 crash log 的 renderer console 段）。
 *
 * @module dsh-enhanced-prompt-editor/boot-diagnostics
 */

/** 留痕键。读法：在 leveldb 的 .log/.ldb 里 grep 这个键。 */
export const BOOT_REPORT_KEY = 'dsh.enhanced-prompt-editor.boot';

/**
 * 取一个可用的 Web Storage，取不到就返回 undefined。
 *
 * 把存储当**不可信输入**：无痕模式、存储被策略禁用、Node 里没有该全局、
 * 访问 `length` 就抛 SecurityError——全部按「没有存储」处理。
 *
 * @param kind 全局名（`localStorage` / `sessionStorage`）。
 * @returns 可用的 storage，或 undefined。
 */
function safeStorage(kind) {
  try {
    const store = globalThis[kind];
    if (store === undefined || store === null) return undefined;
    // 读一次属性：被禁用时异常就抛在这里，而不是抛在后面的 setItem 里。
    void store.length;
    return store;
  } catch {
    return undefined;
  }
}

/** 把附加上下文收敛成短字符串：优先 JSON，退化到 String，最后截断。 */
function stringifyExtra(extra) {
  if (extra === undefined) return undefined;
  if (typeof extra === 'string') return extra.slice(0, 500);
  try {
    const json = JSON.stringify(extra);
    if (typeof json === 'string') return json.slice(0, 500);
  } catch {
    // 循环引用之类：退到 String。
  }
  return String(extra).slice(0, 500);
}

/** 把一次失败收敛成可 JSON 化的记录（消息与堆栈都可能缺失或非字符串）。 */
function describe(where, error, extra) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error && typeof error.stack === 'string' ? error.stack : '';
  const detail = stringifyExtra(extra);
  return {
    where: String(where),
    message,
    // 截断：localStorage 有配额，且我们要的只是前几帧。
    stack: stack.slice(0, 4000),
    ...(detail === undefined ? {} : { extra: detail }),
  };
}

/**
 * 写一份启动报告。**任何一步失败都只吞掉，绝不外抛。**
 *
 * @param failures 本次启动累积的失败记录（空数组表示全部步骤成功）。
 * @param context 额外的环境信息（版本号之类），可选。
 * @returns 写进去的报告对象（便于测试断言）。
 */
export function writeBootReport(failures, context) {
  const report = {
    at: new Date().toISOString(),
    ok: failures.length === 0,
    ...(context === undefined ? {} : { context }),
    failures,
  };
  for (const kind of ['localStorage', 'sessionStorage']) {
    const store = safeStorage(kind);
    if (store === undefined) continue;
    try {
      store.setItem(BOOT_REPORT_KEY, JSON.stringify(report));
    } catch {
      // 配额耗尽、序列化失败、存储被拒——留痕失败不该影响启动。
    }
  }
  return report;
}

/**
 * 读回最近一次启动报告。
 *
 * @param kind 读哪个 storage；默认 localStorage。
 * @returns 报告对象；没有、损坏或读不到时返回 undefined。
 */
export function readBootReport(kind = 'localStorage') {
  const store = safeStorage(kind);
  if (store === undefined) return undefined;
  try {
    const raw = store.getItem(BOOT_REPORT_KEY);
    if (typeof raw !== 'string') return undefined;
    const parsed = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 记录一个启动步骤的失败：`console.error` 一份，并返回记录对象。
 *
 * 调用方负责把返回值收集起来，最后交给 {@link writeBootReport} 一次写入
 * （避免每个步骤各写一次存储）。
 *
 * @param where 步骤标识（例如 `sidebar-tab`）。
 * @param error 抛出的值。
 * @param extra 额外上下文，可选。
 * @returns 失败记录。
 */
export function describeBootFailure(where, error, extra) {
  const entry = describe(where, error, extra);
  try {
    console.error(`[dsh-enhanced-prompt-editor] 启动步骤「${entry.where}」失败：`, error);
  } catch {
    // 连 console 都不可用就没什么能做的了。
  }
  return entry;
}

/**
 * 包一个启动步骤：抛错时记一条失败记录并返回 `undefined`，**绝不外抛**。
 *
 * @param failures 失败记录收集数组（会被就地追加）。
 * @param where 步骤标识。
 * @param run 步骤本体。
 * @param onError 失败时的兜底值工厂，可选。
 * @returns `run()` 的返回值；失败时是 `onError?.()` 或 undefined。
 */
export function guardStep(failures, where, run, onError) {
  try {
    return run();
  } catch (error) {
    failures.push(describeBootFailure(where, error));
    if (onError === undefined) return undefined;
    try {
      return onError(error);
    } catch (nested) {
      failures.push(describeBootFailure(`${where}:fallback`, nested));
      return undefined;
    }
  }
}
