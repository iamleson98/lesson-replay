/**
 * Drawing a graph: ticks, axes, and the curves sampled from their formulas.
 *
 * Cost is bounded by pixels, not by what the element says: a curve is sampled
 * about once per two screen pixels (24 to 800 samples), so a board full of
 * graphs costs what is visible, and a graph a few pixels wide is only a frame.
 * The geometry (Path2D per curve, marked points) is cached per element and
 * sample count — elements are immutable, so it is valid for as long as the
 * element exists.
 */

import { distanceToSegment, type ColorToken, type Point } from '../elements';
import { dot, frameHit, haloText, runsHit, scaleOf, type InkStyle } from './canvas';
import { compile, type Expression } from './expression';
import {
	formatNumber,
	plotSpace,
	type FnSeries,
	type GraphElement,
	type ParamSeries,
	type PlotSpace,
	type PointSeries
} from './graph';

type GraphStyle = InkStyle & {
	/** Axes, grid and labels. */
	muted: string;
};

const MIN_SAMPLES = 64;
const MAX_SAMPLES = 800;
/** A jump larger than this many view heights splits the curve (asymptotes). */
const BREAK = 3;
const MAX_MARKS = 12;
/** Below this on-screen width a graph is only drawn as its frame. */
const MIN_DRAWN_PX = 24;
const TICK_LABEL = 13;
const TICK_GAP = 64;
/** Tick steps in quarters of π: π/4, π/2, π, 2π, 4π, 10π… */
const PI_STEPS = [1, 2, 4, 8, 16, 40, 80, 160, 400, 800];

// ─── Ticks ─────────────────────────────────────────────────────────────

/** A 1, 2 or 5 step so that about `target` ticks fit in `span`. */
export function niceStep(span: number, target: number): number {
	const raw = span / Math.max(1, target);
	const mag = 10 ** Math.floor(Math.log10(raw));
	const n = raw / mag;
	return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
}

export type Tick = { value: number; label: string };

function gcd(a: number, b: number): number {
	return b === 0 ? a : gcd(b, a % b);
}

/** `k` quarters of π as a label: π/2, 3π/4, -π, 2π. */
export function piLabel(k: number, quarters: number): string {
	if (k === 0) return '0';
	const g = gcd(Math.abs(k), quarters);
	const n = k / g;
	const d = quarters / g;
	const sign = n < 0 ? '-' : '';
	const abs = Math.abs(n);
	const top = abs === 1 ? 'π' : `${abs}π`;
	return d === 1 ? `${sign}${top}` : `${sign}${top}/${d}`;
}

export function axisTicks(min: number, max: number, lengthPx: number, pi: boolean): Tick[] {
	const out: Tick[] = [];
	if (pi) {
		// Steps of π/4, π/2, π, 2π… the first that leaves room for the labels.
		const quarters =
			PI_STEPS.find((q) => ((q * Math.PI) / 4 / (max - min)) * lengthPx >= TICK_GAP * 0.75) ??
			PI_STEPS[PI_STEPS.length - 1];
		const step = (quarters * Math.PI) / 4;
		const first = Math.ceil(min / step - 1e-9);
		for (let k = first; k * step <= max + 1e-9 && out.length < 200; k++) {
			out.push({ value: k * step, label: piLabel(k * quarters, 4) });
		}
		return out;
	}
	const step = niceStep(max - min, lengthPx / TICK_GAP);
	const first = Math.ceil(min / step - 1e-9);
	for (let k = first; k * step <= max + step * 1e-9 && out.length < 200; k++) {
		const value = Math.abs(k * step) < step * 1e-9 ? 0 : k * step;
		out.push({ value, label: formatNumber(value, 6) });
	}
	return out;
}

// ─── Sampling ──────────────────────────────────────────────────────────

type Run = number[]; // flat [x, y, x, y…] in board units

type MarkedPoint = { x: number; y: number; label: string; color: ColorToken };

type CurveGeometry = {
	color: ColorToken;
	dash: boolean;
	path: Path2D;
	/** The shaded area under the curve, with its value. */
	shade: { path: Path2D; area: number; at: Point } | null;
};

type Geometry = { curves: CurveGeometry[]; marks: MarkedPoint[]; points: PointSeries[] };

const cache = new WeakMap<GraphElement, Map<number, Geometry>>();
const hitCache = new WeakMap<GraphElement, Run[]>();

export function sampleCount(widthPx: number): number {
	const n = Math.ceil(widthPx / 2 / 32) * 32;
	return Math.min(MAX_SAMPLES, Math.max(MIN_SAMPLES, n));
}

