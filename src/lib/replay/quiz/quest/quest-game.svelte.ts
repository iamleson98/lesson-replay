/**
 * The state of a Quest game, as the socket's frames tell it (the view model of
 * the Quest screens; the race's is `../game.svelte.ts`). Every frame is applied
 * by `apply`; the screens only read. Pure and injectable: the timers, the
 * clock and the way frames are sent are parameters, so a test drives a whole
 * game with fake timers.
 *
 * A player's own loop (question, verdict, chests, outcome, the next question)
 * is shown in order, paced here and not by the network:
 * - a verdict and a chest result are held for a short suspense beat (timing
 *   only, no motion) before they are shown, as the race's reveal is;
 * - after a wrong answer the right answer and the explanation stay for the
 *   server's pause, after a chest the outcome card for a moment (the player
 *   may move on sooner), and the next question, which the server has already
 *   served, waits for that. Its own clock keeps running from the frame's
 *   arrival, so the wait costs the player thinking time, never extends it.
 * Everything else (events, standings, the board, the count) shows at once.
 */

import { SvelteMap } from 'svelte/reactivity';
import type { EndReason, ErrorCode, ScoreLine } from '../protocol';
import {
	decodeQuestFrame,
	encodeCharacter,
	encodeNextQuestion,
	encodePick,
	encodeQuestAnswer,
	type ChestKind,
	type ChestShown,
	type QuestFrame,
	type QuestInput,
	type Row
} from './quest-protocol';

type QuestPhase = 'none' | 'lobby' | 'running' | 'podium';

/** What a player's main region shows. */
type QuestScreen = 'wait' | 'question' | 'pause' | 'chests' | 'outcome';

/** The suspense before a verdict or a chest result is shown (ms). */
export const BEAT_MS = 700;
/** How long the outcome card holds the screen before the next question (ms); the player may skip it. */
export const OUTCOME_MS = 2200;
/** How long a personal event (a steal, a block, the booster ending) stays up (ms). */
export const BANNER_MS = 3500;
/** A player with nothing on screen asks the server for their question after this long (ms). */
export const WAIT_RETRY_MS = 4000;
/** An answer refused while more than this is left of the question's time was refused as too quick, not too late (ms). */
const OPEN_MARGIN_MS = 250;

/** The request numbers of Quest's client frames, as an error frame names them. */
export const QUEST_REQUEST = {
	start: 1,
	next: 2,
	end: 3,
	character: 5,
	answer: 6,
	pick: 7,
	again: 8
} as const;

export type QuestQuestion = {
	serial: number;
	kind: 0 | 1 | 2;
	text: string;
	options: string[];
	limitMs: number;
	/** When it closes, on THIS clock (from the frame's arrival and the time it said was left). */
	endsAt: number;
};

type Verdict =
	| { right: true; earned: number; streak: number; bonus: number; boosterLeft: number }
	| {
			right: false;
			missed: boolean;
			correctMask: number;
			pauseMs: number;
			explanation: string | null;
	  };

export type Outcome = {
	picked: number;
	kind: ChestKind;
	amount: number;
	chests: [ChestShown, ChestShown, ChestShown];
	victim: string | null;
	blocked: boolean;
};

export type Banner =
	| { id: number; kind: 'stolen'; thief: string; amount: number }
	| { id: number; kind: 'blocked'; thief: string }
	| { id: number; kind: 'boosterEnded' };

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

export type Podium = { top: ScoreLine[]; me?: { score: number; rank: number }; all?: ScoreLine[] };

export type QuestBoard = {
	top: Row[];
	players: number;
	answers: number;
	correct: number;
};

type QuestDeps = {
	/** Sends an encoded frame; false when the socket is not open. */
	send: (frame: string) => boolean;
};

type Held = {
	frame: QuestFrame & { type: 'question' | 'right' | 'wrong' | 'chest' };
	at: number;
	/** Arrival order among the frames that carry the player's coins. */
	seq: number;
};

/** The frames that move the game to a new phase. */
const MOVES = new Set<QuestInput['type']>(['idle', 'lobby', 'running', 'podium', 'ended']);

export class QuestGame {
	phase = $state<QuestPhase>('none');
	title = $state('');
	questionCount = $state(0);
	/** The length of the game as the teacher chose it (seconds). */
	seconds = $state(0);
	/** Steals are off. */
	friendly = $state(false);
	players = $state(0);
	/** When the game ends, on the server's clock (0 until it runs). */
	endsAt = $state(0);
	endedReason = $state<EndReason | null>(null);
	/** The last refusal of a host command, for the screen to explain. */
	commandError = $state<{ code: ErrorCode; request: number } | null>(null);

