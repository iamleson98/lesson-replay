<script lang="ts">
	/**
	 * The game stage as the render draws it: the player's own race and Quest
	 * screens, mounted out of view and followed frame by frame (see
	 * `quiz-dom.svelte.ts`). Both are imported here, never lazily, and the
	 * strings are loaded before this mounts, so a screen is complete the moment
	 * it is flushed.
	 */
	import QuestReplayStage from '../stages/quest-replay-stage.svelte';
	import RaceReplayStage from '../stages/race-replay-stage.svelte';
	import type { QuizReplay } from '../player/quiz-replay.svelte';

	let { replay }: { replay: QuizReplay } = $props();
</script>

<div data-render-frame class="size-full">
	{#if replay.mode === 'quest'}
		<QuestReplayStage {replay} />
	{:else}
		<RaceReplayStage {replay} />
	{/if}
</div>

<style>
	/* A video has no teacher's controls (skip, the live-results switch) and no player bar: the stage uses its whole height. */
	:global([data-render-frame] button),
	:global([data-render-frame] [role='switch']) {
		visibility: hidden;
	}
	:global([data-render-frame] [data-quiz-stage]) {
		padding-top: 1.25rem;
		padding-bottom: 1.25rem;
	}
	@media (max-height: 620px) {
		:global([data-render-frame] [data-quiz-stage]) {
			padding-top: 0.5rem;
			padding-bottom: 0.5rem;
		}
	}
</style>
