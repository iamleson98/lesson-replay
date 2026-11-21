/**
 * Draws the board on a 2D canvas. Pure drawing: no state besides caches
 * keyed by element objects (elements are immutable — every edit creates a
 * new object — so a cached outline is valid for as long as it exists).
 */

import { getStroke } from 'perfect-freehand';
import {
	elementBounds,
	kindOf,
	LINE_HEIGHT,
	rectsIntersect,
	strokeRadius,
	textLines,
	type BoardElement,
	type ColorToken,
	type MeasureText,
	type Rect,
	type StrokeElement
} from './elements';
import { sheetsOf } from './pages';
import type { PictureCache } from './pictures';
import type { OrderedElement } from './scene.svelte';
import { drawSheet } from './sheet';
import { visibleRect, type Viewport } from './viewport';

export type BoardTheme = 'light' | 'dark';

/** Palette tokens per theme: the same ink stays readable on both boards. */
export const COLORS: Record<ColorToken, Record<BoardTheme, string>> = {
	ink: { light: '#1e1e1e', dark: '#ececec' },
	red: { light: '#e03131', dark: '#ff6b6b' },
	orange: { light: '#e8590c', dark: '#ffa94d' },
	green: { light: '#2f9e44', dark: '#69db7c' },
	blue: { light: '#1971c2', dark: '#4dabf7' },
	violet: { light: '#7048e8', dark: '#b197fc' }
};

const GRID = 32;
/**
 * The board's one font stack, drawn the same live, in the player and in the video: Inter, then Noto
 * Sans (the superscript capitals), Noto Sans Math and Noto Sans Symbols 2 for the symbols Inter
 * lacks (`static/fonts/README.md`).
 */
export const FONT_FAMILY =
	'"Inter Variable", "Noto Sans", "Noto Sans Math", "Noto Sans Symbols 2", sans-serif';

const BOARD_FAMILIES = new Set([
	'Inter Variable',
	'Noto Sans',
	'Noto Sans Math',
	'Noto Sans Symbols 2'
]);

let fontRevision = 0;
const fontListeners = new Set<() => void>();

// The fonts are subsets loaded as the text needs them: when one arrives, what was drawn (and measured)
// with a fallback is stale.
if (typeof document !== 'undefined' && document.fonts) {
	document.fonts.addEventListener('loadingdone', () => {
		fontRevision++;
		for (const listener of fontListeners) listener();
	});
}

/** Calls `listener` whenever more of the board's fonts have loaded, so the board can draw again. */
export function onBoardFontsLoaded(listener: () => void): () => void {
	fontListeners.add(listener);
	return () => fontListeners.delete(listener);
}

