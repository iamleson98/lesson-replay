import { afterEach, describe, expect, it, vi } from 'vitest';
import { PictureCache, type Picture } from '#lib/replay/board/pictures.js';
import { sheetElement } from '#lib/replay/board/pages.js';
import type { Sheet } from '#lib/replay/board/pages.js';
import { BoardRenderer, type DrawOptions } from '#lib/replay/board/render.js';

const DECK = 'd'.repeat(26);
const picture = (width = 1920, height = 1080) => ({ width, height }) as Picture;

/** Sheets of one deck, pages 1..n, left to right. */
const deck = (n: number): Sheet[] =>
	Array.from({ length: n }, (_, i) => ({
		id: `s${i + 1}`,
		el: sheetElement({ x: i * 1600, y: 0 }, 720, { deck: DECK, n: i + 1 })
	}));

/** A cache whose loads are settled by the test. */
function cache() {
	const loads = new Map<string, { resolve: (p: Picture) => void; reject: () => void }>();
	const onChange = vi.fn();
	const load = vi.fn(
		(url: string) =>
			new Promise<Picture>((resolve, reject) => loads.set(url, { resolve, reject }))
	);
	const pictures = new PictureCache({ url: (d, n) => `/${d}/${n}`, onChange, load });
	const settle = async (n: number, how: 'ok' | 'fail' = 'ok') => {
		const pending = loads.get(`/${DECK}/${n}`)!;
		if (how === 'ok') pending.resolve(picture());
		else pending.reject();
		await Promise.resolve();
		await Promise.resolve();
	};
	return { pictures, onChange, load, settle };
}

describe('the pictures on the sheets', () => {
	it('loads a page once, however often it is asked for, and asks for a redraw when it arrives', async () => {
		const { pictures, onChange, load, settle } = cache();
		expect(pictures.get(DECK, 1)).toEqual({ status: 'loading' });
		pictures.get(DECK, 1);
		expect(load).toHaveBeenCalledTimes(1);
		await settle(1);
		expect(pictures.get(DECK, 1).status).toBe('ready');
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(pictures.revision).toBe(1);
	});

	it('keeps the sheets shown and their neighbours, and loads the neighbours ahead', async () => {
		const { pictures, load, settle } = cache();
		const sheets = deck(8);
		pictures.track(sheets, [sheets[3]]);
		expect(load.mock.calls.map(([url]) => url)).toEqual([
			`/${DECK}/3`,
			`/${DECK}/4`,
			`/${DECK}/5`
		]);
		await Promise.all([settle(3), settle(4), settle(5)]);
		pictures.track(sheets, [sheets[3]]);
		expect(load).toHaveBeenCalledTimes(3);
	});

	it('lets go of the sheets left behind: a phone never holds the deck', async () => {
		const { pictures, load, settle } = cache();
		const sheets = deck(8);
		pictures.track(sheets, [sheets[0]]);
		await Promise.all([settle(1), settle(2)]);
		pictures.track(sheets, [sheets[6]]);
		await Promise.all([settle(6), settle(7), settle(8)]);
		expect(pictures.get(DECK, 1).status).toBe('loading');
		expect(load).toHaveBeenCalledTimes(6);
	});

	it('shows a failed picture as failed, and asks for it again when the sheet is next shown', async () => {
		const { pictures, load, settle } = cache();
		const sheets = deck(4);
		pictures.track(sheets, [sheets[0]]);
		await Promise.all([settle(1, 'fail'), settle(2)]);
		expect(pictures.get(DECK, 1).status).toBe('failed');
		// Still shown: not asked for again and again.
		pictures.track(sheets, [sheets[0]]);
		expect(load).toHaveBeenCalledTimes(2);
		// Out of sight and let go of, then back in view: asked for again.
		pictures.track(sheets, [sheets[3]]);
		await Promise.all([settle(3), settle(4)]);
		pictures.track(sheets, [sheets[0]]);
		expect(load.mock.calls.filter(([url]) => url === `/${DECK}/1`)).toHaveLength(2);
	});

	it('ignores an answer for a picture that was let go of meanwhile', async () => {
		const { pictures, onChange, settle } = cache();
		const sheets = deck(8);
		pictures.track(sheets, [sheets[0]]);
		pictures.track(sheets, [sheets[6]]);
		await settle(1);
		expect(onChange).not.toHaveBeenCalled();
		expect(pictures.revision).toBe(0);
	});

	it('knows nothing of blank sheets', () => {
		const { pictures, load } = cache();
		const blank: Sheet[] = [{ id: 'b', el: sheetElement({ x: 0, y: 0 }, 720) }];
		pictures.track(blank, blank);
		expect(load).not.toHaveBeenCalled();
	});
});

