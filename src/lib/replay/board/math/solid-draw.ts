/**
 * Drawing a solid: its flat primitives (math/solids.ts) fitted to its box,
 * with hidden edges dashed and vertex letters beside the vertices. The fit is
 * computed once per element (elements are immutable), so a redraw is only
 * strokes.
 */

import type { Point } from '../elements';
import { dot, frameHit, haloText, runsHit, strokeRuns, type InkStyle } from './canvas';
import { graphBox } from './graph';
import { flatBounds, flattenSolid, type SolidElement } from './solids';

type SolidStyle = InkStyle;

type Laid = {
	solid: Path2D;
	dashed: Path2D;
	fills: Path2D[];
	/** Polylines in board units, for hit testing. */
	runs: number[][];
	labels: { text: string; x: number; y: number }[];
	dots: [number, number][];
};

const PAD = 26;
const LABEL_OFFSET = 13;
const laid = new WeakMap<SolidElement, Laid>();

function polyline(path: Path2D, points: number[]) {
	if (points.length < 4) return;
	path.moveTo(points[0], points[1]);
	for (let i = 2; i < points.length; i += 2) path.lineTo(points[i], points[i + 1]);
}

function layout(el: SolidElement): Laid {
	let result = laid.get(el);
	if (result) return result;
	const flat = flattenSolid(el);
	const [minX, minY, maxX, maxY] = flatBounds(flat);
	const box = graphBox(el);
	const w = Math.max(1e-9, maxX - minX);
	const h = Math.max(1e-9, maxY - minY);
	const scale = Math.min((box.w - PAD * 2) / w, (box.h - PAD * 2) / h);
	const cx = box.x + box.w / 2 - ((minX + maxX) / 2) * scale;
	const cy = box.y + box.h / 2 + ((minY + maxY) / 2) * scale;
	// Plane (y up) to board (y down).
	const at = (points: number[]) =>
		points.map((v, i) => (i % 2 === 0 ? cx + v * scale : cy - v * scale));

	const solid = new Path2D();
	const dashed = new Path2D();
	const runs: number[][] = [];
	for (const line of flat.lines) {
		const points = at(line.points);
		polyline(line.hidden ? dashed : solid, points);
		runs.push(points);
	}
	const fills = flat.fills.map((polygon) => {
		const path = new Path2D();
		polyline(path, at(polygon));
		path.closePath();
		return path;
	});

	// Letters sit outside the solid: away from the middle of the drawing.
	const middle = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
	const labels = flat.labels.map((l) => {
		const [x, y] = at([l.x, l.y]);
		let dx = x - middle.x;
		let dy = y - middle.y;
		const len = Math.hypot(dx, dy);
		if (len < 6) {
			dx = 0.7;
			dy = 0.7;
		} else {
			dx /= len;
			dy /= len;
		}
		return { text: l.text, x: x + dx * LABEL_OFFSET, y: y + dy * LABEL_OFFSET };
	});

	result = {
		solid,
		dashed,
		fills,
		runs,
		labels,
		dots: flat.dots.map((d) => at(d) as [number, number])
	};
	laid.set(el, result);
	return result;
}

export function drawSolid(ctx: CanvasRenderingContext2D, el: SolidElement, st: SolidStyle): void {
	const { solid, dashed, fills, labels, dots } = layout(el);
	const color = st.ink(el.color);
	const width = Math.min(6, Math.max(1.5, el.size * 0.75));
	ctx.save();
	ctx.lineJoin = 'round';
	ctx.lineCap = 'round';
	if (el.tint) {
		ctx.globalAlpha = 0.12;
		ctx.fillStyle = color;
		for (const f of fills) ctx.fill(f);
		ctx.globalAlpha = 1;
	}
	ctx.strokeStyle = color;
	strokeRuns(ctx, solid, dashed, width);
	for (const [x, y] of dots) dot(ctx, x, y, 3, color, st.dark);
	if (el.labels) {
		ctx.font = `italic 600 17px ${st.font}`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = color;
		for (const l of labels) haloText(ctx, l.text, l.x, l.y, st.dark);
	}
	ctx.restore();
}

/** Whether a point touches an edge, an outline or the box's frame (not the blank inside). */
export function solidHit(el: SolidElement, p: Point, reach: number): boolean {
	return frameHit(p, graphBox(el), reach) || runsHit(p, layout(el).runs, reach);
}
