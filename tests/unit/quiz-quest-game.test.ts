import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	BANNER_MS,
	BEAT_MS,
	OUTCOME_MS,
	QUEST_REQUEST,
	QuestGame,
	WAIT_RETRY_MS
} from '#lib/replay/quiz/quest/quest-game.svelte.js';
import { decodeQuestFrame } from '#lib/replay/quiz/quest/quest-protocol.js';
import { decodeFrame } from '#lib/replay/quiz/protocol.js';

let sent: string[] = [];
let open = true;
const make = () =>
	new QuestGame({
		send: (frame) => {
			if (open) sent.push(frame);
			return open;
		}
	});

/** Applies a frame as the room does: Quest's own are decoded here, the race's shared ones by the race decoder. */
function feed(g: QuestGame, frame: unknown[]) {
	const raw = decodeFrame(JSON.stringify(frame));
	if (!raw) throw new Error('bad frame');
	if (raw.type === 'quest') {
		const decoded = decodeQuestFrame(raw.frame);
		if (!decoded) throw new Error('bad quest frame');
		g.apply(decoded);
	} else g.apply(raw as Parameters<QuestGame['apply']>[0]);
}

const LOBBY = [20, 1000, 'Fractions', 24, 12, 300, 0];
const RUNNING = [22, 2000, 302_000];
const question = (serial: number, remaining = 30_000) => [
	24,
	0,
	`Q${serial}`,
	['a', 'b', 'c', 'd'],
	30,
	serial,
	remaining
];

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(1_000_000);
	sent = [];
	open = true;
});
afterEach(() => vi.useRealTimers());

function playing() {
	const g = make();
	feed(g, LOBBY);
	feed(g, RUNNING);
	feed(g, question(1));
	return g;
}

describe('QuestGame: the lobby and the character', () => {
	it('walks lobby, running and the podium, and clears when it ends', () => {
		const g = make();
		expect(g.active).toBe(false);
		feed(g, LOBBY);
		expect(g).toMatchObject({
			phase: 'lobby',
			title: 'Fractions',
			questionCount: 24,
			players: 12,
			seconds: 300,
			friendly: false
		});
		feed(g, [3, 14]);
		expect(g.players).toBe(14);
		feed(g, RUNNING);
		expect(g).toMatchObject({ phase: 'running', endsAt: 302_000 });
		feed(g, [6, [['An', 300]], 120, 2]);
		expect(g.phase).toBe('podium');
		expect(g.podium?.me).toEqual({ score: 120, rank: 2 });
		feed(g, [7, 0]);
		expect(g).toMatchObject({ phase: 'none', endedReason: 0, active: false, title: '' });
	});

	it('sends the character choice, keeps it, and takes it back when the server refuses', () => {
		const g = make();
		feed(g, LOBBY);
		expect(g.chooseCharacter(4)).toBe(true);
		expect(sent).toEqual(['[5,4]']);
		expect(g.character).toBe(4);
		expect(g.chooseCharacter(4)).toBe(true);
		expect(sent).toHaveLength(1);
		feed(g, [8, 4, QUEST_REQUEST.character]);
		expect(g.character).toBe(0);
		open = false;
		expect(g.chooseCharacter(9)).toBe(false);
		expect(g.character).toBe(0);
	});

	it('keeps the player’s character when the lobby frame is seen again (a reconnect)', () => {
		const g = make();
		feed(g, LOBBY);
		g.chooseCharacter(6);
		feed(g, LOBBY);
		expect(g.character).toBe(6);
	});

	it('keeps the host’s roster with characters, merging changes by name', () => {
		const g = make();
		feed(g, LOBBY);
		feed(g, [
			21,
			[
				['An', 1],
				['Binh', 2]
			]
		]);
		feed(g, [
			21,
			[
				['An', 5],
				['Chi', 7]
			]
		]);
		expect(g.roster).toEqual([
			{ name: 'An', character: 5 },
			{ name: 'Binh', character: 2 },
			{ name: 'Chi', character: 7 }
		]);
		expect(g.characterOf('Chi')).toBe(7);
		expect(g.characterOf('Nobody')).toBeNull();
	});
});

