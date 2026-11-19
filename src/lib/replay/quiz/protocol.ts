/**
 * The game socket's frames (protocol `quiz.v1`, written from the quiz
 * service's PROTOCOL.md). A frame is a short JSON array whose first element
 * is its type, with numbers in place of names: the question's number, an
 * option's position, a set of chosen options as a bit mask. `decodeFrame`
 * turns a text frame into a typed event, or null for a frame that is not
 * one (the client then ignores it: a wrong frame never breaks a game).
 */

/** What the server says, one variant per frame type. */
export type ServerFrame =
	| { type: 'idle'; now: number }
	| { type: 'lobby'; now: number; title: string; questions: number; players: number }
	| {
			type: 'question';
			now: number;
			q: number;
			count: number;
			endsAt: number;
			kind: QuestionKind;
			text: string;
			options: string[];
			/** The options this player already chose (a resumed socket); absent for the host. */
			mine?: number;
	  }
	| { type: 'count'; players: number }
	| {
			type: 'progress';
			answered: number;
			players: number;
			/** Players who chose each option so far (multi-select counts every chosen option); host only. */
			counts?: number[];
			/** Host only: the provisional top ten, every answer scored on arrival (not final until the reveal). */
			ranking?: ScoreLine[];
	  }
	/** Host only: names of the players who joined since the last one (or all of them, once, after the host's hello). */
	| { type: 'names'; names: string[] }
	| {
			type: 'reveal';
			q: number;
			correct: number;
			counts: number[];
			explanation: string | null;
			top: ScoreLine[];
			/** A player's own result; the host's reveal has none. */
			personal?: {
				score: number;
				rank: number;
				points: number;
				right: boolean;
				mine: number;
				/** Consecutive fully-correct answers after this question (the server counts it). */
				streak: number;
				/** The part of `points` that is the streak bonus (100 x (streak - 1), at most 500). */
				bonus: number;
			};
	  }
	| { type: 'podium'; top: ScoreLine[]; me?: { score: number; rank: number }; all?: ScoreLine[] }
	/** The question has closed; the reveal follows after a short beat (suspense). */
	| { type: 'closed'; q: number }
	| { type: 'ended'; reason: EndReason }
	| { type: 'error'; code: ErrorCode; request: number }
	| { type: 'ack' }
	/**
	 * A Quest frame (types 20 to 29), left undecoded: the Quest code is its own
	 * lazy chunk (`quest/quest-protocol.ts` turns `frame` into a typed event), so
	 * a room that never plays Quest never loads it. `now` is the server clock for
	 * the frames that carry it (the lobby and the running frame).
	 */
	| { type: 'quest'; code: number; frame: unknown[]; now?: number };

/** 0 single choice, 1 multiple choice, 2 true/false. */
export type QuestionKind = 0 | 1 | 2;

/**
 * 0 the host ended it, 1 the room closed, 2 idle for an hour, 4 the host left (no
 * host socket for two minutes). 3 is retired (a restart now pauses the game and
 * closes the sockets with 1001 "restart"); the numbering stays.
 */
export type EndReason = 0 | 1 | 2 | 4;

/**
 * 1 unauthorized, 2 forbidden, 3 not found, 4 bad request, 5 conflict,
 * 6 too many sockets or frames, 9 internal.
 */
export type ErrorCode = 1 | 2 | 3 | 4 | 5 | 6 | 9;

export type ScoreLine = { name: string; score: number };

/** The client's frame types, as the first element of what it sends. */
const CLIENT = { hello: 0, start: 1, next: 2, end: 3, answer: 4 } as const;

export const encodeHello = (ticket: string) => JSON.stringify([CLIENT.hello, ticket]);
/** What a Quest game is started with: its length and whether steals are off. */
export type QuestStart = { seconds: number; friendly: boolean };

/** The start frame: a race by default, or `[1,"id",1,seconds,flags]` for Quest (flag bit 0 is friendly mode). */
export const encodeStart = (quizId: string, quest?: QuestStart) =>
	JSON.stringify(
		quest
			? [CLIENT.start, quizId, 1, quest.seconds, quest.friendly ? 1 : 0]
			: [CLIENT.start, quizId]
	);
export const encodeNext = () => JSON.stringify([CLIENT.next]);
export const encodeEnd = () => JSON.stringify([CLIENT.end]);
export const encodeAnswer = (q: number, mask: number) => JSON.stringify([CLIENT.answer, q, mask]);

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isIntArray = (v: unknown): v is number[] => Array.isArray(v) && v.every(isInt);
const isStringArray = (v: unknown): v is string[] =>
	Array.isArray(v) && v.every((s) => typeof s === 'string');

function scoreLines(v: unknown): ScoreLine[] | null {
	if (!Array.isArray(v)) return null;
	const lines: ScoreLine[] = [];
	for (const line of v) {
		if (!Array.isArray(line) || typeof line[0] !== 'string' || !isInt(line[1])) return null;
		lines.push({ name: line[0], score: line[1] });
	}
	return lines;
}

