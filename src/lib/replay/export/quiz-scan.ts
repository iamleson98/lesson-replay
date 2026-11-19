/**
 * A made-up game that shows every screen the quiz stages have (a race's lobby,
 * a question calm and urgent, the reveal, the podium, the empty stage after the
 * game, a Quest's lobby, its empty board, its board, its last seconds and its
 * podium). The render mounts the stage at each of these times once, before the
 * first frame, so the style sheets can be cut to the rules the screens use.
 * The frames are those of a recording's board log, in the service's own shapes.
 */

import type { BoardRecord } from '../player/board-replay.svelte';
import { quizRecords, type QuizRecord } from '../player/quiz-replay.svelte';

/** The quiz service's clock at the first frame (the recording's own clock replaces it). */
const SERVICE = 5_000_000;

const top = [
	['Anna', 1800],
	['Binh', 1650],
	['Chi', 1400],
	['', 1200],
	['Duc', 900]
];
const names = ['Anna', 'Binh', 'Chi', '', 'Duc', 'Em', 'Fong', 'Giang'];
const at = (t: number, q: unknown[]): BoardRecord => ({ t, k: 'quiz', q });

const records: BoardRecord[] = [
	at(1_000, [1, SERVICE, 'Geography', 4, 12]),
	at(2_000, [
		2,
		SERVICE + 1_000,
		1,
		4,
		SERVICE + 21_000,
		0,
		'What is the capital?',
		['Hanoi', 'Hue', 'Da Nang', 'Can Tho']
	]),
	at(3_000, [4, 7, 12, [3, 2, 1, 1]]),
	at(22_000, [5, 1, 1, [8, 2, 1, 1], null, top]),
	at(30_000, [6, top, top]),
	at(40_000, [7, 0]),
	at(50_000, [20, SERVICE, 'Quest', 5, 3, 300, 0]),
	at(51_000, [22, SERVICE + 1_000, SERVICE + 301_000]),
	at(53_000, [29, names.map((n, i) => [n, 6 - (i % 5), 400 - i * 37]), 8, 40, 31, 290_000]),
	at(400_000, [6, top, top])
];

/** The made-up game's frames. */
export const scanRecords = (): QuizRecord[] => quizRecords(records);

/** Times (ms) at which the stage shows each screen, in order (the replay moves forward only). */
export const SCAN_TIMES = [
	500, // nothing yet
	1_500, // race lobby
	3_500, // question
	20_500, // question, last seconds
	23_000, // reveal
	31_000, // podium
	41_000, // the game ended
	50_500, // Quest lobby
	52_000, // Quest, empty board
	54_000, // Quest board
	330_000, // Quest, last seconds
	401_000 // Quest podium
] as const;