describe('QuestGame: a right answer, the chests and the outcome', () => {
	it('shows the question at once with its own clock from the frame', () => {
		const g = playing();
		expect(g.screen).toBe('question');
		expect(g.question).toMatchObject({
			serial: 1,
			text: 'Q1',
			limitMs: 30_000,
			endsAt: 1_030_000
		});
	});

	it('sends the answer with its serial, locks, and holds the verdict for the suspense beat', () => {
		const g = playing();
		expect(g.answer(2)).toBe(true);
		expect(sent).toEqual(['[6,1,2]']);
		expect(g).toMatchObject({ locked: true, chosen: 2 });
		expect(g.answer(1)).toBe(false);
		feed(g, [25, 1, 1, 19, 1, 0, 19, 0]);
		// nothing of the verdict yet: still the locked question, coins unchanged
		expect(g).toMatchObject({ screen: 'question', coins: 0, streak: 0, verdict: null });
		vi.advanceTimersByTime(BEAT_MS - 1);
		expect(g.screen).toBe('question');
		vi.advanceTimersByTime(1);
		expect(g).toMatchObject({ screen: 'chests', coins: 19, streak: 1, chestSerial: 1 });
		expect(g.verdict).toMatchObject({ right: true, earned: 19 });
	});

	it('picks a chest once, holds its result for the beat, then shows the outcome card', () => {
		const g = playing();
		g.answer(1);
		feed(g, [25, 1, 1, 19, 1, 0, 19, 0]);
		vi.advanceTimersByTime(BEAT_MS);
		sent = [];
		expect(g.pickChest(2)).toBe(true);
		expect(sent).toEqual(['[7,1,2]']);
		expect(g.picked).toBe(2);
		expect(g.pickChest(0)).toBe(false);
		feed(g, [26, 1, 2, 0, 20, 39, [5, 20, 0, 40, 0, 20], null, 0]);
		feed(g, question(2));
		expect(g).toMatchObject({ screen: 'chests', coins: 19, outcome: null });
		vi.advanceTimersByTime(BEAT_MS);
		expect(g).toMatchObject({ screen: 'outcome', coins: 39 });
		expect(g.outcome).toMatchObject({ kind: 0, amount: 20, picked: 2 });
		// the next question waits behind the card, then comes
		vi.advanceTimersByTime(OUTCOME_MS - 1);
		expect(g.screen).toBe('outcome');
		vi.advanceTimersByTime(1);
		expect(g).toMatchObject({ screen: 'question', locked: false, chosen: null });
		expect(g.question?.serial).toBe(2);
	});

	it('lets the player move on from the outcome card at once', () => {
		const g = playing();
		g.answer(1);
		feed(g, [25, 1, 1, 19, 1, 0, 19, 0]);
		vi.advanceTimersByTime(BEAT_MS);
		g.pickChest(0);
		feed(g, [26, 1, 0, 2, 0, 19, [2, 0, 0, 20, 0, 20], null, 0]);
		feed(g, question(2));
		vi.advanceTimersByTime(BEAT_MS);
		expect(g.screen).toBe('outcome');
		expect(g.booster).toBe(3);
		g.moveOn();
		expect(g.screen).toBe('question');
		expect(g.question?.serial).toBe(2);
	});

	it('does not give the held-up question more time: its clock runs from its arrival', () => {
		const g = playing();
		g.answer(1);
		feed(g, [25, 1, 1, 19, 1, 0, 19, 0]);
		vi.advanceTimersByTime(BEAT_MS);
		g.pickChest(1);
		feed(g, [26, 1, 1, 3, 0, 19, [5, 20, 3, 0, 0, 20], null, 0]);
		feed(g, question(2, 29_000));
		const arrived = Date.now();
		vi.advanceTimersByTime(BEAT_MS + OUTCOME_MS);
		expect(g.shield).toBe(true);
		expect(g.question?.endsAt).toBe(arrived + 29_000);
	});

	it('reports each kind of chest: steal, blocked steal, slip', () => {
		const g = playing();
		g.answer(1);
		feed(g, [25, 1, 1, 19, 1, 0, 19, 0]);
		vi.advanceTimersByTime(BEAT_MS);
		g.pickChest(0);
		feed(g, [26, 1, 0, 4, 40, 59, [4, 40, 0, 20, 0, 20], 'Binh', 0]);
		vi.advanceTimersByTime(BEAT_MS);
		expect(g.outcome).toMatchObject({ kind: 4, amount: 40, victim: 'Binh', blocked: false });
		expect(g.coins).toBe(59);
	});
});

