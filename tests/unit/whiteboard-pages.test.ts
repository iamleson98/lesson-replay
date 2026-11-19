import { describe, expect, it } from 'vitest';
import {
	decodeElement,
	elementBounds,
	hitTest,
	translate,
	type BoardElement,
	type PageElement
} from '#lib/replay/board/elements.js';
import {
	BLANK_HEIGHT,
	GAP,
	inkInside,
	nextSheetPlace,
	SHEET_WIDTH,
	sheetAt,
	sheetElement,
	sheetHeight,
	sheetsOf,
	viewedSheet,
	viewElement
} from '#lib/replay/board/pages.js';
import { applyPresence } from '#lib/replay/board/presence.js';
import { BoardScene, type Envelope } from '#lib/replay/board/scene.svelte.js';

const measure = (line: string, size: number) => line.length * size * 0.5;
const DECK = 'd'.repeat(26);

const page = (over: Partial<PageElement> = {}): PageElement => ({
	...sheetElement({ x: 0, y: 0 }, BLANK_HEIGHT),
	...over
});

const env = (id: string, data: BoardElement, version = 1): Envelope => ({
	id,
	version,
	version_nonce: 1,
	is_deleted: false,
	data: data as unknown as Envelope['data']
});

const ink = (x: number, y: number, z = 10): BoardElement => ({
	type: 'rect',
	color: 'ink',
	size: 4,
	z,
	x1: x,
	y1: y,
	x2: x + 20,
	y2: y + 20
});

describe('decoding a sheet', () => {
	it('reads a blank sheet and a sheet showing a page of a deck', () => {
		expect(decodeElement(page())).toMatchObject({ type: 'page', w: 1280, h: 720 });
		expect(decodeElement(page({ deck: DECK, n: 3 }))).toMatchObject({ deck: DECK, n: 3 });
	});

	it('refuses sizes and places that are not sane', () => {
		for (const over of [
			{ w: 99 },
			{ w: 8001 },
			{ h: 50 },
			{ h: 9000 },
			{ x: Number.NaN },
			{ y: Infinity },
			{ w: '1280' as unknown as number }
		]) {
			expect(decodeElement(page(over))).toBeNull();
		}
	});

	it('wants the deck and the page together, and well formed', () => {
		expect(decodeElement(page({ deck: DECK }))).toBeNull();
		expect(decodeElement(page({ n: 2 }))).toBeNull();
		expect(decodeElement(page({ deck: 'short', n: 2 }))).toBeNull();
		expect(decodeElement(page({ deck: DECK, n: 0 }))).toBeNull();
		expect(decodeElement(page({ deck: DECK, n: 121 }))).toBeNull();
		expect(decodeElement(page({ deck: DECK, n: 1.5 }))).toBeNull();
		expect(decodeElement(page({ deck: DECK, n: 120 }))).not.toBeNull();
	});

	it('reads the view and nothing else in its place', () => {
		expect(decodeElement(viewElement('abc123'))).toEqual(viewElement('abc123'));
		expect(decodeElement({ ...viewElement('abc'), page: 7 })).toBeNull();
		expect(decodeElement({ ...viewElement('abc'), page: '' })).toBeNull();
		expect(decodeElement({ ...viewElement('abc'), page: 'a b' })).toBeNull();
	});
});

describe('a sheet on the board', () => {
	it('is never hit, however close the pointer, and never moves', () => {
		const sheet = page();
		expect(hitTest(sheet, { x: 100, y: 100 }, 50, measure)).toBe(false);
		expect(hitTest(viewElement('x'), { x: 0, y: 0 }, 50, measure)).toBe(false);
		expect(translate(sheet, 40, 40)).toBe(sheet);
	});

	it('has the bounds of its frame', () => {
		expect(elementBounds(page({ x: 10, y: 20 }), measure)).toEqual({
			minX: 10,
			minY: 20,
			maxX: 1290,
			maxY: 740
		});
	});

	it('is ignored as a pointer preview: a sheet cannot be drawn by a cursor', () => {
		const shown = applyPresence(undefined, { preview: page() as never }, 0);
		expect(shown?.preview ?? null).toBeNull();
	});
});

