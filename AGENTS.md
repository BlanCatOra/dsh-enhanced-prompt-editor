# AGENTS.md

本文件给 **AI 编码 agent** 看：改这个仓库前先读完。
人类请看 [README.md](./README.md)；想知道这个插件怎么用，看 [llms.txt](./llms.txt)。

仓库：`dsh-enhanced-prompt-editor` —— DSH（DeepSeek Harness）的输入框增强插件。
一个 **DSH 客户端插件 + Host 侧路由**，不是独立应用。

---

## 1. 验证（改完必须跑这条）

```sh
npm test      # = node src/build-client.mjs && node --test test/*.test.mjs
```

⚠️ **只跑 `node --test` 不算验证**：`npm test` 会先构建，构建期有一批
`node --test` 抓不到的断言（bundle 语法、require 白名单）。测试全绿 ≠ 构建能过。

需要真机几何验证时（这些用例依赖 `/usr/bin/electron`，没有就自动 skip）：

```sh
node --test test/floating-bar.test.mjs test/reserve-geometry.test.mjs \
              test/extended-bar-geometry.test.mjs test/stripe-geometry.test.mjs
```

**本机部署**（改了要让它生效，profile 里是一份可加载的副本）：

```sh
npm run build
cp -p src/*.js src/*.mjs ~/.dsh/profiles/desktop/node_modules/dsh-enhanced-prompt-editor/src/
cp -p lib/client.js       ~/.dsh/profiles/desktop/node_modules/dsh-enhanced-prompt-editor/lib/
```

⚠️ **Profile 副本与仓库是硬链接**。文件被「写新 inode」的方式替换（编辑器保存、
`git checkout`、某些构建）后**硬链接会断开**，于是 profile 里留着旧版本、而
`git status` 显示干净。**每次部署后必须校验**：

```sh
diff -rq src ~/.dsh/profiles/desktop/node_modules/dsh-enhanced-prompt-editor/src
md5sum lib/client.js ~/.dsh/profiles/desktop/node_modules/dsh-enhanced-prompt-editor/lib/client.js
```

（实测踩过：`src/mode-controller.js` 长期是旧版，`diff` 才发现。）

---

## 1.5 版本基线（改代码前先读）

| 项 | 值 | 怎么查 |
|---|---|---|
| 验证基线 | **DSH 0.2.1-rc.2**（runtime `0.2.1-rc.2`） | `python3` 读 asar 内 `/dsh/package.json` 的 version |
| Arch 包版本 | `0.2.1rc.2-1` | `pacman -Q deepseek-harness-desktop` |
| 声明范围 | `engines.dsh: ">=0.2.0-0"` | `package.json` |
| Node | `^22.19.0 || >=24.0.0` | `package.json` |

⚠️ **三层版本别混**（排查时最容易错）：Arch 包版本 `0.2.1rc.2-1`、
内置 runtime `0.2.1-rc.2`、内核 checkout 在
`/usr/lib/deepseek-harness-desktop/resources/app.asar/dsh/`。

⚠️ **内核 seed 表会随版本变长**：rc.2 已从 9 项增至 11 项（新增 `zod`、
`@tanstack/react-virtual`），但本插件的构建白名单**故意不跟随**（用不到就不放行，
越窄越安全）。要放行新模块，必须先在产物里确认真的需要。

⚠️ **seed 表函数名每次构建都变**（alpha.2 是 `gM()`，rc.2 是 `SZ()`）。
**按 `staticModules` 定位，不要按函数名 grep。**

---

## 2. 产物

| 文件 | 是什么 | 要提交吗 |
|---|---|---|
| `lib/client.js` | **浏览器 bundle**，由 `src/` 构建而来 | **要**（宿主按文件加载，不跑构建） |
| `src/*.js` | 源码（客户端 + Host 侧同一份目录） | 要 |

