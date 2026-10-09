# 发布到 npm 的清单

包名 `dsh-brake-pedal` 在 npm 上**可用**（2026-10-09 实测 registry 返回 404）。
发布之后，用户只要在「插件 → 添加插件」里输入 `dsh-brake-pedal` 就能装 —— 这也是三条
安装路径里**唯一能被 npmmirror 兜底**的一条。

> 本清单按 **2026-10 的 npm 现状**写。npm 的授权模型在 2025-12 和 2026-07 各改过一次，
> 网上大部分教程已经过期，所以下面关键处都标了官方口径的来源。

---

## ⚠️ 先看这个：这台机器的 registry 指向的是镜像

`~/.npmrc` 里有 `registry=https://registry.npmmirror.com/` —— 那是**只读镜像**，
发布必然失败，而且报错很难懂。`npm publish --dry-run` 里能提前看到：

```
npm notice Publishing to https://registry.npmmirror.com/ with tag latest and default access (dry-run)
npm warn   This command requires you to be logged in to https://registry.npmmirror.com/
```

**不要改 `.npmrc`**（改了会拖慢你平时装包）。发布时显式指回官方源：

```bash
npm publish --registry=https://registry.npmjs.org/ --access public
```

---

## 0. 前置

- npm 账号：https://www.npmjs.com/signup ，并开启 2FA
- 本机 npm 已就绪（这台是 `node v24.16.0` / `npm 11.13.0`，在 `C:\Program Files\nodejs`）
- 先扫一遍敏感内容，这步别跳：

  ```bash
  rg -n "尊界|懂车帝|华为|江淮|鸿蒙|迈巴赫|V800" .    # 应当 0 命中
  rg -n "ghp_|github_pat_|sk-[A-Za-z0-9]{16}" .       # 应当 0 命中
  ```

## 1. 发布前检查

```bash
node test/smoke.mjs                                          # 30 项必须全绿
npm publish --dry-run --registry=https://registry.npmjs.org/ # 只看它会传什么
```

实测的 dry-run 结果（应当一致）：

```
Tarball Contents: LICENSE  NOTICE.md  README.en.md  README.md
                  client/client.js  cordis.patch.yml  lib/index.js  package.json
package size: 22.5 kB      unpacked size: 56.1 kB      total files: 8
```

`files` 字段是白名单，已经配好。**不要把视频、封面、工具链加进去** —— 仓库里那 3.5 MB
是给人看的，npm 包只装运行时。也不要加 `.npmignore`：白名单比黑名单安全。

## 2. 授权：两条路

### 路 A —— 你自己在终端跑（凭据不经过任何人）

```powershell
cd C:\Users\li123\Documents\deepseek-harness\default-workspace\dsh-brake-pedal
npm login   --registry=https://registry.npmjs.org/
npm publish --registry=https://registry.npmjs.org/ --access public
```

按 2025-12 的官方变更：`npm login` 现在发的是**两小时会话令牌**，不再是长期 token；
并且「会话期间，发布操作强制 2FA」。所以 `npm publish` 会要你输 OTP。

### 路 B —— 交给助手发（需要一个 granular access token）

在 https://www.npmjs.com/settings/~/tokens 建一个 **Granular Access Token**：

- **Packages**：Read and write，范围只勾 `dsh-brake-pedal`
- **Expiration**：7 天以内
- **Bypass 2FA**：勾上（否则非交互发布会卡在 OTP）

然后由助手执行：

```bash
npm publish --registry=https://registry.npmjs.org/ --access public \
  --//registry.npmjs.org/:_authToken=<token>
```

**注意**：token 贴到哪里就会留在哪里的记录里。发完**立刻吊销**它，并且不要把 token 写进
任何文件（命令行参数即可，别落进 `.npmrc`）。这条路目前还能用，但见第 5 节 —— 它正在被淘汰。

## 3. 验证发出去的东西

```bash
npm view dsh-brake-pedal version dist.tarball dist.unpackedSize --registry=https://registry.npmjs.org/
```

再下载 tarball 解开，确认：

- `package/lib/index.js` 与 `package/client/client.js` 都在；
- `client/client.js` 是那份 **24 KB 的预构建 classic script**（无 BOM、以
  `window.__ModuleLoader__.load(` 开头）—— 这是用户装完不需要任何构建步骤的前提。

## 4. 之后的版本升级

```bash
npm version patch
git push --follow-tags
npm publish --registry=https://registry.npmjs.org/
```

两个必须提醒用户的地方：

- **DSH 的插件市场不会自动升级**（对话框里就写着「暂不支持自动更新，若需升级请先卸载再安装新版」）；
- **宿主半边要重启才生效**，客户端半边刷新页面即可。

## 5. 未来：别再依赖长期 token

npm 的官方路线图（2026-07 变更说明）：

- 配了 **Bypass 2FA 的 GAT 已经不能做敏感的账户/包/组织管理操作**；
- 并且**预计 2027 年 1 月起，它也不能直接发布了**，发布面收窄为「读取私有包」+
  「暂存发布（staged publishing）+ 人工 2FA 批准」。

所以长期方案是 **OIDC trusted publishing**：在 npm 的包设置里绑定
`zhanshenovo/dsh-brake-pedal` 的 GitHub Actions workflow，推 tag 时由 CI 发布，
全程没有长期 token。首次发布仍需人工做一次。顺带一提，2026-10-02 起
**staged publishing 也支持创建新包**了，如果你想让每次发布都过一次人工批准，那是更稳的形态。

## 6. 撤销

- 发布后 **72 小时内**可以 `npm unpublish dsh-brake-pedal@0.1.0`；超过就只能发新版本覆盖
- 发布是公开的，且会被镜像缓存 —— **发之前把第 0 步那两条扫描跑一遍**
