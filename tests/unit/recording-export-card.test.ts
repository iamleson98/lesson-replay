import { describe, expect, it } from 'vitest';
import { silence } from '#lib/replay/export/audio-mix.js';
import {
	CARD_TEACHER_CHARS,
	CARD_TITLE_CHARS,
	PREROLLS_MS,
	cardInputs,
	cleanText,
	countdownSeconds,
	fitTitle,
	formatCountdown,
	wrapLines,
	type Measure
} from '#lib/replay/export/card.js';
import {
	BLOCK_SAMPLES,
	FPS,
	blockCount,
	frameCount,
	frameTimeMs,
	frameTimestampUs,
	prerollFrames,
	startsBlock,
	totalFrames
} from '#lib/replay/export/frame-clock.js';
import { parseFragment } from '#lib/replay/export/start.js';

/** Eight pixels a character at 16 px: width grows with the size. */
const measure: Measure = (text, px) => Array.from(text).length * px * 0.5;

describe('the card in the frame clock', () => {
	it('adds the card to the front and keeps the lesson as it was without one', () => {
		expect(prerollFrames(0)).toBe(0);
		expect(prerollFrames(60_000)).toBe(1800);
		expect(prerollFrames(300_000)).toBe(9000);
		for (const preroll of PREROLLS_MS) {
			expect(prerollFrames(preroll) % FPS).toBe(0);
			expect(totalFrames(90_000, preroll)).toBe(frameCount(90_000 + preroll));
		}
		expect(totalFrames(90_000, 0)).toBe(frameCount(90_000));
		expect(totalFrames(1234, 120_000)).toBe(3600 + frameCount(1234));
	});

	it('puts the lesson at t=0 on the frame after the card and keeps the output timestamps whole', () => {
		const cardFrames = prerollFrames(120_000);
		const lessonTime = (i: number) => frameTimeMs(i - cardFrames);
		expect(lessonTime(cardFrames)).toBe(0);
		expect(lessonTime(cardFrames + 30)).toBe(1000);
		expect(lessonTime(cardFrames - 1)).toBeLessThan(0);
		// The output's own timeline starts at the card: a frame's timestamp is its index at the rate.
		expect(frameTimestampUs(0)).toBe(0);
		expect(frameTimestampUs(cardFrames)).toBe(120_000_000);
	});

	it('starts a one-second audio block on the same frames in the card and in the lesson', () => {
		const cardFrames = prerollFrames(300_000);
		for (const i of [0, 29, 30, cardFrames - 1, cardFrames, cardFrames + 29, cardFrames + 30]) {
			expect(startsBlock(i)).toBe(startsBlock(i - cardFrames));
		}
	});

	it('feeds exactly the card length in silent audio before the lesson, block for block', () => {
		const preroll = 120_000;
		const cardFrames = prerollFrames(preroll);
		const duration = 7_000;
		const frames = totalFrames(duration, preroll);
		let silent = 0;
		let lesson = 0;
		for (let i = 0; i < frames; i++) {
			if (!startsBlock(i)) continue;
			if (i - cardFrames < 0) silent++;
			else lesson++;
		}
		expect(silent).toBe(blockCount(preroll));
		expect(silent * BLOCK_SAMPLES).toBe((preroll / 1000) * 48_000);
		expect(lesson).toBe(blockCount(duration));
		expect(silence(BLOCK_SAMPLES).every((x) => x === 0)).toBe(true);
	});
});

describe('the countdown', () => {
	it('opens on the whole length and counts down once a second', () => {
		const cardFrames = prerollFrames(300_000);
		expect(formatCountdown(countdownSeconds(0, cardFrames))).toBe('5:00');
		expect(formatCountdown(countdownSeconds(FPS - 1, cardFrames))).toBe('5:00');
		expect(formatCountdown(countdownSeconds(FPS, cardFrames))).toBe('4:59');
		expect(formatCountdown(countdownSeconds(cardFrames - 1, cardFrames))).toBe('0:01');
	});

	it('changes the text exactly once a second, frame-exact around the minute', () => {
		const cardFrames = prerollFrames(120_000);
		const at = (secondsIn: number, frame = 0) =>
			formatCountdown(countdownSeconds(secondsIn * FPS + frame, cardFrames));
		expect(at(59)).toBe('1:01');
		expect(at(60)).toBe('1:00');
		expect(at(60, FPS - 1)).toBe('1:00');
		expect(at(61)).toBe('0:59');
		expect(at(119)).toBe('0:01');
		const texts = new Set<string>();
		let changes = 0;
		let last = '';
		for (let i = 0; i < cardFrames; i++) {
			const text = formatCountdown(countdownSeconds(i, cardFrames));
			texts.add(text);
			if (text !== last) changes++;
			last = text;
		}
		expect(changes).toBe(120);
		expect(texts.size).toBe(120);
	});

	it('writes minutes and two-digit seconds', () => {
		expect(formatCountdown(600)).toBe('10:00');
		expect(formatCountdown(60)).toBe('1:00');
		expect(formatCountdown(59)).toBe('0:59');
		expect(formatCountdown(9)).toBe('0:09');
		expect(formatCountdown(0)).toBe('0:00');
		expect(formatCountdown(-3)).toBe('0:00');
	});
});

