import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuizGame } from '#lib/replay/quiz/game.svelte.js';
import { remainingMs } from '#lib/replay/quiz/clock.js';
import { decodeFrame } from '#lib/replay/quiz/protocol.js';

const frame = (f: unknown[]) => {
	const decoded = decodeFrame(JSON.stringify(f));
	if (!decoded) throw new Error('bad frame');
	return decoded;
};
const QUESTION = [2, 1000, 1, 3, 21_000, 0, '1/2 + 1/2', ['1', '2', '0']];

describe('QuizGame', () => {
	it('walks the phases of a round', () => {
		const g = new QuizGame();
		expect(g.active).toBe(false);
		g.apply(frame([0, 1]));
		expect(g.phase).toBe('none');
		g.apply(frame([1, 2, 'Fractions', 3, 12]));
		expect(g).toMatchObject({
			phase: 'lobby',
			title: 'Fractions',
			questionCount: 3,
			players: 12
		});
		g.apply(frame([3, 14]));
		expect(g.players).toBe(14);
		g.apply(frame(QUESTION));
		expect(g.phase).toBe('question');
		expect(g.question).toMatchObject({ q: 1, count: 3, endsAt: 21_000, limitMs: 20_000 });
		g.apply(frame([4, 5, 14]));
		expect(g.answered).toBe(5);
		g.apply(frame([5, 1, 2, [1, 4, 0], null, [['An', 1000]], 1000, 1, 1000, 1, 2, 1, 0]));
		expect(g.phase).toBe('reveal');
		expect(g.reveal?.personal).toMatchObject({
			right: true,
			points: 1000,
			streak: 1,
			bonus: 0
		});
		g.apply(frame([6, [['An', 2980]], 2980, 1]));
		expect(g.phase).toBe('podium');
		expect(g.podium?.me).toEqual({ score: 2980, rank: 1 });
		g.apply(frame([7, 0]));
		expect(g.phase).toBe('none');
		expect(g.endedReason).toBe(0);
		expect(g.active).toBe(false);
	});

	it('locks an answer on the ack and clears it for the next question', () => {
		const g = new QuizGame();
		g.apply(frame(QUESTION));
		g.choose(2);
		expect(g).toMatchObject({ myMask: 2, locked: false });
		g.apply(frame([9]));
		expect(g.locked).toBe(true);
		g.apply(frame([2, 30_000, 2, 3, 50_000, 1, 'next', ['a', 'b']]));
		expect(g).toMatchObject({ myMask: null, locked: false });
	});

	it('resumes mid-question with the answer already given, and keeps the first time limit', () => {
		const g = new QuizGame();
		g.apply(frame([...QUESTION, 4]));
		expect(g).toMatchObject({ myMask: 4, locked: true });
		g.apply(frame([2, 15_000, 1, 3, 21_000, 0, '1/2 + 1/2', ['1', '2', '0'], 4]));
		expect(g.question?.limitMs).toBe(20_000);
	});

	it('lets the player answer again when the answer was lost with the old socket', () => {
		const g = new QuizGame();
		g.apply(frame(QUESTION));
		g.choose(1); // sent into a socket that was already dead: no ack
		expect(g).toMatchObject({ myMask: 1, locked: false });
		// the resumed socket's first frame: the service has no answer
		g.apply(frame([2, 9_000, 1, 3, 21_000, 0, '1/2 + 1/2', ['1', '2', '0'], 0]));
		expect(g).toMatchObject({ myMask: null, locked: false, refused: false });
		expect(g.question?.limitMs).toBe(20_000);
	});

	it('marks a refused answer (joined late) and shows the wait state', () => {
		const g = new QuizGame();
		g.apply(frame([...QUESTION, 0]));
		g.choose(1);
		g.apply(frame([8, 5, 4]));
		expect(g).toMatchObject({ refused: true, myMask: null, locked: false });
		// the next question gives a fresh start
		g.apply(frame([2, 30_000, 2, 3, 50_000, 0, 'next', ['a', 'b']]));
		expect(g.refused).toBe(false);
	});

	it('keeps a host command refusal for the screen', () => {
		const g = new QuizGame();
		g.apply(frame([8, 5, 1]));
		expect(g.commandError).toEqual({ code: 5, request: 1 });
	});

	it('clears a refusal when the game moves to a new phase', () => {
		const g = new QuizGame();
		g.apply(frame([1, 2, 'Fractions', 3, 12]));
		g.apply(frame([8, 5, 2]));
		expect(g.commandError).toEqual({ code: 5, request: 2 });
		g.apply(frame(QUESTION));
		expect(g.commandError).toBeNull();
		g.apply(frame([8, 5, 3]));
		g.apply(frame([6, [['An', 2980]], 2980, 1]));
		expect(g.commandError).toBeNull();
	});

	it('keeps an answer the service confirmed when a second, refused one comes back', () => {
		const g = new QuizGame();
		g.apply(frame(QUESTION));
		g.choose(2);
		g.apply(frame([9]));
		g.apply(frame([8, 5, 4]));
		expect(g).toMatchObject({ myMask: 2, locked: true, refused: false });
	});

	it('forgets the game when a new idle frame arrives', () => {
		const g = new QuizGame();
		g.apply(frame(QUESTION));
		g.apply(frame([0, 9]));
		expect(g).toMatchObject({ phase: 'none', question: null, players: 0 });
	});
});

