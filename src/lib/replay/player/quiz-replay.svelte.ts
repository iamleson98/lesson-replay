/**
 * The quiz game of a recording, at any moment of it. The server logged the
 * quiz service's host frames beside the board (`k: "quiz"`, `t` on the
 * recording's clock, `q` the frame as the service sent it), so the stage plays
 * them back through the same state the live room uses (`QuizGame`). Playing
 * forward applies the frames since the last position; seeking back starts a
 * fresh game and applies everything up to the new time (about 500 frames per
 * game).
 *
 * Frames carry the service's clock, which means nothing here: a question's
 * deadline is rebased to the recording's own time (`t + (endsAt - now)`, both
 * from the same frame) so the countdown follows the player's clock, pause and
 * seeks included.
 *
 * The server blanks the name of anyone who is not a student of the class (a
 * guest of the game); those show as "A student".
 */

import { QuizGame } from '../quiz/game.svelte.js';
import { decodeFrame, type ScoreLine, type ServerFrame } from '../quiz/protocol.js';
import type { StageRoom } from '../quiz/stage-room.js';
import { t } from '../i18n/strings.svelte';
import type { BoardRecord } from './board-replay.svelte.js';

export type QuizRecord = { t: number; frame: ServerFrame };

/** Whether a frame ends the game on the stage (the board comes back). */
const endsStage = (f: ServerFrame) => f.type === 'idle' || f.type === 'ended';

/** A frame only a game sends: a lobby, a question, or Quest's lobby or running frame. */
const isPlay = (f: ServerFrame) =>
	f.type === 'lobby' ||
	f.type === 'question' ||
	(f.type === 'quest' && (f.code === 20 || f.code === 22));

/** The frame with its deadline on the recording's clock (question `[2, now, q, count, endsAt, ...]`, Quest running `[22, now, endsAt]`). */
function rebase(f: unknown[], at: number): unknown[] {
	const now = f[1];
	if (typeof now !== 'number') return f;
	const end = f[0] === 2 ? 4 : f[0] === 22 ? 2 : -1;
	const endsAt = end > 0 ? f[end] : undefined;
	if (typeof endsAt !== 'number') return f;
	const out = [...f];
	out[1] = at;
	out[end] = at + (endsAt - now);
	return out;
}

/** The quiz frames of a board log, decoded, in time order; what is not a frame of the protocol is skipped. */
export function quizRecords(records: BoardRecord[]): QuizRecord[] {
	const out: QuizRecord[] = [];
	for (const r of records) {
		if (r.k !== 'quiz' || !Array.isArray(r.q)) continue;
		const frame = decodeFrame(JSON.stringify(rebase(r.q, r.t)));
		if (frame) out.push({ t: r.t, frame });
	}
	return out;
}

/** An empty name is a student who is not in the recording: the same line with the neutral name. */
export const anonymize = <L extends { name: string }>(lines: L[]): L[] =>
	lines.some((l) => l.name === '')
		? lines.map((l) => (l.name === '' ? { ...l, name: t('replay.quiz.student') } : l))
		: lines;

export function named(frame: ServerFrame): ServerFrame {
	switch (frame.type) {
		case 'reveal':
			return { ...frame, top: anonymize<ScoreLine>(frame.top) };
		case 'podium':
			return {
				...frame,
				top: anonymize(frame.top),
				...(frame.all ? { all: anonymize(frame.all) } : {})
			};
		case 'progress':
			return frame.ranking ? { ...frame, ranking: anonymize(frame.ranking) } : frame;
		default:
			return frame;
	}
}

export class QuizReplay implements StageRoom {
	readonly records: QuizRecord[];
	/** The race's state at the current time; replaced by a fresh one when the player seeks back. */
	game = $state.raw(new QuizGame({ staged: false }));
	/** Which game the stage shows: the class-paced race, or the self-paced Quest. */
	mode = $state<'race' | 'quest'>('race');
	/** A Quest game is on (from its first frame to the end frame). */
	questOn = $state(false);
	readonly host = true;
	readonly clockOffset = 0;
	/** The deadlines are on the recording's clock. */
	readonly now: () => number;

	#next = 0;
	#time = -1;

	constructor(records: QuizRecord[], now: () => number) {
		this.records = records;
		this.now = now;
	}

	/** The recording has a game in it: the service also says "nothing running" to anyone who only opened the quiz page. */
	get has(): boolean {
		return this.records.some(({ frame }) => isPlay(frame));
	}

	/** A game is on the stage now: it began and has not ended. */
	get on(): boolean {
		return this.mode === 'quest' ? this.questOn : this.game.active;
	}

	/** Nobody answers in a recording. */
	answer(): boolean {
		return false;
	}

	/** Shows the game as it was at `time` (ms into the recording). */
	seek(time: number): void {
		if (time < this.#time) {
			this.game.dispose();
			this.game = new QuizGame({ staged: false });
			this.mode = 'race';
			this.questOn = false;
			this.#next = 0;
		}
		this.#time = time;
		while (this.#next < this.records.length && this.records[this.#next].t <= time) {
			this.#apply(named(this.records[this.#next++].frame));
		}
	}

	/** The room's routing: Quest's frames make it Quest, the race's lobby or an end make it the race. */
	#apply(frame: ServerFrame) {
		if (frame.type === 'quest') {
			this.mode = 'quest';
			this.questOn = true;
			return;
		}
		if (frame.type === 'lobby') this.#endQuest();
		else if (endsStage(frame)) this.#endQuest();
		else if (this.mode === 'quest') return;
		this.game.apply(frame);
	}

	#endQuest() {
		this.mode = 'race';
		this.questOn = false;
	}
}
