/**
 * A recorded stream plays from storage at a URL that works for some hours
 * (the API redirects to it). When one runs out mid-session the element
 * errors: loading it again asks the API for a fresh URL, and the stream is
 * put back where it was. At most once per `everyMs`, so a stream that keeps
 * failing stays failed instead of reloading in a loop.
 */
export function mediaReloader(everyMs = 60_000, now = () => Date.now()) {
	let last = -Infinity;
	return (media: Pick<HTMLMediaElement, 'currentTime' | 'load'>): boolean => {
		if (now() - last < everyMs) return false;
		last = now();
		const at = media.currentTime;
		media.load();
		// Before its metadata loads, this is where playback will start.
		media.currentTime = at;
		return true;
	};
}