describe("QuizGame: the host's live view", () => {
	it('keeps the live counts per option, a new question starts them again', () => {
		const g = new QuizGame();
		g.apply(frame(QUESTION));
		expect(g.counts).toEqual([]);
		g.apply(frame([4, 2, 10, [1, 1, 0]]));
		expect(g).toMatchObject({ answered: 2, players: 10 });
		expect(g.counts).toEqual([1, 1, 0]);
		g.apply(frame([4, 5, 10, [3, 1, 1]]));
		expect(g.counts).toEqual([3, 1, 1]);
		g.apply(frame([4, 6, 10]));
		expect(g.counts).toEqual([3, 1, 1]); // a progress frame without counts changes none
		g.apply(
			frame([
				4,
				7,
				10,
				[3, 2, 1],
				[
					['An', 900],
					['Binh', 400]
				]
			])
		);
		expect(g.ranking).toEqual([
			{ name: 'An', score: 900 },
			{ name: 'Binh', score: 400 }
		]);
		g.apply(frame([2, 30_000, 2, 3, 50_000, 0, 'next', ['a', 'b']]));
		expect(g.counts).toEqual([]);
		expect(g.ranking).toEqual([]); // the provisional ranking belongs to one question
	});

	it('collects the names of who joined, for one game', () => {
		const g = new QuizGame();
		g.apply(frame([1, 2, 'Fractions', 3, 2]));
		g.apply(frame([10, ['An', 'Bình']]));
		g.apply(frame([10, ['Chi']]));
		expect(g.joined).toEqual(['An', 'Bình', 'Chi']);
		g.apply(frame([7, 0]));
		expect(g.joined).toEqual([]);
		g.apply(frame([1, 3, 'Next game', 3, 0]));
		expect(g.joined).toEqual([]);
	});
});

const line = (name: string, score: number) => ({ name, score });

