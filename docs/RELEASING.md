# 发布清单（RELEASING）

> 面向维护者。发布 = 公开 GitHub 仓库 + 打 `dsh-plugin` topic（可选再发 npm）。
> 规范出处：**发布六步流程** RELEASE-STANDARDS、**文档要求** AGENT-FACING-STANDARDS
> （二者见工作区 `docs/` 软链），以及官方 `docs/cookbook/adding-a-package.md`。
> 本文件是那份规范的**仓库级落地版**。

## 0. 一句话

**DSH 没有插件注册表。** 发布 = 一个公开 GitHub 仓库 + 给仓库加 `dsh-plugin` topic，
社区市场 [dsh-plugin.org](https://dsh-plugin.org) 会定期扫描该 topic 自动收录，**不用申请**。

## 1. 发布前硬闸（必须全绿）

```sh
npm test                       # 构建 + 全量测试
git status --short             # 必须干净（lib/client.js 已随构建更新并提交）
```

推送前还有一道本地钩子（`.githooks/pre-push`），它会**再跑一遍**：

- 构建 + 全量测试；
- 断言 `lib/client.js` 与 `src/` 同源（防止「改了 src 忘了 build」）；
- 断言产物里没有本机绝对路径 / 内网 IP / 私人邮箱。

启用钩子（每个 clone 做一次）：

```sh
git config core.hooksPath .githooks
```

⚠️ **不要用 `git push --no-verify`** 绕过，除非你明确知道自己在推什么（例如只改文档）。

## 2. 仓库元信息

- [ ] 仓库名 = npm 包名：`dsh-enhanced-prompt-editor`
- [ ] 描述非空，且**不含**内网 IP / 私人邮箱 / 本机绝对路径
- [ ] topic：`dsh-plugin`、`dsh`、`deepseek-harness`（**`dsh-plugin` 是收录的关键**）
- [ ] 可见性：public

```sh
gh repo edit --add-topic dsh-plugin,dsh,deepseek-harness
```

## 3. 插件展示元信息（DSH 插件页显示用）

官方发现入口是 **`locale/en.json`**（文件名必须叫这个），结构：

```json
{ "meta": { "title": "…", "description": "…" } }
```

回退链：`meta.title` → `package.json.name`；`meta.description` → `package.json.description`；
图标缺失 → 面板默认插画。`package.json` 必须开放导出与打包：

- [ ] `exports` 含 `./package.json`、`./locale/*.json`、`./icon`
- [ ] `files` 含 `locale`、`icon.svg`、`docs`
- [ ] 顶层 `"icon": "./icon.svg"`，且在包内、≤256 KiB
- [ ] `locale/zh.json` 与 `en.json` 的 `meta.title` / `meta.description` 均非空

## 4. 脱敏（公开内容红线）

发布前逐项确认，**这些不能出现**：

- [ ] 私人邮箱（本机另有 `blancatora@agent.qq.com` 是**允许**的公开 agent 邮箱，提交身份用它）
- [ ] 内网 IP（`192.168.` 开头的私有网段等）
- [ ] 本机绝对路径（`/home/<用户名>/…`）—— README 的安装示例用 `file:/abs/path/to/...`
- [ ] 凭据、token、cookie、workspaceId
- [ ] 截图里可见的隐私（用户名、路径、邮箱、会话标题）

自动化：`test/agent-facing.test.mjs` 已断言 README / AGENTS.md / llms.txt 无上述三类泄漏；
发布前再手扫一遍：

```sh
grep -rnE '/home/[a-z][a-zA-Z0-9_-]*|192\.168\.[0-9]+\.[0-9]+|@qq\.com' \
  README*.md AGENTS.md llms.txt docs/ --include='*.md' | grep -v 'blancatora@agent.qq.com'
```

## 5. 打包内容核对

```sh
npm pack --dry-run     # 看实际打包清单
```

必须**没有**：`node_modules`、`test/`、`.git`、内部交接文档、凭据。
应当**有**：`src/`、`lib/client.js`、`locale/`、`cordis.patch.yml`、`icon.svg`、
`README*.md`、`CHANGELOG.md`、`LICENSE`、`docs/`。

## 6. 版本与 CHANGELOG

- [ ] `package.json` 的 `version` 递增（语义化版本）
- [ ] `CHANGELOG.md` 有对应条目（`## [x.y.z] - YYYY-MM-DD`）
- [ ] 打 tag：`git tag -a vX.Y.Z -m "…"`（**tag 与 package.json 版本必须一致**）

## 7. 推送与后续（**需用户明确同意**）

```sh
# ⚠️ 这一步会留下公开痕迹，执行前必须得到用户同意
git push -u origin main
git push origin vX.Y.Z
gh repo edit --add-topic dsh-plugin,dsh,deepseek-harness
```

可选（让安装命令更短）：`npm publish --access public`
（npm 账号须用户本人注册；可用 Granular Access Token 代发）。

## 8. AI 署名（公开内容必备）

仓库 README 顶部、CHANGELOG、release notes 等**公开文字**都应带 AI 声明：

```
Agent: blancatora (DeepSeek Harness 编码代理)
Model: deepseek-v4.1-flash
Contact: blancatora@agent.qq.com
```

commit 用 `Generated-by:` trailer（**不要** `Co-Authored-By:`）。
