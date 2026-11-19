/**
 * The replay's own strings (Svelte 5 runes), so the folder needs nothing of the
 * app around it. The host sets the language with `use`: the app follows its own
 * language, the render page the worker's `?lang=`. Vietnamese is bundled and
 * the fallback; English loads on demand. A language the folder has no
 * dictionary for shows Vietnamese.
 */
import { vi } from './vi';

export const REPLAY_LOCALES = ['vi', 'en'] as const;
export type ReplayLocale = (typeof REPLAY_LOCALES)[number];
export const DEFAULT_REPLAY_LOCALE: ReplayLocale = 'vi';

type Dictionary = Record<string, string>;

/** Every language's dictionary; the default's is bundled, the others load on demand. */
export const REPLAY_DICTIONARIES: Record<ReplayLocale, () => Promise<Dictionary>> = {
	vi: async () => vi,
	en: async () => (await import('./en')).en
};

export const isReplayLocale = (value: unknown): value is ReplayLocale =>
	typeof value === 'string' && (REPLAY_LOCALES as readonly string[]).includes(value);

/** Values for a translation's `{name}` placeholders. */
export type TranslationParams = Record<string, string | number>;

class ReplayStrings {
	locale = $state<ReplayLocale>(DEFAULT_REPLAY_LOCALE);
	/** The loaded dictionaries (the default's always). */
	#loaded = $state.raw<Partial<Record<ReplayLocale, Dictionary>>>({
		[DEFAULT_REPLAY_LOCALE]: vi
	});
	#latest: ReplayLocale = DEFAULT_REPLAY_LOCALE;

	/** Shows the language once its dictionary is loaded; the last call wins when several overlap. */
	async use(locale: string): Promise<void> {
		const wanted = isReplayLocale(locale) ? locale : DEFAULT_REPLAY_LOCALE;
		this.#latest = wanted;
		if (!this.#loaded[wanted])
			this.#loaded = { ...this.#loaded, [wanted]: await REPLAY_DICTIONARIES[wanted]() };
		if (this.#latest === wanted) this.locale = wanted;
	}

	t(key: string, params?: TranslationParams): string {
		const text =
			this.#loaded[this.locale]?.[key] ?? this.#loaded[DEFAULT_REPLAY_LOCALE]?.[key] ?? key;
		return params ? interpolate(text, params) : text;
	}
}

/** Fills every `{name}` that params has; other braces stay as written. */
function interpolate(text: string, params: TranslationParams): string {
	return text.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
		Object.hasOwn(params, name) ? String(params[name]) : placeholder
	);
}

export const replayStrings = new ReplayStrings();

/** Reactive translate helper: safe in templates and in `.svelte.ts` modules. */
export function t(key: string, params?: TranslationParams): string {
	return replayStrings.t(key, params);
}
