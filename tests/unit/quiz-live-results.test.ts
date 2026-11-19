import { describe, expect, it } from 'vitest';
import { HideLiveResults } from '#lib/replay/quiz/live-results.svelte.js';

const memory = (initial?: string) => {
	const data = new Map<string, string>();
	if (initial !== undefined) data.set('quiz.hideLiveResults', initial);
	return {
		getItem: (k: string) => data.get(k) ?? null,
		setItem: (k: string, v: string) => void data.set(k, v),
		data
	};
};

describe('HideLiveResults', () => {
	it('is off by default: the live feel stays', () => {
		expect(new HideLiveResults(() => memory()).hidden).toBe(false);
	});

	it('remembers the choice on the device and reads it back', () => {
		const storage = memory();
		const first = new HideLiveResults(() => storage);
		first.toggle();
		expect(first.hidden).toBe(true);
		expect(storage.data.get('quiz.hideLiveResults')).toBe('1');
		expect(new HideLiveResults(() => storage).hidden).toBe(true);
		first.set(false);
		expect(new HideLiveResults(() => storage).hidden).toBe(false);
	});

	it('works without storage (a private window, blocked site data)', () => {
		const broken = () => {
			throw new Error('blocked');
		};
		const none = new HideLiveResults(() => ({ getItem: broken, setItem: broken }));
		expect(none.hidden).toBe(false);
		none.toggle();
		expect(none.hidden).toBe(true);
		expect(new HideLiveResults(() => undefined).hidden).toBe(false);
		const throwing = new HideLiveResults(broken);
		throwing.toggle();
		expect(throwing.hidden).toBe(true);
	});
});
