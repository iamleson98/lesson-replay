/**
 * The brand mark of the strip under the stage, loaded once before the frames
 * (the app's own logo, inlined as a data URL so the canvas stays untainted),
 * and the font its name is set in.
 */

import logo from './logo.svg?raw';
import { RenderError, within } from './render-error';

const MARK_PX = 64;

/** The mark as a decoded image (drawn from it every frame; nothing is decoded again). */
export async function loadBrandMark(): Promise<HTMLImageElement> {
	return within('render_failed', async () => {
		const image = new Image();
		image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(logo)}`;
		image.width = MARK_PX;
		image.height = MARK_PX;
		await image.decode();
		if (image.naturalWidth === 0) throw new RenderError('render_failed');
		// Best effort: a missing font falls back to the system's, the diacritics still draw.
		await document.fonts
			?.load('600 20px "Inter Variable"', 'Học Vui hocvui.org')
			.catch(() => undefined);
		return image;
	});
}
