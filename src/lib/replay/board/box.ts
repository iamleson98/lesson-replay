/**
 * The box of an element placed by dragging a rectangle (a graph, a solid, a
 * symbol): normalized, kept between size limits, and resized by a corner.
 * Shared by every pack, so resizing needs none of their code.
 */

import type { Point } from './elements';

export type Box = { x1: number; y1: number; x2: number; y2: number };
export type Corner = 'nw' | 'ne' | 'sw' | 'se';

const MAX_BOX = 4000;

const round1 = (v: number) => Math.round(v * 10) / 10;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The box as a position and a size, no smaller than `min` either way. */
export function boxOf(el: Box, min: number): { x: number; y: number; w: number; h: number } {
	return {
		x: Math.min(el.x1, el.x2),
		y: Math.min(el.y1, el.y2),
		w: clamp(Math.abs(el.x2 - el.x1), min, MAX_BOX),
		h: clamp(Math.abs(el.y2 - el.y1), min, MAX_BOX)
	};
}

/** A box with one corner dragged to `to`: the opposite corner stays put. */
export function resizeBox(el: Box, corner: Corner, to: Point, min: number): Box {
	const b = boxOf(el, min);
	const west = corner === 'nw' || corner === 'sw';
	const north = corner === 'nw' || corner === 'ne';
	const fixedX = west ? b.x + b.w : b.x;
	const fixedY = north ? b.y + b.h : b.y;
	const w = clamp(Math.abs(to.x - fixedX), min, MAX_BOX);
	const h = clamp(Math.abs(to.y - fixedY), min, MAX_BOX);
	const x = west ? fixedX - w : fixedX;
	const y = north ? fixedY - h : fixedY;
	return { x1: round1(x), y1: round1(y), x2: round1(x + w), y2: round1(y + h) };
}
