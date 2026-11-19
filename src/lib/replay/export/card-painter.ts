/**
 * The countdown card, painted with the canvas like every other frame: the brand's
 * calm dark slate on the stage, the lesson's title and the teacher's name, and the
 * time left; the strip under it is the usual one. Everything but the time is
 * painted once into a cache; a frame whose second is the one already on the canvas
 * paints nothing (the card frames are the first ones of the video, so the canvas
 * still holds the last of them).
 */

import { paintStrip, BRAND_FONT, type Ctx } from './painters';
import { fitTitle, formatCountdown } from './card';
import { HEIGHT, WIDTH } from './frame-clock';
import type { StageLayout } from './layout';

const BG_TOP = '#1e293b';
const BG_BOTTOM = '#0f172a';
const TEXT = '#f8fafc';
const MUTED = '#94a3b8';
const SOFT = '#cbd5e1';
/** The text's side margins, the title's size range and the other sizes. */
const MARGIN_X = 120;
const TITLE_MAX_PX = 56;
const TITLE_MIN_PX = 30;
const TEACHER_PX = 28;
const LABEL_PX = 32;
const TIME_PX = 132;

export type CardText = {
	title: string;
	teacher: string;
	/** "Live lesson starts in", in the lesson's language. */
	startsIn: string;
};

const font = (weight: number, px: number) => `${weight} ${px}px ${BRAND_FONT}`;

export class CardPainter {
	readonly #base: OffscreenCanvas;
	readonly #timeY: number;
	#shown = -1;

	constructor(layout: StageLayout, mark: HTMLImageElement, text: CardText) {
		this.#base = new OffscreenCanvas(WIDTH, HEIGHT);
		const ctx = this.#base.getContext('2d') as OffscreenCanvasRenderingContext2D;
		const { stage } = layout;
		const cx = stage.x + stage.w / 2;

		const slate = ctx.createLinearGradient(0, stage.y, 0, stage.y + stage.h);
		slate.addColorStop(0, BG_TOP);
		slate.addColorStop(1, BG_BOTTOM);
		ctx.fillStyle = slate;
		ctx.fillRect(stage.x, stage.y, stage.w, stage.h);
		paintStrip(ctx, layout.strip, layout.brand, mark);

		ctx.textAlign = 'center';
		ctx.textBaseline = 'alphabetic';
		const measure = (s: string, px: number) => {
			ctx.font = font(700, px);
			return ctx.measureText(s).width;
		};
		const title = fitTitle(text.title, WIDTH - 2 * MARGIN_X, measure, {
			maxPx: TITLE_MAX_PX,
			minPx: TITLE_MIN_PX,
			maxLines: 2
		});
		const lineH = Math.round(title.px * 1.22);
		const head = title.lines.length * lineH + (text.teacher ? 16 + TEACHER_PX : 0);
		const gap = head > 0 ? 44 : 0;
		const countdownH = LABEL_PX + 6 + TIME_PX;
		let y = stage.y + Math.max(24, (stage.h - (head + gap + countdownH)) / 2);

		ctx.fillStyle = TEXT;
		ctx.font = font(700, title.px);
		for (const line of title.lines) {
			y += lineH;
			ctx.fillText(line, cx, y - Math.round(title.px * 0.22));
		}
		if (text.teacher) {
			y += 16 + TEACHER_PX;
			ctx.fillStyle = MUTED;
			ctx.font = font(500, TEACHER_PX);
			ctx.fillText(text.teacher, cx, y - 6);
		}
		if (head > 0) {
			const bar = ctx.createLinearGradient(cx - 40, 0, cx + 40, 0);
			bar.addColorStop(0, '#38bdf8');
			bar.addColorStop(1, '#4f46e5');
			ctx.fillStyle = bar;
			ctx.beginPath();
			ctx.roundRect(cx - 40, y + gap / 2 - 2, 80, 4, 2);
			ctx.fill();
			y += gap;
		}
		y += LABEL_PX;
		ctx.fillStyle = SOFT;
		ctx.font = font(500, LABEL_PX);
		ctx.fillText(text.startsIn, cx, y - 8);
		this.#timeY = y + 6 + TIME_PX - 24;
	}

	/** Paints the card showing `seconds` left, unless that is what the canvas already shows. */
	paint(ctx: Ctx, seconds: number): void {
		if (seconds === this.#shown) return;
		this.#shown = seconds;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.drawImage(this.#base, 0, 0);
		ctx.save();
		ctx.textAlign = 'center';
		ctx.textBaseline = 'alphabetic';
		ctx.fillStyle = TEXT;
		ctx.font = font(700, TIME_PX);
		ctx.fillText(formatCountdown(seconds), WIDTH / 2, this.#timeY);
		ctx.restore();
	}
}
