/**
 * 建一个**模块类型被钉死**的临时目录，用于跑 electron 离屏几何探针。
 *
 * ## 为什么不能直接用 `mkdtempSync(tmpdir())`
 *
 * 探针是 CommonJS（`probe.js` 里用 `require(...)`），而 Node 判断「这段 .js 是
 * CJS 还是 ESM」靠**向上查找最近的 `package.json`**。临时目录建在 `/tmp` 下，
 * 只要有任何工具往 `/tmp/package.json` 写了 `"type": "module"`，探针就会被当成
 * ESM 执行，报 `ReferenceError: require is not defined in ES module scope`，
 * 整组几何测试随机变红 —— 而报错信息完全不指向真凶。
 *
 * 本机实测（2026-10-17）：另一个会话做 asar 提取时在 `/tmp/package.json` 留了
 * `"type": "module"`，导致 `test/stripe-geometry.test.mjs` 直接
 * `spawnSync /usr/bin/electron ETIMEDOUT`。清理后立刻恢复。
 *
 * 所以：**在临时目录里显式放一个 `{"type":"commonjs"}` 的 package.json**，
 * 把模块解析钉死在这个目录内，不受 `/tmp` 里任何残留文件影响。
 *
 * @module dsh-enhanced-prompt-editor/test/electron-tmp
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * 建临时目录并钉死模块类型为 CommonJS。
 *
 * @param prefix 目录前缀（便于失败时定位是哪个用例留下的）。
 * @returns 临时目录绝对路径。
 */
export function makeProbeDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  // 最近的 package.json 就是这一份 → probe.js 一定按 CJS 解析。
  writeFileSync(join(dir, 'package.json'), '{\n  "type": "commonjs"\n}\n');
  return dir;
}
