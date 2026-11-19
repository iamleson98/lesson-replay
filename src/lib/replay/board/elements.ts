/**
 * Whiteboard elements — what a shape on the board is, independent of how
 * it is drawn or synced. The server stores each element's `data` as opaque
 * JSON (modelhelper.WhiteboardElement), so this module is the schema:
 * `decodeElement` is the only way in, and drops anything malformed rather
 * than trusting what another client sent.
 *
 * Coordinates are board units (world space); the viewport maps them to
 * the screen. Colors are palette tokens, resolved per theme when drawn, so
 * "ink" stays readable on a light and a dark board alike.
 */

import type { PackId } from './packs';
import type { SymbolElement } from './physics/symbols';
import type { GraphElement } from './math/graph';
import type { SolidElement } from './math/solids';

export const PALETTE = ['ink', 'red', 'orange', 'green', 'blue', 'violet'] as const;
export type ColorToken = (typeof PALETTE)[number];

export const STROKE_SIZES = [2, 4, 8] as const;
export const TEXT_SIZES = [20, 28, 40] as const;

export type ShapeKind = 'line' | 'arrow' | 'rect' | 'ellipse';

export type Common = {
	color: ColorToken;
	/** Stroke width, or font size for text. */
	size: number;
	/** Stacking order: creation time; ties break on the element id. */
	z: number;
};

export type StrokeElement = Common & {
	type: 'stroke';
	highlighter: boolean;
	/** Flat [x, y, pressure, x, y, pressure, …]. */
	points: number[];
};

export type ShapeElement = Common & {
	type: ShapeKind;
	x1: number;
	y1: number;
	x2: number;
	y2: number;
};

export type TextElement = Common & {
	type: 'text';
	x: number;
	/** Top of the first line. */
	y: number;
	text: string;
};

/**
 * A sheet of the board: a frame with a place and a size. With `deck` and `n`
 * the picture of that page of a lesson deck is drawn on it, without it the
 * sheet is blank. Sheets are never touched by the pointer tools and lie below
 * all ink (their `z` is lower than any ink's).
 */
export type PageElement = Common & {
	type: 'page';
	x: number;
	y: number;
	w: number;
	h: number;
	deck?: string;
	/** 1-based page of the deck. */
	n?: number;
};

/**
 * Which sheet the teacher is on (`page` is a sheet's element id). A control
 * element, kept in the scene under one id: it is not drawn, hit or measured,
 * and never part of the undo history.
 */
export type ViewElement = Common & { type: 'view'; page: string };

export type { GraphElement, SolidElement, SymbolElement };

export type BoardElement =
	| StrokeElement
	| ShapeElement
	| TextElement
	| GraphElement
	| SolidElement
	| SymbolElement
	| PageElement
	| ViewElement;

/** What the pointer tools draw and edit: everything but the sheets and the view. */
export type InkElement = Exclude<BoardElement, PageElement | ViewElement>;

/** The element id the teacher's view is always written under. */
export const VIEW_ID = 'view';
/** The most pages a deck has (mirrors the server's limit). */
export const MAX_DECK_PAGES = 120;
/** The size a sheet may have, in board units, on either side. */
const SHEET_SIZE = { min: 100, max: 8000 } as const;

/** The colours and font an element is drawn with (resolved for the theme). */
type ElementStyle = {
	ink: (color: ColorToken) => string;
	/** Axes, grid and labels. */
	muted: string;
	font: string;
	dark: boolean;
};

/**
 * An element type that arrives with a feature pack (graphs and solids come
 * with the maths pack): how to read, measure, hit and draw it. The pack
 * registers it when it loads, so none of this code is in the board until a
 * teacher asks for it or an element of that type shows up.
 */
type ElementKind<E extends BoardElement = BoardElement> = {
	decode(d: Record<string, unknown>, common: Common, isColor: (c: unknown) => boolean): E | null;
	bounds(el: E): Rect;
	hit(el: E, p: Point, reach: number): boolean;
	draw(ctx: CanvasRenderingContext2D, el: E, style: ElementStyle): void;
};

const kinds = new Map<string, ElementKind<never>>();

export function registerKind<E extends BoardElement>(type: E['type'], kind: ElementKind<E>): void {
	kinds.set(type, kind as unknown as ElementKind<never>);
}

export function kindOf(type: string): ElementKind | undefined {
	return kinds.get(type) as unknown as ElementKind | undefined;
}

/** Which pack provides an element type the board cannot read until that pack is loaded. */
export const PACK_OF: Readonly<Record<string, PackId>> = {
	graph: 'math',
	solid: 'math',
	symbol: 'physics'
};