const KINDS = new Set([0, 1, 2]);
const ERROR_CODES = new Set([1, 2, 3, 4, 5, 6, 9]);

/** A text frame as an event, or null when it is not a frame of this protocol. */
export function decodeFrame(text: string): ServerFrame | null {
	let f: unknown;
	try {
		f = JSON.parse(text);
	} catch {
		return null;
	}
	if (!Array.isArray(f)) return null;
	switch (f[0]) {
		case 0:
			return isInt(f[1]) ? { type: 'idle', now: f[1] } : null;
		case 1:
			return isInt(f[1]) && typeof f[2] === 'string' && isInt(f[3]) && isInt(f[4])
				? { type: 'lobby', now: f[1], title: f[2], questions: f[3], players: f[4] }
				: null;
		case 2: {
			const [, now, q, count, endsAt, kind, qText, options, mine] = f;
			if (
				!isInt(now) ||
				!isInt(q) ||
				!isInt(count) ||
				!isInt(endsAt) ||
				!KINDS.has(kind) ||
				typeof qText !== 'string' ||
				!isStringArray(options)
			)
				return null;
			return {
				type: 'question',
				now,
				q,
				count,
				endsAt,
				kind: kind as QuestionKind,
				text: qText,
				options,
				...(isInt(mine) ? { mine } : {})
			};
		}
		case 3:
			return isInt(f[1]) ? { type: 'count', players: f[1] } : null;
		case 4:
			if (!isInt(f[1]) || !isInt(f[2])) return null;
			if (f.length > 3) {
				if (!isIntArray(f[3])) return null;
				const counts = f[3];
				if (f.length === 4)
					return { type: 'progress', answered: f[1], players: f[2], counts };
				const ranking = scoreLines(f[4]);
				return ranking
					? { type: 'progress', answered: f[1], players: f[2], counts, ranking }
					: null;
			}
			return { type: 'progress', answered: f[1], players: f[2] };
		case 5: {
			const [, q, correct, counts, explanation, top] = f;
			const lines = scoreLines(top);
			if (
				!isInt(q) ||
				!isInt(correct) ||
				!isIntArray(counts) ||
				!(explanation === null || typeof explanation === 'string') ||
				!lines
			)
				return null;
			const base = { type: 'reveal' as const, q, correct, counts, explanation, top: lines };
			// A player's frame carries a personal tail: score, rank, points, right, mine.
			if (f.length > 6) {
				const [, , , , , , score, rank, points, right, mine, streak = 0, bonus = 0] = f;
				if (![score, rank, points, right, mine, streak, bonus].every(isInt)) return null;
				return {
					...base,
					personal: { score, rank, points, right: right === 1, mine, streak, bonus }
				};
			}
			return base;
		}
		case 6: {
			const top = scoreLines(f[1]);
			if (!top) return null;
			// The host's frame lists everyone; a player's carries their own score and rank.
			if (Array.isArray(f[2])) {
				const all = scoreLines(f[2]);
				return all ? { type: 'podium', top, all } : null;
			}
			return isInt(f[2]) && isInt(f[3])
				? { type: 'podium', top, me: { score: f[2], rank: f[3] } }
				: null;
		}
		case 7:
			return isInt(f[1]) && f[1] >= 0 && f[1] <= 4
				? { type: 'ended', reason: f[1] as EndReason }
				: null;
		case 8:
			return ERROR_CODES.has(f[1]) && isInt(f[2])
				? { type: 'error', code: f[1] as ErrorCode, request: f[2] }
				: null;
		case 9:
			return { type: 'ack' };
		case 11:
			return isInt(f[1]) ? { type: 'closed', q: f[1] } : null;
		case 10:
			return isStringArray(f[1]) ? { type: 'names', names: f[1] } : null;
		default:
			if (typeof f[0] === 'number' && f[0] >= 20 && f[0] <= 29) {
				// The lobby (20) and running (22) frames carry the server's clock.
				const now = (f[0] === 20 || f[0] === 22) && isInt(f[1]) ? f[1] : undefined;
				return {
					type: 'quest',
					code: f[0],
					frame: f,
					...(now === undefined ? {} : { now })
				};
			}
			return null;
	}
}

/** The bit mask of a set of option positions (bit 0 is the first option). */
export function maskOf(positions: Iterable<number>): number {
	let mask = 0;
	for (const p of positions) mask |= 1 << p;
	return mask;
}

/** Whether the option at `position` is in the mask. */
export const hasBit = (mask: number, position: number) => (mask & (1 << position)) !== 0;

/** The mask with the option at `position` switched. */
export const toggleBit = (mask: number, position: number) => mask ^ (1 << position);

/** The positions in a mask, lowest first. */
export function positionsOf(mask: number): number[] {
	const out: number[] = [];
	for (let i = 0; mask >> i > 0; i++) if (hasBit(mask, i)) out.push(i);
	return out;
}

/** How many options a mask holds. */
export const bitCount = (mask: number) => positionsOf(mask).length;
