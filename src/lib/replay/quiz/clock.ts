/**
 * Time on the game's screens. The server's clock decides the deadline and the
 * local one only draws the bar: `offset` is the server's clock minus the
 * local one, sampled from the frames that carry `now`.
 */

/** Milliseconds until `endsAt` (the server's clock), never negative. */
export function remainingMs(endsAt: number, localNow: number, offset: number): number {
	return Math.max(0, endsAt - (localNow + offset));
}
