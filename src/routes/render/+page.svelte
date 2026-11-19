<script lang="ts">
	/**
	 * Renders a recorded lesson to a video for the stream worker's headless
	 * browser (docs/calls/STREAM-RECORDING.md). No chrome and nothing to read:
	 * the work, and what it reports to the driver, live in
	 * `replay/export`.
	 */
	import { onMount } from 'svelte';
	import { startRender } from '#lib/replay/export/start.js';

	onMount(() => {
		void startRender(window);
	});
</script>

<svelte:head>
	<title>Render</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main aria-hidden="true"></main>