describe("QuizGame: the player's race", () => {
	const reveal = (rank: number, streak: number, top: unknown[]) =>
		frame([
			5,
			1,
			1,
			[1, 0],
			null,
			top,
			500,
			rank,
			500,
			1,
			1,
			streak,
			streak > 1 ? 100 * (streak - 1) : 0
		]);

	it('takes the streak from the server and remembers the rank and top five before', () => {
		const g = new QuizGame();
		g.apply(frame(QUESTION));
		g.apply(reveal(4, 1, [['An', 900]]));
		expect(g).toMatchObject({ streak: 1, rank: 4, prevRank: 0, prevTop: [] });
		g.apply(frame(QUESTION));
		g.apply(
			reveal(2, 2, [
				['An', 1500],
				['Binh', 1400]
			])
		);
		expect(g).toMatchObject({ streak: 2, rank: 2, prevRank: 4 });
		expect(g.prevTop).toEqual([{ name: 'An', score: 900 }]);
		expect(g.reveal?.personal?.bonus).toBe(100);
		// What a player sees between reveals: the standings and score as of the last one.
		expect(g.standings).toEqual([line('An', 1500), line('Binh', 1400)]);
		expect(g.score).toBe(500);
		g.apply(frame(QUESTION));
		expect(g.standings).toHaveLength(2);
		expect(g.ranking).toEqual([]);
	});

	it('starts again with a new game', () => {
		const g = new QuizGame();
		g.apply(reveal(2, 3, [['An', 900]]));
		g.apply(frame([1, 5, 'Again', 3, 1]));
		expect(g).toMatchObject({ streak: 0, rank: 0, prevRank: 0, prevTop: [] });
	});
});

describe('QuizGame: a resume at the reveal', () => {
	it('puts back the question a reloaded page never saw, only for its own reveal', () => {
		const g = new QuizGame();
		g.apply(frame([5, 2, 1, [1, 0], null, [['An', 10]]]));
		const q = {
			q: 2,
			count: 3,
			endsAt: 1,
			kind: 0 as const,
			text: 'Q2',
			options: ['a', 'b'],
			limitMs: 1
		};
		g.restore({ ...q, q: 1 });
		expect(g.question).toBeNull();
		g.restore(q);
		expect(g.question?.text).toBe('Q2');
	});
});

describe('QuizGame: the closing beat and the staged reveal', () => {
	afterEach(() => vi.useRealTimers());
	const REVEAL = [5, 1, 2, [1, 4, 0], 'because', [['An', 1000]], 1000, 1, 1000, 1, 2, 1, 0];

	it('locks the question on closed and shows nothing of the answer yet', () => {
		const g = new QuizGame();
		g.apply(frame(QUESTION));
		g.apply(frame([11, 1]));
		expect(g.closing).toBe(true);
		expect(g.phase).toBe('question');
		expect(g.reveal).toBeNull();
		g.apply(frame([11, 9])); // another question's: ignored
		g.apply(frame(QUESTION));
		expect(g.closing).toBe(false);
	});

	it('stages the reveal from the one frame: verdict, then explanation, then ranking', () => {
		vi.useFakeTimers();
		const g = new QuizGame();
		g.apply(frame(QUESTION));
		g.apply(frame([11, 1]));
		g.apply(frame(REVEAL));
		expect(g).toMatchObject({ phase: 'reveal', closing: false, stage: 0 });
		vi.advanceTimersByTime(799);
		expect(g.stage).toBe(0);
		vi.advanceTimersByTime(1);
		expect(g.stage).toBe(1);
		vi.advanceTimersByTime(999);
		expect(g.stage).toBe(1);
		vi.advanceTimersByTime(1);
		expect(g.stage).toBe(2);
	});

	it('skips to the end of the stages, and a new question leaves none pending', () => {
		vi.useFakeTimers();
		const g = new QuizGame();
		g.apply(frame(QUESTION));
		g.apply(frame(REVEAL));
		g.skipStages();
		expect(g.stage).toBe(2);
		g.apply(frame(QUESTION));
		g.apply(frame(REVEAL));
		expect(g.stage).toBe(0);
		g.apply(frame(QUESTION));
		vi.advanceTimersByTime(5000);
		expect(g.stage).toBe(2);
		expect(g.phase).toBe('question');
	});
});

describe('countdown', () => {
	it('draws the server deadline on the corrected local clock', () => {
		// the local clock is 5 s behind the server's: offset +5000
		expect(remainingMs(21_000, 10_000, 5_000)).toBe(6_000);
		expect(remainingMs(21_000, 16_000, 5_000)).toBe(0);
		expect(remainingMs(21_000, 99_000, 5_000)).toBe(0);
		// a local clock ahead of the server's: offset negative
		expect(remainingMs(21_000, 25_000, -5_000)).toBe(1_000);
	});
});
