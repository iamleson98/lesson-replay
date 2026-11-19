/**
 * The state of the room's game, as the socket's frames tell it (the view
 * model). Every frame is applied by `apply`; the screens only read. The
 * server decides the phase and the deadline, so nothing here keeps time:
 * the question carries its `endsAt` and the clock offset corrects the
 * local clock.
 */

import type { EndReason, ErrorCode, QuestionKind, ScoreLine, ServerFrame } from './protocol';

export type Phase = 'none' | 'lobby' | 'question' | 'reveal' | 'podium';

export type Question = {
	q: number;
	count: number;
	endsAt: number;
	kind: QuestionKind;
	text: string;
	options: string[];
	/** The time limit as first seen (ms): what the timer bar is a fraction of. */
	limitMs: number;
};

type Reveal = {
	q: number;
	correct: number;
	counts: number[];
	explanation: string | null;
	top: ScoreLine[];
	personal?: NonNullable<Extract<ServerFrame, { type: 'reveal' }>['personal']>;
};

export type Podium = { top: ScoreLine[]; me?: { score: number; rank: number }; all?: ScoreLine[] };

/** Which client frame a refusal answers (`request` of an error frame). */
const REQUEST = { start: 1, next: 2, end: 3, answer: 4 } as const;

/**
 * The reveal is staged from the one frame, in time: at once the verdict (the
 * right tiles, a player's result), after 0.8 s the distribution and the
 * explanation, after 1.8 s the ranking. The stages are timing, not motion, so
 * reduced motion keeps them.
 */
const REVEAL_STAGE_MS = [0, 800, 1800] as const;
type RevealStage = 0 | 1 | 2;

/** The frames that move the game to a new phase. */
const MOVES = new Set<ServerFrame['type']>([
	'idle',
	'lobby',
	'question',
	'reveal',
	'podium',
	'ended'
]);

export class QuizGame {
	phase = $state<Phase>('none');
	/** The open question has closed and its reveal is on the way (the suspense beat). */
	closing = $state(false);
	/** How much of the reveal is shown (see REVEAL_STAGE_MS). */
	stage = $state<RevealStage>(2);
	#timers: ReturnType<typeof setTimeout>[] = [];
	/** Whether a reveal is shown in its timed stages (live), or whole at once (a recording's replay, which has no beat to wait for). */
	readonly #staged: boolean;
	title = $state('');
	questionCount = $state(0);
	players = $state(0);
	/** The host's count of answers to the open question. */
	answered = $state(0);
	/** Host: players who chose each option so far, as the service reports them (about twice a second). */
	counts = $state.raw<number[]>([]);
	/** Host: the provisional top ten of the open question (every answer scored on arrival). */
	ranking = $state.raw<ScoreLine[]>([]);
	/** The top five as of the last reveal, kept through the next question. */
	standings = $state.raw<ScoreLine[]>([]);
	/** Player: their total score as of the last reveal. */
	score = $state(0);
	/** Host: who has joined (the service reports newcomers; leavers are not reported). */
	joined = $state.raw<string[]>([]);
	/** Player: consecutive fully-correct answers, as the server counts them at each reveal. */
	streak = $state(0);
	/** Player: the rank at this reveal and at the one before (0 when unknown). */
	rank = $state(0);
	prevRank = $state(0);
	/** The top five of the reveal before this one (empty for the first). */
	prevTop = $state.raw<ScoreLine[]>([]);

	question = $state.raw<Question | null>(null);
	/** The options this player chose (null before answering). */
	myMask = $state<number | null>(null);
	/** The server has the answer (an ack, or it came back with a resumed socket). */
	locked = $state(false);
	/** The server refused this player's answer to the open question (late, or closed). */
	refused = $state(false);
	reveal = $state.raw<Reveal | null>(null);
	podium = $state.raw<Podium | null>(null);
	/** Why the last game ended; null while one runs or before any. */
	endedReason = $state<EndReason | null>(null);
	/** The last refusal of a host command (start, next, end), for the screen to explain. */
	commandError = $state<{ code: ErrorCode; request: number } | null>(null);

	constructor(options: { staged?: boolean } = {}) {
		this.#staged = options.staged ?? true;
	}

	get active(): boolean {
		return this.phase !== 'none';
	}

