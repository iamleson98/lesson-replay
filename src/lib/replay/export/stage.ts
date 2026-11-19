/**
 * What the rendered video shows at a moment: the teacher's screen and nothing
 * else. Only the files of the manifest's teacher count (their shared screen,
 * their camera, their microphone); other people's streams, screen sound and
 * the whiteboard's pointers never reach the picture. The choice reuses the
 * player's own pure functions (`timeline.ts`).
 */

import {
	filesAt,
	participantsAt,
	screenLayersAt,
	shownScreen,
	type RecordingFile
} from '../player/timeline';

/** The teacher's own streams: a screen, its sound, a camera, a microphone. */
export function teacherFiles(files: RecordingFile[], teacherId: string): RecordingFile[] {
	if (!teacherId) return [];
	return files.filter(
		(f) =>
			f.user_id === teacherId &&
			(f.kind === 'screen' ||
				f.kind === 'screen_audio' ||
				f.kind === 'camera' ||
				f.kind === 'voice')
	);
}

/** The teacher's screens playing at t, oldest first (the player's layers, no lead). */
export const screenLayers = (teacher: RecordingFile[], t: number): RecordingFile[] =>
	screenLayersAt(teacher, t);

/** The screen to show at t: the latest started one that has a picture, else the one held. */
export const chooseScreen = (
	layers: RecordingFile[],
	t: number,
	ready: (index: number) => boolean,
	held: number | null
): RecordingFile | null => shownScreen(layers, t, ready, held);

/**
 * The screen to show at t and its picture, decoding as little as possible: the screens
 * covering t are asked newest first and the asking stops at the first that has a picture
 * (the player shows the latest ready one, so the older ones cannot matter). `asked` lists
 * every file that was asked, picture or not: a file whose first frame is still ahead must
 * stay open (it waits for that frame at no cost), while the ones not asked can be parked.
 */
export async function pickScreen<S>(
	layers: RecordingFile[],
	t: number,
	held: number | null,
	pictureOf: (file: RecordingFile) => Promise<S | null>
): Promise<{ shown: RecordingFile | null; picture: S | null; asked: number[] }> {
	const pictures = new Map<number, S>();
	const asked: number[] = [];
	for (let i = layers.length - 1; i >= 0; i--) {
		asked.push(layers[i].index);
		const picture = await pictureOf(layers[i]);
		if (picture) {
			pictures.set(layers[i].index, picture);
			break;
		}
	}
	const shown = chooseScreen(layers, t, (index) => pictures.has(index), held);
	return { shown, picture: shown ? (pictures.get(shown.index) ?? null) : null, asked };
}

/** Whether the teacher's camera is on at any point of the recording. */
export const hasCamera = (teacher: RecordingFile[]): boolean =>
	teacher.some((f) => f.kind === 'camera');

/** The teacher's camera file while the camera is on at t, else null. */
export function cameraAt(
	teacher: RecordingFile[],
	t: number,
	teacherId: string
): RecordingFile | null {
	return participantsAt(teacher, t, teacherId).find((p) => p.teacher)?.camera ?? null;
}

/** The teacher's sound files (microphone, screen sound) covering t. */
export const micsAt = (teacher: RecordingFile[], t: number): RecordingFile[] =>
	filesAt(teacher, t).filter(isSound);

const isSound = (f: RecordingFile): boolean => f.kind === 'voice' || f.kind === 'screen_audio';

/** The sound files (microphone and the sound of a shared screen) that overlap the span [fromMs, toMs). */
export const micsBetween = (
	teacher: RecordingFile[],
	fromMs: number,
	toMs: number
): RecordingFile[] => teacher.filter((f) => isSound(f) && f.start_ms < toMs && f.end_ms > fromMs);

export type StageKind = 'screen' | 'quiz' | 'board';

/**
 * Which presentation is on the stage: the player lets the latest one that
 * began take it (a shared screen, a quiz game), and the board is what is left.
 * `quizSince` is when the game on the stage began (recording ms), `screen` the
 * screen that is shown.
 */
export function chooseStage(
	screen: RecordingFile | null,
	quizOn: boolean,
	quizSince: number
): StageKind {
	if (screen && (!quizOn || screen.start_ms >= quizSince)) return 'screen';
	return quizOn ? 'quiz' : 'board';
}

/** Where a `width` x `height` picture sits inside a box, whole and centred. */
export function fitRect(
	width: number,
	height: number,
	boxW: number,
	boxH: number
): { x: number; y: number; w: number; h: number } {
	if (width <= 0 || height <= 0) return { x: 0, y: 0, w: boxW, h: boxH };
	const scale = Math.min(boxW / width, boxH / height);
	const w = width * scale;
	const h = height * scale;
	return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}
