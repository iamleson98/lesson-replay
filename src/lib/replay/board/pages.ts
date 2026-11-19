/**
 * The board's sheets: where a new one goes, in what order they come, which
 * one a point is on and what is written on it. Pure functions over the
 * scene's elements, so the layout rules are the same for every client and
 * for the recording player. A sheet is one `page` element; nothing about
 * them is stored beyond that (see docs/calls/BOARD-PAGES.md).
 */

import {
	elementBounds,
	type MeasureText,
	type PageElement,
	type Point,
	type Rect,
	type ViewElement
} from './elements';
import type { OrderedElement } from './scene.svelte';

/** Every sheet is this wide; its height follows its picture. */
export const SHEET_WIDTH = 1280;
/** The space between two sheets. */
export const GAP = 320;
/** The height of a blank sheet. */
export const BLANK_HEIGHT = 720;
const MIN_HEIGHT = 320;
const MAX_HEIGHT = 4000;

/** The common fields of an element that has no ink: below all ink, drawn with no colour of its own. */
const CONTROL = { color: 'ink', size: 1, z: 0 } as const;

export type Sheet = { id: string; el: PageElement };

/** The sheets among the board's elements, in the order they were laid: left to right. */
export function sheetsOf(list: OrderedElement[]): Sheet[] {
	const sheets: Sheet[] = [];
	for (const { id, el } of list) {
		if (el.type === 'page') sheets.push({ id, el });
	}
	return sheets.sort((a, b) => a.el.x - b.el.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export const sheetRect = (el: PageElement): Rect => ({
	minX: el.x,
	minY: el.y,
	maxX: el.x + el.w,
	maxY: el.y + el.h
});

/** The height of a sheet for a picture `aspect` (height over width) tall, within the limits. */
export function sheetHeight(aspect: number): number {
	const height = Math.round(SHEET_WIDTH * aspect);
	return Math.min(
		MAX_HEIGHT,
		Math.max(MIN_HEIGHT, Number.isFinite(height) ? height : BLANK_HEIGHT)
	);
}

/**
 * Where the next sheet goes: right of the right-most sheet, top edges level;
 * on a board with none, right of the ink (at the origin when the board is empty).
 */
export function nextSheetPlace(sheets: Sheet[], content: Rect | null): Point {
	const last = sheets.at(-1);
	if (last) return { x: last.el.x + last.el.w + GAP, y: last.el.y };
	return content
		? { x: Math.round(content.maxX + GAP), y: Math.round(content.minY) }
		: { x: 0, y: 0 };
}

/** A sheet at a place, blank or showing a page of a deck. */
export function sheetElement(
	place: Point,
	height: number,
	picture?: { deck: string; n: number }
): PageElement {
	return {
		...CONTROL,
		type: 'page',
		x: place.x,
		y: place.y,
		w: SHEET_WIDTH,
		h: height,
		...picture
	};
}

export const viewElement = (page: string): ViewElement => ({ ...CONTROL, type: 'view', page });

/** The sheet under a point, if any. */
export function sheetAt(sheets: Sheet[], p: Point): Sheet | null {
	return (
		sheets.find(
			({ el }) => p.x >= el.x && p.x <= el.x + el.w && p.y >= el.y && p.y <= el.y + el.h
		) ?? null
	);
}

/** The sheet the teacher's view names; the first one until they have moved or when it is gone. */
export function viewedSheet(sheets: Sheet[], view: ViewElement | null): Sheet | null {
	return sheets.find(({ id }) => id === view?.page) ?? sheets[0] ?? null;
}

/**
 * The ids of what is written on a sheet: the ink whose box has its centre
 * on it (a stroke that strays over the edge still belongs to the sheet it
 * mostly lies on).
 */
export function inkInside(
	list: OrderedElement[],
	sheet: PageElement,
	measure: MeasureText
): string[] {
	const ids: string[] = [];
	for (const { id, el } of list) {
		if (el.type === 'page') continue;
		const b = elementBounds(el, measure);
		const x = (b.minX + b.maxX) / 2;
		const y = (b.minY + b.maxY) / 2;
		if (x >= sheet.x && x <= sheet.x + sheet.w && y >= sheet.y && y <= sheet.y + sheet.h) {
			ids.push(id);
		}
	}
	return ids;
}
