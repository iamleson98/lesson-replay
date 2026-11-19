import { describe, expect, it } from 'vitest';
import { decodeFrame, encodeStart } from '#lib/replay/quiz/protocol.js';
import {
	decodeQuestFrame,
	encodeCharacter,
	encodeNextQuestion,
	encodePick,
	encodeQuestAnswer
} from '#lib/replay/quiz/quest/quest-protocol.js';

const quest = (frame: unknown[]) => decodeQuestFrame(frame);

describe('Quest: client frames', () => {
	it('encodes the start with its mode, length and flags, and the player frames 5 to 8', () => {
		expect(encodeStart('9')).toBe('[1,"9"]');
		expect(encodeStart('9', { seconds: 600, friendly: false })).toBe('[1,"9",1,600,0]');
		expect(encodeStart('9', { seconds: 300, friendly: true })).toBe('[1,"9",1,300,1]');
		expect(encodeCharacter(4)).toBe('[5,4]');
		expect(encodeQuestAnswer(3, 5)).toBe('[6,3,5]');
		expect(encodePick(3, 2)).toBe('[7,3,2]');
		expect(encodeNextQuestion()).toBe('[8]');
	});
});

describe('Quest: the race decoder leaves Quest frames to the lazy chunk', () => {
	it('hands types 20 to 29 over undecoded, with the server clock of the lobby and running frames', () => {
		expect(decodeFrame(JSON.stringify([20, 5000, 'Q', 3, 1, 300, 0]))).toEqual({
			type: 'quest',
			code: 20,
			now: 5000,
			frame: [20, 5000, 'Q', 3, 1, 300, 0]
		});
		expect(decodeFrame('[22,7,99]')).toMatchObject({ type: 'quest', code: 22, now: 7 });
		expect(decodeFrame('[28,[],1,0]')).toEqual({
			type: 'quest',
			code: 28,
			frame: [28, [], 1, 0]
		});
		expect(decodeFrame('[30]')).toBeNull();
		expect(decodeFrame('[19]')).toBeNull();
	});
});

