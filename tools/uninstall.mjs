/**
 * Uninstall dsh-brake-pedal from a DSH profile — the exact reverse of install.
 *
 *   node tools/uninstall.mjs
 *   node tools/uninstall.mjs --profile web
 *
 * 只撤掉它自己写进去的那一条依赖、bundles 里的一个名字、以及 node_modules
 * 里的那个 junction。别的东西一律不碰。
 */
import { existsSync, lstatSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG = 'dsh-brake-pedal'
const here = dirname(dirname(fileURLToPath(import.meta.url)))

const argv = process.argv.slice(2)
const profileFlag = argv.indexOf('--profile')
const profileName = profileFlag >= 0 && argv[profileFlag + 1] ? argv[profileFlag + 1]
  : (process.env.DSH_PROFILE || 'desktop')
const profileDir = process.env.DSH_PROFILE_DIR
  || join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'profiles', profileName)

const manifestPath = join(profileDir, 'package.json')
if (!existsSync(manifestPath)) {
  console.error(`找不到 profile: ${profileDir}`)
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const removed = []

if (manifest.dependencies !== undefined && Object.hasOwn(manifest.dependencies, PKG)) {
  delete manifest.dependencies[PKG]
  removed.push('dependencies')
}
const bundles = manifest.dsh?.profile?.bundles
if (Array.isArray(bundles) && bundles.includes(PKG)) {
  manifest.dsh.profile.bundles = bundles.filter((entry) => entry !== PKG)
  removed.push('dsh.profile.bundles')
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')

const linkPath = join(profileDir, 'node_modules', PKG)
const existing = lstatSync(linkPath, { throwIfNoEntry: false })
if (existing !== undefined && (existing.isSymbolicLink() || existing.isDirectory())) {
  rmSync(linkPath, { recursive: true, force: true })
  removed.push('node_modules 链接')
}

console.log(`已卸载 ${PKG}（${removed.length === 0 ? '本来就没装' : removed.join('、')}）`)
console.log(`本包目录仍在: ${here}`)
console.log('重启 DeepSeek Harness 后生效。')