	// ── the host's view ──
	/** Who is in the lobby, with their characters (newcomers and changes arrive; leavers do not). */
	roster = $state.raw<{ name: string; character: number }[]>([]);
	board = $state.raw<QuestBoard>({ top: [], players: 0, answers: 0, correct: 0 });
	podium = $state.raw<Podium | null>(null);

	// ── a player's view ──
	/** Their own coins as shown (held back while a verdict or a chest result waits its beat). */
	coins = $state(0);
	streak = $state(0);
	/** Right answers left that earn double. */
	booster = $state(0);
	shield = $state(false);
	character = $state(0);
	screen = $state<QuestScreen>('wait');
	question = $state.raw<QuestQuestion | null>(null);
	/** The options chosen for the open question, before the server's verdict. */
	chosen = $state<number | null>(null);
	/** The answer has been sent: the verdict is on its way. */
	locked = $state(false);
	/** The server refused the answer (too late, or not the current question). */
	refused = $state(false);
	/** The server refused the answer as too quick (nobody could have read the question yet): the player may answer again. */
	tooFast = $state(false);
	verdict = $state.raw<Verdict | null>(null);
	/** The serial the waiting chests belong to. */
	chestSerial = $state(0);
	/** The chest the player opened, before the result is shown. */
	picked = $state<number | null>(null);
	outcome = $state.raw<Outcome | null>(null);
	banner = $state.raw<Banner | null>(null);
	/** The standings strip: the top five, and the player's own place as of its frame. */
	standings = $state.raw<Row[]>([]);
	rank = $state(0);
	rankCoins = $state(0);
	/** How long the pause shown now lasts (ms), 0 when none. */
	pauseMs = $state(0);
	/** When the pause began, on this clock. */
	pauseFrom = $state(0);

	#deps: QuestDeps;
	#queue: Held[] = [];
	#gate: ReturnType<typeof setTimeout> | undefined;
	#holdUntil = 0;
	#latestCoins = 0;
	#seq = 0;
	/** The arrival order of the frame whose total `#latestCoins` is. */
	#coinsSeq = 0;
	#bannerTimer: ReturnType<typeof setTimeout> | undefined;
	#bannerId = 0;
	#waitTimer: ReturnType<typeof setTimeout> | undefined;
	#characterBefore = 0;
	/** Every character seen by name (the roster, the board, the standings), for the podium. */
	#characters = new SvelteMap<string, number>();

	constructor(deps: QuestDeps) {
		this.#deps = deps;
	}

	get active(): boolean {
		return this.phase !== 'none';
	}

	/** The character a name has been seen with, or null. */
	characterOf(name: string): number | null {
		return this.#characters.get(name) ?? null;
	}

	/** Decodes a raw Quest frame (the race's decoder hands these over) and applies it. */
	applyRaw(frame: unknown[]): void {
		const decoded = decodeQuestFrame(frame);
		if (decoded) this.apply(decoded);
	}

