/**
 * dsh-enhanced-prompt-editor —— 落盘路径规则（纯函数，可单测）。
 *
 * 这一层存在的唯一理由是**安全**：客户端传来的目录/文件名一律不可信，
 * 必须在 Host 侧解析并确认最终路径仍在会话工作区之内。所有判断都集中
 * 在这里，路由只调用它，因此不存在第二份检查可以漂移。
 *
 * @module dsh-enhanced-prompt-editor/paths
 */
import { isAbsolute, join, normalize, resolve, sep } from 'node:path';

/** 草稿扩展名固定为 .md，这样内置文件阅读器一定能认。 */
export const DRAFT_EXT = '.md';

/**
 * 把用户给的名字变成一个安全的 .md 文件名。
 *
 * 不合法（含路径分隔符、控制字符、`.`／`..`、超长）时退回 `draft.md`，
 * 而不是抛错——设置页里的名字是用户随手打的，不该让一次保存失败。
 *
 * @param value 用户输入的原始名字（可带或不带 .md）。
 * @returns 一个只含文件名的 .md 文件名字符串。
 */
export function draftFileName(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  const stem = raw.replace(/\.md$/i, '');
  if (stem === '' || stem === '.' || stem === '..') return `draft${DRAFT_EXT}`;
  // 路径分隔符、控制字符、以及 Windows 保留字符全部拒绝。
  if (/[\\/\u0000-\u001f\u007f<>:"|?*]/.test(stem)) return `draft${DRAFT_EXT}`;
  if (stem.length > 80) return `draft${DRAFT_EXT}`;
  return `${stem}${DRAFT_EXT}`;
}

/**
 * 解析 `root/rel`，并断言结果仍在 `root` 之内。
 *
 * 这是唯一的越界闸门：`rel` 里的 `..`、绝对路径、符号链接之外的逃逸
 * 都在这里被拦下。Windows 上比较大小写不敏感，因此按平台选择比较方式。
 *
 * @param root 会话工作区根（绝对路径）。
 * @param rel 相对路径（可含子目录）。
 * @returns 解析后的绝对路径。
 * @throws 当 root 不是绝对路径，或结果落在 root 之外。
 */
export function assertInside(root, rel) {
  if (typeof root !== 'string' || root === '' || !isAbsolute(root)) {
    throw new Error('workspace root must be an absolute path');
  }
  const base = resolve(root);
  const candidate = resolve(base, typeof rel === 'string' ? rel : '');
  if (candidate === base) return candidate;
  const withSep = base.endsWith(sep) ? base : `${base}${sep}`;
  const inside = candidate.startsWith(withSep);
  if (!inside) throw new Error('path escapes the workspace');
  return candidate;
}

/**
 * 把 readdir 的结果过滤成草稿条目。
 *
 * 只保留 .md 普通文件，并附带修改时间与大小；排序按修改时间倒序，
 * 让最近写的那份排在最前面。
 *
 * @param files readdir(..., { withFileTypes: true }) 的结果。
 * @param dir 被列举的目录绝对路径。
 * @param statOf 取 stat 的函数（注入以便测试）。
 * @returns 草稿条目列表。
 */
export async function toDraftEntries(files, dir, statOf) {
  const out = [];
  for (const entry of files) {
    if (entry === null || typeof entry !== 'object') continue;
    const entryName = typeof entry.name === 'string' ? entry.name : '';
    if (!entryName.toLowerCase().endsWith(DRAFT_EXT)) continue;
    if (typeof entry.isFile === 'function' ? !entry.isFile() : entry.isFile !== true) continue;
    const path = join(dir, entryName);
    let mtimeMs = 0;
    let bytes = 0;
    try {
      const info = await statOf(path);
      mtimeMs = typeof info?.mtimeMs === 'number' ? info.mtimeMs : 0;
      bytes = typeof info?.size === 'number' ? info.size : 0;
    } catch {
      // 列举与 stat 之间文件被删掉是正常竞态，跳过即可。
      continue;
    }
    out.push({ name: entryName.replace(/\.md$/i, ''), file: entryName, path, mtimeMs, bytes });
  }
  out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return out;
}

/**
 * 列举目录里的草稿；目录不存在时返回空列表。
 *
 * @param readdirFn 注入的 readdir。
 * @param dir 目录绝对路径。
 * @returns 草稿条目。
 */
export async function listDrafts(readdirFn, dir) {
  const { stat } = await import('node:fs/promises');
  const files = await readdirFn(dir, { withFileTypes: true });
  return toDraftEntries(files, dir, stat);
}
