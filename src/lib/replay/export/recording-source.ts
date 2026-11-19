/**
 * Reading a recording with the render token. This is not the signed-in app:
 * there is no session, so these calls carry a bearer (read from the holder
 * each time, since the driver swaps it after every heartbeat) and no cookies,
 * and the generated client's session handling stays out of it. The media files
 * are read by range, so a long lesson is never held whole; the API redirects a
 * file to storage, and the address it redirected to is used for the following
 * reads until it stops answering.
 */

import type { RecordingManifest } from '../types';
import { deckPageUrl, type Picture } from '../board/pictures.js';
import { readBoardLog, type BoardRecord } from '../player/board-replay.svelte';
import { perf } from './perf';
import { RenderError } from './render-error';
import type { TokenHolder } from './render-token';
import type { RecordingFile } from '../player/timeline';

export type RecordingAccess = {
	/** The API base, e.g. `/api/v4`. */
	api: string;
	recording: string;
	token: TokenHolder;
};

/** A request with the current token; a 401 is sent once more with the token as it is then. */
async function authorized(
	access: RecordingAccess,
	url: string,
	headers: Record<string, string> = {}
): Promise<Response> {
	const send = () =>
		fetch(url, {
			headers: { ...headers, Authorization: `Bearer ${access.token.get()}` },
			credentials: 'omit'
		});
	const res = await send();
	return res.status === 401 ? send() : res;
}

const recordingUrl = (access: RecordingAccess, path: string) =>
	`${access.api}/lms/recordings/${encodeURIComponent(access.recording)}${path}`;

export async function readManifest(access: RecordingAccess): Promise<RecordingManifest> {
	let manifest: RecordingManifest;
	try {
		const res = await authorized(access, recordingUrl(access, '/manifest'));
		if (!res.ok) throw new Error(`manifest ${res.status}`);
		manifest = (await res.json()) as RecordingManifest;
	} catch (err) {
		throw new RenderError('recording_unreadable', err);
	}
	if (
		!Array.isArray(manifest.files) ||
		typeof manifest.duration_ms !== 'number' ||
		manifest.duration_ms <= 0 ||
		typeof manifest.teacher_id !== 'string'
	) {
		throw new RenderError('recording_unreadable');
	}
	return manifest;
}

/**
 * Where the render page reads a page picture of an imported deck: the route the
 * player uses, under the render's API base, through the class the manifest names.
 */
export const renderDeckPageUrl =
	(access: RecordingAccess, classId: string) => (deck: string, n: number) =>
		deckPageUrl(access.api, classId, deck, n);

/**
 * Loads a deck page picture with the render token (never cookies); the API sends it on to
 * storage, which the fetch follows without the token. A page that cannot be read throws, and
 * its sheet stays unpainted instead of failing the render.
 */
export const deckPageLoader =
	(access: RecordingAccess) =>
	async (url: string): Promise<Picture> => {
		const res = await authorized(access, url);
		if (!res.ok) throw new Error(`deck page ${res.status}`);
		return createImageBitmap(await res.blob());
	};

/** The board log: from storage when the manifest says where, else as the recording's file. */
export async function readBoard(
	access: RecordingAccess,
	manifest: RecordingManifest,
	file: RecordingFile | null
): Promise<BoardRecord[]> {
	if (!file) return [];
	try {
		const direct = manifest.board_url;
		const res = direct
			? await fetch(direct, { credentials: 'omit' })
			: await authorized(access, recordingUrl(access, `/files/${file.index}`));
		if (!res.ok) throw new Error(`board log ${res.status}`);
		return await readBoardLog(await res.blob());
	} catch (err) {
		throw new RenderError('recording_unreadable', err);
	}
}

/** What a media source keeps cached: a whole screen cluster (up to ~15 MB) plus the read ahead. */
const SOURCE_CACHE_BYTES = 32 * 2 ** 20;

/** A media file as a mediabunny source: ranged reads, the size from the manifest. */
export function fileSource(
	MB: typeof import('mediabunny'),
	access: RecordingAccess,
	file: RecordingFile
): InstanceType<typeof import('mediabunny').StreamSource> {
	const url = recordingUrl(access, `/files/${file.index}`);
	/** Where the API sent the last read, while that address keeps answering. */
	let direct: string | null = null;

	const get = async (target: string, range: string, withToken: boolean) =>
		withToken
			? authorized(access, target, { Range: range })
			: fetch(target, { headers: { Range: range }, credentials: 'omit' });

	const body = async (res: Response, start: number, end: number) => {
		const bytes = new Uint8Array(await res.arrayBuffer());
		perf.add('reads', 1);
		perf.add('bytes', bytes.length);
		// An answer with the whole file ignored the range.
		return res.status === 206 ? bytes : bytes.subarray(start, end);
	};

	return new MB.StreamSource({
		// A screen's cluster can reach 15 MB (keyframes come only on request): keep it whole, and read ahead.
		prefetchProfile: 'network',
		maxCacheSize: SOURCE_CACHE_BYTES,
		getSize: () => file.size,
		read: async (start: number, end: number) => {
			const last = Math.min(end, file.size) - 1;
			const range = `bytes=${start}-${last}`;
			if (direct) {
				try {
					const res = await get(direct, range, false);
					if (res.ok) return body(res, start, last + 1);
				} catch {
					// the address ran out: ask the API again
				}
				direct = null;
			}
			const res = await get(url, range, true);
			if (!res.ok)
				throw new RenderError('recording_unreadable', new Error(`file ${res.status}`));
			if (res.redirected && new URL(res.url, location.href).origin !== location.origin) {
				direct = res.url;
			}
			return body(res, start, last + 1);
		}
	});
}
