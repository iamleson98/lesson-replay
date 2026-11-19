/**
 * The sink: where the render sends its output, a local server of the worker.
 * Parts go as `POST {sink}/part/{n}` (octet-stream, n from 1), awaited one by
 * one; the end is `POST {sink}/done` with the totals or `POST {sink}/error`
 * with a code of the closed list. Nothing here carries a token or free text.
 */

import { RenderError, type RenderErrorCode } from './render-error';

export type RenderTotals = { parts: number; bytes: number; durationMs: number; frames: number };

export type Sink = {
	part(n: number, body: Uint8Array): Promise<void>;
	done(totals: RenderTotals): Promise<void>;
	/** Best effort: a failure to report a failure changes nothing. */
	error(code: RenderErrorCode): Promise<void>;
};

export function createSink(base: string): Sink {
	const root = base.replace(/\/+$/, '');
	const post = async (path: string, body: BodyInit, type: string) => {
		const res = await fetch(`${root}${path}`, {
			method: 'POST',
			headers: { 'Content-Type': type },
			body,
			credentials: 'omit'
		});
		if (!res.ok) throw new Error(`sink ${res.status}`);
	};
	return {
		async part(n, body) {
			try {
				await post(`/part/${n}`, body as BodyInit, 'application/octet-stream');
			} catch (err) {
				throw new RenderError('sink_failed', err);
			}
		},
		async done(totals) {
			try {
				await post('/done', JSON.stringify(totals), 'application/json');
			} catch (err) {
				throw new RenderError('sink_failed', err);
			}
		},
		async error(code) {
			try {
				await post('/error', JSON.stringify({ code }), 'application/json');
			} catch {
				// nothing more can be done
			}
		}
	};
}
