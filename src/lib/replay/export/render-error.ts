/**
 * What the driver is told when a render fails: one code of a closed list, never
 * free text (a message could carry a token or a name).
 */

export const RENDER_ERROR_CODES = [
	'recording_unreadable',
	'unsupported_browser',
	'decode_failed',
	'encode_failed',
	'sink_failed',
	'render_failed'
] as const;

export type RenderErrorCode = (typeof RENDER_ERROR_CODES)[number];

export class RenderError extends Error {
	readonly code: RenderErrorCode;

	constructor(code: RenderErrorCode, cause?: unknown) {
		super(code, { cause });
		this.name = 'RenderError';
		this.code = code;
	}
}

/** The code to report for anything thrown: a `RenderError` keeps its own, the rest take `fallback`. */
export function renderCode(
	err: unknown,
	fallback: RenderErrorCode = 'render_failed'
): RenderErrorCode {
	return err instanceof RenderError ? err.code : fallback;
}

/** Runs `step`; whatever it throws that is not already a `RenderError` becomes one with `code`. */
export async function within<T>(code: RenderErrorCode, step: () => Promise<T> | T): Promise<T> {
	try {
		return await step();
	} catch (err) {
		throw err instanceof RenderError ? err : new RenderError(code, err);
	}
}
