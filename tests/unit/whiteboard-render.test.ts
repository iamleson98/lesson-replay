import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoardRenderer, type DrawOptions } from '#lib/replay/board/render.js';
import type { BoardElement } from '#lib/replay/board/elements.js';
import { PictureCache } from '#lib/replay/board/pictures.js';

/** A 2D context that records the calls drawing the board needs. */
function fakeContext(width = 200, height = 100) {
	const canvas = { width, height } as HTMLCanvasElement;
	const calls: string[] = [];
	const record =
		(name: string) =>
		(..._args: unknown[]) => {
			calls.push(name);
		};
	const ctx = {
		canvas,
		calls,
		setTransform: record('setTransform'),
		clearRect: record('clearRect'),
		drawImage: record('drawImage'),
		fillRect: record('fillRect'),
		beginPath: record('beginPath'),
		moveTo: record('moveTo'),
		lineTo: record('lineTo'),
		stroke: record('stroke'),
		save: record('save'),
		restore: record('restore'),
		setLineDash: record('setLineDash'),
		strokeRect: record('strokeRect')
	};
	return ctx as unknown as CanvasRenderingContext2D & { calls: string[] };
}

const line = (x: number): BoardElement => ({
	type: 'line',
	color: 'ink',
	size: 4,
	z: x,
	x1: x,
	y1: 10,
	x2: x + 20,
	y2: 10
});

function options(over: Partial<DrawOptions> = {}): DrawOptions {
	return {
		elements: [
			{ id: 'a', el: line(10) },
			{ id: 'b', el: line(50) }
		],
		revision: 1,
		overlays: [],
		viewport: { x: 0, y: 0, zoom: 1 },
		width: 200,
		height: 100,
		dpr: 1,
		theme: 'light',
		measure: () => 10,
		...over
	};
}

describe('BoardRenderer', () => {
	afterEach(() => vi.restoreAllMocks());

	it('redraws the board only when it or the camera changes', () => {
		const layer = fakeContext();
		vi.spyOn(document, 'createElement').mockReturnValue({
			width: 0,
			height: 0,
			getContext: () => layer
		} as unknown as HTMLCanvasElement);
		const screen = fakeContext();
		const renderer = new BoardRenderer(new PictureCache({ url: () => '', onChange: () => {} }));
		const strokes = () => layer.calls.filter((c) => c === 'stroke').length;

		renderer.draw(screen, options());
		expect(strokes()).toBe(2);

		// Someone's stroke in progress moves: the board is copied, not redrawn.
		renderer.draw(screen, options({ overlays: [line(80)] }));
		renderer.draw(screen, options({ overlays: [line(90)] }));
		expect(strokes()).toBe(2);
		expect(screen.calls.filter((c) => c === 'drawImage')).toHaveLength(3);
		expect(screen.calls.filter((c) => c === 'stroke')).toHaveLength(2);

		renderer.draw(screen, options({ revision: 2 }));
		expect(strokes()).toBe(4);
		renderer.draw(screen, options({ revision: 2, viewport: { x: 5, y: 0, zoom: 1 } }));
		expect(strokes()).toBe(6);
		renderer.draw(
			screen,
			options({ revision: 2, viewport: { x: 5, y: 0, zoom: 1 }, hidden: ['a'] })
		);
		expect(strokes(), 'an element being moved leaves the board layer').toBe(7);
	});
});
