import { describe, expect, it } from 'vitest';
import {
	bitCount,
	decodeFrame,
	encodeAnswer,
	encodeEnd,
	encodeHello,
	encodeNext,
	encodeStart,
	hasBit,
	maskOf,
	positionsOf,
	toggleBit
} from '#lib/replay/quiz/protocol.js';

const decode = (frame: unknown[]) => decodeFrame(JSON.stringify(frame));

describe('quiz protocol: client frames', () => {
	it('encodes every command as the protocol lists it', () => {
		expect(encodeHello('tk')).toBe('[0,"tk"]');
		expect(encodeStart('123')).toBe('[1,"123"]');
		expect(encodeNext()).toBe('[2]');
		expect(encodeEnd()).toBe('[3]');
		expect(encodeAnswer(2, 5)).toBe('[4,2,5]');
	});
});

describe('quiz protocol: server frames (the example round)', () => {
	it('decodes no game', () => {
		expect(decode([0, 1793931348000])).toEqual({ type: 'idle', now: 1793931348000 });
	});
	it('decodes the lobby', () => {
		expect(decode([1, 1793931349100, 'Fractions', 3, 12])).toEqual({
			type: 'lobby',
			now: 1793931349100,
			title: 'Fractions',
			questions: 3,
			players: 12
		});
	});
	it('decodes a question, with and without the resume tail', () => {
		const frame = [
			2,
			1793931351000,
			1,
			3,
			1793931371000,
			0,
			'1/2 + 1/2 = ?',
			['1', '2', '0', '1/4']
		];
		expect(decode(frame)).toEqual({
			type: 'question',
			now: 1793931351000,
			q: 1,
			count: 3,
			endsAt: 1793931371000,
			kind: 0,
			text: '1/2 + 1/2 = ?',
			options: ['1', '2', '0', '1/4']
		});
		expect(decode([...frame, 5])).toMatchObject({ type: 'question', mine: 5 });
		expect(decode([...frame, 0])).toMatchObject({ type: 'question', mine: 0 });
	});
	it('decodes the lobby count and the host progress', () => {
		expect(decode([3, 14])).toEqual({ type: 'count', players: 14 });
		expect(decode([4, 7, 25])).toEqual({ type: 'progress', answered: 7, players: 25 });
		expect(decode([4, 7, 25, [3, 4, 0]])).toEqual({
			type: 'progress',
			answered: 7,
			players: 25,
			counts: [3, 4, 0]
		});
		expect(decode([4, 7, 25, 'x'])).toBeNull();
		expect(
			decode([
				4,
				7,
				25,
				[3, 4, 0],
				[
					['An', 1500],
					['Binh', 900]
				]
			])
		).toEqual({
			type: 'progress',
			answered: 7,
			players: 25,
			counts: [3, 4, 0],
			ranking: [
				{ name: 'An', score: 1500 },
				{ name: 'Binh', score: 900 }
			]
		});
		expect(decode([4, 7, 25, [3, 4, 0], 'x'])).toBeNull();
	});
	it('decodes the names of the players who joined (host only)', () => {
		expect(decode([10, ['An', 'Bình']])).toEqual({ type: 'names', names: ['An', 'Bình'] });
		expect(decode([10, []])).toEqual({ type: 'names', names: [] });
		expect(decode([10, [1]])).toBeNull();
		expect(decode([10])).toBeNull();
	});
	it('decodes a player reveal with its personal tail, streak and bonus', () => {
		const frame = [
			5,
			1,
			1,
			[8, 3, 1, 0],
			'one whole',
			[
				['An', 1000],
				['Binh', 990]
			],
			990,
			2,
			990,
			1,
			1
		];
		const expected = {
			type: 'reveal',
			q: 1,
			correct: 1,
			counts: [8, 3, 1, 0],
			explanation: 'one whole',
			top: [
				{ name: 'An', score: 1000 },
				{ name: 'Binh', score: 990 }
			]
		};
		expect(decode([...frame, 3, 200])).toEqual({
			...expected,
			personal: {
				score: 990,
				rank: 2,
				points: 990,
				right: true,
				mine: 1,
				streak: 3,
				bonus: 200
			}
		});
		// A tail without the two newest fields means no streak.
		expect(decode(frame)).toMatchObject({ personal: { streak: 0, bonus: 0 } });
		expect(decode([...frame, 3])).toMatchObject({ personal: { streak: 3, bonus: 0 } });
		expect(decode([...frame, 'x', 1])).toBeNull();
	});
	it('decodes the host reveal (no tail) and a null explanation', () => {
		const frame = decode([5, 2, 4, [1, 0, 5, 0], null, [['An', 10]]]);
		expect(frame).toMatchObject({ type: 'reveal', explanation: null });
		expect(frame && 'personal' in frame ? frame.personal : undefined).toBeUndefined();
	});
	it('decodes the podium for a player and for the host', () => {
		const top = [
			['An', 2980],
			['Binh', 2960],
			['Chi', 2100]
		];
		expect(decode([6, top, 2960, 2])).toEqual({
			type: 'podium',
			top: [
				{ name: 'An', score: 2980 },
				{ name: 'Binh', score: 2960 },
				{ name: 'Chi', score: 2100 }
			],
			me: { score: 2960, rank: 2 }
		});
		expect(decode([6, top, [...top, ['Dung', 50]]])).toMatchObject({
			type: 'podium',
			all: [{ name: 'An' }, { name: 'Binh' }, { name: 'Chi' }, { name: 'Dung', score: 50 }]
		});
	});
	it('decodes the closed frame that starts the suspense beat', () => {
		expect(decode([11, 3])).toEqual({ type: 'closed', q: 3 });
		expect(decode([11, 'x'])).toBeNull();
		expect(decode([11])).toBeNull();
	});
	it('decodes ended, errors and the ack', () => {
		for (const reason of [0, 1, 2, 3, 4])
			expect(decode([7, reason])).toEqual({ type: 'ended', reason });
		for (const code of [1, 2, 3, 4, 5, 6, 9])
			expect(decode([8, code, 4])).toEqual({ type: 'error', code, request: 4 });
		expect(decode([9])).toEqual({ type: 'ack' });
	});
	it('ignores what is not a frame of the protocol', () => {
		expect(decodeFrame('not json')).toBeNull();
		expect(decodeFrame('{"a":1}')).toBeNull();
		expect(decode([42])).toBeNull();
		expect(decode([0, 'late'])).toBeNull();
		expect(decode([2, 1, 1, 1, 1, 7, 'q', ['a']])).toBeNull();
		expect(decode([7, 5])).toBeNull();
		expect(decode([7, 9])).toBeNull();
		expect(decode([8, 7, 1])).toBeNull();
		expect(decode([5, 1, 1, 'x', null, []])).toBeNull();
	});
});

describe('quiz protocol: option bit masks', () => {
	it('puts the first option in bit 0', () => {
		expect(maskOf([0, 2])).toBe(5);
		expect(maskOf([])).toBe(0);
		expect(hasBit(5, 0)).toBe(true);
		expect(hasBit(5, 1)).toBe(false);
		expect(hasBit(5, 2)).toBe(true);
	});
	it('toggles, lists and counts', () => {
		expect(toggleBit(0, 3)).toBe(8);
		expect(toggleBit(8, 3)).toBe(0);
		expect(positionsOf(0b101101)).toEqual([0, 2, 3, 5]);
		expect(bitCount(0b101101)).toBe(4);
		expect(positionsOf(0)).toEqual([]);
	});
});