describe('QuestGame: a wrong or missed answer', () => {
	it('shows the right answer and the explanation for the pause, then the next question', () => {
		const g = playing();
		g.answer(3);
		feed(g, [25, 1, 0, 0, 0, 0, 0, 5, 2500, 'because']);
		feed(g, question(2));
		expect(g.screen).toBe('question');
		vi.advanceTimersByTime(BEAT_MS);
		expect(g).toMatchObject({ screen: 'pause', streak: 0, pauseMs: 2500 });
		expect(g.verdict).toMatchObject({
			right: false,
			correctMask: 5,
			explanation: 'because',
			missed: false
		});
		// the question the server already served waits for the pause
		vi.advanceTimersByTime(2499);
		expect(g.screen).toBe('pause');
		vi.advanceTimersByTime(1);
		expect(g.screen).toBe('question');
		expect(g.question?.serial).toBe(2);
	});

	it('shows a missed question at once (the time was already up)', () => {
		const g = playing();
		feed(g, [25, 1, 2, 0, 0, 0, 0, 1, 2500, null]);
		expect(g.screen).toBe('pause');
		expect(g.verdict).toMatchObject({ right: false, missed: true });
	});

	it('ends the streak', () => {
		const g = playing();
		g.answer(1);
		feed(g, [25, 1, 1, 19, 4, 0, 19, 0]);
		vi.advanceTimersByTime(BEAT_MS);
		expect(g.streak).toBe(4);
		g.pickChest(0);
		feed(g, [26, 1, 0, 0, 20, 39, [0, 20, 0, 20, 0, 20], null, 0]);
		feed(g, question(2));
		vi.advanceTimersByTime(BEAT_MS + OUTCOME_MS);
		g.answer(2);
		feed(g, [25, 2, 0, 0, 0, 0, 39, 1, 2500, null]);
		vi.advanceTimersByTime(BEAT_MS);
		expect(g.streak).toBe(0);
	});
});

