/**
 * A frame of the video is never drawn before the pictures of the page it shows
 * have loaded: the board is drawn (which starts loading the pictures of the
 * sheets in view), the draw waits until they have arrived, and draws again with
 * them. A picture that does not arrive in time is given up on, so its sheet
 * stays unpainted and the render goes on instead of hanging.
 */

/** How long one frame waits for the pictures of its page (the first read may need a cold storage link). */
export const PICTURE_WAIT_MS = 20_000;

/** The part of a picture cache the frame loop waits on. */
export type PictureWaiter = {
	settled(timeoutMs: number): Promise<boolean>;
};

/** Draws, and draws again once pictures that were still on their way have arrived. */
export async function drawWithPictures(
	pictures: PictureWaiter,
	draw: () => void,
	timeoutMs: number = PICTURE_WAIT_MS
): Promise<void> {
	draw();
	if (await pictures.settled(timeoutMs)) draw();
}