- **不要手改 `lib/`**，只改 `src/` 然后 `npm run build`。
- 浏览器执行的是 `lib/client.js`，**不是 `src/`**：改了 `src/` 不构建，真机行为不变。
- 客户端 bundle 只允许 `require` `build-client.mjs` 的 `SEED_MODULES` 白名单（内核 seed 表 11 个的子集，当前放行 9 个）
  （`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、
  `@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-store`、
  `@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-primitives`、
  `@deepseek-ai/dsh-client-ui-dockkit`）。超出 → **构建失败**（`assertBundleShape()`）。
- `cordis.patch.yml` 是插件自带的挂载补丁；`package.json` 的 `exports` 已开放
  `./package.json`、`./locale/*.json`、`./icon`（插件展示元信息的发现入口，别删）。

---

## 3. 硬性约束（违反会**静默失效**，不一定报错）

1. **`ctx.<service>` 必须在导出的 `inject` 里声明**，否则 `apply` 抛错 →
   cordis fiber FAILED → **整个 DSH 白屏**，日志只有一行 `failed`。
   需要「可能不存在」的服务用 `ctx.get('name')`（不受这道闸限制），
   **不要**把它写进 `inject`（写进去就变成必需依赖）。
2. **`apply` 绝不向外抛异常**。每个表面各自 `guardStep`，失败只降级 + 记录
   （`localStorage` 启动报告，`~/.dsh/bin/dsh-boot-report --key epe`）。
3. **UI 一律用 `@deepseek-ai/dsh-client-ui-primitives`**，不要自己写
   Switch / Menu / Modal / Tooltip。它是 boot 的冻结基座模块，`require` 必成功。
4. **模板字符串内部的注释绝不能出现反引号** —— 会提前闭合字符串 → 产物语法坏掉 →
   真机白屏 + `import failed`，**没有堆栈**。
   `src/build-client.mjs` 的 `assertNoBacktickInsideCssTemplate()` 会在构建期拦住并报行号。
5. **插槽 `inject()` 的返回值被内核按 `(entry, binding)` 缓存进 WeakMap 且永不失效**。
   所以**活值必须走 `hooks: { name: snapshotSource }`**（`getSnapshot()` + `subscribe`），
   不能直接把当前值塞进 `inject()` 的返回值 —— 否则角标/显隐永远冻在第一帧。
6. **插件设置注册到 `plugins.bundle.config`**（key = 插件包名），那是「插件详情页」的
   配置区。**不要**注册到 `settings.section`（用户明确要求放插件详情页），
   也**不要**用 `plugins.item`（那是官方插件的位置，第三方会错位）。

---

## 4. 禁区（冻结实现，改了会让已验证功能失效）

- `test/extended-bar-geometry.test.mjs` 的**块尾 `<br>` 规则**：行几何以**草稿文本**为
  权威，`composer-rows.js` 的算法是逐条对照真实渲染验证过的（40/40）。不要"优化"。
- `float-position.js` 的 `floatTopFor` / `reserveHeightFor`：预留值**只允许**由
  悬浮条高度这类**常量**决定。曾经用「编辑区顶 − 高度」定位，结果预留反过来影响
  测量值 → 每帧 +41px **无限膨胀**（41→82→123→164→205）。
- `~/.dsh/profiles/` 下的运行时配置（那不是本仓库内容）。
- 宿主设置 schema 的三处手写字段清单必须同时更新：`constants.js` 的
  `defaultSettings`、`config.js` 的 `resolveConfig`、`settings-face.js` 的 `normalize`。
  漏一处 = 开关能渲染能保存、但 `settings.get()` 读不到 → **功能静默失效**
  （`test/unit.test.mjs` 有专门的不变量测试守这条）。

---

## 5. 本仓库特有的坑（每条都有实测依据）

### 5.1 宿主设置写入在本机会**整体被拒**，所以两个新开关存客户端

实测：`nativeDeck` / `nativeEnter` 勾选后保存，宿主回「拒绝了这次写入」。
深挖（读内核 `dsh-app-boot` / `dsh-settings` / `dsh-config-editor`）确认：

- 写入其实**落盘过**（`cordis.patch.yml` mtime = 保存时刻），随后被**回滚**；
- 回滚点在 `reconcileProfilePatches`：它要求「应用新 patches 后本条目仍 active」，
  否则抛 `activationDiagnostic` 并回滚；而内核 `ConfigForm.mutate` 把这条
  message 吞成 `false`，用户只看到一句泛泛的「宿主拒绝」。
- **空写探针**（把 `panelHeight` 写成它当前值）同样被拒 → 与具体字段无关。

因此「原生输入框增强」两个开关 + 回车策略改存 **客户端 localStorage**
（`src/native-switches.js`），切换即时生效、不点保存。
宿主 schema 里仍保留这两个字段作为保留位（将来修好可搬回）。

### 5.2 DSH 的崩溃对话框不可信，「Web authentication failed」是兜底文案

实测：桌面版启动即退出，对话框写 `desktop welcome: Web authentication failed`，
还建议「禁用第三方插件 / 备份 profile patch」——**照做没用，还会把 profile 配置冲掉**
（GUI 禁用插件会把 `cordis.patch.yml` 从 39KB 重写成几百字节）。

真因是 **Chromium cookie 库积爆**：每次启动新增一条 `dsh-auth-<sha256(host:port)>`
（端口随机 → 名字永不重复），积到 71 条 / 16188 字节即越过 Node `maxHeaderSize`
（16384）→ Host 返回 **431** → 主进程 `!authenticated.ok` 把 431 当认证失败。
本机已有工具 `~/.dsh/bin/dsh-cookie-gc`（+ 启动包装 `dsh-launch`、systemd 定时器）。
**遇到任何插件「启动就退出」的报障，先查 cookie 再查插件。**

### 5.3 composer 根容器在卡片上方还有一条带子

实测：`[data-composer-card]` 高 98px，而它的祖先（composer 根容器）高 174px ——
**卡片上方 76px 是 composer 自己的区域**，里面可能有最后一条消息的操作行
（复制/赞/踩/分享/用量/时间）。悬浮 deck 若只按「卡片上沿」定位，就会压住那条带子里的控件。
（该结论通过 `elementsFromPoint` 沿 deck 底边左/中/右三点采样得到；只采中心会漏。）

### 5.4 渲染进程的 `console.error` **不落盘**

崩溃日志只收 Host 侧异常。客户端要留证据，唯一可靠通道是 **`localStorage`**
（外部可读 `~/.config/@deepseek-ai/dsh-desktop/Local Storage/leveldb/`；
但 leveldb 压缩后会读不到 —— 要即时读最新的 `*.log`）。
本机还有 `~/.dsh/bin/dsh-boot-report --key epe` 读启动报告（含失败步骤与消息）。

### 5.5 改设置字段时注意 volatile

`Config` 里字段全是 `asVolatile(...)`：值在插值结果里是 `{ get() }` 活引用，
读之前必须 `resolveConfig()` / `unwrapDeep()` 剥一层，否则拿到的是对象，
比较与赋值全都不成立（「设置页改了没反应」的经典成因）。

### 5.6 几何类改动必须**变异验证**

`test/stripe-geometry.test.mjs` / `reserve-geometry` / `extended-bar-geometry` 是
离屏真实渲染测量。断言写得太松会**恒真**：改完守卫要故意破坏实现，确认用例变红。
本仓库已有多条守卫做过变异验证（注释里标了 MUTATION 的提交历史可查）。

### 5.7 🔴 已知未修：deck 会压住消息底部的操作行（**留给后来者**）

> 状态：**未修复**。用户 2026-10-17 决定「先不管这个问题，写进项目须知交给后来志愿者」。
> 所有实验代码保留在分支 **`deck-experiments-20261017`**（12 个提交），不要丢。

#### 现象

模式二（扩展输入框）与「原生 + deck」下，**开始时输入后**，会话消息整体向下移动一小段
（观感像鼠标滚轮向上滑了一格），随后悬浮 deck 那排符号按钮**压住最后一条消息底部的
操作行**（复制 / 赞 / 踩 / 分享 / 用量 / 时间）。打字前不重叠。

#### 已实测确认的事实（省得重新测）

- deck 位置/尺寸、卡片高度、预留值在打字前后**测不出变化**：
  `deckH=30`、`deckTop=1172`、`cardTop=1212`、`cardH=98`、`reserve=46px` 全程稳定；
  唯一在动的是消息滚动容器的 `scrollTop/scrollHeight`。
- 沿 deck 底边做 `elementsFromPoint`（左/中/右三点）时，deck 下方命中的是
  `_5UfNCq_root`（**composer 根容器**，实测高 174px），而卡片只有 98px ——
  即 **composer 根容器在卡片上方还有约 76px 的一条带子**，最后一条消息的操作行
  就在这条带子里。deck 只按「卡片上沿」定位，于是压在那条带子上。
  （只采 deck 中心点会**漏掉**这一点：操作行的「复制」图标在左侧。）
- composer 是 **sticky seat**（不是 absolute）：座位在滚动容器流内、贴在底部；
  消息区是滚动容器的另一个子元素。
- 宿主设置写入在本机被整体拒绝，与会话里的「保存」无关（见 §5.1）。

#### 试过但**不可接受**的方案

1. **给消息区补固定 46px 底部留白** → 空输入时正确，一打字操作行又落回 deck 那一行。
2. **自校正留白**（每帧量「最后一条消息底边 vs deck 顶边」调 padding）→ 同上，且
   `messagesEl.lastElementChild` 往往不是"最后一条消息"，量到的间隙不可信。
3. **把 deck 抬到整条 composer 带之上**（`floatTopFor/ reserveHeightFor` 加 `lift`，
   实测 deck 抬到 1126、预留 46→92px）→ 数据上操作行整条露出，但**用户实机反馈
   「有问题，并且很大」**（未描述细节，可能是位置跑了/预留过大/投影错位）。
   这一版在分支最后一次提交 `ba8cb89`，可作为起点。

#### 建议的调查起点

- 先复现并**截图**，明确「操作行」与「composer 带子」的几何关系；
- 优先怀疑：deck 的 `top` 基准点（`[data-composer-overlay]` 锚点）在打字态是否
  仍等于卡片上沿；以及 composer 根容器在打字态的高度是否变化（本轮未测到，
  但采样可能错过了同一帧内的变化）；
- 若要重新加诊断，走 `localStorage`（渲染进程 `console` **不落盘**，见 §5.4）；
  leveldb 压缩后会读不到，要即时读最新的 `*.log`。

#### 当前已发布的行为（回退后的基线）

代码停在 `94fc0ca`：deck 贴在卡片上沿 10px、预留 46px —— 即**该问题存在但未被放大**。
`deck-experiments-20261017` 分支里的实验提交**不要直接合并**，只作参考。

---

## 6. 提交规范

本机没有全局 git 身份，提交必须显式给：

```sh
git -c user.name="blancatora" \
    -c user.email="blancatora@agent.qq.com" \
    commit -m "type(scope): 摘要" \
    -m "Generated-by: blancatora (DeepSeek Harness / deepseek-v4.1-flash)" \
    -m "AI-Disclosure: 本提交由 AI 编码代理生成；可能含未经人工复核的改动。"
```

- 用 `Generated-by:`，**不要**用 `Co-Authored-By:`（不冒充人类共同作者）。
- **不要 `git push`、不要建远端、不要发 PR/issue**：本项目对外发布需用户明确同意。
- 公开内容一律不得出现：私人邮箱、内网 IP、`/home/<用户>/` 绝对路径。

---

## 7. 发布

**完整清单见 [docs/RELEASING.md](./docs/RELEASING.md)**（它落实的是工作区规范
`docs/RELEASE-STANDARDS.md` 的六步流程：文档齐套 → 全面脱敏 → 测试可复现 →
打包核对 → 推前硬闸 → 授权发布）。这里只列硬红线：

1. **推送前必须问用户**（全局规范：push / 建远端 / 发 PR 都要明确同意）。
   本仓库**目前没有远端**，首次公开需要先建仓库。
2. 推送前启用本地硬闸（每个 clone 一次）：`git config core.hooksPath .githooks`。
   `.githooks/pre-push` 会重跑：构建 + 全量测试 → 产物同源 → 脱敏 → 工作区干净。
   **不要 `--no-verify` 绕过。**
3. 脱敏红线：公开文件与**截图**里不得出现私人邮箱、内网 IP、`/home/<用户>/` 绝对路径。
   README 的安装示例用 `file:/abs/path/to/...` 占位符。
4. 收录靠 GitHub topic `dsh-plugin`（dsh-plugin.org 定期扫描，无需申请）。
5. 插件展示元信息走 `locale/en.json` 的 `meta.title` / `meta.description`，
   `package.json` 需开放 `./package.json`、`./locale/*.json`、`./icon`。

## 8. 目录速览

```
src/
  index.js            Host 侧：注册同源路由（草稿读写）
  client.js           客户端入口：apply() 装配所有表面
  plugin-card.js      插件详情页的设置卡片（primitives 拼装）
  settings-face.js    设置面（volatile 折叠 + 默认值收敛）
  native-switches.js  「原生输入框增强」开关的客户端存储
  mode-controller.js  native / editor / extended 三态 + 插槽 hooks 快照源
  native-composer.js  扩展输入框与「原生高级回车」的 DOM 控制器
  extended-bar.js     deck（符号/缩进工具条）+ 行号沟槽
  floating-bar.js     deck 的定位与预留
  float-position.js   纯函数：floatTopFor / reserveHeightFor
  composer-rows.js    行几何（块尾 <br> 规则）
  panel.js            编辑器面板（模式一）
  locale.js / constants.js / css.js / io.js
test/                 单元 + 集成 + electron 离屏几何
docs/                 demo-long-prompt.md（长 prompt 示例）、RELEASING.md、screenshots/
.githooks/pre-push    推送前硬闸（需 git config core.hooksPath .githooks 启用）
lib/client.js         构建产物（提交）
locale/en.json,zh.json 插件展示元信息 + 文案
```
