/**
 * A graph on the board: axes, grid and curves kept as their formulas, not as
 * points. One self-contained element (no references to other elements), so
 * moving, undoing and deleting it can never orphan a curve, and a graph with
 * several curves is 1 to 3 KB against 20 KB for a hand-drawn stroke.
 *
 * Coordinates: the box (`x1, y1, x2, y2`) is in board units; `view` is the
 * visible part of the maths plane (`xmin, xmax, ymin, ymax`). Everything
 * received from another client passes `decodeGraph`, which clamps or drops
 * what is out of bounds.
 */

import { boxOf, resizeBox, type Box, type Corner } from '../box';
import type { ColorToken, Common, Point } from '../elements';
import { compile, MAX_EXPRESSION_LENGTH } from './expression';

export const MAX_SERIES = 8;
const MAX_PARAMS = 8;
const MIN_BOX = 80;
const MAX_LABEL = 24;
const MAX_VALUE = 1e9;
const MIN_SPAN = 1e-6;

/** Points worth marking on a curve, found numerically from its samples. */
export const MARKS = ['roots', 'extrema', 'intercept'] as const;
export type Mark = (typeof MARKS)[number];

type Look = { color: ColorToken; dash: boolean };

/** y = f(x), optionally with the area under it shaded between two x values. */
export type FnSeries = Look & {
	kind: 'fn';
	expr: string;
	shade: [number, number] | null;
	marks: Mark[];
};

/** (x(t), y(t)) for t from t[0] to t[1]: circles, ellipses, projectiles, vertical lines. */
export type ParamSeries = Look & {
	kind: 'param';
	x: string;
	y: string;
	t: [number, number];
};

/** A labelled point. */
export type PointSeries = {
	kind: 'point';
	color: ColorToken;
	x: number;
	y: number;
	label: string;
};

export type Series = FnSeries | ParamSeries | PointSeries;

export type View = [xmin: number, xmax: number, ymin: number, ymax: number];

export type GraphElement = Common & {
	type: 'graph';
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	view: View;
	grid: boolean;
	axes: boolean;
	/** Trigonometric functions read degrees instead of radians. */
	degrees: boolean;
	/** Ticks on x at multiples of π (for sine and cosine). */
	piTicks: boolean;
	/** Values of the letters the formulas use besides the variable. */
	params: Record<string, number>;
	series: Series[];
};

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const PARAM_NAME = /^[A-Za-zα-ωΑ-Ω]$/u;

function decodeLook(d: Record<string, unknown>, isColor: (c: unknown) => boolean) {
	return isColor(d.color) ? { color: d.color as ColorToken, dash: d.dash === true } : null;
}

function decodeSeries(raw: unknown, isColor: (c: unknown) => boolean): Series | null {
	if (!raw || typeof raw !== 'object') return null;
	const d = raw as Record<string, unknown>;
	const look = decodeLook(d, isColor);
	if (!look) return null;
	if (d.kind === 'fn') {
		if (typeof d.expr !== 'string' || d.expr.length > MAX_EXPRESSION_LENGTH) return null;
		const shade =
			Array.isArray(d.shade) &&
			d.shade.length === 2 &&
			d.shade.every(finite) &&
			d.shade[0] !== d.shade[1]
				? ([Math.min(d.shade[0], d.shade[1]), Math.max(d.shade[0], d.shade[1])] as [
						number,
						number
					])
				: null;
		const marks = Array.isArray(d.marks)
			? MARKS.filter((m) => (d.marks as unknown[]).includes(m))
			: [];
		return { kind: 'fn', ...look, expr: d.expr, shade, marks };
	}
	if (d.kind === 'param') {
		if (typeof d.x !== 'string' || typeof d.y !== 'string') return null;
		if (d.x.length > MAX_EXPRESSION_LENGTH || d.y.length > MAX_EXPRESSION_LENGTH) return null;
		if (!Array.isArray(d.t) || d.t.length !== 2 || !d.t.every(finite) || d.t[0] === d.t[1]) {
			return null;
		}
		return { kind: 'param', ...look, x: d.x, y: d.y, t: [d.t[0], d.t[1]] };
	}
	if (d.kind === 'point') {
		if (!finite(d.x) || !finite(d.y)) return null;
		const label = typeof d.label === 'string' ? d.label.slice(0, MAX_LABEL) : '';
		return {
			kind: 'point',
			color: look.color,
			x: clamp(d.x, -MAX_VALUE, MAX_VALUE),
			y: clamp(d.y, -MAX_VALUE, MAX_VALUE),
			label
		};
	}
	return null;
}