describe('the card inputs', () => {
	const q = (s: string) => new URLSearchParams(s);

	it('draws no card unless the length is one of those offered', () => {
		for (const ok of PREROLLS_MS) expect(cardInputs(q(`preroll=${ok}`)).prerollMs).toBe(ok);
		for (const bad of ['', '1', '59999', '90000', '600001', '-60000', 'abc', '6e4', 'NaN']) {
			expect(cardInputs(q(`preroll=${bad}&card_title=x`)).prerollMs, bad).toBe(0);
		}
		expect(cardInputs(q('')).prerollMs).toBe(0);
	});

	it('bounds the text and drops control characters', () => {
		const long = 'ê'.repeat(200);
		const inputs = cardInputs(
			new URLSearchParams({
				preroll: '60000',
				card_title: ` A\n\tB\u0007${long}`,
				card_teacher: long
			})
		);
		expect(inputs.title.startsWith('AB')).toBe(true);
		expect(Array.from(inputs.title)).toHaveLength(CARD_TITLE_CHARS);
		expect(Array.from(inputs.teacher)).toHaveLength(CARD_TEACHER_CHARS);
		expect(cleanText('a b\u0000c', 10)).toBe('abc');
		expect(cleanText('😀'.repeat(100), 80)).toBe('😀'.repeat(80));
	});

	it('reaches the render from the page address with the accents whole', () => {
		const params = parseFragment(
			'#token=t&recording=r&preroll=300000&card_title=Nh%E1%BA%ADp%20m%C3%B4n%20ti%E1%BA%BFng%20Vi%E1%BB%87t&card_teacher=V%C4%83n%20L%C3%AA'
		);
		expect(params?.card).toEqual({
			prerollMs: 300_000,
			title: 'Nhập môn tiếng Việt',
			teacher: 'Văn Lê'
		});
		expect(parseFragment('#token=t&recording=r')?.card.prerollMs).toBe(0);
	});
});

describe('the title on the card', () => {
	const layout = { maxPx: 56, minPx: 30, maxLines: 2 };

	it('keeps a short title on one line at the largest size', () => {
		expect(fitTitle('Nhập môn tiếng Việt', 1040, measure, layout)).toEqual({
			px: 56,
			lines: ['Nhập môn tiếng Việt']
		});
	});

	it('wraps at word boundaries and shrinks until two lines hold it', () => {
		const title =
			'Ôn tập chương ba: phương trình bậc hai và các ứng dụng thực tế trong đời sống';
		const fitted = fitTitle(title, 1040, measure, layout);
		expect(fitted.lines.length).toBeLessThanOrEqual(2);
		expect(fitted.px).toBeLessThan(56);
		expect(fitted.px).toBeGreaterThanOrEqual(30);
		expect(fitted.lines.join(' ')).toBe(title);
		for (const line of fitted.lines) expect(measure(line, fitted.px)).toBeLessThanOrEqual(1040);
		// One step larger would not have fit.
		expect(wrapLines(title, 1040, fitted.px + 2, measure).length).toBeGreaterThan(2);
	});

	it('cuts what does not fit even at the smallest size with an ellipsis', () => {
		const title = 'chữ '.repeat(60).trim();
		const fitted = fitTitle(title, 1040, measure, layout);
		expect(fitted.px).toBe(30);
		expect(fitted.lines).toHaveLength(2);
		expect(fitted.lines[1].endsWith('…')).toBe(true);
		for (const line of fitted.lines) expect(measure(line, 30)).toBeLessThanOrEqual(1040);
	});

	it('breaks a word wider than a line instead of overflowing', () => {
		const lines = wrapLines('x'.repeat(100), 200, 20, measure);
		expect(lines.length).toBeGreaterThan(1);
		for (const line of lines) expect(measure(line, 20)).toBeLessThanOrEqual(200);
		expect(lines.join('')).toBe('x'.repeat(100));
	});

	it('has nothing to draw for an empty title', () => {
		expect(fitTitle('', 1040, measure, layout).lines).toEqual([]);
	});
});
