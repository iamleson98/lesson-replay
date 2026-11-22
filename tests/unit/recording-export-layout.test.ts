import { describe, expect, it } from 'vitest';
import { HEIGHT, stageLayout, WIDTH, type Box } from '#lib/replay/export/layout.js';

const inside = (inner: Box, outer: Box) =>
	inner.x >= outer.x &&
	inner.y >= outer.y &&
	inner.x + inner.w <= outer.x + outer.w &&
	inner.y + inner.h <= outer.y + outer.h;

const apart = (a: Box, b: Box) => a.x + a.w <= b.x || b.x + b.w <= a.x;

describe('the render layout', () => {
	it('puts a slim 56 px brand strip under a 1280x664 stage when the camera never appears', () => {
		const { stage, strip, tile } = stageLayout(false);
		expect(stage).toEqual({ x: 0, y: 0, w: 1280, h: 664 });
		expect(strip).toEqual({ x: 0, y: 664, w: 1280, h: 56 });
		expect(tile).toBeNull();
	});

	it('puts a 96 px strip under a 1280x624 stage when the camera appears', () => {
		const { stage, strip, tile } = stageLayout(true);
		expect(stage).toEqual({ x: 0, y: 0, w: 1280, h: 624 });
		expect(strip).toEqual({ x: 0, y: 624, w: 1280, h: 96 });
		expect(tile).not.toBeNull();
	});

	it.each([true, false])('fills the frame with stage and strip (camera %s)', (camera) => {
		const { stage, strip } = stageLayout(camera);
		expect(stage.h + strip.h).toBe(HEIGHT);
		expect(stage.w).toBe(WIDTH);
		expect(strip.w).toBe(WIDTH);
		expect(strip.y).toBe(stage.h);
	});

	it.each([true, false])(
		'keeps the brand inside the strip, never over the stage (camera %s)',
		(camera) => {
			const { strip, brand } = stageLayout(camera);
			expect(inside(brand, strip)).toBe(true);
			expect(brand.y * 2 + brand.h).toBe(strip.y * 2 + strip.h);
		}
	);

	it('keeps the tile inside the strip, centred, clear of the stage and the brand', () => {
		const { stage, strip, tile, brand } = stageLayout(true);
		if (!tile) throw new Error('layout has no tile');
		expect(tile.y).toBeGreaterThanOrEqual(stage.y + stage.h);
		expect(inside(tile, strip)).toBe(true);
		expect(tile.x * 2 + tile.w).toBe(WIDTH);
		expect(apart(tile, brand)).toBe(true);
	});
});