describe('QuestGame: serials, refusals and the answer rules', () => {
	it('refuses to answer with no open question, an empty choice, or a closed socket', () => {
		const g = make();
		feed(g, LOBBY);
		expect(g.answer(1)).toBe(false);
		feed(g, RUNNING);
		feed(g, question(1));
		expect(g.answer(0)).toBe(false);
		open = false;
		expect(g.answer(1)).toBe(false);
		expect(g.locked).toBe(false);
	});

	it('unlocks when the answer is refused and says it was too late for error 5', () => {
		const g = playing();
		g.answer(1);
		vi.advanceTimersByTime(31_000);
		feed(g, [8, 5, QUEST_REQUEST.answer]);
		expect(g).toMatchObject({ locked: false, chosen: null, refused: true, tooFast: false });
		g.answer(2);
		expect(g.refused).toBe(false);
		feed(g, [8, 4, QUEST_REQUEST.answer]);
		expect(g).toMatchObject({ locked: false, refused: false });
	});

	it('lets the player answer again when the service says it was too quick, and says so', () => {
		const g = playing();
		g.answer(1);
		vi.advanceTimersByTime(300);
		feed(g, [8, 5, QUEST_REQUEST.answer]);
		expect(g).toMatchObject({ locked: false, chosen: null, tooFast: true, refused: false });
		expect(g.answer(2)).toBe(true);
		expect(g.tooFast).toBe(false);
		expect(sent.at(-1)).toBe('[6,1,2]');
	});

	it('lets a refused chest be picked again', () => {
		const g = playing();
		g.answer(1);
		feed(g, [25, 1, 1, 19, 1, 0, 19, 0]);
		vi.advanceTimersByTime(BEAT_MS);
		g.pickChest(1);
		feed(g, [8, 5, QUEST_REQUEST.pick]);
		expect(g.picked).toBeNull();
		expect(g.pickChest(0)).toBe(true);
	});

	it('keeps a refused host command for the screen to explain', () => {
		const g = make();
		feed(g, LOBBY);
		feed(g, [8, 5, QUEST_REQUEST.next]);
		expect(g.commandError).toEqual({ code: 5, request: 2 });
	});
});

describe('QuestGame: events, standings, the board', () => {
	it('shows a steal against the player at once as a banner that goes away, with the new coins', () => {
		const g = playing();
		feed(g, [27, 0, 'Binh', 12, 80]);
		expect(g.coins).toBe(80);
		expect(g.banner).toMatchObject({ kind: 'stolen', thief: 'Binh', amount: 12 });
		vi.advanceTimersByTime(BANNER_MS - 1);
		expect(g.banner).not.toBeNull();
		vi.advanceTimersByTime(1);
		expect(g.banner).toBeNull();
	});

	it('uses the shield up on a blocked steal and the booster up when it ends', () => {
		const g = playing();
		g.answer(1);
		feed(g, [25, 1, 1, 19, 1, 0, 19, 0]);
		vi.advanceTimersByTime(BEAT_MS);
		g.pickChest(1);
		feed(g, [26, 1, 1, 3, 0, 19, [5, 20, 3, 0, 0, 20], null, 0]);
		vi.advanceTimersByTime(BEAT_MS);
		expect(g.shield).toBe(true);
		feed(g, [27, 1, 'Binh']);
		expect(g.shield).toBe(false);
		expect(g.banner).toMatchObject({ kind: 'blocked', thief: 'Binh' });
		g.booster = 2;
		feed(g, [27, 2]);
		expect(g.booster).toBe(0);
		expect(g.banner).toMatchObject({ kind: 'boosterEnded' });
	});

	it('replaces a banner with the next and keeps only the newest one’s timer', () => {
		const g = playing();
		feed(g, [27, 0, 'Binh', 5, 90]);
		vi.advanceTimersByTime(BANNER_MS - 100);
		feed(g, [27, 1, 'An']);
		vi.advanceTimersByTime(200);
		expect(g.banner).toMatchObject({ kind: 'blocked' });
		vi.advanceTimersByTime(BANNER_MS);
		expect(g.banner).toBeNull();
	});

	it('takes the standings strip with the player’s own rank when its frame arrives', () => {
		const g = playing();
		feed(g, [
			28,
			[
				['Binh', 2, 130],
				['An', 4, 39]
			],
			2,
			39
		]);
		expect(g.standings).toHaveLength(2);
		expect(g).toMatchObject({ rank: 2, rankCoins: 39 });
		feed(g, [28, [['An', 4, 90]], 1, 90]);
		expect(g).toMatchObject({ rank: 1, rankCoins: 90 });
		expect(g.characterOf('Binh')).toBe(2);
	});

	it('takes the host’s board and its counts', () => {
		const g = make();
		feed(g, LOBBY);
		feed(g, RUNNING);
		feed(g, [
			29,
			[
				['An', 1, 50],
				['Binh', 2, 20]
			],
			12,
			40,
			30,
			61_000
		]);
		expect(g.board).toMatchObject({ players: 12, answers: 40, correct: 30 });
		expect(g.board.top.map((r) => r.name)).toEqual(['An', 'Binh']);
		expect(g.players).toBe(12);
	});

	it('does not let a late steal frame undo a verdict that is still waiting for its beat', () => {
		const g = playing();
		g.answer(1);
		feed(g, [25, 1, 1, 19, 1, 0, 19, 0]);
		feed(g, [27, 0, 'Binh', 9, 10]);
		// the stolen frame is newer than the verdict: its total wins when the verdict shows
		expect(g.coins).toBe(0);
		vi.advanceTimersByTime(BEAT_MS);
		expect(g.coins).toBe(10);
	});
});