/** A 2D context that records what a sheet is drawn with. */
function sheetContext() {
	const calls: string[] = [];
	const record =
		(name: string) =>
		(..._args: unknown[]) => {
			calls.push(name);
		};
	const ctx = {
		canvas: { width: 400, height: 300 } as HTMLCanvasElement,
		calls,
		...Object.fromEntries(
			[
				'setTransform',
				'clearRect',
				'drawImage',
				'fillRect',
				'strokeRect',
				'beginPath',
				'moveTo',
				'lineTo',
				'arc',
				'rect',
				'stroke',
				'save',
				'restore'
			].map((n) => [n, record(n)])
		)
	};
	return ctx as unknown as CanvasRenderingContext2D & { calls: string[] };
}

describe('waiting for the pictures of the sheets shown', () => {
	afterEach(() => vi.useRealTimers());

	it('has nothing to wait for when nothing is shown or everything is there', async () => {
		const { pictures, settle } = cache();
		expect(await pictures.settled(1000)).toBe(false);
		const sheets = deck(1);
		pictures.track(sheets, sheets);
		await settle(1);
		expect(await pictures.settled(1000)).toBe(false);
	});

	it('waits until the shown pictures have arrived and says it waited', async () => {
		const { pictures, settle } = cache();
		const sheets = deck(3);
		pictures.track(sheets, [sheets[0], sheets[1]]);
		let done: boolean | null = null;
		void pictures.settled(60_000).then((waited) => (done = waited));
		await settle(1);
		expect(done).toBeNull();
		await settle(2);
		await Promise.resolve();
		expect(done).toBe(true);
		expect(pictures.get(DECK, 2).status).toBe('ready');
	});

	it('does not wait for the neighbours that are only loaded ahead', async () => {
		const { pictures } = cache();
		const sheets = deck(3);
		pictures.track(sheets, [sheets[0]]);
		await pictures.get(DECK, 1);
		expect(pictures.get(DECK, 2).status).toBe('loading');
		let done = false;
		void pictures.settled(60_000).then(() => (done = true));
		await Promise.resolve();
		expect(done).toBe(false);
	});

	it('ends when a shown picture fails, which is an answer too', async () => {
		const { pictures, settle } = cache();
		const sheets = deck(1);
		pictures.track(sheets, sheets);
		const waiting = pictures.settled(60_000);
		await settle(1, 'fail');
		expect(await waiting).toBe(true);
		expect(pictures.get(DECK, 1).status).toBe('failed');
	});

	it('gives up on a picture that does not come: its sheet fails and the next wait is free', async () => {
		vi.useFakeTimers();
		const { pictures, settle } = cache();
		const sheets = deck(1);
		pictures.track(sheets, sheets);
		const revision = pictures.revision;
		const waiting = pictures.settled(5_000);
		await vi.advanceTimersByTimeAsync(5_000);
		expect(await waiting).toBe(true);
		expect(pictures.get(DECK, 1).status).toBe('failed');
		expect(pictures.revision).toBe(revision + 1);
		expect(await pictures.settled(5_000)).toBe(false);
		// The late answer of the picture given up on is stale.
		await settle(1);
		expect(pictures.get(DECK, 1).status).toBe('failed');
	});
});

describe('drawing sheets', () => {
	const options = (sheets: Sheet[], over: Partial<DrawOptions> = {}): DrawOptions => ({
		elements: sheets,
		revision: 1,
		overlays: [],
		viewport: { x: 0, y: 0, zoom: 1 },
		width: 400,
		height: 300,
		dpr: 1,
		theme: 'light',
		measure: () => 10,
		...over
	});

	afterEach(() => vi.restoreAllMocks());

	it('draws the picture of a page when it is there, and again when one arrives', async () => {
		const layer = sheetContext();
		vi.spyOn(document, 'createElement').mockReturnValue({
			width: 0,
			height: 0,
			getContext: () => layer
		} as unknown as HTMLCanvasElement);
		const { pictures, settle } = cache();
		const renderer = new BoardRenderer(pictures);
		const sheets = deck(1);
		const screen = sheetContext();
		renderer.draw(screen, options(sheets));
		expect(layer.calls).not.toContain('drawImage');
		expect(layer.calls).toContain('arc');

		await settle(1);
		renderer.draw(screen, options(sheets));
		expect(layer.calls).toContain('drawImage');
	});
});
