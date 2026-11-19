/**
 * Drawing a symbol: its builder's lines (symbols.ts) turned by its quarter
 * turns and fitted to its box, with the label below. The result is computed
 * once per element (elements are immutable), so a redraw is only strokes.
 */

import type { Point } from '../elements';
import { boxOf } from '../box';
import { dot, frameHit, haloText, runsHit, strokeRuns, type InkStyle } from '../math/canvas';
import {
	buildSymbol,
	FITTED,
	LABEL_INSIDE,
	MIN_SYMBOL,
	type Drawing,
	type SymbolElement
} from './symbols';

type SymbolStyle = InkStyle;

type Laid = {
	solid: Path2D;
	dashed: Path2D;
	fills: Path2D[];
	/** Polylines in board units, for hit testing. */
	runs: number[][];
	dots: [number, number, number][];
	texts: Drawing['texts'];
	label: { text: string; x: number; y: number; inside: boolean } | null;
};

const LABEL_ROOM = 24;
const laid = new WeakMap<SymbolElement, Laid>();

export const symbolBox = (el: SymbolElement) => boxOf(el, MIN_SYMBOL);

/** Scales a drawing down (never up) to fit a room, centred. */
export function fitDrawing(d: Drawing, w: number, h: number): Drawing {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const l of d.lines) {
		for (let i = 0; i < l.points.length; i += 2) {
			minX = Math.min(minX, l.points[i]);
			maxX = Math.max(maxX, l.points[i]);
			minY = Math.min(minY, l.points[i + 1]);
			maxY = Math.max(maxY, l.points[i + 1]);
		}
	}
	if (!Number.isFinite(minX)) return d;
	const scale = Math.min(
		1,
		(w * 0.94) / Math.max(1e-9, maxX - minX),
		(h * 0.94) / Math.max(1e-9, maxY - minY)
	);
	const cx = (minX + maxX) / 2;
	const cy = (minY + maxY) / 2;
	const move = (points: number[]) => points.map((v, i) => (v - (i % 2 === 0 ? cx : cy)) * scale);
	return {
		lines: d.lines.map((l) => ({ ...l, points: move(l.points) })),
		dots: d.dots.map(([x, y, r]) => [(x - cx) * scale, (y - cy) * scale, r * scale]),
		texts: d.texts.map((t) => ({ ...t, x: (t.x - cx) * scale, y: (t.y - cy) * scale }))
	};
}

/** The point (x, y) turned `turns` quarter turns clockwise (y down). */
const turn = (x: number, y: number, turns: number): [number, number] => {
	switch (turns) {
		case 1:
			return [-y, x];
		case 2:
			return [-x, -y];
		case 3:
			return [y, -x];
		default:
			return [x, y];
	}
};

function layout(el: SymbolElement): Laid {
	let result = laid.get(el);
	if (result) return result;
	const box = symbolBox(el);
	const labelled = el.label !== '' && !LABEL_INSIDE.has(el.kind);
	const room = labelled ? Math.max(MIN_SYMBOL, box.h - LABEL_ROOM) : box.h;
	// The symbol is built for the room it has after the turn, then turned into place.
	const sideways = el.turns % 2 === 1;
	const [bw, bh] = sideways ? [room, box.w] : [box.w, room];
	let drawing = buildSymbol(el.kind, bw, bh, el.value);
	if (FITTED.has(el.kind)) drawing = fitDrawing(drawing, bw, bh);
	const cx = box.x + box.w / 2;
	const cy = box.y + room / 2;
	const place = (x: number, y: number): [number, number] => {
		const [tx, ty] = turn(x, y, el.turns);
		return [cx + tx, cy + ty];
	};
	const placeAll = (points: number[]) => {
		const out: number[] = [];
		for (let i = 0; i < points.length; i += 2) out.push(...place(points[i], points[i + 1]));
		return out;
	};

	const solid = new Path2D();
	const dashed = new Path2D();
	const fills: Path2D[] = [];
	const runs: number[][] = [];
	for (const l of drawing.lines) {
		const points = placeAll(l.points);
		const path = l.dashed ? dashed : solid;
		path.moveTo(points[0], points[1]);
		for (let i = 2; i < points.length; i += 2) path.lineTo(points[i], points[i + 1]);
		runs.push(points);
		if (l.fill) {
			const f = new Path2D();
			f.moveTo(points[0], points[1]);
			for (let i = 2; i < points.length; i += 2) f.lineTo(points[i], points[i + 1]);
			f.closePath();
			fills.push(f);
		}
	}
	result = {
		solid,
		dashed,
		fills,
		runs,
		dots: drawing.dots.map(([x, y, r]) => [...place(x, y), r] as [number, number, number]),
		texts: drawing.texts.map((t) => {
			const [x, y] = place(t.x, t.y);
			return { ...t, x, y };
		}),
		label: el.label
			? LABEL_INSIDE.has(el.kind)
				? { text: el.label, x: box.x + box.w / 2, y: box.y + box.h / 2, inside: true }
				: {
						text: el.label,
						x: box.x + box.w / 2,
						y: box.y + box.h - LABEL_ROOM / 2,
						inside: false
					}
			: null
	};
	laid.set(el, result);
	return result;
}

export function drawSymbol(
	ctx: CanvasRenderingContext2D,
	el: SymbolElement,
	st: SymbolStyle
): void {
	const { solid, dashed, fills, dots, texts, label } = layout(el);
	const color = st.ink(el.color);
	const width = Math.min(5, Math.max(1.5, el.size * 0.7));
	ctx.save();
	ctx.lineJoin = 'round';
	ctx.lineCap = 'round';
	ctx.strokeStyle = color;
	ctx.fillStyle = color;
	ctx.globalAlpha = 0.14;
	for (const f of fills) ctx.fill(f);
	ctx.globalAlpha = 1;
	strokeRuns(ctx, solid, dashed, width);
	for (const [x, y, r] of dots) dot(ctx, x, y, r, color, st.dark);
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = color;
	for (const t of texts) {
		ctx.font = `italic 600 ${t.size}px ${st.font}`;
		haloText(ctx, t.text, t.x, t.y, st.dark);
	}
	if (label) {
		ctx.font = `${label.inside ? 'italic 600 ' : ''}16px ${st.font}`;
		haloText(ctx, label.text, label.x, label.y, st.dark);
	}
	ctx.restore();
}

/** Whether a point touches a line of the symbol or the frame of its box (not the blank inside). */
export function symbolHit(el: SymbolElement, p: Point, reach: number): boolean {
	return frameHit(p, symbolBox(el), reach) || runsHit(p, layout(el).runs, reach);
}
