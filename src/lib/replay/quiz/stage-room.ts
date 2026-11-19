import type { QuizGame } from './game.svelte';

/**
 * What the game's screens read from the room that shows them: the live room, or a
 * recording's replay (which has no one to answer and keeps time on its own clock).
 * The live room satisfies it as it is.
 */
export interface StageRoom {
	readonly game: QuizGame;
	readonly host: boolean;
	/** The server's clock minus this one's, for the countdown. */
	readonly clockOffset: number;
	answer(mask: number): boolean;
	/** The clock the countdown follows; the local one when absent. */
	now?: () => number;
}
