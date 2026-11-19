/**
 * Quest mode's frames (protocol `quiz.v1`, "Quest mode" of the quiz service's
 * PROTOCOL.md): server frames 20 to 29 and the player's client frames 5 to 8.
 * The race's decoder hands these over undecoded (`{ type: 'quest' }`), so this
 * file, like everything of Quest, loads only when a Quest game shows up.
 * `decodeQuestFrame` turns one into a typed event, or null for a frame that is
 * not one (a wrong frame never breaks a game).
 */

import type { ServerFrame } from '../protocol';

/** The twelve characters a player may choose, `0` to `11`. */
export const CHARACTERS = 12;

/** A Quest game lasts 5, 10 or 15 minutes. */
export const QUEST_SECONDS = [300, 600, 900] as const;

/** 0 coins, 1 jackpot, 2 booster, 3 shield, 4 steal, 5 slip. */
export type ChestKind = 0 | 1 | 2 | 3 | 4 | 5;

/** What a player is in the middle of, as the server's state frame says after a hello. */
export type Pending = 'nothing' | 'question' | 'chest' | 'pause';

export type Row = { name: string; character: number; coins: number };
export type ChestShown = { kind: ChestKind; amount: number };

export type QuestFrame =
	| {
			type: 'lobby';
			now: number;
			title: string;
			questions: number;
			players: number;
			seconds: number;
			friendly: boolean;
	  }
	| { type: 'roster'; players: { name: string; character: number }[] }
	| { type: 'running'; now: number; endsAt: number }
	| {
			type: 'me';
			coins: number;
			rank: number;
			streak: number;
			booster: number;
			shield: boolean;
			character: number;
			serial: number;
			pending: Pending;
			pauseMs: number;
	  }
	| {
			type: 'question';
			kind: 0 | 1 | 2;
			text: string;
			options: string[];
			limitSec: number;
			serial: number;
			remainingMs: number;
	  }
	| {
			type: 'right';
			serial: number;
			earned: number;
			streak: number;
			bonus: number;
			coins: number;
			boosterLeft: number;
	  }
	| {
			type: 'wrong';
			serial: number;
			/** The time ran out before an answer (the server's "missed"). */
			missed: boolean;
			coins: number;
			correctMask: number;
			pauseMs: number;
			explanation: string | null;
	  }
	| {
			type: 'chest';
			serial: number;
			picked: number;
			kind: ChestKind;
			amount: number;
			coins: number;
			chests: [ChestShown, ChestShown, ChestShown];
			/** For a steal: who it was aimed at. */
			victim: string | null;
			/** Their shield stopped it. */
			blocked: boolean;
	  }
	| { type: 'stolen'; thief: string; amount: number; coins: number }
	| { type: 'blocked'; thief: string }
	| { type: 'boosterEnded' }
	| { type: 'standings'; top: Row[]; rank: number; coins: number }
	| {
			type: 'board';
			top: Row[];
			players: number;
			answers: number;
			correct: number;
			msLeft: number;
	  };

/** Every frame the Quest model takes: its own, and the race's frames that Quest reuses. */
export type QuestInput =
	QuestFrame | Extract<ServerFrame, { type: 'idle' | 'count' | 'podium' | 'ended' | 'error' }>;

/** The client's Quest frame types (the start frame is the race's `[1,...]` with a mode). */
const QUEST_CLIENT = { character: 5, answer: 6, pick: 7, next: 8 } as const;

export const encodeCharacter = (character: number) =>
	JSON.stringify([QUEST_CLIENT.character, character]);
export const encodeQuestAnswer = (serial: number, mask: number) =>
	JSON.stringify([QUEST_CLIENT.answer, serial, mask]);
export const encodePick = (serial: number, chest: number) =>
	JSON.stringify([QUEST_CLIENT.pick, serial, chest]);
export const encodeNextQuestion = () => JSON.stringify([QUEST_CLIENT.next]);

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isCharacter = (v: unknown): v is number => isInt(v) && v >= 0 && v < CHARACTERS;
const isKind = (v: unknown): v is ChestKind => isInt(v) && v >= 0 && v <= 5;

function rows(v: unknown): Row[] | null {
	if (!Array.isArray(v)) return null;
	const out: Row[] = [];
	for (const r of v) {
		if (!Array.isArray(r) || !isStr(r[0]) || !isCharacter(r[1]) || !isInt(r[2])) return null;
		out.push({ name: r[0], character: r[1], coins: r[2] });
	}
	return out;
}

function shown(v: unknown): [ChestShown, ChestShown, ChestShown] | null {
	if (!Array.isArray(v) || v.length !== 6) return null;
	const out: ChestShown[] = [];
	for (let i = 0; i < 6; i += 2) {
		if (!isKind(v[i]) || !isInt(v[i + 1])) return null;
		out.push({ kind: v[i] as ChestKind, amount: v[i + 1] as number });
	}
	return out as [ChestShown, ChestShown, ChestShown];
}

