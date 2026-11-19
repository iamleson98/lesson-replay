/**
 * Whether the teacher hides the live results while a question is open. A
 * teacher often shares their screen in a live lesson, and the live bars, the
 * counts and the provisional ranking show which option is right before anyone
 * has been told. The choice is remembered on the device (localStorage, which a
 * private window or blocked site data may refuse: the game works without it)
 * and is off by default, because the live feel is half the fun.
 */

const KEY = 'quiz.hideLiveResults';

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

export class HideLiveResults {
	hidden = $state(false);
	#storage: () => Storage | undefined;

	constructor(storage: () => Storage | undefined = () => localStorage) {
		this.#storage = storage;
		try {
			this.hidden = this.#storage()?.getItem(KEY) === '1';
		} catch {
			// no storage: it starts off and is not remembered
		}
	}

	set(on: boolean): void {
		this.hidden = on;
		try {
			this.#storage()?.setItem(KEY, on ? '1' : '0');
		} catch {
			// a convenience only
		}
	}

	toggle(): void {
		this.set(!this.hidden);
	}
}

/** The device's one choice, shared by every screen of the host's question. */
export const hideLive = new HideLiveResults();
