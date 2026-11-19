/**
 * What a recording shows at a moment: the files of its manifest that
 * cover it. A file is one continuous stream of one person (a camera from
 * on to off, a voice while unmuted, a shared screen), placed on the
 * recording's timeline by start_ms and end_ms.
 */

import type { ManifestFile, RecordingManifest } from '../types';

export type RecordingFile = ManifestFile & {
	/** Its number in the manifest (the file's URL). */
	index: number;
};

export type Participant = {
	sessionId: string;
	userId: string;
	camera: RecordingFile | null;
	speaking: boolean;
	teacher: boolean;
};

export function manifestFiles(manifest: RecordingManifest): RecordingFile[] {
	return manifest.files.map((f, index) => ({ ...f, index }));
}

/** Files playing at t, or starting within `lead` ms (mounted early so they
 * are loaded when their turn comes). */
export function filesAt(files: RecordingFile[], t: number, lead = 0): RecordingFile[] {
	return files.filter((f) => f.start_ms - lead <= t && t < f.end_ms);
}

const covers = (f: RecordingFile, t: number) => f.start_ms <= t && t < f.end_ms;

/** The shared screen at t (the latest one started, as the room shows it). */
export function screenAt(files: RecordingFile[], t: number): RecordingFile | null {
	let screen: RecordingFile | null = null;
	for (const f of files) {
		if (f.kind === 'screen' && covers(f, t) && (!screen || f.start_ms > screen.start_ms)) {
			screen = f;
		}
	}
	return screen;
}

/**
 * The screen files to have loaded at t, oldest first: the ones playing and the ones starting
 * within `lead` ms, so a file's first picture is ready when its turn comes.
 */
export function screenLayersAt(files: RecordingFile[], t: number, lead = 0): RecordingFile[] {
	return files
		.filter((f) => f.kind === 'screen' && f.start_ms - lead <= t && t < f.end_ms)
		.sort((a, b) => a.start_ms - b.start_ms || a.index - b.index);
}

/**
 * Which of the loaded screens to show at t: the latest started one that covers t and has a
 * picture, else `held` (the one shown last) if it has, else none. A screen still loading is
 * never shown, so the picture before it stays up instead of a black frame.
 */
export function shownScreen(
	layers: RecordingFile[],
	t: number,
	ready: (index: number) => boolean,
	held: number | null = null
): RecordingFile | null {
	let shown: RecordingFile | null = null;
	for (const f of layers) {
		if (covers(f, t) && ready(f.index)) shown = f;
	}
	if (shown) return shown;
	return layers.find((f) => f.index === held && ready(f.index)) ?? null;
}

/**
 * Everyone seen or heard at t: the teacher first, then people with a
 * camera, then voices, each in order of appearance.
 */
export function participantsAt(
	files: RecordingFile[],
	t: number,
	teacherId: string
): Participant[] {
	const people = new Map<string, Participant & { since: number }>();
	for (const f of files) {
		if (!f.session_id || !covers(f, t)) continue;
		if (f.kind !== 'camera' && f.kind !== 'voice') continue;
		const p = people.get(f.session_id) ?? {
			sessionId: f.session_id,
			userId: f.user_id ?? '',
			camera: null,
			speaking: false,
			teacher: !!teacherId && f.user_id === teacherId,
			since: f.start_ms
		};
		if (f.kind === 'camera') p.camera = f;
		else p.speaking = true;
		p.since = Math.min(p.since, f.start_ms);
		people.set(f.session_id, p);
	}
	const rank = (p: Participant) => (p.teacher ? 0 : p.camera ? 1 : 2);
	return [...people.values()]
		.sort((a, b) => rank(a) - rank(b) || a.since - b.since)
		.map(({ since: _since, ...p }) => p);
}

/** A player position: "4:05", "1:02:09". */
export function clockTime(ms: number): string {
	const total = Math.max(0, Math.floor(ms / 1000));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = String(total % 60).padStart(2, '0');
	return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