function toPath(runs: Run[]): Path2D {
	const path = new Path2D();
	for (const run of runs) {
		if (run.length < 4) continue;
		path.moveTo(run[0], run[1]);
		for (let i = 2; i < run.length; i += 2) path.lineTo(run[i], run[i + 1]);
	}
	return path;
}

function compileFn(s: FnSeries, el: GraphElement): Extract<Expression, { ok: true }> | null {
	const e = compile(s.expr, { variable: 'x', degrees: el.degrees });
	return e.ok ? e : null;
}

/** Splits a sampled curve into continuous runs of board coordinates. */
function sampleFn(s: FnSeries, el: GraphElement, space: PlotSpace, n: number) {
	const e = compileFn(s, el);
	if (!e) return null;
	const [xmin, xmax, ymin, ymax] = el.view;
	const spanY = ymax - ymin;
	const reach = spanY * 50;
	const step = (xmax - xmin) / n;
	const runs: Run[] = [];
	const xs: number[] = [];
	const ys: number[] = [];
	let run: Run = [];
	let prev = NaN;
	for (let i = 0; i <= n; i++) {
		const x = xmin + i * step;
		const y = e.eval(x, el.params);
		xs.push(x);
		ys.push(y);
		const ok = Number.isFinite(y);
		if (!ok || (Number.isFinite(prev) && Math.abs(y - prev) > spanY * BREAK)) {
			if (run.length) runs.push(run);
			run = [];
		}
		if (ok) {
			run.push(space.px(x), space.py(Math.max(ymin - reach, Math.min(ymax + reach, y))));
		}
		prev = y;
	}
	if (run.length) runs.push(run);
	return { runs, xs, ys, eval: (x: number) => e.eval(x, el.params) };
}

function sampleParam(s: ParamSeries, el: GraphElement, space: PlotSpace, n: number): Run[] {
	const fx = compile(s.x, { variable: 't', degrees: el.degrees });
	const fy = compile(s.y, { variable: 't', degrees: el.degrees });
	if (!fx.ok || !fy.ok) return [];
	const [xmin, xmax, ymin, ymax] = el.view;
	const reachX = (xmax - xmin) * 50;
	const reachY = (ymax - ymin) * 50;
	const [t0, t1] = s.t;
	const runs: Run[] = [];
	let run: Run = [];
	const count = Math.max(n, 90);
	for (let i = 0; i <= count; i++) {
		const t = t0 + ((t1 - t0) * i) / count;
		const x = fx.eval(t, el.params);
		const y = fy.eval(t, el.params);
		if (!Number.isFinite(x) || !Number.isFinite(y)) {
			if (run.length) runs.push(run);
			run = [];
			continue;
		}
		run.push(
			space.px(Math.max(xmin - reachX, Math.min(xmax + reachX, x))),
			space.py(Math.max(ymin - reachY, Math.min(ymax + reachY, y)))
		);
	}
	if (run.length) runs.push(run);
	return runs;
}

const clean = (v: number) => (Math.abs(v) < 1e-9 ? 0 : v);

function markLabel(x: number, y: number): string {
	return `(${formatNumber(clean(x), 3)}, ${formatNumber(clean(y), 3)})`;
}

/** Roots, extrema and the y-intercept of a sampled curve, refined numerically. */
function findMarks(
	s: FnSeries,
	el: GraphElement,
	sample: NonNullable<ReturnType<typeof sampleFn>>
): MarkedPoint[] {
	const { xs, ys, eval: f } = sample;
	const [xmin, xmax, ymin, ymax] = el.view;
	const spanY = ymax - ymin;
	const found: MarkedPoint[] = [];
	const add = (x: number, y: number) => {
		if (found.length >= MAX_MARKS) return;
		if (x < xmin || x > xmax || y < ymin - spanY * 0.05 || y > ymax + spanY * 0.05) return;
		if (found.some((m) => Math.abs(m.x - x) < 1e-9 && Math.abs(m.y - y) < 1e-9)) return;
		found.push({ x, y, label: markLabel(x, y), color: s.color });
	};
	const smooth = (i: number) =>
		Number.isFinite(ys[i]) &&
		Number.isFinite(ys[i + 1]) &&
		Math.abs(ys[i + 1] - ys[i]) < spanY * BREAK;

	if (s.marks.includes('roots')) {
		for (let i = 0; i < ys.length - 1; i++) {
			if (!smooth(i)) continue;
			if (ys[i] === 0) {
				add(xs[i], 0);
			} else if (ys[i] * ys[i + 1] < 0) {
				let lo = xs[i];
				let hi = xs[i + 1];
				for (let k = 0; k < 48; k++) {
					const mid = (lo + hi) / 2;
					if (f(lo) * f(mid) <= 0) hi = mid;
					else lo = mid;
				}
				const root = (lo + hi) / 2;
				if (Math.abs(f(root)) < spanY * 0.01) add(root, 0);
			}
		}
	}
	if (s.marks.includes('extrema')) {
		for (let i = 1; i < ys.length - 1; i++) {
			if (!smooth(i - 1) || !smooth(i)) continue;
			const up = ys[i] - ys[i - 1];
			const down = ys[i + 1] - ys[i];
			if (up * down >= 0) continue;
			const maximum = up > 0;
			let lo = xs[i - 1];
			let hi = xs[i + 1];
			for (let k = 0; k < 60; k++) {
				const a = lo + (hi - lo) / 3;
				const b = hi - (hi - lo) / 3;
				if (maximum ? f(a) < f(b) : f(a) > f(b)) lo = a;
				else hi = b;
			}
			const x = (lo + hi) / 2;
			add(x, f(x));
		}
	}
	if (s.marks.includes('intercept') && xmin <= 0 && xmax >= 0) {
		const y = f(0);
		if (Number.isFinite(y)) add(0, y);
	}
	return found;
}