function decodeView(raw: unknown): View | null {
	if (!Array.isArray(raw) || raw.length !== 4 || !raw.every(finite)) return null;
	const [xmin, xmax, ymin, ymax] = raw.map((v) => clamp(v, -MAX_VALUE, MAX_VALUE));
	if (xmax - xmin < MIN_SPAN || ymax - ymin < MIN_SPAN) return null;
	return [xmin, xmax, ymin, ymax];
}

/**
 * Validates a graph received from the server or another client. `common` is
 * the already-checked color, size and z; a malformed series is dropped, a
 * malformed graph is refused.
 */
export function decodeGraph(
	d: Record<string, unknown>,
	common: Common,
	isColor: (c: unknown) => boolean
): GraphElement | null {
	if (![d.x1, d.y1, d.x2, d.y2].every(finite)) return null;
	const view = decodeView(d.view);
	if (!view || !Array.isArray(d.series)) return null;
	const params: Record<string, number> = {};
	if (d.params && typeof d.params === 'object') {
		for (const [name, value] of Object.entries(d.params)) {
			if (Object.keys(params).length >= MAX_PARAMS) break;
			if (PARAM_NAME.test(name) && finite(value))
				params[name] = clamp(value, -MAX_VALUE, MAX_VALUE);
		}
	}
	const series: Series[] = [];
	for (const s of d.series.slice(0, MAX_SERIES)) {
		const decoded = decodeSeries(s, isColor);
		if (decoded) series.push(decoded);
	}
	return {
		...common,
		type: 'graph',
		x1: d.x1 as number,
		y1: d.y1 as number,
		x2: d.x2 as number,
		y2: d.y2 as number,
		view,
		grid: d.grid !== false,
		axes: d.axes !== false,
		degrees: d.degrees === true,
		piTicks: d.piTicks === true,
		params,
		series
	};
}

/** A graph's or solid's box, normalized and kept between the size limits. */
export function graphBox(el: Box): { x: number; y: number; w: number; h: number } {
	return boxOf(el, MIN_BOX);
}

/** Maps between the maths plane and board units for one graph. */
export type PlotSpace = {
	x: number;
	y: number;
	w: number;
	h: number;
	/** Board x of a maths x. */
	px: (x: number) => number;
	/** Board y of a maths y. */
	py: (y: number) => number;
	/** Maths x of a board x. */
	mx: (px: number) => number;
	/** Maths y of a board y. */
	my: (py: number) => number;
};

export function plotSpace(el: GraphElement): PlotSpace {
	const { x, y, w, h } = graphBox(el);
	const [xmin, xmax, ymin, ymax] = el.view;
	const sx = w / (xmax - xmin);
	const sy = h / (ymax - ymin);
	return {
		x,
		y,
		w,
		h,
		px: (v) => x + (v - xmin) * sx,
		py: (v) => y + h - (v - ymin) * sy,
		mx: (p) => xmin + (p - x) / sx,
		my: (p) => ymin + (y + h - p) / sy
	};
}

/** The graph with y's range changed so one unit is as long on y as on x. */
export function withEqualScale(el: GraphElement): GraphElement {
	const { w, h } = graphBox(el);
	const [xmin, xmax, ymin, ymax] = el.view;
	const span = ((xmax - xmin) / w) * h;
	const mid = (ymin + ymax) / 2;
	return { ...el, view: [xmin, xmax, mid - span / 2, mid + span / 2] };
}