export type Point = { x: number; y: number };
export type Rect = { minX: number; minY: number; maxX: number; maxY: number };

/** Measures one line of text at a font size (canvas measureText). */
export type MeasureText = (line: string, fontSize: number) => number;

/** Line height relative to the font size. */
export const LINE_HEIGHT = 1.25;
/** Upper bound for points kept in one stroke (the server caps elements at 32 KiB). */
export const MAX_STROKE_POINTS = 1200;
export const MAX_TEXT_LENGTH = 2000;

const SHAPES = new Set<string>(['line', 'arrow', 'rect', 'ellipse']);
const COLORS = new Set<string>(PALETTE);
const ID = /^[a-z0-9]{1,64}$/;
const DECK_ID = /^[a-z0-9]{26}$/;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Validates element data received from the server or another client. */
export function decodeElement(data: unknown): BoardElement | null {
	if (!data || typeof data !== 'object') return null;
	const d = data as Record<string, unknown>;
	if (!COLORS.has(d.color as string) || !finite(d.size) || d.size <= 0 || !finite(d.z)) {
		return null;
	}
	const common = { color: d.color as ColorToken, size: Math.min(d.size, 200), z: d.z };
	if (d.type === 'stroke') {
		const points = d.points;
		if (!Array.isArray(points) || points.length < 3 || points.length % 3 !== 0) return null;
		if (!points.every(finite)) return null;
		return { ...common, type: 'stroke', highlighter: d.highlighter === true, points };
	}
	if (SHAPES.has(d.type as string)) {
		if (![d.x1, d.y1, d.x2, d.y2].every(finite)) return null;
		return {
			...common,
			type: d.type as ShapeKind,
			x1: d.x1 as number,
			y1: d.y1 as number,
			x2: d.x2 as number,
			y2: d.y2 as number
		};
	}
	if (d.type === 'text') {
		if (!finite(d.x) || !finite(d.y) || typeof d.text !== 'string' || d.text.length === 0) {
			return null;
		}
		return { ...common, type: 'text', x: d.x, y: d.y, text: d.text.slice(0, MAX_TEXT_LENGTH) };
	}
	if (d.type === 'page') return decodePage(d, common);
	if (d.type === 'view') {
		return typeof d.page === 'string' && ID.test(d.page)
			? { ...common, type: 'view', page: d.page }
			: null;
	}
	// A type from a pack that is not loaded yet reads as nothing; the scene asks for the pack.
	return kindOf(d.type as string)?.decode(d, common, (c) => COLORS.has(c as string)) ?? null;
}

/** A sheet from data of another client: finite place, sane size, a deck page named whole or not at all. */
function decodePage(d: Record<string, unknown>, common: Common): PageElement | null {
	const { x, y, w, h } = d;
	if (!finite(x) || !finite(y) || !finite(w) || !finite(h)) return null;
	const inRange = (v: number) => v >= SHEET_SIZE.min && v <= SHEET_SIZE.max;
	if (!inRange(w) || !inRange(h)) return null;
	const sheet: PageElement = { ...common, type: 'page', x, y, w, h };
	if (d.deck === undefined && d.n === undefined) return sheet;
	const { deck, n } = d;
	if (typeof deck !== 'string' || !DECK_ID.test(deck)) return null;
	if (!Number.isInteger(n) || (n as number) < 1 || (n as number) > MAX_DECK_PAGES) return null;
	return { ...sheet, deck, n: n as number };
}

/**
 * A graph with some of its fields replaced: how a drag (a slider, a corner)
 * is shown to the others before it is written. `params` is merged, so a
 * slider sends only the letter it moves.
 */
