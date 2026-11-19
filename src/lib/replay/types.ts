/**
 * What the replay reads of the API, written out here so the folder needs no
 * generated client. Each type is the part of an API type the replay uses;
 * `tests/unit/replay-types.test.ts` fails when the generated type stops fitting.
 */

/** One stream of a recording, placed on its timeline. */
export type ManifestFile = {
	kind: 'voice' | 'camera' | 'screen' | 'screen_audio' | 'board';
	/** The call session the stream came from (not set for the board). */
	session_id?: string;
	/** The person the stream came from, when known. */
	user_id?: string;
	/** Where the file starts on the recording's timeline (ms). */
	start_ms: number;
	/** Where it ends (ms). */
	end_ms: number;
	/** A video's size when it started. */
	width?: number;
	height?: number;
	/** Its position in the bundle of a recording made before files were stored one by one (0 since). */
	offset?: number;
	/** Its size in bytes. */
	size: number;
};

/** A recording's table of contents. Files are numbered by their position in the list. */
export type RecordingManifest = {
	duration_ms: number;
	files: ManifestFile[];
	/** The class's teacher (the board view shows their camera). */
	teacher_id: string;
	/** The recording's class: the pictures of imported deck pages on the board are read through it. */
	class_id?: string;
	/** Where to read the board log straight from storage, when storage is directly reachable. */
	board_url?: string;
};

/** A board element as the server stores and sends it (its `data` is the element's own JSON). */
export type Envelope = {
	id: string;
	version: number;
	version_nonce: number;
	is_deleted: boolean;
	data: Record<string, unknown>;
};
