/**
 * Smoke test: load the client bundle the way the host does, then render one
 * frame of it with a minimal React shim. Catches the failure mode that matters
 * most for a hand-written bundle — a typo that only explodes at render time and
 * takes the whole overlay down with it.
 *
 *   node test/smoke.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import vm from 'node:vm'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
let skipped = 0
const check = (label, ok, detail) => {
  if (ok) console.log('  ok   ' + label)
  else { failures++; console.log('  FAIL ' + label + (detail === undefined ? '' : ' — ' + detail)) }
}
/** 这台机器缺数据 ≠ 代码错了：CI runner 上没有会话日志，相关断言应当跳过。 */
const skip = (label, why) => {
  skipped++
  console.log('  skip ' + label + (why === undefined ? '' : ' — ' + why))
}

/* ---------- 1. host half ---------- */

const host = await import('file://' + join(root, 'lib', 'index.js').replace(/\\/g, '/'))
check('host exports name', host.name === 'dsh-brake-pedal', String(host.name))
check('host exports apply', typeof host.apply === 'function')

const routes = []
const fakeHostCtx = {
  inject: (deps, cb) => { check('host injects webServer', deps.includes('webServer')); cb(hostWeb) },
  on: () => {},
}
const hostWeb = {
  logger: { warn: () => {} },
  effect: (cb) => cb(),
  webServer: { register: (spec) => { routes.push(spec); return () => {} } },
}
host.apply(fakeHostCtx, {})
check('host registered exactly one route', routes.length === 1, String(routes.length))
check('route path is /dsh-brake-pedal/facts', routes[0]?.path === '/dsh-brake-pedal/facts', String(routes[0]?.path))

/* ---------- 2. client half: load the bundle envelope ---------- */

const makeReact = (rendered) => {
  let hookIndex = 0
  const api = {
    useState: (init) => {
      const slot = hookIndex++
      if (api.__hooks[slot] === undefined) api.__hooks[slot] = typeof init === 'function' ? init() : init
      return [api.__hooks[slot], (next) => { api.__hooks[slot] = typeof next === 'function' ? next(api.__hooks[slot]) : next }]
    },
    useRef: (init) => { const slot = hookIndex++; api.__hooks[slot] = api.__hooks[slot] ?? { current: init }; return api.__hooks[slot] },
    useEffect: () => { hookIndex++ },
    useMemo: (fn) => fn(),
    createElement: (tag, props, ...children) => {
      if (typeof tag === 'function') {
        hookIndex = 0
        api.__hooks = []
        return tag(Object.assign({}, props, { children: children.length > 1 ? children : children[0] }))
      }
      rendered.push(tag)
      return { tag, props, children }
    },
    __hooks: [],
  }
  return api
}

const source = readFileSync(join(root, 'client', 'client.js'), 'utf8')
let captured = null
const sandbox = {
  window: { __ModuleLoader__: { load: (def) => { captured = def } } },
  console,
  document: undefined,
  fetch: () => Promise.reject(new Error('no network in smoke test')),
  setTimeout,
  clearTimeout,
  Date,
  Math,
  String,
  Number,
  Object,
  Array,
  JSON,
  isFinite,
  RegExp,
}
sandbox.globalThis = sandbox
vm.createContext(sandbox)
try {
  vm.runInContext(source, sandbox, { filename: 'client/client.js' })
  check('bundle compiles and calls __ModuleLoader__.load', captured !== null)
} catch (error) {
  check('bundle compiles and calls __ModuleLoader__.load', false, error.message)
}

check('bundle id', captured?.id === 'dsh-brake-pedal', String(captured?.id))

const rendered = []
const react = makeReact(rendered)
const clientExports = captured.factory((id) => {
  if (id === 'react') return react
  throw new Error('unexpected require: ' + id)
})
check('client exports name', clientExports.name === 'dsh-brake-pedal', String(clientExports.name))
check('client inject is [slots]', Array.isArray(clientExports.inject) && clientExports.inject.join() === 'slots', String(clientExports.inject))

/* ---------- 3. client half: register into shell.overlay ---------- */

