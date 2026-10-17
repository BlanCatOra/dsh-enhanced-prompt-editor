/**
 * dsh-enhanced-prompt-editor —— 极简客户端打包器（无第三方依赖）。
 *
 * 为什么需要它：DSH 浏览器侧只消费**一个** `./client` bundle，且
 * `window.__ModuleLoader__` 只解析 `./` 开头的相对请求到同包的分块文件。
 * 本项目不引入构建工具链，因此这里把 `src/` 下的若干 ESM 模块合并成
 * 一个自包含的 factory，既保有模块边界（可单测、可复用），又满足单文件
 * 交付要求。
 *
 * 支持的语法子集（足够本项目，且刻意保持窄）：
 *   - `import { a, b as c } from './x.js'`
 *   - `import name from './x.js'`
 *   - `export function f / export const x / export class C`
 *   - `export { a, b as c }`
 *
 * 不支持的语法会**显式报错**而不是静默产出坏 bundle——静默是关键失败，
 * 一个跑得起来但行为不对的 bundle 比构建失败难查得多。
 *
 * @module dsh-enhanced-prompt-editor/build
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** 匹配静态 import 语句，捕获子句与模块说明符。 */
const IMPORT_RE = /^[ \t]*import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]\s*;?[ \t]*$/gm;

/** 匹配 `export function/const/class/let/var` 顶层声明。 */
const EXPORT_DECL_RE = /^[ \t]*export\s+(async\s+function|function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm;

/** 匹配 `export { ... }` 汇总语句。 */
const EXPORT_LIST_RE = /^[ \t]*export\s*\{([^}]*)\}\s*;?[ \t]*$/gm;

/**
 * 把 `a, b as c` 解析成 `{ inside, outside }` 列表。
 *
 * `inside` 是模块内部的真实名字，`outside` 是跨模块边界的名字。两个方向
 * 的含义**相反**，这正是最容易写错的一处：
 *   - import 的 `b as c`：外部提供 `b`，本地叫 `c` → inside=c, outside=b
 *   - export 的 `b as c`：本地叫 `b`，对外暴露 `c` → inside=b, outside=c
 * 因此调用方必须显式说明方向，不能共用一种解读。
 */
function parseSpecifiers(text, direction) {
  return text
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map((part) => {
      const asMatch = /^([\w$]+)\s+as\s+([\w$]+)$/.exec(part);
      if (asMatch === null) return { inside: part, outside: part };
      return direction === 'import'
        ? { inside: asMatch[2], outside: asMatch[1] }
        : { inside: asMatch[1], outside: asMatch[2] };
    });
}

/**
 * 把单个模块的 ESM 源码转成 factory 体，并回传它导出的名字。
 *
 * @param source 模块源码。
 * @param moduleId 该模块在 bundle 内的键（相对 src/ 的路径）。
 * @returns `{ body, exports }`。
 */
export function transformModule(source, moduleId) {
  const exports = new Set();
  const importedModules = new Set();
  let body = source;

  // 先处理 import，把它们替换成对本地 registry（相对）或宿主 require（裸名）的绑定。
  body = body.replace(IMPORT_RE, (match, clause, specifier) => {
    const external = !specifier.startsWith('.');
    if (!external) importedModules.add(specifier);
    const from = external ? `__dshExternal(${JSON.stringify(specifier)})` : `__dshRequire(${JSON.stringify(specifier)})`;
    const trimmed = clause.trim();
    const lines = [];
    const namedMatch = /\{([\s\S]*)\}/.exec(trimmed);
    const defaultPart = trimmed.replace(/\{[\s\S]*\}/, '').replace(/,\s*$/, '').trim();
    if (defaultPart !== '') {
      // 宿主基座模块（react / react/jsx-runtime）用各自的真实形状：
      // react 是 CJS 默认导出，jsx-runtime 也是，因此取 `.default ?? 自身`。
      lines.push(`const ${defaultPart} = (${from}).default ?? ${from};`);
    }
    if (namedMatch !== null) {
      const specs = parseSpecifiers(namedMatch[1], 'import');
      if (specs.length > 0) {
        // 解构模式里 `{ outside: inside }` 的冒号左侧才是对象上的键。
        const pattern = specs.map((s) => (s.inside === s.outside ? s.inside : `${s.outside}: ${s.inside}`)).join(', ');
        lines.push(`const { ${pattern} } = ${from};`);
      }
    }
    if (lines.length === 0) throw new Error(`${moduleId}: 无法解析 import 子句 "${trimmed}"`);
    return lines.join('\n');
  });

  // 顶层 export 声明：记录名字并去掉 export 前缀。
  body = body.replace(EXPORT_DECL_RE, (match, kind, exportedName) => {
    exports.add(exportedName);
    return match.replace(/^([ \t]*)export\s+/, '$1');
  });

  // export { ... } 汇总：只记录名字，语句本身删掉。
  body = body.replace(EXPORT_LIST_RE, (match, list) => {
    for (const spec of parseSpecifiers(list, 'export')) exports.add(spec.outside);
    return '';
  });

  // 任何残留的顶层 export 都是未支持的写法，必须报错。
  const leftover = /^[ \t]*export\s+/m.exec(body);
  if (leftover !== null) {
    const line = body.slice(leftover.index).split('\n')[0].trim();
    throw new Error(`${moduleId}: 不支持的 export 写法 "${line}"`);
  }

  return { body, exports: [...exports], importedModules: [...importedModules] };
}

