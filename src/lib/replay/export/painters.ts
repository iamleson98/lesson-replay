/**
 * The painters of a rendered frame, all on one 1280x720 canvas: the board
 * (through the live board's own renderer, on a white sheet, with the pictures
 * of imported slides in place), the teacher's shared screen scaled to fit, and
 * the teacher's camera as a small tile in the strip under the stage, which also carries the brand. (The quiz
 * and Quest stages are the player's own screens, painted by `dom-painter.ts`.)
 * Nobody else is drawn: no students, no chat, no pointers.
 */

import type { VideoSample } from 'mediabunny';
import { BoardRenderer, createMeasure } from '../board/render.js';
import type { BoardElement } from '../board/elements.js';
import { PictureCache, type Picture } from '../board/pictures.js';
import type { BoardReplay } from '../player/board-replay.svelte';
import { boardViewport } from '../player/board-viewport';
import { drawWithPictures } from './board-pictures';
import { fitRect } from './stage';
import type { Box } from './layout';

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const STRIP_COLOR = '#0f172a';
export const BRAND_FONT = '"Inter Variable", system-ui, sans-serif';

const offscreen = (w: number, h: number) => new OffscreenCanvas(w, h);
const ctx2d = (canvas: OffscreenCanvas) =>
	canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;

/** The box `box` painted `color`. */
export function fillBox(ctx: Ctx, box: Box, color: string): void {
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.fillStyle = color;
	ctx.fillRect(box.x, box.y, box.w, box.h);
}

/** The board as it was at the replay's time, drawn by the live board's renderer on a white sheet. */
export class BoardPainter {
	readonly #canvas: OffscreenCanvas;
	readonly #ctx: OffscreenCanvasRenderingContext2D;
	readonly #measure = createMeasure(
		ctx2d(offscreen(8, 8)) as unknown as CanvasRenderingContext2D
	);
	readonly #pictures: PictureCache;
	readonly #renderer: BoardRenderer;

	/**
	 * `url` and `load` read the pictures of imported deck pages (with the render token, see
	 * `recording-source`); the board waits for them before a frame is taken.
	 */
	constructor(
		readonly stage: Box,
		pictures: {
			url: (deck: string, n: number) => string;
			load: (url: string) => Promise<Picture>;
		}
	) {
		this.#canvas = offscreen(stage.w, stage.h);
		this.#ctx = ctx2d(this.#canvas);
		this.#pictures = new PictureCache({ ...pictures, onChange: () => undefined });
		this.#renderer = new BoardRenderer(this.#pictures);
	}

	async paint(target: Ctx, replay: BoardReplay): Promise<void> {
		const { scene } = replay;
		const overlays: BoardElement[] = [...replay.remote.values()].flatMap((p) =>
			p.preview ? [p.preview] : []
		);
		await drawWithPictures(this.#pictures, () =>
			this.#renderer.draw(this.#ctx as unknown as CanvasRenderingContext2D, {
				elements: scene.ordered(),
				revision: scene.revision,
				overlays,
				hidden: [],
				selected: null,
				viewport: boardViewport(scene, this.#measure, this.stage.w, this.stage.h),
				width: this.stage.w,
				height: this.stage.h,
				dpr: 1,
				theme: 'light',
				measure: this.#measure
			})
		);
		// The renderer clears to transparent: the sheet's own colour goes down first.
		fillBox(target, this.stage, '#ffffff');
		target.drawImage(this.#canvas, this.stage.x, this.stage.y);
	}
}

/** The teacher's screen, whole and centred on black inside the stage. */
export function paintScreen(ctx: Ctx, sample: VideoSample | null, stage: Box): void {
	fillBox(ctx, stage, '#000000');
	if (!sample) return;
	const r = fitRect(sample.displayWidth, sample.displayHeight, stage.w, stage.h);
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'medium';
	sample.draw(ctx as CanvasRenderingContext2D, stage.x + r.x, stage.y + r.y, r.w, r.h);
}

/** The strip under the stage with the brand at its left (painted every frame so a tile never smears). */
export function paintStrip(ctx: Ctx, strip: Box, brand: Box, mark: HTMLImageElement): void {
	fillBox(ctx, strip, STRIP_COLOR);
	ctx.drawImage(mark, brand.x, brand.y, brand.h, brand.h);
	const textX = brand.x + brand.h + 12;
	const midY = brand.y + brand.h / 2;
	ctx.save();
	ctx.textBaseline = 'middle';
	ctx.fillStyle = '#f8fafc';
	ctx.font = `600 ${Math.round(brand.h * 0.62)}px ${BRAND_FONT}`;
	ctx.fillText('Học Vui', textX, midY);
	const nameW = ctx.measureText('Học Vui').width;
	const domainX = textX + nameW + 14;
	ctx.font = `500 ${Math.round(brand.h * 0.42)}px ${BRAND_FONT}`;
	if (domainX + ctx.measureText('hocvui.org').width <= brand.x + brand.w) {
		ctx.fillStyle = '#94a3b8';
		ctx.fillText('hocvui.org', domainX, midY + 1);
	}
	ctx.restore();
}

/** The teacher's camera as a small rounded tile in the strip, fitted and centred. */
export function paintCamera(ctx: Ctx, sample: VideoSample, tile: Box): void {
	ctx.save();
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.beginPath();
	ctx.roundRect(tile.x, tile.y, tile.w, tile.h, 12);
	ctx.clip();
	ctx.fillStyle = '#000000';
	ctx.fillRect(tile.x, tile.y, tile.w, tile.h);
	const r = fitRect(sample.displayWidth, sample.displayHeight, tile.w, tile.h);
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'medium';
	sample.draw(ctx as CanvasRenderingContext2D, tile.x + r.x, tile.y + r.y, r.w, r.h);
	ctx.restore();
	ctx.save();
	ctx.lineWidth = 3;
	ctx.strokeStyle = '#ffffff';
	ctx.beginPath();
	ctx.roundRect(tile.x, tile.y, tile.w, tile.h, 12);
	ctx.stroke();
	ctx.restore();
}
