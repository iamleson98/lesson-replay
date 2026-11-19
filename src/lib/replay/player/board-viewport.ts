/**
 * Where a recorded board is looked at: the whole drawing kept in frame as it
 * grows or, on a board with sheets, the sheet the teacher was on. The player's
 * board and the rendered video frame it the same way.
 */

import type { MeasureText } from '../board/elements.js';
import { sheetRect, sheetsOf, viewedSheet } from '../board/pages.js';
import type { BoardScene } from '../board/scene.svelte.js';
import { fitTo, type Viewport } from '../board/viewport.js';

export function boardViewport(
	scene: BoardScene,
	measure: MeasureText,
	width: number,
	height: number
): Viewport {
	if (!width || !height) return { x: 0, y: 0, zoom: 1 };
	const sheet = viewedSheet(sheetsOf(scene.ordered()), scene.view());
	const content = sheet ? sheetRect(sheet.el) : scene.contentBounds(measure);
	return content ? fitTo(content, width, height) : { x: 0, y: 0, zoom: 1 };
}
