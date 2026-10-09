window.__ModuleLoader__.load({ id: "dsh-brake-pedal", factory: (require) => {
	var module = { exports: {} };
	var exports = module.exports;
	const react = require("react");

	/**
	 * dsh-brake-pedal client：右下角那颗「制动自检」胶囊。
	 *
	 * 挂在 shell.overlay —— 帧级浮层，和会话无关，所以它一定能出现。
	 * 点开做一场 6 脚全力制动测试：支架随机断在第 2–6 脚，偶尔不断，
	 * 然后弹出一份虚构的《情况说明》。
	 *
	 * 四条硬规矩：
	 *  1. 绝不拦截真实停止动作 —— 这个插件没有能力、也没有打算碰它。
	 *  2. 数字要么来自宿主真实事实，要么明确标注是演示数据。
	 *  3. 任何一环失败都安静地不渲染：一个段子不该弄坏界面。
	 *  4. 文案是原创的官僚体，不引用任何真实声明，界面里不出现任何厂商名，
	 *     并且自带虚构声明 —— 它嘲的是"会失效的刹车"，不是某一家。
	 */

	/** 加载即留痕：分不清"没加载"和"加载了没渲染"是最贵的调试成本。 */
	if (typeof console !== "undefined" && console.info) console.info("[dsh-brake-pedal] client bundle loaded");

	const name = "dsh-brake-pedal";
	const inject = ["slots"];

	const ROUTE = "/dsh-brake-pedal/facts";
	const FEET = 6;

	/**
	 * 尽量带上"我是哪个会话"。
	 *
	 * 不带的话宿主只能猜"最近写入的会话"——你可能在看 A，面板显示的是 B 的运行时长。
	 * 拿不到也没关系：宿主收到未知 id 会退化成最近会话，并在界面上标注出来。
	 */
	function sessionHint() {
		try {
			const boot = globalThis.__DSH_BOOT__;
			if (boot !== null && boot !== undefined) {
				if (typeof boot.sessionId === "string" && boot.sessionId !== "") return boot.sessionId;
				if (boot.session !== null && typeof boot.session === "object" && typeof boot.session.id === "string") return boot.session.id;
			}
			const where = String(globalThis.location === undefined ? "" : (globalThis.location.hash || globalThis.location.href || ""));
			const found = /(session[-/][0-9a-f]{8}-[0-9a-f-]{4,})/i.exec(where);
			if (found !== null) return found[1].replace("/", "-");
		} catch (error) {
			// 拿不到就交给宿主退化匹配：宁可标着"最近写入的会话"，也不要不出数。
		}
		return "";
	}

	function factsUrl() {
		const hint = sessionHint();
		return hint === "" ? ROUTE : ROUTE + "?session=" + encodeURIComponent(hint);
	}

	/* ---------- 胶囊的位置：默认贴在发送键正上方，也可以自己拖 ---------- */

	const POS_KEY = "dsh-brake-pedal.pos";
	/** 找不到发送键时的兜底位置（视口右下角）。 */
	const FALLBACK_POS = { right: 16, bottom: 156 };
	/** 拖动后落点与视口边缘的最小距离，免得被拖到看不见的地方。 */
	const VIEWPORT_MARGIN = 8;
	/** 位移小于这个像素数就当成点击，而不是拖动。 */
	const DRAG_SLOP = 4;

	function loadPos() {
		try {
			const raw = globalThis.localStorage.getItem(POS_KEY);
			if (raw === null) return null;
			const parsed = JSON.parse(raw);
			if (parsed !== null && typeof parsed === "object" &&
				typeof parsed.left === "number" && typeof parsed.top === "number") {
				return { left: parsed.left, top: parsed.top };
			}
		} catch (error) {
			// 坏数据、隐私模式、localStorage 被禁 —— 一律当没存过。
		}
		return null;
	}

	function savePos(pos) {
		try {
			globalThis.localStorage.setItem(POS_KEY, JSON.stringify(pos));
		} catch (error) {
			// 存不下就只是下次打开回到默认位置，不影响使用。
		}
	}

	function clearPos() {
		try {
			globalThis.localStorage.removeItem(POS_KEY);
		} catch (error) {
			// 同上。
		}
	}

	/**
	 * 找发送/停止按钮。
	 *
	 * 定位用途，所以比 pressRealStop() 宽松：那个只认「停止」并且真的会按下去，
	 * 这个认「发送」也认「停止」（同一个键会在两者之间切换），而且只量不点。
	 *
	 * 两道：先按可访问名字认；认不出来就退化成「编辑器容器里最靠右的那个可见按钮」
	 * —— 发送键在输入框那一条的最右边，这是结构上的事实，不依赖语言和版本。
	 * 两条都失败就返回 null，调用方落回视口右下角。
	 */
	function findComposerButton() {
		try {
			const label = (el) => (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim();
			const visible = (el) => {
				if (el.disabled === true) return false;
				if (el.getClientRects().length === 0) return false;
				// 别把自己算进去：胶囊也是 role="button"，万一壳子把它挂进了同一个容器。
				if (typeof el.closest === "function" && el.closest("[data-brake-pedal]") !== null) return false;
				return true;
			};
			const named = (el) => /^(发送|停止|Send|Stop)$/i.test(label(el));

			const editors = [];
			const found = document.querySelectorAll("[contenteditable=\"true\"], textarea");
			for (let i = 0; i < found.length; i++) {
				if (found[i].getClientRects().length > 0) editors.push(found[i]);
			}

			for (let e = 0; e < editors.length; e++) {
				const scopes = [];
				let node = editors[e];
				for (let up = 0; up < 5 && node !== null; up++) {
					scopes.push(node);
					node = node.parentElement;
				}

				// 第一道：名字对得上
				for (let s = 0; s < scopes.length; s++) {
					const buttons = scopes[s].querySelectorAll("button, [role=\"button\"]");
					for (let i = 0; i < buttons.length; i++) {
						if (visible(buttons[i]) && named(buttons[i])) return buttons[i];
					}
				}

				// 第二道：最靠右的可见按钮（发送键在输入框那一条的最右边）
				let rightmost = null;
				let rightmostLeft = -Infinity;
				for (let s = 0; s < scopes.length; s++) {
					const buttons = scopes[s].querySelectorAll("button, [role=\"button\"]");
					for (let i = 0; i < buttons.length; i++) {
						const el = buttons[i];
						if (!visible(el)) continue;
						const left = el.getBoundingClientRect().left;
						if (left > rightmostLeft) { rightmostLeft = left; rightmost = el; }
					}
				}
				if (rightmost !== null) return rightmost;
			}
		} catch (error) {
			// 读不到就退回视口右下角。
		}
		return null;
	}

	/** 发送键正上方居中；找不到就返回 null（调用方用 FALLBACK_POS）。 */
	function anchorAboveComposer(size) {
		const button = findComposerButton();
		if (button === null) return null;
		try {
			const rect = button.getBoundingClientRect();
			if (rect.width === 0 && rect.height === 0) return null;
			const left = rect.left + rect.width / 2 - size.width / 2;
			const top = rect.top - size.height - 10;
			return clampToViewport({ left: left, top: top }, size);
		} catch (error) {
			return null;
		}
	}

	function clampToViewport(pos, size) {
		const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - size.width - VIEWPORT_MARGIN);
		const maxTop = Math.max(VIEWPORT_MARGIN, window.innerHeight - size.height - VIEWPORT_MARGIN);
		return {
			left: Math.min(Math.max(VIEWPORT_MARGIN, pos.left), maxLeft),
			top: Math.min(Math.max(VIEWPORT_MARGIN, pos.top), maxTop),
		};
	}

	/**
	 * 断裂位置的分布：第 2–6 脚，外加一个"这次没裂"的可能。
	 *
	 * 权重覆盖了公开测试里出现过的区间（第 2–4 脚），但第 5、6 脚也留了戏，
	 * 并且有约 1/8 的"未复现"。每次都断就不叫梗了，那叫功能。
	 */
	const BREAK_ODDS = [0.12, 0.26, 0.24, 0.16, 0.10, 0.12];

	/** FNV-1a：把会话 id 折成一个稳定的种子。 */
	function seedOf(text) {
		let hash = 2166136261;
		for (let i = 0; i < text.length; i++) {
			hash ^= text.charCodeAt(i);
			hash = Math.imul(hash, 16777619);
		}
		return hash >>> 0;
	}

	/** mulberry32：小而稳的确定性伪随机数。 */
	function randomFrom(seed) {
		let state = seed >>> 0;
		return function () {
			state = (state + 0x6D2B79F5) >>> 0;
			let t = Math.imul(state ^ (state >>> 15), 1 | state);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	}

	/**
	 * 这一次断在第几脚？返回 2..6，或 null 表示"未复现"。
	 *
	 * 种子 = 会话 id + 第几次自检。所以同一个会话里第一次点开的结果是定的，
	 * 换个会话就换一套，点"再来一次"才重掷。既有随机感又可复现——演示前
	 * 可以先摇一次看结果，不用现场赌运气。
	 */
	function rollBreakAt(seedText, attempt) {
		const roll = randomFrom(seedOf(seedText + "#" + attempt))();
		let acc = 0;
		for (let i = 0; i < BREAK_ODDS.length; i++) {
			acc += BREAK_ODDS[i];
			if (roll < acc) return i === BREAK_ODDS.length - 1 ? null : i + 2;
		}
		return null;
	}

	/**
	 * 录制开关（只给操作者用，界面上不出现任何痕迹）：
	 *
	 *   localStorage.setItem('dsh-brake-pedal.lock', '3')     锁死断在第 3 脚
	 *   localStorage.setItem('dsh-brake-pedal.lock', 'none')  只演"未复现"
	 *   localStorage.removeItem('dsh-brake-pedal.lock')       恢复伪随机
	 *
	 * 改完刷新页面即可 —— 不用重启宿主，也不用改 profile 配置。
	 * 它只影响表演，不影响任何真实行为。
	 */
	function localLock() {
		try {
			const raw = globalThis.localStorage.getItem("dsh-brake-pedal.lock");
			if (raw === null) return null;
			const trimmed = String(raw).trim().toLowerCase();
			if (trimmed === "none" || trimmed === "off" || trimmed === "no") return { breakAt: null };
			const n = Number(trimmed);
			if (Number.isInteger(n) && n >= 2 && n <= 6) return { breakAt: n };
		} catch (error) {
			// 读不到 localStorage（隐私模式等）就当没设过。
		}
		return null;
	}

	const PILL_GLYPH = "\u{1F6DE}"; // 踏板
	const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, \"Cascadia Mono\", monospace";

	/**
	 * 配色跟着宿主主题走。
	 *
	 * 只用硬编码色会翻车：浅色主题下面板是深色的，再叠一层黑遮罩，整个窗口都被压黑——
	 * 这不是审美问题，是看不见。所以每个颜色先问宿主的令牌（--dsw-alias-*），
	 * 令牌缺失时才退回按主题分档的兜底色。
	 */
	const DARK = {
		fg: "var(--dsw-alias-label-primary, #e6e9ee)",
		dim: "var(--dsw-alias-label-secondary, #9aa4b2)",
		faint: "var(--dsw-alias-label-tertiary, #6b7482)",
		bg: "var(--dsw-alias-bg-layer-2, #161a20)",
		bg2: "var(--dsw-alias-bg-layer-3, #1c2129)",
		line: "var(--dsw-alias-border-l2, #2a313b)",
		mask: "var(--dsw-alias-bg-mask-1, rgba(6, 8, 11, 0.62))",
		ok: "var(--dsw-alias-state-success-primary, #3fb950)",
		bad: "var(--dsw-alias-state-error-primary, #f0533f)",
		brokenTint: "rgba(240, 83, 63, 0.10)",
		btnPrimaryBg: "#1e2740", btnPrimaryBorder: "#2f4a7a", btnPrimaryFg: "#c5d4ff",
		btnDangerBg: "#2a1a18", btnDangerBorder: "#5a2a26", btnDangerFg: "#ff9c8f",
		shadow: "0 24px 64px rgba(0,0,0,0.55)"
	};

	const LIGHT = {
		fg: "var(--dsw-alias-label-primary, #1f2329)",
		dim: "var(--dsw-alias-label-secondary, #4e5969)",
		faint: "var(--dsw-alias-label-tertiary, #86909c)",
		bg: "var(--dsw-alias-bg-layer-2, #ffffff)",
		bg2: "var(--dsw-alias-bg-layer-3, #f5f6f8)",
		line: "var(--dsw-alias-border-l2, #e5e6eb)",
		mask: "var(--dsw-alias-bg-mask-1, rgba(20, 26, 38, 0.28))",
		ok: "var(--dsw-alias-state-success-primary, #1a7f37)",
		bad: "var(--dsw-alias-state-error-primary, #cf222e)",
		brokenTint: "rgba(207, 34, 46, 0.07)",
		btnPrimaryBg: "#eef2ff", btnPrimaryBorder: "#c7d2fe", btnPrimaryFg: "#2f4a7a",
		btnDangerBg: "#fff1ef", btnDangerBorder: "#ffc9c2", btnDangerFg: "#c0392b",
		shadow: "0 20px 48px rgba(15, 23, 42, 0.18)"
	};

	function buildStyles(C) {
		return {
			pill: {
				position: "fixed", right: 16, bottom: 156, zIndex: 2147483000,
				display: "flex", alignItems: "center", gap: "5px",
				padding: "4px 10px", borderRadius: "999px", cursor: "grab",
				// touchAction 不给 none 的话，触屏上按住胶囊会变成滚动页面而不是拖动
				touchAction: "none",
				font: "12px/1.4 system-ui, -apple-system, \"Segoe UI\", \"Microsoft YaHei\", sans-serif",
				color: C.dim, background: C.bg2, border: "1px solid " + C.line,
				opacity: 0.82, userSelect: "none", boxShadow: C.shadow,
			},
			back: {
				position: "fixed", inset: 0, zIndex: 2147483001,
				background: C.mask, display: "grid", placeItems: "center", padding: "20px",
			},
			card: {
				width: "min(560px, 100%)", background: C.bg, border: "1px solid " + C.line,
				borderRadius: "14px", overflow: "hidden", color: C.fg,
				font: "13px/1.6 system-ui, -apple-system, \"Segoe UI\", \"Microsoft YaHei\", sans-serif",
				boxShadow: C.shadow,
			},
			head: {
				display: "flex", alignItems: "center", gap: "8px",
				padding: "12px 16px", borderBottom: "1px solid " + C.line, fontSize: "12.5px", color: C.dim,
			},
			rows: { padding: "7px 9px 3px" },
			row: {
				display: "grid", gridTemplateColumns: "54px 1fr 108px 1fr", gap: "10px",
				alignItems: "center", padding: "5px 7px", borderRadius: "7px",
				fontFamily: MONO, fontSize: "12px", color: C.dim,
			},
			foot: {
				display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap",
				padding: "10px 14px", borderTop: "1px solid " + C.line, fontSize: "11.5px", color: C.faint,
			},
			btn: {
				border: "1px solid " + C.line, background: C.bg2, color: C.fg,
				borderRadius: "8px", padding: "5px 12px", fontSize: "12.5px", cursor: "pointer",
			},
			btnPrimary: { border: "1px solid " + C.btnPrimaryBorder, background: C.btnPrimaryBg, color: C.btnPrimaryFg },
			btnDanger: { border: "1px solid " + C.btnDangerBorder, background: C.btnDangerBg, color: C.btnDangerFg },
			stat: {
				display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "6px 12px",
				fontFamily: MONO, fontSize: "12px", background: C.bg2,
				border: "1px solid " + C.line, borderRadius: "10px", padding: "11px 13px",
			},
			para: { margin: 0, color: C.dim },
		};
	}

	const THEMES = {
		dark: { C: DARK, S: buildStyles(DARK) },
		light: { C: LIGHT, S: buildStyles(LIGHT) },
	};

	/** 宿主的背景到底是不是深的——从 DOM 上读，读不到按浅色。 */
	function themeIsDark() {
		try {
			const root = document.documentElement;
			const flags = String(root.getAttribute("data-theme") || "") + " " + String(root.className || "") +
				" " + String(document.body === null ? "" : document.body.className || "");
			if (/dark/i.test(flags)) return true;
			if (/light/i.test(flags)) return false;
			const probes = [document.body, root];
			for (let i = 0; i < probes.length; i++) {
				const el = probes[i];
				if (el === null || el === undefined) continue;
				const bg = getComputedStyle(el).backgroundColor;
				const rgb = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(bg);
				if (rgb === null) continue;
				const alpha = /rgba\([^)]*?,\s*([\d.]+)\s*\)/.exec(bg);
				if (alpha !== null && Number(alpha[1]) === 0) continue;
				return 0.299 * Number(rgb[1]) + 0.587 * Number(rgb[2]) + 0.114 * Number(rgb[3]) < 128;
			}
		} catch (error) {
			// 读不到就当浅色：在浅色界面里压黑，是这里最刺眼的错误。
		}
		return false;
	}

	/** 跟随主题切换，而不是只在挂载时读一次。 */
	function useDarkTheme() {
		const state = react.useState(themeIsDark);
		const setDark = state[1];
		react.useEffect(() => {
			const sync = () => setDark(themeIsDark());
			sync();
			let observer = null;
			try {
				observer = new MutationObserver(sync);
				const opts = { attributes: true, attributeFilter: ["class", "data-theme", "style"] };
				observer.observe(document.documentElement, opts);
				if (document.body !== null) observer.observe(document.body, opts);
			} catch (error) {
				observer = null;
			}
			return () => { if (observer !== null) observer.disconnect(); };
		}, []);
		return state[0];
	}

	/* ---------- 格式化 ---------- */

	function fmtDur(ms) {
		if (typeof ms !== "number" || !isFinite(ms) || ms < 0) return "—";
		const total = Math.floor(ms / 1000);
		const hours = Math.floor(total / 3600);
		const minutes = Math.floor((total % 3600) / 60);
		const seconds = total % 60;
		if (hours > 0) return hours + "h" + String(minutes).padStart(2, "0") + "m";
		if (minutes > 0) return minutes + "m" + String(seconds).padStart(2, "0") + "s";
		return seconds + "s";
	}

	function fmtClock(ts) {
		if (typeof ts !== "number") return "—";
		const d = new Date(ts);
		return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
	}

	function fmtBytes(bytes) {
		if (typeof bytes !== "number") return "—";
		const kb = bytes / 1024;
		if (kb >= 1024) return (kb / 1024).toFixed(1) + " MB";
		return Math.round(kb) + " KB";
	}

	function thousands(n) {
		return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	}

	/* ---------- 真实事实 → 踏板力 ---------- */

	/**
	 * 踏板力是**推导值**，不是测量值——界面上的小字必须说清楚这一点。
	 * 输入全是宿主给的硬事实：会话已运行多久、日志多大、什么时候开始。
	 */
	function pedalPlan(facts) {
		const live = facts !== null && facts.source !== "none" && typeof facts.elapsedMs === "number";
		const minutes = live ? Math.floor(facts.elapsedMs / 60000) : 0;
		const kb = live && typeof facts.logBytes === "number" ? Math.round(facts.logBytes / 1024) : 0;
		const base = live ? 1560 + Math.min(140, minutes * 3) + (kb % 37) : 1600;
		const notes = live
			? [
				"运行 " + fmtDur(facts.elapsedMs),
				"日志 " + fmtBytes(facts.logBytes),
				fmtClock(facts.createdAt) + " 起",
				"轮次 " + (1 + (minutes % 5)),
				"采样 " + (kb % 97) + " 次",
				"再测就该断了"
			]
			: ["演示数据", "演示数据", "演示数据", "演示数据", "演示数据", "演示数据"];
		const out = [];
		for (let i = 0; i < FEET; i++) {
			out.push({ force: base + i * 46, note: notes[i] === undefined ? "" : notes[i] });
		}
		return out;
	}

	/* ---------- 唯一的真实停止路径 ---------- */

	/**
	 * 「挂 P 挡」是整场表演里唯一会碰真实世界的一下。
	 *
	 * 插件没有中断会话的 API（Stop 是 shell 的只读固定动作），所以这里只能
	 * 找到那个真实的停止按钮并按下它——而且必须找得足够保守：
	 * 先只在编辑器所在的容器里找，名字必须精确等于「停止」或「Stop」，
	 * 必须可见、必须可用。找不到就承认找不到，不去猜别的按钮。
	 */
	function pressRealStop() {
		try {
			const isStop = (el) => {
				if (el.disabled === true) return false;
				if (el.offsetParent === null && el.getClientRects().length === 0) return false;
				const label = (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim();
				return /^(停止|Stop)$/i.test(label);
			};

			const editors = [];
			const found = document.querySelectorAll("[contenteditable=\"true\"], textarea");
			for (let i = 0; i < found.length; i++) {
				const el = found[i];
				if (el.getClientRects().length > 0) editors.push(el);
			}

			for (let e = 0; e < editors.length; e++) {
				let node = editors[e];
				for (let up = 0; up < 5 && node !== null; up++) {
					const buttons = node.querySelectorAll("button, [role=\"button\"]");
					const candidates = [];
					for (let i = 0; i < buttons.length; i++) if (isStop(buttons[i])) candidates.push(buttons[i]);
					if (candidates.length > 0) {
						candidates[0].click();
						return true;
					}
					node = node.parentElement;
				}
			}
		} catch (error) {
			if (typeof console !== "undefined" && console.warn) console.warn("[dsh-brake-pedal] stop attempt failed", error);
		}
		return false;
	}

	/* ---------- 组件 ---------- */

	function BrakeOverlay() {
		const theme = THEMES[useDarkTheme() === true ? "dark" : "light"];
		const C = theme.C;
		const S = theme.S;

		const state = react.useState({ open: false, rows: [], broken: false, modal: null, note: "", breakAt: null });
		const view = state[0];
		const setView = state[1];
		const factsState = react.useState(null);
		const facts = factsState[0];
		const setFacts = factsState[1];
		const timers = react.useRef([]);
		/** 本会话第几次自检：决定重掷出来的断裂位置。 */
		const attemptRef = react.useRef(0);

		/** 操作者拖出来的位置；null = 没拖过，用默认锚点（发送键上方）。 */
		const posState = react.useState(loadPos);
		const pos = posState[0];
		const setPos = posState[1];
		const posRef = react.useRef(pos);
		/** 默认锚点：发送键正上方。量不到就是 null，用 FALLBACK_POS。 */
		const anchorState = react.useState(null);
		const anchor = anchorState[0];
		const setAnchor = anchorState[1];
		const pillRef = react.useRef(null);
		const dragRef = react.useRef(null);

		const clearTimers = () => {
			for (let i = 0; i < timers.current.length; i++) clearTimeout(timers.current[i]);
			timers.current = [];
		};

		react.useEffect(() => clearTimers, []);

		/**
		 * 默认位置 = 发送键正上方。
		 *
		 * 发送键是壳子后来才挂上的（有时甚至比浮层晚很久），所以量几次而不是只量一次：
		 * 挂载后 0 / 250 / 800 / 2000 ms 各量一次，窗口尺寸变化时也重量。
		 * 全程量不到就什么都不做，胶囊留在 FALLBACK_POS（视口右下角）。
		 */
		react.useEffect(() => {
			if (view.open || pos !== null) return undefined;
			const place = () => {
				const el = pillRef.current;
				if (el === null) return;
				const rect = el.getBoundingClientRect();
				setAnchor(anchorAboveComposer({ width: rect.width, height: rect.height }));
			};
			place();
			const retries = [250, 800, 2000].map((ms) => setTimeout(place, ms));
			window.addEventListener("resize", place);
			return () => {
				for (let i = 0; i < retries.length; i++) clearTimeout(retries[i]);
				window.removeEventListener("resize", place);
			};
		}, [view.open, pos === null]);

		const loadFacts = () => {
			try {
				fetch(factsUrl(), { cache: "no-store" })
					.then((response) => (response.ok ? response.json() : Promise.reject(new Error("HTTP " + response.status))))
					.then((data) => setFacts(data !== null && typeof data === "object" ? data : null))
					.catch(() => setFacts(null));
			} catch (error) {
				setFacts(null);
			}
		};

		react.useEffect(() => { loadFacts(); }, []);

		const plan = pedalPlan(facts);

		const schedule = (values, breakAt) => {
			const total = breakAt === null ? FEET : breakAt;
			for (let i = 0; i < total; i++) {
				((index) => {
					const isBreak = breakAt !== null && index === total - 1;
					const isCleanEnd = breakAt === null && index === total - 1;
					timers.current.push(setTimeout(() => {
						const foot = values[index] === undefined ? { force: 1600, note: "" } : values[index];
						setView((prev) => {
							const rows = prev.rows.slice();
							rows.push({ index: index + 1, force: foot.force, note: foot.note, broken: isBreak });
							return Object.assign({}, prev, { rows: rows, broken: isBreak });
						});
						if (isBreak) timers.current.push(setTimeout(() => setView((prev) => Object.assign({}, prev, { modal: "broken" })), 650));
						else if (isCleanEnd) timers.current.push(setTimeout(() => setView((prev) => Object.assign({}, prev, { modal: "clean" })), 450));
					}, 700 * index + 220));
				})(i);
			}
		};

		/**
		 * 第一次点击可能发生在事实还没到的时候。那样面板会显示"演示数据"，
		 * 第一次体验就浪费了——所以先取一次事实，拿到了再排动画。
		 * 断裂位置在拿到事实之后才掷：种子要用真实的会话 id。
		 */
		const start = (cleanMode) => {
			clearTimers();
			const attempt = attemptRef.current;
			attemptRef.current = attempt + 1;
			setView({ open: true, rows: [], broken: false, modal: null, note: "", breakAt: null });

			const play = (data) => {
				const seedText = data === null || typeof data.sessionId !== "string" ? "anonymous" : data.sessionId;
				const lock = localLock();
				const hostForced = data !== null && typeof data.forcedBreakAt === "number" ? data.forcedBreakAt : null;
				const hostSuppress = data !== null && data.noBreak === true;

				let breakAt;
				if (cleanMode || hostSuppress || (lock !== null && lock.breakAt === null)) breakAt = null;
				else if (lock !== null) breakAt = lock.breakAt;
				else if (hostForced !== null) breakAt = hostForced;
				else breakAt = rollBreakAt(seedText, attempt);

				// 掷法只写进 console：演示/录制前想先知道断在第几脚，看这里就够了。
				if (typeof console !== "undefined" && console.info) {
					const how = lock !== null ? " (localStorage 锁定)" : (hostForced !== null ? " (profile 锁定)" : "");
					console.info("[dsh-brake-pedal] roll #" + attempt + how + " -> " +
						(breakAt === null ? "未复现" : "第 " + breakAt + " 脚断裂"));
				}
				setView((prev) => Object.assign({}, prev, { breakAt: breakAt }));
				schedule(pedalPlan(data), breakAt);
			};

			if (facts !== null) {
				play(facts);
				return;
			}
			let settled = false;
			const begin = (data) => {
				if (settled) return;
				settled = true;
				play(data);
			};
			timers.current.push(setTimeout(() => begin(null), 900));
			fetch(factsUrl(), { cache: "no-store" })
				.then((response) => (response.ok ? response.json() : Promise.reject(new Error("HTTP " + response.status))))
				.then((data) => { setFacts(data !== null && typeof data === "object" ? data : null); begin(data); })
				.catch(() => { setFacts(null); begin(null); });
		};

		const close = () => { clearTimers(); setView({ open: false, rows: [], broken: false, modal: null, note: "", breakAt: null }); };

		/** 打开时 Esc 关掉：浮层必须永远有一条不用鼠标的退路。 */
		react.useEffect(() => {
			if (!view.open) return undefined;
			const onKey = (event) => {
				if (event.key !== "Escape") return;
				clearTimers();
				setView((prev) => (prev.modal === null
					? { open: false, rows: [], broken: false, modal: null, note: "", breakAt: null }
					: Object.assign({}, prev, { modal: null })));
			};
			document.addEventListener("keydown", onKey, true);
			return () => document.removeEventListener("keydown", onKey, true);
		}, [view.open, view.modal === null]);

		const keepRunning = () => setView((prev) => Object.assign({}, prev, { modal: null }));

		const pullHandbrake = () => {
			const stopped = pressRealStop();
			setView((prev) => Object.assign({}, prev, {
				modal: null,
				note: stopped
					? "已通过 P 挡应急制动 · 真实停止已触发（这一次是你亲手按的）"
					: "未找到制动踏板：当前没有正在执行的会话，或者停止按钮此刻不存在"
			}));
		};

		const h = react.createElement;

		const pillSize = () => {
			const el = pillRef.current;
			if (el === null) return { width: 0, height: 0 };
			const rect = el.getBoundingClientRect();
			return { width: rect.width, height: rect.height };
		};

		/**
		 * 拖动。
		 *
		 * 点击与拖动都靠 pointer 事件区分：位移小于 DRAG_SLOP 才算点击。
		 * 所以这里**没有 onClick** —— 指针按下的那一下已经决定了这是拖还是点，
		 * 再加 onClick 会让"拖完之后松手"也弹面板。
		 * 键盘走 onKeyDown，不受影响。
		 */
		const onPillPointerDown = (event) => {
			if (typeof event.button === "number" && event.button !== 0) return;
			const el = pillRef.current;
			if (el === null) return;
			const rect = el.getBoundingClientRect();
			dragRef.current = {
				offsetX: event.clientX - rect.left,
				offsetY: event.clientY - rect.top,
				startX: event.clientX,
				startY: event.clientY,
				moved: false,
			};
			try { el.setPointerCapture(event.pointerId); } catch (error) { /* 不支持指针捕获也能拖，只是出界会丢 */ }
		};

		const onPillPointerMove = (event) => {
			const drag = dragRef.current;
			if (drag === null) return;
			if (!drag.moved &&
				Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY) < DRAG_SLOP) {
				return;
			}
			drag.moved = true;
			const next = clampToViewport(
				{ left: event.clientX - drag.offsetX, top: event.clientY - drag.offsetY },
				pillSize());
			posRef.current = next;
			setPos(next);
		};

		const onPillPointerUp = (event) => {
			const drag = dragRef.current;
			dragRef.current = null;
			try {
				if (pillRef.current !== null) pillRef.current.releasePointerCapture(event.pointerId);
			} catch (error) { /* 没有捕获时释放会抛，忽略 */ }
			if (drag === null) return;
			if (drag.moved) { savePos(posRef.current); return; }
			start(false);
		};

		/** 双击（或点面板里的「复位位置」）把胶囊放回发送键上方。 */
		const resetPillPos = () => {
			clearPos();
			posRef.current = null;
			setPos(null);
		};

		/* 收起状态：默认贴在发送键上方，可以拖，双击复位。 */
		if (!view.open) {
			const placed = pos !== null ? pos : anchor;
			const style = placed === null
				? S.pill
				: Object.assign({}, S.pill, {
					left: placed.left + "px", top: placed.top + "px", right: "auto", bottom: "auto",
				});
			return h("div", {
				ref: pillRef,
				style: style,
				role: "button",
				tabIndex: 0,
				title: "制动系统自检（彩蛋：不拦任何停止动作）· 可拖动，双击复位",
				"data-brake-pedal": "pill",
				onPointerDown: onPillPointerDown,
				onPointerMove: onPillPointerMove,
				onPointerUp: onPillPointerUp,
				onDoubleClick: resetPillPos,
				onKeyDown: (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); start(false); } },
			}, h("span", { style: { fontSize: "13px" } }, PILL_GLYPH), h("span", null, "制动自检"));
		}

		const rows = view.rows.map((row, i) => h("div", {
			key: "foot-" + i,
			style: Object.assign({}, S.row, row.broken ? { background: C.brokenTint } : null),
		},
			h("span", { style: { color: C.faint } }, "第 " + row.index + " 脚"),
			h("span", { style: { color: C.fg, textAlign: "right" } }, thousands(row.force) + " N"),
			h("span", { style: { color: row.broken ? C.bad : C.ok, fontWeight: row.broken ? 700 : 400 } },
				row.broken ? "✕ 砰 —— 支架断裂" : "✓ 踏板支架 完好"),
			h("span", { style: { color: C.faint, fontSize: "11px" } }, row.note)));

		const live = facts !== null && facts.source !== "none";
		const brokeAt = typeof view.breakAt === "number" ? view.breakAt : null;

		const statRows = view.modal === "broken" && brokeAt !== null
			? [
				["踏板力峰值", thousands(plan[brokeAt - 1].force) + " N", true],
				["断裂脚次", "第 " + brokeAt + " 脚 / 共 " + FEET + " 脚", false],
				["断口形态", "高度一致", true],
				["制动距离", "约 38 m → 约 140 m", true],
				["会话已运行", live ? fmtDur(facts.elapsedMs) : "演示数据", false],
				["会话日志", live ? fmtBytes(facts.logBytes) : "演示数据", false],
			]
			: [
				["踏板力峰值", thousands(plan[FEET - 1].force) + " N", false],
				["断裂脚次", "无", false],
				["断口形态", "未复现", false],
				["结论", "本次未复现", false],
				["会话已运行", live ? fmtDur(facts.elapsedMs) : "演示数据", false],
				["建议", "继续开，别测了", false],
			];

		const modal = view.modal === null ? null : h("div", {
			style: S.back,
			onClick: (event) => { if (event.target === event.currentTarget) keepRunning(); },
		},
			h("div", { style: S.card, "data-brake-pedal": "modal" },
				h("div", { style: { padding: "16px 18px 12px", borderBottom: "1px solid " + C.line } },
					h("div", { style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" } },
						h("span", { style: { fontSize: "11px", letterSpacing: "0.12em", color: C.bad } },
							"关于本次运行制动踏板支架异常的情况说明"),
						h("span", {
							style: {
								fontSize: "10px", padding: "1px 6px", borderRadius: "999px",
								border: "1px solid " + C.line, color: C.faint, letterSpacing: "0.04em",
							},
						}, "虚构段子")),
					h("div", { style: { fontSize: "15px", fontWeight: 600, color: C.fg } },
						view.modal === "broken" && brokeAt !== null
							? "第 " + brokeAt + " 脚全力制动时，踏板支架发生结构分离"
							: "自检完成 · " + FEET + " 脚全部通过")),
				h("div", { style: { padding: "14px 18px", display: "flex", flexDirection: "column", gap: "11px" } },
					h("div", { style: S.stat }, statRows.map((entry, i) => [
						h("span", { key: "k" + i, style: { color: C.faint } }, entry[0]),
						h("span", { key: "s" + i }),
						h("span", { key: "v" + i, style: { color: entry[2] ? C.bad : C.fg, textAlign: "right" } }, entry[1]),
					])),
					h("p", { style: S.para },
						"我们对任何与制动有关的反馈都保持最高级别的关注。本系统的验证遵循一套完整的内部流程，",
						"其边界由多轮试验共同划定，并覆盖多种非标准工况。"),
					h("p", { style: S.para },
						"需要说明的是：本次结果来自一次",
						h("b", { style: { color: C.fg } }, "极端且非标准"),
						"的连续制动工况，它不构成对日常使用表现的判断，也不构成任何安全结论。"),
					h("p", { style: S.para },
						"相关部件的设计复核、试验边界复查与质量追溯工作已经启动。"),
					h("p", {
						style: {
							margin: 0, fontSize: "11.5px", color: C.faint,
							borderTop: "1px dashed " + C.line, paddingTop: "9px",
						},
					},
						"⚠ 本页是开发者自嘲性质的",
						h("b", { style: { color: C.dim } }, "虚构段子"),
						"：不指向任何真实企业、产品或事件，与任何厂商无关，也不构成任何安全评价。"),
					live
						? h("p", { style: { margin: 0, fontSize: "11.5px", color: C.faint, fontFamily: MONO } },
							"数据源：会话 " + (facts.sessionId === null ? "未知" : facts.sessionId) +
							(facts.matched === "latest" ? "（最近写入的会话）" : "") +
							" · 踏板力为推导值")
						: h("p", { style: { margin: 0, fontSize: "11.5px", color: C.faint, fontFamily: MONO } },
							"未取到会话事实，本次全部为演示数据")),
				h("div", { style: { display: "flex", gap: "8px", justifyContent: "flex-end", padding: "12px 18px 16px", borderTop: "1px solid " + C.line } },
					h("button", { style: S.btn, onClick: keepRunning }, view.modal === "broken" ? "继续运行" : "好，继续开"),
					view.modal === "broken"
						? h("button", { style: Object.assign({}, S.btn, S.btnDanger), onClick: pullHandbrake }, "挂 P 挡（停止会话）")
						: null)));

		return h("div", {
			style: S.back,
			"data-brake-pedal": "panel",
			onClick: (event) => { if (event.target === event.currentTarget) close(); },
		},
			h("div", { style: Object.assign({}, S.card, view.broken ? { borderColor: C.bad } : null) },
				h("div", { style: S.head },
					h("span", { style: { width: "6px", height: "6px", borderRadius: "50%", background: view.broken ? C.bad : C.ok } }),
					h("span", { style: { color: C.fg, fontWeight: 600 } },
						view.broken && brokeAt !== null
							? "自检中止 · 第 " + brokeAt + " 脚断裂"
							: "制动系统自检 · " + FEET + " 脚全力制动测试"),
					h("span", { style: { flex: 1 } }),
					h("span", null, live ? "会话已运行 " + fmtDur(facts.elapsedMs) : "演示数据")),
				h("div", { style: S.rows }, rows),
				h("div", { style: S.foot },
					h("span", null, live
						? "踏板力为推导值 ← 会话起始时间 / 已运行时长 / 日志体积 · 断裂位置每次重掷"
						: "未取到会话事实：以下为演示数据"),
					h("span", { style: { flex: 1 } }),
					h("button", { style: Object.assign({}, S.btn, S.btnPrimary), onClick: () => start(false) }, "再来一次（随机）"),
					h("button", { style: S.btn, onClick: () => start(true) }, "未复现模式"),
					h("button", { style: S.btn, onClick: resetPillPos }, "复位位置"),
					h("button", { style: S.btn, onClick: close }, "收起")),
				view.note === "" ? null : h("div", {
					style: { padding: "9px 14px", borderTop: "1px solid " + C.line, fontSize: "11.5px", color: C.dim },
				}, view.note)),
			modal);
	}

	/**
	 * 只挂一个挂载点：shell.overlay。
	 *
	 * 这里刻意不做"两处注册、单例去重"——那版实现用一个模块级 flag 在 render
	 * 期间改外部状态，React 18 的 StrictMode 会二次调用函数体，第二次直接返回
	 * null，于是胶囊永远不出现（真实事故，不是假设）。去重的诱惑换来的是
	 * 挂不上去，不值得。
	 */
	function apply(ctx) {
		const warn = (message, error) => {
			if (typeof console !== "undefined" && console.warn) console.warn("[dsh-brake-pedal] " + message, error);
		};

		try {
			ctx.slots.inject("shell.overlay", () => {
				try {
					ctx.slots.register({ name: "shell.overlay", id: "dsh-brake-pedal-overlay", order: 998 }, () =>
						react.createElement(BrakeOverlay, {}));
					if (typeof console !== "undefined" && console.info) console.info("[dsh-brake-pedal] registered into shell.overlay");
				} catch (error) {
					warn("register into shell.overlay failed", error);
				}
			});
		} catch (error) {
			warn("inject shell.overlay failed", error);
		}
	}

	exports.apply = apply;
	exports.inject = inject;
	exports.name = name;
	return module.exports;
}
});