describe('the scene with sheets', () => {
	it('keeps the view out of the elements, the bounds and the stacking', () => {
		const scene = new BoardScene();
		scene.merge([env('a', page()), env('view', viewElement('a')), env('b', ink(100, 100))]);
		expect(scene.ordered().map((o) => o.id)).toEqual(['a', 'b']);
		expect(scene.view()).toEqual(viewElement('a'));
		expect(scene.contentBounds(measure)).toMatchObject({ minX: 0, maxX: 1280 });
		expect(scene.topmostAt({ x: 5, y: 5 }, 8, measure)).toBeNull();
		expect(scene.topmostAt({ x: 110, y: 110 }, 8, measure)?.id).toBe('b');
	});

	it('draws sheets below all ink', () => {
		const scene = new BoardScene();
		scene.merge([env('z-ink', ink(0, 0, 5)), env('a-page', page())]);
		expect(scene.ordered().map((o) => o.id)).toEqual(['a-page', 'z-ink']);
	});

	it('only reads an element of type view as the view', () => {
		const scene = new BoardScene();
		scene.merge([env('view', ink(0, 0))]);
		expect(scene.view()).toBeNull();
	});
});

describe('laying sheets out', () => {
	const sheetsAt = (...xs: number[]) =>
		sheetsOf(xs.map((x, i) => ({ id: `s${i}`, el: page({ x }) })));

	it('orders sheets by place, then by id', () => {
		const list = [
			{ id: 'c', el: page({ x: 3000 }) },
			{ id: 'b', el: page({ x: 0 }) },
			{ id: 'a', el: page({ x: 0 }) },
			{ id: 'ink', el: ink(0, 0) }
		];
		expect(sheetsOf(list).map((s) => s.id)).toEqual(['a', 'b', 'c']);
	});

	it('puts a new sheet right of the right-most one, tops level', () => {
		const sheets = sheetsOf([
			{ id: 'a', el: page({ x: 0, y: 40 }) },
			{ id: 'b', el: page({ x: SHEET_WIDTH + GAP, y: 40, h: 1000 }) }
		]);
		expect(nextSheetPlace(sheets, null)).toEqual({ x: 2 * (SHEET_WIDTH + GAP), y: 40 });
	});

	it('puts the first sheet right of the ink, or at the origin on an empty board', () => {
		expect(nextSheetPlace([], null)).toEqual({ x: 0, y: 0 });
		expect(nextSheetPlace([], { minX: -50, minY: 12.4, maxX: 400.2, maxY: 90 })).toEqual({
			x: 720,
			y: 12
		});
	});

	it('gives a sheet the height of its picture within limits', () => {
		expect(sheetHeight(9 / 16)).toBe(720);
		expect(sheetHeight(1.414)).toBe(1810);
		expect(sheetHeight(0.05)).toBe(320);
		expect(sheetHeight(10)).toBe(4000);
		expect(sheetHeight(Number.NaN)).toBe(BLANK_HEIGHT);
	});

	it('finds the sheet at a point, and none in the gap', () => {
		const sheets = sheetsAt(0, SHEET_WIDTH + GAP);
		expect(sheetAt(sheets, { x: 10, y: 10 })?.id).toBe('s0');
		expect(sheetAt(sheets, { x: SHEET_WIDTH + GAP + 5, y: 10 })?.id).toBe('s1');
		expect(sheetAt(sheets, { x: SHEET_WIDTH + 10, y: 10 })).toBeNull();
	});

	it('names the sheet the view is on, the first one until the teacher has moved', () => {
		const sheets = sheetsAt(0, 2000);
		expect(viewedSheet(sheets, viewElement('s1'))?.id).toBe('s1');
		expect(viewedSheet(sheets, null)?.id).toBe('s0');
		expect(viewedSheet(sheets, viewElement('gone'))?.id).toBe('s0');
		expect(viewedSheet([], viewElement('s1'))).toBeNull();
	});

	it('knows what is written on a sheet by where the writing mostly lies', () => {
		const sheet = page();
		const list = [
			{ id: 'on', el: ink(100, 100) },
			{
				id: 'edge',
				el: { ...ink(0, 0), x1: 1100, x2: 1400, y1: 100, y2: 120 } as BoardElement
			},
			{ id: 'off', el: ink(1500, 100) },
			{ id: 'sheet', el: sheet }
		];
		expect(inkInside(list, sheet, measure)).toEqual(['on', 'edge']);
	});
});