	apply(frame: QuestInput): void {
		// A refusal belongs to the phase it came in: the next phase frame clears it.
		if (MOVES.has(frame.type)) this.commandError = null;
		switch (frame.type) {
			case 'idle':
				this.#clear();
				break;
			case 'lobby':
				// A lobby seen again (a reconnect) keeps what the player has chosen in it.
				if (this.phase !== 'lobby') this.#clear();
				this.phase = 'lobby';
				this.title = frame.title;
				this.questionCount = frame.questions;
				this.players = frame.players;
				this.seconds = frame.seconds;
				this.friendly = frame.friendly;
				break;
			case 'roster':
				for (const p of frame.players) this.#characters.set(p.name, p.character);
				this.roster = [...this.#characters].map(([name, character]) => ({
					name,
					character
				}));
				break;
			case 'count':
				this.players = frame.players;
				break;
			case 'running':
				this.phase = 'running';
				this.endsAt = frame.endsAt;
				break;
			case 'me':
				this.#resume(frame);
				break;
			case 'question':
			case 'right':
			case 'wrong':
			case 'chest':
				this.#hold({ frame, at: Date.now(), seq: ++this.#seq });
				break;
			case 'stolen':
				this.#setCoins(frame.coins, ++this.#seq);
				this.#syncCoins();
				this.#showBanner({ kind: 'stolen', thief: frame.thief, amount: frame.amount });
				break;
			case 'blocked':
				this.shield = false;
				this.#showBanner({ kind: 'blocked', thief: frame.thief });
				break;
			case 'boosterEnded':
				this.booster = 0;
				this.#showBanner({ kind: 'boosterEnded' });
				break;
			case 'standings':
				for (const r of frame.top) this.#characters.set(r.name, r.character);
				this.standings = frame.top;
				this.rank = frame.rank;
				this.rankCoins = frame.coins;
				break;
			case 'board':
				for (const r of frame.top) this.#characters.set(r.name, r.character);
				this.board = {
					top: frame.top,
					players: frame.players,
					answers: frame.answers,
					correct: frame.correct
				};
				this.players = frame.players;
				break;
			case 'podium':
				this.#stopFlow();
				this.podium = { top: frame.top, me: frame.me, all: frame.all };
				this.phase = 'podium';
				break;
			case 'ended':
				this.#clear();
				this.endedReason = frame.reason;
				break;
			case 'error':
				this.#refused(frame.code, frame.request);
				break;
		}
	}

	/** Player: picks a character (the lobby, or later in the game). */
	chooseCharacter(character: number): boolean {
		if (character === this.character) return true;
		if (!this.#deps.send(encodeCharacter(character))) return false;
		this.#characterBefore = this.character;
		this.character = character;
		return true;
	}

	/** Player: answers the open question with these options. */
	answer(mask: number): boolean {
		const q = this.question;
		if (this.screen !== 'question' || !q || this.locked || mask === 0) return false;
		if (!this.#deps.send(encodeQuestAnswer(q.serial, mask))) return false;
		this.chosen = mask;
		this.locked = true;
		this.refused = false;
		this.tooFast = false;
		return true;
	}

	/** Player: opens chest 0, 1 or 2. */
	pickChest(chest: number): boolean {
		if (this.screen !== 'chests' || this.picked !== null || chest < 0 || chest > 2)
			return false;
		if (!this.#deps.send(encodePick(this.chestSerial, chest))) return false;
		this.picked = chest;
		return true;
	}

	/** Player: moves on from the outcome card without waiting for it to finish. */
	moveOn(): void {
		if (this.screen !== 'outcome') return;
		this.#holdUntil = 0;
		this.#pump();
	}

	/** Player: asks the server for the open question again (or the next one). */
	askAgain(): boolean {
		return this.#deps.send(encodeNextQuestion());
	}

	/** Stops every timer; the room calls it when it is done with the game. */
	dispose(): void {
		this.#stopFlow();
		clearTimeout(this.#bannerTimer);
		this.#bannerTimer = undefined;
	}

	// ── the player's loop ──

	#hold(held: Held): void {
		this.#queue.push(held);
		this.#pump();
	}

	/** When the frame at the head of the queue may be shown. */
	#readyAt(held: Held): number {
		const f = held.frame;
		const beat = f.type === 'question' || (f.type === 'wrong' && f.missed) ? 0 : BEAT_MS;
		return Math.max(held.at + beat, this.#holdUntil);
	}

	#pump(): void {
		clearTimeout(this.#gate);
		this.#gate = undefined;
		for (;;) {
			const head = this.#queue[0];
			if (!head) return;
			const wait = this.#readyAt(head) - Date.now();
			if (wait > 0) {
				this.#gate = setTimeout(() => {
					this.#gate = undefined;
					this.#pump();
				}, wait);
				return;
			}
			this.#queue.shift();
			this.#show(head);
		}
	}

	#show(held: Held): void {
		const f = held.frame;
		clearTimeout(this.#waitTimer);
		this.#waitTimer = undefined;
		switch (f.type) {
			case 'question':
				this.question = {
					serial: f.serial,
					kind: f.kind,
					text: f.text,
					options: f.options,
					limitMs: f.limitSec * 1000,
					endsAt: held.at + f.remainingMs
				};
				this.chosen = null;
				this.locked = false;
				this.refused = false;
				this.tooFast = false;
				this.verdict = null;
				this.outcome = null;
				this.picked = null;
				this.screen = 'question';
				break;
			case 'right':
				this.verdict = {
					right: true,
					earned: f.earned,
					streak: f.streak,
					bonus: f.bonus,
					boosterLeft: f.boosterLeft
				};
				this.streak = f.streak;
				this.booster = f.boosterLeft;
				this.#setCoins(f.coins, held.seq);
				this.chestSerial = f.serial;
				this.picked = null;
				this.screen = 'chests';
				break;
			case 'wrong':
				this.verdict = {
					right: false,
					missed: f.missed,
					correctMask: f.correctMask,
					pauseMs: f.pauseMs,
					explanation: f.explanation
				};
				this.streak = 0;
				this.#setCoins(f.coins, held.seq);
				this.pauseMs = f.pauseMs;
				this.pauseFrom = Date.now();
				this.#holdUntil = Date.now() + f.pauseMs;
				this.screen = 'pause';
				break;
			case 'chest':
				this.outcome = {
					picked: f.picked,
					kind: f.kind,
					amount: f.amount,
					chests: f.chests,
					victim: f.victim,
					blocked: f.blocked
				};
				if (f.kind === 2) this.booster = 3;
				if (f.kind === 3) this.shield = true;
				this.#setCoins(f.coins, held.seq);
				this.picked = f.picked;
				this.#holdUntil = Date.now() + OUTCOME_MS;
				this.screen = 'outcome';
				break;
		}
		this.#syncCoins();
		this.#watchWait();
	}

	/** A total from a frame counts only if no newer frame has told the player's coins since. */
	#setCoins(coins: number, seq: number): void {
		if (seq < this.#coinsSeq) return;
		this.#latestCoins = coins;
		this.#coinsSeq = seq;
	}

	/** Coins as shown follow the server's, except while a verdict or a chest result waits its beat. */
	#syncCoins(): void {
		if (this.#queue.some((h) => h.frame.type !== 'question')) return;
		this.coins = this.#latestCoins;
	}

	/** Nothing to show during a running game: after a while ask the server for the question. */
	#watchWait(): void {
		clearTimeout(this.#waitTimer);
		this.#waitTimer = undefined;
		if (this.phase !== 'running' || this.screen !== 'wait') return;
		this.#waitTimer = setTimeout(() => {
			this.#waitTimer = undefined;
			if (this.phase === 'running' && this.screen === 'wait' && this.#queue.length === 0)
				this.askAgain();
		}, WAIT_RETRY_MS);
	}

	/** After a hello: the whole state of the player, and where they were in their loop. */
	#resume(f: Extract<QuestFrame, { type: 'me' }>): void {
		this.#stopFlow();
		this.#setCoins(f.coins, ++this.#seq);
		this.coins = f.coins;
		this.rank = f.rank;
		this.rankCoins = f.coins;
		this.streak = f.streak;
		this.booster = f.booster;
		this.shield = f.shield;
		this.character = f.character;
		this.question = null;
		this.verdict = null;
		this.outcome = null;
		this.picked = null;
		this.chosen = null;
		this.locked = false;
		this.refused = false;
		this.tooFast = false;
		this.pauseMs = 0;
		if (f.pending === 'chest') {
			this.chestSerial = f.serial;
			this.screen = 'chests';
		} else if (f.pending === 'pause') {
			this.pauseMs = f.pauseMs;
			this.pauseFrom = Date.now();
			this.screen = 'pause';
		} else {
			this.screen = 'wait';
		}
		this.#watchWait();
	}

	#refused(code: ErrorCode, request: number): void {
		switch (request) {
			case QUEST_REQUEST.answer: {
				// Too late, or not the current question: the verdict (a miss) follows by itself.
				// Too quick (the service lets nobody answer before they could have read the
				// question) and a bad choice leave the question open: the player answers again.
				const open = !!this.question && Date.now() < this.question.endsAt - OPEN_MARGIN_MS;
				this.locked = false;
				this.chosen = null;
				this.tooFast = code === 5 && open;
				this.refused = code === 5 && !open;
				break;
			}
			case QUEST_REQUEST.pick:
				this.picked = null;
				break;
			case QUEST_REQUEST.character:
				this.character = this.#characterBefore;
				break;
			case QUEST_REQUEST.again:
				break;
			default:
				this.commandError = { code, request };
		}
	}

	#showBanner(banner: DistributiveOmit<Banner, 'id'>): void {
		clearTimeout(this.#bannerTimer);
		this.banner = { ...banner, id: ++this.#bannerId } as Banner;
		this.#bannerTimer = setTimeout(() => {
			this.#bannerTimer = undefined;
			this.banner = null;
		}, BANNER_MS);
	}

	#stopFlow(): void {
		clearTimeout(this.#gate);
		this.#gate = undefined;
		clearTimeout(this.#waitTimer);
		this.#waitTimer = undefined;
		this.#queue = [];
		this.#holdUntil = 0;
	}

	#clear(): void {
		this.#stopFlow();
		clearTimeout(this.#bannerTimer);
		this.#bannerTimer = undefined;
		this.phase = 'none';
		this.title = '';
		this.questionCount = 0;
		this.seconds = 0;
		this.friendly = false;
		this.players = 0;
		this.endsAt = 0;
		this.endedReason = null;
		this.roster = [];
		this.board = { top: [], players: 0, answers: 0, correct: 0 };
		this.podium = null;
		this.coins = 0;
		this.#latestCoins = 0;
		this.streak = 0;
		this.booster = 0;
		this.shield = false;
		this.character = 0;
		this.screen = 'wait';
		this.question = null;
		this.chosen = null;
		this.locked = false;
		this.refused = false;
		this.tooFast = false;
		this.verdict = null;
		this.picked = null;
		this.outcome = null;
		this.banner = null;
		this.standings = [];
		this.rank = 0;
		this.rankCoins = 0;
		this.pauseMs = 0;
		this.#characters = new SvelteMap();
	}
}