/** Loads every face of the board's stack (a render must not draw a frame with fallback text). */
export async function loadBoardFonts(): Promise<void> {
	if (typeof document === 'undefined' || !document.fonts) return;
	const faces = [...document.fonts].filter((f) =>
		BOARD_FAMILIES.has(f.family.replace(/["']/g, ''))
	);
	await Promise.all(faces.map((f) => f.load()));
}

const strokeOutlines = new WeakMap<StrokeElement, Path2D>();

function strokeOutline(el: StrokeElement): Path2D {
	let path = strokeOutlines.get(el);
	if (path) return path;
	const input: [number, number, number][] = [];
	let constantPressure = true;
	for (let i = 0; i < el.points.length; i += 3) {
		input.push([el.points[i], el.points[i + 1], el.points[i + 2]]);
		if (el.points[i + 2] !== 0.5) constantPressure = false;
	}
	const outline = getStroke(input, {
		size: strokeRadius(el) * 2,
		thinning: el.highlighter ? 0 : 0.55,
		smoothing: 0.5,
		streamline: 0.45,
		simulatePressure: constantPressure && !el.highlighter,
		last: true
	});
	path = new Path2D();
	if (outline.length > 0) {
		path.moveTo(outline[0][0], outline[0][1]);
		for (let i = 1; i < outline.length; i++) {
			const [x0, y0] = outline[i];
			const [x1, y1] = outline[(i + 1) % outline.length];
			path.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
		}
		path.closePath();
	}
	strokeOutlines.set(el, path);
	return path;
}

function drawElement(ctx: CanvasRenderingContext2D, el: BoardElement, theme: BoardTheme): void {
	const color = COLORS[el.color][theme];
	ctx.fillStyle = color;
	ctx.strokeStyle = color;
	ctx.lineWidth = el.size;
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	switch (el.type) {
		case 'stroke':
			ctx.save();
			if (el.highlighter) ctx.globalAlpha = theme === 'light' ? 0.35 : 0.45;
			ctx.fill(strokeOutline(el));
			ctx.restore();
			return;
		case 'line':
		case 'arrow':
			ctx.beginPath();
			ctx.moveTo(el.x1, el.y1);
			ctx.lineTo(el.x2, el.y2);
			if (el.type === 'arrow') {
				const angle = Math.atan2(el.y2 - el.y1, el.x2 - el.x1);
				const head = Math.max(12, el.size * 3.5);
				for (const side of [-1, 1]) {
					const a = angle + Math.PI - side * (Math.PI / 7);
					ctx.moveTo(el.x2, el.y2);
					ctx.lineTo(el.x2 + Math.cos(a) * head, el.y2 + Math.sin(a) * head);
				}
			}
			ctx.stroke();
			return;
		case 'rect':
			ctx.beginPath();
			ctx.roundRect(
				Math.min(el.x1, el.x2),
				Math.min(el.y1, el.y2),
				Math.abs(el.x2 - el.x1),
				Math.abs(el.y2 - el.y1),
				Math.min(8, Math.abs(el.x2 - el.x1) / 4, Math.abs(el.y2 - el.y1) / 4)
			);
			ctx.stroke();
			return;
		case 'ellipse':
			ctx.beginPath();
			ctx.ellipse(
				(el.x1 + el.x2) / 2,
				(el.y1 + el.y2) / 2,
				Math.abs(el.x2 - el.x1) / 2,
				Math.abs(el.y2 - el.y1) / 2,
				0,
				0,
				Math.PI * 2
			);
			ctx.stroke();
			return;
		case 'graph':
		case 'solid':
		case 'symbol':
			kindOf(el.type)?.draw(ctx, el, {
				ink: (c) => COLORS[c][theme],
				muted: theme === 'light' ? '#475569' : '#a1a1aa',
				font: FONT_FAMILY,
				dark: theme === 'dark'
			});
			return;
		case 'text':
			ctx.font = `${el.size}px ${FONT_FAMILY}`;
			ctx.textBaseline = 'top';
			textLines(el).forEach((line, i) => {
				ctx.fillText(line, el.x, el.y + i * el.size * LINE_HEIGHT);
			});
	}
}

export type DrawOptions = {
	elements: OrderedElement[];
	/** Changes whenever `elements` do (the scene's revision). */
	revision: number;
	/** Drawn above the board: in-progress strokes (own and others'). */
	overlays: BoardElement[];
	/** Elements hidden from the board (being moved or edited). */
	hidden?: readonly string[];
	selected?: Rect | null;
	/** Corner handles on the selection (a graph can be resized). */
	handles?: boolean;
	viewport: Viewport;
	width: number;
	height: number;
	dpr: number;
	theme: BoardTheme;
	measure: MeasureText;
};

/**
 * Draws a board, keeping its elements as a bitmap redrawn only when they,
 * the camera, the size or the theme change. Strokes being drawn (their
 * owner's and everyone else's, updated twenty times a second each) then
 * cost one copy of the bitmap and their own drawing, whatever the size of
 * the board.
 */
export class BoardRenderer {
	#layer: HTMLCanvasElement | null = null;
	#key = '';
	readonly #pictures: PictureCache;

	/** `pictures` are the sheets' (drawn as they arrive); the board draws again when one does. */
	constructor(pictures: PictureCache) {
		this.#pictures = pictures;
	}

	draw(ctx: CanvasRenderingContext2D, o: DrawOptions): void {
		const layer = this.#layerFor(ctx, o);
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
		ctx.drawImage(layer, 0, 0);

		const z = o.viewport.zoom;
		worldTransform(ctx, o);
		for (const el of o.overlays) drawElement(ctx, el, o.theme);
		if (o.selected) {
			const pad = 6 / z;
			ctx.save();
			ctx.strokeStyle = o.theme === 'light' ? '#2563eb' : '#60a5fa';
			ctx.lineWidth = 1.5 / z;
			ctx.setLineDash([6 / z, 4 / z]);
			ctx.strokeRect(
				o.selected.minX - pad,
				o.selected.minY - pad,
				o.selected.maxX - o.selected.minX + pad * 2,
				o.selected.maxY - o.selected.minY + pad * 2
			);
			ctx.restore();
			if (o.handles) {
				const size = 10 / z;
				ctx.save();
				ctx.fillStyle = o.theme === 'light' ? '#ffffff' : '#18181b';
				ctx.strokeStyle = o.theme === 'light' ? '#2563eb' : '#60a5fa';
				ctx.lineWidth = 2 / z;
				for (const x of [o.selected.minX - pad, o.selected.maxX + pad]) {
					for (const y of [o.selected.minY - pad, o.selected.maxY + pad]) {
						ctx.fillRect(x - size / 2, y - size / 2, size, size);
						ctx.strokeRect(x - size / 2, y - size / 2, size, size);
					}
				}
				ctx.restore();
			}
		}
	}

	#layerFor(ctx: CanvasRenderingContext2D, o: DrawOptions): HTMLCanvasElement {
		const { width, height } = ctx.canvas;
		const v = o.viewport;
		const key = [
			o.revision,
			v.x,
			v.y,
			v.zoom,
			width,
			height,
			o.dpr,
			o.theme,
			o.hidden?.join(),
			this.#pictures.revision,
			fontRevision
		].join('|');
		let layer = this.#layer;
		if (layer && key === this.#key) return layer;
		if (!layer) layer = this.#layer = document.createElement('canvas');
		if (layer.width !== width || layer.height !== height) {
			layer.width = width;
			layer.height = height;
		}
		const lctx = layer.getContext('2d')!;
		lctx.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
		lctx.clearRect(0, 0, o.width, o.height);
		drawGrid(lctx, o);
		worldTransform(lctx, o);
		const view = visibleRect(v, o.width, o.height);
		for (const { id, el } of o.elements) {
			if (o.hidden?.includes(id)) continue;
			if (!rectsIntersect(elementBounds(el, o.measure), view)) continue;
			if (el.type === 'page') {
				const picture = el.deck ? this.#pictures.get(el.deck, el.n!) : null;
				drawSheet(lctx, el, picture, o.theme, v.zoom);
			} else {
				drawElement(lctx, el, o.theme);
			}
		}
		const sheets = sheetsOf(o.elements);
		this.#pictures.track(
			sheets,
			sheets.filter((s) => rectsIntersect(elementBounds(s.el, o.measure), view))
		);
		this.#key = key;
		return layer;
	}
}

/** Maps board units to the canvas's pixels. */
function worldTransform(ctx: CanvasRenderingContext2D, o: DrawOptions) {
	const z = o.viewport.zoom;
	ctx.setTransform(
		o.dpr * z,
		0,
		0,
		o.dpr * z,
		-o.viewport.x * z * o.dpr,
		-o.viewport.y * z * o.dpr
	);
}

/** A dot grid that pans and zooms with the board (hidden when too dense). */
function drawGrid(ctx: CanvasRenderingContext2D, o: DrawOptions) {
	const step = GRID * o.viewport.zoom;
	if (step < 12) return;
	ctx.fillStyle = o.theme === 'light' ? 'rgba(15, 23, 42, 0.13)' : 'rgba(226, 232, 240, 0.12)';
	const offsetX = -((o.viewport.x * o.viewport.zoom) % step);
	const offsetY = -((o.viewport.y * o.viewport.zoom) % step);
	const r = Math.max(0.8, Math.min(1.4, o.viewport.zoom));
	for (let x = offsetX; x < o.width; x += step) {
		for (let y = offsetY; y < o.height; y += step) {
			ctx.fillRect(x - r / 2, y - r / 2, r, r);
		}
	}
}

/** A text measurer backed by a canvas, memoized per (size, line). */
export function createMeasure(ctx: CanvasRenderingContext2D): MeasureText {
	const cache = new Map<string, number>();
	let seen = fontRevision;
	return (line, fontSize) => {
		if (seen !== fontRevision) {
			cache.clear();
			seen = fontRevision;
		}
		const key = `${fontSize}|${line}`;
		let width = cache.get(key);
		if (width === undefined) {
			ctx.save();
			ctx.font = `${fontSize}px ${FONT_FAMILY}`;
			width = ctx.measureText(line).width;
			ctx.restore();
			if (cache.size > 5000) cache.clear();
			cache.set(key, width);
		}
		return width;
	};
}
