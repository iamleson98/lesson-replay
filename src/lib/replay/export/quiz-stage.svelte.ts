/**
 * The quiz game of a lesson as the render follows it: the player's own replay
 * state (`QuizReplay`), read, anonymised (an empty name is a student who is not
 * in the recording) and timed exactly as the player does, moved frame by frame
 * with the render's clock. The screens that show it are the player's own,
 * mounted by `quiz-dom.svelte.ts`.
 */

import { QuizReplay, type QuizRecord } from '../player/quiz-replay.svelte';

export class QuizStageSource {
	/** The game's state; its clock is the render's, so a mounted stage follows `seek`. */
	readonly replay: QuizReplay;
	#time = $state(0);

	constructor(records: QuizRecord[]) {
		this.replay = new QuizReplay(records, () => this.#time);
	}

	/** The lesson had a game in it. */
	get has(): boolean {
		return this.replay.has;
	}

	/** A game is on the stage (it began and has not ended). */
	get on(): boolean {
		return this.replay.on;
	}

	/** Moves to `time` (ms into the recording); only forwards in a render. */
	seek(time: number): void {
		this.#time = time;
		this.replay.seek(time);
	}

	/** Lets go of the game's timers. */
	dispose(): void {
		this.replay.game.dispose();
	}
}