/** ∫ f over [a, b] by the trapezoid rule on a fine grid; NaN across a pole. */
function area(f: (x: number) => number, a: number, b: number): number {
	const n = 400;
	const h = (b - a) / n;
	let sum = 0;
	let prev = f(a);
	for (let i = 1; i <= n; i++) {
		const y = f(a + i * h);
		if (!Number.isFinite(y) || !Number.isFinite(prev)) return NaN;
		sum += ((prev + y) / 2) * h;
		prev = y;
	}
	return sum;
}

function buildShade(
	s: FnSeries,
	el: GraphElement,
	space: PlotSpace,
	f: (x: number) => number
): CurveGeometry['shade'] {
	if (!s.shade) return null;
	const [xmin, xmax, ymin, ymax] = el.view;
	const a = Math.max(s.shade[0], xmin);
	const b = Math.min(s.shade[1], xmax);
	if (b <= a) return null;
	const n = Math.min(MAX_SAMPLES, Math.max(16, Math.ceil(((b - a) / (xmax - xmin)) * 400)));
	const base = space.py(0);
	const reach = (ymax - ymin) * 50;
	const path = new Path2D();
	let open = false;
	let lastX = 0;
	const close = () => {
		if (!open) return;
		path.lineTo(lastX, base);
		path.closePath();
		open = false;
	};
	for (let i = 0; i <= n; i++) {
		const x = a + ((b - a) * i) / n;
		const y = f(x);
		if (!Number.isFinite(y)) {
			close();
			continue;
		}
		const px = space.px(x);
		if (!open) {
			path.moveTo(px, base);
			open = true;
		}
		path.lineTo(px, space.py(Math.max(ymin - reach, Math.min(ymax + reach, y))));
		lastX = px;
	}
	close();
	const total = area(f, s.shade[0], s.shade[1]);
	return {
		path,
		area: total,
		at: {
			x: space.px((a + b) / 2),
			y: space.py(Math.max(0, Math.min(ymax, f((a + b) / 2) / 2)))
		}
	};
}

function build(el: GraphElement, samples: number): Geometry {
	const space = plotSpace(el);
	const curves: CurveGeometry[] = [];
	const marks: MarkedPoint[] = [];
	const points: PointSeries[] = [];
	for (const s of el.series) {
		if (s.kind === 'point') {
			points.push(s);
		} else if (s.kind === 'fn') {
			const sampled = sampleFn(s, el, space, samples);
			if (!sampled) continue;
			curves.push({
				color: s.color,
				dash: s.dash,
				path: toPath(sampled.runs),
				shade: buildShade(s, el, space, sampled.eval)
			});
			if (s.marks.length) marks.push(...findMarks(s, el, sampled));
		} else {
			curves.push({
				color: s.color,
				dash: s.dash,
				path: toPath(sampleParam(s, el, space, samples)),
				shade: null
			});
		}
	}
	return { curves, marks, points };
}

function geometryFor(el: GraphElement, samples: number): Geometry {
	let bySamples = cache.get(el);
	if (!bySamples) cache.set(el, (bySamples = new Map()));
	let geometry = bySamples.get(samples);
	if (!geometry) {
		if (bySamples.size > 4) bySamples.clear();
		geometry = build(el, samples);
		bySamples.set(samples, geometry);
	}
	return geometry;
}

