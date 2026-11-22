/**
 * The error of a failed still of the quiz screens: one code, never free text
 * (a message could carry a name).
 */

export type RenderErrorCode = 'render_failed';

export class RenderError extends Error {
	readonly code: RenderErrorCode;

	constructor(code: RenderErrorCode, cause?: unknown) {
		super(code, { cause });
		this.name = 'RenderError';
		this.code = code;
	}
}

/** Runs `step`; whatever it throws that is not already a `RenderError` becomes one with `code`. */
export async function within<T>(code: RenderErrorCode, step: () => Promise<T> | T): Promise<T> {
	try {
		return await step();
	} catch (err) {
		throw err instanceof RenderError ? err : new RenderError(code, err);
	}
}
