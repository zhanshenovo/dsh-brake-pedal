# dsh-brake-pedal

[![CI](https://github.com/zhanshenovo/dsh-brake-pedal/actions/workflows/ci.yml/badge.svg)](https://github.com/zhanshenovo/dsh-brake-pedal/actions/workflows/ci.yml)

English | [中文](README.md)

A brake-pedal self-test easter egg for DeepSeek Harness. A small `🛞 制动自检` pill
sits in the bottom-right corner; click it and the plugin runs a **six-stomp full-force
braking test** — the bracket snaps at a **random** stomp between #2 and #6, occasionally
(~1 in 8) not at all, and then a fictional "official notice" pops up.

```
● 自检中止 · 第 4 脚断裂                      session running 14m05s
第 1 脚   1,612 N   ✓ 踏板支架 完好    running 14m05s
第 2 脚   1,658 N   ✓ 踏板支架 完好    log 545 KB
第 3 脚   1,704 N   ✓ 踏板支架 完好    started 21:59
第 4 脚   1,750 N   ✕ 砰 —— 支架断裂   turn 2
────────────────────────────────────────────────────────────
pedal force is derived ← session start / elapsed / log size · break point re-rolled each run
                    [again (random)][not reproduced][collapse]
```

> The in-app copy is Chinese-only for now. The layout above is what you get.

## Disclaimer (please read)

This is a **developer self-mockery gag**. It is not a safety evaluation, not a product
review, and not a statement of fact.

- The "official notice" in the modal is **original bureaucratic-sounding text**. It is not
  a quotation of, or a rewrite of, any real statement, announcement, or response.
- It **does not refer to any real company, brand, product, or event**. No vendor name
  appears anywhere in the UI, the code, or the copy.
- "Pedal force", "break stomp" and "fracture pattern" are **performance numbers**. Pedal
  force is *derived* from session facts (start time / elapsed time / log size) and is
  labelled as derived in the UI. When no facts are available the whole panel says
  "demo data" instead of pretending.
- The break point comes from a **deterministic pseudo-random** function (seed = session id
  + run counter). It carries no statistical or evaluative meaning.

If you show this publicly, show that sentence with it: **it's a gag, not data.**

## Three design rules

1. **It never intercepts the real stop action.** This plugin does not take over the Stop
   button, and it cannot. The "six stomps" are pure theatre on an overlay; the only real
   stop is the one you press yourself (`挂 P 挡（停止会话）`). The real `Stop` button and
   `Esc Esc` work at all times.
2. **Numbers are not invented.** Pedal force is *derived* from hard facts handed over by
   the host: session start time, elapsed time, log size. The UI says "derived". With no
   facts it says "demo data" — it never fakes it.
3. **When it breaks, it disappears.** Any failure (slot injection, a 404 route, a render
   error) writes one console line and leaves the UI untouched. A gag should not break
   your app.

## How the randomness works

```js
BREAK_ODDS = [0.12, 0.26, 0.24, 0.16, 0.10, 0.12]
//            #2    #3    #4    #5    #6   not reproduced
```

Seed = `session id + run counter`, hashed with FNV-1a into a mulberry32 stream. So:

- **the first click in a session is fixed** — you can pre-roll it before a demo instead of
  gambling live;
- **a different session rolls a different set**;
- **only "again" re-rolls** — you can always see another ending.

That beats "truly random every time" for demos: it keeps the surprise without letting the
money stomp whiff.

## What the "shift to P" button actually does

There is no plugin API to interrupt a session (Stop is a **read-only fixed action** of the
shell), so the button has to find the **real stop button** in the DOM and click it — and it
looks for it very conservatively:

- only inside the container that holds the editor (`contenteditable` / `textarea`), at most
  5 levels up;
- the accessible name must be exactly `停止` or `Stop`;
- it must be visible and not disabled;
- if it cannot find one it says so ("no brake pedal found") rather than guessing at some
  other button.

The host half only reads session log files, only serves `GET`, and answers `405` to every
write method.

## Install

Three ways, pick one. **All of them require restarting DeepSeek Harness** (the Restart
button on the Plugins page, or quit and reopen), then refreshing the page.

**① From GitHub** (installs the whole repo, including the video toolchain) — type this into
the **Add plugin** box under Plugins:

```
github:zhanshenovo/dsh-brake-pedal
```

**② Clone and install locally**

```bash
git clone https://github.com/zhanshenovo/dsh-brake-pedal.git
cd dsh-brake-pedal
node tools/install.mjs              # into the desktop profile
node tools/install.mjs --profile web
```

It does the same three things the plugin market does: adds `link:<this package>` to
`dependencies`, adds the package name to `dsh.profile.bundles`, and creates the
`node_modules` junction. `package.json` is backed up to `package.json.bak-brake-pedal`
first. The script resolves paths from its own location, so the clone can live anywhere.

**③ A local tarball** (for when GitHub is unreachable)

Download `dsh-brake-pedal-0.1.0.tgz` (21 KB, runtime files only) from
[Releases](https://github.com/zhanshenovo/dsh-brake-pedal/releases) and put its
**absolute path** into the same box:

```
D:\Downloads\dsh-brake-pedal-0.1.0.tgz
```

> Why ③ exists: the plugin market's own documentation states that its mirrors proxy
> registry packages and dependencies only — **not the GitHub repository itself**. So on a
> network that cannot reach GitHub, switching to a mirror does not rescue a `github:` spec.

## Uninstall

```bash
node tools/uninstall.mjs
```

## Self-check

```bash
node test/smoke.mjs
```

It loads the client bundle the way the host does (the `__ModuleLoader__` envelope), renders
one frame with a minimal React shim (including a StrictMode double-invocation regression
guard and both light/dark themes), verifies the `shell.overlay` registration, runs the
`facts` route against the **real session store** (real `createdAt` / `elapsedMs` /
`logBytes`, plus `POST → 405`), and covers the recording lock (lock honoured, out-of-range
refused, `noBreak` passed through, no config means no lock).

On a machine with no session logs (a CI runner, say) the three session-dependent
assertions report `skip` rather than failing — missing data is not broken code.

## Recording & the promo video

```bash
# Pin the break point for recording (takes effect on refresh, leaves no trace on screen)
#   DevTools: localStorage.setItem('dsh-brake-pedal.lock', '3')   // or 'none'

# Render the demo video frame by frame (headless Edge + ffmpeg → MP4)
node tools/video/render.mjs                     # portrait 1080x1920
node tools/video/render.mjs --w 1920 --h 1080   # landscape

# Cover art
python tools/make-covers.py
```

- `tools/video/timeline.mjs` is the **single source of truth**: both the video frames and
  the SRT subtitles are generated from it, so they cannot drift apart.
- `tools/video/scene.html` is the scene page and exposes `window.__seek(state)`. The page
  runs no animations of its own — every state is driven by the renderer, so the same
  timeline always renders the same video.
- The renderer takes screenshots over CDP (`Page.captureScreenshot`) rather than recording
  the screen: one bad frame costs one frame.
- Point `FFMPEG` at your ffmpeg binary, or put `ffmpeg` on `PATH`.

Shot list, narration script, publishing copy and the compliance red lines are in
[VIDEO.md](VIDEO.md) (Chinese).

## Plugin interface

| Half | What it is |
|---|---|
| host | `lib/index.js`, route `GET /dsh-brake-pedal/facts?session=<id>` |
| client | `client/client.js`, registered into `shell.overlay` (frame-level overlay, session-independent) |

Payload fields: `source` (`host` / `partial` / `none` / `error`), `sessionId`, `matched`
(`exact` / `latest`), `cwd`, `createdAt`, `elapsedMs`, `logBytes`, `logMtimeMs`,
`forcedBreakAt`, `noBreak`.

Theming: every colour goes through the host's `--dsw-alias-*` tokens; when a token is
missing it falls back to a light or dark palette chosen from `data-theme` / background
luminance, and it follows theme switches live.

Errors go to the console only, never thrown at the host.

## License

MIT. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).