/** The curves as polylines in board units (cached), for hit testing. */
function hitRuns(el: GraphElement): Run[] {
	let runs = hitCache.get(el);
	if (runs) return runs;
	const space = plotSpace(el);
	runs = [];
	for (const s of el.series) {
		if (s.kind === 'fn') runs.push(...(sampleFn(s, el, space, 192)?.runs ?? []));
		else if (s.kind === 'param') runs.push(...sampleParam(s, el, space, 192));
	}
	hitCache.set(el, runs);
	return runs;
}

// ─── Hit testing ───────────────────────────────────────────────────────

/**
 * Whether a point touches the graph's frame, an axis or a curve. The blank
 * inside does not count, so writing over a graph still works.
 */
export function graphHit(el: GraphElement, p: Point, reach: number): boolean {
	const s = plotSpace(el);
	const { x, y, w, h } = s;
	if (frameHit(p, s, reach)) return true;
	if (el.axes) {
		const ay = axisPosition(s.py(0), y, y + h);
		const ax = axisPosition(s.px(0), x, x + w);
		if (distanceToSegment(p, { x, y: ay }, { x: x + w, y: ay }) <= reach) return true;
		if (distanceToSegment(p, { x: ax, y }, { x: ax, y: y + h }) <= reach) return true;
	}
	if (runsHit(p, hitRuns(el), reach)) return true;
	return el.series.some(
		(s2) => s2.kind === 'point' && Math.hypot(p.x - s.px(s2.x), p.y - s.py(s2.y)) <= reach + 6
	);
}

/** Where an axis sits: through the origin when visible, else on the nearest edge. */
function axisPosition(origin: number, lo: number, hi: number): number {
	return Math.max(lo, Math.min(hi, origin));
}

// ─── Drawing ───────────────────────────────────────────────────────────

function label(ctx: CanvasRenderingContext2D, st: GraphStyle, text: string, x: number, y: number) {
	haloText(ctx, text, x, y, st.dark);
}

function drawAxes(ctx: CanvasRenderingContext2D, el: GraphElement, s: PlotSpace, st: GraphStyle) {
	const hair = 1.25 / scaleOf(ctx);
	const [xmin, xmax, ymin, ymax] = el.view;
	const xTicks = axisTicks(xmin, xmax, s.w, el.piTicks);
	const yTicks = axisTicks(ymin, ymax, s.h, false);
	const axisY = axisPosition(s.py(0), s.y, s.y + s.h);
	const axisX = axisPosition(s.px(0), s.x, s.x + s.w);

	ctx.lineWidth = hair;
	if (el.grid) {
		ctx.strokeStyle = st.dark ? 'rgba(226,232,240,0.14)' : 'rgba(15,23,42,0.12)';
		ctx.beginPath();
		for (const t of xTicks) {
			ctx.moveTo(s.px(t.value), s.y);
			ctx.lineTo(s.px(t.value), s.y + s.h);
		}
		for (const t of yTicks) {
			ctx.moveTo(s.x, s.py(t.value));
			ctx.lineTo(s.x + s.w, s.py(t.value));
		}
		ctx.stroke();
	}
	if (!el.axes) return;

	ctx.strokeStyle = st.muted;
	ctx.fillStyle = st.muted;
	ctx.lineWidth = Math.max(1.5, el.size * 0.5);
	const head = 9;
	ctx.beginPath();
	ctx.moveTo(s.x, axisY);
	ctx.lineTo(s.x + s.w - 1, axisY);
	ctx.moveTo(s.x + s.w - head, axisY - head / 2.2);
	ctx.lineTo(s.x + s.w - 1, axisY);
	ctx.lineTo(s.x + s.w - head, axisY + head / 2.2);
	ctx.moveTo(axisX, s.y + s.h);
	ctx.lineTo(axisX, s.y + 1);
	ctx.moveTo(axisX - head / 2.2, s.y + head);
	ctx.lineTo(axisX, s.y + 1);
	ctx.lineTo(axisX + head / 2.2, s.y + head);
	ctx.stroke();

	ctx.font = `${TICK_LABEL}px ${st.font}`;
	ctx.lineWidth = hair * 1.4;
	ctx.beginPath();
	ctx.textBaseline = 'top';
	ctx.textAlign = 'center';
	const labelsBelow = axisY < s.y + s.h - TICK_LABEL - 8;
	for (const t of xTicks) {
		const px = s.px(t.value);
		ctx.moveTo(px, axisY - 3);
		ctx.lineTo(px, axisY + 3);
		if (t.value === 0 && el.axes) continue;
		if (px < s.x + 10 || px > s.x + s.w - 14) continue;
		label(ctx, st, t.label, px, labelsBelow ? axisY + 6 : axisY - 6 - TICK_LABEL);
	}
	ctx.textAlign = axisX > s.x + 34 ? 'right' : 'left';
	const labelsLeft = axisX > s.x + 34;
	ctx.textBaseline = 'middle';
	for (const t of yTicks) {
		const py = s.py(t.value);
		ctx.moveTo(axisX - 3, py);
		ctx.lineTo(axisX + 3, py);
		if (t.value === 0) continue;
		if (py < s.y + 12 || py > s.y + s.h - 6) continue;
		label(ctx, st, t.label, labelsLeft ? axisX - 7 : axisX + 7, py);
	}
	ctx.stroke();
	if (axisX >= s.x && axisY >= s.y) {
		ctx.textAlign = labelsLeft ? 'right' : 'left';
		ctx.textBaseline = 'top';
		if (xmin < 0 && xmax > 0 && ymin < 0 && ymax > 0) {
			label(ctx, st, 'O', labelsLeft ? axisX - 6 : axisX + 6, axisY + 4);
		}
	}
	// Axis names at the arrow tips.
	ctx.font = `italic ${TICK_LABEL + 1}px ${st.font}`;
	ctx.textAlign = 'right';
	ctx.textBaseline = 'bottom';
	label(ctx, st, 'x', s.x + s.w - 4, axisY - 8);
	ctx.textAlign = 'left';
	ctx.textBaseline = 'top';
	label(ctx, st, 'y', axisX + 8, s.y + 4);
}

