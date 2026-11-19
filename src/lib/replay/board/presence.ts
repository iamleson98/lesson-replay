/**
 * What a board shows of the other people on it: a pointer and the stroke being
 * drawn (ephemeral, never stored), put back together from the updates received.
 * The live board's sync and the recording player replay the same updates.
 */

import { decodeElement, patchElement, type BoardElement, type Point } from './elements';

/** A participant who sent nothing for this long is no longer shown. */
export const PRESENCE_TTL_MS = 6_000;

export type RemotePresence = {
	cursor: Point | null;
	/** The element they are drawing right now. */
	preview: BoardElement | null;
	/** Which of their strokes `preview` is (its updates carry it). */
	stroke?: number;
	/** The element `preview` is an edit of: hidden from the board while it is shown. */
	target?: string;
	at: number;
};

/**
 * A pointer and what is being drawn, as sent. A stroke's `preview` holds
 * the points from index `from` on (earlier ones were sent before) and the
 * stroke's number `sid`; any other element is sent whole.
 */
export type PresencePayload = {
	cursor?: [number, number] | null;
	preview?:
		| (Record<string, unknown> & { from?: number; sid?: number; ref?: string; set?: unknown })
		| null;
};

/**
 * Applies a pointer update to what is shown of that person (null: they left
 * the board). A stroke's points are appended to the ones received; one
 * received from its middle (an update was lost, or this viewer just came)
 * continues what is shown, and the finished element replaces it all.
 * Shared with the recording player, which replays the same updates.
 */
export function applyPresence(
	prev: RemotePresence | undefined,
	payload: PresencePayload,
	at: number,
	element?: (id: string) => BoardElement | null
): RemotePresence | null {
	const cursor =
		Array.isArray(payload.cursor) && payload.cursor.length === 2
			? { x: Number(payload.cursor[0]), y: Number(payload.cursor[1]) }
			: null;
	const raw = payload.preview;
	if (!cursor && !raw) return null;
	const stroke = raw && typeof raw.sid === 'number' ? raw.sid : undefined;
	const target = raw && typeof raw.ref === 'string' ? raw.ref : undefined;
	return { cursor, preview: mergePreview(prev, raw, element), stroke, target, at };
}

function mergePreview(
	prev: RemotePresence | undefined,
	raw: PresencePayload['preview'],
	element?: (id: string) => BoardElement | null
): BoardElement | null {
	if (!raw) return null;
	if (typeof raw.ref === 'string') {
		const base = element?.(raw.ref);
		return base ? patchElement(base, raw.set) : null;
	}
	const from = typeof raw.from === 'number' && raw.from > 0 ? Math.floor(raw.from) : 0;
	const shown = prev?.preview;
	if (from > 0 && shown?.type === 'stroke' && prev?.stroke === raw.sid) {
		const points = Array.isArray(raw.points) ? raw.points : [];
		if (points.length === 0) return shown;
		const kept = shown.points.slice(0, Math.min(shown.points.length, from * 3));
		// An update without the stroke's look draws it as it was.
		return inkOnly(decodeElement({ ...shown, ...raw, points: kept.concat(points) })) ?? shown;
	}
	return inkOnly(decodeElement(raw));
}

/** A pointer's preview is ink in the making: a sheet or the view is never shown that way. */
const inkOnly = (el: BoardElement | null) =>
	el?.type === 'page' || el?.type === 'view' ? null : el;