	apply(frame: ServerFrame): void {
		// A refusal belongs to the phase it came in: the next phase frame clears it.
		if (MOVES.has(frame.type)) this.commandError = null;
		switch (frame.type) {
			case 'idle':
				this.#clear();
				break;
			case 'lobby':
				this.#clear();
				this.phase = 'lobby';
				this.title = frame.title;
				this.questionCount = frame.questions;
				this.players = frame.players;
				this.endedReason = null;
				break;
			case 'question': {
				const again = this.question?.q === frame.q && this.phase === 'question';
				this.question = {
					q: frame.q,
					count: frame.count,
					endsAt: frame.endsAt,
					kind: frame.kind,
					text: frame.text,
					options: frame.options,
					limitMs:
						again && this.question ? this.question.limitMs : frame.endsAt - frame.now
				};
				if (!again) {
					this.answered = 0;
					this.counts = [];
					this.ranking = [];
				}
				// A player's question with `mine` is the service's state after a (re)connect, the first
				// frame on that socket, so nothing sent on it can be newer: it decides. An answer it
				// does not have was lost with the old socket, and the player may answer again.
				const mine = frame.mine;
				const resumed = mine !== undefined;
				this.myMask = mine ? mine : !resumed && again ? this.myMask : null;
				this.locked = !!mine || (!resumed && again && this.locked);
				this.refused = again && this.refused;
				this.reveal = null;
				this.podium = null;
				this.phase = 'question';
				this.closing = false;
				this.#cancelStages();
				this.endedReason = null;
				break;
			}
			case 'count':
				this.players = frame.players;
				break;
			case 'progress':
				this.answered = frame.answered;
				this.players = frame.players;
				if (frame.counts) this.counts = frame.counts;
				if (frame.ranking) this.ranking = frame.ranking;
				break;
			case 'names':
				this.joined = [...this.joined, ...frame.names];
				break;
			case 'closed':
				if (this.phase === 'question' && this.question?.q === frame.q) this.closing = true;
				break;
			case 'reveal':
				this.#track(frame);
				this.closing = false;
				this.#stageReveal();
				this.reveal = {
					q: frame.q,
					correct: frame.correct,
					counts: frame.counts,
					explanation: frame.explanation,
					top: frame.top,
					personal: frame.personal
				};
				this.phase = 'reveal';
				break;
			case 'podium':
				this.podium = { top: frame.top, me: frame.me, all: frame.all };
				this.phase = 'podium';
				this.#cancelStages();
				break;
			case 'ended':
				this.#clear();
				this.endedReason = frame.reason;
				break;
			case 'ack':
				this.locked = true;
				break;
			case 'error':
				if (frame.request === REQUEST.answer) {
					// Joined after the question opened, or it closed: not this one. An answer the
					// service has already confirmed stands (a double tap is refused, not undone).
					if (frame.code === 5 && !this.locked) {
						this.refused = true;
						this.myMask = null;
						this.locked = false;
					}
				} else {
					this.commandError = { code: frame.code, request: frame.request };
				}
				break;
		}
	}

	#lastTop: ScoreLine[] = [];

	/** The streak and the rank movement a reveal brings, against the reveal before. */
	#track(frame: Extract<ServerFrame, { type: 'reveal' }>) {
		this.prevTop = this.#lastTop;
		this.#lastTop = frame.top;
		this.standings = frame.top;
		const me = frame.personal;
		if (!me) return;
		this.streak = me.streak;
		this.score = me.score;
		if (me.rank > 0) {
			this.prevRank = this.rank;
			this.rank = me.rank;
		}
	}

	/** Stops the reveal's staging timers; the room calls it when it is done with the game. */
	dispose(): void {
		this.#timers.forEach(clearTimeout);
		this.#timers = [];
	}

	/** Shows the rest of the reveal now (the host chose to, or a resumed screen has no beat to wait for). */
	skipStages(): void {
		this.#cancelStages();
		this.stage = 2;
	}

	#stageReveal() {
		this.#cancelStages();
		if (!this.#staged) return;
		this.stage = 0;
		REVEAL_STAGE_MS.forEach((ms, i) => {
			if (i === 0) return;
			this.#timers.push(setTimeout(() => (this.stage = i as RevealStage), ms));
		});
	}

	#cancelStages() {
		this.#timers.forEach(clearTimeout);
		this.#timers = [];
		this.stage = 2;
	}

	/** The question a resumed socket never saw (a reveal arrives first), from where it was kept. */
	restore(question: Question): void {
		if (!this.question && this.phase === 'reveal' && this.reveal?.q === question.q) {
			this.question = question;
		}
	}

	/** This player picked these options (before the server's ack). */
	choose(mask: number): void {
		this.myMask = mask;
		this.locked = false;
		this.refused = false;
	}

	#clear() {
		this.phase = 'none';
		this.closing = false;
		this.#cancelStages();
		this.question = null;
		this.reveal = null;
		this.podium = null;
		this.myMask = null;
		this.locked = false;
		this.refused = false;
		this.answered = 0;
		this.players = 0;
		this.title = '';
		this.questionCount = 0;
		this.counts = [];
		this.ranking = [];
		this.standings = [];
		this.score = 0;
		this.joined = [];
		this.streak = 0;
		this.rank = 0;
		this.prevRank = 0;
		this.prevTop = [];
		this.#lastTop = [];
	}
}
