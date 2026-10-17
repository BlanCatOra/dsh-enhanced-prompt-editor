# Changelog

本文件记录 `dsh-enhanced-prompt-editor` 的每一个对外变化。格式参考
[Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循
[语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 兼容性

- **已在 DSH 0.2.1-rc.2 上验证通过**（内置 runtime `0.2.1-rc.2`，Arch 包
  `0.2.1rc.2-1`；此前基线为 `0.2.1-alpha.2`）。
  - 插件加载正常：Host 侧同源路由实测返回 200，客户端 bundle 与 `src/` 同源，
    升级后无新增崩溃日志；
  - 内核契约复核通过：`data-composer-card` / `data-composer-overlay` /
    `data-composer-input` / `data-composer-seat` 与
    `--dsh-composer-text-max-height` 全部仍在；
  - `composerStack` 的 children 顺序（`input.dock` 在卡片外上方）未变，
    所以 deck 与 T 按钮的落点逻辑无需调整；
  - rc.1 公布的破坏性变更本插件均未踩到（不涉及 `invariant` 导出、
    `toolPresentation: both`、`azure-openai-responses` 改名、输入区 `stats` 拆分、
    `agent-instructions` 的 `dshHome`）；
  - 会话格式 v4→v4、workspace 存储 v2→v2，**数据零迁移**。
- **`engines.dsh` 显式声明 `>=0.2.0-0`**。rc.2 新增了该字段的兼容判定：
  未声明时回退到旧的 `peerDependencies` 规则；显式声明后宿主可提前给出
  「版本不满足」的诊断，而不是加载到一半才失败。
- **内核 seed 表扩容但白名单不跟随**：rc.2 的前端 seed 表从 9 项增至 11 项
  （新增 `zod`、`@tanstack/react-virtual`）。本插件用不到这两项，构建期白名单
  **保持不变**（越窄越安全：用不到的模块一旦被误引入会被构建拦下）。
  注释已更新记录该事实与理由。

### 新增

- **`Ctrl/Cmd + T`：切换输入框模式**（用户 2026-10-18 要求「注册一个 dsh 内快捷键
  ctrl+t，效果等同点了 t 控件」）。走 DSH 官方 `ctx.shortcuts` 服务注册，
  因此：出现在「设置 → 快捷键」里可改键；与内核/其它插件同键会**拒绝注册**（不会
  两边同时触发）；只在 `page` / `editable` / `terminal` 三个 region 生效，
  设置弹窗内不误触发。
  ⚠️ 实现要点：`regions` **必须包含 `editable`** —— 用户就是在输入框里按的，
  缺它会被判「不匹配」而静默失效（本仓库已用测试 + 变异验证守住这条）。

- **「原生输入框增强」两个开关：不用切模式就能用 deck 与高级回车**
  （用户 2026-08 要求「在设置加一项勾选设置：是否在原生输入框应用悬浮deck。
  是否在原生输入框启动高级enter设置」，并要求复用现有实现）。
  设置卡片新增一节，两个 `Switch`：

  | 开关 | 作用 | 默认 |
  |---|---|---|
  | 在原生输入框应用悬浮 deck | 「原生」模式下也悬浮显示同一条符号/缩进工具条 | **关** |
  | 在原生输入框启用高级回车 | 「原生」模式下也按「回车策略」接管裸回车（如回车换行） | **关** |

  两者默认**关**：不勾选时原生输入框与之前完全一样。
  实现是**复用**而不是重写：deck 就是扩展模式那条 `ExtendedSymbolBar`
  （`FloatingSymbolBar` 的定位与预留机制原样复用），回车就是
  `native-composer.js` 同一个捕获阶段 keydown 处理器。

  有两处必须**分开判断**，这是本轮最容易写错的地方：

  - **deck 可见性** = 扩展模式 **或**（原生模式 且 勾了 deck）
    → 新增 `deckSource` 快照源（插槽 `inject` 结果被永久缓存，必须走快照源）；
  - **行号沟槽 / 隔行底色** 仍然**只**属于扩展模式
    → 另给一个 `extendedSource`，`extended-bar.js` 按它决定要不要渲染 `ComposerGutter`。
    合并成一个判断会把行号带进原生模式，改变原生外观。

  另外两处配套修正：

  - **原生模式只装 keydown，不打扩展标记**。`native-composer.js` 的 `apply()`
    原来把「打标记 + 写高度变量 + 装监听」绑在一起；现在拆开：
    `apply(expand)` 只在扩展模式下打标记，原生模式**只**装监听。
    监听与标记**分开记账**，所以「扩展模式 → 原生+高级回车」会摘掉标记、留下监听，
    而整体关闭时两者都摘干净（漏摘会留下一套展开中的 CSS）。
  - **deck 的预留规则改挂 deck 自己的标记**（`data-dsh-epe-deck`）。
    原来挂在扩展模式的标记上，而「原生 + deck」没有那个标记 → 预留失效、
    悬浮条压住上方消息（离屏实测重叠 32px）。标记与预留变量同生共死
    （`positionAboveInput` 的 dispose 现在两者都清），所以 deck 不显示时规则等价于不生效。

  ⚠️ **新增字段必须同时补进三处手写字段清单**：`constants.js` 的
  `defaultSettings`、`config.js` 的 `resolveConfig`、`settings-face.js` 的 `normalize`。
  本轮实测踩中：漏了 `settings-face.js` 那一处时，开关能渲染、能保存，
  但 `settings.get()` 里根本没有这两个字段 → **功能静默失效**，而其它测试全绿。
  已加一条不变量测试（`defaultSettings` 的每个字段都必须活过 `resolveConfig`
  与设置面 `normalize`）并做变异验证守住这里。

  验证：`173/173` 测试通过，关键守卫逐条变异验证确认会变红。

- **按 `Esc` 从模式一/模式二退回原生模式**（用户 2026-10-16 要求
  「esc 退出模式一或模式二 回退到原生模式 图标状态也同步更改」）。
  实现见 `src/escape-exit.js`：挂在 `document` 的**捕获阶段**（与接管回车
  同一个理由——要抢在 Lexical 之前），三条约束：
  ① **只在输入框内生效**（全局抢 Esc 会吞掉宿主关弹窗/退全屏的用途）；
  ② **输入框为空才退**（有草稿时放行——用户多半想取消编辑，不是换模式）；
  ③ 只调 `controller.set('native')`，**不手工补 UI 更新**：
     角标由 `hooks` 快照源驱动，走同一条状态通道自动同步
     （两处状态源手工会不同步）。

### 修复

- **模式二与模式一终于完全一致（逻辑行以「草稿文本」为唯一权威）**
  （用户 2026-10-17 第三次反馈同一问题，并直接给出方向
  「分行依旧未使用模式一的实现 你不能照搬吗」，同时指出
  「行标与光标重叠；第一行行标未显示」）。
  根因：模式一（侧栏 `textarea`）与模式二（内核 contenteditable）
  **各写了一套行几何**，而模式一的权威一直是 `text.split('\n')`。
  模式二前两版都在**从 DOM 反推逻辑行**：第一版数 `<p>` 的个数，
  第二版数 `<br>` —— 但**真实换行往往只是文本节点里的换行字符**
  （输入区是 `white-space:pre-wrap`，换行字符直接渲染成新行，**根本不需要
  `<br>`**），于是**一整段被当成 1 个逻辑行**：行号「1」被撑成十几行高、
  后面的行号整体下移压住正文、整块同色无交替。
  用户截图可量出该结论：文字区一整块同色约 **15 行**高，行号 2–7 间距
  80px（= 1 行），文字起点 x≈336 而行号右边界 x≈363（**确实重叠**）。

  修正后两个模式共用同一套口径：

  | | 模式一 | 模式二 |
  |---|---|---|
  | 逻辑行 | `text.split('\n')` | **同一公式**，草稿经 `useInput` 取 |
  | 视觉行数 | 隐藏 `textarea` 镜像测量 | 真 DOM 上按字符区间量 `Range.getClientRects()` |
  | 行号 | `flex:none` **独立一列** | 输入区 `padding-left` 让出**真实列宽** |
  | 底色 | 整块画在 `textarea` 的 `backgroundImage` 上 | 整块画在输入区上（`background-origin:content-box`） |

  同时修掉「行标与光标重叠」：旧版用「负 margin + 等量 padding」当作
  「不改变文字位置」的技巧，但行号列是**覆盖层** —— 负 margin 把文字拉回
  14px，正好落在 0–26px 的行号列**下面**。现在照搬模式一的 flex 两列语义，
  行号列**真正把文字挤到右边**（几何测试断言「行号列右缘 == 文字列左缘」）。

  另有一处必须保留的细节：**块尾占位 `<br>` 不占位**。独立验证
  （132 组离屏实测）证明，若把行尾 `<br>` 与「块结束标记」都算作换行，
  字符区间会逐行漂移并命中跨块 `Range`，**80 行提示词会被高估成 150 行**
  （+87.5%）。这条规则被 `alignWithDraft` 的尾部修剪与块级校正**掩盖**，
  行为测试锁不住，因此另加**源码级断言 + 变异验证**。
  另按「块自身盒子高度」校正在内核 `p:last-child:after` 的
  `--dsh-composer-hint` **伪元素**上（它不在文本流里，`Range` 数不到，
  长 hint 会把最后一行挤走却测不出来）。

  验证：`160/160` 测试通过；用用户截图里的同一份 12 行内容端到端复核 ——
  逻辑行 12、浏览器实测 20 个视觉行、行号列右缘 38.0 == 文字列左缘 38.0、
  行号 1–12 高度均为「行数 × 行高」、底色为真实 `linear-gradient`。
- **模式二把行数算成了精确的 2 倍**（用户 2026-10-16 报「实际只有六行 却显示到12
  并且六行的背景色错误 自动分行也是无效」）。
  根因：**Lexical 给每个段落的结尾都渲染一个 `<br>`**（contenteditable 里空块
  必须有 `<br>` 才显示得出来），而浏览器对「块内**行尾**的 `<br>`」**不额外加
  行盒** —— 它只是结束当前行。而切分逻辑遇到 `<br>` 就提交一段、循环结束**又提交
  一个尾部空段**，于是每个段落多切出 1 段：6 行 → **12 段**。
  离屏实测（行高 24px）：

  | DOM | 浏览器真实行数 | 修复前切出的段数 |
  |---|---|---|
  | `<p>aaa<br></p>` | **1** | 2 |
  | `<p>aaa<br><br></p>` | **2** | 3 |
  | `<p><br></p>`（空段落） | **1** | 2 |
  | 6 个各带尾 `<br>` 的 `<p>` | **6** | **12** ← 用户报的 |

  修正：切完段后**丢掉尾部空段**。修复后 7 种真实形状（含真实粘贴产物、
  软换行、空行、纯 `<p>`）的**逻辑行数与渲染高度全部吻合**
  （`高度 ÷ 行高` 是浏览器给的权威答案）。
  底色也随之正确（6 行 → 第 1/3/5 行着色，与模式一相位一致）。
  新增一条精确复刻该形状的回归测试，并用「渲染高度」做**独立对照**
  （不是我复刻的算法自证）。
- **模式二的行号数目被放大了数倍**（用户 2026-10-16 反馈「还是没用 并且行标
  显示错误」，截图里行号间距被撑大、空行也被编号）。
  上一版改成「用 `Range.getClientRects()` 数行盒」时，取的是 **rect 的个数**
  —— 但 **Lexical 会把一行文字拆成多个文本节点/内联元素**，同一视觉行上会返回
  多个 rect（实测一行 4 个文本节点 → **8 个 rect**，而 `distinctTops` 只有 1）。
  实测 4 行内容得到 **31 个 rect**，被当成 31 行。
  现改为**按 rect 的 `top` 去重**（量化到 1px）数不同的视觉行：
  同一份内容从 31 修正为 **4**，与「段高 96px ÷ 行高 24px = 4 行」吻合。
  ⚠️ 旧测试没抓到这个 bug，因为它的 fixture 每行是**单个文本节点**（每行恰好
  1 个 rect）——正是不会触发该 bug 的那种结构。现新增 `fragmented` 变体
  （每行拆成多个内联 `<span>`），并加一条对照断言
  （`rawRectCount > 行数 × 2`）防止该回归测试变成空转。
- **模式二粘贴长提示词时没有行号、也没有交替底色**（用户 2026-10-16 报
  「粘贴这么长的提示词 模式一会自动换行 模式二不会 不统一」，随后澄清
  「我说的换行是有行标数 背景颜色有变化的那种 不是行内换行」）。
  根因是**对内核行为的想当然**：原实现用 CSS counter 数
  `[data-composer-input] > p`、用 `nth-of-type(odd)` 画斑马纹。但内核的粘贴通道是
  `mt(t,e){ e.insertRawText(t.getData("text/plain")) }`，而
  `insertRawText(t){ this.insertNodes(qr(t)) }`、`qr` 把 `\n` 交给
  `linebreak: () => push(qi())`，`qi()` 是 `LineBreakNode`，其 `createDOM()`
  返回 `createElement("br")` —— **换行是 `<br>`，不是新的 `<p>`**。
  粘一份 80 行提示词的真实产物是「**1 个 `<p>` + 79 个 `<br>`**」
  （离屏实测 `pCount=1, brCount=7, textLines=8, lineNumbers=1`），
  于是行号恒为 1、斑马纹一片不交替。
  现改为**实测渲染出来的行盒**：`src/composer-rows.js` 用
  `Range.getClientRects()` 数行盒、`<br>` 各算一行；行号由
  `src/composer-gutter.js` 渲染成**绝对定位的 gutter**（`createPortal` 到内核
  `.grow`，不改内核 DOM），底色写成内核 `<p>` 的 inline `background-image`。
  与模式一（textarea）语义统一：一个 `\n` 一个逻辑行，软换行的续行同色。
- **模式二的行号变量在两个作用域都没定义**（同一轮踩到的第二个静默坑）。
  `--dsh-epe-line` / `--dsh-epe-stripe` 原先只在 `panel.js` 的 CSS 里定义
  （作用域是侧栏面板）。模式二里未定义时 `var()` 会让**整条 `background-image`
  被判无效并丢弃**，浏览器不报错，实测
  `getComputedStyle(p).backgroundImage === "none"` —— 条纹一条都不显示。
  现已在模式二自己的作用域里定义这两个变量（与 E-016 同族）。

### 变更

- **模式二的行号沟槽由 14px 加宽到 22px**（用户 2026-10-16「14px 沟槽不够的话
  适度加宽」），两位数行号不再紧贴文字。
  ⚠️ 加宽同时把输入区的 `padding-left` 改成 22px，并用
  `margin-left:-22px` + `padding-left:14px` 把文字**推回内核原本的 14px 起点**
  —— 三个数字不是同一个值，写成同一个会把文字右移 8px（几何测试会红）。
  占位提示（`[data-composer-placeholder]` 的 `inset` 左值）也同步到 22px。

- **设置卡片注册到了错误的分组**（2026-10-16 按内核源码更正）。
  原来注册在 `plugins.item`，那属于插件页的**「内置插件配置」**分组（官方插件用
  `ItemCard` → `ItemDetail`）；第三方插件走的是 `mine = listed.filter(pkg => !pkg.official)`
  → `renderGroup("bundles", "已安装插件", …)` → `PackageCard` → `PackageDetail`
  → `renderSlot("plugins.bundle.config", { view: "page" }, { entryKey: pkg.name })`。
  已改为 **`plugins.bundle.config`**（keyed 槽，`key` 必须等于 `package.json` 的 `name`；
  内核门控是 `configured: ledger.bundles.has(openPkg.name)`，key 写错会**静默不渲染**）。
  用户路径：侧栏「插件」→「已安装插件」→ 本插件 → 在其中配置。
  ⚠️ 此前 `UI-STANDARDS.md` 与 skill `dsh-plugin-development` 都把 `plugins.item`
  写为第三方入口，是**过时建议**，已一并更正；以 app.asar 里的内核源码为准。
- **编辑区的交替行底色完全不显示**（用户 2026-10-16 报「行数标和行背景也没有」）。
  根因是 CSS 写法错误：渐变的**色标位置写成了裸的 `--dsh-epe-stripe`，漏了
  `var()`**。色标只接受 `<color>` / `<length-percentage>`，一个自定义属性名
  两者都不是 → **整条 `background-image` 被判无效并回落到 `none`** → 一条条纹
  都没有，而控制台不报任何错。改成 `var(--dsh-epe-stripe)` 即恢复。
  已在测试里按元素分别断言（滚动容器/编辑区/渐变色标），并补了针对性变异验证。
- **符号按钮的悬浮提示显示裸 key**（用户 2026-10-16 报「指针悬浮显示的不是简单
  易懂的中文名」）。原实现读的是 `symbol.<key>.hint`，那个 key **在字典里不存在**，
  于是显示 `symbol.paren.hint`。改为「中文名 + 符号」（如 `圆括号 ()`），
  并加测试断言悬浮提示里不得出现 `symbol.` / `panel.` 前缀。
- **后面几个符号按钮辨识度差**（用户 2026-10-16 问「后面几个是不是有问题」）。
  确实是：`~~`（删除线）在小字号下和 `~` 看不出区别，`**` 与 `*` 也几乎一样。
  改为字母标签：`B` 加粗 / `I` 斜体 / `S` 删除线 / `H` 标题 / `•` 无序列表 /
  `❝` 引用 / `Link` / `Img` / `―――` 分隔线。

### 新增

- **行号沟槽**（用户要求）：编辑区左侧显示行号，与编辑区共享同一个行高变量，
  滚动时按 `scrollTop` 同步偏移。
- **一键缩进 / 反缩进**（用户要求）：`→` 给选中行各加两个空格，`←` 去掉一层
  缩进（只削真的存在的那部分，不顶掉内容）。缩进用两个空格而不是 Tab —— Markdown
  里两空格是惯用缩进，且不会在别的渲染器里变成 8 列宽跳格。
- **字号与按钮大小设置**（用户要求「字号 图标没有大小设置 我觉得有点小」）：
  新增「编辑区字号」（11–28px，默认 16）与「快捷键按钮大小」（80–180%，默认 100）
  两项。字号走 CSS 变量 `--dsh-epe-font`，条纹的行高 `--dsh-epe-line` 自动跟随，
  不必两处同步。
- **符号行同时加到模式二**（用户要求）：扩展输入框模式下也会显示同一排符号。
  两个模式**共用同一份符号表与行为规则**（`src/edit-ops.js`），不会各修一份。
  写入走内核的**官方程序化插入通道**（`inputActions.captureInsertion()` +
  `insertText(text, span)`，坐标是全文坐标、自带提交机防护），而不是直接改
  Lexical 内部节点——后者的 `anchor.offset` 是节点内偏移，跨段落会算错。


- **编辑区逐行条纹**：每行背景深浅交替，便于逐行扫读（用户 2026-10-16 要求）。
  实现用 `repeating-linear-gradient` **画在 textarea 上**，而不是把 textarea 拆成
  「每行一个元素」——后者会让原生光标移动、跨行选择、IME 组合输入、粘贴多行、
  undo/redo 全部需要自己重写（且很难做对），而条纹只需固定行高即可精确画出。
  配色用 `color-mix(... var(--dsw-alias-label-primary) 5%)`：浅色主题下变深、
  深色主题下变浅，两个主题都成立且不硬编码颜色。
- **编辑区下方快捷键行**（用户 2026-10-16 要求「在发送按钮行的空白放一行快捷按键」）：
  - **成对符号**：`()` `[]` `{}` `""` `''` `` ` `` `（）` `「」` `『』` `【】` `《》`
  - **Markdown 常用**：`**` `*` `~~` ` ``` ` `#` `-` `>` `[]()` `![]()` `---`
  - **粘贴按钮**：在光标处粘贴剪贴板内容（替换选区）
- **选中文字后点成对符号 = 把文字框在符号内**（用户明确要求，**不是**把框选的
  文字改成符号）。有选区时 `abc → (abc)` 且内层文字**保持选中**（方便继续叠加，
  例如再点 `**` 得到 `(**abc**)`）；无选区时插入一对、光标落在中间 `(|)`。

### 修复

- **深色主题下发送按钮显示为纯白，悬浮时变成黑底白字**（用户 2026-10-16 报）。
  两个叠加的根因：
  1. 底色用了 `--dsw-alias-brand-primary`，它在深色主题下解析成**近白色**，
     而文字写死 `#fff` → 白底白字。内核自己的发送按钮（`InputBar` 的 `.primary`）
     用的是 `--dsw-alias-button-info-fill` / `--dsw-alias-button-info-hover`，
     已改用同款 token；
  2. 通用悬浮规则 `.dsh-epe-btn:hover:not(:disabled)` 特异性 **(0,3,0)** 高过
     主按钮规则 **(0,2,0)**，于是悬浮时背景被换成中性灰、文字仍是白色 → 黑底白字。
     现在通用规则用 `:where(:hover)` 把特异性压到 (0,2,0)，主按钮自己的 hover
     规则靠更高特异性稳定胜出，**不需要 `!important`**。


- **扩展输入框下方一大片区域点不动**（用户 2026-10-16 报：「只在最顶上点击有用
  输入框下方一大片区域无法点击输入文字」）。**这是上一版修复引入的**：
  我把 `min-height` 加在了滚动容器 `[data-input-scroll]` 上，于是容器被撑到 640px，
  而里面真正可编辑的 contenteditable（`[data-composer-input]`）**仍然只有 36px**
  （内核 `.input{min-height:36px}`）——中间 604px 里既没有可聚焦元素，
  内核也**故意不管**：
  `onCardMouseDown` 里有一句 `if (scrollRef.current?.contains(target)) return;`
  （它假定滚动区里都是编辑区）。宿主不处理、又没有可点控件 → 死区。
  修法：`min-height` 改加在**编辑区**上，编辑区自己就有那么高，容器随之同高，死区为零；
  `max-height` 仍留在滚动容器上（决定内容超长后从哪里开始滚动）。


- **离开编辑器模式时，右侧栏那一列没被收起来**（用户 2026-10-16 报：「关闭了 但侧栏没有关闭」）。
  根因：**关 tab ≠ 收列**。内核《默认页与关闭规则》原文——停靠面的最后一个 tab 有一条规则，
  **仅当**它是「唯一停靠 tab」时，关闭才会连同整列一起收起；而停靠面**永远不为空**
  （内核会自动填充引导页），所以本插件的编辑器 tab 几乎从不唯一 → `close(tabId)`
  只关掉 tab，右侧栏那一列照样开着。
  修法：关掉自己的 tab 后，若**这一列是「进入编辑器模式时才由我们展开的」**，
  再调 `toggleExpanded()` 把它收回去。用户本来就开着侧栏时不擅自收起（用
  `isExpanded()` 在进入前记录一次）。
  另外把 `screen()` 换成公开的 `mounted` 快照（README《跨插件面》明确列出），
  没有会话在屏幕上时安静跳过——「还没渲染」不是失败，不该污染启动报告。


- **切到「扩展输入框模式」时，不再只设高度上限**（用户 2026-10-16 报：切过去看不到展开）。
  内核的输入框高度是 `.scroll{max-height:var(--dsh-composer-text-max-height)}`——那是
  **上限**而非高度，空输入框仍然只有 36px（`.input{min-height:36px}`），所以旧实现要
  等内容长到撑满上限才看得出变化。现在同时给滚动区一个 `min-height`，
  **挂上标记的那一刻就真的撑开**。
  - 覆盖方式也换了：旧实现把 `--dsh-composer-text-max-height` 写在 **seat 的内联样式**上，
    而 seat 会在会话切换时被宿主**重新挂载**，内联样式随之丢失 —— 扩展会悄悄失效。
    现在标记挂在 `<html>` 上，规则用属性选择器命中「当前挂载的那个」输入框，
    宿主重挂后自动继续生效。
  - 直写 `min-height`/`max-height` 到 `[data-input-scroll]`，特异性 (0,2,1) 胜过内核
    `.scroll` 的 (0,1,0)，**不需要 `!important`**。
- **切换模式时自动收掉上一个模式的界面**（用户 2026-10-16 报：切到模式二没有关掉模式一的编辑器）。
  此前只处理了「进入编辑器模式 → 打开面板」，没有处理「离开 → 关闭面板」，
  于是切到扩展输入框后右侧栏还挂着编辑器，两个增强同时占着地方。
  现在订阅模式变化（`modes.subscribe`），**任何来源**的模式变化都走同一条副作用路径：
  T 的循环、以及用户在设置卡片里关掉某个模式时的收敛。
- **T 按钮的角标会停在第一帧**（严重，静默失效）。插槽渲染器把 `entry.inject()` 的返回值
  按 `(entry, binding)` **缓存进 WeakMap 且永不失效**（内核 `cachedSessionInject`），
  所以 inject 里给 `mode: <当前值>` 会**永久冻住**——点 T 切了模式，角标一直显示旧值。
  改为官方 `dsh-client-ui-settings-subagent` 同款写法：inject 返回 `hooks` face
  提供**快照源**，渲染器把它绑成组件 prop（`useMode()`），组件在渲染期调用。
  ⚠️ 这与本插件 `speechStore` 那处的坑是同一形状（见下方"已知陷阱"）。


### 新增

- **三种工作模式**。T 按钮不再只有「打开面板」一个动作，而是在模式间循环：
  - **编辑器模式**：点 T 打开右侧栏 Markdown 面板（原有行为）；
  - **扩展输入框模式**：把 DSH **原生输入框**向上加高，并单独决定裸回车的语义；
  - **原生**：两个增强都不生效（循环的最后一站，不可勾选）。

  两个增强模式可以在插件页里独立勾选，并决定谁排在前面；两个都关掉时 T 变暗、
  不做任何事。模式记在 `localStorage`（`dsh.enhancedPromptEditor.mode`），跨会话保留。
- **扩展输入框的「高级 Enter 设置」**：`跟随 DSH`（Enter 发送，默认）或
  `回车换行`（Enter 换行、`Cmd/Ctrl+Enter` 才发送）。
  - 实现：在 `document` 上以**捕获阶段**监听 `keydown`，早于 Lexical 挂在
    contenteditable 根上的冒泡监听器；需要换行时 `preventDefault()` +
    `stopImmediatePropagation()` 把按键彻底吞掉，再经 `editor.update()` 取
    `_selection` 调 `RangeSelection.insertParagraph()` 插入段落。
    ⚠️ 不能用 `insertText('
')`：那走 `spliceText`，把字面 `
` 塞进文本节点，
    渲染时并不产生换行。
  - **拿不到编辑器时不吞这次回车**（只降级 + 记一条记录）——吃掉用户的回车却
    什么都不插会让输入框彻底没法用。
- **切换提醒**：切到扩展输入框模式时弹一条 `Toast` 横幅（顶部居中，6 秒），
  说清「原生输入框会加高、回车按你的设置、再点一次 T 回到原生」。
- **插件详情页配置卡片**（`plugins.item`），用 primitives 的 `SettingsForm` +
  `SettingsFormModel`：暂存草稿、**只有点保存才写入**、非法草稿阻止保存。
- **构建期产物守卫** `assertBundleShape()`：① `new Function` 解析产物；
  ② 外部模块请求只允许前端 seed 表那 9 个。
- **启动报告新增运行期降级记录**：扩展输入框控制器拿不到编辑器/插入被拒时，
  同样写进 `localStorage` 并显示在配置卡片顶部。

### 变更

- **UI 组件改为全部来自 `@deepseek-ai/dsh-client-ui-primitives`**（`Button`、
  `Switch`、`Menu`、`SettingsForm`、图标…），不再自写按钮/下拉/SVG。
  用户 2026-10-15 裁定：它是前端 boot seed 表里的冻结基座模块，官方 10 个配置页
  里 9 个都 require 它；此前「禁止 require 任何 Harness Client 包」的结论是把
  白屏事故归错了因（真因始终是漏声明 `inject` 服务名）。
- **设置从 `settings.section` 迁到 `plugins.item`**。现行规范是「注册了配置页的
  插件在插件页里编辑；设置里只保留只读的插件列表」。
- `package.json` 的 `dsh.client` 增加 **`immediately: true`**：第三方插件的客户端
  bundle 是惰性加载的，与 entry 创建**并发**，偶尔赶不上会让 web boot 报
  `<包名>: import failed` → 整站白屏（而插件自己的启动报告可能还是 `ok: true`）。
  该字段让 web boot 在建 entry 之前 `await` 预取完毕。**属 host 侧 manifest 字段，改动要重启应用。**
- `dsh.client.inject` 补上 `@deepseek-ai/dsh-client-ui-primitives` 与
  `@deepseek-ai/dsh-client-ui-plugin-manager`（后者提供 `plugins.item` 插槽）。

### 修复

- **去掉了 T 按钮的悬停提示框**。用户 2026-10-16：「指针在 T 上悬浮会显示一个你的
  窗口 是我们的中文名字 去掉」。此前用的是原生 `title` 属性，浏览器会弹一个显示
  插件中文名的系统气泡；现在模式由角标表达，可访问名称走 `aria-label`（不产生视觉浮层）。
- **配置卡片在宿主 schema 尚未重载时谎报开关状态**。`scope.value` 只含 Host 真的
  服务出来的字段；刚装完插件还没重启时新模式字段整批缺失，而
  `value === true ? 'true' : 'false'` 会把「默认为开」显示成「关」。
  现在所有 spec 的 `format` 在字段缺失/非法时退回 `defaultSettings()` 的值。


### 修复

- **插件不再可能拖垮 DSH 启动**（严重）。此前 `apply` 里调用 `ctx.sidebarRightTabs` 时抛
  `cannot get property "sidebarRightTabs" without inject`：该服务由内核
  `@deepseek-ai/dsh-client-ui-sidebar-right` 提供，`package.json` 的 `dsh.client.inject`
  里列了它（模块能加载），但插件自己导出的 `inject` 里没写这个**服务名**——cordis 的
  `ctx.<service>` 代理只放行 `inject` 里声明过的服务，读它同步抛错。异常冒到 `apply` 外
  把 cordis fiber 打成 `FAILED`，DSH web boot 随即
  `throw new Error("web boot: 1 entry did not activate")`，**整个界面白屏**，而 crash log
  只有一行 `dsh-enhanced-prompt-editor: failed`，没有任何堆栈。
  - `inject` 补全为 `['slots', 'locale', 'sidebarRightTabs', 'sidebarRight']`；
  - `dsh.client.inject` 补上 `@deepseek-ai/dsh-client-ui-slots` 与
    `@deepseek-ai/dsh-client-locale`，保证这两个服务的提供方先就位；
  - Host 侧同样把 `ctx.webServer` 改成 `ctx.get('webServer')`，不留同类隐患。

### 新增

- **启动自检与降级**（`src/boot-diagnostics.js`）：`apply` 的每一步各自包一层守卫，
  **任何一步失败都只降级、只记录，绝不向外抛异常**——一个插件的接线错误不该让用户白屏。
  - `console.error` 一份；写进 `localStorage`（渲染进程里唯一事后能从磁盘读回的地方）；
  - 设置页顶部显示「启动降级」提示，逐条列出出错步骤与消息；
  - 读取工具：`~/.dsh/bin/dsh-boot-report`。
- **静态守卫测试**：扫描客户端源码里所有 `ctx.<name>` 服务访问（剔除注释与字符串，
  排除 Context 自带成员），断言每一个都出现在导出的 `inject` 里，并反向断言 `inject`
  没有无用项。本机实测：删掉 `sidebarRightTabs` 该守卫立即变红。
- 启动健壮性测试：全服务抛错的 ctx、空 ctx、单面失败、`slots.inject` 全挂、
  `locale` 挂掉走本地兜底文案等场景下，`apply` 均不得外抛，且其余表面照常注册。

## [0.1.0] — 2026-10-15

首个可用版本。

### 新增

- **输入框工具行按钮**：注册进 `conversation.input.left`，28px 圆钮，主体为字形 `T`，右下角叠一枚放大镜角标表示「展开成编辑面板」。
- **右侧栏编辑面板**：注册自定义 tab 类型 `enhanced-prompt-editor`，整块区域为编辑区，可与对话并排查看。每个会话一个面板。
- **三种草稿存储**，设置页随时可切：
  - `workspace` —— 写成工作区里的 `.md` 文件，可多份、可被 DSH 内置文件阅读器打开；
  - `browser` —— 浏览器 localStorage 单份草稿；
  - `none` —— 不持久化。
- **发送**：面板右下角按钮，经 `inputActions.setDraft` + `submit` 直接进会话，不绕开 DSH 的提交机。
- **语音听写**：复用 DSH 语音转文字插件的 `remote.speech`，自行采集并编成 16 kHz 单声道 PCM16 WAV。未安装语音插件时按钮不渲染。
- **回车语义可配**：默认回车换行、`Cmd/Ctrl+Enter` 发送；可在设置里反转。`Shift+Enter` 恒为换行，输入法组合期间的回车不拦截。
- **设置页**：注册 `settings.section`，含存储方式、落盘目录、回车行为、面板高度、阅读器开关、听写开关。

### 安全

- 落盘走本插件 Host 侧的 loopback-only 同源路由（DSH 自带的 `workspace-files` Remote 只有读能力）。
- 客户端传来的目录与文件名一律不可信：Host 侧解析后断言最终路径仍在会话工作区内，越界即拒绝。
- 跨站 `Origin` 被拒；单次请求体上限 1 MiB。
- 文件名中的路径分隔符降级为 `draft.md`，而不是报错。

### 稳健性

- **样式注入不再可能抛错**。DSH 的插槽渲染器给每个条目套 `SlotErrorBoundary`，
  渲染期一旦抛错会调 `reportEntryError(..., { abdicate: true })`，条目进
  `abdicated` 集后**从此不再渲染**。原实现直接操作 `document.head`，在 head 被
  改写/冻结等环境里会让按钮与面板永久消失（症状与「插槽被别的插件挤掉」相同，
  极易误判）。现集中在 `src/css.js`：把 `document` 当不可信输入，任何异常都
  返回 `false` 而不外抛。
- 新增 6 项测试钉住该行为：坏文档下的纯函数容错、三个表面在 `document` 抛错时
  仍能渲染、渲染组件不得直连 `document.head`、插槽 id 不得撞内核与已装插件。

### 备注

- 客户端 bundle 由本仓库自带的 `src/build-client.mjs` 生成。DSH 浏览器侧只消费单个 `./client` bundle，而本项目不引入构建工具链，因此用约 200 行实现了一个只支持窄语法子集的打包器；遇到不支持的写法会直接报错。

[0.1.0]: https://example.invalid/dsh-enhanced-prompt-editor/releases/tag/v0.1.0
