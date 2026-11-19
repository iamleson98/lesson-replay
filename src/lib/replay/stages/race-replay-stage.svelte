<script lang="ts">
	/**
	 * The race's stage in a recording: the screens the teacher saw (the lobby,
	 * each question with its countdown, the reveal, the podium) at the replay's
	 * time, watching only. The quiz strings must be loaded (`quiz-replay-stage`
	 * and the render both load them first).
	 */
	import { t } from '../i18n/strings.svelte';
	import GameScreens from '../quiz/components/game-screens.svelte';
	import '../quiz/components/quiz-motion.css';
	import type { QuizReplay } from '../player/quiz-replay.svelte';

	let { replay }: { replay: QuizReplay } = $props();
</script>

<div
	data-quiz-stage
	class="bg-background text-foreground relative flex size-full min-h-0 min-w-0 flex-col gap-2 overflow-hidden p-3 pt-11 pb-14 [contain:layout_paint] sm:p-5 sm:pt-12 sm:pb-16 [@media(max-height:620px)]:gap-1.5 [@media(max-height:620px)]:p-2 [@media(max-height:620px)]:pt-10 [@media(max-height:620px)]:pb-12"
>
	{#if replay.game.active}
		<h2
			class="hidden shrink-0 truncate text-sm font-bold sm:text-base [@media(min-height:561px)]:block"
		>
			{replay.game.title}
		</h2>
		<div class="flex min-h-0 min-w-0 flex-1 flex-col">
			<GameScreens room={replay} />
		</div>
	{:else}
		<p class="text-muted-foreground m-auto text-sm" role="status">
			{t('replay.quiz.none')}
		</p>
	{/if}
</div>
