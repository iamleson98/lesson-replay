/**
 * The render token the page reads the recording with. It lives minutes: the
 * driver brings a fresh one after each heartbeat through
 * `window.__setRenderToken`, and every request reads the current one when it
 * is sent. Nothing here logs or stores the token.
 */

export type TokenHolder = {
	get(): string;
	set(token: string): void;
};

export function createTokenHolder(initial: string): TokenHolder {
	let current = initial;
	return {
		get: () => current,
		set: (token) => {
			if (typeof token === 'string' && token !== '') current = token;
		}
	};
}

/** What the page shows the driver. */
export type RenderStatus = {
	state: 'idle' | 'loading' | 'rendering' | 'done' | 'error';
	/** 0 to 1. */
	progress: number;
	/** Where the last stretch of the render spent its time: ms per bucket and event counts. */
	perf?: Record<string, number>;
};

declare global {
	interface Window {
		__setRenderToken?: (token: string) => void;
		__render?: RenderStatus;
	}
}

/** Puts the token setter and the status where the driver looks for them. */
export function exposeToDriver(win: Window, holder: TokenHolder, status: RenderStatus): void {
	win.__setRenderToken = (token) => holder.set(token);
	win.__render = status;
}
