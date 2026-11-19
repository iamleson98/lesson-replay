import { describe, expect, it } from 'vitest';
import { parseBoardLog } from '#lib/replay/player/board-replay.svelte.js';
import { QuestReplay } from '#lib/replay/player/quest-replay.svelte.js';
import { QuizReplay, quizRecords } from '#lib/replay/player/quiz-replay.svelte.js';
import { remainingMs } from '#lib/replay/quiz/clock.js';
import { t } from '#lib/replay/i18n/strings.svelte.js';

const rec = (at: number, q: unknown[]) => JSON.stringify({ t: at, k: 'quiz', q });
// Frames as the service sends them (its clock is 5,000,000 at the time of the first frame).
const SERVICE = 5_000_000;
const log = [
	rec(1_000, [1, SERVICE, 'Maths', 2, 3]),
	rec(2_000, [2, SERVICE + 1_000, 1, 2, SERVICE + 21_000, 0, 'What is 2+2?', ['3', '4']]),
	rec(3_000, [4, 2, 3, [1, 1]]),
	rec(22_000, [
		5,
		1,
		1,
		[1, 2],
		null,
		[
			['An', 1000],
			['', 900],
			['Bo', 500]
		]
	]),
	rec(30_000, [
		6,
		[
			['An', 2000],
			['', 1900],
			['Bo', 500]
		],
		// the host form the server writes: the same masked top three twice
		[
			['An', 2000],
			['', 1900],
			['Bo', 500]
		]
	]),
	rec(40_000, [7, 0])
].join('\n');

const make = (text = log) => {
	const time = { now: 0 };
	const replay = new QuizReplay(quizRecords(parseBoardLog(text)), () => time.now);
	return { replay, time, at: (ms: number) => ((time.now = ms), replay.seek(ms)) };
};

describe('quiz records in the board log', () => {
	it('are kept by the parser (the board ignores them) and decoded in time order', () => {
		const records = parseBoardLog(`${log}\n{"t":1,"k":"quiz","q":"nope"}`);
		expect(records.filter((r) => r.k === 'quiz')).toHaveLength(7);
		expect(quizRecords(records).map((r) => r.frame.type)).toEqual([
			'lobby',
			'question',
			'progress',
			'reveal',
			'podium',
			'ended'
		]);
	});

	it('skips a record that is not a frame of the protocol', () => {
		const text = [rec(1, [99]), rec(2, [3, 4])].join('\n');
		expect(quizRecords(parseBoardLog(text)).map((r) => r.frame.type)).toEqual(['count']);
	});
});

describe('QuizReplay.has', () => {
	it('is false for a log where someone only opened the quiz page', () => {
		const idle = make([rec(500, [0, SERVICE]), rec(900, [3, 2])].join('\n'));
		expect(idle.replay.has).toBe(false);
	});

	it('is true once a lobby, a question or a Quest frame was logged', () => {
		expect(make(rec(1, [1, SERVICE, 'Maths', 2, 3])).replay.has).toBe(true);
		expect(make(rec(1, [2, SERVICE, 1, 1, SERVICE + 5, 0, 'Q', ['a', 'b']])).replay.has).toBe(
			true
		);
		expect(make(rec(1, [20, SERVICE, 'Quest', 5, 3, 300, 0])).replay.has).toBe(true);
		expect(make(rec(1, [22, SERVICE, SERVICE + 5])).replay.has).toBe(true);
	});
});

describe('QuizReplay', () => {
	it('takes the stage with the lobby and gives it back at the end frame', () => {
		const { replay, at } = make();
		at(500);
		expect(replay.on).toBe(false);
		at(1_500);
		expect(replay.on).toBe(true);
		expect(replay.game.phase).toBe('lobby');
		at(41_000);
		expect(replay.on).toBe(false);
	});

	it('seeks forward and back across the reveal and the podium', () => {
		const { replay, at } = make();
		at(25_000);
		expect(replay.game.phase).toBe('reveal');
		expect(replay.game.stage).toBe(2);
		at(35_000);
		expect(replay.game.phase).toBe('podium');
		expect(replay.game.podium?.top.map((l) => l.name)).toEqual([
			'An',
			t('replay.quiz.student'),
			'Bo'
		]);
		expect(replay.game.podium?.all?.[1].name).toBe(t('replay.quiz.student'));
		at(2_500);
		expect(replay.game.phase).toBe('question');
		expect(replay.game.reveal).toBeNull();
		expect(replay.game.podium).toBeNull();
		at(1_200);
		expect(replay.game.phase).toBe('lobby');
	});

	it('puts the question deadline on the recording clock (t + endsAt - now)', () => {
		const { replay, at } = make();
		at(2_500);
		// asked at 2,000 ms with 20 s to answer
		expect(replay.game.question?.endsAt).toBe(22_000);
		expect(replay.game.question?.limitMs).toBe(20_000);
	});

	it('counts down from the player clock, through a seek and a pause', () => {
		const { replay, time, at } = make();
		at(2_000);
		const question = replay.game.question!;
		expect(remainingMs(question.endsAt, replay.now(), replay.clockOffset)).toBe(20_000);
		time.now = 12_000;
		at(12_000);
		expect(remainingMs(question.endsAt, replay.now(), replay.clockOffset)).toBe(10_000);
		time.now = 2_500;
		at(2_500);
		expect(remainingMs(replay.game.question!.endsAt, replay.now(), 0)).toBe(19_500);
	});

	it('shows a blanked name as "A student" and keeps the score', () => {
		const { replay, at } = make();
		at(25_000);
		expect(replay.game.reveal?.top.map((l) => l.name)).toEqual([
			'An',
			t('replay.quiz.student'),
			'Bo'
		]);
		expect(replay.game.reveal?.top[1].score).toBe(900);
	});
});

describe('QuestReplay', () => {
	const quest = [
		rec(1_000, [20, SERVICE, 'Quest', 5, 3, 300, 0]),
		rec(2_000, [22, SERVICE + 1_000, SERVICE + 301_000]),
		rec(3_000, [
			29,
			[
				['An', 3, 120],
				['', 5, 80]
			],
			4,
			10,
			7,
			290_000
		]),
		rec(9_000, [
			6,
			[
				['An', 500],
				['', 400]
			],
			[
				['An', 500],
				['', 400]
			]
		]),
		rec(9_500, [7, 0])
	].join('\n');

	it('follows the lobby, the running board and the podium, and rebases the end time', () => {
		const replay = new QuestReplay(quizRecords(parseBoardLog(quest)));
		replay.seek(1_500);
		expect(replay.game.phase).toBe('lobby');
		replay.seek(4_000);
		expect(replay.game.phase).toBe('running');
		expect(replay.game.endsAt).toBe(2_000 + 300_000);
		expect(replay.game.board.top.map((r) => r.name)).toEqual(['An', t('replay.quiz.student')]);
		replay.seek(9_200);
		expect(replay.game.phase).toBe('podium');
		expect(replay.game.podium?.top[1].name).toBe(t('replay.quiz.student'));
		replay.seek(1_500);
		expect(replay.game.phase).toBe('lobby');
	});

	it('routes the stage to Quest from its first frame to the end frame', () => {
		const { replay, at } = make(quest);
		at(1_500);
		expect(replay.mode).toBe('quest');
		expect(replay.on).toBe(true);
		at(9_700);
		expect(replay.on).toBe(false);
		expect(replay.mode).toBe('race');
	});
});
