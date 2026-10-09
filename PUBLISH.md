# 发布到 npm 的清单

包名 `dsh-brake-pedal` 目前**在 npm 上可用**（实测 `registry.npmjs.org/dsh-brake-pedal` 返回 404）。

发上去之后，用户只要在「插件 → 添加插件」里输入 `dsh-brake-pedal` 就能装 ——
而且**这是三条安装路径里唯一能被 npmmirror 兜底的**（镜像只代理 registry 包，
不代理 GitHub 仓库）。所以对大陆用户最友好。

---

## 0. 前置

- npm 账号：https://www.npmjs.com/signup ，并开启 2FA
- 本机要有 npm —— 这个 DSH 运行时里**没有** npm，装 Node.js 官方版即可：
  `winget install OpenJS.NodeJS.LTS`
- 先在仓库里确认没有敏感内容（这一步别跳）：

  ```bash
  rg -n "尊界|懂车帝|华为|江淮|鸿蒙|迈巴赫|V800" .     # 应当 0 命中
  rg -n "ghp_|github_pat_|sk-[A-Za-z0-9]{16}" .        # 应当 0 命中
  ```

## 1. 发布前检查

```bash
node test/smoke.mjs        # 30 项必须全绿
npm pack --dry-run         # 只看清单，不真的打包
```

`npm pack --dry-run` 应当列出：

```
package.json  lib/index.js  client/client.js  cordis.patch.yml
README.md  README.en.md  LICENSE  NOTICE.md
```

`files` 字段已经配好了。**不要把视频、封面、工具链加进去** —— 仓库里那 3.5 MB
是给人看的，npm 包只装运行时。也**不要**加 `.npmignore`，`files` 是白名单，更安全。

## 2. 登录并发首个版本

```bash
npm login                  # 浏览器授权；2FA 打开的话按提示走
npm publish --access public
```

包名没有 scope，所以必须显式 `--access public`（否则 npm 会当成私有包，收费）。

## 3. 验证发出去的东西

```bash
npm view dsh-brake-pedal version dist.tarball dist.unpackedSize
npm view dsh-brake-pedal files            # 确认清单和本地一致
```

再下载 tarball 解开看一眼，确认 `package/lib/index.js` 与 `package/client/client.js`
都在（`client/client.js` 必须是那 24 KB 的**预构建** classic script，
用户装完不需要任何构建步骤 —— 这是这个包能在市场里直接装的前提）。

## 4. 之后的版本升级

```bash
npm version patch          # 或 minor / major；会同时改 package.json 并打 git tag
git push --follow-tags
npm publish
```

两条容易踩的：

- **DSH 的插件市场不会自动升级。** 它的文档原话是「已安装的插件不自动更新，
  升级 = 卸载再装新版本」。所以每次发版都要在 README 和 release notes 里提醒用户。
- 改了 `client/client.js` 或 `lib/index.js` 之后，**宿主半边要重启才生效**，
  客户端半边刷新页面即可 —— 这一点也值得写进 release notes。

## 5. 发完之后要补的

- 两份 README 的「安装」段加 npm 方式，并说明三种路径的取舍：

  | 方式 | 适合 | 代价 |
  |---|---|---|
  | `dsh-brake-pedal`（npm） | 所有人，含大陆网络 | 包内只有运行时，没有视频工具链 |
  | `github:zhanshenovo/dsh-brake-pedal` | 网络能上 GitHub，想要完整仓库 | 大陆可能连不上，镜像救不了 |
  | 本地 `.tgz` 绝对路径 | 前两条都不通时 | 要手动传文件 |

- 可选：给 `package.json` 加 `dshhub` 元数据块（插件市场展示用）。
  格式请**对照当前版本市场的校验规则**，别照抄——你 profile 里已装的
  `dsh-cost-meter` 是一个可参考的实例：

  ```
  "dshhub": { "schemaVersion": 1, "displayName": …, "summary": …,
              "categories": [...], "surfaces": ["host","web"], "compatibility": {…} }
  ```

## 6. 撤销

- 发布后 72 小时内可以 `npm unpublish dsh-brake-pedal@0.1.0`；超过就只能发新版本覆盖
- 发布是公开的，且会被镜像缓存 —— **发之前把第 0 步那两条扫描跑一遍**