/** 从入口出发，按依赖顺序解析出所有需要的模块。 */
async function collect(entryPath, rootDir) {
  const modules = new Map();
  const visiting = new Set();
  let entryId;

  async function visit(filePath) {
    const key = filePath;
    if (modules.has(key)) return;
    if (visiting.has(key)) throw new Error(`循环 import：${filePath}`);
    visiting.add(key);
    const source = await readFile(filePath, 'utf8');
    assertNoBacktickInsideCssTemplate(source, filePath);
    const moduleId = filePath.slice(rootDir.length).replace(/^[/\\]/, '').split('\\').join('/');
    const { body, exports, importedModules } = transformModule(source, moduleId);
    // 先解析依赖，保证输出里依赖定义在消费者之前。
    for (const specifier of importedModules) {
      const depPath = resolve(dirname(filePath), specifier);
      await visit(depPath);
    }
    visiting.delete(key);
    modules.set(key, { id: moduleId, body, exports });
  }

  await visit(entryPath);
  entryId = entryPath.slice(rootDir.length).replace(/^[/\\]/, '').split('\\').join('/');
  // Map 的插入顺序已经是「依赖先于消费者」，因为 visit 是后序返回。
  return { modules: [...modules.values()], entryId };
}

/**
 * 前端 boot 的 seed 表（冻结基座模块）。
 *
 * 逐字来自内核 `dsh-web-frontend/dist/assets/index-*.js` 的 `function gM()`
 * （0.2.1-alpha.2 实测），它被传给 `__ModuleLoader__.create({ staticModules })`。
 * **只有这 9 个 `require` 一定成功**；表外的任何 `@deepseek-ai/*` 都会在
 * 真机上 require 失败 → `import failed` → 整页白屏（且没有堆栈）。
 *
 * 用户 2026-10-15 裁定：UI 组件一律用 `primitives`（官方 10 个配置页里 9 个
 * 都 require 它，它是 seed 表成员，不是"跨包风险"）。所以白名单从原来的
 * 「只有 react」放宽到这张表的全部 9 项。
 */
const SEED_MODULES = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]);

/**
 * 源码级守卫：CSS 模板字符串**内部**不得出现反引号。
 *
 * ⚠️ 为什么单独做这一条，而不是只靠产物上的 `new Function`：
 *
 * 反引号落在模板字符串内部的注释里会**提前闭合**这个模板串，后面的 CSS
 * 变成 JS 表达式，`new Function` 报的是一句 `Unexpected identifier 'xxx'`
 * —— 指向的语言是 JS，而真凶是一行注释，很难一眼看出。
 * 本项目 2026-10-16 一天内**连踩三次**（`dsh-enhanced-prompt-editor` 的
 * extended-bar / floating-bar）：每次都是在 CSS 的注释里写"类名要用反引号包起来"
 * 之类的说明文字。事后报错定位太慢，所以在**读源码时**就精确指出是哪个文件的哪一行。
 *
 * 判定方式：找 `const CSS... = \`` 开头、到下一个 `` ` `` 结束的那段文本；
 * 模板串内部出现的任何反引号都是非法的（源码里要在模板内写反引号必须转义，
 * 而 CSS 里根本不需要反引号）。
 *
 * @param source 模块源码。
 * @param filePath 用于报错定位的文件路径。
 */
