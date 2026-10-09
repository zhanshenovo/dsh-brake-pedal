/**
 * dsh-brake-pedal host entry.
 *
 * 这个插件只有一件事：把**真实的会话事实**交给客户端彩蛋。
 *
 *   GET /dsh-brake-pedal/facts?session=<id>   JSON
 *     { source, sessionId, cwd, createdAt, elapsedMs, logBytes, logMtimeMs, matched }
 *
 * 事实从哪来：~/.dsh/sessions/<workspace>/<sessionId>/session.v4.jsonl.zstd
 *   - 起始时间 createdAt → 解压首帧（首帧就是那条 `{"type":"session",...}` 记录）
 *   - 日志体积 / 修改时间 → 文件系统直接 stat
 *   - 已运行时长 → now - createdAt
 *
 * 为什么只给这些：其余指标（工具调用数、token、失败次数）在宿主侧要么要走
 * 投影 seam、要么要解一个自定义多帧容器，v1 不为一个彩蛋去冒那个险。
 * 客户端拿这几条真实事实**推导**踏板力，并在界面上标明是推导值。
 *
 * 只读、只 GET/HEAD、不碰任何会话状态：一个段子不该有能力弄坏一次运行。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import zlib from 'node:zlib'

export const name = 'dsh-brake-pedal'

const SESSION_FILE = 'session.v4.jsonl.zstd'
/** 会话日志可能很大，解压只为首帧那一条记录服务，给一个上限免得读爆内存。 */
const MAX_READ_BYTES = 4 * 1024 * 1024

function resolveDshHome(config) {
  if (typeof config?.dshHome === 'string' && config.dshHome.trim() !== '') return config.dshHome.trim()
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv.trim()
  return join(homedir(), '.dsh')
}

/** 首帧 = 会话头记录。多帧容器只解第一帧，正是我们要的那条。 */
function readSessionHeader(file) {
  try {
    const raw = readFileSync(file)
    const slice = raw.length > MAX_READ_BYTES ? raw.subarray(0, MAX_READ_BYTES) : raw
    const text = zlib.zstdDecompressSync(slice).toString('utf8')
    const first = text.split('\n').find((line) => line.trim() !== '')
    if (first === undefined) return null
    const parsed = JSON.parse(first)
    return parsed !== null && typeof parsed === 'object' ? parsed : null
  } catch {
    // 读不了就是读不了：彩蛋降级成演示数据，绝不把异常抛给宿主。
    return null
  }
}

/**
 * 找到目标会话的日志文件。
 * 给了 sessionId 就精确找；没给（客户端拿不到会话身份时）退化成"最近写入的那个会话"，
 * 并在响应里用 matched 说明这是退化匹配的结果。
 */
function findSessionFile(home, sessionId) {
  const root = join(home, 'sessions')
  if (!existsSync(root)) return null

  let newest = null
  let workspaces = []
  try {
    workspaces = readdirSync(root, { withFileTypes: true })
  } catch {
    return null
  }

  // 先按 id 精确找；找不到（客户端报来的 id 不存在、或它压根不知道自己的 id）
  // 再退化成"最近写入的那个会话"，并用 matched 把这件事说清楚。
  if (sessionId !== '') {
    for (const workspace of workspaces) {
      if (!workspace.isDirectory()) continue
      const exact = join(root, workspace.name, sessionId, SESSION_FILE)
      if (existsSync(exact)) return { file: exact, id: sessionId, matched: 'exact' }
    }
  }

  for (const workspace of workspaces) {
    if (!workspace.isDirectory()) continue
    const workspaceDir = join(root, workspace.name)

    let sessions = []
    try {
      sessions = readdirSync(workspaceDir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const session of sessions) {
      if (!session.isDirectory()) continue
      const file = join(workspaceDir, session.name, SESSION_FILE)
      if (!existsSync(file)) continue
      let stats
      try {
        stats = statSync(file)
      } catch {
        continue
      }
      if (newest === null || stats.mtimeMs > newest.mtimeMs) {
        newest = { file, id: session.name, mtimeMs: stats.mtimeMs }
      }
    }
  }

  return newest === null ? null : { file: newest.file, id: newest.id, matched: 'latest' }
}

function sessionIdFromRequest(request) {
  const raw = typeof request?.url === 'string' ? request.url : ''
  const query = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : ''
  for (const pair of query.split('&')) {
    const [key, value = ''] = pair.split('=')
    if (key !== 'session') continue
    try {
      return decodeURIComponent(value).trim()
    } catch {
      return ''
    }
  }
  return ''
}

function sendJson(response, status, body) {
  const text = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
  })
  response.end(text)
}

export function apply(ctx, config) {
  if (typeof ctx.inject !== 'function') return

  ctx.inject(['webServer'], (host) => {
    const home = resolveDshHome(config)

    /**
     * 录制开关。
     *
     * 默认是伪随机（种子=会话 id+次数），演示好看，但**录视频不能赌**：重拍第二条
     * 就换了个断点，剪辑对不上。所以给一个 profile 侧配置：
     *
     *   config:
     *     breakAt: 3      # 锁死断在第 3 脚（2..6）
     *     noBreak: true   # 只演"未复现"
     *
     * 只影响表演，不影响任何真实行为——这个插件本来就不碰停止逻辑。
     */
    const forcedBreakAt = Number.isInteger(config?.breakAt) && config.breakAt >= 2 && config.breakAt <= 6
      ? config.breakAt
      : null
    const noBreak = config?.noBreak === true

    const facts = (request) => {
      const asked = sessionIdFromRequest(request)
      const found = findSessionFile(home, asked)
      if (found === null) {
        return { source: 'none', sessionId: asked === '' ? null : asked, reason: 'no session log found' }
      }

      const header = readSessionHeader(found.file)
      let stats = null
      try {
        stats = statSync(found.file)
      } catch {
        stats = null
      }

      return {
        forcedBreakAt,
        noBreak,
        source: header === null ? 'partial' : 'host',
        sessionId: found.id,
        matched: found.matched,
        cwd: typeof header?.cwd === 'string' ? header.cwd : null,
        createdAt: typeof header?.createdAt === 'number' ? header.createdAt : null,
        elapsedMs: typeof header?.createdAt === 'number' ? Math.max(0, Date.now() - header.createdAt) : null,
        logBytes: stats === null ? null : stats.size,
        logMtimeMs: stats === null ? null : Math.round(stats.mtimeMs),
      }
    }

    host.effect(() => {
      const off = host.webServer.register({
        kind: 'exact',
        path: '/dsh-brake-pedal/facts',
        handler: (request, response) => {
          if (request.method !== 'GET' && request.method !== 'HEAD') {
            response.writeHead(405, { allow: 'GET, HEAD' })
            response.end()
            return
          }
          try {
            sendJson(response, 200, facts(request))
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            if (host.logger?.warn) host.logger.warn(`[dsh-brake-pedal] facts failed: ${message}`)
            sendJson(response, 500, { source: 'error', error: message })
          }
        },
      })
      // 宿主不保证给 disposer；缺了就当 no-op，别留一条撤不掉的路由。
      return typeof off === 'function' ? off : () => {}
    }, 'dsh-brake-pedal: facts route')
  })
}
