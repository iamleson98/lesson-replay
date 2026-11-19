<script lang="ts">
	/**
	 * The lesson's quiz game on the player's stage, as it was at the player's
	 * time: the same screens the teacher saw (the lobby, each question with its
	 * countdown, the reveal, the podium), watching only. A Quest game, which has
	 * no questions on the host's screen, shows its progress board. The player
	 * loads this file only when the viewer opens the Quiz tab, or a game takes
	 * the stage.
	 */
	import type { Component } from 'svelte';
	import { t } from '../i18n/strings.svelte';
	import type { QuizReplay } from '../player/quiz-replay.svelte';
	import RaceReplayStage from './race-replay-stage.svelte';

	let { replay }: { replay: QuizReplay } = $props();

	// Quest has its own state and screen (another chunk), loaded when a recording has one.
	let QuestStage = $state.raw<Component<{ replay: QuizReplay }> | null>(null);
	$effect(() => {
		if (replay.mode !== 'quest' || QuestStage) return;
		void import('./quest-replay-stage.svelte').then((m) => (QuestStage = m.default));
	});
</script>

{#if replay.mode === 'quest'}
	{#if QuestStage}
		<QuestStage {replay} />
	{:else}
		<p class="grid size-full place-items-center text-sm text-white/70" role="status">
			{t('replay.loading')}
		</p>
	{/if}
{:else}
	<RaceReplayStage {replay} />
{/if}