const PENDING: Pending[] = ['nothing', 'question', 'chest', 'pause'];

/** A Quest frame (an array whose first element is 20 to 29) as an event, or null. */
export function decodeQuestFrame(f: unknown[]): QuestFrame | null {
	switch (f[0]) {
		case 20:
			return isInt(f[1]) &&
				isStr(f[2]) &&
				isInt(f[3]) &&
				isInt(f[4]) &&
				isInt(f[5]) &&
				isInt(f[6])
				? {
						type: 'lobby',
						now: f[1],
						title: f[2],
						questions: f[3],
						players: f[4],
						seconds: f[5],
						friendly: (f[6] & 1) === 1
					}
				: null;
		case 21: {
			if (!Array.isArray(f[1])) return null;
			const players: { name: string; character: number }[] = [];
			for (const p of f[1]) {
				if (!Array.isArray(p) || !isStr(p[0]) || !isCharacter(p[1])) return null;
				players.push({ name: p[0], character: p[1] });
			}
			return { type: 'roster', players };
		}
		case 22:
			return isInt(f[1]) && isInt(f[2]) ? { type: 'running', now: f[1], endsAt: f[2] } : null;
		case 23: {
			const [, coins, rank, streak, booster, shield, character, serial, pending, pauseMs] = f;
			if (
				![coins, rank, streak, booster, shield, serial, pending, pauseMs].every(isInt) ||
				!isCharacter(character) ||
				(pending as number) < 0 ||
				(pending as number) > 3
			)
				return null;
			return {
				type: 'me',
				coins: coins as number,
				rank: rank as number,
				streak: streak as number,
				booster: booster as number,
				shield: shield === 1,
				character,
				serial: serial as number,
				pending: PENDING[pending as number],
				pauseMs: pauseMs as number
			};
		}
		case 24: {
			const [, kind, text, options, limitSec, serial, remainingMs] = f;
			if (
				(kind !== 0 && kind !== 1 && kind !== 2) ||
				!isStr(text) ||
				!Array.isArray(options) ||
				!options.every(isStr) ||
				!isInt(limitSec) ||
				!isInt(serial) ||
				!isInt(remainingMs)
			)
				return null;
			return {
				type: 'question',
				kind,
				text,
				options: options as string[],
				limitSec,
				serial,
				remainingMs
			};
		}
		case 25: {
			if (!isInt(f[1])) return null;
			if (f[2] === 1) {
				const [, serial, , earned, streak, bonus, coins, boosterLeft] = f;
				return [earned, streak, bonus, coins, boosterLeft].every(isInt)
					? {
							type: 'right',
							serial: serial as number,
							earned: earned as number,
							streak: streak as number,
							bonus: bonus as number,
							coins: coins as number,
							boosterLeft: boosterLeft as number
						}
					: null;
			}
			if (f[2] === 0 || f[2] === 2) {
				const [, serial, result, , , , coins, correctMask, pauseMs, explanation] = f;
				return isInt(coins) &&
					isInt(correctMask) &&
					isInt(pauseMs) &&
					(explanation === null || isStr(explanation))
					? {
							type: 'wrong',
							serial: serial as number,
							missed: result === 2,
							coins,
							correctMask,
							pauseMs,
							explanation
						}
					: null;
			}
			return null;
		}
		case 26: {
			const [, serial, picked, kind, amount, coins, chests, victim, blocked] = f;
			const all = shown(chests);
			if (
				![serial, picked, amount, coins, blocked].every(isInt) ||
				(picked as number) < 0 ||
				(picked as number) > 2 ||
				!isKind(kind) ||
				!all ||
				!(victim === null || isStr(victim))
			)
				return null;
			return {
				type: 'chest',
				serial: serial as number,
				picked: picked as number,
				kind,
				amount: amount as number,
				coins: coins as number,
				chests: all,
				victim,
				blocked: blocked === 1
			};
		}
		case 27:
			if (f[1] === 0)
				return isStr(f[2]) && isInt(f[3]) && isInt(f[4])
					? { type: 'stolen', thief: f[2], amount: f[3], coins: f[4] }
					: null;
			if (f[1] === 1) return isStr(f[2]) ? { type: 'blocked', thief: f[2] } : null;
			return f[1] === 2 ? { type: 'boosterEnded' } : null;
		case 28: {
			const top = rows(f[1]);
			return top && isInt(f[2]) && isInt(f[3])
				? { type: 'standings', top, rank: f[2], coins: f[3] }
				: null;
		}
		case 29: {
			const top = rows(f[1]);
			return top && [f[2], f[3], f[4], f[5]].every(isInt)
				? {
						type: 'board',
						top,
						players: f[2] as number,
						answers: f[3] as number,
						correct: f[4] as number,
						msLeft: f[5] as number
					}
				: null;
		}
		default:
			return null;
	}
}