describe('QuestGame: a resumed socket', () => {
	it('takes the whole state and shows a chest that was waiting', () => {
		const g = make();
		feed(g, RUNNING);
		feed(g, [23, 120, 2, 3, 2, 1, 7, 9, 2, 0]);
		expect(g).toMatchObject({
			coins: 120,
			rank: 2,
			streak: 3,
			booster: 2,
			shield: true,
			character: 7,
			screen: 'chests',
			chestSerial: 9,
			picked: null
		});
		expect(g.pickChest(1)).toBe(true);
		expect(sent).toEqual(['[7,9,1]']);
	});

	it('shows the pause that was running, and drops what was held before the connection broke', () => {
		const g = playing();
		g.answer(1);
		feed(g, [25, 1, 1, 19, 1, 0, 19, 0]);
		feed(g, [23, 19, 1, 1, 0, 0, 2, 1, 3, 1800]);
		expect(g).toMatchObject({ screen: 'pause', pauseMs: 1800, verdict: null });
		vi.advanceTimersByTime(BEAT_MS);
		expect(g.screen).toBe('pause');
		feed(g, question(2));
		expect(g.screen).toBe('question');
	});

	it('asks the server for its question once when it has been waiting too long', () => {
		const g = make();
		feed(g, RUNNING);
		feed(g, [23, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
		expect(g.screen).toBe('wait');
		vi.advanceTimersByTime(WAIT_RETRY_MS - 1);
		expect(sent).toEqual([]);
		vi.advanceTimersByTime(1);
		expect(sent).toEqual(['[8]']);
		vi.advanceTimersByTime(WAIT_RETRY_MS * 3);
		expect(sent).toEqual(['[8]']);
	});

	it('does not ask when the question came in time', () => {
		const g = make();
		feed(g, RUNNING);
		feed(g, [23, 0, 0, 0, 0, 0, 0, 0, 1, 0]);
		feed(g, question(1));
		vi.advanceTimersByTime(WAIT_RETRY_MS * 2);
		expect(sent).toEqual([]);
	});
});

describe('QuestGame: the end', () => {
	it('drops everything held when the podium arrives, and stops its timers', () => {
		const g = playing();
		g.answer(1);
		feed(g, [25, 1, 1, 19, 1, 0, 19, 0]);
		feed(g, [27, 0, 'Binh', 9, 10]);
		feed(g, [
			6,
			[
				['An', 300],
				['Binh', 200],
				['Chi', 100]
			],
			10,
			3
		]);
		expect(g.phase).toBe('podium');
		vi.advanceTimersByTime(BEAT_MS * 5);
		expect(g.screen).toBe('question');
		expect(g.podium?.top).toHaveLength(3);
		g.dispose();
		expect(vi.getTimerCount()).toBe(0);
	});

	it('answers the host’s podium with the full order', () => {
		const g = make();
		feed(g, LOBBY);
		feed(g, RUNNING);
		feed(g, [
			6,
			[['An', 300]],
			[
				['An', 300],
				['Binh', 200]
			]
		]);
		expect(g.podium?.all).toHaveLength(2);
	});
});
