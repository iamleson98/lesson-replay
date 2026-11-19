/** Small canvas helpers shared by the graph and solid drawings. */

import { distanceToSegment, type ColorToken, type Point } from '../elements';

/** The context's scale: device pixels per board unit (hairlines are 1 pixel). */
export function scaleOf(ctx: CanvasRenderingContext2D): number {
	const m = ctx.getTransform?.();
	return m ? Math.hypot(m.a, m.b) || 1 : 1;
}

/** Text with a halo in the board's colour, so a line passing behind it does not cut it. */
export function haloText(
	ctx: CanvasRenderingContext2D,
	text: string,
	x: number,
	y: number,
	dark: boolean
): void {
	ctx.save();
	ctx.lineJoin = 'round';
	ctx.lineWidth = 4;
	ctx.strokeStyle = dark ? '#18181b' : '#ffffff';
	ctx.strokeText(text, x, y);
	ctx.restore();
	ctx.fillText(text, x, y);
}

export function dot(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	r: number,
	color: string,
	dark: boolean
): void {
	ctx.beginPath();
	ctx.arc(x, y, r, 0, Math.PI * 2);
	ctx.fillStyle = color;
	ctx.fill();
	ctx.lineWidth = 1.5;
	ctx.strokeStyle = dark ? '#18181b' : '#ffffff';
	ctx.stroke();
}

/** How a drawing inks itself: the colour of a token, the board's font and its theme. */
export type InkStyle = {
	ink: (color: ColorToken) => string;
	font: string;
	dark: boolean;
};

/** The box a drawing covers, as the board's bounds. */
export function boxBounds({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
	return { minX: x, minY: y, maxX: x + w, maxY: y + h };
}

/** Strokes a drawing's solid lines, then its dashed ones (thinner, dash after the stroke width). */
export function strokeRuns(
	ctx: CanvasRenderingContext2D,
	solid: Path2D,
	dashed: Path2D,
	width: number
): void {
	ctx.lineWidth = width;
	ctx.stroke(solid);
	ctx.setLineDash([width * 3, width * 2.4]);
	ctx.lineWidth = Math.max(1.2, width * 0.8);
	ctx.stroke(dashed);
	ctx.setLineDash([]);
}

/** Whether a point is within reach of the frame of a box (its blank inside does not count). */
export function frameHit(
	p: Point,
	{ x, y, w, h }: { x: number; y: number; w: number; h: number },
	reach: number
): boolean {
	const corners = [
		{ x, y },
		{ x: x + w, y },
		{ x: x + w, y: y + h },
		{ x, y: y + h }
	];
	return corners.some((c, i) => distanceToSegment(p, c, corners[(i + 1) % 4]) <= reach);
}

/** Whether a point is within reach of a polyline, each given as [x0, y0, x1, y1, …]. */
export function runsHit(p: Point, runs: Iterable<ArrayLike<number>>, reach: number): boolean {
	for (const run of runs) {
		for (let i = 0; i + 3 < run.length; i += 2) {
			const a = { x: run[i], y: run[i + 1] };
			const b = { x: run[i + 2], y: run[i + 3] };
			if (distanceToSegment(p, a, b) <= reach) return true;
		}
	}
	return false;
}