/** The graph's letters (besides the variable) used by its formulas, in order. */
export function paramNames(el: Pick<GraphElement, 'series' | 'degrees'>): string[] {
	const names: string[] = [];
	const add = (list: string[]) => {
		for (const n of list) if (!names.includes(n)) names.push(n);
	};
	for (const s of el.series) {
		if (s.kind === 'fn') {
			const e = compile(s.expr, { variable: 'x', degrees: el.degrees });
			if (e.ok) add(e.params);
		} else if (s.kind === 'param') {
			for (const src of [s.x, s.y]) {
				const e = compile(src, { variable: 't', degrees: el.degrees });
				if (e.ok) add(e.params);
			}
		}
	}
	return names.slice(0, MAX_PARAMS);
}

/**
 * The graph with a parameter entry for every letter its formulas use (new
 * ones start at 1) and none for letters no formula uses any more.
 */
export function withParams(el: GraphElement): GraphElement {
	const params: Record<string, number> = {};
	for (const name of paramNames(el)) params[name] = el.params[name] ?? 1;
	return { ...el, params };
}

/** The range a parameter's slider covers: wide enough for its value. */
export function sliderRange(value: number): [number, number] {
	const reach = Math.max(10, 10 ** Math.ceil(Math.log10(Math.abs(value) + 1)));
	return [-reach, reach];
}

/** What an arrow key adds to a value of this size: a tenth of its order of magnitude. */
export function stepFor(value: number): number {
	const size = Math.abs(value);
	if (size < 1) return 0.01;
	return Math.max(0.1, 10 ** (Math.floor(Math.log10(size)) - 1));
}

/** Compact number for tick labels, readouts and inputs (no float noise). */
export function formatNumber(v: number, digits = 4): string {
	if (!Number.isFinite(v)) return '';
	if (Math.abs(v) < 1e-12) return '0';
	const abs = Math.abs(v);
	if (abs >= 1e6 || abs < 1e-4)
		return v
			.toExponential(2)
			.replace(/\.?0+e/, 'e')
			.replace('e+', 'e');
	return String(Number(v.toPrecision(digits)));
}

/**
 * The graph with one corner dragged to `to` (board units). The scale stays
 * (a unit is as long as before) and the view grows or shrinks from the
 * opposite corner, so resizing shows more or less of the plane and a circle
 * stays round, instead of stretching the picture.
 */
export function resizeGraph(el: GraphElement, corner: Corner, to: Point): GraphElement {
	const b = graphBox(el);
	const box = resizeBox(el, corner, to, MIN_BOX);
	const w = box.x2 - box.x1;
	const h = box.y2 - box.y1;
	const west = corner === 'nw' || corner === 'sw';
	const north = corner === 'nw' || corner === 'ne';
	const [xmin, xmax, ymin, ymax] = el.view;
	const sx = b.w / (xmax - xmin);
	const sy = b.h / (ymax - ymin);
	const view: View = [
		west ? xmax - w / sx : xmin,
		west ? xmax : xmin + w / sx,
		north ? ymin : ymax - h / sy,
		north ? ymin + h / sy : ymax
	];
	return { ...el, ...box, view: decodeView(view) ?? el.view };
}

/** The graph zoomed about the middle of its view (factor above 1 zooms in). */
export function zoomGraph(el: GraphElement, factor: number): GraphElement {
	const [xmin, xmax, ymin, ymax] = el.view;
	const cx = (xmin + xmax) / 2;
	const cy = (ymin + ymax) / 2;
	const hx = (xmax - xmin) / 2 / factor;
	const hy = (ymax - ymin) / 2 / factor;
	return { ...el, view: decodeView([cx - hx, cx + hx, cy - hy, cy + hy]) ?? el.view };
}
