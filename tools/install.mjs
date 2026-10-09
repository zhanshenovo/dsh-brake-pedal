/**
 * Install dsh-brake-pedal into a DSH profile.
 *
 *   node tools/install.mjs            # 装进 DSH_PROFILE（默认 desktop）
 *   node tools/install.mjs --profile web
 *
 * 做三件事，正好是市场安装时做的三件事：
 *   1. package.json 的 dependencies 加一条 link:<本包绝对路径>
 *   2. package.json 的 dsh.profile.bundles 加本包名（否则不会进插件层）
 *   3. node_modules 里建一个指向本包的 junction
 *
 * 改 package.json 前先备份成 package.json.bak-brake-pedal。
 */
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, copyFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG = 'dsh-brake-pedal'
const here = dirname(dirname(fileURLToPath(import.meta.url)))

const argv = process.argv.slice(2)
const profileFlag = argv.indexOf('--profile')
const profileName = profileFlag >= 0 && argv[profileFlag + 1] ? argv[profileFlag + 1]
  : (process.env.DSH_PROFILE || 'desktop')
const profileDir = process.env.DSH_PROFILE_DIR
  || join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'profiles', profileName)

if (!existsSync(join(profileDir, 'package.json'))) {
  console.error(`找不到 profile: ${profileDir}`)
  process.exit(1)
}

const manifestPath = join(profileDir, 'package.json')
copyFileSync(manifestPath, join(profileDir, 'package.json.bak-brake-pedal'))

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
manifest.dependencies ??= {}
manifest.dsh ??= {}
manifest.dsh.profile ??= {}
manifest.dsh.profile.bundles ??= []

const spec = 'link:' + resolve(here).replace(/\\/g, '/')
manifest.dependencies[PKG] = spec
if (!manifest.dsh.profile.bundles.includes(PKG)) manifest.dsh.profile.bundles.push(PKG)

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')

const linkPath = join(profileDir, 'node_modules', PKG)
mkdirSync(dirname(linkPath), { recursive: true })
const existing = lstatSync(linkPath, { throwIfNoEntry: false })
if (existing !== undefined) {
  if (!existing.isSymbolicLink() && !existing.isDirectory()) {
    console.error(`拒绝覆盖已存在的非链接路径: ${linkPath}`)
    process.exit(1)
  }
  rmSync(linkPath, { recursive: true, force: true })
}
symlinkSync(resolve(here), linkPath, 'junction')

console.log(`已安装 ${PKG}`)
console.log(`  profile   ${profileDir}`)
console.log(`  spec      ${spec}`)
console.log(`  bundles   ${manifest.dsh.profile.bundles.join(', ')}`)
console.log(`  backup    ${join(profileDir, 'package.json.bak-brake-pedal')}`)
console.log('\n需要重启 DeepSeek Harness（插件页的「重启」，或关掉再打开），然后刷新页面。')