describe('Quest: server frames (the example of PROTOCOL.md)', () => {
	it('decodes the lobby and its flags', () => {
		expect(quest([20, 1793931348000, 'Fractions', 24, 12, 300, 0])).toEqual({
			type: 'lobby',
			now: 1793931348000,
			title: 'Fractions',
			questions: 24,
			players: 12,
			seconds: 300,
			friendly: false
		});
		expect(quest([20, 1, 'Q', 2, 1, 900, 1])).toMatchObject({ seconds: 900, friendly: true });
	});

	it('decodes the roster, the running frame and the state after a hello', () => {
		expect(
			quest([
				21,
				[
					['An', 3],
					['Binh', 11]
				]
			])
		).toEqual({
			type: 'roster',
			players: [
				{ name: 'An', character: 3 },
				{ name: 'Binh', character: 11 }
			]
		});
		expect(quest([22, 1793931360000, 1793931660000])).toEqual({
			type: 'running',
			now: 1793931360000,
			endsAt: 1793931660000
		});
		expect(quest([23, 120, 2, 3, 2, 1, 7, 9, 2, 0])).toEqual({
			type: 'me',
			coins: 120,
			rank: 2,
			streak: 3,
			booster: 2,
			shield: true,
			character: 7,
			serial: 9,
			pending: 'chest',
			pauseMs: 0
		});
		expect(quest([23, 0, 0, 0, 0, 0, 0, 1, 3, 1800])).toMatchObject({
			pending: 'pause',
			pauseMs: 1800
		});
	});

	it('decodes a question', () => {
		expect(quest([24, 0, '1/2 + 1/2 = ?', ['1', '2', '0', '1/4'], 30, 1, 30000])).toEqual({
			type: 'question',
			kind: 0,
			text: '1/2 + 1/2 = ?',
			options: ['1', '2', '0', '1/4'],
			limitSec: 30,
			serial: 1,
			remainingMs: 30000
		});
	});

	it('decodes a right verdict, a wrong one and a missed one', () => {
		expect(quest([25, 1, 1, 19, 1, 0, 19, 0])).toEqual({
			type: 'right',
			serial: 1,
			earned: 19,
			streak: 1,
			bonus: 0,
			coins: 19,
			boosterLeft: 0
		});
		expect(quest([25, 2, 0, 0, 0, 0, 39, 5, 2500, '2 and 3 are prime'])).toEqual({
			type: 'wrong',
			serial: 2,
			missed: false,
			coins: 39,
			correctMask: 5,
			pauseMs: 2500,
			explanation: '2 and 3 are prime'
		});
		expect(quest([25, 3, 2, 0, 0, 0, 39, 1, 2500, null])).toMatchObject({
			type: 'wrong',
			missed: true,
			explanation: null
		});
	});

	it('decodes the chest result, a steal included', () => {
		expect(quest([26, 1, 2, 0, 20, 39, [5, 20, 0, 40, 0, 20], null, 0])).toEqual({
			type: 'chest',
			serial: 1,
			picked: 2,
			kind: 0,
			amount: 20,
			coins: 39,
			chests: [
				{ kind: 5, amount: 20 },
				{ kind: 0, amount: 40 },
				{ kind: 0, amount: 20 }
			],
			victim: null,
			blocked: false
		});
		expect(quest([26, 4, 1, 4, 30, 130, [5, 20, 4, 30, 4, 0], 'Binh', 1])).toMatchObject({
			kind: 4,
			amount: 30,
			victim: 'Binh',
			blocked: true
		});
	});

	it('decodes the three personal events', () => {
		expect(quest([27, 0, 'Binh', 12, 80])).toEqual({
			type: 'stolen',
			thief: 'Binh',
			amount: 12,
			coins: 80
		});
		expect(quest([27, 1, 'Binh'])).toEqual({ type: 'blocked', thief: 'Binh' });
		expect(quest([27, 2])).toEqual({ type: 'boosterEnded' });
	});

	it('decodes the standings strip and the host board', () => {
		expect(
			quest([
				28,
				[
					['Binh', 2, 130],
					['An', 4, 39]
				],
				2,
				39
			])
		).toEqual({
			type: 'standings',
			top: [
				{ name: 'Binh', character: 2, coins: 130 },
				{ name: 'An', character: 4, coins: 39 }
			],
			rank: 2,
			coins: 39
		});
		expect(quest([29, [['An', 1, 50]], 12, 40, 30, 61_000])).toEqual({
			type: 'board',
			top: [{ name: 'An', character: 1, coins: 50 }],
			players: 12,
			answers: 40,
			correct: 30,
			msLeft: 61_000
		});
	});

	it('ignores a frame that is not one', () => {
		for (const bad of [
			[20, 1, 'Q', 2, 1, 300],
			[21, [['An', 12]]],
			[21, [['An']]],
			[22, 1],
			[23, 1, 1, 1, 1, 1, 12, 1, 0, 0],
			[23, 1, 1, 1, 1, 1, 1, 1, 4, 0],
			[24, 3, 'q', ['a'], 30, 1, 1],
			[24, 0, 'q', [1], 30, 1, 1],
			[25, 1, 7, 0, 0, 0, 0, 0],
			[25, 1, 0, 0, 0, 0, 5, 1, 2500],
			[26, 1, 3, 0, 20, 39, [5, 20, 0, 40], null, 0],
			[26, 1, 3, 0, 20, 39, [5, 20, 0, 40, 0, 20], null, 0],
			[26, 1, 1, 9, 20, 39, [5, 20, 0, 40, 0, 20], null, 0],
			[27, 3],
			[27, 0, 'x'],
			[28, [['An', 1]], 1, 1],
			[29, [], 1, 2, 3],
			[30]
		])
			expect(quest(bad), JSON.stringify(bad)).toBeNull();
	});
});
