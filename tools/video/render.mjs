/**
 * 用无头 Edge 逐帧渲染 scene.html，再用 ffmpeg 编码成 MP4。
 *
 *   node tools/video/render.mjs                     # 竖版 1080x1920
 *   node tools/video/render.mjs --w 1920 --h 1080   # 横版
 *
 * 为什么走 CDP 而不是录屏：录屏是实时的，一次 NG 就得重来，而且压不住节奏。
 * 逐帧渲染是确定性的 —— 同一份时间轴永远渲出同一个视频，改一帧只重渲一帧。
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildFrames, buildSrt, totalMs, FPS, BEATS } from './timeline.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const OUT = join(ROOT, 'assets', 'video')
const FRAME_DIR = join(OUT, 'frames')

const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = argv.indexOf('--' + name)
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback
}
const W = Number(arg('w', 1080))
const H = Number(arg('h', 1920))
const PORT = Number(arg('port', 9487))
const NAME = arg('name', W < H ? 'demo-9x16' : 'demo-16x9')
const ENCODE_ONLY = argv.includes('--encode-only')
const EDGE = process.env.EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const FFMPEG = process.env.FFMPEG || 'ffmpeg'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ---------- 极简 CDP 客户端 ---------- */

class Cdp {
  constructor(ws) {
    this.ws = ws
    this.next = 0
    this.pending = new Map()
    this.waiters = new Map()
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolve: res, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(msg.error.message))
        else res(msg.result)
        return
      }
      const list = this.waiters.get(msg.method)
      if (list !== undefined && list.length > 0) {
        this.waiters.set(msg.method, [])
        for (const fn of list) fn(msg.params)
      }
    })
  }

  send(method, params = {}) {
    const id = ++this.next
    return new Promise((res, rej) => {
      this.pending.set(id, { resolve: res, reject: rej })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  once(method, timeoutMs = 15000) {
    return new Promise((res, rej) => {
      const list = this.waiters.get(method) || []
      list.push(res)
      this.waiters.set(method, list)
      setTimeout(() => rej(new Error('timeout waiting ' + method)), timeoutMs)
    })
  }
}

async function attach(port) {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page !== undefined) return page.webSocketDebuggerUrl
    } catch (error) {
      // 端口还没起来，继续等
    }
    await sleep(250)
  }
  throw new Error('Edge 的调试端口没起来')
}

/* ---------- 主流程 ---------- */

if (!existsSync(EDGE)) throw new Error('找不到 Edge: ' + EDGE)
mkdirSync(OUT, { recursive: true })

/** concat 列表里的路径必须是绝对的：老版本 ffmpeg 按进程 CWD 解析相对路径，
 *  而不是按列表文件所在目录 —— 这里踩过一次。 */
const framePath = (file) => join(FRAME_DIR, file).replace(/\\/g, '/')

async function encode(frames) {
  const listLines = []
  for (let i = 0; i < frames.length; i++) {
    const file = `f${String(i).padStart(4, '0')}.png`
    listLines.push(`file '${framePath(file)}'`, `duration ${(frames[i].dur / 1000).toFixed(4)}`)
  }
  // concat 解复用器要求最后一帧再写一次，否则末段时长会被吃掉
  listLines.push(`file '${framePath(`f${String(frames.length - 1).padStart(4, '0')}.png`)}'`)
  const listFile = join(FRAME_DIR, 'list.txt')
  writeFileSync(listFile, listLines.join('\n') + '\n')

  const mp4 = join(OUT, NAME + '.mp4')
  console.log('  编码 →', mp4)
  const ff = spawn(FFMPEG, [
    '-y', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', listFile,
    '-vf', `fps=${FPS},format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
    '-movflags', '+faststart',
    mp4,
  ], { stdio: 'inherit' })
  const code = await new Promise((r) => ff.on('exit', r))
  if (code !== 0) throw new Error('ffmpeg 退出码 ' + code)

  writeFileSync(join(OUT, 'subtitles.srt'), buildSrt())
  console.log(`  完成：${(totalMs() / 1000).toFixed(1)}s / ${frames.length} 帧 / ${FPS}fps`)
  console.log('  字幕：', join(OUT, 'subtitles.srt'))
}

const frames = buildFrames()

/** 把时间轴落盘：音效脚本要按同一份时间轴对齐，不能靠手抄秒数。 */
{
  const beats = []
  let t = 0
  for (const b of BEATS) { beats.push({ start: t, dur: b.dur }); t += b.dur }
  writeFileSync(join(OUT, 'timeline.json'), JSON.stringify({ fps: FPS, totalMs: totalMs(), beats }, null, 2))
}

if (ENCODE_ONLY) {
  console.log('  跳过渲染，复用已有帧')
  await encode(frames)
} else {
rmSync(FRAME_DIR, { recursive: true, force: true })
mkdirSync(FRAME_DIR, { recursive: true })

const profileDir = join(OUT, 'edge-profile')
const edge = spawn(EDGE, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--hide-scrollbars',
  '--force-device-scale-factor=1',
  '--allow-file-access-from-files',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profileDir}`,
  `--window-size=${W},${H}`,
  'about:blank',
], { stdio: 'ignore' })

let cdp = null
try {
  const wsUrl = await attach(PORT)
  const ws = new WebSocket(wsUrl)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true })
    ws.addEventListener('error', rej, { once: true })
  })
  cdp = new Cdp(ws)

  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: W, height: H, deviceScaleFactor: 1, mobile: false,
  })

  const loaded = cdp.once('Page.loadEventFired')
  const params = []
  if (arg('px', null) !== null) params.push('px=' + arg('px', '1'))
  if (arg('cardw', null) !== null) params.push('cardw=' + arg('cardw', ''))
  const query = params.length === 0 ? '' : '?' + params.join('&')
  await cdp.send('Page.navigate', { url: pathToFileURL(join(HERE, 'scene.html')).href + query })
  await loaded
  await cdp.send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true })
  await sleep(300)

  const rendered = buildFrames()
  for (let i = 0; i < rendered.length; i++) {
    const frame = rendered[i]
    await cdp.send('Runtime.evaluate', {
      expression: `window.__seek(${JSON.stringify(frame.state)})`,
      returnByValue: false,
    })
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    const file = `f${String(i).padStart(4, '0')}.png`
    writeFileSync(join(FRAME_DIR, file), Buffer.from(shot.data, 'base64'))
    process.stdout.write(`\r  渲染 ${i + 1}/${rendered.length}`)
  }
  console.log('')
} finally {
  if (cdp !== null) { try { await cdp.send('Browser.close') } catch (error) { /* 关不掉就算了 */ } }
  edge.kill()
}
await encode(frames)
}