export function assertNoBacktickInsideCssTemplate(source, filePath) {
  const start = source.search(/const\s+CSS\w*\s*=\s*`/);
  if (start < 0) return;
  const open = source.indexOf('`', start);
  // ⚠️ 结束符必须找 `\`;`（反引号**紧跟分号**），不能只找「下一个反引号」：
  // 注释里的反引号本身就是「下一个反引号」，用它当结束符会让 body 恰好
  // 停在那个反引号之前，于是 body 里找不到反引号 —— 守卫变成空转。
  //（第一版就是这么写的，变异测试当场发现它抓不到。）
  const close = source.indexOf('`;', open + 1);
  const body = close < 0 ? source.slice(open + 1) : source.slice(open + 1, close);
  const offset = body.indexOf('`');
  if (close < 0) {
    throw new Error(
      `CSS 模板字符串没有闭合（${filePath}）：模板里出现反引号会提前闭合它，`
      + '真机表现是白屏 + "import failed" 且无堆栈。注释里提类名不要用反引号包。',
    );
  }
  if (offset >= 0) {
    const line = source.slice(0, open + 1 + offset).split('\n').length;
    const text = body.split('\n').find((l) => l.includes('`'))?.trim().slice(0, 80) ?? '';
    throw new Error(
      `${filePath}:${line} 的 CSS 模板字符串内部出现反引号：\n  ${text}\n`
      + '反引号会提前闭合模板串（真机表现：白屏 + "import failed"，无堆栈）。'
      + '注释里提到类名/属性时**不要**用反引号包起来，写裸名字即可。',
    );
  }
}

/**
 * 构建期断言产物形状。
 *
 * 两件事，都是「测试抓不到、真机才炸」的缺陷：
 *
 *  1. `new Function(code)` 解析产物——语法坏掉立即构建失败。最容易踩的是
 *     **模板字符串内部注释里的反引号**会提前闭合字符串（真机表现：白屏 +
 *     `import failed`，没有任何堆栈）。
 *  2. 扫产物里真正的**外部模块请求**，只允许 seed 表那 9 个模块。
 *
 * ⚠️ 第 ② 条必须扫 `__dshExternal("<name>")`，**不能**扫 `require("name")`：
 * 打包器把源码里的 `import ... from 'x'` 改写成 `__dshExternal('x')`，产物里
 * 唯一的 `require` 是外壳那一句 `function __dshExternal(name) { return require(name) }`
 * ——里面根本没有字面量。曾经写成扫 `require(` 的版本恒等于 0 命中，是**空转的
 * 守卫**（"测试全绿、真机全废"的同款形状）。这里两者都扫，任一命中即校验。
 *
 * @param code 生成的 bundle 源码。
 */
export function assertBundleShape(code) {
  // ① 语法必须能解析。
  try {
    // eslint-disable-next-line no-new-func
    new Function(code);
  } catch (error) {
    throw new Error(`bundle 语法坏掉（真机表现是白屏 + "import failed" 且无堆栈）：${error.message}`);
  }

  // ② 只允许 seed 表里的模块。
  const found = new Set();
  // 打包器产出的外部请求形式。
  for (const match of code.matchAll(/__dshExternal\(\s*["']([^"']+)["']\s*\)/g)) found.add(match[1]);
  // 兜底：万一将来直接写 require("x")，也一并校验。
  for (const match of code.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)) found.add(match[1]);

  for (const name of found) {
    if (!SEED_MODULES.has(name)) {
      throw new Error(
        `bundle 依赖了 seed 表之外的模块 "${name}"。允许的只有前端 boot 冻结基座那 9 个：\n` +
          `  ${[...SEED_MODULES].join('\n  ')}\n` +
          '表外的 require 在真机上必然失败（白屏 + import failed，无堆栈）。',
      );
    }
  }
  return { externals: [...found] };
}

