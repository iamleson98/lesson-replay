/**
 * The Quest game of a recording, at any moment of it: the state the host's
 * Quest screen keeps (`QuestGame`), fed from the recorded frames. Like
 * `QuizReplay`, playing forward applies what came since, and seeking back
 * starts again. Loaded only for a recording that has a Quest game.
 */

import { QuestGame } from '../quiz/quest/quest-game.svelte.js';
import { decodeQuestFrame, type Row } from '../quiz/quest/quest-protocol.js';
import { anonymize, named, type QuizRecord } from './quiz-replay.svelte.js';

const fresh = () => new QuestGame({ send: () => false });

export class QuestReplay {
	/** Quest's state at the current time; replaced by a fresh one when the player seeks back. */
	game = $state.raw(fresh());

	#records: QuizRecord[];
	#next = 0;
	#time = -1;

	constructor(records: QuizRecord[]) {
		this.#records = records;
	}

	/** Shows the game as it was at `time` (ms into the recording). */
	seek(time: number): void {
		if (time < this.#time) {
			this.game.dispose();
			this.game = fresh();
			this.#next = 0;
		}
		this.#time = time;
		while (this.#next < this.#records.length && this.#records[this.#next].t <= time) {
			this.#apply(this.#records[this.#next++].frame);
		}
	}

	#apply(raw: QuizRecord['frame']) {
		const frame = named(raw);
		switch (frame.type) {
			case 'quest': {
				const decoded = decodeQuestFrame(frame.frame);
				if (!decoded) return;
				if (decoded.type === 'board' || decoded.type === 'standings') {
					this.game.apply({ ...decoded, top: anonymize<Row>(decoded.top) });
				} else this.game.apply(decoded);
				return;
			}
			case 'idle':
			case 'count':
			case 'podium':
			case 'ended':
			case 'error':
				this.game.apply(frame);
		}
	}
}
