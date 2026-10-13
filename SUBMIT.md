# 收录进插件市场（awesome-dsh-plugin）

**目标**：让用户能在「设置 → 插件市场」里搜到 `dsh-brake-pedal` 并一键安装。

这个市场**不是自动扫 GitHub 的**。它读的是人工审核的目录
[`awesome-dsh-plugin`](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)（当前 4,579 条），
卡片上的「安装」按钮、星数、下载量都是收录后生成的数据。所以**必须提 PR**。

---

## 0. 前置条件自查（2026-10-13 核对）

| 要求 | 我们 | |
|---|---|---|
| `package.json` 声明 `dsh.bundle` | `"bundle": { "patch": "./cordis.patch.yml" }` | ✅ |
| 仓库根有 `cordis.patch.yml` | 有 | ✅ |
| 真实可用的代码 | 673 行客户端 + 210 行宿主 + 34 项自检 | ✅ |
| 仓库创建满 **1 天** | 2026-10-09 创建 | ✅ |
| 仓库有 `dsh-plugin` topic | 有 | ✅ |
| 描述不带营销词、且**必须与代码相符** | 见下面的文案 | ⚠️ 唯一要小心的地方 |
| 官方 `@deepseek-ai/*` 用 `peerDependencies` 声明 | 已补（可选 peer + `engines.dsh`） | ✅ |

> 规范原话：**描述会被当作对插件的声明，并与代码核对。夸大是让一个本来不错的插件被打回的主要原因。**
> 所以下面那句英文只写它实际做的事，一个形容词都不加。

## 1. 需要提交的内容

在 awesome-dsh-plugin 仓库里**新增一个文件**（一个文件就是全部投稿）：

`data/plugins/zhanshenovo__dsh-brake-pedal.yml`

```yaml
url: https://github.com/zhanshenovo/dsh-brake-pedal
name: zhanshenovo/dsh-brake-pedal
category: fun
screenshots:
  - assets/cover-16x9.png
description:
  en: An easter-egg brake-pedal self-test. A draggable pill in the DSH web UI runs six full-force braking stomps; the bracket snaps at a random stomp between #2 and #6 and a fictional notice appears. Its figures come from real session facts, and it never intercepts the real stop action.
  zh: 制动踏板自检彩蛋。DSH 网页界面上有一颗可拖动的胶囊，做 6 脚全力制动测试，支架随机断在第 2–6 脚，随后弹出一份虚构通报。上面的数字来自真实会话事实，且从不拦截真实的停止动作。
```

**分类选 `fun`**：`tools` 下已经有一个 `Mlte0907/dsh-brake`（会话死循环刹车器，功能性插件），
放 `tools` 会与它正面重复；`fun` 正是为整活类准备的。

**关于 `tarball:` 字段**：规范允许指向预构建包，但**资产名不能带版本号** ——
`releases/latest/download/` 只解析 `latest`，文件名是照字面取的，带版本号的话
**你下次发版它就会静默 404**。所以本仓库额外发了不带版本号的 `dsh-brake-pedal.tgz`；
想用这个字段就填：

```yaml
tarball: https://github.com/zhanshenovo/dsh-brake-pedal/releases/latest/download/dsh-brake-pedal.tgz
```

**关于 npm**：收录**不要求**发 npm（"listing is unaffected either way"）。
但如果发了，`package.json` 的 `repository` 字段必须指回本仓库，否则两者不会关联 —— 已经填好了。

## 2. 提 PR 的步骤

```bash
# fork 并克隆
gh repo fork awesome-dsh-plugin/awesome-dsh-plugin --clone
cd awesome-dsh-plugin

# 新增条目文件（内容见上）
mkdir -p data/plugins
# …把 YAML 写进 data/plugins/zhanshenovo__dsh-brake-pedal.yml

git checkout -b add-dsh-brake-pedal
git add data/plugins/zhanshenovo__dsh-brake-pedal.yml
git commit -m "Add dsh-brake-pedal"
git push -u origin add-dsh-brake-pedal
gh pr create --title "Add dsh-brake-pedal" --body "An easter-egg brake-pedal self-test for the DSH web UI. Repo declares dsh.bundle; screenshots declared in the repo."
```

**不要手工编辑那两个 README** —— 它们由 `data/plugins/*.yml` 生成，合并后自动重建。
也**不要动别人的条目**，PR 里改到既有条目会被 gate 列出来追问。

## 3. CI 会依次查什么

1. 每个 PR 最多 3 条（我们 1 条）
2. `dsh.bundle`（从仓库 `package.json` 读）
3. 仓库满 1 天
4. `awesome-lint` + 站点构建（双语一致性、分隔符、日期、截图）

失败会明确指出改什么，在同一分支推修复即可，不用重开 PR。

## 4. 合并之后

- 网站夜间重建，市场下一次拉取目录时就能搜到；收录条目里会带
  `install: dsh plugin add github:zhanshenovo/dsh-brake-pedal`
- 卡片上会显示「未声明宿主要求」→ 加了 `engines.dsh` 和 peer 之后会显示具体版本要求
- 星数与下载量会自动采集；**没有 npm 包就没有下载量数字**（条目照常工作）

## 5. 要避免的坑

| 坑 | 后果 |
|---|---|
| 描述里写"评测/安全/实测"之类 | 与代码不符，被打回；也踩我们自己的免责红线 |
| 描述里出现任何真实厂商名 | 同上，而且违反本插件的定位 |
| `tarball:` 用了带版本号的文件名 | 下次发版后链接静默 404 |
| 手工改 README | 行号移位会改到邻居的条目 |
| 只声明 `dsh.client` 没有 `dsh.bundle` | 最常见的被拒原因（我们没这个问题） |
| 一个 PR 塞多个插件 | 上限 3 条，超了直接拒 |