/**
 * 构建 bundle。
 *
 * @param options.entry 入口文件绝对路径。
 * @param options.root 模块键的基准目录。
 * @param options.packageId bundle 的 id（与 package.json 名称一致）。
 * @param options.output 输出文件绝对路径。
 * @param options.banner 输出文件顶部的注释。
 */
export async function build({ entry, root, packageId, output, banner = '' }) {
  const { modules, entryId } = await collect(entry, root);
  const parts = [];
  parts.push(banner.trim() === '' ? '' : `${banner.trim()}\n`);
  parts.push('window.__ModuleLoader__.load({');
  parts.push(`\tid: ${JSON.stringify(packageId)},`);
  parts.push('\tfactory: (require) => {');
  parts.push('\t\tvar __dshRegistry = new Map();');
  parts.push('\t\tvar __dshCache = new Map();');
  parts.push('\t\t/** 宿主基座模块（react 等）由外壳的冻结模块表提供。 */');
  parts.push('\t\tfunction __dshExternal(name) { return require(name); }');
  parts.push('\t\t/** 按模块键懒加载；每个模块只执行一次。 */');
  parts.push('\t\tfunction __dshRequire(key) {');
  // 模块键是相对 src/ 的裸路径（`constants.js`），而源码里的 import 写的是
  // `./constants.js`；在这里统一，否则查表必然落空。
  parts.push('\t\t\tkey = key.replace(/^\\.\\//, \"\");');
  parts.push('\t\t\tif (__dshCache.has(key)) return __dshCache.get(key);');
  parts.push('\t\t\tvar factory = __dshRegistry.get(key);');
  parts.push('\t\t\tif (factory === undefined) throw new Error("dsh-enhanced-prompt-editor: unknown module " + key);');
  parts.push('\t\t\tvar exports = {};');
  parts.push('\t\t\t__dshCache.set(key, exports);');
  parts.push('\t\t\tfactory(exports);');
  parts.push('\t\t\treturn exports;');
  parts.push('\t\t}');
  for (const mod of modules) {
    parts.push(`\t\t__dshRegistry.set(${JSON.stringify(mod.id)}, (__exports) => {`);
    parts.push(`\t\t\tvar module = { exports: __exports };`);
    // 模块体缩进一层，便于阅读生成结果。
    parts.push(
      mod.body
        .split('\n')
        .map((line) => (line.trim() === '' ? '' : `\t\t\t${line}`))
        .join('\n'),
    );
    if (mod.exports.length > 0) {
      const pairs = mod.exports.map((name) => `${JSON.stringify(name)}: ${name}`).join(', ');
      parts.push(`\t\t\tObject.assign(__exports, { ${pairs} });`);
    }
    parts.push('\t\t});');
  }
  parts.push(`\t\tvar __entry = __dshRequire(${JSON.stringify(entryId)});`);
  parts.push('\t\tvar module = { exports: {} };');
  parts.push('\t\tvar exports = module.exports;');
  parts.push('\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });');
  parts.push('\t\texports.apply = __entry.apply;');
  parts.push('\t\texports.inject = __entry.inject ?? [];');
  parts.push('\t\treturn module.exports;');
  parts.push('\t},');
  parts.push('});');
  const code = `${parts.join('\n')}\n`;
  // 产物形状守卫：语法 + seed 表白名单。放在写盘之前，坏产物不落盘。
  const shape = assertBundleShape(code);
  await writeFile(output, code, 'utf8');
  return { modules: modules.map((m) => m.id), bytes: Buffer.byteLength(code), externals: shape.externals };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const pkg = JSON.parse(await readFile(join(here, '..', 'package.json'), 'utf8'));
  const result = await build({
    entry: join(here, "client.js"),
    root: here,
    packageId: pkg.name,
    output: join(here, '..', 'lib', 'client.js'),
    banner: `/**\n * ${pkg.name} —— 浏览器侧 bundle。\n *\n * 本文件由 build-client.mjs 从 src/ 生成，请勿手改；改 src/ 后重新运行：\n *   node build-client.mjs\n */`,
  });
  console.log(`built lib/client.js — ${result.bytes} bytes, ${result.modules.length} modules`);
  console.log(`  externals: ${result.externals.join(', ') || '(none)'}`);
  for (const id of result.modules) console.log(`  ${id}`);
}