const registrations = []
const injected = []
const fakeClientCtx = {
  slots: {
    inject: (slot, cb) => { injected.push(slot); cb() },
    register: (meta, component) => { registrations.push({ meta, component }); return () => {} },
  },
}
clientExports.apply(fakeClientCtx)
check('injects shell.overlay only', injected.join() === 'shell.overlay', injected.join())
check('registers one mount point', registrations.length === 1, String(registrations.length))
check('occupant targets shell.overlay', registrations[0]?.meta?.name === 'shell.overlay', String(registrations[0]?.meta?.name))

/* ---------- 4. render one frame ---------- */

try {
  const tree = registrations[0].component({})
  check('renders a frame without throwing', tree !== undefined && tree !== null)
  check('collapsed pill is the brake self-test', JSON.stringify(tree).includes('制动自检'))

  // 回归护栏：上一版在 render 期间改模块级 flag，React 18 StrictMode 二次调用就
  // 返回 null，胶囊永远不出现。现在连续渲染两次必须给出同一个胶囊。
  const again = registrations[0].component({})
  check('survives React invoking it twice (StrictMode)', again !== null && JSON.stringify(again).includes('制动自检'))

  // 胶囊要能拖：点击与拖动靠 pointer 事件区分，所以必须挂着 pointer 处理器，
  // 而且不能再有 onClick（否则拖完松手会误开面板）。
  const pill = registrations[0].component({})
  const pillProps = pill?.props ?? {}
  check('pill is draggable (pointer handlers wired)',
    typeof pillProps.onPointerDown === 'function' &&
    typeof pillProps.onPointerMove === 'function' &&
    typeof pillProps.onPointerUp === 'function')
  check('pill has no onClick (drag would open the panel by accident)',
    pillProps.onClick === undefined)
  check('pill can be reset by double click', typeof pillProps.onDoubleClick === 'function')
  check('pill has a grab cursor', String(pillProps.style?.cursor) === 'grab', String(pillProps.style?.cursor))
} catch (error) {
  check('renders a frame without throwing', false, error.message)
}

/* ---------- 4b. both themes render (the dark-panel-in-a-light-app bug) ---------- */

function renderPillWithTheme(documentStub) {
  let capturedAgain = null
  const box = Object.assign({}, sandbox, {
    window: { __ModuleLoader__: { load: (def) => { capturedAgain = def } } },
    document: documentStub,
    getComputedStyle: () => ({ backgroundColor: 'rgba(0, 0, 0, 0)' }),
  })
  box.globalThis = box
  vm.createContext(box)
  vm.runInContext(source, box, { filename: 'client/client.js' })
  const regs = []
  const fresh = capturedAgain.factory((id) => {
    if (id === 'react') return makeReact([])
    throw new Error('unexpected require: ' + id)
  })
  fresh.apply({
    slots: {
      inject: (slot, cb) => cb(),
      register: (meta, component) => { regs.push({ meta, component }); return () => {} },
    },
  })
  return JSON.stringify(regs[0].component({}))
}

const themeStub = (flag) => ({ documentElement: { getAttribute: () => flag, className: '', style: {} }, body: null })
const darkTree = renderPillWithTheme(themeStub('dark'))
const lightTree = renderPillWithTheme(themeStub('light'))
check('renders under a dark theme', darkTree.includes('制动自检'))
check('renders under a light theme', lightTree.includes('制动自检'))
check('dark theme uses the dark surface fallback', darkTree.includes('#1c2129'))
check('light theme does NOT use the dark surface fallback', !lightTree.includes('#1c2129'))

/* ---------- 5. the facts route against the real session store ---------- */

function callRoute(handler, url, method = 'GET') {
  return new Promise((resolve) => {
    const statuses = []
    const response = {
      writeHead: (status) => { statuses.push(status) },
      end: (text) => resolve({ status: statuses[0] ?? 200, body: text === undefined || text === '' ? null : JSON.parse(text) }),
    }
    handler({ method, url }, response)
  })
}

