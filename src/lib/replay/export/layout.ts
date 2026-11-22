/**
 * Where things sit in the rendered frame. One layout for the whole video: a
 * strip under the stage always carries the brand at its left; when the
 * teacher's camera is on at any point the strip is taller and holds the camera
 * tile, centred. Nothing is ever drawn over the stage, so a shared screen is
 * seen whole, as the player shows it.
 */

/** The size of the rendered video frame. */
export const WIDTH = 1280;
export const HEIGHT = 720;

export type Box = { x: number; y: number; w: number; h: number };

/** Height of the strip under the stage: with the camera tile, and without it. */
export const STRIP_H = 96;
export const SLIM_STRIP_H = 56;
/** The camera tile (16:9) inside the strip; the picture is fitted and centred in it. */
export const TILE_W = 144;
export const TILE_H = 80;
/** The brand (mark, name, domain) at the left of the strip: its margin, width, and mark size per strip. */
export const BRAND_X = 24;
export const BRAND_W = 300;
const MARK_H = 36;
const SLIM_MARK_H = 28;

export type StageLayout = { stage: Box; strip: Box; brand: Box; tile: Box | null };

export function stageLayout(hasCamera: boolean): StageLayout {
	const stripH = hasCamera ? STRIP_H : SLIM_STRIP_H;
	const markH = hasCamera ? MARK_H : SLIM_MARK_H;
	const stageH = HEIGHT - stripH;
	return {
		stage: { x: 0, y: 0, w: WIDTH, h: stageH },
		strip: { x: 0, y: stageH, w: WIDTH, h: stripH },
		brand: { x: BRAND_X, y: stageH + (stripH - markH) / 2, w: BRAND_W, h: markH },
		tile: hasCamera
			? {
					x: (WIDTH - TILE_W) / 2,
					y: stageH + (STRIP_H - TILE_H) / 2,
					w: TILE_W,
					h: TILE_H
				}
			: null
	};
}