export function drawGraph(ctx: CanvasRenderingContext2D, el: GraphElement, st: GraphStyle): void {
	const s = plotSpace(el);
	const scale = scaleOf(ctx);
	ctx.save();
	// The frame is always drawn; it is what a graph too small to read shows.
	ctx.strokeStyle = st.dark ? 'rgba(226,232,240,0.28)' : 'rgba(15,23,42,0.22)';
	ctx.lineWidth = 1.25 / scale;
	ctx.strokeRect(s.x, s.y, s.w, s.h);
	if (s.w * scale < MIN_DRAWN_PX) {
		ctx.restore();
		return;
	}

	ctx.beginPath();
	ctx.rect(s.x, s.y, s.w, s.h);
	ctx.clip();
	drawAxes(ctx, el, s, st);

	const geometry = geometryFor(el, sampleCount(s.w * scale));
	const width = Math.min(8, Math.max(1.5, el.size));
	ctx.lineJoin = 'round';
	ctx.lineCap = 'round';
	for (const c of geometry.curves) {
		if (!c.shade) continue;
		ctx.save();
		ctx.globalAlpha = 0.18;
		ctx.fillStyle = st.ink(c.color);
		ctx.fill(c.shade.path);
		ctx.restore();
	}
	for (const c of geometry.curves) {
		ctx.strokeStyle = st.ink(c.color);
		ctx.lineWidth = width;
		ctx.setLineDash(c.dash ? [width * 3, width * 2.2] : []);
		ctx.stroke(c.path);
	}
	ctx.setLineDash([]);

	ctx.font = `${TICK_LABEL}px ${st.font}`;
	ctx.textBaseline = 'bottom';
	ctx.textAlign = 'left';
	for (const m of geometry.marks) {
		const x = s.px(m.x);
		const y = s.py(m.y);
		dot(ctx, x, y, 4.5, st.ink(m.color), st.dark);
		ctx.fillStyle = st.ink(m.color);
		label(ctx, st, m.label, Math.min(x + 7, s.x + s.w - 70), y - 6);
	}
	for (const p of geometry.points) {
		const x = s.px(p.x);
		const y = s.py(p.y);
		dot(ctx, x, y, Math.max(4.5, width * 1.4), st.ink(p.color), st.dark);
		if (p.label) {
			ctx.fillStyle = st.ink(p.color);
			ctx.font = `italic ${TICK_LABEL + 3}px ${st.font}`;
			label(ctx, st, p.label, x + 8, y - 6);
		}
	}
	ctx.font = `${TICK_LABEL}px ${st.font}`;
	for (const c of geometry.curves) {
		if (!c.shade || !Number.isFinite(c.shade.area)) continue;
		ctx.fillStyle = st.ink(c.color);
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		label(ctx, st, `S = ${formatNumber(c.shade.area, 4)}`, c.shade.at.x, c.shade.at.y);
	}
	ctx.restore();
}