try {
  const answer = await callRoute(routes[0].handler, '/dsh-brake-pedal/facts')
  check('facts route answers 200', answer.status === 200, String(answer.status))
  const facts = answer.body
  check('facts is an object', facts !== null && typeof facts === 'object')
  check('facts declares a source', ['host', 'partial', 'none', 'error'].includes(facts?.source), String(facts?.source))
  console.log('       payload: ' + JSON.stringify(facts))

  // 下面三项读取的是**本机真实的会话日志**。CI runner 上一条都没有，
  // 那不是代码错了，是这台机器没数据 —— 报"跳过"，不要报失败。
  const machineHasSessions = facts?.source === 'host' || facts?.source === 'partial'
  if (facts?.source === 'host') {
    check('facts carries a real createdAt', typeof facts.createdAt === 'number')
    check('facts carries a real elapsedMs', typeof facts.elapsedMs === 'number' && facts.elapsedMs >= 0)
    check('facts carries real log bytes', typeof facts.logBytes === 'number' && facts.logBytes > 0)
  } else {
    skip('real session figures', '本机没有会话日志（CI 上属正常）')
  }

  // 客户端会尽量带上自己的会话 id；宿主必须精确命中，而不是又去猜最近会话。
  if (machineHasSessions && typeof facts?.sessionId === 'string' && facts.sessionId !== '') {
    const exact = await callRoute(routes[0].handler, '/dsh-brake-pedal/facts?session=' + encodeURIComponent(facts.sessionId))
    check('exact session id is honoured', exact.body?.matched === 'exact' && exact.body?.sessionId === facts.sessionId,
      JSON.stringify(exact.body))
  } else {
    skip('exact session id is honoured', '没有可比对的会话')
  }

  // 客户端报来一个不存在的 id 时，宁可退化成"最近写入的会话"并标注，也不要不出数。
  if (machineHasSessions) {
    const unknown = await callRoute(routes[0].handler, '/dsh-brake-pedal/facts?session=session-00000000-0000-0000-0000-000000000000')
    check('unknown session id degrades to latest instead of failing',
      unknown.body?.source !== 'none' && unknown.body?.matched === 'latest', JSON.stringify(unknown.body))
  } else {
    skip('unknown session id degrades to latest', '没有最近会话可退化到')
  }

  const rejected = await callRoute(routes[0].handler, '/dsh-brake-pedal/facts', 'POST')
  check('write methods are refused with 405', rejected.status === 405, String(rejected.status))
} catch (error) {
  check('facts route answers', false, error.message)
}

/* ---------- 6. the recording lock (profile config) ---------- */

try {
  const extraRoutes = []
  const lockWeb = {
    logger: { warn: () => {} },
    effect: (cb) => cb(),
    webServer: { register: (spec) => { extraRoutes.push(spec); return () => {} } },
  }
  const applyWith = (config) => host.apply({ inject: (deps, cb) => cb(lockWeb), on: () => {} }, config)

  applyWith({ breakAt: 3 })
  const locked = await callRoute(extraRoutes[0].handler, '/dsh-brake-pedal/facts')
  check('profile config locks the break point', locked.body?.forcedBreakAt === 3, JSON.stringify(locked.body))

  applyWith({ breakAt: 9 })
  const bogus = await callRoute(extraRoutes[1].handler, '/dsh-brake-pedal/facts')
  check('an out-of-range breakAt is refused', bogus.body?.forcedBreakAt === null, JSON.stringify(bogus.body))

  applyWith({ noBreak: true })
  const suppressed = await callRoute(extraRoutes[2].handler, '/dsh-brake-pedal/facts')
  check('noBreak is passed through', suppressed.body?.noBreak === true, JSON.stringify(suppressed.body))

  applyWith(undefined)
  const free = await callRoute(extraRoutes[3].handler, '/dsh-brake-pedal/facts')
  check('no config means no lock', free.body?.forcedBreakAt === null && free.body?.noBreak === false, JSON.stringify(free.body))
} catch (error) {
  check('recording lock', false, error.message)
}

console.log(failures === 0
  ? `\nsmoke: PASS${skipped > 0 ? `（跳过 ${skipped} 项：本机缺少真实会话日志）` : ''}`
  : `\nsmoke: ${failures} FAILED${skipped > 0 ? `（另有 ${skipped} 项跳过）` : ''}`)
process.exit(failures === 0 ? 0 : 1)