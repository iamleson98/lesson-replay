/**
 * The camera over the board: `x, y` is the board point at the canvas's
 * top-left corner, `zoom` the screen pixels per board unit.
 */

import type { Point, Rect } from './elements';

export type Viewport = { x: number; y: number; zoom: number };

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 5;

export function toWorld(v: Viewport, screen: Point): Point {
	return { x: v.x + screen.x / v.zoom, y: v.y + screen.y / v.zoom };
}

export function toScreen(v: Viewport, world: Point): Point {
	return { x: (world.x - v.x) * v.zoom, y: (world.y - v.y) * v.zoom };
}

/** Zooms by `factor` keeping the board point under `anchor` (screen) still. */
export function zoomAt(v: Viewport, anchor: Point, factor: number): Viewport {
	const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
	const world = toWorld(v, anchor);
	return { zoom, x: world.x - anchor.x / zoom, y: world.y - anchor.y / zoom };
}

/** The board area visible in a canvas of this size. */
export function visibleRect(v: Viewport, width: number, height: number): Rect {
	return { minX: v.x, minY: v.y, maxX: v.x + width / v.zoom, maxY: v.y + height / v.zoom };
}

/** Canvas pixels at each edge that something floats over (the toolbar, the page bar). */
export type Insets = { top: number; right: number; bottom: number; left: number };

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * A viewport showing `content` centered in the part of the canvas that is not
 * under `insets` (zoom capped at 1), with `margin` pixels to spare around it.
 */
export function fitTo(
	content: Rect,
	width: number,
	height: number,
	margin = 48,
	insets: Insets = NO_INSETS
): Viewport {
	const w = content.maxX - content.minX;
	const h = content.maxY - content.minY;
	const freeWidth = width - insets.left - insets.right;
	const freeHeight = height - insets.top - insets.bottom;
	const zoom = Math.min(
		1,
		Math.max(
			MIN_ZOOM,
			Math.min((freeWidth - margin * 2) / (w || 1), (freeHeight - margin * 2) / (h || 1))
		)
	);
	const centerX = (content.minX + content.maxX) / 2;
	const centerY = (content.minY + content.maxY) / 2;
	return {
		zoom,
		x: centerX - (insets.left + freeWidth / 2) / zoom,
		y: centerY - (insets.top + freeHeight / 2) / zoom
	};
}

/** The camera `k` of the way (0 to 1) from `a` to `b`. */
export function blend(a: Viewport, b: Viewport, k: number): Viewport {
	if (k >= 1) return b;
	return {
		x: a.x + (b.x - a.x) * k,
		y: a.y + (b.y - a.y) * k,
		zoom: a.zoom + (b.zoom - a.zoom) * k
	};
}
