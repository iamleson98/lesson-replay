/**
 * Draws one sheet of the board: white paper with an edge, and the picture of
 * its deck page fitted inside it. While the picture is on its way the sheet
 * shows a ring, and when it cannot be had a crossed frame, so a sheet is never
 * confused with an empty one. Paper stays white on a dark board: slides are
 * made for it.
 */

import type { PageElement } from './elements';
import type { PictureState } from './pictures';
import type { BoardTheme } from './render';

export function drawSheet(
	ctx: CanvasRenderingContext2D,
	el: PageElement,
	picture: PictureState | null,
	theme: BoardTheme,
	zoom: number
): void {
	ctx.save();
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(el.x, el.y, el.w, el.h);
	if (picture?.status === 'ready') {
		const { image } = picture;
		const scale = Math.min(el.w / image.width, el.h / image.height);
		const w = image.width * scale;
		const h = image.height * scale;
		ctx.drawImage(image, el.x + (el.w - w) / 2, el.y + (el.h - h) / 2, w, h);
	} else if (picture) {
		drawMark(ctx, el, picture.status);
	}
	ctx.strokeStyle = theme === 'light' ? 'rgba(15, 23, 42, 0.28)' : 'rgba(226, 232, 240, 0.4)';
	// The edge stays visible when the board is zoomed far out.
	ctx.lineWidth = Math.max(2, 1.5 / zoom);
	ctx.strokeRect(el.x, el.y, el.w, el.h);
	ctx.restore();
}

/** A ring while the picture loads, a crossed frame when it cannot be shown. */
function drawMark(ctx: CanvasRenderingContext2D, el: PageElement, status: 'loading' | 'failed') {
	const cx = el.x + el.w / 2;
	const cy = el.y + el.h / 2;
	const r = Math.min(el.w, el.h) / 10;
	ctx.strokeStyle = '#94a3b8';
	ctx.lineWidth = r / 5;
	ctx.lineCap = 'round';
	ctx.beginPath();
	if (status === 'loading') {
		ctx.arc(cx, cy, r, 0, Math.PI * 1.5);
	} else {
		ctx.rect(cx - r, cy - r, r * 2, r * 2);
		ctx.moveTo(cx - r, cy - r);
		ctx.lineTo(cx + r, cy + r);
		ctx.moveTo(cx + r, cy - r);
		ctx.lineTo(cx - r, cy + r);
	}
	ctx.stroke();
}
