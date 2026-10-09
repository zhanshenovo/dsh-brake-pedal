/**
 * 演示视频的唯一时间轴。
 *
 * 视频帧和 SRT 字幕都从这里生成 —— 两边分开写，迟早会对不上。
 *
 * 每拍：dur 毫秒，frames 张关键帧（>1 表示这一拍在动，p 从 0 走到 1），
 * at(p) 返回该时刻要画的状态，交给页面里的 window.__seek()。
 */

export const FPS = 30

const PANEL_HEAD = { scene: 'panel' }

export const BEATS = [
  // 1. 标题
  { dur: 4200, at: () => ({ scene: 'title' }) },

  // 2. app 示意：踏板亮起
  { dur: 1400, at: () => ({ scene: 'app', cap: 0, glow: 0 }) },
  { dur: 900, frames: 6, at: (p) => ({ scene: 'app', cap: 0, glow: p }) },
  { dur: 2600, at: () => ({ scene: 'app', cap: 1, glow: 1 }) },

  // 3. 面板打开，第 1 脚
  { dur: 500, at: () => ({ ...PANEL_HEAD, feet: 0 }) },
  { dur: 500, frames: 6, at: (p) => ({ ...PANEL_HEAD, feet: 1, rowP: p }) },
  { dur: 900, at: () => ({ ...PANEL_HEAD, feet: 1, rowP: 1 }) },

  // 4. 第 2 脚
  { dur: 500, frames: 6, at: (p) => ({ ...PANEL_HEAD, feet: 2, rowP: p }) },
  { dur: 900, at: () => ({ ...PANEL_HEAD, feet: 2, rowP: 1 }) },

  // 5. 第 3 脚：断裂
  { dur: 420, frames: 7, at: (p) => ({ ...PANEL_HEAD, feet: 3, rowP: 1, breakAt: 3, flash: p > 0.45 }) },
  { dur: 1800, at: () => ({ ...PANEL_HEAD, feet: 3, rowP: 1, breakAt: 3 }) },

  // 6. 弹窗浮出
  { dur: 700, frames: 10, at: (p) => ({ scene: 'modal', p, breakAt: 3 }) },
  { dur: 3600, at: () => ({ scene: 'modal', p: 1 }) },

  // 7. 三个高亮：角标 / 真实数据 / 推导值
  { dur: 2600, at: () => ({ scene: 'modal', p: 1, hl: 'badge' }) },
  { dur: 3400, at: () => ({ scene: 'modal', p: 1, hl: 'data' }) },
  { dur: 3000, at: () => ({ scene: 'modal', p: 1, hl: 'derived' }) },

  // 8. 弹窗退场 → 大字幕
  { dur: 400, frames: 6, at: (p) => ({ scene: 'modal', p: 1 - p }) },
  { dur: 3600, at: () => ({ scene: 'big', big: '它一根手指都没碰过<br><em>真正的停止键</em>' }) },

  // 9. 未复现
  { dur: 1600, at: () => ({ ...PANEL_HEAD, feet: 6, clean: true }) },
  { dur: 640, frames: 8, at: (p) => ({ scene: 'modal', p, clean: true }) },
  { dur: 3200, at: () => ({ scene: 'modal', p: 1, clean: true }) },

  // 10. 定版
  { dur: 4200, at: () => ({ scene: 'end' }) },
]

/** 展开成逐帧列表：每帧 { state, dur }（dur 为毫秒）。 */
export function buildFrames(beats = BEATS) {
  const frames = []
  for (const beat of beats) {
    const n = beat.frames === undefined ? 1 : beat.frames
    const each = beat.dur / n
    for (let i = 0; i < n; i++) {
      const p = n === 1 ? 1 : i / (n - 1)
      frames.push({ state: beat.at(p), dur: each })
    }
  }
  return frames
}

export function totalMs(beats = BEATS) {
  return beats.reduce((sum, b) => sum + b.dur, 0)
}

/* ---------- 字幕：从同一条时间轴推出来 ---------- */

/** [起始拍序号, 结束拍序号, 文案] —— 拍序号按 BEATS 数组下标。 */
const CUES = [
  [0, 1, 'AI 工作台上，\n我唯一不敢让它失效的按钮。'],
  [3, 4, '它先做一次制动系统自检。'],
  [5, 7, '第 1 脚、第 2 脚，都好。'],
  [8, 9, '第 3 脚。'],
  [11, 12, '然后它给你一份情况说明。'],
  [13, 13, '注意，它自己标着是虚构的。'],
  [14, 14, '这两个数是真的，\n来自这次会话。'],
  [15, 15, '踏板力是从它们推出来的，\n所以它标着「推导值」。'],
  [18, 19, '没出事的时候，\n它讽刺得更准。'],
  [20, 20, '虚构段子 · 与任何厂商无关\n不构成任何安全评价'],
]

const stamp = (ms) => {
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0')
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0')
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')
  const cs = String(Math.round(ms % 1000)).padStart(3, '0')
  return `${h}:${m}:${s},${cs}`
}

export function buildSrt(beats = BEATS, bigLineCue = [16, 17, '它一根手指都没碰过\n真正的停止键。']) {
  const starts = []
  let t = 0
  for (const b of beats) { starts.push(t); t += b.dur }
  const ends = starts.map((s, i) => s + beats[i].dur)

  const all = CUES.concat([bigLineCue]).sort((a, b) => a[0] - b[0])
  return all.map((cue, i) => {
    const from = starts[cue[0]]
    const to = ends[cue[1]]
    return `${i + 1}\n${stamp(from)} --> ${stamp(to)}\n${cue[2]}\n`
  }).join('\n')
}