export function patchElement(base: BoardElement, set: unknown): BoardElement | null {
	const patchable = base.type === 'graph' || base.type === 'solid' || base.type === 'symbol';
	if (!patchable || !set || typeof set !== 'object') return null;
	const changes = set as Record<string, unknown>;
	if (base.type !== 'graph') return decodeElement({ ...base, ...changes, type: base.type });
	const params =
		changes.params && typeof changes.params === 'object'
			? { ...base.params, ...changes.params }
			: base.params;
	return decodeElement({ ...base, ...changes, type: 'graph', params });
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Prepares a finished freehand stroke for storage: coordinates rounded to
 * a tenth, then simplified (Ramer–Douglas–Peucker) with a growing
 * tolerance until it fits MAX_STROKE_POINTS.
 */
export function compactStroke(points: number[]): number[] {
	let rounded: number[] = [];
	for (let i = 0; i + 2 < points.length; i += 3) {
		rounded.push(
			round1(points[i]),
			round1(points[i + 1]),
			Math.round(points[i + 2] * 100) / 100
		);
	}
	let tolerance = 0.3;
	while (rounded.length / 3 > MAX_STROKE_POINTS) {
		rounded = simplify(rounded, tolerance);
		tolerance *= 2;
	}
	return rounded.length / 3 > 2 ? simplify(rounded, 0.25) : rounded;
}

/** Ramer–Douglas–Peucker over flat [x, y, p] triples (endpoints kept). */
function simplify(points: number[], tolerance: number): number[] {
	const n = points.length / 3;
	if (n <= 2) return points;
	const keep = new Uint8Array(n);
	keep[0] = keep[n - 1] = 1;
	const stack: [number, number][] = [[0, n - 1]];
	while (stack.length > 0) {
		const [first, last] = stack.pop()!;
		let maxDist = 0;
		let index = -1;
		const a = { x: points[first * 3], y: points[first * 3 + 1] };
		const b = { x: points[last * 3], y: points[last * 3 + 1] };
		for (let i = first + 1; i < last; i++) {
			const d = distanceToSegment({ x: points[i * 3], y: points[i * 3 + 1] }, a, b);
			if (d > maxDist) {
				maxDist = d;
				index = i;
			}
		}
		if (index !== -1 && maxDist > tolerance) {
			keep[index] = 1;
			stack.push([first, index], [index, last]);
		}
	}
	const out: number[] = [];
	for (let i = 0; i < n; i++) {
		if (keep[i]) out.push(points[i * 3], points[i * 3 + 1], points[i * 3 + 2]);
	}
	return out;
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const len2 = dx * dx + dy * dy;
	const t =
		len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
	return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function textLines(el: TextElement): string[] {
	return el.text.split('\n');
}

/** Half the drawn width of a freehand stroke (pens taper, highlighters are wide). */
export function strokeRadius(el: StrokeElement): number {
	return el.size * (el.highlighter ? 1.5 : 0.8);
}

/** How far ink reaches from an element's geometry. */
function inkReach(el: BoardElement): number {
	if (el.type === 'text' || el.type === 'page' || el.type === 'view') return 0;
	if (el.type === 'graph' || el.type === 'solid' || el.type === 'symbol') return el.size / 2;
	if (el.type === 'stroke') return strokeRadius(el);
	return el.size / 2 + (el.type === 'arrow' ? Math.max(12, el.size * 3.5) : 0);
}

/** Axis-aligned bounds in board units, including the stroke width. */
const boundsCache = new WeakMap<BoardElement, Rect>();

/**
 * The box an element covers (board units). Elements are immutable, so it
 * is computed once per element: culling asks for every element on every
 * redraw, and a stroke's box walks all its points.
 */
export function elementBounds(el: BoardElement, measure: MeasureText): Rect {
	let rect = boundsCache.get(el);
	if (!rect) {
		rect = computeBounds(el, measure);
		boundsCache.set(el, rect);
	}
	return rect;
}

function computeBounds(el: BoardElement, measure: MeasureText): Rect {
	const pad = inkReach(el);
	switch (el.type) {
		case 'stroke': {
			let minX = Infinity;
			let minY = Infinity;
			let maxX = -Infinity;
			let maxY = -Infinity;
			for (let i = 0; i < el.points.length; i += 3) {
				minX = Math.min(minX, el.points[i]);
				maxX = Math.max(maxX, el.points[i]);
				minY = Math.min(minY, el.points[i + 1]);
				maxY = Math.max(maxY, el.points[i + 1]);
			}
			return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
		}
		case 'text': {
			const lines = textLines(el);
			const width = Math.max(...lines.map((line) => measure(line, el.size)));
			return {
				minX: el.x,
				minY: el.y,
				maxX: el.x + width,
				maxY: el.y + lines.length * el.size * LINE_HEIGHT
			};
		}
		case 'page':
			return { minX: el.x, minY: el.y, maxX: el.x + el.w, maxY: el.y + el.h };
		case 'view':
			return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
		case 'solid':
		case 'symbol':
		case 'graph': {
			const b = kindOf(el.type)!.bounds(el);
			return {
				minX: b.minX - pad,
				minY: b.minY - pad,
				maxX: b.maxX + pad,
				maxY: b.maxY + pad
			};
		}
		default:
			return {
				minX: Math.min(el.x1, el.x2) - pad,
				minY: Math.min(el.y1, el.y2) - pad,
				maxX: Math.max(el.x1, el.x2) + pad,
				maxY: Math.max(el.y1, el.y2) + pad
			};
	}
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
	return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/** Whether a point (board units) touches the element, within `tolerance`. */
export function hitTest(
	el: BoardElement,
	p: Point,
	tolerance: number,
	measure: MeasureText
): boolean {
	// Sheets are never grabbed, and the view is not on the board at all.
	if (el.type === 'page' || el.type === 'view') return false;
	const reach =
		tolerance +
		(el.type === 'stroke' ? strokeRadius(el) : el.type === 'text' ? 0 : el.size / 2);
	switch (el.type) {
		case 'graph':
		case 'solid':
		case 'symbol':
			return kindOf(el.type)!.hit(el, p, reach);
		case 'stroke': {
			const pts = el.points;
			if (pts.length === 3) return Math.hypot(p.x - pts[0], p.y - pts[1]) <= reach;
			for (let i = 0; i + 5 < pts.length; i += 3) {
				const a = { x: pts[i], y: pts[i + 1] };
				const b = { x: pts[i + 3], y: pts[i + 4] };
				if (distanceToSegment(p, a, b) <= reach) return true;
			}
			return false;
		}
		case 'line':
		case 'arrow':
			return distanceToSegment(p, { x: el.x1, y: el.y1 }, { x: el.x2, y: el.y2 }) <= reach;
		case 'rect': {
			const r = elementBounds(el, measure);
			const corners = [
				{ x: r.minX + el.size / 2, y: r.minY + el.size / 2 },
				{ x: r.maxX - el.size / 2, y: r.minY + el.size / 2 },
				{ x: r.maxX - el.size / 2, y: r.maxY - el.size / 2 },
				{ x: r.minX + el.size / 2, y: r.maxY - el.size / 2 }
			];
			return corners.some((c, i) => distanceToSegment(p, c, corners[(i + 1) % 4]) <= reach);
		}
		case 'ellipse': {
			const cx = (el.x1 + el.x2) / 2;
			const cy = (el.y1 + el.y2) / 2;
			const rx = Math.abs(el.x2 - el.x1) / 2;
			const ry = Math.abs(el.y2 - el.y1) / 2;
			if (rx < 1 || ry < 1) {
				return (
					distanceToSegment(p, { x: el.x1, y: el.y1 }, { x: el.x2, y: el.y2 }) <= reach
				);
			}
			// Distance to the outline along the ray from the center: exact on
			// circles, close enough on ellipses.
			const dist = Math.hypot(p.x - cx, p.y - cy);
			const k = Math.hypot((p.x - cx) / rx, (p.y - cy) / ry);
			const gap = k === 0 ? Math.min(rx, ry) : dist * Math.abs(1 - 1 / k);
			return gap <= reach;
		}
		case 'text': {
			const r = elementBounds(el, measure);
			return (
				p.x >= r.minX - reach &&
				p.x <= r.maxX + reach &&
				p.y >= r.minY - reach &&
				p.y <= r.maxY + reach
			);
		}
	}
}

/** The element moved by (dx, dy) board units. */
export function translate<E extends BoardElement>(el: E, dx: number, dy: number): E {
	switch (el.type) {
		case 'stroke': {
			const points = el.points.slice();
			for (let i = 0; i < points.length; i += 3) {
				points[i] = round1(points[i] + dx);
				points[i + 1] = round1(points[i + 1] + dy);
			}
			return { ...el, points };
		}
		case 'text':
			return { ...el, x: round1(el.x + dx), y: round1(el.y + dy) };
		case 'page':
		case 'view':
			return el; // sheets stay where they were laid
		case 'graph':
		case 'solid':
		case 'symbol':
			return {
				...el,
				x1: round1(el.x1 + dx),
				y1: round1(el.y1 + dy),
				x2: round1(el.x2 + dx),
				y2: round1(el.y2 + dy)
			};
		default: {
			const s = el as ShapeElement;
			return {
				...el,
				x1: round1(s.x1 + dx),
				y1: round1(s.y1 + dy),
				x2: round1(s.x2 + dx),
				y2: round1(s.y2 + dy)
			};
		}
	}
}

/**
 * The end point of a shape being drawn with Shift held: lines snap to
 * 45° steps, rectangles and ellipses become squares and circles.
 */
export function constrainShape(kind: ShapeKind, start: Point, end: Point): Point {
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	if (kind === 'rect' || kind === 'ellipse') {
		const side = Math.max(Math.abs(dx), Math.abs(dy));
		return { x: start.x + Math.sign(dx || 1) * side, y: start.y + Math.sign(dy || 1) * side };
	}
	const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
	const length = Math.hypot(dx, dy);
	return { x: start.x + Math.cos(angle) * length, y: start.y + Math.sin(angle) * length };
}

/** Stacking order: by z, ties by id (identical on every client). */
export function compareZ(
	a: { id: string; el: BoardElement },
	b: { id: string; el: BoardElement }
): number {
	return a.el.z - b.el.z || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
