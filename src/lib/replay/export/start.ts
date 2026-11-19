/**
 * What the render page does when it opens: read its inputs from the URL
 * fragment (never sent to any server), hand the driver its two handles
 * (`window.__render` and `window.__setRenderToken`) before anything else, and
 * run the exporter, which is loaded only now. The fragment is wiped from the
 * address once read, and nothing here writes a token anywhere.
 */

import { isReplayLocale, replayStrings, type ReplayLocale } from '../i18n/strings.svelte';
import { cardInputs, type CardInputs } from './card';
import { createTokenHolder, exposeToDriver, type RenderStatus } from './render-token';
import { createSink } from './sink';

export const DEFAULT_API = '/api/v4';
export const DEFAULT_SINK = '/__sink';

export type RenderParams = {
	api: string;
	token: string;
	recording: string;
	request: string;
	sink: string;
	/** The countdown card before the lesson (`prerollMs` 0: none, the video starts with the lesson). */
	card: CardInputs;
};

/** Where the output goes, even when the rest of the inputs are wrong (so the failure can be told). */
export const fragmentSink = (hash: string): string =>
	new URLSearchParams(hash.replace(/^#/, '')).get('sink') || DEFAULT_SINK;

/** The page's inputs from `location.hash`; null when the recording or the token is missing. */
export function parseFragment(hash: string): RenderParams | null {
	const q = new URLSearchParams(hash.replace(/^#/, ''));
	const token = q.get('token') ?? '';
	const recording = q.get('recording') ?? '';
	if (!token || !recording) return null;
	return {
		api: (q.get('api') || DEFAULT_API).replace(/\/+$/, ''),
		token,
		recording,
		request: q.get('request') ?? '',
		sink: fragmentSink(hash),
		card: cardInputs(q)
	};
}

/** The language of the game's screens: `?lang=` of the page's address (the worker sends the recording's), English when absent or unknown. */
export function renderLocale(search: string): ReplayLocale {
	const lang = new URLSearchParams(search).get('lang');
	return isReplayLocale(lang) ? lang : 'en';
}

export async function startRender(win: Window): Promise<void> {
	const holder = createTokenHolder('');
	const status: RenderStatus = { state: 'idle', progress: 0 };
	exposeToDriver(win, holder, status);

	const hash = win.location.hash;
	const params = parseFragment(hash);
	if (!params) {
		status.state = 'error';
		await createSink(fragmentSink(hash)).error('render_failed');
		return;
	}
	holder.set(params.token);
	// The game's screens speak the language the worker asks for (a scoreboard's anonymous name too).
	await replayStrings.use(renderLocale(win.location.search));
	const { runRender } = await import('./exporter');
	await runRender({ ...params, token: holder }, status);
}
