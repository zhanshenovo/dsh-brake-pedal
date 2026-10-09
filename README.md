# dsh-brake-pedal

[![CI](https://github.com/zhanshenovo/dsh-brake-pedal/actions/workflows/ci.yml/badge.svg)](https://github.com/zhanshenovo/dsh-brake-pedal/actions/workflows/ci.yml)

[English](README.en.md) | 中文

制动踏板自检彩蛋。右下角多一颗 `🛞 制动自检`，点开就是一场 **6 脚全力制动测试**：
支架**随机**断在第 2–6 脚，偶尔（约 1/8）压根不断，然后弹出一份虚构的《情况说明》。

```
● 自检中止 · 第 4 脚断裂                      会话已运行 14m05s
第 1 脚   1,612 N   ✓ 踏板支架 完好    运行 14m05s
第 2 脚   1,658 N   ✓ 踏板支架 完好    日志 545 KB
第 3 脚   1,704 N   ✓ 踏板支架 完好    21:59 起
第 4 脚   1,750 N   ✕ 砰 —— 支架断裂   轮次 2
────────────────────────────────────────────────────────
踏板力为推导值 ← 会话起始时间 / 已运行时长 / 日志体积 · 断裂位置每次重掷
                     [再来一次（随机）][未复现模式][收起]
```

## 免责声明（重要）

这是一个**开发者自嘲性质的虚构段子**，不是安全评测、不是产品评价、也不是事实陈述。

- 弹窗里那份《情况说明》是**原创的官僚体文本**，不是任何真实声明、公告或回应的引用或改写。
- 它**不指向任何真实企业、品牌、产品或事件**；界面里不出现任何厂商名。
- 面板上的"踏板力""断裂脚次""断口形态"全部是**表演用数字**（其中"踏板力"由会话事实推导，
  界面上标注为推导值）。它们不构成任何技术结论。
- 断裂位置由**确定性伪随机**决定（种子 = 会话 id + 自检次数），所以它只是"看起来随机"，
  不具备任何统计或评测意义。

如果你要在公开场合展示它，请连带这句一起展示：**这是个段子，别当数据看。**

## 三条设计规矩

1. **从不拦截真实停止动作。** 这个插件没有接管 Stop 按钮，也做不到。所谓"6 脚"
   只是浮层上的表演；真实停止只有一次，且由你亲手按下（「挂 P 挡（停止会话）」）。
   任何时候按真实的 `停止` / `Esc Esc` 都能立刻停。
2. **数字不编。** 面板上的"踏板力"是从宿主给的硬事实**推导**出来的：会话起始时间、
   已运行时长、日志体积。界面上明确标注"推导值"。取不到事实时整场标注"演示数据"，
   不会假装是真的。
3. **烂了就消失。** 任何一环失败（slot 注入失败、路由 404、渲染报错）都只写一条
   console 记录，界面保持原样——一个段子不该弄坏界面。

## 随机是怎么随机的

```js
BREAK_ODDS = [0.12, 0.26, 0.24, 0.16, 0.10, 0.12]
//  第2脚   第3脚  第4脚  第5脚  第6脚   未复现
```

种子 = `会话 id + 第几次自检`，走 mulberry32。于是：

- **同一个会话里第一次点开，结果固定**——演示前可以先摇一次，不用现场赌运气；
- **换个会话就换一套**——不同人看到的断点不一样；
- **点「再来一次」才重掷**——想看别的结局随时能看。

这比"每次真随机"更适合演示：既保留惊喜，又不会让关键的那一脚掉链子。

## 「挂 P 挡」到底做了什么

它找不到中断会话的插件 API（Stop 是 shell 的**只读固定动作**），所以只能在 DOM 里
找那个**真实的停止按钮**并按下它，而且找得很保守：

- 先只在编辑器（`contenteditable` / `textarea`）所在的容器里找，最多向上 5 层；
- 按钮名字必须精确等于 `停止` 或 `Stop`；
- 必须可见且未 disabled；
- 找不到就如实说"未找到制动踏板"，绝不去猜别的按钮。

宿主半边只读会话日志文件，只提供 `GET`，写方法一律 405。

## 安装

```bash
git clone https://github.com/zhanshenovo/dsh-brake-pedal.git
cd dsh-brake-pedal
node tools/install.mjs              # 装进 desktop profile
node tools/install.mjs --profile web
```

做三件事（和市场安装一致）：`dependencies` 加 `link:<本包>`、`dsh.profile.bundles`
加包名、`node_modules` 建 junction。改 `package.json` 前备份成
`package.json.bak-brake-pedal`。脚本按自身位置解析路径，所以克隆到哪都行。

**然后必须重启 DeepSeek Harness**（插件页的「重启」按钮，或关掉再打开），再刷新页面。

## 卸载

```bash
node tools/uninstall.mjs
```

## 自检

```bash
node test/smoke.mjs
```

会照宿主的方式加载客户端 bundle（`__ModuleLoader__` 外壳）、用最小 React shim 渲染
一帧（含 StrictMode 二次调用回归项、深浅两套主题）、验证 `shell.overlay` 注册、
并用**真实的会话存储**跑一遍 facts 路由（真实 `createdAt` / `elapsedMs` / `logBytes`，
以及 POST → 405），最后覆盖录制开关（锁定生效 / 越界拒绝 / `noBreak` 透传 / 无配置不加锁）。

## 录制与宣传视频

```bash
# 锁死断点（录制用，刷新即生效，画面无痕）
#   DevTools: localStorage.setItem('dsh-brake-pedal.lock', '3')  // 或 'none'

# 逐帧渲染演示视频（无头 Edge + ffmpeg → MP4）
node tools/video/render.mjs                     # 竖版 1080x1920
node tools/video/render.mjs --w 1920 --h 1080   # 横版

# 封面图
python tools/make-covers.py
```

- `tools/video/timeline.mjs` 是**唯一时间轴**：视频帧和 SRT 字幕都从它生成，不会对不上。
- `tools/video/scene.html` 是场景页，暴露 `window.__seek(state)`；页面自己不做动画，
  所有状态由渲染器驱动，所以同一份时间轴永远渲出同一个视频。
- 渲染器走 CDP 逐帧截图（`Page.captureScreenshot`），不是录屏——NG 一帧只重渲一帧。
- `ffmpeg` 通过 `FFMPEG` 环境变量指定；没有就退化成 PATH 上的 `ffmpeg`。

材料清单、分镜脚本、旁白稿、发布文案与合规红线见 [VIDEO.md](VIDEO.md)。

## 插件接口速查

| 半边 | 内容 |
|---|---|
| 宿主 | `lib/index.js`，路由 `GET /dsh-brake-pedal/facts?session=<id>` |
| 客户端 | `client/client.js`，注册进 `shell.overlay`（帧级浮层，与会话无关） |

字段：`source`（`host` / `partial` / `none` / `error`）、`sessionId`、`matched`
（`exact` / `latest`）、`cwd`、`createdAt`、`elapsedMs`、`logBytes`、`logMtimeMs`。

主题：所有配色走宿主的 `--dsw-alias-*` 令牌，缺失时按 `data-theme` / 背景亮度
在浅色与深色两套兜底色之间选，并跟随主题切换。

错误只写 console，不抛给宿主。
